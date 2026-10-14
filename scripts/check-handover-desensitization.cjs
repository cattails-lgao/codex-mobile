#!/usr/bin/env node
/**
 * 闸门：文档脱敏（handover-writing-guide §5.4）
 *
 * 背景：本仓在 Windows / macOS / Linux 与不同机器上运行，文档里不能出现
 * **只在这台机器上成立** 的路径骨架。§5.4 原本只有散文规定，结果在 round-157
 * 与 round-158 两轮里各漏了一整类（round-157 只覆盖反斜杠写法，漏了正斜杠；
 * round-158 只覆盖字面清单，漏了「他人用户名」「file:/// 绝对链接」「AppData 布局」）。
 * 所以这里**按类判定**，不按清单。
 *
 * 扫描范围（round-159 扩根）——
 *   **全仓 git 跟踪的 `*.md` / `*.markdown`**（原先只扫 `codex-mobile-handover/`）。
 *   只看文档、**不看源码**，理由是实测过：`scripts/*.cjs` 里有 18 处、`src/**\/*.test.ts` 里有 7 处
 *   字面路径，但它们是**当默认值 / 测试夹具用**（如夹具里的 `C:/Users/Nulled/...` 是编造的用户名），
 *   不是"文档脱敏"要管的对象；把它们拖进来会把闸门变成噪音源。
 *   （源码里的硬编码本机路径是**另一个**问题——见 round-159 的诚实边界。）
 *
 * 判定线（有意如此划线，不是遗漏）——
 *   要拦：能标识「这台机器 / 这个用户 / 这份工作副本」的路径。
 *         盘符 + 具体目录（项目副本、codex 隔离 home、pnpm 安装目录、他人家目录）、
 *         `AppData\Local\…` 这种随用户而变的布局、`file:///<盘符>/…` 绝对链接、
 *         `C:\Users\<用户名>\…` 骨架（§5.4 明文点名：脱敏成占位符**也不算**合规，因为盘符与
 *         `Users` 布局本身就是机器相关的，换到 macOS/Linux 必然不同）。
 *         POSIX 家目录（macOS `/Users/<用户名>`、Linux `/home/<用户名>`）—— round-160 补：
 *         盘符类管不到它们，而 macOS 的 `/Users/<用户名>` 同样标识这台机器。
 *         私网 / Tailscale 主机地址（`10.x`、`172.16-31.x`、`192.168.x`、`100.64-127.x`）—— round-161 补：
 *         主机地址换机后必然不同，与路径骨架同理（AGENTS.md 曾写死一台 A1 机的 tailnet 地址）。
 *   不拦（对任何机器都成立的写法）：
 *         · `%LOCALAPPDATA%\OpenAI\Codex\bin\<hash>\codex.exe` —— 环境变量锚定 + 产品自定义子路径
 *         · `~/.codex`、`~/.npmrc` —— 家目录相对写法，可移植
 *         · `C:\Windows\system32\cmd.exe` —— 系统路径，逐字程序输出
 *         · `\\?\C:\…` —— 扩展前缀**语法**示例（无具体目录）
 *         · 构造出来的示例路径（如 `file:///C:/x.png`，任一机器上都不存在）
 *         · `127.0.0.1` / `localhost` / `0.0.0.0` —— 对任何机器都成立的写法
 *           （§5.4 自己的代理示例就用 `127.0.0.1:10808`，所以这一类必须放行）
 *         · CIDR 网段声明（`100.64.0.0/10`、`fd7a:115c:a1e0::/48`）—— Tailscale 的**保留网段**
 *           说明，不是某一台主机的地址
 *   于是「例外表」只收最后一类里无法用形式区分的那几条，外加**规范条文自身举的禁止形态**。
 *
 * 退出码：0 无违规（只余已登记例外） / 1 发现违规 / 2 环境不足（取不到 git 跟踪文件表）
 *
 * 用法：node scripts/check-handover-desensitization.cjs [--verbose]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.join(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

let tracked;
try {
  // **`-co --exclude-standard` = 已跟踪 + 未跟踪但未被忽略**。
  // 只取 `-c`（已跟踪）会漏掉「刚写完、还没 git add」的新文档 —— round-159 实测踩到：
  // 新写的 round-159 文档带着被禁骨架却判 0 违规，因为那时它还是 untracked。
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
  // 盘符 + Users + 占位符骨架（§5.4 明文点名禁止）
  { id: '盘符家目录骨架', re: new RegExp(NB + '[A-Za-z]:[\\\\/]{1,2}Users[\\\\/]<', 'gi') },
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
  // POSIX 家目录（macOS `/Users/<user>`、Linux `/home/<user>`）—— 盘符类管不到，round-160 补
  { id: 'POSIX 家目录-真实用户名', re: new RegExp(NB + '\\/(?:Users|home)\\/[A-Za-z0-9._-]+', 'g') },
  // POSIX 家目录占位符骨架
  { id: 'POSIX 家目录骨架', re: new RegExp(NB + '\\/(?:Users|home)\\/<', 'g') },
  // 私网 / Tailscale 主机地址（IPv4）—— round-161 补。
  // 依据 §5.4 的判定线「能否标识本机 / 本用户 / 这份工作副本」：主机地址换机后必然不同。
  // **排除**：loopback `127.0.0.1`（通用写法，§5.4 自身的代理示例就在用）、`0.0.0.0`（bind-all）、
  // 以及 CIDR 网段声明 —— `100.64.0.0/10` 是 Tailscale 的**保留网段**说明，不是某台主机，
  // 故用 `(?!\/\d)` 排掉「紧跟 /掩码长度」的写法（否则 5 处 Tailscale 网段说明会全变误报）。
  // 前置环视**不能**复用 NB：NB 把 `/` 与 `:` 也算前驱，那样 `http://100.…` 反而测不到。
  { id: '私网/Tailscale 主机地址', re: new RegExp('(?<![\\w.-])(?:100\\.(?:6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])|10|172\\.(?:1[6-9]|2\\d|3[01])|192\\.168)\\.\\d{1,3}\\.\\d{1,3}(?!\\d)(?!\\/\\d)', 'g') },
];

// —— 已登记例外（只收「形式上和违规无法区分」的）—————————————
const SKELETON_IN_RULE = '规范条文自身举的就是这个被禁止的形态';
// 用前缀而非完整字面量：各处省略号写法不一（`...` / `…`），按前缀匹配才不会漏。
const SKELETON_PREFIX = 'C:\\Users\\<用户名>\\';
const EXCEPTIONS = [
  {
    file: 'codex-mobile-handover/rounds/round-138-fileid-image-resolution-and-input-surfaces.md',
    literal: 'file:///C:/x.png',
    reason: '构造的 URL 形态示例：用于说明 stripFileUrl 的输入输出，任一机器上都不存在该文件',
  },
  { file: 'codex-mobile-handover/handover-writing-guide.md', literal: SKELETON_PREFIX, reason: SKELETON_IN_RULE },
  { file: 'handover-writing-guide.generic.md', literal: SKELETON_PREFIX, reason: SKELETON_IN_RULE + '（通用副本）' },
  { file: 'codex-mobile-handover/codex-mobile-handover.md', literal: SKELETON_PREFIX, reason: SKELETON_IN_RULE + '（总入口对 §5.4 的复述）' },
  {
    file: 'codex-mobile-handover/rounds/round-158-doc-links-desensitization-and-rpc-verification.md',
    literal: SKELETON_PREFIX,
    reason: SKELETON_IN_RULE + '（round-158 解释该规则时引用）',
  },
  {
    file: 'tests/chat-composer-rendering/markdown-link-with-backticked-label-renders-as-file-link.md',
    literal: '/Users/example',
    reason: '构造的测试夹具路径（用户名 example 是保留示例名，非真实用户）：用于验证 markdown 链接渲染，任一机器上都不存在该文件',
  },
];

const files = tracked
  .map((rel) => path.join(REPO, rel))
  .filter((abs) => fs.existsSync(abs))
  .sort();

const violations = [];
const excused = [];

for (const f of files) {
  const rel = path.relative(REPO, f).split(path.sep).join('/');
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

console.log(`扫描范围：全仓 git 跟踪的 md —— ${files.length} 个文件`);
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
console.log('§5.4 满足：全仓 md 中不含可标识本机/本用户的路径骨架');
process.exit(0);
