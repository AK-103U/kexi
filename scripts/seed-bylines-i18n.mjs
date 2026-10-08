#!/usr/bin/env node
/**
 * 为 seed 建的 byline 补齐其他语言的翻译行。
 *
 * 为什么需要这一步：`SeedByline` 没有 locale 字段（emdash 的 seed/types.ts），
 * 而 `_emdash_bylines.locale` 的列默认值来自 migration 040 执行时读到的
 * configured defaultLocale —— `npx emdash seed` 不加载 astro.config，
 * 于是默认值被烘成 `'en'`。结果是 seed 的署名只落在一种语言上；而
 * byline hydration 是**严格按 locale**、没有 fallback 的，另一种语言的
 * 详情页就会整个丢掉署名。
 *
 * 本脚本幂等：遍历每个 byline translation_group，为 siteConfig.locales
 * 里缺失的语言补一行。文案优先取 seed/bylines-i18n.json 的覆盖值，
 * 没有覆盖就复制同组已有行。
 *
 * 用法：
 *   pnpm seed:bylines            # 默认写 ./data.db
 *   pnpm seed:bylines --db x.db
 *
 * 注意：dev server 有进程内 byline 缓存，脚本直写数据库后需重启 dev server
 * 才能看到变化。
 */

import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { siteConfig } from "../src/i18n/config.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Crockford base32，用来生成和 emdash 一致的 26 字符 ULID。 */
const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function ulid() {
	let time = Date.now();
	let stamp = "";
	for (let i = 0; i < 10; i++) {
		stamp = B32[time % 32] + stamp;
		time = Math.floor(time / 32);
	}
	const bytes = randomBytes(10);
	let rand = "";
	for (let i = 0; i < 16; i++) {
		rand += B32[(bytes[i >> 1] >> (i % 2 === 0 ? 4 : 0)) & 31];
	}
	return stamp + rand;
}

function parseArgs(argv) {
	let db = process.env.EMDASH_DB ?? "data.db";
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--db") db = argv[++i];
		else if (arg.startsWith("--db=")) db = arg.slice("--db=".length);
	}
	return { db: resolve(root, db) };
}

const { db: dbPath } = parseArgs(process.argv.slice(2));
if (!existsSync(dbPath)) {
	console.error(`✖ 找不到数据库：${dbPath}`);
	process.exit(1);
}

const overridesPath = resolve(root, "seed/bylines-i18n.json");
const overrides = existsSync(overridesPath)
	? (JSON.parse(await readFile(overridesPath, "utf8")).bylines ?? {})
	: {};

const locales = [...siteConfig.locales];
const defaultLocale = siteConfig.defaultLocale;

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");

const rows = db
	.prepare(
		`SELECT id, slug, display_name, bio, avatar_media_id, website_url, user_id,
		        is_guest, locale, translation_group
		   FROM _emdash_bylines`,
	)
	.all();

/** translation_group -> 该组已有的行 */
const groups = new Map();
for (const row of rows) {
	const key = row.translation_group ?? row.id;
	if (!groups.has(key)) groups.set(key, []);
	groups.get(key).push(row);
}

const insert = db.prepare(
	`INSERT INTO _emdash_bylines
	   (id, slug, display_name, bio, avatar_media_id, website_url, user_id,
	    is_guest, created_at, updated_at, locale, translation_group)
	 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);

let created = 0;
let skipped = 0;
const now = new Date().toISOString();

for (const [group, siblings] of groups) {
	const present = new Set(siblings.map((row) => row.locale));
	// 复制文案的基准行：优先默认语言，其次任意一行。
	const base = siblings.find((row) => row.locale === defaultLocale) ?? siblings[0];

	for (const locale of locales) {
		if (present.has(locale)) {
			skipped++;
			continue;
		}
		const override = overrides[base.slug]?.[locale] ?? {};
		insert.run(
			ulid(),
			base.slug,
			override.displayName ?? base.display_name,
			override.bio ?? base.bio ?? null,
			base.avatar_media_id ?? null,
			base.website_url ?? null,
			base.user_id ?? null,
			base.is_guest ?? 0,
			now,
			now,
			locale,
			group,
		);
		created++;
		console.log(`  + ${base.slug} [${locale}] → ${override.displayName ?? base.display_name}`);
	}
}

db.close();

console.log(`\n✔ byline i18n 补齐完成：新增 ${created} 行，已存在 ${skipped} 行`);
if (created > 0) {
	console.log("  提示：dev server 有进程内缓存，重启后才能看到变化。");
}
