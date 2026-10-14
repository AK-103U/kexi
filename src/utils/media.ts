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
 * 方形头像 URL：经 Astro 图片端点服务端缩放到方形画布，完整保留原图，
 * 避免 `cover` 把横向 Logo 或图标中心裁切。浏览器无需缩放大图；
 * 在 Cloudflare 下由 Images binding 处理，不依赖 `sharp`。输出 webp。
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
		fit: "contain",
		f: format,
		q: "85",
	});
	return `/_image?${params}`;
}
