#!/usr/bin/env node
/**
 * 给站主 byline 设置头像。
 *
 * 为什么需要：`_emdash_bylines.avatar_media_id` 默认是 NULL，左栏就没有头像可显示。
 * 本脚本把已有的媒体行关联上去 —— 不新增任何图片文件，只是复用媒体库里
 * 现成的图（经 `/_image?...&fit=cover` 服务端裁成方形）。
 *
 * 幂等：已经是目标值就跳过。
 *
 * 用法：
 *   pnpm seed:avatar                       # 默认给 emdash-editorial 用 building-long-term.jpg
 *   pnpm seed:avatar --media <mediaId>     # 换一张
 *   pnpm seed:avatar --byline <slug>       # 换一条 byline
 *   pnpm seed:avatar --db x.db
 *
 * 注意：dev server 有进程内缓存，脚本直写数据库后需重启 dev server 才能看到变化。
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import { siteConfig } from "../src/i18n/config.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 默认复用这张配图当头像。
 * 选它是因为裁成 40px 圆形后仍看得清 —— 试过 `notes-on-simplicity.jpg`
 * （白纸几何纹理），在那个尺寸下几乎是空白灰点。
 */
const DEFAULT_MEDIA_FILENAME = "building-long-term.jpg";

function parseArgs(argv) {
	let db = process.env.EMDASH_DB ?? "data.db";
	let byline = "emdash-editorial";
	let media = null;
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--db") db = argv[++i];
		else if (arg.startsWith("--db=")) db = arg.slice("--db=".length);
		else if (arg === "--byline") byline = argv[++i];
		else if (arg.startsWith("--byline=")) byline = arg.slice("--byline=".length);
		else if (arg === "--media") media = argv[++i];
		else if (arg.startsWith("--media=")) media = arg.slice("--media=".length);
	}
	return { db: resolve(root, db), byline, media };
}

const { db: dbPath, byline, media: mediaArg } = parseArgs(process.argv.slice(2));
if (!existsSync(dbPath)) {
	console.error(`✖ 找不到数据库：${dbPath}`);
	process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON");

// 解析目标 media：给了 --media 就按 id 找，否则按默认文件名找。
const mediaRow = mediaArg
	? db.prepare("SELECT id, filename FROM media WHERE id = ?").get(mediaArg)
	: db
			.prepare("SELECT id, filename FROM media WHERE filename = ? LIMIT 1")
			.get(DEFAULT_MEDIA_FILENAME);

if (!mediaRow) {
	console.error(
		mediaArg
			? `✖ 找不到 media id：${mediaArg}`
			: `✖ 媒体库里没有 ${DEFAULT_MEDIA_FILENAME}，用 --media <id> 指定一张`,
	);
	db.close();
	process.exit(1);
}

// 一条 byline 在每个语言各有一行，共用 translation_group —— 全部一起更新。
const rows = db
	.prepare(
		`SELECT id, display_name, locale, avatar_media_id
		   FROM _emdash_bylines
		  WHERE slug = ?`,
	)
	.all(byline);

if (rows.length === 0) {
	console.error(`✖ 找不到 byline：${byline}`);
	db.close();
	process.exit(1);
}

const update = db.prepare(
	"UPDATE _emdash_bylines SET avatar_media_id = ?, updated_at = ? WHERE id = ?",
);
const now = new Date().toISOString();

let changed = 0;
let skipped = 0;
for (const row of rows) {
	if (row.avatar_media_id === mediaRow.id) {
		skipped++;
		console.log(`  = ${byline} [${row.locale}] 已是该头像`);
		continue;
	}
	update.run(mediaRow.id, now, row.id);
	changed++;
	console.log(`  + ${byline} [${row.locale}] → ${mediaRow.filename}`);
}

db.close();

console.log(
	`\n✔ 头像设置完成：更新 ${changed} 行，已是目标值 ${skipped} 行（共 ${siteConfig.locales.length} 种语言）`,
);
if (changed > 0) {
	console.log("  提示：dev server 有进程内缓存，重启后才能看到变化。");
}
