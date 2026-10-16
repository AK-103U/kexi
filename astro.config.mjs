import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { fileURLToPath } from "node:url";
import { siteConfig } from "./src/i18n/config.ts";

const database = {
	...d1({ binding: "DB", session: "auto" }),
	// 仅替换迁移锁的所有权，其他 D1 能力继续复用官方适配器。
	entrypoint: fileURLToPath(new URL("./src/cloudflare/d1-runtime.ts", import.meta.url)),
};

const latoFont = {
	provider: fontProviders.google(),
	name: "Lato",
	cssVariable: "--font-lato",
	weights: [300, 400, 700],
	styles: ["normal"],
	fallbacks: [
		"-apple-system",
		"BlinkMacSystemFont",
		"Segoe UI",
		"Droid Sans",
		"Helvetica Neue",
		"sans-serif",
	],
	optimizedFallbacks: false,
};

export default defineConfig({
	// hreflang / sitemap 需要绝对 URL，必须配置 site。
	site: siteConfig.siteUrl,
	output: "server",
	// EmDash 从顶层 i18n 块读取 locale 配置并灌入运行时。
	// 默认策略 prefix-other-locales：默认语言无前缀，其余加 /{locale}。
	// 切勿设 routing.prefixDefaultLocale: true —— 会让 /_emdash/admin 全部 404。
	//
	// 不配 `fallback`：EmDash 的 getFallbackChain 本来就会把 defaultLocale
	// 追加到链尾，所以 en → zh 自动成立；而 Astro 侧的 `i18n.fallback` 是
	// 路由级回退，反而会干扰 /[locale] 路由。zh → en 的回退在主题层手动补。
	i18n: {
		defaultLocale: siteConfig.defaultLocale,
		locales: [...siteConfig.locales],
	},
	adapter: cloudflare(),
	cache: {
		provider: cacheCloudflare(),
	},
	routeRules: {
		"/": { maxAge: 300, swr: 86400 },
		"/posts": { maxAge: 300, swr: 86400 },
		"/posts/[...slug]": { maxAge: 3600, swr: 86400 },
		"/pages/[...slug]": { maxAge: 3600, swr: 86400 },
		"/category/[...slug]": { maxAge: 600, swr: 86400 },
		"/tag/[...slug]": { maxAge: 600, swr: 86400 },
		"/[locale]": { maxAge: 300, swr: 86400 },
		"/[locale]/posts": { maxAge: 300, swr: 86400 },
		"/[locale]/posts/[...slug]": { maxAge: 3600, swr: 86400 },
		"/[locale]/pages/[...slug]": { maxAge: 3600, swr: 86400 },
		"/[locale]/category/[...slug]": { maxAge: 600, swr: 86400 },
		"/[locale]/tag/[...slug]": { maxAge: 600, swr: 86400 },
	},
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	prefetch: true,
	integrations: [
		react(),
		emdash({
			// D1 与 R2 绑定名需与 wrangler.jsonc 一致。
			database,
			storage: r2({ binding: "MEDIA" }),
			// 生产自动迁移由初始化闹钟驱动；访客与 Cron 在就绪前不进入 CMS。
			migrations: { runtime: "auto", dev: "auto" },
			// 开启客户端工具栏，让公共 HTML 完全同构且可被 Workers Cache 全球缓存
			toolbar: "client",
			admin: {
				logo: "/logo.webp",
				favicon: "/logo.webp",
			},
		}),
	],
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Public Sans",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		latoFont,
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
	devToolbar: { enabled: false },
});
