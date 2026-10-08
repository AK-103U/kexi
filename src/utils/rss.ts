import { getEmDashCollection, getSiteSettings } from "emdash";
import { siteConfig, type Lang } from "../i18n/config";
import { localePath } from "../i18n/ui";
import { resolveBlogSiteIdentity } from "./site-identity";

/**
 * 按语言生成 RSS 2.0 feed。
 * 默认语言与各非默认语言路由共用这一份逻辑，只是传入的 `lang` 不同。
 */
export async function buildRssFeed(lang: Lang, siteUrl: URL): Promise<string> {
	const { siteTitle, siteTagline } = resolveBlogSiteIdentity(
		await getSiteSettings(),
	);

	const { entries: posts } = await getEmDashCollection("posts", {
		locale: lang,
		orderBy: { published_at: "desc" },
		limit: 20,
	});

	const items = posts
		.map((post) => {
			if (!post.data.publishedAt) return null;
			const pubDate = post.data.publishedAt.toUTCString();

			const postUrl = new URL(
				localePath(lang, `/posts/${post.data.slug ?? post.id}`),
				siteUrl,
			).href;
			const title = escapeXml(post.data.title || "Untitled");
			const description = escapeXml(post.data.excerpt || "");

			return `    <item>
      <title>${title}</title>
      <link>${postUrl}</link>
      <guid isPermaLink="true">${postUrl}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
    </item>`;
		})
		.filter(Boolean)
		.join("\n");

	const selfUrl = new URL(localePath(lang, "/rss.xml"), siteUrl).href;
	const homeUrl = new URL(localePath(lang, "/"), siteUrl).href;

	return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <description>${escapeXml(siteTagline)}</description>
	<link>${homeUrl}</link>
	<atom:link href="${selfUrl}" rel="self" type="application/rss+xml"/>
    <language>${siteConfig.rssLanguages[lang]}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;
}

const XML_ESCAPE_PATTERNS = [
	[/&/g, "&amp;"],
	[/</g, "&lt;"],
	[/>/g, "&gt;"],
	[/"/g, "&quot;"],
	[/'/g, "&apos;"],
] as const;

function escapeXml(str: string): string {
	let result = str;
	for (const [pattern, replacement] of XML_ESCAPE_PATTERNS) {
		result = result.replace(pattern, replacement);
	}
	return result;
}
