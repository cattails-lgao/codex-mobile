# round-115 — 测试基线抖动治理：从「恒定 2 例失败」到零失败基线

日期：2026-09-30。由头：用户问「还能做什么呢」→ 列候选（发版 / 新功能 / 测试基线抖动治理 / 安全项）→ 用户选**「治理测试基线抖动」**。

**结论先行：** 基线从「恒定 2 例失败 + 每轮 0~4 例随机漂移」修成**零失败**（全量 **706/706**，连跑 6 次全绿）。三类症状查到底后**全部是测试与环境的口径问题，产品代码一行未改**：①Windows 上 `fs.symlink` 默认 `type='file'` 指向目录时造不出可被 `realpath` 解析的条目；②Windows 不实现 POSIX 权限位，`stat().mode` 恒为 `0o666`；③默认 `testTimeout: 5000` 对一批 fs 密集测试在 73 文件并发下太紧，把「慢」报成「失败」。改动仅 2 个测试断言 + 2 行配置。

## 一、基线原来是什么样

round-107 起文档一直写着「**Windows 基线：全量 N 例，恒定失败 2 例**（`codexAppServerBridge.archive.test.ts` 平台差异）」，其余为并发抖动。本轮起点的一次全量是 **706 例 / 4 失败**：

| # | 测试 | 形态 |
|---|---|---|
| 1 | `archive.test.ts > writeWorkspaceRootsState > persists workspace roots in canonical form` | **`Test timed out in 5000ms`** |
| 2 | `archive.test.ts > ensureDefaultFreeModeStateForMissingAuthSync > creates CODEX_HOME before writing free-mode state` | `expected 438 to be 384`（`info.mode & 0o777`） |
| 3 | `inlinePayload.test.ts > revertTurnFileChanges single-file scope > reverts only the requested file when filePaths is set` | **`Test timed out in 5000ms`** |
| 4 | `sessionLogRecovery.test.ts > mergeSessionCommandsIntoTurnsFromPath > applies the recovery to a retired-shape log` | **`Test timed out in 5000ms`** |

**同一个测试会呈现两种形态**：#1 隔离跑是 **2501ms 断言失败**（3 个元素 vs 2 个），并发跑是 **>5000ms 超时**。round-114 当时把「其一其实是超时」写进文档时只看到并发那一面，其实两面都对——**同一根因：这条测试在这台机器上本来就要跑 2.5s 以上，并发时超过 5s**。

## 二、三个根因

### 根因 1｜Windows 上 `symlink` 的默认 type 造不出可解析的链接

`archive.test.ts:208` 原本是 `await symlink(canonicalRoot, symlinkRoot)`，用来验证「symlink 形式的根目录会被 `realpath` 规范化后与真实路径合并」。实测三种 type：

| `type` 实参 | 创建 | `lstat().isSymbolicLink()` | `realpath(link)` 是否解析到 target |
|---|---|---|---|
| 未传（Node 默认 `'file'`） | ok | **false** | **否**（返回条目自身路径） |
| `'dir'` | ok | **false** | **否** |
| **`'junction'`** | ok | **true** | **是** ✅ |

也就是说：这个「symlink」在本机根本没被解析，于是 `realpath(symlinkRoot)` 拿到的是 `symlinkRoot` 自己，两点没有合并 → `order` 剩下 3 个元素而不是 2 个。

**这是测试对平台的假设，不是产品 bug**——`canonicalizeWorkspaceRootPath` 在 `realpath` 失败时保守返回原值（`workspaceRoots.ts:58-62`）是合理设计。

探针：`tmp/probe-symlink-realpath.cjs`。

### 根因 2｜Windows 不实现 POSIX 权限位

`archive.test.ts:415` 断言 `info.mode & 0o777 === 0o600`，而被测代码是 `writeFile(statePath, json, { encoding: 'utf8', mode: 0o600 })`（`codexAuthState.ts:326`）。Windows 上 Node 的 `chmod` 只能切换只读位，`stat().mode` 恒为 `0o666`（= 十进制 438），**实现本身没问题，是断言无法在 Windows 上成立**。

### 根因 3｜默认 5000ms 对并发下的 fs 密集测试太紧

三个超时测试的共同形状完全一致：**`mkdtemp` → 写文件 → 业务 fs 逻辑 → `rm -r`**，且都落在 `os.tmpdir()`。全量要并发 73 个测试文件（vitest 默认按 CPU 核数起 worker），`transform 82.5s / import 168.5s / tests 106.1s` 的累计量说明磁盘与 CPU 被抢得很凶；Windows 的 `realpath`（`GetFinalPathNameByHandle`）与 `rm -r` 本来就比 POSIX 慢一个量级。

## 三、诊断方法（两步，可复用）

**第一步：隔离 vs 并发对比。** 单跑 `archive.test.ts` 得 `2 failed | 30 passed`，全量跑得 `3 个超时`。**同一测试在两个上下文里的耗时差一倍以上 → 归因「资源竞争」而不是「代码回归」**。

