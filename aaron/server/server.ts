import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { agents } from '@databricks/appkit/beta';
import { setupHealthRoutes } from './routes/lakebase/health-routes';

createApp({
  plugins: [
    agents({
      approval: { requireForDestructive: false },
    }),
    analytics(),
    lakebase(),
    server(),
  ],
  async onPluginsReady(appkit) {
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
