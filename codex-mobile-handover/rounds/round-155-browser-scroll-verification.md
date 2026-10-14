# round-155：滚动落点的真机实测（批 3a 的待验证项）+ Ctrl+J 的真实命运

承接 round-153 的两条**待人工验证**：

1. 移除 `anchor.scrollIntoView({ block: 'end' })` 后，真机「滚到底 / 上翻加载 / 图片晚到补锁底」三种场景的落点；
2. round-152 遗留的 `Ctrl+J` 真机按一次。

本轮把第 1 条**做完了**（真 Chrome，chrome-devtools MCP 驱动，五个场景）；第 2 条**没能闭合**，但把「为什么不能」和「人工按完怎么判读」都钉死了。

---

## 一、怎么把「真机」搭起来（全部可复跑）

| 环节 | 做法 |
| --- | --- |
| 应用服务 | `CODEX_HOME=D:/codex-home-fresh node scripts/dev.cjs --port 5173 --strictPort` —— 隔离 home（空即隔离），Vite 插件桥照常起，`thread/list` 返回空即可 |
| 慢图服务器 | `node tmp/r155-slow-image-server.cjs`（`?delay=<ms>` 可控，返回真 PNG 900×700、9.5KB） |
| 页面侧**全部**代码 | `tmp/r155-harness.js`（fetch 补丁 + 自录时间线 + 自驱动场景） |
| 注入方式 | initScript 只有 6 行：同步 XHR 取 `/tmp/r155-harness.js` + `eval` |
| 驱动 | chrome-devtools MCP：`navigate_page`(带 initScript) → `evaluate_script` |

### 三个反直觉但必须知道的事实

1. **`initScript` 不跨导航保持**。实测：不带 initScript 再导航一次，`window.__R155` 就是 `undefined`，应用拿着合成 threadId 去问真桥并拿到 `502 invalid session`。所以**每次导航都得传一遍** —— 这也是把长脚本放进文件、initScript 只留 6 行的原因。
2. **Vite 会把 `/tmp/*.js` 当普通 JS 伺服**（实测 `200` + `text/javascript`）。于是「长脚本落文件 + initScript 短引导」这条路成立，脚本可读可改可复跑，不像内联那样每次改都要整块重贴。
3. **同文档 hash 跳转不会重载文档**。`#/thread/a` → `#/thread/b` 是 same-document navigation，initScript 不重跑、旧补丁还在，页面直接拿着 `b` 去问真桥并拿到 502。要换文档必须带一个会变的查询串（本轮用 `?r155=N`）。

### 数据合成、管线真实

fetch 补丁只拦两条 RPC，其余一律透传：

- `POST /codex-api/rpc` 且 `method ∈ {thread/read, thread/resume}` 且 threadId 命中 ⇒ 回合成线程；
- `GET /codex-api/thread-turn-page`（上翻分页）⇒ 回合成的更早一页。

被检验的仍然是**真实管线**：归一化 → `UiMessage` → `App.vue` 的 `filteredMessages` → 热/温/冷三层 → 组件 → CSS → 滚动。合成线程：15 轮（turn 30..44），每轮正文 9 段把容器撑到 `scrollHeight ≈ 7363`（视口 514/572），末轮带 1～2 张**故意慢**的图。

`hasMoreOlder` 的口径来自源码：`startTurnIndex > 0`，而 `startTurnIndex = payload.threadTurnStartIndex`（`src/api/gateway/threads.ts:145`、`:431`）—— 合成响应的顶层放 `threadTurnStartIndex: 30` 即可让「上翻可用」成立。

---

## 二、实测结果

视口 1440×950（`.conversation-list` clientHeight 514～572）。`dist` = `scrollHeight − (scrollTop + clientHeight)`，即「距底距离」。

| 场景 | 断言 | 实测 | 结论 |
| --- | --- | --- | --- |
| **S1a 打开即在底** | 距底 ≈ 0 | `dist = −0.33`，`top = 6849.33`、`maxTop = 6849` | ✅（过滚 0.33px 是浏览器把写入值钳到**分数** maxTop 的产物） |
| **S1b 上滚不被拉回** | 停在原处 | `dist 599.67`，`top 6249.33`，1.5s 后**逐位不变**；「跳到最新」按钮出现 | ✅ |
| **S1c 点「跳到最新」** | 落到底 | `dist 0.33`，`top 7284.67`、`maxTop 7285`（写入 7285 被钳到 7284.667 ⇒ 残差 0.33px） | ✅ |
| **S2 上翻加载补偿** | 视口内容原地不动 | 前置插入 10 轮：`sh 8234 → 12952`（+4718），`top 0 → 4718`，视口内那条 `rect.top` **146 → 146.17**（位移 **0.17px**） | ✅ |
| **S3a 贴底时图片晚到** | 内容长高后仍在底 | 图到达 `sh 7363 → 8234`（+435/+871），时间线 117 帧 `distMin −0.33 / distMax 0.33`，`top` 6849.33 → 7720 跟着涨 | ✅ |
| **S3b 滚开时图片晚到** | `scrollTop` 不动 | `top 6249.33`（滚动前后**逐位相同**）而 `sh 7363 → 7799`；按钮仍在 ⇒ 没有被拽回底部 | ✅ |

