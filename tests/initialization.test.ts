import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { getPlatformProxy } from "wrangler";
import {
	InitializationCoordinator,
	type InitializationJob,
} from "../src/cloudflare/initialization-coordinator.ts";
import {
	acquireOwnedMigrationLock,
	createMigrationOwner,
	getMigrationOwner,
	releaseOwnedMigrationLock,
	withMigrationOwner,
} from "../src/cloudflare/migration-owner.ts";

class MemoryStorage {
	values = new Map<string, unknown>();
	alarmTime: number | null = null;
	failWrites = false;
	transactionCount = 0;
	private queue = Promise.resolve();

	async get<T>(key: string): Promise<T | undefined> {
		return structuredClone(this.values.get(key)) as T | undefined;
	}
	async put<T>(key: string, value: T): Promise<void> {
		if (this.failWrites) throw new Error("Durable Object reset because its code was updated");
		this.values.set(key, structuredClone(value));
	}
	async getAlarm() { return this.alarmTime; }
	async setAlarm(time: number) {
		if (this.failWrites) throw new Error("Durable Object reset because its code was updated");
		this.alarmTime = time;
	}
	async transaction<T>(fn: (txn: MemoryStorage) => Promise<T>): Promise<T> {
		this.transactionCount++;
		const previous = this.queue;
		let unlock!: () => void;
		this.queue = new Promise<void>((resolve) => { unlock = resolve; });
		await previous;
		try { return await fn(this); } finally { unlock(); }
	}
	job() { return this.get<InitializationJob>("initialization"); }
}

function coordinator(
	storage: MemoryStorage,
	initialize: (token: number) => Promise<void>,
	version = "v1",
	now = () => 1_792_000_000_000,
	maxAttempts = 5,
) {
	return new InitializationCoordinator(
		storage as unknown as ConstructorParameters<typeof InitializationCoordinator>[0],
		version,
		initialize,
		now,
		maxAttempts,
	);
}

async function fire(storage: MemoryStorage, instance: InitializationCoordinator) {
	storage.alarmTime = null;
	await instance.alarm();
}

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

test("first requests only persist a job; no CMS work belongs to their lifetime", async () => {
	const storage = new MemoryStorage();
	let calls = 0;
	const instance = coordinator(storage, async (token) => {
		calls++;
		assert.equal((await storage.job())?.token, token, "ownership must be durable BEFORE D1 I/O");
	});
	assert.deepEqual(await instance.ensureReady("v1"), { state: "initializing", attempt: 0 });
	assert.equal(calls, 0);
	assert.ok(storage.alarmTime);
	await fire(storage, instance);
	assert.equal(calls, 1);
	assert.equal((await instance.ensureReady("v1")).state, "ready");
	assert.equal(storage.alarmTime, null);
});

test("disconnects and concurrent visitors do not cancel or duplicate a running alarm", async () => {
	const storage = new MemoryStorage();
	const entered = deferred();
	const work = deferred();
	let calls = 0;
	const instance = coordinator(storage, async () => {
		calls++;
		entered.resolve();
		await work.promise;
	});
	await instance.ensureReady("v1");
	const running = fire(storage, instance);
	await entered.promise;
	const visitors = await Promise.all(Array.from({ length: 30 }, () => instance.ensureReady("v1")));
	assert.ok(visitors.every((status) => status.state === "initializing"));
	assert.equal(calls, 1);
	assert.equal(storage.alarmTime, null, "polling must not schedule a duplicate alarm");
	work.resolve();
	await running;
	assert.equal((await instance.ensureReady("v1")).state, "ready");
});

test("errors persist retry state and polling does not bypass backoff", async () => {
	const storage = new MemoryStorage();
	let calls = 0;
	const instance = coordinator(storage, async () => {
		if (++calls === 1) throw new Error("transient D1 failure");
	});
	await instance.ensureReady("v1");
	const token = (await storage.job())!.token;
	await fire(storage, instance);
	assert.equal((await storage.job())?.state, "retrying");
	const retryTime = storage.alarmTime;
	assert.equal(retryTime, 1_792_000_010_000);
	await instance.ensureReady("v1");
	assert.equal(storage.alarmTime, retryTime);
	await fire(storage, instance);
	assert.equal((await storage.job())?.token, token);
	assert.equal((await storage.job())?.attempt, 2);
	assert.equal((await storage.job())?.state, "ready");
});

