## 第三轮验收修复（commit `eedf148`）

针对第三轮验收的 3 个问题做了修复，均已通过 Playwright 端到端验证（dev 环境：`http://127.0.0.1:4173/`）：

| 问题 | 修复 | 验证 |
|---|---|---|
| 压缩进度条在会话顶部独立横幅显示，不随消息流走 | 移除 `App.vue` 顶部横幅；压缩时向消息流注入 `compaction.pending` 行（旋转动画），收到 `thread/compacted` 或 60s 超时后替换为 `compaction.done` 行 | Playwright：输入 `/compact` 后消息流内出现 "Compacting thread context…"，60s 后切换为 "Context compacted"，两态互斥 |
| 无权限时希望提示用户同意 codex 自带的审批策略配置文件 | 设置面板新增「审批策略」区块：读写 `CODEX_HOME/config.toml` 的 `approval_policy`（`untrusted`/`on-failure`/`on-request`/`never`），写入去重保留其余配置；读取优先 `CODEXUI_APPROVAL_POLICY` 环境变量再回退配置文件 | Playwright：面板渲染 4 个选项，保存后 GET 返回新值、配置文件无重复行；TRAE 沙箱下写 `~/.codex` 会被拦截，需将 `CODEX_HOME` 指向项目内 `.codex/` |
| 斜杠命令未集成已安装的技能，无法分组展示 | `slashCommands.ts` 新增 `buildSkillSlashCommands()` 按技能生成 `/技能名` 命令；`ComposerSlashMenu.vue` 分组渲染（Commands / Skills），技能行绿色前缀，选中后附加技能到消息 | Playwright：菜单显示 Commands 12 项 + Skills 10 项；单测 20/20 通过 |

### 第四轮修复（commit `5cd6ede`）：压缩状态两个 bug

第三轮把压缩进度改为消息流内渲染后出现两个问题，根因同源——**新版本 codex app-server 已废弃 `thread/compacted` 通知**（协议 schema 标注 `Deprecated: Use 'ContextCompaction' item type instead.`），压缩完成改为在消息 payload 中插入 `contextCompaction` item，而旧实现只等废弃通知：

| 问题 | 根因 | 修复 | 验证 |
|---|---|---|---|
| 执行 `/compact` 后 thinking 已结束但 spinner 仍转圈 | `thread/compacted` 通知收不到（已废弃），只能等 60s 超时兜底才切换 done | `src/api/normalizers/v2.ts` 将 `contextCompaction` item 归一化为 `compaction.done` 消息；`compactThreadById` 在 `thread/compact/start` 后轮询线程详情（2s 间隔、上限 28s）检测到 done 即收尾；兼容旧版通知路径 | Playwright：pending 短暂显示后立即切换 done，不再等 60s |
| 压缩成功后刷新页面，完成提示消失 | 完成消息是内存注入的（`injectedSystemMessagesByThreadId`），不持久化，刷新即失 | `contextCompaction` item 来自服务端持久化数据，归一化后随消息加载自然保留；多次压缩只保留最近一条 done（`collapseCompactionDoneMessages`）；无压缩进行中且已有持久化 done 时丢弃残留 pending 行 | Playwright：刷新后仍有 "Context compacted"、无 spinner、只显示 1 条；单测新增 3 例通过 |

