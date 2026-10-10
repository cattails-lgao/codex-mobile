# Round 140: agent-injected user messages render as agent notes

### Feature: Agent-injected user messages render as agent notes (round-140)

#### Prerequisites

- A build of the current source (`vite build` **and** `tsup`) served by `dist-cli/index.js` with the `/codex-api`
  bridge — `vite preview` has no bridge and will produce misleading failures.
- A thread whose turn contains an **agent-injected** `userMessage`, i.e. a `{"type":"userMessage","clientId":null,…}`
  entry sitting at position **≥ 2 inside a turn** (written by codex multi-agent `sendInput` delivery), or a message
  whose body starts with `<subagent_notification>` / `<environment_context>`.
- Alternative when no such real thread exists: stub the RPC with `page.route('**/codex-api/rpc')`, replay
  `thread/read` / `thread/resume` with a synthetic thread (one turn holding genuine + injected + steer rows,
  plus a `<subagent_notification>` turn and an `<environment_context>` turn) and let every other RPC pass through.
  This exercises the real pipeline (normalize → group → component → CSS); only the data is synthetic.

#### Steps

1. Open the thread that contains an injected user message.
2. Compare that row against a genuine user question in the same thread.
3. Inspect the DOM: the injected row must carry `data-role="system"` and `data-message-type="agentNote"`.
4. Send a normal message from this UI, then send a second one while the turn is still running (steer).
5. Look for the edit/copy affordances on the injected row, and measure the note body's contrast in both themes.
6. Switch the UI language to `zh-CN` and re-read the note header.

#### Expected Results

- The injected body renders **left-aligned**, visually de-emphasised, with a source header — **not** a right-side
  user bubble. Its body text is preserved in full (markdown blocks still render).
- Genuine user questions still render as right-side bubbles.
- A **steer** message sent from this UI also stays a right-side bubble — it now carries `clientUserMessageId`, so
  the injected-message judge (`clientId == null` **and** not the turn's first user message) must **not** catch it.
- The note does **not** open a new turn group: the number of turn groups equals the number of genuine questions.
- No edit affordance on the note (it is excluded from `editableTurnIdByMessageId`).
- Note body contrast vs. its background is **≥ 4.5:1** in both themes (measured **7.76:1** in dark).
- With `zh-CN` selected the header reads 「代理注记」.

#### Rollback/Cleanup

- None — this is a read-only rendering change; no local state is written.
