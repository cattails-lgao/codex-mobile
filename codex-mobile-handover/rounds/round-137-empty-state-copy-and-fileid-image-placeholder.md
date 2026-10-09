# round-137：空状态文案补齐「下一步动作」+ attachment-only（fileId）图片不再静默缺失

> 承接：用户「**待办7，round-120你选一个，round-131你来选择处理**」——把 round-120 §三③ 与
> round-131 §十③（= round-130 §四① / §十一②）这两条**积压了三轮的产品口径题**做掉。
> 用户明确授权本轮**代为拍板**，不再回问。
>
> **用户裁决（2026-10-09）**：待办 6（造一条大线程量回滚成本）**不做**；待办 7 两项**按本轮口径执行**（已追认，见 §九）。
>
> 基线：`f2c44ef2`（round-136 末次提交）。本轮**未发布**（未 bump、未 tag）。

---

## 一、结论先行

两项都取**最小、可逆、可测**的实现；「为什么这样选」写死在本节，避免下一轮重新论证：

| 项 | 本轮决定 | 依据 |
| --- | --- | --- |
| round-120 §三③ 空状态 | 三处**都**补「原因 + 下一步动作」，中英同步 | 设计规范口径（空状态 = 原因 + 可执行动作）。三处同一病根，只挑一处没有意义 |
| round-131 §十③ fileId 图片 | 渲染**可见的「不可预览」占位 chip**；**不做** fileId → 字节/URL 解析 | 完整解析在 0.161.0 **协议上不可行**（§三.2 有取证）。占位是本地唯一能闭掉「静默缺失」的手段 |

证据：`vue-tsc` **EXIT=0**；全量 **777/777（77 文件）**（= round-136 基线 772 + 5）；契约 **48 → 50**；
反跑（**保留新断言、只回退生产代码**）⇒ **2 项契约 + 4 例单测转红**（§四.2）。

---

## 二、round-120 §三③：空状态补「下一步动作」

**原问题**（round-120 §三）：三处空状态**只陈述现状、不含下一步**，违反规范「空状态 = 原因 + 可执行动作」。

| 位置 | 改动前 | 改动后（EN / ZH） |
| --- | --- | --- |
| `ThreadConversation.vue`（线程内无消息） | `No messages in this thread yet.` | `No messages in this thread yet. Type a message below to get started.` / 此线程还没有消息。**在下方输入消息即可开始。** |
| `SidebarThreadTree.vue`（搜索无结果） | `No matching threads` | `No matching threads. Clear the search to see all threads.` / 没有匹配的线程。**清除搜索即可查看全部线程。** |
| `SidebarThreadTree.vue`（项目下无线程） | `No threads` | `No threads yet. Start a new thread to begin.` / 还没有线程。**新建一个线程即可开始。** |

**为什么三处都改、而不是只挑一处**：用户说「你选一个」，但三处是**同一个规范缺陷的三个实例**，
且每一处的「下一步」都**真实存在**（下方就是输入框；搜索框旁就有 `Clear search` 的 X 按钮；
工具条上就有 `show-new-thread-button`）——文案指向的动作都是用户真能点的，不是空话。
只改一处会把「未改的两处」留成下一轮的同类待办，收益为负。

**i18n 机制备注**：本仓的 `t()` 以**英文串为 key**（`zhCN[message] ?? message`）。所以改文案 =
「i18n 表的值 + 调用点的 key」两处同步改。三个旧 key 在全库各只有 1 处引用，无遗漏面。

---

## 三、round-131 §十③：attachment-only（fileId）图片不再静默缺失

### 3.1 问题回顾

0.160.1 起 `UserInput` 的 image 变体是 `{ type:'image', detail? } & ({ url } | { fileId })`（附件引用）：

```ts
// documentation/app-server-schemas/typescript/v2/UserInput.ts
| { "type": "image", detail?: ImageDetail, } & ({ url: string, } | { fileId: string, })
```

