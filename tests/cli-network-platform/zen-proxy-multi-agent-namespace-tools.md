### Zen proxy expands multi-agent namespace tools

#### Feature/Change Name
The Zen proxy (`zen-proxy/v1/responses` -> `https://opencode.ai/zen/v1/chat/completions`)
rewrites Responses requests into the Chat format. `responsesToolsToChatTools()` only kept
top-level `type: "function"` tools, so Codex's `type: "namespace"` tool `multi_agent_v1`
(whose sub-tools `spawn_agent`, `wait_agent`, `send_input`, `close_agent`) was silently
dropped. Workers therefore never received the nested agent lifecycle tools. The converter
now expands each namespace sub-tool into a qualified chat function
`<namespace>.<subName>`, keeps a per-request `qualifiedName -> namespace` map (no global
fixed tool table), and restores the `namespace` field on the Responses `function_call`
when translating the upstream Chat reply back, so Codex routes the call instead of
reporting `unsupported call`.

#### Prerequisites/Setup
1. A Codex session routed through `codexapp.service` -> `zen-proxy` (not the direct
   LiteLLM `4460` path, which does not pass through this converter).
2. Confirm `handleZenProxyRequest()` runs with `responsesPayloadFormat: "chat"`.

#### Steps
Run the no-side-effect probe described in
`docs/zen-proxy-multi-agent-tools-issue.md` under 验收 on the same actual route and model:
1. Main session calls `spawn_agent` and creates a sub-agent.
2. Sub-agent lists and successfully calls `spawn_agent` to create a grandchild agent.
3. Grandchild agent returns fixed text.
4. Sub-agent `wait_agent`, `send_input`, `close_agent` all succeed.
5. Main session reaps the sub-agent.
Then re-run CP8 minimal batch candidate `1Ypm9K0m` and confirm the official report
contains complete Step 1-15, `===CHECK===`, batch feedback, and QC.

#### Expected Results
- Workers receive `multi_agent_v1` sub-tools (`spawn_agent`, `wait_agent`,
  `send_input`, `close_agent`) and can schedule `wq-candidate-diagnostician`.
- Each `function_call` returned to Codex carries the original sub-tool `name`
  plus the `namespace` field; no `unsupported call` routing error.
- The full multi-agent lifecycle (spawn -> grandchild -> wait/send/close -> reap)
  completes successfully.

#### Rollback/Cleanup
- No persisted state is touched; the probe is read-only. CP8 progress stays unchanged.
- If behavior regresses, revert to the global `responsesToolsToChatTools` filter and
  restart the app-server so the new converter is loaded.