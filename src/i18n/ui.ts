/**
 * i18n 运行时工具。
 *
 * 字典 + 路径本地化 + 日期格式化 + locale 解析。
 * key 类型从 zh.json 推导，写错 key 会在 typecheck 阶段报错。
 */

import { siteConfig, isLang, localeCodes, type Lang } from "./config";
import zh from "./zh.json";
import en from "./en.json";

export type { Lang } from "./config";

const messages: Record<Lang, Record<string, unknown>> = { zh, en };

// 把嵌套字典压成 "a.b.c" 的联合类型。
type Prev = [never, 0, 1, 2, 3, 4, 5, 6];
type Paths<T, D extends number = 6> = D extends 0
	? never
	: {
			[K in keyof T & string]: T[K] extends Record<string, unknown>
				? `${K}.${Paths<T[K], Prev[D]>}`
				: K;
		}[keyof T & string];

export type MessageKey = Paths<typeof zh>;
export type MessageParams = Record<string, string | number>;

/**
 * 取某个语言的翻译函数。返回的 `t` 支持点分 key 与 `{param}` 插值。
 * 缺失 key 时在 dev 环境打警告，并原样返回 key（便于一眼发现漏翻）。
 */
export function useTranslations(lang: Lang) {
	const isDev = import.meta.env.DEV === true;
	return function t(key: MessageKey, params?: MessageParams): string {
		const value = key
			.split(".")
			.reduce<unknown>(
				(acc, k) =>
					acc != null && typeof acc === "object"
						? (acc as Record<string, unknown>)[k]
						: undefined,
				messages[lang],
			);
		if (typeof value !== "string") {
			if (isDev) console.warn(`[i18n] 缺少文案：${key}（${lang}.json）`);
			return key;
		}
		let text = value;
		if (params) {
			for (const [k, v] of Object.entries(params)) {
				text = text.replaceAll(`{${k}}`, String(v));
			}
		}
		return text;
	};
}

/** 给路径加语言前缀：默认语言不加，其余加 `/{lang}`。 */
export function localePath(lang: Lang, path: string): string {
	const p = path.startsWith("/") ? path : `/${path}`;
	if (lang === siteConfig.defaultLocale) return p;
	return `/${lang}${p === "/" ? "" : p}`;
}

/** 剥掉路径开头的语言前缀，得到默认语言下的等价路径。 */
export function stripLocale(pathname: string): string {
	const segments = pathname.split("/");
	const first = segments[1];
	if (first && localeCodes.includes(first)) {
		const rest = `/${segments.slice(2).join("/")}`;
		return rest === "/" ? "/" : rest;
	}
	return pathname;
}

/**
 * 从当前请求解析语言。
 * Astro 的 `computeCurrentLocaleFromParams` 会读路由参数 `[locale]`，
 * 无前缀路由自动落到 defaultLocale，因此这里能覆盖所有公开页面。
 */
export function getLang(astro: { currentLocale?: string }): Lang {
	const current = astro.currentLocale;
	return current && localeCodes.includes(current) ? (current as Lang) : siteConfig.defaultLocale;
}

/** 按语言格式化日期。`style: "long"` 用于首页的完整月份名。 */
export function formatDate(date: Date, lang: Lang, style: "short" | "long" = "short"): string {
	return date.toLocaleDateString(siteConfig.localeTags[lang], {
		year: "numeric",
		month: style === "long" ? "long" : "short",
		day: "numeric",
	});
}

/** `<html lang>` 用的 BCP 47 标签。 */
export function htmlLang(lang: Lang): string {
	return siteConfig.localeTags[lang];
}

/**
 * 页面语言：优先用 `[locale]` 薄壳显式传入的 `locale` prop，
 * 否则退回 Astro 从路由解析出的 currentLocale（无前缀路由 → 默认语言）。
 * 显式 prop 保证即使 `Astro.currentLocale` 在组件层不可用也不会串语言。
 */
export function pageLang(
	props: { locale?: unknown },
	astro: { currentLocale?: string },
): Lang {
	return isLang(props.locale) ? props.locale : getLang(astro);
}
