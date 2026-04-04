import {
  createExtension,
  jsonResponse,
  errorResponse,
} from '@jshookmcp/extension-sdk/plugin';
import type { ToolArgs, PluginLifecycleContext } from '@jshookmcp/extension-sdk/plugin';

const PLUGIN_SLUG = 'demo-plugin';

function getPluginBooleanConfig(
  ctx: PluginLifecycleContext,
  slug: string,
  key: string,
  fallback: boolean,
): boolean {
  const value = ctx.getConfig(`plugins.${slug}.${key}`, fallback);
  return typeof value === 'boolean' ? value : fallback;
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

async function handleInfo(_args: ToolArgs, ctx: PluginLifecycleContext) {
  return jsonResponse({
    success: true,
    pluginId: ctx.pluginId,
    pluginRoot: ctx.pluginRoot,
    loadedAt: ctx.getRuntimeData('loadedAt'),
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
}

async function handleBuiltin(args: ToolArgs, ctx: PluginLifecycleContext) {
  const targetTool = typeof args.targetTool === 'string' ? args.targetTool : 'get_token_budget_stats';
  try {
    const result = await ctx.invokeTool(targetTool, {});
    return jsonResponse({
      success: true,
      targetTool,
      note: 'This demonstrates plugin -> built-in tool invocation through PluginLifecycleContext.invokeTool().',
      result: result as Record<string, unknown>,
    });
  } catch (error) {
    return errorResponse('demo_builtin_call', error, { targetTool });
  }
}

async function handleProbe(args: ToolArgs) {
  const rawUrl = typeof args.url === 'string' && args.url
    ? args.url
    : `${process.env.DEMO_API_BASE_URL ?? 'http://127.0.0.1:8787'}`.replace(/\/$/, '') + '/health';
  try {
    const url = assertLoopbackUrl(rawUrl);
    const response = await fetch(url, { method: 'GET' });
    const body = await response.text();
    return jsonResponse({
      success: response.ok,
      url: url.toString(),
      status: response.status,
      bodyPreview: body.slice(0, 500),
    });
  } catch (error) {
    return errorResponse('demo_http_probe', error, {
      attemptedUrl: rawUrl,
      note: 'Expected to fail when no local demo API is running; tool remains callable and demonstrates network code shape.',
    });
  }
}

const plugin = createExtension('io.github.vmoranv.demo-plugin', '0.1.0')
  .compatibleCore('>=0.1.0')
  .profile(['workflow', 'full'])
  .allowHost(['127.0.0.1', 'localhost', '::1'])
  .allowTool('get_token_budget_stats')
  .configDefault('plugins.demo-plugin.enabled', true)
  .metric(['demo_plugin_info_calls_total', 'demo_builtin_call_total', 'demo_http_probe_total'])
  .tool(
    'demo_plugin_info',
    'Return demo plugin metadata, env defaults, and runtime hints.',
    {},
    handleInfo,
  )
  .tool(
    'demo_builtin_call',
    'Demonstrate calling a built-in jshook tool from a plugin.',
    {
      targetTool: { type: 'string', description: 'Built-in tool name to invoke. Defaults to get_token_budget_stats.' },
    },
    handleBuiltin,
  )
  .tool(
    'demo_http_probe',
    'Demonstrate a plugin-side HTTP API probe to a loopback endpoint.',
    {
      url: { type: 'string', description: 'Optional override URL. Must remain loopback-only.' },
    },
    handleProbe,
  )
  .onLoad((ctx) => { ctx.setRuntimeData('loadedAt', new Date().toISOString()); })
  .onValidate((ctx: PluginLifecycleContext) => {
    const enabled = getPluginBooleanConfig(ctx, PLUGIN_SLUG, 'enabled', true);
    if (!enabled) return { valid: false, errors: ['Plugin disabled by config'] };
    return { valid: true, errors: [] };
  });

Object.defineProperty(plugin, 'workflows', {
  value: [],
  enumerable: false,
  configurable: true,
  writable: false,
});

export default plugin;
