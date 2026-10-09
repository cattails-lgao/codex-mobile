# round-138：fileId 图片从「占位」推进到「能解析就出图」＋ audio/localAudio/mention 补可见面（＋ 待办 4 的凭据泄漏归属与外包）

> 承接：用户「**待办1/2，待办4，你都一并处理不行吗**」—— 一次收口三条积压：
> 待办 1（round-137 §六①「完整 fileId → 可渲染内容」）、待办 2（round-137 §六②
> 「`mention` / `audio` / `localAudio` 的可见化」）、待办 4（OAuth 泄漏凭据的上游归属与外包路径）。
> 用户另就待办 4 的**上游私信**明确裁决「**先不发**」（§五）。
>
> 基线：`5a1f6395`（round-137 末次提交）。本轮**未发布**（未 bump、未 tag）。

---

## 一、结论先行

| 项 | 本轮决定 | 一句话依据 |
| --- | --- | --- |
| 待办 1 fileId 图片 | **按「值的形态」机会性解析**：命中出真图、未命中保持 round-137 的占位 | round-137 的「协议不可行」**推理有漏**——没有内容端点**恰恰**意味着客户端必须把可解析内容写进 `payload`（§二） |
| 待办 2 audio / localAudio / mention | 三类**各开一个可见面**（播放器 / 本地文件代理 / @提及 chip） | 与 round-137 的 fileId 图片**同因**：`rawBlocks` 在 UI 上**没有渲染分支**、空正文又被省略 ⇒ 无可见面可兜（§三） |
| 待办 4 OAuth 泄漏 | **归属已定案**（上游 `friuns2/codex-mobile` 的 `.env`）＋ 外包路径已写死；**动作按用户裁决暂停** | `gh api` 的 fork 关系 + 上游该 ref 仍返回明文（§五） |

证据：`vue-tsc` **EXIT=0**；全量 **802/802（78 文件）**（= round-137 基线 777 ＋ 25）；
契约 **50 → 52**；`vite build` **EXIT=0** / `tsup` **EXIT=0**；反跑（**保留断言、只回退生产代码**）
⇒ **2 项契约 + 17 例单测转红**，还原后 **6 文件逐字节一致**（§四）。

---

## 二、待办 1：fileId 图片的机会性解析（推翻 round-137 的「协议不可行」）

### 2.1 round-137 的判定，与它漏掉的一环

round-137 §3.3 判定「完整 fileId → 字节/URL **在 0.161.0 协议上不可行**」，依据是：

| 事实（round-137） | 证据 |
| --- | --- |
| 附件面只有三个方法 | `thread/attachment/add` \| `/list` \| `/remove` |
| `list` 返回元数据 | `ThreadAttachmentListResponse = { data: ThreadAttachment[], nextCursor }` |
| `payload` 是 opaque 的 | `ThreadAttachment = { id, attachmentType, identityKey, payload: JsonValue, createdAt }` |
| 没有内容取回端点 | 全 schema 搜 `attachment` 只有上述三个方法 |

这四条**本轮复核后依然成立**（本轮另把 167 个 client method 全枚举了一遍，确无内容端点；
并在 332MB 的 `codex.exe` 里搜 `attachment-store` / `fileId` / `data:image` 等字串，
未发现任何「客户端可用」的内容取回通道）。**但由这四条并不能推出「不可行」**——

### 2.2 本轮取证：`thread_attachments` 是**纯客户端写的 KV**

本轮直接看落盘结构（`node:sqlite`，只读，2026-10-09 复核）：

```
CREATE TABLE "thread_attachments" (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    attachment_type TEXT NOT NULL,
    identity_key TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    UNIQUE (thread_id, attachment_type, identity_key)
)
```

**本机 `select count(*)` = 0 行**（本 home 从未写过附件）。

推论链：`payload` 是 **`TEXT NOT NULL`** 的 **opaque JsonValue**，而协议**没有**内容端点
⇒ **任何客户端想让这张附件对用户有意义，就只剩一条路：把可解析的内容放进 `payload`**
（否则这条记录对谁都没用）。**所以「payload 里有可渲染源」不是猜想，而是这个存储形状的必然结果。**

⇒ **识别策略＝不猜字段名，只认「值的形态」**：

