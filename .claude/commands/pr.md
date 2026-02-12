---
description: 使用约定式提交风格为标题创建到 main 分支的 PR
---

从当前分支创建一个到 `main` 分支的拉取请求。

## 参数

用户可能会提供此 PR 修复的问题编号：`$ARGUMENTS`

- 如果提供了（例如 `123` 或 `123,456`），使用这些问题编号
- 如果未提供，检查分支名称中的问题编号（例如 `fix/123-bug` 或 `issue-456-feature` → 提取 `123` 或 `456`）
- 如果未找到任何问题，省略 "Closes" 部分

## 步骤

首先，分析当前分支以了解已做出的更改：
1. 运行 `git log --oneline -10` 查看最近的提交历史并了解提交风格
2. 运行 `git log main..HEAD --oneline` 查看此分支上将包含在 PR 中的所有提交
3. 运行 `git diff main...HEAD --stat` 查看文件更改的摘要
4. 运行 `git branch --show-current` 获取分支名称以进行问题检测（如果未明确提供问题）

然后生成一个 PR 标题，该标题：
- 遵循约定式提交格式（例如 `fix:`, `feat:`, `chore:`, `refactor:`）
- 简洁明了且准确描述更改
- 与存储库中最近提交的风格匹配

生成一个 PR 正文，包含：
- 一个 `## Summary` 部分，用 1-3 个要点描述更改
- 每个问题编号的 `Closes #X` 行（如果有任何提供的或从分支名称中检测到的）

最后，使用 gh CLI 创建 PR：
```
gh pr create --base main --title "<生成的标题>" --body "$(cat <<'EOF'
## Summary
<要点>

Closes #<issue1>
Closes #<issue2>
EOF
)"
```

注意：如果此 PR 未关联任何问题，请完全省略 "Closes" 行。

重要：
- 不要在 PR 中包含任何 Claude Code 归因
- 保持摘要简洁（最多 1-3 个要点）
- 使用与更改最匹配的约定式提交前缀（fix、feat、chore、refactor、docs 等）
- `Closes #X` 语法会在 PR 合并时自动关闭引用的问题