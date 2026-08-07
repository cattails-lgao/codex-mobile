# 第十七轮样式强化（2026-08-08 提出，commit `ae595a9`）

> **2026-08-08 进展：** 对第十六轮第 9 条「命令块灰化」的进一步强化（用户反馈「不需要圆形边框和背景色」）。验证：`vue-tsc --noEmit` 通过、`pnpm run build` 通过、单测 308/308、Playwright 54/54（桌面浅色/暗色/H5）。涉及 `WorkBlockItem.vue`、`ProcessFold.vue`、`style.css`；手动测试文档 `tests/chat-composer-rendering/round16-message-visual-and-interrupt-cleanup.md` 追加第 7 节，回归脚本 `output/playwright/r21-verify.cjs` 断言扩展至 54 项。

1. **命令执行块去卡片化**：`.work-block` 去掉圆角/边框/背景色与圆形序号徽章，改为朴素行「序号（纯文本数字，`text-zinc-400`）+ 命令文本（`text-zinc-500`）+ 状态（弱化色）」；展开的输出区保持深色代码块（去掉 `rounded-b-xl`）；`work-block-list` gap 收紧 1.5→1。暗色覆盖改为纯文字适配（`text-zinc-500` 序号 / `text-zinc-300` 命令，status dot 用 `text-*-400`）。
2. **Processed 折叠条去卡片化 + 收起按钮移位**：`.process-fold` 去掉圆角/边框/背景；`.process-fold-label` 去掉 `flex-1`，收起按钮 `▸/▾` 从行尾移到**文本旁**（紧跟 label）；运行中仅 label 变琥珀色；body 去掉 border-t 与内边距改为 `px-0 py-1.5`。

> **验证说明：** Playwright 新增断言——命令块/折叠条 `border-radius: 0px`、背景 `rgba(0,0,0,0)`、序号为纯数字（无圆形徽章背景）、`toggleBesideLabel === true`（toggle 与 label 间距 < 12px），桌面浅色/暗色/H5 三视口全通过；推送经本机 FlClash 代理（`127.0.0.1:7890`，GitHub 直连 443 超时）。