| 值的形态 | 判定 |
| --- | --- |
| `data:image/*` / `data:video/*` 内联数据 URL | 直接当源 |
| `http(s)://…` | 直接当源 |
| `file://…` 或**绝对路径**（Windows 盘符 / UNC / POSIX）且扩展名在本地图片白名单内 | 换成本仓既有的 `/codex-local-image?path=` 代理 |

命中即把该 block 重写成既有渲染分支认识的 `{ type:'image', url }`。

### 2.3 实现

**新增模块 `src/server/bridge/threadAttachmentImageSources.ts`**（约 200 行）：

| 导出 | 职责 |
| --- | --- |
| `THREAD_ATTACHMENT_LOOKUP_LIMIT = 200` | 一次 `thread/attachment/list` 的上限（与 turn 页钳位同量级） |
| `toRenderableMediaSource(value)` | **纯值形态**判定：返回 `<img src>` 可用值或 `null`（上表三条规则；`data:` 需 `^data:(image\|video)/`） |
| `extractRenderableAttachmentSource(payload)` | 在 payload 里 BFS 找第一个可渲染源（`MAX_PAYLOAD_NODES=200` / `MAX_PAYLOAD_DEPTH=6`，有界） |
| `resolveFileIdImageBlocksInThreadResult(result, listAttachments)` | 主入口（下） |

模块内私有件：`LOCAL_IMAGE_EXTENSIONS`（16 个扩展名，与 `httpServer.ts` 的 `IMAGE_CONTENT_TYPES`
**对齐**）、`buildFileIdSourceMap`（**同时**以 `attachment.id` 与 `identityKey` 建索引——两者都可能是
block 里的 `fileId`）、`collectFileIdImageBlocks`（BFS 收集 `{type:'image', fileId}` 且
**`record.url === undefined`**，深度上限 12）、`stripFileUrl`（`file:///C:/x.png` → `C:/x.png`）。

主入口的三道**短路**，保证「没得解析时零成本」：

1. `collectFileIdImageBlocks(result)` 为空 ⇒ **一次 RPC 都不发**，原样返回；
2. 结果里取不到 `thread.id` ⇒ 原样返回；
3. `listAttachments` 抛错 ⇒ **吞掉**（best-effort），原样返回；
   `sourceByFileId` 为空 ⇒ 原样返回。

命中才就地把 block 改写成 `{ type:'image', url }`（`delete block.fileId`）。**改写是幂等的**：
已改写的 block 不再带 `fileId`，第二趟 `collectFileIdImageBlocks` 直接返回空 ⇒ 早退。

**接入桥层**（`src/server/codexAppServerBridge.ts`）：新增**模块级**函数
`resolveThreadReadFileIdImages(appServer, result)`，把附件查询包成
`appServer.rpc('thread/attachment/list', { threadId, limit })`；两个注入点（rpc 管道 +
`handleThreadHttpRequest`）都改成 `sanitizeThreadTurnsInlinePayloads` 的**后置一趟**：

```ts
sanitizeThreadTurnsInlinePayloads: async (method, result) =>
  resolveThreadReadFileIdImages(appServer, await sanitizeThreadTurnsInlinePayloads(method, result)),
```

> 为什么放**模块级**而不是注入点闭包内：这是第一版的编译错误——把它写成 `/codex-api/rpc` 块里的
> `const`，下游 `handleThreadHttpRequest` 那一处就在作用域外（`TS2304`）。抽到模块级后两处共用。

### 2.4 严格单调（本轮的不可退让点）

| 情形 | 行为 |
| --- | --- |
| 命中可渲染源 | **出真图**（相对 round-137 严格变好） |
| 未命中（payload 里没有可渲染源 / 查表失败 / 没 fileId） | **保持 round-137 的虚线「不可预览」占位**（不退化） |
| 同时带 `url` 与 `fileId` 的块 | 只按 `url` 出图（`collectFileIdImageBlocks` 要求 `record.url === undefined`；round-137 单测继续钉住） |

---

## 三、待办 2：audio / localAudio / mention 的可见面

### 3.1 根因（与 round-137 的 fileId 图片同因）

