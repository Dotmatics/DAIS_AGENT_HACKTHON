import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { agents } from '@databricks/appkit/beta';
import { setupSampleLakebaseRoutes } from './routes/lakebase/todo-routes';
import { helper } from './agents/helper';

createApp({
  plugins: [
    agents({ agents: { helper } }),
    analytics(),
    lakebase(),
    server(),
  ],
  async onPluginsReady(appkit) {
    await setupSampleLakebaseRoutes(appkit);
  },
}).catch(console.error);
