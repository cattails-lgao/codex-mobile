#!/usr/bin/env node
/**
 * 闸门：交接文档脱敏（handover-writing-guide §5.4）
 *
 * 背景：本仓在 Windows / macOS / Linux 与不同机器上运行，交接文档里不能出现
 * **只在这台机器上成立** 的路径骨架。§5.4 原本只有散文规定，结果在 round-157
 * 与 round-158 两轮里各漏了一整类（round-157 只覆盖反斜杠写法，漏了正斜杠；
 * round-158 只覆盖字面清单，漏了「他人用户名」「file:/// 绝对链接」「AppData 布局」）。
 * 所以这里**按类判定**，不按清单。
 *
 * 判定线（有意如此划线，不是遗漏）——
 *   要拦：能标识「这台机器 / 这个用户 / 这份工作副本」的路径。
 *         盘符 + 具体目录（项目副本、codex 隔离 home、pnpm 安装目录、他人家目录）、
 *         `AppData\Local\…` 这种随用户而变的布局、`file:///<盘符>/…` 绝对链接。
 *   不拦（对任何机器都成立的写法）：
 *         · `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe` —— 环境变量锚定 + 产品自定义子路径
 *         · `~/.codex`、`~/.npmrc` —— 家目录相对写法，可移植
 *         · `C:\Windows\system32\cmd.exe` —— 系统路径，逐字程序输出
 *         · `\\?\C:\…` —— 扩展前缀**语法**示例（无具体目录）
 *         · `C:\Users\<用户名>\…` —— 占位符形态（§5.4 禁止的是把它当"脱敏手段"来用）
 *         · 构造出来的示例路径（如 `file:///C:/x.png`，任一机器上都不存在）
 *   于是「例外表」只收最后一类里无法用形式区分的那几条。
 *
 * 退出码：0 无违规（只余已登记例外） / 1 发现违规 / 2 环境不足（找不到交接文档目录）
 *
 * 用法：node scripts/check-handover-desensitization.cjs [--verbose]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const HANDOVER = path.join(REPO, 'codex-mobile-handover');
const VERBOSE = process.argv.includes('--verbose');

if (!fs.existsSync(HANDOVER)) {
  console.error(`环境不足：找不到 ${path.relative(REPO, HANDOVER)}，退出 2`);
  process.exit(2);
}

// —— 违规类别（按类，不按清单）—————————————————————————————
// 盘符类一律加前置否定环视 `(?<![A-Za-z0-9._:+\/-])`，
// 否则 `https://git…` 会被当成「盘符 s:」（`s://git`）、`//d/code` 会被当成 msys 路径。
const NB = '(?<![A-Za-z0-9._:+\\/-])';
const CLASSES = [
  // msys/git-bash 形式：/d/code/... 或 /d/codex-home/... 或 /d/Application/...
  { id: 'msys-盘符路径', re: new RegExp(NB + '\\/[a-z]\\/(?:code|codex-home|codex|Application)(?:[\\/\\\\]|$)', 'g') },
  // 盘符 + code[...]（项目工作副本 / 项目内 tmp）
  { id: '项目工作副本路径', re: new RegExp(NB + '[A-Za-z]:[\\\\/]{1,2}code(?:[\\\\/]|$)', 'gi') },
  // 盘符 + Users + 真实用户名（`<用户名>` 占位符不含字母数字，天然不匹配）
  { id: '真实用户名路径', re: new RegExp(NB + '[A-Za-z]:[\\\\/]{1,2}Users[\\\\/][A-Za-z0-9._-]+', 'gi') },
  // 盘符 + codex 隔离 home
  { id: 'codex 隔离 home', re: new RegExp(NB + '[A-Za-z]:[\\\\/]{1,2}codex-home[A-Za-z0-9._-]*', 'gi') },
  // 盘符 + 包管理器安装目录
  { id: '包管理器安装目录', re: new RegExp(NB + '[A-Za-z]:[\\\\/]{1,2}Application[\\\\/][A-Za-z0-9._-]+', 'gi') },
  // 盘符 + 工具安装目录（Git / 另一个项目 / 另一台机器）
  { id: '工具或他机路径', re: new RegExp(NB + '[A-Za-z]:[\\\\/]{1,2}(?:Git|Program Files|home[\\\\/]lighthouse|workflow-investor)', 'gi') },
  // 随用户而变的 AppData 布局
  { id: 'AppData 布局', re: /AppData[\\/]Local[\\/][A-Za-z0-9._-]+/gi },
  // 绝对 file:/// 链接
  { id: 'file:// 绝对链接', re: /file:\/\/\/[A-Za-z]:[\\/]/gi },
];

// —— 已登记例外（只收「形式上和违规无法区分」的构造示例）——————————
const EXCEPTIONS = [
  {
    file: 'rounds/round-138-fileid-image-resolution-and-input-surfaces.md',
    literal: 'file:///C:/x.png',
    reason: '构造的 URL 形态示例：用于说明 stripFileUrl 的输入输出，任一机器上都不存在该文件',
  },
];

const files = (function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
})(HANDOVER, []).sort();

const violations = [];
const excused = [];

for (const f of files) {
  const rel = path.relative(HANDOVER, f).split(path.sep).join('/');
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const c of CLASSES) {
      c.re.lastIndex = 0;
      let m;
      while ((m = c.re.exec(line)) !== null) {
        const hit = { rel, line: i + 1, cls: c.id, literal: m[0] };
        const exc = EXCEPTIONS.find((e) => e.file === rel && line.includes(e.literal));
        if (exc) excused.push({ ...hit, reason: exc.reason });
        else violations.push(hit);
      }
    }
  });
}

console.log(`交接文档：${files.length} 个 .md`);
console.log(`违规类别：${CLASSES.length} 类`);
console.log(`已登记例外：${EXCEPTIONS.length} 条`);

if (VERBOSE || violations.length) {
  console.log('\n=== 命中（去重后）===');
  const seen = new Set();
  for (const v of [...violations, ...excused]) {
    const k = `${v.rel}:${v.line}:${v.literal}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const tag = excused.includes(v) ? '例外' : '违规';
    console.log(`  [${tag}] ${v.rel}:${v.line}  <${v.cls}>  ${v.literal}`);
    if (v.reason) console.log(`        理由：${v.reason}`);
  }
}

console.log(`\n结论：违规 ${violations.length} 处 ｜ 例外 ${excused.length} 处`);
if (violations.length) {
  console.error('§5.4 未满足：请把上述路径改成语义占位（<项目目录> / <用户主目录> / <pnpm 全局 bin 目录> 等）');
  process.exit(1);
}
console.log('§5.4 满足：交接文档中不含可标识本机/本用户的路径骨架');
process.exit(0);
