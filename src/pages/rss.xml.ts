import type { APIRoute } from "astro";
import { siteConfig } from "../i18n/config";
import { buildRssFeed } from "../utils/rss";

export const GET: APIRoute = async ({ site, url }) => {
	const siteUrl = site && site.hostname !== "localhost" && site.hostname !== "127.0.0.1" ? site : new URL(url.origin);
	const rss = await buildRssFeed(siteConfig.defaultLocale, siteUrl);

	return new Response(rss, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