### 两条最有说服力的读数

- **S2 的 0.17px**：4318px 级别的插入只让视口里那条移位 0.17px，且 `ΔscrollTop (4718) == ΔscrollHeight (4718)` 精确成立 —— 这正是 `loadMoreAbove()` 里 `container.scrollTop = prevScrollTop + (container.scrollHeight - prevScrollHeight)` 的算式，逐字对上。
- **S3a 的 `top` 跟着涨**：`dist` 全程恒在 0.33 以内，说明是**容器在追内容**，不是内容长得恰好抵消。

### 关于「自录时间线」这条设计

第一版把「图还 pending」和「图到了」交给**两次工具调用**去采，结果连续两轮都在列表出现前就已经 `complete` —— agent 两次调用之间隔了十几秒，先到的那一方永远看不见另一半。改成**页面内每 100ms 自采一份**（`window.__R155_TL`）之后，取证调用什么时候进来都不影响结论。这是本轮唯一一处「工具用错了，改工具」而不是改被测对象的地方。

---

## 三、一处**未能复现**的异常（诚实记录）

第一次跑到「贴底 + 第二张图晚到」时，**图片到达后没有回锁**：

```
beforeImages : top 7284.67  sh 7799  dist 0.33   imgs: up=900, bottom=pending
atArrival    : top 7284.67  sh 8234  dist 435.33 imgs: up=900, bottom=900
afterLock×900ms: top 7284.67         dist 435.33   ← 完全没回锁
时间线 101 帧：distMin 0.33 / distMax 435.33，`top` 自始至终 7284.67
```

随后用更严密的 harness 复跑同一时序与相邻时序，**4 次全部通过**：`s3two`（两图、全程贴底）、`s3mix`（先上滚再跳回底部）、`s3late` ×2（**忠实复现** run-3 的时序：第一张图在「上滚态」到达 → 跳回底部 → 第二张图到达）。

**判断它不是 round-153 引入的**，三条理由：

1. **失败点在写入之前**。`scrollToBottom()` 只要被调用就必然写 `container.scrollTop = maxTop`；没有回锁说明它**没被调用**（或提前 `return`），而不是「调用但写错地方」。
2. **探针证明写入路径仍然准确**：强制上滚 400px（`dist 400`）后点「跳到最新」→ `dist 0`。也就是说 `enforceBottomState → scrollToBottom → setScrollDistanceFromBottom` 这条链本身是好的。
3. **round-153 只改了这条链最内层的落点算法**，且逐位等价（32 例对照扫描 + 本轮实测同值：贴底态 `dist 0.33`、写 `maxTop` 被钳到分数值）。

⇒ 唯一能解释「没回调」的上游分支只有两个：`onPendingImageSettled → scheduleBottomLock(3)` 处 `shouldLockToBottom()`（即 `autoFollowOutput`）为假而**早退**，或该图的 `load` 监听**压根没挂上**。两者都是 **round-153 之前就存在**的逻辑（`bindPendingImageHandlers` 的 `shouldLockToBottom` 守卫、`trackedPendingImages` 一次性登记、rAF 驱动的 3 帧锁底窗口）。

**不追下去的理由**：只观察到一次、无法复现，且当时那次 harness 额外在图片 pending 窗口里做过一次强制布局的取证调用（后续 s3late 没有）。**记为未定位的间歇现象**。若要继续追，最小动作是在 `onPendingImageSettled` 里给 `shouldLockToBottom()` 与 `trackedPendingImages.size` 留痕，跑 20 次统计。

> 顺带记一条**本轮不打算改**的既有脆弱面：补锁底完全靠 `requestAnimationFrame` 驱动的 3 帧窗口（`scheduleBottomLock(3)`），而列表**没有 `ResizeObserver`/`MutationObserver`**。批 3（窗口化）本来就要把「贴底由坐标驱动」做实，这条间歇现象说明**锁底窗口本身也需要确定化**，可以并到批 3 一起处理，不必现在单独动刀。

