import { createApp, analytics, genie, lakebase, server } from '@databricks/appkit';
import { agents } from '@databricks/appkit/beta';
import { setupHealthRoutes } from './routes/lakebase/health-routes';
import { createHealthTools, createHealthHelperAgent, type HealthToolDeps } from './agents/health-helper';
import type { AnalyticsQueryFn } from './lib/facility-lookup';
import type { LakebaseQueryFn } from './lib/sms-processor';

/**
 * Deferred dependency holder. The agents plugin resolves its ambient `tools`
 * record at config time, before plugins are initialized, so the tool closures
 * read the live query functions from here. `onPluginsReady` populates it once
 * the analytics and lakebase plugins are connected.
 */
const toolDeps: HealthToolDeps = {
  analyticsQuery: () => Promise.reject(new Error('analytics plugin not ready')),
  lakebaseQuery: () => Promise.reject(new Error('lakebase plugin not ready')),
};

createApp({
  plugins: [
    agents({
      approval: { requireForDestructive: false },
      tools: createHealthTools(toolDeps),
    }),
    analytics(),
    genie(),
    lakebase(),
    server(),
  ],
  async onPluginsReady(appkit) {
    const analyticsQuery: AnalyticsQueryFn = (query, parameters) =>
      appkit.analytics.query(
        query,
        parameters as Parameters<typeof appkit.analytics.query>[1],
      );
    const lakebaseQuery: LakebaseQueryFn = (text, params) =>
      appkit.lakebase.query(text, params);

    toolDeps.analyticsQuery = analyticsQuery;
    toolDeps.lakebaseQuery = lakebaseQuery;

    // Register the code sub-agent that wraps the same intake tools, reachable
    // as `agent-health-helper`. The markdown `intake` agent uses the ambient
    // tools directly; this keeps a standalone delegate available too.
    await appkit.agents.register(
      'health-helper',
      createHealthHelperAgent({ analyticsQuery, lakebaseQuery }),
    );

    await setupHealthRoutes({
      lakebase: appkit.lakebase,
      analytics: {
        query: (query, parameters) =>
          appkit.analytics.query(
            query,
            parameters as Parameters<typeof appkit.analytics.query>[1],
          ),
      },
      server: appkit.server,
    });
  },
}).catch(console.error);
