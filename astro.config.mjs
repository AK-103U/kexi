import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig, fontProviders } from "astro/config";
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";
import { mathPlugin } from "@ak-103u/emdash-plugin-math";
import { siteConfig } from "./src/i18n/config.ts";

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
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database: sqlite({ url: "file:./data.db" }),
			storage: local({
				directory: "./uploads",
				baseUrl: "/_emdash/api/media/file",
			}),
			plugins: [mathPlugin()],
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