**第二步：判定实验——放宽 timeout 看超时是否消失。**

```
vitest.mjs run --testTimeout=30000
```

结果：**706 例 / 2 失败**。**三例超时全部消失**，只剩根因 1、2 那两例真实断言失败。

这一步是关键分岔：如果放宽后仍然超时，说明是**卡死/死锁**（要深挖代码）；超时消失则确认是**慢**（改预算即可）。本轮属于后者。

## 四、改动

| 文件 | 改动 |
|---|---|
| `src/server/codexAppServerBridge.archive.test.ts:208` | `symlink(canonicalRoot, symlinkRoot)` → `symlink(canonicalRoot, symlinkRoot, 'junction')`，附注释说明实测差异 |
| `src/server/codexAppServerBridge.archive.test.ts:415` | `expect(info.mode & 0o777).toBe(0o600)` → `const expectedMode = process.platform === 'win32' ? 0o666 : 0o600` 后断言 `expectedMode` |
| `vitest.config.ts` | 新增 `testTimeout: 15000` + `hookTimeout: 15000`，附注释写明依据 |

关于 `'junction'` 的跨平台安全性：Node 文档明确该 `type` 参数 **仅 Windows 有效、其它平台被忽略**，所以在 macOS/Linux 上退化成与原来完全相同的普通 symlink；Windows 上 junction 无需 `SeCreateSymbolicLinkPrivilege`，且是三种 type 里唯一能被 `realpath` 解析的。

关于 mode 断言：非 Windows 走 `0o600`（与改动前逐字一致），Windows 上仍保留一条**有意义的**断言（`0o666`，即「文件是普通可写文件」），而不是静默跳过整个测试。

## 五、验证

1. **类型**：`vue-tsc --noEmit` → `EXIT=0`。
2. **定向**：`codexAppServerBridge.archive.test.ts` 隔离跑 **32/32 通过**（改动前 `2 failed | 30 passed`）。
3. **全量 ×6**：**706/706 全绿**，连跑 6 次失败集合恒为空。

| 跑次 | 结果 |
|---|---|
| 改动前 | `4 failed | 702 passed` |
| `--testTimeout=30000`（诊断） | `2 failed | 704 passed` |
| 改动后 #1 / #2 / #3 | **`706 passed | 73 files passed`** |
| 改动后 #4 / #5 / #6 | **`706 passed | 73 files passed`** |

## 六、未做与诚实边界

- **未做 Linux 侧实测**。WSL 在本机被安全策略**硬拦截**（`wsl.exe` 在 Program Blacklist 里，提示明确要求不得重试或绕过）。因此跨平台安全性以上述 **Node 的明确语义保证**为依据（`type` 参数在非 Windows 被忽略；`process.platform` 分支在非 Windows 走原路径），而不是实测。这比以往的「真机 + WSL 双向」弱一档，如实记录。
- **未改动任何产品代码**。三个根因全部落在测试断言与测试预算上；`workspaceRoots.ts`、`codexAuthState.ts` 的行为一行未动。
- `testTimeout: 15000` 是**预算放宽**，不是「让问题消失」。若将来某个测试真的在 15s 量级才完成，应视为性能回归去查。

## 七、涉及文件

- 改：`src/server/codexAppServerBridge.archive.test.ts`（2 处断言）
- 改：`vitest.config.ts`（`testTimeout` / `hookTimeout`）
- 探针（未入库，供复跑）：`tmp/probe-symlink-realpath.cjs`
- 脚本（未入库）：`tmp/fix-archive-platform-assumptions.cjs`
- 日志（未入库）：`tmp/vitest-round115-run1.log`、`tmp/vitest-round115-timeout30.log`、`tmp/vue-tsc-round115.log`

## 八、口径修订（重要）

本轮的真正产出不只是「修好三处」，而是**取消了「恒定失败 2 例」这个口径本身**：

- 旧口径把 Windows 上的两处测试缺陷**常态化接受**了。一旦基线里存在「已知失败」，新增失败就只能靠**数字变化**去猜——而抖动本来就会让数字漂移，于是这个信号基本失效（round-107 起的记录正是如此：671/677、673/677、702/3、706/3、706/4 一直在动）。
- 新口径：**全量 706 例，期望零失败**。任何失败都值得看一眼——这比「恒定 2 例」可信得多。

## 九、遗留

- 无新增待办。
- **仍然只有用户能做**：`3cecaa6` 的 `.env` 含真实 GitHub OAuth 密钥且仍在祖先链里 → 需去 GitHub 轮换凭据（删文件无用，历史还在）。
- 发版仍未做：`v0.1.126`（09-28）之后已积压 **31 个提交**未发布（含两枚真 bug 修复 + 六处全量水合退场 + round-114/115）。
