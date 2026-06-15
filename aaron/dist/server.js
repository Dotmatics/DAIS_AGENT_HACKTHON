import { setupHealthRoutes } from "./routes/lakebase/health-routes.js";
import { analytics, createApp, lakebase, server } from "@databricks/appkit";
import { agents } from "@databricks/appkit/beta";

//#region server/server.ts
createApp({
	plugins: [
		agents({ approval: { requireForDestructive: false } }),
		analytics(),
		lakebase(),
		server()
	],
	async onPluginsReady(appkit) {
		await setupHealthRoutes({
			lakebase: appkit.lakebase,
			analytics: { query: (query, parameters) => appkit.analytics.query(query, parameters) },
			server: appkit.server
		});
	}
}).catch(console.error);

//#endregion
export {  };