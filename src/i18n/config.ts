/**
 * 站点 i18n 配置 —— 唯一真源。
 *
 * `astro.config.mjs` 从这里读取 locale 列表来构造 Astro 的 `i18n` 块；
 * 主题代码在运行时也从这里取同样的列表、路径工具和显示名。
 * 一份定义两边用，避免配置漂移。
 */

export const siteConfig = {
	/** 站点绝对 URL。hreflang / SEO 需要绝对链接，必须配置。 */
	siteUrl: "http://localhost:4321",
	/** 默认语言：URL 不带前缀。 */
	defaultLocale: "zh",
	/** 全部语言，顺序即语言切换器的展示顺序。 */
	locales: ["zh", "en"],
	/** 语言切换器上显示的本族语言名。 */
	localeLabels: { zh: "中文", en: "English" },
	/** `<html lang>` 与 Intl 格式化用的 BCP 47 标签。 */
	localeTags: { zh: "zh-CN", en: "en-US" },
	/** RSS `<language>` 取值。 */
	rssLanguages: { zh: "zh-CN", en: "en-US" },
} as const;

export type Lang = (typeof siteConfig.locales)[number];

/** 可运行时判断的语言代码列表。 */
export const localeCodes: readonly string[] = siteConfig.locales;

/** 类型守卫：判断任意值是否是已配置的语言。 */
export function isLang(value: unknown): value is Lang {
	return typeof value === "string" && localeCodes.includes(value);
}
