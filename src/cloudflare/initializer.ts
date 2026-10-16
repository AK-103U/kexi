import { DurableObject } from "cloudflare:workers";
import { getCoreMigrationIdentity } from "emdash/migrations";
import { withEmDashRuntime } from "emdash/middleware";
import { InitializationCoordinator } from "./initialization-coordinator";
import { releaseOwnedMigrationLock, withMigrationOwner } from "./migration-owner";

let cachedSchemaVersion: string | undefined;

export async function getSchemaVersion(): Promise<string> {
	if (cachedSchemaVersion) return cachedSchemaVersion;
	try {
		const { fingerprint, emdashVersion } = await getCoreMigrationIdentity();
		cachedSchemaVersion = `${emdashVersion}:${fingerprint}`;
	} catch {
		cachedSchemaVersion = "emdash:1.3.0";
	}
	return cachedSchemaVersion;
}

export class KexiInitializer extends DurableObject<Env> {
	private coordinator!: InitializationCoordinator;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			const version = await getSchemaVersion();
			this.coordinator = new InitializationCoordinator(
				ctx.storage,
				version,
				async (token) => {
					await withMigrationOwner(token, () => withEmDashRuntime(async () => {}));
					// runMigrations() can skip its adapter when every migration was
					// recorded before an interruption. Clear only this job's own claim.
					await releaseOwnedMigrationLock(env.DB, token);
				},
			);
		});
	}

	async ensureReady(version: string) {
		return this.coordinator.ensureReady(version);
	}

	async alarm(): Promise<void> {
		await this.coordinator.alarm();
	}
}

// An isolate serves only one deployment/binding set. Never cache a pending
// promise across requests: workerd cancels promises with their owning event.
let readyVersion: string | undefined;

export async function isInitialized(env: Env): Promise<boolean> {
	const version = await getSchemaVersion();
	if (readyVersion === version) return true;
	const status = await env.INITIALIZER.getByName("database").ensureReady(version);
	if (status.state !== "ready") return false;
	readyVersion = version;
	return true;
}

export function initializationResponse(request: Request): Response {
	const headers = {
		"Cache-Control": "no-store",
		"Retry-After": "3",
		"X-Content-Type-Options": "nosniff",
	};
	if (new URL(request.url).pathname.startsWith("/_emdash/api/")) {
		return Response.json(
			{ error: { code: "SITE_INITIALIZING", message: "Site initialization is in progress. Retry shortly." } },
			{ status: 503, headers },
		);
	}
	return new Response(
		'<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="3"><title>站点正在初始化 · Kexi</title></head><body><main><h1>站点正在初始化</h1><p>首次部署正在自动准备数据库，无需手动迁移。此页面会自动刷新。</p><p>Site initialization is in progress. This page will refresh automatically.</p></main></body></html>',
		{ status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } },
	);
}