`parseUserMessageContent` 把「本仓没显式处理的 block」推成 `rawBlocks`（带 `isUnhandled: true`）。
而 **`rawBlocks` / `isUnhandled` 在 UI 上没有任何渲染分支**——全库唯一消费点
（`useDesktopStateUtils.ts:231`）只用于**等值比较**，不产生 DOM；同时
`shouldOmitEmptyGenericMessage` → `hasMessageBodyContent` 对「无 text / images / fileAttachments /
skills」的消息返回 true（**省略**）。两条叠加 ⇒ audio / localAudio / mention 的用户消息
**在历史里静默消失**。⇒ 必须**新开可见面**，把字段加进 `UiMessage` 而不管渲染是**空操作**。

### 3.2 实现

| block | 可见面 | 备注 |
| --- | --- | --- |
| `{type:'audio', url}` | `<audio controls preload="metadata" :src>` | 内联 `data:audio/*` 与远程 URL 都直接给源 |
| `{type:'localAudio', path}` | 同上，源换成 **`/codex-local-file?path=`** 代理 URL | 与该端点「直接打开本地文件」同一条既有通道 |
| `{type:'mention', name, path}` | `message-file-chip message-mention-chip` 的 **`@name`** chip | `path` 只作 `title` 提示 |

`UiMessage` 新增 `audioSources?: string[]` 与 `mentions?: Array<{ name: string; path: string }>`；
`hasMessageBodyContent` 把两者计入「有正文」；`toUiMessages` 的
**`hasRenderableUserContent`** 也补上两者——否则「只发了一条语音」或「只 @了一个文件」的
用户消息会被**整条丢掉**（这是本轮实测抓到的一个真实缺陷：只改 `hasMessageBodyContent`
不够，还有第二道闸）。

**兜底改法（避坑）**：原来判「未处理」是长 `!==` 链，把 8 个变体全排掉后 TS 会把联合
**收窄成 `never`**（`TS2339: Property 'type' does not exist on type 'never'`）。改为
`HANDLED_USER_INPUT_TYPES = new Set<string>([...])` + `const blockType: string = block.type` + `!has(blockType)`。
`rawBlocks` **保留**（将来协议新增变体不会静默丢数据），但注释已写明「UI 没有 rawBlocks 渲染分支，
新增变体仍须显式接入」。

**防回归**：`v2.test.ts` 新增用例「**gives every UserInput variant a visible surface**」，
遍历 `UserInput` **全部 8 个变体**（text / image(url) / image(fileId) / localImage / audio /
localAudio / skill / mention），逐个断言「恰好产生 1 条消息且 `isUnhandled` 为 undefined」。
将来协议加第 9 个变体而没接入，这条会红。

---

## 四、验证

### 4.1 基线

| 闸门 | 结果 |
| --- | --- |
| `vue-tsc --noEmit` | **EXIT=0**（0 错误） |
| 全量 Vitest | **802/802 通过（78 文件）**（= round-137 基线 777 ＋ 本轮 25） |
| `check-ui-contract.cjs` | **52/52**（50 → 52，新增 2 项） |
| `vite build`（生产构建） | **EXIT=0**，`✓ built in 1m 30s`（仅既有 chunk >500kB 提示） |
| `tsup`（`dist-cli`） | **EXIT=0**（本轮改了 `src/server/**`，必须重建） |

本轮 25 例增量的落点：**新增模块单测 19 例**（`threadAttachmentImageSources.test.ts`：
`toRenderableMediaSource` 8 / `extractRenderableAttachmentSource` 4 /
`resolveFileIdImageBlocksInThreadResult` 7）、`v2.test.ts` +4（audio-only、localAudio→代理、
mention-only、**全变体可见**）、`messageContent.test.ts` +2（audio-only / mentions-only 不被省略）。

### 4.2 反跑（决定性，证明新断言非空）

**做法**：**保留**新写的契约项与单测，**只把 5 个生产文件回退到改动前**（`tmp/r138-*.bak`，
本轮改为**直接从 `HEAD` 导出**以保证基线可信），并把新增模块换成「功能关闭」桩
（三个导出签名仍在、解析能力拿掉），复跑。

