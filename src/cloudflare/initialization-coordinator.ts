import { createMigrationOwner } from "./migration-owner.ts";

export const DEFAULT_MAX_ATTEMPTS = 5;
export const MIN_RETRY_DELAY_MS = 5_000;

export interface InitializationJob {
	version: string;
	token: number;
	state: "pending" | "running" | "retrying" | "ready" | "failed";
	attempt: number;
	error?: string;
}

export interface InitializationStatus {
	state: "initializing" | "retrying" | "ready" | "failed";
	attempt: number;
	error?: string;
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
	private readonly maxAttempts: number;
	private cachedJob?: InitializationJob;

	constructor(
		storage: InitializationStorage,
		version: string,
		initialize: (token: number) => Promise<void>,
		now: () => number = Date.now,
		maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
	) {
		this.storage = storage;
		this.version = version;
		this.initialize = initialize;
		this.now = now;
		this.maxAttempts = maxAttempts;
	}

	private nextJob(job: InitializationJob | undefined, targetVersion: string): InitializationJob {
		if (job && job.state !== "ready" && job.state !== "failed") {
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

		// In-memory fast path: avoid hitting DO SQLite storage when status is already known
		if (this.cachedJob && this.cachedJob.version === requestedVersion) {
			if (this.cachedJob.state === "ready") {
				return { state: "ready", attempt: this.cachedJob.attempt };
			}
			if (this.cachedJob.state === "failed") {
				return {
					state: "failed",
					attempt: this.cachedJob.attempt,
					...(this.cachedJob.error !== undefined ? { error: this.cachedJob.error } : {}),
				};
			}
			if (this.running) {
				return { state: "initializing", attempt: this.cachedJob.attempt };
			}
			if (this.cachedJob.state === "retrying") {
				return {
					state: "retrying",
					attempt: this.cachedJob.attempt,
					...(this.cachedJob.error !== undefined ? { error: this.cachedJob.error } : {}),
				};
			}
		}

		return this.storage.transaction(async (txn) => {
			const existing = await txn.get<InitializationJob>(JOB_KEY);
			if (existing?.state === "ready" && existing.version === requestedVersion) {
				this.cachedJob = existing;
				return { state: "ready", attempt: existing.attempt };
			}
			if (existing?.state === "failed" && existing.version === requestedVersion) {
				this.cachedJob = existing;
				return {
					state: "failed",
					attempt: existing.attempt,
					...(existing.error !== undefined ? { error: existing.error } : {}),
				};
			}
			const job = existing?.version === requestedVersion ? existing : this.nextJob(existing, requestedVersion);
			if (job !== existing) await txn.put(JOB_KEY, job);
			this.cachedJob = job;

			// Do not schedule an alarm if already running, failed, or ready
			if (job.state !== "failed" && !this.running && (await txn.getAlarm()) === null) {
				if (job.state === "retrying") {
					// Guard: if retrying had its alarm wiped or lost, enforce safe backoff delay, NEVER this.now()
					const delay = Math.max(MIN_RETRY_DELAY_MS, Math.min(60_000, 5_000 * 2 ** Math.min(job.attempt, 4)));
					await txn.setAlarm(this.now() + delay);
				} else if (job.state === "running") {
					// Guard: if isolate crashed mid-run, don't immediately thrash; give a safe buffer
					await txn.setAlarm(this.now() + MIN_RETRY_DELAY_MS);
				} else {
					// Initial bootstrap: schedule immediately for first run
					await txn.setAlarm(this.now());
				}
			}

			return {
				state: job.state === "retrying" ? "retrying" : job.state === "failed" ? "failed" : "initializing",
				attempt: job.attempt,
				...(job.error !== undefined ? { error: job.error } : {}),
			};
		});
	}

	async alarm(): Promise<void> {
		this.running = true;
		try {
			const job = await this.storage.transaction(async (txn) => {
				const existing = await txn.get<InitializationJob>(JOB_KEY);
				if (existing?.state === "ready" && existing.version === this.version) return null;
				if (existing?.state === "failed" && existing.version === this.version) return null;
				const pending = this.nextJob(existing, this.version);
				const running: InitializationJob = {
					...pending,
					state: "running",
					attempt: pending.attempt + 1,
				};
				await txn.put(JOB_KEY, running);
				this.cachedJob = running;
				return running;
			});
			if (!job) return;

			try {
				await this.initialize(job.token);
				const readyJob: InitializationJob = { ...job, state: "ready" };
				await this.storage.put(JOB_KEY, readyJob);
				this.cachedJob = readyJob;
				console.info("[kexi:init] ready", { attempt: job.attempt, version: job.version });
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);

				// Terminal failure check: stop if max attempts reached
				if (job.attempt >= this.maxAttempts) {
					await this.storage.transaction(async (txn) => {
						const failedJob: InitializationJob = {
							...job,
							state: "failed",
							error: errorMessage,
						};
						await txn.put(JOB_KEY, failedJob);
						this.cachedJob = failedJob;
					});
					console.error("[kexi:init] initialization failed permanently", {
						attempt: job.attempt,
						maxAttempts: this.maxAttempts,
						error: errorMessage,
					});
					return;
				}

				// Storage operations on a code-updated DO throw. Let that escape:
				// Cloudflare retries the alarm in a fresh instance with the same job.
				await this.storage.transaction(async (txn) => {
					const retryingJob: InitializationJob = { ...job, state: "retrying", error: errorMessage };
					await txn.put(JOB_KEY, retryingJob);
					this.cachedJob = retryingJob;
					const delay = Math.max(MIN_RETRY_DELAY_MS, Math.min(60_000, 5_000 * 2 ** Math.min(job.attempt, 4)));
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
