# Omast 开发与发布计划

> 本文是新开发窗口的唯一交接入口。开始实现前先完整阅读本文，然后重新检查本机版本与上游文档是否变化。本文记录于 2026-09-17。

> 2026-09-17 追加：`omast_raycast_quickai_interaction_spec.md` 引入新的
> Raycast-like 分期。原 M0–M5 继续作为 `0.1.0` 发布门禁；新的 Phase 1
> Launcher 已并入首版，Phase 2 Quick AI 编排见 `RAYCAST_PHASE2_PLAN.md`。

## 1. 已确认的项目决策

| 项目 | 决策 |
|---|---|
| 产品名 | **Omast** |
| 含义/介绍 | **Omast — Ask AI with your default Omarchy agent.** |
| GitHub 仓库 | `rayzart/omast` |
| 插件 ID | `io.github.rayzart.omast` |
| Git author | `rayzart` |
| Git email | `rayzart@gmail.com` |
| 许可证 | MIT |
| 首个版本 | `0.1.0` |
| 首版定位 | Omarchy 原生 AI 快捷入口，而不是新的 AI provider |
| 首版默认入口 | `Super+Space` |
| Agent 选择 | 始终调用 Omarchy 当前配置的默认 Agent，不硬编码 Codex |
| 发布目标 | GitHub 公共仓库 + Omarchy Plugins Marketplace |

建议仓库简介：

> Omast — Ask AI from Omarchy with Super+Space, using your configured default agent.

建议 manifest 简介：

> Ask AI from Omarchy with your configured default agent.

## 2. 当前环境快照

新窗口开始时必须重新验证，不能把本节当作永久事实。

- 工作区：`/home/rayz/Work/omast`
- 准备工作开始时工作区仅有本文；现已初始化 Git 并完成 M0 最小插件骨架，详见第 14 节。
- Omarchy：`4.0.3-1`
- 当前默认 Agent：`codex`
- `Super+Space` 当前打开 Omarchy 根菜单。
- 当前原生 Agent 快捷键：`Super+Shift+Ctrl+A`。
- `Super+Shift+Space` 已被“显示/隐藏顶部栏”占用，不能拿来迁移根菜单。
- Omarchy 已提供稳定入口：
  - `omarchy agent`
  - `omarchy agent --pick`
  - `omarchy agent prompt "<prompt>"`
- 用户插件目录：`~/.config/omarchy/plugins/<plugin-id>/`
- 用户 Hyprland 快捷键：`~/.config/hypr/bindings.lua`
- 禁止修改 `/usr/share/omarchy/`；该目录只能作为只读参考。

## 3. 产品目标与两阶段边界

### 第一阶段：当前要实施的 MVP

用户流程：

```text
Super+Space
  → 打开 Omast 原生输入界面
  → 输入问题并提交
  → Omast 调用 `omarchy agent prompt <prompt>`
  → Omarchy 在专用终端中启动当前默认 Agent，并携带首条 prompt
```

MVP 必须做到：

- 使用 Omarchy/Quickshell 风格的居中输入界面。
- 自动聚焦输入框。
- Enter 提交，Escape 关闭；空输入不启动 Agent。
- prompt 通过参数数组传递，正确处理中文、空格、引号和 shell 元字符。
- 委托给 `omarchy agent prompt`，不自行维护 Codex、Claude、OpenCode 等命令行参数。
- 默认 Agent 未设置、命令未安装或启动失败时给出可理解的反馈。
- 重复按快捷键应切换/聚焦现有界面，不创建多个竞争实例。
- 插件安装不能自动覆盖用户的 Hyprland 配置；快捷键通过明确的 README 步骤配置。
- 卸载说明必须包含恢复 `Super+Space` 原始行为的方法。

MVP 不做：

- 不在浮层中呈现 Agent 的流式回答。
- 不实现聊天记录、会话恢复、附件、截图或项目选择器。
- 不直接调用 OpenAI、Anthropic 或其他模型 API。
- 不读取、存储或代理 API key。
- 不替代 Omarchy 的默认 Agent 设置。
- 不复制各 Agent 的 CLI 适配逻辑。
- 不克隆、不替换内建 `omarchy.menu`。

### 第二阶段：后续独立规划

第二阶段才考虑完整 Raycast 风格体验：浮层内流式回答、Markdown/代码块、停止/重试、会话恢复、上下文与附件。