```
flip OFF ⇒ 契约: 2 项失败 (50/52)
  FAIL  fileId 图片：按值形态机会性解析…（round-138）  (无 fileId 零 RPC=NO / 按值形态识别=NO / 复用本地代理=NO / 扩展名白名单=NO / 查表失败静默=NO / 命中才改写=NO / 接入桥层=NO)
  FAIL  audio / localAudio / mention 都有可见面…（round-138）  (audio=NO / localAudio=NO / mention=NO / 集合兜底=NO / 类型字段=NO / 计入可见正文=NO / 非空消息判定=NO / 渲染播放器=NO / 渲染提及=NO)

flip OFF ⇒ 定向单测: Test Files 3 failed (3) / Tests 17 failed | 37 passed (54)
flip ON  ⇒ 6 个文件与 ON 快照逐字节一致（`same` ×6）/ 契约 52/52 / 定向 54/54
```

> 沿用 round-137 的教训：**回退生产代码、保留断言**。把断言一起回退＝「断言不存在」＝**空过**。

### 4.3 静态契约新增的 2 项（50 → 52）

1. **fileId 图片：按值形态机会性解析，命中出图 / 未命中保持占位（round-138）**：
   `无 fileId 零 RPC` / `按值形态识别` / `复用本地代理` / `扩展名白名单` / `查表失败静默` /
   `命中才改写` / `接入桥层` **七项同时成立**。
2. **audio / localAudio / mention 都有可见面，不再静默消失（round-138）**：
   `audio` / `localAudio` / `mention` / `集合兜底` / `类型字段` / `计入可见正文` /
   `非空消息判定` / `渲染播放器` / `渲染提及` **九项同时成立**。

### 4.4 未 bump `SHARED_BRIDGE_VERSION`（本轮**有意**，含论证）

`SHARED_BRIDGE_VERSION`（现 `experimental-api-v7`）的**唯一**作用是：
dev 重启时 `getSharedBridgeState()` 决定是否**复用**上一进程留下的
`{appServer, terminalManager, …}`。看它的版本注释，历次 bump 全部对应**共享对象本身**变了
（round-86 加 `readBoundedThreadTurnPage`、round-102 加能力位、round-116 改
`ThreadTerminalManager` 构造参数、round-136 给链加 `hydrate/snapshot` 并持有落盘定时器）。

本轮**只**新增了一个**无状态**模块 + 改了 `createCodexBridgeMiddleware()` 里的响应管道。
而 `configureServer()`（`vite.config.ts:141`）每次 dev 重启都会**重新调用**
`createCodexBridgeMiddleware()` ⇒ **新管道必然生效**，与版本号无关；版本号也**无法**覆盖
「进程没重启」这种情形（那时 `getSharedBridgeState()` 根本不执行）。
⇒ 本轮**不 bump**（bump 会是无意义的 v7→v8）。

---

## 五、待办 4：OAuth 泄漏凭据的归属与外包（动作按用户裁决暂停）

### 5.1 归属已定案（不再是推测）

| 事实 | 证据（`gh api`，2026-10-09） |
| --- | --- |
| 本仓是 **fork** | `repos/cattails-lgao/codex-mobile` → `fork: true`，`parent`/`source` = **`friuns2/codex-mobile`** |
| 泄漏提交是**上游**的 | `3cecaa60` "Add GitHub OAuth env vars for web login"（2026-03-13） |
| 上游该 ref **至今可读** | `repos/friuns2/codex-mobile/contents/.env?ref=3cecaa60` 仍返回明文 client id + secret |
| OAuth App 名 | **`codexui`**（授权页渲染 "to continue to codexui"） |
| 上游 owner | `friuns2` = Igor Levochkin，公开邮箱 `igor.levochkin@deltacygnilabs.com`，公司 BrutalStrike，博客 `aidark.net` |
| 上游**未开**私密漏洞报告 | `security_and_analysis` 为空 ⇒ **只能走私信/站外**，**不得**开公开 issue |

### 5.2 已排除的手段（都救不了这个 case）

secret scanning（只**检测**、不回扫历史）、`revoke credentials` API（只认
`ghp_`/`github_pat_`/`gho_`/`ghu_`/`ghr_` 类 token，**不是** OAuth client id+secret）、
DMCA（只有数据权利人能提）、**再改写一次历史**（改不动**上游**的存储）。
⇒ 只剩**两个人类动作**：