test("a code-update reset escapes; a fresh instance resumes the same persisted owner", async () => {
	const storage = new MemoryStorage();
	const old = coordinator(storage, async () => {
		storage.failWrites = true;
		throw new Error("interrupted during D1 I/O");
	});
	await old.ensureReady("v1");
	const token = (await storage.job())!.token;
	await assert.rejects(fire(storage, old), /code was updated/);
	assert.equal((await storage.job())?.state, "running");
	storage.failWrites = false;
	let resumedToken: number | undefined;
	const fresh = coordinator(storage, async (owner) => { resumedToken = owner; }, "v2");
	await fresh.ensureReady("v2");
	assert.equal((await storage.job())?.token, token);
	await fire(storage, fresh);
	assert.equal(resumedToken, token);
	assert.equal((await storage.job())?.state, "ready");
	assert.equal((await storage.job())?.version, "v2");
});

test("new schema versions recheck readiness and run migrations for the new version", async () => {
	const storage = new MemoryStorage();
	const old = coordinator(storage, async () => {});
	await old.ensureReady("v1");
	await fire(storage, old);
	const token = (await storage.job())!.token;
	assert.equal((await storage.job())?.state, "ready");
	assert.equal((await storage.job())?.version, "v1");

	const fresh = coordinator(storage, async () => {}, "v2");
	assert.equal((await fresh.ensureReady("v2")).state, "initializing");
	assert.ok((await storage.job())!.token > token, "tokens remain unique across version upgrades");
	assert.equal((await storage.job())?.version, "v2");
	await fire(storage, fresh);
	assert.equal((await fresh.ensureReady("v2")).state, "ready");
	assert.equal((await fresh.ensureReady("v2")).state, "ready");
});

test("initialization terminates after maxAttempts and does not schedule runaway alarms", async () => {
	const storage = new MemoryStorage();
	let attemptsMade = 0;
	const maxAttempts = 3;
	const instance = coordinator(
		storage,
		async () => {
			attemptsMade++;
			throw new Error("persistent database error");
		},
		"v1",
		() => 1_792_000_000_000,
		maxAttempts,
	);

	await instance.ensureReady("v1");
	assert.ok(storage.alarmTime, "initial alarm must be scheduled");

	// Attempt 1 -> retrying
	await fire(storage, instance);
	assert.equal(attemptsMade, 1);
	assert.equal((await storage.job())?.state, "retrying");
	assert.ok(storage.alarmTime !== null, "retry alarm must be scheduled for attempt 2");

	// Attempt 2 -> retrying
	await fire(storage, instance);
	assert.equal(attemptsMade, 2);
	assert.equal((await storage.job())?.state, "retrying");
	assert.ok(storage.alarmTime !== null, "retry alarm must be scheduled for attempt 3");

	// Attempt 3 (reaches maxAttempts) -> failed
	await fire(storage, instance);
	assert.equal(attemptsMade, 3);
	const job = await storage.job();
	assert.equal(job?.state, "failed");
	assert.equal(job?.attempt, 3);
	assert.equal(job?.error, "persistent database error");
	// CRITICAL: Alarm must be null! No infinite loop!
	assert.equal(storage.alarmTime, null, "no alarm may be scheduled after reaching maxAttempts");

	// Ensure polling visitors do NOT trigger a new alarm
	for (let i = 0; i < 20; i++) {
		const status = await instance.ensureReady("v1");
		assert.equal(status.state, "failed");
		assert.equal(status.attempt, 3);
		assert.equal(storage.alarmTime, null, "polling must never revive alarm in failed state");
	}
});

test("a failed initialization can be safely revived by a new schema version", async () => {
	const storage = new MemoryStorage();
	const old = coordinator(
		storage,
		async () => { throw new Error("fatal schema error"); },
		"v1",
		() => 1_792_000_000_000,
		1,
	);
	await old.ensureReady("v1");
	await fire(storage, old);
	assert.equal((await storage.job())?.state, "failed");
	assert.equal(storage.alarmTime, null);

	// A newly deployed version should start a fresh job
	let freshCalls = 0;
	const fresh = coordinator(storage, async () => { freshCalls++; }, "v2");
	const status = await fresh.ensureReady("v2");
	assert.equal(status.state, "initializing");
	assert.ok(storage.alarmTime, "fresh version must schedule initial alarm");
	await fire(storage, fresh);
	assert.equal(freshCalls, 1);
	assert.equal((await fresh.ensureReady("v2")).state, "ready");
});

