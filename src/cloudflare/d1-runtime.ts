import { env } from "cloudflare:workers";
import { createDialect as createD1Dialect } from "@emdash-cms/cloudflare/db/d1";
import {
	acquireOwnedMigrationLock,
	getMigrationOwner,
	releaseOwnedMigrationLock,
} from "./migration-owner";

// Keep the official session, read-coalescing and collection-deletion behavior.
export * from "@emdash-cms/cloudflare/db/d1";

export function createDialect(config: Parameters<typeof createD1Dialect>[0]) {
	if (config.binding !== "DB") throw new Error("Kexi initialization requires the DB binding");
	const dialect = createD1Dialect(config);
	const token = getMigrationOwner();
	const createAdapter = dialect.createAdapter.bind(dialect);
	dialect.createAdapter = () => {
		const adapter = createAdapter();
		if (token === undefined) {
			if (import.meta.env.PROD) {
				// HTTP, cron and plugin RPCs must not become migration owners.
				adapter.acquireMigrationLock = async () => {
					throw new Error("Kexi core migrations must run in the initialization alarm");
				};
			}
			return adapter;
		}

		const database = env.DB;
		adapter.acquireMigrationLock = async (_db, options) => {
			await acquireOwnedMigrationLock(database, token, options);
		};
		adapter.releaseMigrationLock = async () => {
			await releaseOwnedMigrationLock(database, token);
		};
		return adapter;
	};
	return dialect;
}
