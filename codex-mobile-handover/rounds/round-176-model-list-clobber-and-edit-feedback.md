# round-176：模型列表保线程选择 + 编辑保存失败可见化 + 回退入口改编辑按钮

## 一、背景（用户报障 2 条）

1. **模型切换列表有延迟；线程用的模型会被切换到默认模型；有的时候只剩默认模型。**
2. **回退按钮改为编辑按钮；同时编辑功能有问题，无法正常使用。**

## 二、真机取证（vite dev 5175 + 隔离 home + 合成线程 + Edge headless）

探针：`tmp/r176-harness.js`（页面级 initScript 拦 `/codex-api/rpc`，合成 3 轮线程 + 有状态 revert/turn/start；**注意必须包 `{ result }` 信封**，裸 payload 会得到「malformed envelope」）+ `tmp/r176-probe.cjs`（A 编辑链路 / B 模型下拉 / D 失败反馈）+ `tmp/r176-probe-c.cjs`（C 冷启动慢 provider 计时）。

- **编辑主链路本来就通**：合成线程上点编辑 → 内联框聚焦预填 → 保存 → `thread/revert {beforeTurnId}` + `turn/start {turnTrigger:'edit_user_message'}` → 编辑后消息渲染、后续轮剔除（A1–A6 全 PASS）。⇒ 报障的「无法正常使用」不在主链路。
- **失败路径完全静默（本轮根因②）**：`rollbackSelectedThread` 失败只写 `error` —— 而 **`error` 在 UI 上没有任何渲染位**（`visibleFeedbackErrors` 只把 `desktopError` 作为设置页反馈按钮的触发器，见 `App.vue:1740`）。注入 revert 500 后：无反馈、无重发（D 场景修复前 D1 FAIL）。
- **模型列表两条加载路径不对称**：启动路径 `refreshAll → scheduleAncillaryStateRefresh({ includeProviderModels: false })` **不等 provider**，codex 模型立即可用；`selectThread → refreshModelPreferences({ includeProviderModels: true })` **要等 provider 往返**（合成 1200ms 实测卡满，`providerLog.tookMs=1201`）。provider-models 缓存 30s TTL 过期即重付往返；**失败结果也缓存满 30s** ⇒ provider 抖动后长达半分钟列表缺 provider 模型（报障③「有时只剩默认模型」）。
- **覆写路径（本轮根因①）**：`refreshModelPreferences` 里线程模型不在本次拉到的 `modelIds` 就 `setSelectedModelId(currentConfig.model)` / `nextModelIds[0]`——一次 provider 抖动即把线程（含新建线程兜底键）的模型**持久地**改写为默认。

## 三、改动（6 处）

1. **`useDesktopModelPreferences.refreshModelPreferences`**：线程「自身键」（`hasThreadOwnModelSelection`，round-87 窄判据）已有的模型选择**不因列表缺项被覆写**——保留选择并 `ensureAvailableModelIds` 让它继续可见；`providerChanged`（用户显式换 provider）仍覆写；新线程兜底键维持旧判据（`useDesktopState.test.ts`「drops stale non-Codex selected models」钉住的语义原样保留，`selectedThreadId=''` 时窄判据为 false，不受影响）。发送期 400 由 `startTurnForThread` 回退兜底（round-72 语义）。
2. **`readProviderCompatibleSelectedModel`**：线程模型不在（可能陈旧/未含 provider 的）列表时**保留显示值**并 ensure 进列表，不再悄悄换成第一个可用模型（切线程时模型显示被换默认的直接来源）。
3. **`models.ts` provider 缓存**：成功 TTL 30s→**5min**；过期 **stale-while-revalidate**（立即回陈旧值 + 后台重验，失败不回滚陈旧值）；失败负缓存 30s→**3s**。in-flight 去重保留（round-77）。
4. **`selectThread`**：`refreshModelPreferences` 改 fire-and-forget（模型显示值由 `setSelectedThreadId → syncSelectedThreadModel` 同步给出，读本地映射不等网络）；provider 往返移出选线程关键路径。
5. **回退失败可见化**：`rollbackSelectedThread` catch 补 `setTurnErrorForThread(threadId, message)`（与发送失败同通道，会话内红行，下次发送自然清掉）；`App.onEditMessageResend` 的「目标轮仍在列表 ⇒ 静默 return」改为显式 `desktopError` 反馈 + i18n 键 `Edit failed: ...`（回退路径已给 error 时沿用原文）。
6. **编辑入口改观感**：`MessageToolbar` 的按钮图标 `IconTablerArrowBackUp`→**`IconTablerPencil`**（新建）、非用户角色文案 `Rollback`→`Edit`；aria/title（`Edit this message`）不变。文件回退块的 undo 按钮仍用 ArrowBackUp（语义确实是「回退」）。

## 四、验证

- `vue-tsc --noEmit` **EXIT=0**；`vitest run` **1066/1066（94 文件）**（基线 1060/93，+6 例 +1 文件：prefs 3 例 + provider 缓存 3 例）；`vite build` **EXIT=0**；ui-contract **60/60**。
- 真机探针 **13 断言全 PASS**：A1–A6（编辑链路端到端）、B1–B3（下拉显示线程模型 / 选项即时 / 映射不被覆写）、C1–C2（慢 provider 冷启动）、D1–D2（revert 500 → 会话内可见反馈 + 不重发）。
- 新单测：`useDesktopModelPreferences.test.ts`（mock codexGateway：线程自身选择保留 / 无选择回落 config / 陈旧列表保显示值）；`models.providerCache.test.ts`（TTL 内命中 / SWR 立即回旧值后台刷新 / 失败短负缓存）。

## 五、提交

- **代码笔**：`de8430d6`（fix(chat)，9 文件 +279/−19）。
- **文档笔**：本段所在提交（主入口快照/历轮/页脚 + commit-history 台账 1326 → 1340 行 + 本文档）。

## 六、诚实边界（未闭环）

1. **用户真实线程未复现原始故障**：本轮取证全部基于合成线程 + 页面内 RPC 拦截——「线程模型被切回默认」「有时只剩默认」的修复依据是**代码路径 + 可复现机制**（覆写分支与缓存窗口确实存在且被单测钉住），不是用户现场的复现取证；真实环境若还有别的触发面（如 free-mode exclusive 列表与线程模型交叉），要等下次现场证据。
2. **SWR 后台重验失败是静默的**：陈旧 provider 列表继续被使用、无 UI 提示（有意取舍：provider 抖动时可用性优先）。
3. **selectThread 改非阻塞的竞态面**：快速连切线程时，旧线程的模型刷新可能晚到并写当前上下文（刷新内部读的是**执行时刻**的 `selectedThreadId`，语义与改动前一致，但执行窗口从「await 内」变为「任意时刻」）；未构造连切探针。
4. **`turnTrigger='edit_user_message'` 在真实 0.162.1 上的服务端行为未验**（合成 turn/start 不校验该值；schema 是自由 string，round-169 已确认桌面同款取值）。
