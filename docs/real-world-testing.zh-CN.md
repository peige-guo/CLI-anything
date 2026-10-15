# 如何测试真实软件

先区分两个验收目标：

1. **真实发现**：REA 能从实际安装的软件中提取带证据的候选能力。
2. **真实操作**：CLI 调用经过审核的适配器，软件完成任务，并通过独立结果验证。

发现成功不能替代操作成功。候选节点数量也不等于可执行命令数量。

## 已执行：Cursor 的真实 Electron preload

2026-10-15 在本机安装的 Cursor 上进行了只读测试。应用包的
`package.json` 报告名称 `Cursor`、版本 `3.23.12`。

分析范围限定为实际安装目录下的 `electron-sandbox/preload.js`。
没有启动目标应用或调用发现的 IPC。

结果：

- 提取 11 个候选节点，包括 IPC channel/handler 和 context bridge API。
- 观察到 `vscode` Bridge 与 `vscode:fetchShellEnv` 通道。
- 动态通道仍未解析，未分析的文件仍保留未知范围。
- 报告大小 1,453,763 bytes，约 1.39 MiB。
- 所有候选保持 `executable: false`。

本地报告保存在 `.cli-anything/cursor-preload-discovery.json`。完整报告包含
应用分析数据，因此未提交到 Git。

### 复现

先使用项目支持的 Node 版本：22.x ≥22.19、24.x ≥24.11，或 ≥26。
本机系统默认 Node 23 不在当前支持范围内。

```bash
npm run build
node dist/cli.js doctor

node dist/cli.js discover rea \
  /Applications/Cursor.app/Contents/Resources/app/out/vs/base/parts/sandbox/electron-sandbox \
  --sources preload.js \
  --output .cli-anything/cursor-preload-discovery-new.json
```

输出文件必须不存在；重复测试时使用新的文件名。其他系统应使用实际安装路径。

查看候选摘要：

```bash
node --input-type=module -e '
import fs from "node:fs";
const report = JSON.parse(fs.readFileSync(".cli-anything/cursor-preload-discovery-new.json", "utf8"));
console.log(report.candidates.map(({kind, labels, executable}) => ({kind, labels, executable})));
'
```

### 真实测试暴露的限制

直接把 Cursor 整个 `Resources/app` 作为分析根目录，即使只指定一个
`--sources` 文件，REA 仍会清点整个根目录。此次原始结果约 205 MiB，超出
MCP 的单次响应预算，项目的完整结果交付路径无法接收。

缩小根目录后通过测试。这个做法也缩小了证据覆盖范围，不能据此宣称已经
分析整个 Cursor。完整大型应用的保留 Evidence 导出和分页投影仍需要后续集成。
项目现在会保留 REA 的上游错误代码，并为资源限制提示更小的分析范围。

## 下一步：完整业务操作测试

选一个应用和一个明确的任务，例如“在临时目录创建文档并导出 PDF”。
先实现一个闭环，再扩展命令数量：

1. 确认实际应用版本、所需权限和可调用接口。
2. 用 REA 或界面观察获得候选与证据，记录尚未确认的参数和副作用。
3. 编写该任务的适配器、输入 Schema、初始状态和结果验证器。
4. 生成并审核能力清单，注册后先 `--dry-run`，再显式允许写操作。
5. 在独立临时目录执行，检查应用实际产物。
6. 使用不同输出路径重复至少三次；再测试无效输入、目标不可用和验证失败。
7. 经 MCP 调用同一能力，确认执行和验证语义一致。

对于 PDF 导出，文件存在只是一项初步检查；还应确认 PDF 能解析、页数符合
预期、正文包含本次测试写入的唯一标记。预先存在的文件不能证明本次执行成功。
写操作失败或超时后先检查目标状态，避免重复导出、保存或提交。

执行命令的形式如下，前提是已经完成并审核应用专用的适配器：

```bash
node dist/cli.js register cases/APP/manifest.json --approve
node dist/cli.js execute APP document.export --input @params.json --dry-run
node dist/cli.js execute APP document.export --input @params.json --allow-write
node dist/cli.js verify EXECUTION_ID
```

当前生成器需要作者提供适配器与验证器，不会自动把任意扫描结果变成可用的
软件控制接口。原生桌面应用还需要具体的 SDK、脚本或 Accessibility 适配。
