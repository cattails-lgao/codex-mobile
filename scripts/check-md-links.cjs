#!/usr/bin/env node
/**
 * 闸门：仓库内文档的相对链接可解析 + 锚点可命中（round-159 新增，round-160 加锚点）
 *
 * 背景：round-158 处理 `documentation/APP_SERVER_DOCUMENTATION.md` 的失效链接时，
 * 只测了那一个文件；本仓其它文档从未做过全量链接体检。实测 round-159 一次性查出
 * 一批**层级写错**的相对链接（`sections/x.md` 里写 `rounds/y.md`，少一级 `../`；
 * `rounds/*.md` 里写 `src/...`，少两级 `../../`），它们在任何编辑器里都点不开。
 *
 * **必须先剥掉代码再扫**：这是本闸门唯一的技术要点。第一版没剥，于是
 * `` `![](video.mp4)` ``、`` `[Label](path)` ``、`text-[0.68rem](10.88px)` 这类
 * **行内代码里的排版说明 / 示例语法**全被当成链接 ⇒ 71 条"失效"里大半是误报。
 *
 * **锚点校验（round-160 加）**：`x.md#frag` 若 `x.md` 存在但 `#frag` 命不中任何标题，
 * 点击后什么都不会发生 —— 这类"静默坏链"同样算失效。三个**有意不判**的口子：
 *   · `#L600` / `#L2829-L2845` —— GitHub 给**代码文件**生成的行号锚点，不是标题，
 *     本就不该拿标题去比（实测 round-160 侦察：8 条跨文件锚点里 7 条是这种）。
 *   · 目标**非 md**（`.ts`/`.png` …）—— 它们的锚点不是标题锚点。
 *   · 目标 md 的标题 slug 用**近似 github-slugger** 的算法（去 HTML、小写、去标点、
 *     空格转连字符、保留 Unicode 字母数字），个别异体字标题可能与 GitHub 实际值有偏差。
 *
 * 不检查的目标（有意，不是遗漏）：
 *   · 任何带 URI scheme 的（`https:` / `mailto:` / `codex://` / `file:` …）—— 不是仓内路径
 *   · 含 `<`、`>` 或 `...` 的 —— 占位符 / 省略写法（如 `codex://threads/<id>`、`path/to/x.webm`）
 *   · 以 `/` 开头的 —— 站点绝对路径（上游文档里常见），不是本仓相对路径
 *
 * 退出码：0 无失效 / 1 有失效（含失效锚点） / 2 环境不足（取不到 git 跟踪文件表）
 *
 * 用法：node scripts/check-md-links.cjs [--verbose]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

let tracked;
try {
  // 已跟踪 + 未跟踪但未被忽略：只取 `-c` 会漏掉「刚写完、还没 git add」的新文档。
  tracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', '*.md', '*.markdown'], { cwd: REPO, maxBuffer: 1 << 28 })
    .toString('utf8')
    .split(/\r?\n/)
    .filter(Boolean);
} catch (e) {
  console.error(`环境不足：取不到文件清单（${e.message}），退出 2`);
  process.exit(2);
}
if (!tracked.length) {
  console.error('环境不足：git 跟踪的 md 为空，退出 2');
  process.exit(2);
}

/** 剥掉围栏代码与行内代码，避免把示例语法当成链接。 */
function stripCode(text) {
  return text
    .replace(/^```[\s\S]*?^```/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^~~~[\s\S]*?^~~~/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
}

/** 近似 github-slugger：去 HTML、小写、去标点（保留 Unicode 字母/数字/下划线/连字符）、空格转连字符。 */
function slugify(s) {
  return s.trim().toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

const safeDecode = (s) => { try { return decodeURIComponent(s); } catch { return s; } };

const LINK_RE = /!?\[[^\]]*\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g;
const LINE_ANCHOR_RE = /^l\d+(-l\d+)?$/i; // GitHub 行号锚点（#L600 / #L2829-L2845）

function isCheckablePath(p) {
  if (!p) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(p)) return false; // 带 scheme
  if (p.startsWith('/')) return false; // 站点绝对路径
  if (/[<>]|\.\.\./.test(p)) return false; // 占位符 / 省略写法
  return true;
}

const files = tracked.map((rel) => path.join(REPO, rel)).filter((abs) => fs.existsSync(abs)).sort();
const relOf = (abs) => path.relative(REPO, abs).split(path.sep).join('/');

/** 只剥围栏块、**保留行内代码的文本** —— 标题里的 `` `code` `` 在 GitHub 的 slug 里是保留文本的。 */
function stripFences(text) {
  return text
    .replace(/^```[\s\S]*?^```/gm, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^~~~[\s\S]*?^~~~/gm, (m) => m.replace(/[^\n]/g, ' '));
}

/** 标题索引：rel -> Set(slug)。剥围栏块（免得把围栏里的 `#` 当标题），标题内行内代码只去反引号、保留文本。 */
const headings = new Map();
for (const abs of files) {
  const set = new Set();
  for (const line of stripFences(fs.readFileSync(abs, 'utf8')).split(/\r?\n/)) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) set.add(slugify(m[2].replace(/`/g, '')));
  }
  headings.set(relOf(abs), set);
}

const broken = []; // 目标文件不存在
const brokenAnchors = []; // 目标存在但锚点命不中
let checked = 0;
let anchorsChecked = 0;

for (const abs of files) {
  const rel = relOf(abs);
  const dir = path.dirname(abs);
  const lines = stripCode(fs.readFileSync(abs, 'utf8')).split(/\r?\n/);
  lines.forEach((line, i) => {
    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(line)) !== null) {
      const target = m[1];
      const hashIdx = target.indexOf('#');
      const rawPath = hashIdx < 0 ? target : target.slice(0, hashIdx);
      const frag = hashIdx < 0 ? '' : safeDecode(target.slice(hashIdx + 1));

      // 纯锚点（同文件）
      if (!rawPath) {
        if (!frag || LINE_ANCHOR_RE.test(frag)) continue;
        anchorsChecked++;
        if (!headings.get(rel)?.has(frag.toLowerCase())) {
          brokenAnchors.push({ rel, line: i + 1, target, why: '同文件锚点没有对应标题' });
        }
        continue;
      }

      if (!isCheckablePath(rawPath)) continue;
      checked++;
      const resolved = path.resolve(dir, safeDecode(rawPath));
      if (!fs.existsSync(resolved)) {
        broken.push({ rel, line: i + 1, target });
        continue;
      }

      // 目标存在 ⇒ 仅当目标是 md 且有真锚点时才比标题（非 md 的 #L<n> 行号锚点跳过）
      if (!frag || LINE_ANCHOR_RE.test(frag)) continue;
      if (!/\.(md|markdown)$/i.test(rawPath)) continue;
      anchorsChecked++;
      const tRel = relOf(resolved);
      if (!headings.get(tRel)?.has(frag.toLowerCase())) {
        brokenAnchors.push({ rel, line: i + 1, target, why: `${tRel} 里没有 slug = "${frag.toLowerCase()}" 的标题` });
      }
    }
  });
}

console.log(`扫描范围：全仓 git 跟踪的 md —— ${files.length} 个文件，可校验相对链接 ${checked} 条，锚点 ${anchorsChecked} 条`);
console.log('（已剥离围栏代码与行内代码；带 scheme / 占位符 / 站点绝对路径的目标不校验；#L<n> 行号锚点不校验）');

if (VERBOSE || broken.length || brokenAnchors.length) {
  console.log('\n=== 失效相对链接 ===');
  const byFile = new Map();
  for (const b of broken) {
    if (!byFile.has(b.rel)) byFile.set(b.rel, []);
    byFile.get(b.rel).push(b);
  }
  for (const [rel, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${rel}  (${list.length})`);
    for (const b of list) console.log(`      L${b.line}  ${b.target}`);
  }
  if (brokenAnchors.length) {
    console.log('\n=== 失效锚点 ===');
    for (const b of brokenAnchors) console.log(`  ${b.rel}:${b.line}  ${b.target}\n      理由：${b.why}`);
  }
}

const touched = new Set([...broken, ...brokenAnchors].map((b) => b.rel)).size;
console.log(`\n结论：失效链接 ${broken.length} 条 ｜ 失效锚点 ${brokenAnchors.length} 条 ｜ 涉及 ${touched} 个文件`);
if (broken.length || brokenAnchors.length) {
  console.error('请把失效链接改成正确的相对层级（或降级为行内代码，若目标确实不存在）；失效锚点请对齐目标文档的真实标题');
  process.exit(1);
}
console.log('全部可解析');
process.exit(0);
