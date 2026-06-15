import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { setupIntakeRoutes } from './routes/lakebase/intake-routes';

createApp({
  plugins: [
    analytics(),
    lakebase(),
    server(),
  ],
  async onPluginsReady(appkit) {
    await setupIntakeRoutes(appkit);
  },
}).catch(console.error);
