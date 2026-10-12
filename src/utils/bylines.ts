import type { BylineSummary, ContentBylineCredit } from "emdash";
import { getDb } from "emdash/runtime";
import { siteConfig } from "../i18n/config";

/**
 * 署名回退（非默认语言）。
 *
 * 署名里的 `displayName` 是人名，属于专有名词，不应因页面语言不同而消失。
 * 但 EmDash 的 credit hydration 严格按 locale 匹配（migration 040）：内容行
 * 语言缺少该署名的语言行时，整条 credit 被丢弃，页面上的署名区块随之消失。
 * 官方注释说明严格匹配是为了避免在翻译页面上显示错误语言的 bio，同时明确
 * 表示「想要回退的调用方自己实现」。
 *
 * 这里在当前语言查不到署名行、而该署名在默认语言存在时，用默认语言的
 * byline 行补齐 `displayName` 与头像；`roleLabel` 仍取当前语言内容行上的
 * 值（它按内容行存储，本来就分语言）。默认语言下保持 EmDash 原生行为，
 * 不做任何额外查询。
 *
 * 只补齐人名与头像，不补齐 `bio` 与 `customFields`——它们确实随语言变化，
 * 缺失时应由编辑在后台补语言行。
 */

export interface EntryBylinesInput {
	/** 内容行 id（`entry.data.id`）。 */
	id: string;
	/** 该内容行自身的语言（`entry.data.locale`），决定署名按哪种语言解析。 */
	locale: string;
	/** EmDash 已 hydrate 的署名，可能因语言行缺失而为空。 */
	bylines: ContentBylineCredit[];
}

/**
 * 读取内容行自身的语言。
 *
 * `locale` 在运行时由 loader 写入 `entry.data`，但生成的集合类型（如
 * `Post`）未声明它，所以在这里集中做一次收窄，避免各页面各写一份断言。
 */
export function readEntryLocale(
	data: object,
	fallback: string,
): string {
	const locale = (data as { locale?: unknown }).locale;
	return typeof locale === "string" && locale ? locale : fallback;
}

/**
 * 为一批内容条目解析署名，对非默认语言做逐条回退。
 *
 * 返回 `entryId -> 署名` 的映射。没有显式署名的条目保留传入的原值（可能
 * 是作者推断出来的署名，或空数组），不会被回退逻辑清空。
 */
export async function resolveEntryBylines(
	collection: string,
	entries: EntryBylinesInput[],
): Promise<Map<string, ContentBylineCredit[]>> {
	const result = new Map<string, ContentBylineCredit[]>();
	for (const entry of entries) result.set(entry.id, entry.bylines);

	const needsFallback = entries.some(
		(entry) => entry.locale !== siteConfig.defaultLocale,
	);
	if (!needsFallback) return result;

	const ids = [...new Set(entries.map((e) => e.id).filter(Boolean))];
	if (ids.length === 0) return result;

	const db = await getDb();

	// 显式署名存在 `_emdash_content_bylines`，与语言无关地挂在当前内容行上。
	const junctionRows = await db
		.selectFrom("_emdash_content_bylines")
		.select(["content_id", "byline_id", "role_label", "sort_order"])
		.where("collection_slug", "=", collection)
		.where("content_id", "in", ids)
		.orderBy("sort_order", "asc")
		.execute();
	// 没有显式署名：保留原值，避免清掉作者推断出来的署名。
	if (junctionRows.length === 0) return result;

	// 取出这些署名组在所有语言下的行，再按「条目语言优先，其次默认语言」
	// 选行。一次查询覆盖整页，避免 N+1。
	const groups = [...new Set(junctionRows.map((row) => row.byline_id))];
	const bylineRows = await db
		.selectFrom("_emdash_bylines as b")
		.leftJoin("media as m", "m.id", "b.avatar_media_id")
		.select([
			"b.id as id",
			"b.slug as slug",
			"b.display_name as display_name",
			"b.bio as bio",
			"b.avatar_media_id as avatar_media_id",
			"b.website_url as website_url",
			"b.user_id as user_id",
			"b.is_guest as is_guest",
			"b.created_at as created_at",
			"b.updated_at as updated_at",
			"b.locale as locale",
			"b.translation_group as translation_group",
			"m.storage_key as storage_key",
			"m.alt as alt",
			"m.blurhash as blurhash",
			"m.dominant_color as dominant_color",
		])
		.where("b.translation_group", "in", groups)
		.execute();

	const rowsByGroup = new Map<string, typeof bylineRows>();
	for (const row of bylineRows) {
		const group = row.translation_group ?? row.id;
		const list = rowsByGroup.get(group) ?? [];
		list.push(row);
		rowsByGroup.set(group, list);
	}

	/** 按内容行语言选署名行：当前语言 → 默认语言 → 首个可用。 */
	const pickSummary = (
		group: string,
		entryLocale: string,
	): BylineSummary | null => {
		const rows = rowsByGroup.get(group);
		if (!rows) return null;
		const pick =
			rows.find((row) => row.locale === entryLocale) ??
			rows.find((row) => row.locale === siteConfig.defaultLocale) ??
			rows[0];
		return pick ? toSummary(pick) : null;
	};

	// 按内容行归并，保持 `sort_order` 顺序。同一内容行的所有 credit 用同
	// 一语言解析。
	const localeByEntry = new Map(entries.map((e) => [e.id, e.locale]));
	const byEntry = new Map<string, ContentBylineCredit[]>();
	for (const row of junctionRows) {
		const entryLocale = localeByEntry.get(row.content_id);
		if (entryLocale === undefined) continue;
		const byline = pickSummary(row.byline_id, entryLocale);
		if (!byline) continue;
		const credits = byEntry.get(row.content_id) ?? [];
		credits.push({
			byline,
			sortOrder: row.sort_order,
			roleLabel: row.role_label,
		});
		byEntry.set(row.content_id, credits);
	}
	for (const [id, credits] of byEntry) {
		result.set(id, credits.sort((a, b) => a.sortOrder - b.sortOrder));
	}

	return result;
}

/** 把查询行映射成 `BylineSummary`，字段与 EmDash 的 hydrate 结果对齐。 */
function toSummary(row: {
	id: string;
	slug: string;
	display_name: string;
	bio: string | null;
	avatar_media_id: string | null;
	website_url: string | null;
	user_id: string | null;
	is_guest: number;
	created_at: string;
	updated_at: string;
	locale: string;
	translation_group: string | null;
	storage_key: string | null;
	alt: string | null;
	blurhash: string | null;
	dominant_color: string | null;
}): BylineSummary {
	return {
		id: row.id,
		slug: row.slug,
		displayName: row.display_name,
		bio: row.bio,
		avatarMediaId: row.avatar_media_id,
		avatarStorageKey: row.storage_key ?? null,
		avatarAlt: row.alt ?? null,
		avatarBlurhash: row.blurhash ?? null,
		avatarDominantColor: row.dominant_color ?? null,
		websiteUrl: row.website_url,
		userId: row.user_id,
		isGuest: row.is_guest === 1,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		locale: row.locale,
		translationGroup: row.translation_group,
	};
}
