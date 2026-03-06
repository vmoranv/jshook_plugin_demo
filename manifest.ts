import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getPluginBooleanConfig, loadPluginEnv } from '@jshookmcp/extension-sdk/plugin';
import type {
  DomainManifest,
  PluginContract,
  PluginLifecycleContext,
  ToolArgs,
  ToolHandlerDeps,
} from '@jshookmcp/extension-sdk/plugin';

loadPluginEnv(import.meta.url);

type JsonObject = Record<string, unknown>;
type TextToolResponse = { content: Array<{ type: 'text'; text: string }> };

type DemoHandlers = {
  info(args: ToolArgs): Promise<TextToolResponse>;
  builtin(args: ToolArgs): Promise<TextToolResponse>;
  probe(args: ToolArgs): Promise<TextToolResponse>;
};

function toText(payload: unknown): TextToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
}

function toError(tool: string, error: unknown, extra: JsonObject = {}): TextToolResponse {
  return toText({
    success: false,
    tool,
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  });
}

function assertLoopbackUrl(value: string): URL {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!loopback) {
    throw new Error(`Only loopback hosts are allowed, got ${host}`);
  }
  return url;
}

function bind(methodName: keyof DemoHandlers) {
  return (deps: ToolHandlerDeps) => async (args: ToolArgs) => {
    const handlers = deps.demoHandlers as DemoHandlers;
    return handlers[methodName](args ?? {});
  };
}

function createDomain(pluginCtx: PluginLifecycleContext): DomainManifest<'demoHandlers', DemoHandlers, 'demo-plugin'> {
  const infoTool: Tool = {
    name: 'demo_plugin_info',
    description: 'Return demo plugin metadata, env defaults, and runtime hints.',
    inputSchema: { type: 'object', properties: {} },
  };

  const builtinTool: Tool = {
    name: 'demo_builtin_call',
    description: 'Demonstrate calling a built-in jshook tool from a plugin.',
    inputSchema: {
      type: 'object',
      properties: {
        targetTool: {
          type: 'string',
          description: 'Built-in tool name to invoke. Defaults to get_token_budget_stats.',
        },
      },
    },
  };

  const probeTool: Tool = {
    name: 'demo_http_probe',
    description: 'Demonstrate a plugin-side HTTP API probe to a loopback endpoint.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Optional override URL. Must remain loopback-only.',
        },
      },
    },
  };

  return {
    kind: 'domain-manifest',
    version: 1,
    domain: 'demo-plugin',
    depKey: 'demoHandlers',
    profiles: ['workflow', 'full', 'reverse'],
    ensure() {
      return {
        info: async () => {
          return toText({
            success: true,
            pluginId: pluginCtx.pluginId,
            pluginRoot: pluginCtx.pluginRoot,
            loadedAt: pluginCtx.getRuntimeData('loadedAt'),
            env: {
              enabled: process.env.DEMO_PLUGIN_ENABLED ?? 'true',
              message: process.env.DEMO_MESSAGE ?? 'hello-from-demo',
              apiBaseUrl: process.env.DEMO_API_BASE_URL ?? 'http://127.0.0.1:8787',
            },
            examples: {
              builtinTool: 'demo_builtin_call',
              httpProbeTool: 'demo_http_probe',
            },
          });
        },
        builtin: async (args) => {
          const targetTool = typeof args.targetTool === 'string' ? args.targetTool : 'get_token_budget_stats';
          try {
            const result = await pluginCtx.invokeTool(targetTool, {});
            return toText({
              success: true,
              targetTool,
              note: 'This demonstrates plugin -> built-in tool invocation through PluginLifecycleContext.invokeTool().',
              result,
            });
          } catch (error) {
            return toError('demo_builtin_call', error, { targetTool });
          }
        },
        probe: async (args) => {
          const rawUrl = typeof args.url === 'string' && args.url
            ? args.url
            : `${process.env.DEMO_API_BASE_URL ?? 'http://127.0.0.1:8787'}`.replace(/\/$/, '') + '/health';
          try {
            const url = assertLoopbackUrl(rawUrl);
            const response = await fetch(url, { method: 'GET' });
            const body = await response.text();
            return toText({
              success: response.ok,
              url: url.toString(),
              status: response.status,
              bodyPreview: body.slice(0, 500),
            });
          } catch (error) {
            return toError('demo_http_probe', error, {
              attemptedUrl: rawUrl,
              note: 'Expected to fail when no local demo API is running; tool remains callable and demonstrates network code shape.',
            });
          }
        },
      };
    },
    registrations: [
      { tool: infoTool, domain: 'demo-plugin', bind: bind('info') },
      { tool: builtinTool, domain: 'demo-plugin', bind: bind('builtin') },
      { tool: probeTool, domain: 'demo-plugin', bind: bind('probe') },
    ],
  };
}

const plugin: PluginContract = {
  manifest: {
    kind: 'plugin-manifest',
    version: 1,
    id: 'io.github.vmoranv.demo-plugin',
    name: 'Demo Plugin',
    pluginVersion: '0.1.0',
    entry: 'manifest.js',
    description: 'A reference plugin showing env defaults, built-in tool invocation, and optional HTTP probing.',
    compatibleCore: '>=0.1.0',
    permissions: {
      network: { allowHosts: ['127.0.0.1', 'localhost', '::1'] },
      process: { allowCommands: [] },
      filesystem: { readRoots: [], writeRoots: [] },
      toolExecution: { allowTools: ['get_token_budget_stats'] },
    },
    activation: { onStartup: false, profiles: ['workflow', 'full', 'reverse'] },
    contributes: {
      domains: [],
      workflows: [],
      configDefaults: {
        'plugins.demo-plugin.enabled': true,
      },
      metrics: ['demo_plugin_info_calls_total', 'demo_builtin_call_total', 'demo_http_probe_total'],
    },
  },
  onLoad(ctx) {
    ctx.setRuntimeData('loadedAt', new Date().toISOString());
  },
  onValidate(ctx) {
    const enabled = getPluginBooleanConfig(ctx, 'demo-plugin', 'enabled', true);
    if (!enabled) {
      return { valid: false, errors: ['Plugin disabled by config'] };
    }
    return { valid: true, errors: [] };
  },
  onRegister(ctx) {
    ctx.registerDomain(createDomain(ctx));
    ctx.registerMetric('demo_plugin_info_calls_total');
    ctx.registerMetric('demo_builtin_call_total');
    ctx.registerMetric('demo_http_probe_total');
  },
};

export default plugin;
