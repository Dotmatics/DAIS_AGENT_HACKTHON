import { setupHealthRoutes } from "./routes/lakebase/health-routes.js";
import { createHealthHelperAgent, createHealthTools } from "./agents/health-helper.js";
import { analytics, createApp, genie, lakebase, server } from "@databricks/appkit";
import { agents } from "@databricks/appkit/beta";

//#region server/server.ts
/**
* Deferred dependency holder. The agents plugin resolves its ambient `tools`
* record at config time, before plugins are initialized, so the tool closures
* read the live query functions from here. `onPluginsReady` populates it once
* the analytics and lakebase plugins are connected.
*/
const toolDeps = {
	analyticsQuery: () => Promise.reject(/* @__PURE__ */ new Error("analytics plugin not ready")),
	lakebaseQuery: () => Promise.reject(/* @__PURE__ */ new Error("lakebase plugin not ready"))
};
createApp({
	plugins: [
		agents({
			approval: { requireForDestructive: false },
			tools: createHealthTools(toolDeps)
		}),
		analytics(),
		genie(),
		lakebase(),
		server()
	],
	async onPluginsReady(appkit) {
		const analyticsQuery = (query, parameters) => appkit.analytics.query(query, parameters);
		const lakebaseQuery = (text, params) => appkit.lakebase.query(text, params);
		toolDeps.analyticsQuery = analyticsQuery;
		toolDeps.lakebaseQuery = lakebaseQuery;
		await appkit.agents.register("health-helper", createHealthHelperAgent({
			analyticsQuery,
			lakebaseQuery
		}));
		await setupHealthRoutes({
			lakebase: appkit.lakebase,
			server: appkit.server
		});
	}
}).catch(console.error);

//#endregion
export {  };