- **(a)** 私信上游，请其**轮换/删除** OAuth App `codexui`（凭据非用户所有 ⇒ 只能由归属方轮换）；
- **(b)** 提 **GitHub Support 工单**，请其回收**两个仓库**里「重写后已不可达但未 GC」的历史对象。

### 5.3 用户裁决与本轮产出

用户就 **(a)** 明确裁决「**先不发**」。⇒ 本轮**只产出交付物、不发起任何外发动作**：

| 文件 | 内容 |
| --- | --- |
| `tmp/r138-upstream-notice.md` | 给上游维护者的**私密英文通报**草稿（收件人 `igor.levochkin@deltacygnilabs.com`） |
| `tmp/r138-github-support-draft.md` | 覆盖**两个仓库**的 Support 工单草稿 |
| `tmp/r138-oauth-upstream-evidence.txt` | 上游泄漏 + 归属的完整取证（供工单引用） |

> 注：**(b) 只能由用户提交**（需要其 GitHub 账号与受影响仓库的所有权上下文）。
> `tmp/` 不入库、不入提交，故这三份草稿**只在本机**；内容与结论已同步到本文档。

---

## 六、诚实边界

1. **fileId 解析的「命中」路径没有端到端真机证据。** 本机 `thread_attachments` **0 行**
   （本 home 从未写过附件），因此「命中 ⇒ 出真图」只由**合成 payload 的单测**证明，
   **没有一条真实 CLI 写出的附件**跑过。值形态判定是本存储形状下**唯一不用猜字段名**的
   合法做法，但**真实命中率未测**（取决于 CLI 是否/如何写 payload）。
2. **`/codex-local-image` 与 `/codex-local-file` 的语义差异是有意的**：前者有扩展名白名单，
   后者没有。`localAudio` 走后者 ⇒ 比 `localImage` **宽松**（沿用既有「打开本地文件」通道的语义）。
3. **浏览器类闸门**：本轮新增的 3 条样式（`.message-audio-attachments` /
   `.message-audio-player` / `.message-mention-chip`）已由同日的
   `scripts/check-message-media-surfaces.cjs` 在真机浏览器上量过（**§十**，44 项，含暗色对比度
   与超长名截断）。仍**没有**覆盖的：真实硬件上的 audio/mention 输入（§10.2）、
   round-137 的 fileId 占位 chip 在暗色下的单独采样、播放器能否真的出声（§10.6）。
4. **mention chip 只显示 `name`**，`path` 仅在 `title` 里；长名字是否截断未验证。
5. **待办 4 的动作未执行**：私信**用户裁决不发**；(b) 工单**未提交**（需用户）。凭据**仍未轮换**。
6. **未 bump `SHARED_BRIDGE_VERSION`**，论证见 §4.4。
7. **未发布**：未 bump 版本、未 tag；npm `latest` 仍 `0.1.127`。

---

## 七、未处置 / 待办

| # | 项 | 谁能做 |
| --- | --- | --- |
| 1 | **发布**：npm `latest` 仍 `0.1.127`（用户 token 401），`v0.1.128` tag 已指向重写后提交 | **需用户** |
| 2 | **GitHub Support 工单**（回收重写前的不可达对象，覆盖两个仓库）：草稿 `tmp/r138-github-support-draft.md` | **需用户提交** |
| 3 | **上游私密通报**（请 `friuns2` 轮换/删除 OAuth App `codexui`）：草稿 `tmp/r138-upstream-notice.md`。**用户裁决「先不发」** | **需用户**（已暂缓） |
| 4 | **fileId 解析的真实命中例**：等出现一条「payload 里含可渲染源」的真实附件后再端到端复核（§六①） | 可做（前提是拿到真实样本） |
| 5 | ~~**audio / mention 面的浏览器级闸门**：暗色对比度与长名截断~~ → **同日已完成**（§十）：`scripts/check-message-media-surfaces.cjs`，44 项 | **已做** |
| 6 | round-137 §六① 的「等上游给内容端点」：本轮已用「值形态」绕开，**不再需要** | — |

---

## 八、涉及文件 + 复现方式

**改动（提交 `5fd35be9`：10 文件，+659 / −7）** = **8 个既有文件**（合计 +285/−7）＋ **2 个新文件**（合计 374 行）