本仓 `parseUserMessageContent` 的守卫只收 `url`（round-130 已把联合类型显式收窄，**行为逐字不变**），
于是**只有 fileId 的图片既不出图、也不产生任何数据记录** ⇒ 在会话历史里**静默消失**（round-130 §四①）。

**关键事实（本轮实测确认，推翻了「送进未处理通道就可见」的隐含假设）**：
`rawBlocks`（`isUnhandled: true`）这条路**在 UI 上本身也是不可见的**——它们没有专用渲染分支，
而 `shouldOmitEmptyGenericMessage` → `hasMessageBodyContent` 对「无 text / images / fileAttachments / skills」
的消息返回 true（省略）。所以项目里**不存在**能兜住这类内容的可见「未处理通道」，
必须**新开一个可见面**才能真正闭掉「静默」。

### 3.2 决定：可见占位（而不是静默、也不是完整解析）

- `parseUserMessageContent` 新增 `imageAttachmentIds: string[]`，把**只有 fileId、无内联 url** 的图片 id 收进来；
- `UiMessage` 新增 `imageAttachmentIds?: string[]`；`hasMessageBodyContent` 把它计入「有正文」，
  保证「只发了一张 fileId 图片」的用户消息**不会**被当成空行省略；
- `ThreadConversation.vue` 渲染成**虚线边框、不可点击**的占位 chip（复用既有 `.message-file-chip`
  尺寸/间距 + 新增修饰类 `.message-image-attachment-chip { @apply border-dashed text-ink-3 }`），
  文案 `Image attachment (preview unavailable)` / 图片附件（无法预览）。
- **`url` 分支逐字未变**：同时带 `url` 与 `fileId` 的块只按 url 出图（有单测钉住）。

### 3.3 为什么不做「完整的 fileId → 字节/URL 解析」（协议侧取证）

本轮去 schema 快照里查了附件面，结论是**当前协议不提供取内容的能力**：

| 事实 | 证据 |
| --- | --- |
| 附件面只有三个方法 | `thread/attachment/add` \| `/list` \| `/remove`（`documentation/app-server-schemas/json/ClientRequest.json`） |
| `list` 返回的是**元数据**，不是内容 | `ThreadAttachmentListResponse = { data: ThreadAttachment[], nextCursor }` |
| `ThreadAttachment.payload` 是 **opaque** 的 | `type ThreadAttachment = { id, attachmentType, identityKey, payload: JsonValue, createdAt }` —— `JsonValue` 无 url/path 语义 |
| **没有**内容取回端点 | 全 schema 搜索 `attachment` 只有上述三个方法 |

⇒ 即便拿到 `fileId`，也**没有任何 RPC 能把它换成可渲染的 URL 或字节**。硬做只能靠猜 `payload` 里的字段，
那不是实现，是赌。**故本轮只登记为后续协议侧议题**（§六）。

---

## 四、验证

### 4.1 基线

| 闸门 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | **EXIT=0** |
| 全量 Vitest | **777/777 通过（77 文件）**（= round-136 基线 772 + 本轮 5 例） |
| `check-ui-contract.cjs` | **50/50**（48 → 50，新增 2 项） |
| `vite build`（生产构建，校验模板/CSS 编译） | **EXIT=0**，`✓ built in 1m 27s`（只有既有的 chunk >500kB 提示） |

新增 5 例单测的落点：`v2.test.ts` × 2（fileId-only 产出 `imageAttachmentIds`；`url`+`fileId` 并存时只按 url）、
`messageContent.test.ts` × 1（`imageAttachmentIds` 计入可见正文）、`useUiLanguage.test.ts` × 2（三处新文案 + 占位文案）。

### 4.2 反跑（决定性，证明新断言非空）

**做法**：**保留**新写的契约项与单测，**只把 6 个生产文件回退到改动前**（`tmp/r137-*.bak`），复跑。

