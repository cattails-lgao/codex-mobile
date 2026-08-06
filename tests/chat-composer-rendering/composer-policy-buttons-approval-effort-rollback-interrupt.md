### Composer policy buttons show selection, approval policy applies to app-server, Medium default effort, edit-message stops active turn

#### Feature/Change Name
Composer 的规划模式/审批策略按钮显示当前选中值；审批策略保存后真正作用于运行中的 app-server（unless-trusted 下非信任命令弹审批确认）；模型强度默认 Medium；thinking 中编辑消息确认后先停止当前会话再回滚。

#### Prerequisites/Setup
1. Dev server running at `http://127.0.0.1:4173`（启动方式见交接文档，需 `CODEX_HOME` 指向项目内 `.codex/`）
2. 已登录且至少一个模型可用；选择任意线程进入 composer
3. 默认语言建议英文，便于与下方断言对照（中文模式同理）

#### Steps
1. 打开 `http://127.0.0.1:4173/` 并进入一个线程
2. 观察 composer 控件行：
   - 规划模式按钮显示当前选中的协作模式（默认应为 `Default`），不再固定显示 `Plan mode`
   - 审批策略按钮显示当前选中的策略（默认应为 `When Codex requests it`，取决于 config.toml）
3. 点击规划模式按钮 → 选择 `Plan mode` → 按钮文本变为 `Plan mode`；再切换回 `Default` 恢复
4. 点击审批策略按钮 → 选择 `Unless trusted` → 按钮文本变为 `Unless trusted`，且保存后出现「审批策略已保存」tip
5. 验证策略对 app-server 生效：执行一个非信任路径命令（如 `cd /tmp && ls`），应弹出审批确认面板（Awaiting approval + 命令预览 + Yes/Yes for Session/No），而不是直接执行
6. 验证模型强度默认值：检查 `Thinking` 下拉初始值为 `Medium`（若模型不支持 Medium 则取其支持的最近默认）
7. 发送一条消息使会话进入 thinking，期间点击一条历史用户消息的编辑按钮 → 确认弹窗 → 点确认 → 会话先停止（停止按钮/spinner 消失），再进入编辑草稿回填

#### Expected Results
- 规划模式与审批策略按钮文本跟随选中项变化（Default/Plan mode/Execution plans；When Codex requests it/Unless trusted/Never）
- 保存 `Unless trusted` 后，非信任目录命令弹出审批确认；信任目录（config.toml `[projects]` 标记 `trusted`）命令自动执行不弹窗，属策略语义
- `Thinking` 下拉默认 `Medium`
- 编辑消息确认后，进行中的会话先被 interrupt，随后才回滚到目标轮次

#### Rollback/Cleanup
- 测试后把审批策略恢复为 `on-request`：`curl -X POST http://127.0.0.1:4173/codex-api/approval-policy -H "Content-Type: application/json" -d '{"policy":"on-request"}'`
- 清理测试产生的线程/文件变更（git 可还原）
