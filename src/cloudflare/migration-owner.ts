import { AsyncLocalStorage } from "node:async_hooks";

const OWNER_KEY = Symbol.for("kexi:migration-owner");
const globals = globalThis as typeof globalThis & {
	[OWNER_KEY]?: AsyncLocalStorage<number>;
};
const owners = (globals[OWNER_KEY] ??= new AsyncLocalStorage<number>());

export function withMigrationOwner<T>(token: number, run: () => T): T {
	return owners.run(token, run);
}

export function getMigrationOwner(): number | undefined {
	return owners.getStore();
}

/**
 * Persist this BEFORE touching D1. The half millisecond distinguishes this
 * coordinator's resumable claims from EmDash CLI's integer Date.now() claims.
 * SQLite's INTEGER affinity preserves non-integral numbers as REAL values.
 * There must be exactly one coordinator object for a bound database.
 */
export function createMigrationOwner(now = Date.now(), previous?: number): number {
	return Math.max(Math.floor(now), previous === undefined ? 0 : Math.floor(previous) + 1) + 0.5;
}

function assertOwner(token: number): void {
	if (!Number.isFinite(token) || token <= 0 || token % 1 !== 0.5) {
		throw new Error("Invalid Kexi migration lock owner");
	}
}

const LOCK_TABLE = "_emdash_migrations_lock";

export interface MigrationLockOptions {
	lockTable: string;
	lockRowId: string;
}

export async function acquireOwnedMigrationLock(
	db: D1Database,
	token: number,
	options: MigrationLockOptions,
): Promise<void> {
	assertOwner(token);
	if (options.lockTable !== LOCK_TABLE) throw new Error("Invalid Kexi migration lock table");
	// A retry may adopt only this object's persisted token, NEVER a lock
	// merely considered old. Durable Objects serialize alarm invocations.
	const claimed = await db
		.prepare(
			'UPDATE "_emdash_migrations_lock" SET "is_locked" = ? WHERE "id" = ? AND "is_locked" IN (0, ?)',
		)
		.bind(token, options.lockRowId, token)
		.run();
	if (claimed.meta.changes === 1) return;

	const row = await db
		.prepare('SELECT "is_locked" FROM "_emdash_migrations_lock" WHERE "id" = ?')
		.bind(options.lockRowId)
		.first<{ is_locked: number }>();
	throw Object.assign(new Error("EMDASH_MIGRATION_LOCK_BUSY"), {
		heldSince: Number(row?.is_locked ?? 0),
	});
}

/** Also repairs cancellation after the final migration but before its unlock. */
export async function releaseOwnedMigrationLock(db: D1Database, token: number): Promise<void> {
	assertOwner(token);
	for (let attempt = 1; ; attempt++) {
		try {
			await db
				.prepare('UPDATE "_emdash_migrations_lock" SET "is_locked" = 0 WHERE "is_locked" = ?')
				.bind(token)
				.run();
			return;
		} catch (error) {
			// A missing lock table is normal before the first migration starts.
			if (error instanceof Error && /no such table: _emdash_migrations_lock/.test(error.message)) {
				return;
			}
			if (attempt === 3) throw error;
		}
	}
}