```
FAIL  三处空状态携带可执行的下一步（round-137）  (线程内无消息=NO / 搜索无结果=NO / 项目无线程=NO / 调用点同步=NO)
FAIL  attachment-only（fileId）图片不再静默缺失，改为可见占位（round-137）  (解析收集=NO / 类型字段=NO / 计入可见正文=NO / 渲染占位=NO / url 分支未变=yes)
2 项失败  (48/50)
Failed Tests 4
```

再还原（`tmp/r137-*.on`）⇒ 契约回到 50/50、定向单测 34/34，且 6 个文件与 ON 快照 `cmp` **逐字节一致**。

> 附注：第一次反跑做错了——我把**契约脚本与测试文件也一起回退**了，于是「断言本身不存在」，
> 读到 48/48 全绿，属**空过**。正确形态是「回退生产代码、保留断言」。记在这里，免得下次再踩。

### 4.3 静态契约新增的 2 项（48 → 50）

1. **三处空状态携带可执行的下一步（round-137）**：断言三个新 key 存在（含动作从句）**且**三个调用点已同步。
2. **attachment-only（fileId）图片不再静默缺失，改为可见占位（round-137）**：断言
   `解析收集` / `类型字段` / `计入可见正文` / `渲染占位` / **`url 分支未变`** 五项同时成立。

---

## 五、诚实边界

1. **本轮的「选一个」是我代拍的，不是用户首肯的口径**。若用户对文案措辞有偏好，改法只是动
   `useUiLanguage.ts` 里对应的一条值 + 调用点 key（三处，机械可逆）。
   **（2026-10-09 更新：用户已追认本文两项口径，见 §九；措辞若仍需调，改法不变。）**
2. **`fileId` 图片仍看不到内容**，只是不再「无声无息」。这是本轮**有意**的边界：协议不给内容，
   UI 能做的最多是诚实地说一句「这里有一张图，取不到」。
3. **浏览器类闸门本轮未跑**：本次改动只有 1 处新增 CSS（`.message-image-attachment-chip`，仅用既有 token、
   无裸色板），且复用已在生产使用的 `.message-file-chip` 尺寸/间距；`check-ui-contract` 的裸色板/字号/字体项
   全部覆盖。**真机像素级观感（尤其虚线占位在暗色下的对比度）本轮没有截图证据。**
4. **同类问题还有一个未处置**：`mention` / `audio` / `localAudio` 这些 block 也走 `rawBlocks`，
   而由 §3.1 的结论，它们**在 UI 上同样是不可见的**。本轮**只**修了 fileId 图片（用户登记的那条），
   其余登记为待办（§六②）。
5. **`vite build` 通过（EXIT=0）**，但它只证明模板/CSS **能编译**，不证明观感正确；本轮未跑 `tsup`
   （未触碰 `src/server/**`）。

---

## 六、未处置 / 待办

| # | 项 | 谁能做 |
| --- | --- | --- |
| 1 | **完整 fileId → 可渲染内容**：等上游给附件内容端点（或在 `payload` 里定出稳定语义）后再做；本轮已把协议侧取证写在 §3.3 | 需上游协议 |
| 2 | **`mention` / `audio` / `localAudio` 等 `rawBlocks` 内容的可见化**：与 §3.1 同因（无渲染分支 + 空正文被省略）。可复用本轮「新开可见面」的做法 | 可做 |
| 3 | round-131 §十②：造一条大线程量回滚成本 | **不做 —— 用户 2026-10-09 裁决（依据见 §九）** |
| 4 | **发布**：npm `latest` 仍 `0.1.127`（用户 token 401），`v0.1.128` tag 已指向重写后提交 | **需用户** |
| 5 | **GitHub Support 工单**（清理重写前的不可达对象）：草稿在 `tmp/r136-github-support-draft.md` | **需用户提交** |

---

## 七、涉及文件 + 复现方式

**改动文件（10 个，+154 / -11）**

