# round-114 — Directory 技能路径去硬编码 + 两处 config 噪音

日期：2026-09-30。由头：用户问「还能做什么呢」→ 列候选（发版 / 两处小缺陷 / 新功能 / 测试基线抖动治理 / 安全项）→ 用户选**「清掉两处小缺陷」**。

**结论先行：** 两处都清掉了，且都是**正确性/卫生**修复，不涉及运行行为改变（理由见 §一「诚实边界」）。① `DirectoryHub.vue` 里写死的 `/Users/igor/.codex/skills/shared_skills/composio-cli/SKILL.md`（2026-04-26 由原作者引入，从未被设计过）删除，改为只传技能名、由 App 从 app-server 的已安装技能列表解析真实路径；② 项目沙箱与用户全局的 `config.toml` 各删掉一行已被 CLI 0.158 忽略的 `disable_response_storage = true`。

## 一、写死的技能绝对路径

### 它是什么

`DirectoryHub.vue` 的 `tryComposio()` 在点「试用」时往 `try-item` 事件里塞：

```ts
attachedSkills: [{ name: 'composio-cli', path: COMPOSIO_SKILL_PATH }]
```

而常量是：

```ts
const COMPOSIO_SKILL_PATH = '/Users/igor/.codex/skills/shared_skills/composio-cli/SKILL.md'
```

`git blame` 显示这行由原作者于 **2026-04-26**（`c7d906bc`「Codex worktree snapshot: archive-cleanup」）引入，**从未被设计过**——它就是作者自己机器上的路径，在任何别人的机器上都不存在。

### 它流到哪里

`tryComposio()` → `emit('try-item')` → `App.vue` 的 `onTryDirectoryItem` → `sendMessageToNewThread(text, cwd, [], skills, [])` → `src/api/gateway/threads.ts` 的 `buildTurnInputParts` → `input.push({ type: 'skill', name, path })` → `turn/start`。

协议里 skill 输入项的 path 是**必填**：

```ts
// documentation/app-server-schemas/typescript/v2/UserInput.ts
| { "type": "skill", name: string, path: string, }
```

所以当初只能硬给一个值——但值的来源不该是猜测。

### 正规范式就在隔壁

`SkillsHub.vue` 的 `handleTrySkill()` 给的是 `skillPath: skill.path`，而那份数据来自 `installedSkills`（`skills/list` → `misc.ts` 的 `getSkillsList`，`SkillInfo.path` 是归一化后的真实路径），并且带守卫 `if (!skill.installed || skill.enabled === false) return`。

**composio 是全仓唯一一处硬编码技能路径的地方。**

### 改法

| 文件 | 改动 |
|---|---|
| `DirectoryHub.vue` | 删常量；payload 只声明意图 `attachedSkills: [{ name: 'composio-cli' }]`；类型 `path` 变可选 |
| `App.vue` | `installedSkills` 本来就拿在手上（`useDesktopCatalogs` 的 ref），新增调用 `resolveTryItemSkills(requestedSkills, installedSkills.value)` 解析真实路径；删掉上一版直接写在 App.vue 里的两个本地函数 |
| `directoryHubUtils.ts` | 新增 `resolveTryItemSkills` / `findInstalledSkillPath` 与三个类型——放这里因为它是**纯函数模块且已有测试文件** |
| `directoryHubUtils.test.ts` | 新增 4 例 |

两条语义：
1. **显式 path 优先**（调用方给了就用），否则按名字查已安装技能列表；
2. **查不到就丢掉这一项**——技能没装时不再发一个不存在的路径。

技能名可能带插件前缀（例如 `browser-use:browser`，`normalizers/v2.test.ts` 里有真实形状），所以除全名相等外，再按**最后一段**匹配一次。

### 诚实边界（这次**没有**做的验证）

**没有做端到端实测**——点真正的 Composio 试用按钮会真开一个线程、消耗模型额度。所以分两部分说清：

