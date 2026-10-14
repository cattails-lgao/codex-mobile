#!/usr/bin/env node
/**
 * 闸门：仓库内文档的相对链接可解析（round-159 新增）
 *
 * 背景：round-158 处理 `documentation/APP_SERVER_DOCUMENTATION.md` 的失效链接时，
 * 只测了那一个文件；本仓其它文档从未做过全量链接体检。实测本轮一次性查出
 * 一批**层级写错**的相对链接（`sections/x.md` 里写 `rounds/y.md`，少一级 `../`；
 * `rounds/*.md` 里写 `src/...`，少两级 `../../`），它们在任何编辑器里都点不开。
 *
 * **必须先剥掉代码再扫**：这是本闸门唯一的技术要点。第一版没剥，于是
 * `` `![](video.mp4)` ``、`` `[Label](path)` ``、`text-[0.68rem](10.88px)` 这类
 * **行内代码里的排版说明 / 示例语法**全被当成链接 ⇒ 71 条"失效"里大半是误报。
 *
 * 不检查的目标（有意，不是遗漏）：
 *   · 任何带 URI scheme 的（`https:` / `mailto:` / `codex://` / `file:` …）—— 不是仓内路径
 *   · 含 `<`、`>` 或 `...` 的 —— 占位符 / 省略写法（如 `codex://threads/<id>`、`path/to/x.webm`）
 *   · 以 `/` 开头的 —— 站点绝对路径（上游文档里常见），不是本仓相对路径
 *   · 纯锚点 `#...`
 *
 * 退出码：0 无失效 / 1 有失效 / 2 环境不足（取不到 git 跟踪文件表）
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

const LINK_RE = /!?\[[^\]]*\]\(([^)\s]*)(?:\s+"[^"]*")?\)/g;

function isCheckable(target) {
  if (!target) return false;
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(target)) return false // 带 scheme
  if (target.startsWith('#')) return false
  if (target.startsWith('/')) return false // 站点绝对路径
  if (/[<>]|\.\.\./.test(target)) return false // 占位符 / 省略写法
  return true
}

const files = tracked.map((rel) => path.join(REPO, rel)).filter((abs) => fs.existsSync(abs)).sort();

const broken = [];
const checked = [];

for (const abs of files) {
  const rel = path.relative(REPO, abs).split(path.sep).join('/');
  const stripped = stripCode(fs.readFileSync(abs, 'utf8'));
  const dir = path.dirname(abs);
  const lines = stripped.split(/\r?\n/);
  lines.forEach((line, i) => {
    LINK_RE.lastIndex = 0;
    let m;
    while ((m = LINK_RE.exec(line)) !== null) {
      const target = m[1];
      if (!isCheckable(target)) continue;
      const hashless = target.split('#')[0];
      if (!hashless) continue;
      checked.push({ rel, target });
      const resolved = path.resolve(dir, decodeURIComponent(hashless));
      if (fs.existsSync(resolved)) continue;
      broken.push({ rel, line: i + 1, target });
    }
  });
}

console.log(`扫描范围：全仓 git 跟踪的 md —— ${files.length} 个文件，可校验相对链接 ${checked.length} 条`);
console.log(`（已剥离围栏代码与行内代码；带 scheme / 占位符 / 站点绝对路径的目标不校验）`);

if (VERBOSE || broken.length) {
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
}

console.log(`\n结论：失效 ${broken.length} 条 ｜ 涉及 ${new Set(broken.map((b) => b.rel)).size} 个文件`);
if (broken.length) {
  console.error('请把失效链接改成正确的相对层级（或降级为行内代码，若目标确实不存在）');
  process.exit(1);
}
console.log('全部可解析');
process.exit(0);
