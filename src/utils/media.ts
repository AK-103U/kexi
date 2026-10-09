/**
 * 媒体 URL 工具。
 *
 * ⚠️ 关键事实：`/_emdash/api/media/file/<key>` 只认 **storageKey**，不认 media id。
 * 路由实现是 `emdash.storage.download(key)`，传 ULID 会 404。
 * `BylineSummary.avatarStorageKey`（由 media 表的 LEFT JOIN 填充）才是可用的那个。
 */

/** 媒体文件的直链。只接受 storageKey。 */
export function mediaUrl(storageKey: string): string {
	return `/_emdash/api/media/file/${storageKey}`;
}