test("in-memory fast path eliminates redundant storage transactions during polling", async () => {
	const storage = new MemoryStorage();
	const instance = coordinator(storage, async () => {});
	await instance.ensureReady("v1");
	await fire(storage, instance);
	assert.equal((await instance.ensureReady("v1")).state, "ready");

	const txnBefore = storage.transactionCount;
	// 50 subsequent visitor checks
	for (let i = 0; i < 50; i++) {
		const status = await instance.ensureReady("v1");
		assert.equal(status.state, "ready");
	}
	assert.equal(storage.transactionCount, txnBefore, "in-memory cache must avoid storage transactions for ready state");
});

test("event-scoped ownership does not leak to concurrent requests", async () => {
	assert.equal(getMigrationOwner(), undefined);
	await Promise.all([1.5, 2.5].map((owner) => withMigrationOwner(owner, async () => {
		await setImmediate();
		assert.equal(getMigrationOwner(), owner);
	})));
	assert.equal(getMigrationOwner(), undefined);
});

test("real local D1 preserves and fences resumable migration claims", { timeout: 60_000 }, async (t) => {
	const directory = await mkdtemp(join(tmpdir(), "kexi-initialization-test-"));
	const configPath = join(directory, "wrangler.json");
	await writeFile(configPath, JSON.stringify({
		name: "kexi-initialization-tests",
		compatibility_date: "2026-02-24",
		d1_databases: [{ binding: "DB", database_name: "initialization-tests", database_id: "local-only" }],
	}));
	const platform = await getPlatformProxy<{ DB: D1Database }>({
		configPath,
		persist: false,
		remoteBindings: false,
	});
	try {
		const db = platform.env.DB;
		await db.batch([
			db.prepare('CREATE TABLE "_emdash_migrations_lock" ("id" TEXT PRIMARY KEY, "is_locked" INTEGER NOT NULL DEFAULT 0)'),
			db.prepare('INSERT INTO "_emdash_migrations_lock" ("id", "is_locked") VALUES (\'migration_lock\', 0)'),
		]);
		const options = { lockTable: "_emdash_migrations_lock", lockRowId: "migration_lock" };
		const read = () => db.prepare('SELECT "is_locked" FROM "_emdash_migrations_lock"').first<number>("is_locked");
		const write = (value: number) => db.prepare('UPDATE "_emdash_migrations_lock" SET "is_locked" = ?').bind(value).run();
		const token = createMigrationOwner();

		await t.test("a crash can resume only its exact durable owner", async () => {
			await acquireOwnedMigrationLock(db, token, options);
			assert.equal(await read(), token, "D1 must preserve the fractional token exactly");
			await acquireOwnedMigrationLock(db, token, options);
			assert.equal(await read(), token);
			await releaseOwnedMigrationLock(db, token);
			assert.equal(await read(), 0);
		});

		await t.test("an external CLI lock is never stolen, regardless of age", async () => {
			const foreign = Date.now() - 86_400_000;
			await write(foreign);
			await assert.rejects(acquireOwnedMigrationLock(db, token, options), /MIGRATION_LOCK_BUSY/);
			await releaseOwnedMigrationLock(db, token);
			assert.equal(await read(), foreign);
		});

		await t.test("another coordinator's lock cannot be adopted or released", async () => {
			const foreign = token + 10;
			await write(foreign);
			await assert.rejects(acquireOwnedMigrationLock(db, token, options), /MIGRATION_LOCK_BUSY/);
			await releaseOwnedMigrationLock(db, token);
			assert.equal(await read(), foreign);
		});

		await t.test("an old release cannot clear a replacement owner's claim", async () => {
			await write(0);
			await acquireOwnedMigrationLock(db, token, options);
			await write(token + 1);
			await releaseOwnedMigrationLock(db, token);
			assert.equal(await read(), token + 1);
		});

		await t.test("the last-migration cancellation window is cleaned without reacquiring", async () => {
			await write(token);
			await releaseOwnedMigrationLock(db, token);
			assert.equal(await read(), 0);
		});

		await t.test("integer and invalid owners cannot clear anyone's lock", async () => {
			for (const invalid of [Date.now(), NaN, Infinity, -0.5, 2.25]) {
				await assert.rejects(acquireOwnedMigrationLock(db, invalid, options), /Invalid/);
				await assert.rejects(releaseOwnedMigrationLock(db, invalid), /Invalid/);
			}
		});
	} finally {
		await platform.dispose();
		await rm(directory, { recursive: true, force: true });
	}
});
