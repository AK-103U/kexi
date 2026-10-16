import { createMigrationOwner } from "./migration-owner.ts";

export interface InitializationJob {
	version: string;
	token: number;
	state: "pending" | "running" | "retrying" | "ready";
	attempt: number;
}

export interface InitializationStatus {
	state: "initializing" | "retrying" | "ready";
	attempt: number;
}

type JobStore = Pick<DurableObjectTransaction, "get" | "put" | "getAlarm" | "setAlarm">;
type InitializationStorage = JobStore & Pick<DurableObjectStorage, "transaction">;
const JOB_KEY = "initialization";

/** Platform-independent state machine; only alarm() is allowed to do CMS I/O. */
export class InitializationCoordinator {
	private running = false;
	private version: string;
	private readonly storage: InitializationStorage;
	private readonly initialize: (token: number) => Promise<void>;
	private readonly now: () => number;

	constructor(
		storage: InitializationStorage,
		version: string,
		initialize: (token: number) => Promise<void>,
		now: () => number = Date.now,
	) {
		this.storage = storage;
		this.version = version;
		this.initialize = initialize;
		this.now = now;
	}

	private nextJob(job: InitializationJob | undefined, targetVersion: string): InitializationJob {
		if (job && job.state !== "ready") {
			// Retain ownership across crashes AND deployments while work is pending.
			return { ...job, version: targetVersion };
		}
		return {
			version: targetVersion,
			token: createMigrationOwner(this.now(), job?.token),
			state: "pending",
			attempt: 0,
		};
	}

	async ensureReady(requestedVersion: string): Promise<InitializationStatus> {
		this.version = requestedVersion;
		return this.storage.transaction(async (txn) => {
			const existing = await txn.get<InitializationJob>(JOB_KEY);
			if (existing?.state === "ready" && existing.version === requestedVersion) {
				return { state: "ready", attempt: existing.attempt };
			}
			const job = existing?.version === requestedVersion ? existing : this.nextJob(existing, requestedVersion);
			if (job !== existing) await txn.put(JOB_KEY, job);
			// A running alarm reports null for getAlarm(). Do not accidentally
			// schedule a second invocation from every polling visitor or cron.
			if (!this.running && (await txn.getAlarm()) === null) {
				await txn.setAlarm(this.now());
			}
			return {
				state: job.state === "retrying" ? "retrying" : "initializing",
				attempt: job.attempt,
			};
		});
	}

	async alarm(): Promise<void> {
		this.running = true;
		try {
			const job = await this.storage.transaction(async (txn) => {
				const existing = await txn.get<InitializationJob>(JOB_KEY);
				if (existing?.state === "ready" && existing.version === this.version) return null;
				const pending = this.nextJob(existing, this.version);
				const running: InitializationJob = {
					...pending,
					state: "running",
					attempt: pending.attempt + 1,
				};
				await txn.put(JOB_KEY, running);
				return running;
			});
			if (!job) return;

			try {
				await this.initialize(job.token);
				await this.storage.put(JOB_KEY, { ...job, state: "ready" });
				console.info("[kexi:init] ready", { attempt: job.attempt, version: job.version });
			} catch (error) {
				// Storage operations on a code-updated DO throw. Let that escape:
				// Cloudflare retries the alarm in a fresh instance with the same job.
				await this.storage.transaction(async (txn) => {
					await txn.put(JOB_KEY, { ...job, state: "retrying" });
					const delay = Math.min(60_000, 5_000 * 2 ** Math.min(job.attempt, 4));
					await txn.setAlarm(this.now() + delay);
				});
				console.error("[kexi:init] retry scheduled", {
					attempt: job.attempt,
					error: error instanceof Error ? error.name : "UnknownError",
				});
			}
		} finally {
			this.running = false;
		}
	}
}
