import handler, { createScheduledHandler, PluginBridge } from "@emdash-cms/cloudflare/worker";
import { initializationResponse, isInitialized } from "./cloudflare/initializer";

export { PluginBridge };
export { KexiInitializer } from "./cloudflare/initializer";

const scheduled = createScheduledHandler();

export default {
	...handler,
	async fetch(request, env, ctx) {
		try {
			if (!(await isInitialized(env))) return initializationResponse(request);
		} catch (error) {
			console.error("[kexi:init] coordinator unavailable", {
				error: error instanceof Error ? error.name : "UnknownError",
			});
			return initializationResponse(request);
		}
		return handler.fetch!(request, env, ctx);
	},
	async scheduled(controller, env, ctx) {
		if (await isInitialized(env)) await scheduled(controller, env, ctx);
	},
} satisfies ExportedHandler<Env>;