- **新增** `src/server/bridge/threadAttachmentImageSources.ts`（+200）：机会性解析模块
- **新增** `src/server/bridge/threadAttachmentImageSources.test.ts`（+174，19 例）
- `src/server/codexAppServerBridge.ts`（+29/−2）：模块级 `resolveThreadReadFileIdImages` + 两个注入点后置一趟
- `src/api/normalizers/v2.ts`（+60/−4）：`HANDLED_USER_INPUT_TYPES` / `toLocalFileUrl` / `audioSources` / `mentions` / `hasRenderableUserContent`
- `src/types/codex.ts`（+7）：`UiMessage.audioSources?` / `mentions?`
- `src/utils/messageContent.ts`（+2）：计入可见正文
- `src/components/content/ThreadConversation.vue`（+37）：`<audio>` 播放器 + @提及 chip + 3 条新样式
- `src/api/normalizers/v2.test.ts`（+73/−1）、`src/utils/messageContent.test.ts`（+8）：单测
- `scripts/check-ui-contract.cjs`（+69）：2 项契约（50 → 52）
- **追办（§十，同日）**：`scripts/check-message-media-surfaces.cjs`（**新增** 403 行）：
  audio / localAudio / mention 的浏览器级闸门，44 项

**复现命令**

```bash
NODE="C:/Users/19155/.workbuddy/binaries/node/versions/22.22.2-6/node.exe"

# 1) 静态与全量
"$NODE" node_modules/vue-tsc/bin/vue-tsc.js --noEmit
"$NODE" node_modules/vitest/vitest.mjs run
"$NODE" scripts/check-ui-contract.cjs

# 2) 反跑（保留断言、只回退生产代码 ⇒ 2 项契约 + 17 例单测转红；再还原）
"$NODE" tmp/r138-flip.cjs snapshot   # 先把当前状态存成 *.on
"$NODE" tmp/r138-flip.cjs off        # 5 生产文件 <- HEAD（*.bak）+ 模块换功能关闭桩
"$NODE" tmp/r138-flip.cjs on         # 还原并逐字节核对

# 3) 生产构建（改了 src/server/** ⇒ dist 与 dist-cli 都要重建）
#    emptyDir 被沙箱 shim 拦（genie-trash ETIMEDOUT）⇒ vite build 须沙箱外跑
"$NODE" node_modules/vite/bin/vite.js build
"$NODE" node_modules/tsup/dist/cli-default.js

# 4) 浏览器级闸门（audio / localAudio / mention 面，44 项；SKIP 退 2）
#    起桥 + 等就绪 + 跑闸门 + 杀进程树必须在同一个 shell 会话内（§10.5）
bash tmp/r138-run-media-gate.sh
```

**探针 / 草稿（`tmp/`，未入库）**：`r138-flip.cjs`、`r138-bridge-apply.cjs`、`r138-bridge-fix.cjs`、
`r138-ui-apply.cjs`、`r138-sqlite.cjs`（复核 `thread_attachments`）；待办 4 的三份草稿见 §5.3。

---

## 九、落款说明

- **未发布**：本轮只动源码与文档，**未 bump 版本、未 tag**。
- 本轮 **25 例新单测**与 **2 项契约**均**反跑证明非空**（§4.2）；
  追办的**浏览器级闸门 44 项**同样反跑（§10.4：破坏生产 CSS ⇒ 14/44 转红）。
- **`SHARED_BRIDGE_VERSION` 未 bump** 是**有意的**（§4.4）。
- 待办 4 本轮**只做取证与草拟**，外发动作按用户裁决「先不发」**未执行**（§5.3）。

---

## 十、追办：audio / mention 面的浏览器级闸门（2026-10-09 当日追加）

§六③ / §七⑤ 记的「浏览器类闸门本轮未跑」在**同一天内补上了**。新增
`scripts/check-message-media-surfaces.cjs`：**44 项断言 × 4 个场景**（亮/暗 × 桌面 1440 / 窄屏 390）。

### 10.1 为什么必须量浏览器

§三 给 audio / localAudio / mention 开的可见面，当时的证据只有两种：`check-ui-contract`（读源码
文本，看得见「写了什么」、看不见「渲染成什么样」）与 `v2.test.ts`（跑在 Node 里，**没有 CSS**）。
于是「暗色下对比度够不够」「超长名字会不会撑破布局」这两件事**根本没被量过** —— 它们只能量浏览器。

