import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import { d1, r2 } from "@emdash-cms/cloudflare";
import { defineConfig, fontProviders } from "astro/config";
import emdash from "emdash/astro";
import { siteConfig } from "./src/i18n/config.ts";

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
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			// D1 与 R2 绑定名需与 wrangler.jsonc 一致。
			database: d1({ binding: "DB", session: "auto" }),
			storage: r2({ binding: "MEDIA" }),
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