- `src/api/normalizers/v2.ts`（+16/-5）：`imageAttachmentIds` 收集 + 计入可渲染 + 注释更新
- `src/types/codex.ts`（+3）：`UiMessage.imageAttachmentIds?`
- `src/utils/messageContent.ts`（+1）：计入可见正文
- `src/composables/useUiLanguage.ts`（+4/-3）：三处文案 + 占位文案
- `src/components/content/ThreadConversation.vue`（+19/-1）：空状态 key + 占位 chip + 修饰类
- `src/components/sidebar/SidebarThreadTree.vue`（+2/-2）：两处空状态 key
- `src/api/normalizers/v2.test.ts`（+35）、`src/utils/messageContent.test.ts`（+5）、`src/composables/useUiLanguage.test.ts`（+20）：单测
- `scripts/check-ui-contract.cjs`（+49）：2 项契约

**复现命令**

```bash
NODE="C:/Users/19155/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"

# 1) 静态与全量
"$NODE" node_modules/vue-tsc/bin/vue-tsc.js --noEmit
"$NODE" node_modules/vitest/vitest.mjs run
"$NODE" scripts/check-ui-contract.cjs

# 2) 反跑（保留断言、只回退生产代码 ⇒ 2 项契约 + 4 例单测转红；再还原）
#    备份：tmp/r137-{v2,codex,mc,i18n,conv,tree}.bak（改动前） / *.on（改动后）

# 3) 生产构建（校验模板/CSS 编译；emptyDir 被 shim 拦，须沙箱外）
"$NODE" node_modules/vite/bin/vite.js build
```

**锚点脚本**：`tmp/r137-apply.cjs`（10 文件 × 逐处断言恰好命中 1 次，全通过才写盘）。

---

## 八、落款说明

- **拍板人**：本轮由 AI 代用户拍板（用户原话「round-120你选一个，round-131你来选择处理」），**2026-10-09 经用户追认**（§九）。
- **未发布**：本轮只动源码与文档，**未 bump 版本、未 tag**。
- 本轮的 5 例新单测与 2 项契约均**反跑证明非空**（§4.2）。

---

## 九、用户裁决（2026-10-09）

上一轮呈报的三条待办，用户最终裁决（原话「待办 6 不做，待办 7 就按照你的来」）：

| 待办 | 用户裁决 | 代码影响 |
| --- | --- | --- |
| 待办 7 · round-120 空状态文案 | **按本轮口径执行**（追认） | **无**——`aca0ab18` 即为最终形态 |
| 待办 7 · round-131 fileId 图片占位 | **按本轮口径执行**（追认） | **无**——同上；完整 fileId→字节解析仍待上游协议（§3.3） |
| 待办 6 · 造大线程量回滚成本 | **不做** | **无**——从待办队列移除 |

**待办 6 判「不做」的依据**（用户原话「我没有很懂」→ 解释语义后裁决放弃）：

1. **核心命题已被 round-131 证死**：`rollback` 读取的代价与线程体量**无关**（按 `path` / 按 id 取回是毫秒、千字节级），
   且 0.160.1 起上游**官方推荐**的正是「元数据读 + 分页」形态；绝对成本的具体数值不改变该结论。
2. **「造大线程」的三条路径全部无效**（round-131 §四已记）：膨胀 rollout 正文（轮次条目**不是**从 rollout 现读）、
   拷 home（**拷 home 不是隔离**——副本 sqlite 记 rollout 绝对路径）、`thread/inject_items`（只进「模型可见历史」，
   **不进** `thread/read` / `turns/list` 的条目存储）。
3. **唯一可行路径成本高且有副作用**：需真实模型跑出 20~30 轮大输出线程；而 `thread/resume` 会向**真实** rollout
   追加记录（round-136 实测 +3.2KB/次），还须额外做还原。
4. **真正量到的大成本在另一条轴**：`resume` 解析一条 19MB rollout ≈ **22s/次** —— 要在性能上投入，那里收益高得多。

⇒ 待办 6 **关闭（won't do）**，不再于后续轮次的「未处置」里续挂。
