# CLI Anything

**基于 [morluto/rea](https://github.com/morluto/rea) 构建的通用 Software-to-Agent 接口。**

[English](README.md) · [架构](docs/architecture.md) · [能力声明](docs/manifest.md) · [REA 集成](docs/rea-integration.md)

复用 REA 的应用分析、能力发现、浏览器场景回放和 Evidence，在其上增加：

```text
REA 分析 → 带证据的候选能力 → 参数与适配器定义 → 审核注册
                                               ↓
Agent → CLI / MCP → Capability Registry → Adapter → 应用 → 验证与执行记录
```

目标是把用户有权操作的软件功能，转化成可复用、可验证的命令行能力。
“Anything”是愿景，实际覆盖取决于应用接口、自动化权限和结果验证方式。

## 当前实现

- **REA 作为实际运行时依赖**：固定 `rea-agents@6.5.0`，通过官方 MCP 接口调用。
- **发现**：扫描 JavaScript/Electron 应用目录和 ASAR，从 REA 图谱提取 IPC、Bridge、Endpoint 等候选，保留原始 Evidence 和局限。
- **生成**：选择候选，加上明确的参数、绑定和验证器，生成能力清单。
- **执行**：REA 工具、语义 GUI 工作流、HTTP API、进程/SDK 桥接四种适配器。
- **注册与验证**：SQLite 注册表、JSON Schema 校验、写操作权限、执行 ID、验证证据、适配器指标和升级。
- **Agent 接口**：同一能力模型生成 CLI 和 MCP Tools。

自动探索任意 GUI、自动推断 IPC 参数、原生 Windows/macOS 控制和自动修复属于后续研发。
示例与测试使用受控夹具，不能据此声称已适配商业软件或完成“三款应用各五个命令”的阶段目标。

## 快速开始

使用 REA 支持的 Node：22.x ≥22.19、24.x ≥24.11，或 ≥26。

```bash
npm ci
npm run build
node dist/cli.js doctor

node dist/cli.js register examples/process/manifest.json --approve
node dist/cli.js execute local-demo app.info
```

`--approve` 表示你已检查能力清单、适配器代码/目标、影响范围和验证方法。
省略时仅注册候选，执行会被拒绝。重新导入默认撤销已有审核状态。
这里不会调用 REA setup、修改 Agent 配置或安装商业反编译器。
REA 的平台前提仍然适用，例如 macOS 的进程管理辅助程序可能需要 Command Line Tools。

## GUI → CLI 演示

```bash
npx playwright install chromium
npm run demo
```

另开终端：

```bash
node dist/cli.js register examples/web-notes/manifest.json --approve
node dist/cli.js execute web-notes note.create --input '{"title":"让 Agent 使用 GUI 应用"}' --allow-write
```

这个 Notes 夹具没有任务 API。适配器检查初始状态，通过 Label 和 Role 定位，
执行创建，再检查界面确认。工作流保存后直接复用，执行时不需要模型重新推理。
夹具状态只存在于本次浏览器会话，不是生产级持久笔记应用。

要复用 **REA 自己的浏览器执行与 Evidence**，参考
[REA 场景回放示例](examples/rea-browser/README.md)。

## REA → 候选能力 → 可执行 CLI

```bash
node dist/cli.js discover rea tests/fixtures/electron-app --output .cli-anything/discovery.json
node dist/cli.js generate .cli-anything/discovery.json --spec reviewed-spec.json --output my-app/manifest.json
node dist/cli.js register my-app/manifest.json
node dist/cli.js inspect my-app
# 审核清单后：
node dist/cli.js register my-app/manifest.json --approve
```

大应用可用 `--sources main.js preload.js` 限制分析的精确路径。
REA 的静态分析只提供候选证据，不代表参数契约已经明确，也不赋予执行权限。
生成器需要作者提供适配器和验证器；格式见 [REA 集成文档](docs/rea-integration.md)。

统一 CLI：

```bash
node dist/cli.js inspect APP
node dist/cli.js capabilities APP
node dist/cli.js graph APP
node dist/cli.js execute APP CAPABILITY --input @params.json --dry-run
node dist/cli.js verify EXECUTION_ID
node dist/cli.js metrics APP CAPABILITY
node dist/cli.js promote APP CAPABILITY BINDING
```

`verify` 查看执行时保存的验证记录，不会重复写操作。
`promote` 需要当前清单和源目录对应的成功验证记录，调整适配器优先级，
对外能力名称保持稳定。这里不会自动统计升级，也不会在写失败后自动切换重试。
进程适配器引用的文件是可信的实时程序；修改这些文件后需要重新审核测试。

## MCP

任何支持本地 stdio MCP 的 Agent 均可连接。配置示例：

```json
{
  "mcpServers": {
    "cli-anything": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/CLI-anything/dist/cli.js", "--registry", "/ABSOLUTE/PATH/registry.db", "mcp"]
    }
  }
}
```

注册应用时使用相同的 `--registry` 路径。默认仅暴露已审核的读能力；
在服务器启动参数中添加 `--allow-write` 或 `--allow-destructive`，才能暴露对应能力。

## 测试与贡献

```bash
npm run check
npm run test:browser
npm pack --dry-run
```

详见 [贡献指南](CONTRIBUTING.md)、[安全边界](SECURITY.md) 与 [路线图](docs/roadmap.md)。
本项目采用 MIT，保留 [REA 的署名与许可证](licenses/REA-MIT.txt)。