- **确定的部分**：改动前那个 path 在任何非作者机器上都不存在；改动后发出的是 app-server 自己报出来的真实路径，或者干脆不发。
- **不确定的部分**：**app-server 是否真的按这个 path 去解析/加载技能，未实测**。从 `normalizers/v2.test.ts` 看，skill 项被归一化成 user 消息上的 `skills: [{ name, path }]`（用于消息展示）；技能的实际加载走 app-server 自己的 skills 扫描与 `skills/list`。因此本轮修复的**主要是记录与展示的正确性**，不宣称修掉了某个运行故障。

## 二、两处 config 噪音

CLI 0.158 起 `disable_response_storage` 已被忽略（round-101 实测记录：每次启动多一条 `configWarning`，另有一条 warning 通知在 resume 前）。两处都删了：

- `D:/code/codex-mobile/.codex/config.toml` 第 5 行（项目沙箱，该目录 gitignored）
- `C:/Users/19155/.codex/config.toml` 第 4 行（用户全局）

**改前先备份**（`tmp/` 被 gitignore，不入库）：

- `tmp/config-backup-round114-project.toml`
- `tmp/config-backup-round114-home.toml`

脚本断言目标键**恰好出现 1 次**才写盘，并保留原文件的换行风格；删除后两个文件的其余内容逐字未动（已复核）。

## 三、验证

1. **类型**：`vue-tsc --noEmit` → `EXIT=0`。
2. **定向单测**：`directoryHubUtils.test.ts` **6/6**（原有 2 + 新增 4：只有名字的请求从已安装列表补齐、显式 path 优先且未知技能不凭空造、插件前缀按末段匹配、空名字/空 path 一律丢弃）。
3. **全量**：**706 例 / 703 通过 / 3 失败**（706 = round-113 的 702 + 本轮 4）。3 失败 = `codexAppServerBridge.archive.test.ts` 的 **2 例恒定 Windows 平台差异**（`expect(info.mode & 0o777).toBe(0o600)` 得 `0o438`）+ `inlinePayload` 的 **1 例并发抖动** → **零回归**。
4. **未做**：真机 / 浏览器端到端（见 §一「诚实边界」）；config 改动的效果需 app-server **冷启动**才可见（下次启动自然生效，本轮不需要专门重启）。

## 四、环境记录（值得留下）

- **App.vue 是 CRLF，DirectoryHub.vue 是 LF**：同一个多行锚点在两个文件上行为不同——锚点里写死的 `\n` 必须先按目标文件的**实际行尾**归一化，否则在 CRLF 文件上恒不匹配。本轮脚本第一版正是栽在这里（App.vue 多行锚点 0 命中）。
- **锚点脚本「全部先校验、再统一写盘」的顺序有价值**：任一处不匹配就整体中止，磁盘上不会留下半成品（本轮实测有效——第一次失败时两个文件都未被写）。
- 用 `fs.writeFileSync` 追加代码块时要显式处理：① 前导空行数量（`base` 已带行尾时再补一个会多出空行）；② **文件末尾换行**（`body` 不以换行结尾会给文件留下 `\ No newline at end of file`）。

## 五、涉及文件

- 改：`src/components/content/DirectoryHub.vue`（删常量 + payload 只传 name + 类型 `path` 可选）
- 改：`src/App.vue`（加 import、改调 `resolveTryItemSkills`）
- 改：`src/components/content/directoryHubUtils.ts`（+`resolveTryItemSkills` / `findInstalledSkillPath` + 三个类型）
- 改：`src/components/content/directoryHubUtils.test.ts`（+4 例）
- 改（不在仓库内，已备份）：`.codex/config.toml`、`C:/Users/19155/.codex/config.toml`
- 脚本（未入库，供复跑/审计）：`tmp/fix-hardcoded-skill-path.cjs`、`tmp/refactor-try-skill-utils.cjs`、`tmp/fix-utils-eol.cjs`、`tmp/cleanup-config-noise.cjs`

## 六、遗留

- 无新增待办。
- **仍然只有用户能做**：`3cecaa6` 的 `.env` 含真实 GitHub OAuth 密钥且仍在祖先链里 → 需去 GitHub 轮换凭据（删文件无用，历史还在）。
