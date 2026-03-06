# jshook_plugin_demo

一个最小但完整的 `jshookmcp` 插件示例，展示三件事：

- 默认依赖怎么配
- 插件如何调用内置 MCP 工具
- 插件如何写本地 loopback HTTP API 探测

## 依赖

- `@jshookmcp/extension-sdk`
- `@modelcontextprotocol/sdk`
- `dotenv`
- `typescript`
- `@types/node`

## 工具

- `demo_plugin_info`
- `demo_builtin_call`
- `demo_http_probe`

## 环境变量

参考 `.env.example`：

- `DEMO_PLUGIN_ENABLED`
- `DEMO_MESSAGE`
- `DEMO_API_BASE_URL`

## 构建

```bash
pnpm install
pnpm run build
```

## 说明

- `demo_builtin_call` 默认调用内置工具 `get_token_budget_stats`
- `demo_http_probe` 只允许 loopback 地址，默认探测 `${DEMO_API_BASE_URL}/health`
- 即使本地 API 没启动，`demo_http_probe` 也会返回结构化错误，方便演示调用链