进入第二阶段前必须先确定统一的 Agent 后端协议。Omarchy 当前统一的是“启动交互式 CLI”，不是跨 Agent 的稳定流式 JSON 协议，因此不得在第一阶段提前承诺内嵌回答。

## 4. 首版技术方案

### 4.1 架构

发布版采用独立的 Omarchy `menu` 插件：

```text
Hyprland binding
  → omarchy-shell shell toggle io.github.rayzart.omast '{}'
  → Omast.qml
  → 参数数组调用 omarchy agent prompt <prompt>
  → Omarchy 默认 Agent 适配层
  → 专用 Agent 终端
```

核心原则：Omast 只负责输入体验和安全交接 prompt；Agent 选择、Agent CLI 参数与终端启动继续由 Omarchy 负责。

计划中的 `manifest.json`：

```json
{
  "schemaVersion": 1,
  "id": "io.github.rayzart.omast",
  "name": "Omast",
  "version": "0.1.0",
  "author": "rayzart",
  "license": "MIT",
  "description": "Ask AI from Omarchy with your configured default agent.",
  "kinds": ["menu"],
  "entryPoints": {
    "menu": "Omast.qml"
  }
}
```

Raycast-like Phase 1 将 manifest 设为 `keepLoaded: true`，让同一个浮层与
通用输入在 shell 会话中复用，并避免隐藏/重开期间销毁进程状态。正式发布的
manifest 不应包含 `omarchy.clonedFrom`。

### 4.2 兼容性降级方案

如果独立 `menu` contract 在本机版本存在阻断性问题，先实现并验证这个功能探针：

```bash
prompt="$(omarchy menu input 'Ask AI' --width 640)" || exit
[[ -n "$prompt" ]] || exit
exec omarchy agent prompt "$prompt"
```

该探针只用于证明“输入 → 默认 Agent”链路，不能伪装成最终 Marketplace 插件。最终仍需有效的 QML entry point 与 manifest。

### 4.3 已知兼容性问题

Omarchy `4.0.3-1` 存在已公开的 `omarchy.menu` clone/appLibrary 回归：clone 后 Apps 子菜单可能为空，重启或重新 clone 无法解决。相关问题：

