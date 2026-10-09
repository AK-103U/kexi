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

/**
 * 方形头像 URL：经 Astro 的图片端点做**服务端裁剪**（sharp），
 * 而不是让浏览器把 1200×800 的原图缩成 40px。
 *
 * `fit=cover` 中心裁方，输出 webp —— 实测 172KB JPEG → 3.7KB（96px）。
 */
export function avatarUrl(
	storageKey: string,
	size: number,
	format: "webp" | "avif" | "jpeg" | "png" = "webp",
): string {
	const params = new URLSearchParams({
		href: mediaUrl(storageKey),
		w: String(size),
		h: String(size),
		fit: "cover",
		f: format,
		q: "85",
	});
	return `/_image?${params}`;
}
