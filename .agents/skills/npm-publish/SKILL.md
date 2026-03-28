---
name: npm-publish
description: 用于本仓库的 npm 发布流程。当用户提到发布到 npm、发包、npm publish、发布 latest、验证 npm 包版本或准备 npm release 时使用。优先复用仓库现有的 publish.sh 与 package.json 配置，而不是临时手写发布步骤。
---

# NPM Publish

仅用于本仓库 npm 包 `@nervmor/codexui` 的发布与发布前检查。

## 目标

基于仓库当前配置，安全完成以下其中一种任务：

- 仅检查当前包是否可发布
- 准备一次 npm 发布并说明将发布的版本
- 实际发布到 npm
- 发布后验证 npm registry 上的版本与 dist-tag

## 触发条件

当用户提到以下意图时使用：

- 发布到 npm
- 发 npm 包
- npm publish
- 发布 latest
- 检查当前版本能否发布
- 验证 npm 上的最新版本

## 固定上下文

- 包名来自 `package.json`，当前仓库应为 `@nervmor/codexui`
- 发布脚本为仓库根目录的 `publish.sh`
- `publish.sh` 会：
  - 读取本地 `package.json` 的 `name` 与 `version`
  - 读取 npm registry 上的 `dist-tags.latest`
  - 取本地版本与已发布版本中的较大者，再自动递增 patch
  - 执行 `npm run build`
  - 执行 `npm publish --access public`

不要绕过现有脚本重新拼装一套发布命令，除非用户明确要求修改发布流程本身。

## 执行流程

### 1. 先确认当前意图

区分用户是要：

- 只做发布前检查
- 真正执行发布
- 发布后做 registry 验证

如果用户表达不清，但明显提到“发布”，默认按“实际发布”处理。

### 2. 发布前检查

至少检查以下内容：

```bash
git status --short
sed -n '1,220p' package.json
sed -n '1,220p' publish.sh
npm view "$(node -p "require('./package.json').name")" dist-tags.latest version 2>/dev/null || true
```

检查重点：

- 工作区是否有未提交改动
- `package.json` 中的 `name`、`version`、`files`、`bin`、`publishConfig.access`
- `publish.sh` 是否仍与当前发布策略一致
- npm registry 上是否已有更高版本

如果用户只要求“检查”或“准备发布”，到这里可以先汇报结论，不要擅自真正发布。

### 3. 实际发布

发布时优先直接执行：

```bash
bash publish.sh
```

只有在 `publish.sh` 明显失效、且为了完成用户要求必须修复发布流程时，才允许先修改脚本，再重新执行。

### 4. 发布后验证

发布完成后至少验证：

```bash
npm view "$(node -p "require('./package.json').name")" dist-tags.latest version
```

必要时补充：

```bash
npm pack --dry-run
```

用于确认最终发布内容与入口文件是否合理。

## 结果汇报要求

结果中应明确说明：

- 本次是“仅检查”、“准备发布”还是“已实际发布”
- 发布使用的是仓库现有 `publish.sh`，还是对流程做了修复后再发布
- 发布前本地版本、registry 最新版本、最终发布版本
- 发布后 `latest` 是否已指向预期版本

如果发布失败，要说明失败命令、失败阶段和下一步阻塞点。

## 与仓库规则的关系

- 如果为了发布修改了仓库代码或发布脚本，完成后仍要遵循仓库默认收口：`npm run build`，并重启 `4173` 的 `tmux` 会话
- 如果用户要求验证 `npx` 行为，先发布，再验证已发布的 `@latest` 包；不要用本地未发布结果代替
- “push” 在本仓库语境下不等于推送远端；除非用户明确要求，否则不要执行远端推送