### 10.2 做法：拦 RPC，不造假 DOM

本机 `thread_attachments` 是 **0 行**（§2.2），**没有任何一条真实 CLI 写出的 audio / mention 输入**。
所以不去找真实线程，而是在浏览器层用 `page.route` **拦下 `thread/read` 与 `thread/resume`**，
回一份合成的 thread（一条 `audio`（data URL）+ 一条 `localAudio`（走 `/codex-local-file` 代理）放一轮；
短名 + 超长名两条 `mention` 放另一轮），**其余 RPC 一律透传**，让应用像连真服务一样启动。

被检验的因此是**真实管线**（归一化 → UiMessage → 组件 → CSS），**只有数据是合成的**。
这条边界是刻意保留的：它**不等于**「真实线程验证」。

### 10.3 量出来的两个事实（都不是靠读 token 推的）

| 场景 | chip 前景 / 背景 | 对比度 | 超长名 |
| --- | --- | --- | --- |
| light | `#3f3f46` on `#f7f7f9` | **9.76:1** | scroll 828 / client 192，`nowrap+hidden+ellipsis` |
| dark | `#d4d4d8` on `#3f3f46` | **7.07:1** | 同上 |

- **暗色不是组件自己算出来的**：`src/style.css:1275` 有一条全局
  `:root.dark .message-file-chip { @apply border-line-3 bg-s3 text-ink-3; }`，mention chip 复用了
  `.message-file-chip` 于是吃到它。**照 token 表反推会得到 15.7:1（`ink-2` on `s0`），真机是 7.07:1**
  —— 又一次「采样点＝真实可见范围」，不要用 token 反推。
- `<audio controls>` 在 1440 与 390 下都是 **300×32**（`max-w-full` 在窄屏没有把它压成 0）。

### 10.4 反跑（证明 44 项非空）

`tmp/r138-flip-media.cjs off` **只改两处生产 CSS、闸门一行不动**：
① 去掉 `.message-file-chip-name` 的 `truncate max-w-48`；② `.message-file-chip` 的
`text-ink-2` → `text-ink-4`（token 表注明 `ink-4` **仅用于非文本**）。重建前端后：

**14/44 转红** ＝ 3 条截断断言 × 4 场景 ＋ 亮色对比度 2 个场景（实测 **2.28:1**，与「掉到 4.5 以下」的预期一致）。

还原后源文件**逐字节相同**（`identical=true`）、重建后 **44/44 全绿**。

### 10.5 环境陷阱（本轮踩到，值得记）

这台机器的 agent shell 带着 WorkBuddy 自己的 `http_proxy=http://127.0.0.1:57298`：

- `curl http://127.0.0.1:<port>/` 会被送去**代理**，稳定拿到 **502 Bad Gateway**
  （body 是 `upstream connect failed: ... (os error 10061)`）—— 看起来像「服务没起来」，
  **实际是代理在挡**。正确姿势：`curl --noproxy '*'`；加了这个参数后 `000` 才是真的没人听。
- **Playwright 会把代理透给浏览器**，于是对 127.0.0.1 的导航也会 502 ⇒ 闸门会把「代理在挡」
  误判成 SKIP。闸门因此在启动浏览器前**删掉 `http_proxy/https_proxy/...` 并加 `--no-proxy-server`**。
- **后台 bash 一结束，它拉起的桥会被回收** ⇒ 起桥 + 等就绪 + 跑闸门 + 杀进程树**必须在同一个
  shell 会话里**（`tmp/r138-run-media-gate.sh`）。

### 10.6 仍然没覆盖的

- 仍**不是**真实线程验证（§10.2）：真实硬件上依旧没有任何 audio / mention 输入。
- round-137 的 fileId 占位 chip（`.message-image-attachment-chip`）在暗色下**没有单独采样** ——
  它共用 `.message-file-chip`、吃同一条暗色覆盖，但本轮采样点只挂了 mention chip。
- 播放器**能不能真的出声**没有验：只验了元素、`src` 与占位尺寸（44 字节空 WAV + `preload="metadata"`）。
