---
name: upstream-sync-curator
description: 用于这个仓库中“先分析 upstream 提交与代码变更，再按功能主题选择性引入 upstream 变更；所有操作在临时 worktree 中完成，并在难解冲突时优先保留当前 fork 实现”。当用户提到 upstream sync、同步源仓库、选择性合并 upstream、分析上游提交、挑功能合并等意图时使用。仅适用于 nervmor/codexui 与其上游 friuns2/codexUI。
---

# Upstream Sync Curator

仅用于本仓库 `nervmor/codexui` 与上游 `friuns2/codexUI` 之间的选择性同步。

固定上游地址：

```bash
https://github.com/friuns2/codexUI.git
```

不要直接同步整个 upstream。
固定执行“两阶段”流程：先分析 upstream 提交与代码变更，按功能主题整理候选变更；再根据用户选中的功能主题做选择性引入。

## 触发条件

当用户提到以下意图时触发：

- upstream sync
- 同步源仓库
- 选择性合并 upstream
- 分析上游提交
- 挑功能合并

仅适用于本仓库及其 upstream `friuns2/codexUI`。

## 第 1 阶段：准备环境

1. 检查主工作区是否干净。
   如果主工作区不干净，先停止并让用户决定如何处理，不要把已有修改卷入 upstream 同步流程。

```bash
git status --short
```

2. 检查 `origin` 是否指向当前 fork `nervmor/codexui`。

```bash
git remote -v
```

3. 配置或校验 `upstream`，并强制使用 HTTPS 地址，不要使用 SSH。

```bash
git remote get-url upstream
git remote remove upstream
git remote add upstream https://github.com/friuns2/codexUI.git
```

4. 创建带时间戳的临时分支和临时 worktree，避免污染主工作区。

```bash
ts="$(date +%Y%m%d-%H%M%S)"
tmp_branch="upstream-sync-${ts}"
tmp_dir="$(mktemp -d -t codexui-upstream-sync-XXXXXX)"
git worktree add -b "${tmp_branch}" "${tmp_dir}" main
```

5. 后续所有 `fetch`、`log`、`diff`、`cherry-pick`、`merge` 都只在临时 worktree 内执行。
   不要在主工作区直接做任何 upstream 分析或引入操作。

## 第 2 阶段：分析 upstream 变更

1. 在临时 worktree 中获取最新的 `origin/main` 和 `upstream/main`。

```bash
cd "${tmp_dir}"
git fetch origin main
git fetch upstream main
```

2. 计算当前 fork 与 upstream 的 `merge-base`。

```bash
base_commit="$(git merge-base origin/main upstream/main)"
echo "${base_commit}"
```

3. 列出 `upstream-only` commits，并按时间顺序和改动范围整理。

```bash
git log --reverse --no-merges --oneline "${base_commit}..upstream/main"
git diff --stat "${base_commit}..upstream/main"
```

4. 按“功能主题”分组候选变更。每组至少输出以下内容：

- 功能主题名
- 涉及 commit 列表
- 主要改动文件或目录
- 风险等级
- 与当前 fork 可能冲突的区域
- 是否推荐引入

5. 分析完成后，必须先向用户给出分组结果和建议。
   在用户明确选择功能主题之前，不得直接合并全部 upstream，也不得提前进入实际引入步骤。

建议输出格式：

```text
功能主题：<name>
commits：<sha1>, <sha2>, ...
范围：<files/dirs>
风险：低 / 中 / 高
冲突点：<areas>
建议：推荐引入 / 可选 / 暂不建议
```

## 第 3 阶段：选择性引入策略

默认粒度是“功能主题”，而不是“整支 upstream”。

1. 首选实现方式：按主题对应的 commit 序列执行 `cherry-pick`。

```bash
git cherry-pick <commit-a> <commit-b> <commit-c>
```

2. 如果某个主题跨多个零散 commit，但文件边界清晰，则退化为按文件或目录从 `upstream/main` 引入。

```bash
git restore --source=upstream/main -- path/to/file path/to/dir
git add path/to/file path/to/dir
git commit -m "Selectively import upstream <theme-name>"
```

3. 只有在 commit 粒度和文件粒度都不适合时，才允许在临时 worktree 中做一次受控 `merge`，并把它当作最后手段。

```bash
git merge --no-ff upstream/main
```

不要把受控 `merge` 当成默认方案。

## 第 4 阶段：冲突处理策略

默认原则：尽量保留 upstream 的非冲突改动。

1. 普通冲突：优先保留当前 fork 的实现。
2. 难解冲突：直接选择 `ours`，放弃 upstream 在该冲突点上的改动。

可接受的处理方式示例：

```bash
git checkout --ours -- path/to/conflicted-file
git add path/to/conflicted-file
```

或在确实无法安全吸收时，保留当前 fork 实现并放弃对应冲突块。

明确禁止以下行为：

- 为了吃进 upstream 而重置、覆盖或回滚用户已有修改
- 在主工作区直接解决冲突
- 为了省事而默认整支 merge upstream

“以我的修改为准”的含义仅限冲突区域：没有冲突的 upstream 改动默认允许被吸收。

## 第 5 阶段：收口与报告

1. 在临时 worktree 中完成整理后，再决定是否合回 `main`。
2. 输出结果必须明确区分以下几类：

- 已分析但未引入的功能主题
- 已引入的功能主题
- 因冲突而保留本仓库实现的文件或区域
- 需要后续人工处理的残留风险

3. 如果用户尚未批准引入某些功能主题，只提交分析与建议，不要擅自继续。
4. 如果用户批准引入，再基于临时 worktree 中整理好的结果决定后续合并路径。

## 强制约束

- 上游仓库固定为 `friuns2/codexUI`
- upstream URL 固定为 `https://github.com/friuns2/codexUI.git`
- 每次操作都在临时 worktree 中完成
- 先分析，再让用户选择功能主题，再执行引入
- 优先 `cherry-pick`，其次文件级引入，最后才是受控 `merge`
- 冲突难解时优先保留当前 fork 实现
- 不要硬编码任何 commit hash；运行时获取最新 upstream 状态
