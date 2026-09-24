# round-96 · 排版阶梯（text-[Npx] 清零）

日期：2026-09-24 · 前置：P1 主界面落地（round-92~95）+ 用户免审授权（「直接从头到尾改完」）

## 1. 做了什么

方案 §4 的 7 级排版阶梯落地为 **@theme token**（`src/style.css` 非 inline 块）：

| token | 值 | 说明 |
|---|---|---|
| `--text-nano` | 10px | 方案表外补充档：度量稿实际用了 9 处 10px（徽记/kbd/角标级） |
| `--text-micro` | 11px | 分组名、状态、面板小标题 |
| `--text-ui` | 13px | 控件、列表行 |
| `--text-body` | 15px | 会话正文 |
| `--text-display` | 40px | 空态 Hero（复用 `--font-display`） |

12px 复用 `text-xs`、18/24px 复用 `text-lg/text-2xl`，不再造别名。**token 只定字号、不绑行高**——与被替换的 `text-[Npx]` 逐字同行为（Tailwind 任意值也只设 font-size），行高由使用点按阶梯表搭配；这是「等值替换」的关键。

全仓替换 **141 处**（第一遍 px 形态 127 + 第二遍 rem 形态 14，32+3 个文件）：

```
text-[9px]/[10px] → text-nano   text-[11px] → text-micro   text-[12px] → text-xs
text-[13px] → text-ui           text-[15px] → text-body
text-[0.68rem](10.88px) → text-micro    text-[0.65rem](10.4px) → text-nano
text-[2.5rem](=40px) → text-display     text-[1.4rem](22.4px) → text-2xl（阶梯 h2=24）
```

`text-[1em]`（2 处，MessageInlineContent/ThreadConversation 的按钮继承重置）**保留**——它等宽于 `inherit`，不是阶梯违规；契约正则改为只计 px/rem 固定值。

## 2. 闸门

- 契约 32 → **33**：`text-[Npx]` 断言从「不增（≤147）」收紧为「**清零**」，新增「阶梯 token 已定义」断言。
- 等值检查：重采后 **6 项差异全部是模型控件 disabled→enabled 的采样态漂移**（round-93 时工具线程上它 40s 也不启用，现在会启用了——环境状态变化，非本次改动引入；enabled 紫芯片恰是 round-92 的目标态），**零字号差异**。复核后重新武装（自检 0 差异）。

## 3. 验证

`vite build` ✓（首跑一次 EBUSY 偶发，重跑通过）· `vue-tsc` 0 · 契约 33/33 · 主题 15/15 · 字体 13/13 · Vitest 656/658（2 平台差异 + 1 并发抖动单独复跑 28/28）。

## 4. 教训

- **sweep 正则要与契约断言同一口径**：第一遍只扫 `\d+px`，契约（与真实代码）里还有 rem 形态——「替换脚本说清零」不算数，要用断言方的正则再验一遍。
