### Feature: Model switch resets context window and renders an anchored local divider (round-73 / round-74)

#### Prerequisites
- App running from this repository against a Codex app-server / LiteLLM-backed endpoint (dev on `127.0.0.1:4173`).
- A thread that has already produced at least one turn, so it has a real `thread/tokenUsage/updated` event (a populated context window) and a seeded per-thread model.
- The composer model picker offers more than one model so you can switch.

#### Background
Three model-switch UX fixes:
1. Context window did not refresh after switching models — the value only comes from the
   app-server's `thread/tokenUsage/updated` notification, and switching models fires no such event.
   Now `invalidateThreadContextWindow` nulls the thread's `modelContextWindow` on switch, so the
   indicator enters a pending/empty state until the new model's first usage event arrives. It never
   shows a stale old-model window.
2. Switching models injects a local-only divider message (`旧模型 → 新模型`). It is persisted to
   localStorage, does not touch the server, and is excluded from the turn grouping
   (process/final/plan/fold) pipeline.
3. (round-74) The divider is anchored to the real message that was last when the switch happened,
   instead of being fixed at the list tail. It stays between the turn at switch time and any newer
   turns. Switching again with no new turn updates the existing last divider instead of appending a
   duplicate. New messages sent after the switch correctly arrive after the divider.

#### Steps
1. Open a thread that already has a populated context window in its composer (token usage shown).
   Note the numeric context window.
2. In the composer model picker, switch this thread to a different model.
3. Observe the context indicator.

#### Expected Results
- Immediately after switching, the context window indicator is no longer showing the old model's
  number — it transitions to the pending/empty state (no numeric window) until the new model runs.
- A divider row `旧模型 → 新模型` appears in the message list at the switch position (after the turn
  that was active when you switched), styled as an independent centered strip with separator lines.
  It does not appear inside any process/final/plan/folder section and is never pinned to the tail.
- Switching again before sending a message updates the same last divider (`→ 新模型2`), it does not
  create a second duplicate divider.
4. Send a message on the thread so the new model produces its first `thread/tokenUsage/updated` event.
   Confirm the context window repopulates with the new model's value, and the new user/assistant turn
   renders below the divider (not above or merged into the previous turn).
5. Reload the page and reopen the thread. Confirm the divider row persists (localStorage
   `codex-web.local.thread-model-switch-markers.v1`) and still renders at the anchored position, not
   inside a turn and not at the tail.

#### Rollback/Cleanup
- Reset any model you changed back to the thread's original selection if you don't want the switch to persist.
- Divider markers are local-only; deleting the localStorage key
  `codex-web.local.thread-model-switch-markers.v1` (array entry for the thread under test) clears them.

#### Automated check
- `src/utils/modelSwitchMessages.test.ts` locks `isModelSwitchMessage` (2 cases).
- `src/composables/model-switch-insert.test.ts` (4) locks `insertModelSwitchMarkers` anchoring.
- `src/composables/useDesktopState.test.ts` (95) passes; `vue-tsc --noEmit` clean.

### Round-87：切换/回退换模型后窗口失效的覆盖范围，以及水合不覆盖用户选择

#### Background
- 手动切换模型会失效旧模型窗口，但**回退换模型**（服务端回报模型不受支持 → 自动换到回退模型）不会。回退目标窗口通常更小，界面仍显示旧的大窗口会让压缩预检误判「还有余量」。
- 线程详情水合会**无条件**用服务端 model 覆盖线程模型：切了模型但还没发送就刷新/重开线程，选择会被改回服务端旧值（且已失效的窗口白失效）。

#### Steps
1. 打开一个有真实上下文窗口的线程，在模型下拉里切到一个**不受支持**的模型（例如不存在于当前 provider 目录的 id）。
2. 发送一条消息，让服务端回报模型不受支持、触发自动回退到回退模型。
3. 观察输入框右侧的上下文指示器与线程模型显示。
4. 另开一个线程，在模型下拉里切到另一个模型但**不要发送**。
5. 刷新页面并重新打开该线程（或强制重载该线程消息），观察线程模型。

#### Expected Results
- 步骤 3：线程模型变为回退模型，且上下文指示器**回到待定/隐藏状态**（不再显示旧模型的数值），直到回退模型产生第一个用量事件后按新窗口恢复。
- 步骤 5：线程模型**保持你在步骤 4 里选的那个**，不会被服务端持久化的旧 model 改回去；随后发送时也确实用你选的模型。
- 对照组：新建/从未在本机显式选过模型的线程，打开时**仍会采纳**服务端持久化的模型（水合未被误挡）。

#### Automated check
- `src/composables/useDesktopModelPreferences.test.ts` 新增 5 例：窄判据 `hasThreadOwnModelSelection`（只认线程自身键、不认新线程默认、新线程占位上下文恒 false）+ 回退出口回调 `onThreadModelChanged`（线程回退时触发、无线程可失效时不触发）。
- `src/composables/useDesktopState.test.ts` 新增 4 例：错误通知驱动的回退使窗口置空、`turn/start` 同步失败的内联回退使窗口置空、显式选模型后重开线程保留所选、无显式选择时采纳服务端模型。
- 全量：658 例 656 通过 / 2 失败（既知 Windows 平台差异）；`vue-tsc --noEmit` 干净。
