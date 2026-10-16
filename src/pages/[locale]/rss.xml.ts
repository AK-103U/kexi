import type { APIRoute } from "astro";
import { isLang } from "../../i18n/config";
import { buildRssFeed } from "../../utils/rss";

export const GET: APIRoute = async ({ site, url, params }) => {
	const locale = params.locale;
	if (!isLang(locale)) {
		return new Response("Not found", { status: 404 });
	}

	const siteUrl = site && site.hostname !== "localhost" && site.hostname !== "127.0.0.1" ? site : new URL(url.origin);
	const rss = await buildRssFeed(locale, siteUrl);

	return new Response(rss, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