- [omacom/omarchy#11190](https://github.com/omacom/omarchy/issues/11190)
- [omacom/omarchy#10909](https://github.com/omacom/omarchy/issues/10909)

因此：

- 不执行 `omarchy plugin clone omarchy.menu`。
- 不替换、禁用或修改 stock `omarchy.menu`。
- 可以只读参考内建 QML，但不能直接复制整套菜单实现。
- Omast 不 clone `omarchy.menu`，也不访问其内部实现；Launcher 只使用
  Omarchy 专门提供给第三方 menu 的 scoped `shell.appLibrary` facade。

## 5. 计划中的仓库结构

```text
omast/
├── manifest.json
├── Omast.qml
├── OmastModel.js              # 仅在纯逻辑值得分离时创建
├── README.md
├── LICENSE
├── CHANGELOG.md
├── SECURITY.md
├── preview.webp               # 上架前补充，可后置
├── tests/
│   ├── model.test.js          # 若存在独立 JS 模型
│   └── smoke.sh               # 静态/manifest 检查，不修改用户配置
└── .github/
    └── workflows/
        └── validate.yml
```

控制首版文件数量：没有真实用途的抽象、脚本或配置不要创建。插件目录内不得包含符号链接，`.git` 内部除外。

## 6. 开发前环境准备

### 6.1 只读检查

新窗口先执行：

```bash
pwd
git status --short --branch
omarchy version
omarchy plugin --help
omarchy plugin validate --help
omarchy plugin list --json
omarchy default agent
hyprctl version
quickshell --version
jq --version
qmllint --version
```

同时检查：

```bash
omarchy menu keybindings --print
rg -n "SUPER \\+ SPACE|io.github.rayzart.omast" \
  ~/.config/hypr /usr/share/omarchy/default/hypr
```

如果某个开发工具缺失，先说明用途，再使用 Omarchy 的包管理入口安装；不要未经确认引入大型运行时依赖。

### 6.2 Git 初始化

在 `/home/rayz/Work/omast` 中：

```bash
git init -b main
git config user.name rayzart
git config user.email rayzart@gmail.com
```

待 GitHub 仓库存在后：

```bash
git remote add origin git@github.com:rayzart/omast.git
```

不要在未经用户明确授权时创建远程仓库、推送、创建 Release 或提交 Marketplace issue。

### 6.3 开发副本策略

- 源码唯一真源保持在 `/home/rayz/Work/omast`。
- 运行时插件位于 `~/.config/omarchy/plugins/io.github.rayzart.omast/`。
- 不使用符号链接安装插件，因为官方 validator 会拒绝插件目录中的 symlink。
- 首次提交后可从本地 Git 仓库安装测试副本；若本机 `omarchy plugin add file://...` 不兼容，则复制到精确的插件目录并执行 rescan。
- 每次同步前确认目标 ID，绝不能对整个 `~/.config/omarchy/plugins/` 做递归清理。
- 保存用户插件后通常会热重载；必要时执行：

```bash
omarchy-shell shell rescanPlugins
```

## 7. 分阶段实施任务

### M0：初始化与基线

- [x] 完成环境检查并记录版本。
- [x] 初始化 Git，设置本仓库的 author/email。
- [x] 创建 `.gitignore`、MIT `LICENSE`、基础 `README.md`。
- [x] 创建并验证最小 `manifest.json`。
- [x] 确认插件 ID 在 Marketplace 中尚未占用。
- [x] 建立首个基线提交。

完成标准：仓库结构清晰，`jq` 与 `omarchy plugin validate .` 均通过。

### M1：验证默认 Agent 启动链路

- [x] 只使用 `omarchy agent prompt` 启动 prompt，不直接调用 `codex`。
- [ ] 验证当前 Codex 默认 Agent 能收到首条 prompt。
- [x] 验证 prompt 包含中文、空格、单双引号、反引号、分号和 `$()` 时不会被 shell 二次解释。
- [x] 记录 Agent 未设置和 Agent 未安装时 Omarchy 的实际行为。
- [x] 确认启动工作目录沿用 Omarchy 的标准策略，不在首版自创 cwd 规则。

完成标准：功能链路正确，且不存在 `eval`、`sh -c` 或字符串拼接执行 prompt。

### M2：实现 Omast 菜单

- [x] 实现 `Omast.qml` 所需的 `open()`、`close()`、`toggle()` 生命周期。
- [x] 使用 Omarchy 主题/公共 UI 组件，保持原生观感。
- [x] 打开时自动聚焦并选中合适的输入状态。
- [x] Enter 提交；首版使用单行输入，不提供 Shift+Enter。
- [x] Escape 关闭并清理临时状态。
- [x] 空白输入不提交。
- [x] 提交后防抖，避免重复启动两个 Agent。
- [x] 使用 argv 数组执行：`["omarchy", "agent", "prompt", prompt]`。
- [x] 默认 Agent 未配置时展示操作提示，并提供进入 Omarchy 默认 Agent 设置的入口。
- [x] 启动成功后关闭输入界面；失败时保留 prompt 并显示错误。

完成标准：可通过 shell IPC 反复打开/关闭，QML 日志无加载错误。

### M3：接入 `Super+Space`

README 提供以下用户配置示例，正式实施前仍要检查当前绑定：

```lua
-- SUPER+SPACE 原本是 Omarchy menu。
hl.unbind("SUPER + SPACE")
o.bind(
  "SUPER + SPACE",
  "Omast — Ask AI",
  "omarchy-shell shell toggle io.github.rayzart.omast '{}'"
)
```

要求：

- [ ] 修改前备份 `~/.config/hypr/bindings.lua`。
- [ ] 明确告知用户 `Super+Space` 原用途。
- [ ] 不把根菜单迁到 `Super+Shift+Space`，该键当前已占用。
- [ ] 不自动选择新的根菜单快捷键；先检查冲突，再由用户决定。
- [ ] 保留 stock Omarchy menu，可通过菜单按钮或本机已有备用绑定访问。
- [ ] 修改后执行：

```bash
hyprctl reload
hyprctl configerrors
```

- [ ] 直到 `hyprctl configerrors` 无错误才算完成。

### M4：文档与安全收尾

- [x] README 写清安装、启用、快捷键配置、使用、故障排查和卸载。
- [x] 卸载章节先恢复/移除 Hyprland 绑定，再执行插件 remove。
- [x] SECURITY.md 说明插件在 `omarchy-shell` 内以用户权限、无沙箱运行。
- [x] 明确声明 Omast 不读取凭据、不直接联网、不使用 sudo/pkexec、不运行安装 hook。
- [x] 明确声明默认 Agent 可能按 Omarchy 自身策略自动批准工具操作。
- [x] 增加 CHANGELOG `0.1.0`。
- [ ] 上架前制作不含隐私信息的 `preview.webp`。

### M5：发布候选

- [x] `manifest.json`、README、LICENSE 均在仓库根目录。
- [x] `omarchy plugin validate .` 通过。
- [x] `qmllint -I "$OMARCHY_PATH/shell" Omast.qml` 通过或仅保留有解释的误报。
- [ ] 从干净 clone 安装、启用、重启 shell、禁用、重新启用、卸载均通过。
- [x] 使用公共 GitHub URL 安装测试通过。
- [ ] 创建 `v0.1.0` tag/Release（项目质量要求，非 Marketplace 强制项）。
- [ ] 用户确认后再提交 Marketplace issue。

## 8. 测试矩阵与验收标准

### 8.1 自动检查

```bash
jq empty manifest.json
omarchy plugin validate .
qmllint -I "$OMARCHY_PATH/shell" Omast.qml
```

CI 至少检查：

- JSON 有效。
- manifest 必填字段与固定 ID 正确。
- entry point 存在。
- 无符号链接。
- QML/JS 静态检查。
- 如存在纯 JS 模型，则运行其单元测试。

官方 `omarchy plugin validate` 是本地发布门禁；CI 不能用自写检查冒充官方 validator。

### 8.2 手工功能测试

- [ ] `Super+Space` 打开 Omast。
- [ ] 再按一次切换关闭或聚焦，不产生重复实例。
- [ ] Escape 关闭。
- [ ] 空输入不执行。
- [ ] 英文、中文、emoji 正常。
- [ ] 引号、反引号、分号、管道、`$()` 仅作为 prompt 文本传递。
- [ ] 长 prompt 不截断或卡死；若设置长度上限，UI 明示。
- [ ] 连续提交不会启动多个 Agent。
- [ ] Codex 能收到首条 prompt。
- [ ] 条件允许时至少再测试一个 Omarchy 支持的 Agent。
- [ ] 默认 Agent 未设置时有明确引导。
- [ ] 默认 Agent 未安装时有明确反馈。
- [ ] shell 重启后仍可用。
- [ ] plugin disable/enable 后状态正确。
- [ ] 卸载后 stock Omarchy menu 与 Hyprland 配置可恢复。

### 8.3 发布验收

以下全部满足才发布 `0.1.0`：

- 功能测试全部通过。
- `hyprctl configerrors` 无错误。
- Quickshell 日志无 Omast 加载错误。
- 无 prompt 命令注入。
- 没有修改 `/usr/share/omarchy/`。
- 没有未披露依赖、网络访问或凭据访问。
- README 中的安装与卸载命令已从干净环境验证。

## 9. Omarchy Marketplace 上架清单

官方平台：

- [Omarchy Plugins Marketplace](https://plugins.omarchy.org/)
- [开发指南](https://plugins.omarchy.org/develop.html)
- [发布指南](https://plugins.omarchy.org/publish.html)
- [Marketplace 仓库](https://github.com/omacom/omarchy-plugin-marketplace)
- [插件提交表单](https://github.com/omacom/omarchy-plugin-marketplace/issues/new?template=submit-plugin.yml)

### 9.1 强制要求

- 公共 GitHub 仓库。
- 一个仓库根目录对应一个插件。
- 根目录包含有效 `manifest.json`、README 和许可证文件。
- README 记录全部依赖、安装、配置、使用与安全卸载步骤。
- 安装和卸载不得静默覆盖用户配置。
- manifest 必填：
  - `schemaVersion`
  - `id`
  - `name`
  - `version`
  - `author`
  - `description`
  - `kinds`
  - `entryPoints`
- `kinds` 非空，且每种 kind 都有对应 entry point。
- entry point 必须是存在的安全相对路径，不允许绝对路径、`..` 或换行。
- 插件目录不得包含符号链接，`.git` 内部除外。
- 第三方插件不得使用保留的 `omarchy.*` ID。

`io.github.rayzart.omast` 满足官方推荐的全小写、命名空间化 ID 形式，但上架前仍须搜索确认全局唯一。

### 9.2 提交材料

- 仓库根 URL。
- 一个 Marketplace 分类；当前分类列表没有 **AI**，建议选择 **Productivity**
  或 **Developer Tools**，并使用 `ai` 标签。
- 一至三个平台允许的 tag，提交时从最新表单选择。
- 可选 maintainer notes。
- 可选根目录预览图：`preview.png/jpg/jpeg/webp/avif`。
- 勾选作者权利、配置安全、依赖披露等声明。

Marketplace 会对提交时的精确 commit 做自动检查并等待维护者批准。该验证不是安全审计；当前 `omarchy plugin add/update` 拉取的是可能变化的 upstream HEAD，并不保证绑定到 Marketplace 验证过的 commit。

### 9.3 官方 validator 的关键规则

- `schemaVersion` 必须是 JSON 数字 `1`。
- ID 首字符为 ASCII 字母或数字，其余只能是字母、数字、点、下划线、短横线。
- ID 不得包含 `..`。
- `menu` kind 必须有 `entryPoints.menu`。
- `version` 在 Marketplace 展示中最多 64 字符。
- manifest 中的 `license` 字段值得保留，但真正明确强制的是根目录许可证文件。

### 9.4 不是官方硬性要求、但本项目采用

- SemVer。
- CHANGELOG。
- CI workflow。
- Git tag/GitHub Release。
- SECURITY.md。
- 至少一套自动检查和完整的人工验收矩阵。

## 10. 安全边界

Omarchy 插件与长期运行的 `omarchy-shell` 共享进程，以当前用户权限执行且没有沙箱。首版必须遵守：

- 不使用 `eval`、`sh -c` 或拼接后的 shell 命令执行 prompt。
- 不请求 sudo/pkexec。
- 不写系统目录。
- 不读取 Agent/API 凭据。
- 不实现 download-to-shell。
- 不引入后台服务或第二个 Quickshell 进程。
- 不自动编辑或覆盖用户配置。
- 不在可预测的共享 `/tmp` 路径保存敏感状态。
- 外部依赖与所有进程启动行为必须在 README/SECURITY 中披露。

特别提示：当前 Omarchy 的 Agent launcher 会针对不同 Agent 使用 auto/yolo/allow-all 等无人值守参数。Omast 只是调用官方入口，但 README 必须提示用户：默认 Agent 可能执行文件修改、命令和其他工具操作，应在可信工作目录使用。

## 11. 风险与应对

| 风险 | 应对 |
|---|---|
| Omarchy/Quickshell API 变化快 | 以本机版本与最新官方文档双重验证；不复制内部大模块 |
| `omarchy.menu` clone 回归 | 不 clone、不替换内建菜单；仅用受支持的 scoped appLibrary facade |
| 覆盖 `Super+Space` 改变用户习惯 | 明示原绑定，提供恢复说明，不擅自选择冲突快捷键 |
| Agent CLI 差异 | 只调用 `omarchy agent prompt` |
| shell 注入 | 始终用 argv 数组传 prompt，增加恶意字符测试 |
| 默认 Agent 缺失 | 在 UI 中预检并引导到 Omarchy 默认 Agent 设置 |
| 工作目录影响 Agent 权限范围 | 首版沿用 Omarchy 行为并文档化；项目选择器放二期 |
| 插件卸载后快捷键失效 | 卸载流程先恢复 Hyprland 绑定，再 remove 插件 |
| Marketplace 验证与 upstream HEAD 不一致 | 发布固定 tag，记录验证 commit，提醒用户审查安装版本 |
| MVP 被误解为完整 Raycast AI | README 明确回答发生在 Agent 终端，浮层回答属于二期 |

## 12. 新窗口的建议执行顺序

1. 完整阅读本文。
2. 重新检查 Omarchy、Quickshell、Hyprland 与 Marketplace 文档版本。
3. 检查工作区和用户配置，保留所有已有改动。
4. 完成 M0，仅建立可验证的最小插件骨架。
5. 完成 M1，先证明默认 Agent 链路和参数安全。
6. 完成 M2，再做 UI，不从 `omarchy.menu` clone。
7. 在用户插件目录安装测试副本，完成 IPC 测试。
8. 得到用户确认后才修改 `~/.config/hypr/bindings.lua` 并接管 `Super+Space`。
9. 完成 M3/M4 和完整验收。
10. 用户确认后创建远程仓库、推送、发布 `v0.1.0`。
11. 最后提交 Marketplace，等待精确 commit 的自动检查与维护者批准。

## 13. 主要参考资料

- [Omarchy AI manual](https://omarchy.org/manual/ai/)
- [Omarchy Shell Plugins manual](https://omarchy.org/manual/shell-plugins/)
- [Omarchy plugin development guide](https://plugins.omarchy.org/develop.html)
- [Omarchy plugin publishing guide](https://plugins.omarchy.org/publish.html)
- [Omarchy shell reference](https://github.com/basecamp/omarchy/blob/quattro/shell/README.md)
- [Omarchy built-in plugin reference](https://github.com/basecamp/omarchy/blob/quattro/shell/plugins/README.md)
- [Omarchy plugin validator](https://github.com/omacom/omarchy/blob/quattro/bin/omarchy-plugin-validate)
- [Marketplace submission guide](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SUBMISSION.md)
- [Marketplace security policy](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/SECURITY.md)
- [Marketplace verification model](https://github.com/omacom/omarchy-plugin-marketplace/blob/main/VERIFICATION.md)

## 14. 2026-09-17 前期准备记录

### 14.1 可行性结论

MVP 方案可行。已通过本机 Omarchy 源码和当前官方文档确认：

- `menu` 是受支持的第三方插件 kind，entry point 是普通 QML `Item`。
- shell 会向插件注入 `omarchyPath`、`shell` 与 `manifest`，并调用
  `open(payloadJson)` / `close()` 生命周期。
- `omarchy-shell shell toggle <id> '{}'` 是受支持的单实例切换入口。
- Quickshell 支持 argv 数组执行；prompt 可以作为单独参数传给
  `omarchy agent prompt`，无需 `eval`、`sh -c` 或字符串拼接。
- 本机 `omarchy-agent` 已覆盖 Codex、Claude、Gemini、OpenCode 等 Agent；
  Omast 不需要复制适配逻辑。

需要在 M2 重点验证的边界是启动反馈：应使用可观察退出状态的 `Process`
完成预检/启动，仅在启动成功后关闭菜单；不能只依赖无法返回失败详情的
fire-and-forget 调用。

### 14.2 已核验环境

| 项目 | 结果 |
|---|---|
| Omarchy | `4.0.3-1` |
| Hyprland | `0.56.2-2` |
| Quickshell | `0.3.1-1` |
| Qt Declarative / qmllint | `6.11.2-1`；可执行文件为 `/usr/lib/qt6/bin/qmllint`，未加入默认 PATH |
| jq | `1.8.2-1` |
| Git | `2.55.0` |
| GitHub CLI | `2.100.0` |
| Codex CLI | `0.154.0` |
| 默认 Agent | `codex` |
| `Super+Space` | stock Omarchy menu |
| `Super+Shift+Space` | toggle top bar，不能占用 |
| 插件 validator | `jq empty`、`omarchy plugin validate .` 均通过 |
| QML lint | `/usr/lib/qt6/bin/qmllint -I "$OMARCHY_PATH/shell" Omast.qml` 通过 |

当前自动化会话无法连接图形桌面的 Hyprland/Quickshell socket，且不能写
`~/.cache`，所以 `hyprctl configerrors`、插件 rescan/enable/toggle 和真实 UI
验收必须在桌面会话中执行。这不影响静态开发，但仍是 M2/M3 的发布门禁。

### 14.3 GitHub 与 Marketplace 就绪状态

- GitHub 公共账号 `rayzart` 已存在，GitHub CLI 已通过 keyring 登录。
- 公共仓库 `https://github.com/rayzart/omast` 已创建，`origin` 使用 HTTPS，
  `main` 已推送 M0 基线；尚未发布 Release。
- 本机没有 `~/.ssh` 密钥目录；系统 SSH 配置文件的 owner 显示为
  `nobody:nobody`，OpenSSH 会拒绝加载。修复前优先用 GitHub CLI 的 HTTPS
  协议，或由用户明确决定是否修复 SSH 并配置密钥。
- 在 Marketplace 当前公开 `registry.json` 中未发现
  `io.github.rayzart.omast`，该 ID 当前可用；最终提交前必须再次检查。
- 当前 Marketplace 分类不包含 `AI`。建议分类 `Productivity`，tags 使用
  `ai`, `launcher`, `quickshell`；提交时再按最新表单复核。

### 14.4 本地已完成

- Git 分支：`main`。
- 仓库级 author：`rayzart <rayzart@gmail.com>`。
- 已创建 `.gitignore`、MIT `LICENSE`、`README.md`、`manifest.json` 和最小
  `Omast.qml` 生命周期探针。
- 未修改 `/usr/share/omarchy/` 或 `~/.config/hypr/`。进入 M2 后已通过官方
  插件命令安装并启用精确的
  `~/.config/omarchy/plugins/io.github.rayzart.omast/` 测试副本；未启动任何
  真实 Agent 会话。

### 14.5 MVP 开发进展

已进入 M1/M2 实现阶段并完成以下验证：

- 实现居中原生输入界面、自动聚焦、Enter 提交、Escape 关闭、空输入保护、
  重复提交保护、失败保留 prompt，以及默认 Agent 设置入口。
- prompt 命令由纯逻辑模型构造为
  `["omarchy", "agent", "prompt", prompt]`，QML 源码中不存在 `eval`、
  `sh -c` 或 `bash -c`。
- 使用假的终端 launcher 隔离测试了本机真实 `omarchy-agent-prompt`；中文、
  emoji、单双引号、反引号、分号、管道和 `$()` 均原样成为单个 prompt
  参数，没有执行。默认 Agent 缺失和 Agent 未安装的错误路径也已验证。
- 从本地固定 Git 提交安装并启用测试副本；shell IPC summon/hide 成功，
  Hyprland 检测到唯一的 `omast` layer surface，重复 summon 仍为单实例，
  toggle 后 layer 数量归零。
- 完成一次临时截图视觉检查：主题、边框、居中布局和输入焦点正常；截图已
  从 `/tmp` 删除，未加入仓库。
- 已创建 README、SECURITY、CHANGELOG、模型测试、smoke 检查和 GitHub
  Actions workflow。
- GitHub Actions `Validate` 首次运行通过；从公共 GitHub URL 安装的测试副本
  指向验证提交 `80b1f908d87b86acf108c2b193c1eb5f2b6d22bb`。
- plugin disable/enable 状态切换通过，重新启用后仍可加载唯一 layer surface。

仍未执行的人工门禁：实际向 Codex 提交 prompt、键盘 Escape/Enter 全链路、
失败时 UI 文案、另一个 Agent，以及 Hyprland `Super+Space` 接入。快捷键配置
仍保持原样。

### 14.6 Raycast-like Phase 1 Launcher

已按上传交互规格完成第一步源码：

- `keepLoaded: true`，单一常驻 `PanelWindow` 与单一通用 `TextField`。
- 默认 Launcher 模式通过第三方 scoped `shell.appLibrary` 搜索并启动已安装
  应用；不 clone stock menu，不执行任意搜索字符串。
- 最多显示六个应用结果和一个 Quick AI action；支持 Up/Down 环绕选择、
  Enter 启动、鼠标悬停/点击。
- Tab 进入 Quick AI、Shift+Tab 返回 Launcher；同一输入组件保留完整文本、
  光标与选区。当前 Quick AI 仍明确降级为安全的 Agent 终端交接。
- Escape 改为 window-scope，任意焦点都能关闭；Agent 设置入口改为先启动
  官方设置菜单再隐藏 Omast，消除延迟回调被卸载的竞态。
- 新增模式归一化、选择移动和输入快照单元测试；完整 smoke 通过。
- 新版运行时文件已在真实 `omarchy-shell` 热加载，layer surface 创建成功且
  日志无 Omast QML 加载错误。`keepLoaded` manifest 变更仍需一次完整 shell
  重启确认；当前桌面会话处于锁定状态，Omarchy 按安全策略拒绝了重启。

Phase 1 剩余人工验收：真实键盘 Tab/Shift+Tab/Up/Down/Enter/Escape、中文
IME 预编辑、应用实际启动、解锁后的 shell 重启、活动显示器、快速 toggle
压力测试及 `Super+Space` 接入。Escape 已自动验证能恢复到打开前的同一窗口
地址。Phase 2 的状态机、AgentBridge/JSONL 门禁、分工与测试策略见
`RAYCAST_PHASE2_PLAN.md`。
