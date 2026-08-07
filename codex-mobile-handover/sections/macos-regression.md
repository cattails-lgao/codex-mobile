# macOS 侧跨平台回归（2026-08-07）

> **2026-08-07 进展：** macOS 侧跨平台回归验证完成，4 项全部通过；期间修复 1 个 macOS 特有单测环境性失败（commit `04f470b`，已提交、未推送）。环境：macOS（`/var` 为 `/private/var` 符号链接）+ Node v26.3.1 + pnpm 11.18.0。

1. **依赖安装**：首次 `pnpm install` 成功（8.3s），`pnpm-workspace.yaml` 的 `allowBuilds` 完整覆盖（esbuild/node-pty/protobufjs/@firebase/util 均正常构建），**无新的「Ignored build scripts」警告**；`node-pty` postinstall 在 macOS 上按预期跳过（由 `scripts/fix-pty-native-build.cjs` 处理）。交接文档「依赖安装历史」验证点通过
2. **`vue-tsc --noEmit`**：通过，无类型错误
3. **`vite build`**：成功（2.75s，仅 chunk 体积提示非错误）；**`tsup` CLI 构建**：成功（52ms）
4. **全量单测**：306/306 通过（25 个测试文件）——Windows 侧 2 个环境性失败（`codexAppServerBridge.archive.test.ts` 的 symlink EPERM 与 chmod 权限位）在 macOS 上不存在；macOS 特有 1 个环境性失败已修复

> **测试修复（commit `04f470b`）**：`codexAppServerBridge.archive.test.ts` 的「persists workspace roots in canonical form」在 macOS 上失败——测试用 `mkdtemp(tmpdir())` 构造期望路径 `/var/folders/.../storage/projects/demo`，而实现内部对工作区根做 `realpath` 规范化，macOS 上 `/var` 是指向 `/private/var` 的符号链接，realpath 后写入 `/private/var/folders/...`，与未规范化期望值不匹配（Linux/Windows 无此符号链接故不触发）。修复：断言基准改为先 `mkdir` 再 `realpath` 的规范路径，与实现写入形式一致；该文件 32 个测试全部通过。属测试断言加固，不涉及产品代码。

> **macOS 环境补充（2026-08-07，启动服务实测）**：macOS 侧首次启动时发现本机无 codex CLI（`resolveCodexCommand()` 三处候选全空），已 `npm install -g @openai/codex` 安装 codex-cli 0.147.0（npm registry 为国内镜像 npmmirror，5s 完成；npm 全局 bin 在 TRAE 环境的 `npm-global/bin`，需前置进 PATH）；启动命令与 macOS 差异见「启动方式 → macOS」。GitHub 认证：TRAE 的 Git 扩展登录后凭据写入系统 keychain（`credential.helper osxkeychain`），命令行 git 直接复用——`git -c http.version=HTTP/1.1 -c http.proxy=socks5h://127.0.0.1:7890 -c https.proxy=socks5h://127.0.0.1:7890 push origin main` 实测可用（直连 GitHub 443 超时，需走本机 FlClash 代理；FlClash 由 CuteCloud/FlClashCore 提供，代理端口以进程存活为准）。