---

## 四、Ctrl+J：本轮**没能闭合**，但把边界钉死了

### 已确证的（CDP 侧）

- **处理函数是对的**：CDP 注入 `Control+j` 后，页面里的观察器记录到 `{key: 'j', ctrl: true, prevented: true}` ⇒ 事件到达页面且**应用的 handler 跑了并 `preventDefault()`**（`src/App.vue:3406` 的 `route.name === 'thread' && selectedThreadId` 分支）。
- **但这不是有效证据**。正对照：CDP 注入 `Control+t`，`list_pages` **仍是 1 个页面**（没开新标签页）⇒ CDP 注入**绕过浏览器加速键的前置处理**（复现 round-152 的结论）。既然连 Ctrl+T 都不生效，那么「CDP 下 Ctrl+J 生效」只说明**键到页面之后**的行为，说明不了**键能不能到页面**。

### 为什么本环境做不了真按键

想用操作系统级注入绕开 CDP，两条路都被**本机安全策略**拦下：

| 尝试 | 结果 |
| --- | --- |
| `Add-Type`（P/Invoke `keybd_event` + `SetForegroundWindow`） | `Command blocked for security: Add-Type compiles and loads .NET code at runtime` |
| `New-Object -ComObject WScript.Shell`（`AppActivate` + `SendKeys('^j')`） | `Command blocked for security: COM object instantiation can run arbitrary code` |

⇒ **本环境无法注入真实操作系统按键**，`Ctrl+J` 的真实命运**只能由人按一次**。这不是「忘了做」，是硬性环境限制。

### 人工判读协议（10 秒）

前提：本机 Chrome 窗口（PID 48448，标题 `127.0.0.1 - Google Chrome`）里那个页面**已经装好观察器**（`window.__R155_KEYS`）。

1. 点进那个 Chrome 窗口（不要按 F5，刷新会丢掉观察器）；
2. 按一次 `Ctrl+J`；
3. 两种结果各自读作：
   - **新开了一个 `chrome://downloads` 标签页** ⇒ Chromium 保留了该加速键，网页收不到 ⇒ 这个绑定在桌面 Chrome/Edge 里**不可达**，指针入口是唯一通路（下一条）；
   - **没开新标签页，且右栏切到 Terminal** ⇒ 键到得了页面，绑定可用。

（观察器的作用是把「到了但被应用处理了」与「根本没到」分开：前者会在 `__R155_KEYS` 里追加一条 `prevented: true`。也可以直接看 UI 有没有反应。）

### 依据与既有补偿

- Chromium 保留的加速键（`Ctrl+T` / `Ctrl+W` / `Ctrl+N` / `Ctrl+Shift+T` / `F12`…）网页**收不到**，这是浏览器安全边界；`Ctrl+J`（打开下载）是否在该保留集内，本轮**没有找到权威出处**（检索到的中文/英文"不可覆盖快捷键"清单里都只列到 tab/窗口/DevTools 那一组，未列 Ctrl+J）⇒ **不预设立场**，按上面的协议实测。
- 指针入口**已经存在**，所以即便键位不可达也不构成功能缺口：①右栏 `Terminal` 标签（`selectRightPanelTab`）；②命令面板里的 `Terminal` 命令（`src/App.vue:3320` 的 `case 'panel.terminal'`，入口是顶栏放大镜 —— round-151 就是为「布局相关键位必须有指针入口」这条结论加的）。`Ctrl+J` 属于**便利键**，不是唯一通路。

---

## 五、诚实边界

- 数据是**合成的**（拦两条 RPC），管线真实；脚本在 `tmp/`（gitignore）⇒ **不进 CI、不适合当闸门**。
- `s1`/`s3*` 五个场景各跑 1～2 次，**不是压力测试**；第二节表里的通过结论对每次运行都成立，但第三节那条间歇现象说明这条路径**存在时序敏感性**。
- **未跑 `tsup`**（本轮未碰 `src/server/**`）；**未 bump 版本、未 tag / Release**；`SHARED_BRIDGE_VERSION` 未 bump；**未改任何产品代码**（本轮是纯验证）。
- 期间起过的后台进程：隔离 home 的 dev server（5173）、慢图服务器（5199），以及 MCP 拉起的 Chrome 窗口。dev server 与慢图服务器**仍在运行**，供人工按 `Ctrl+J` 用；不需要时可直接结束这两个 node 进程。
