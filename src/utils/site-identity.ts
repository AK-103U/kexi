/** Resolved media reference from getSiteSettings() */
export interface MediaReference {
	mediaId: string;
	alt?: string;
	url?: string;
}

export interface BlogSiteIdentitySettings {
	title?: string;
	tagline?: string;
	logo?: MediaReference;
	favicon?: MediaReference;
}

const DEFAULT_SITE_TITLE = "Kexi";
const DEFAULT_SITE_TAGLINE = "";
export const DEFAULT_SITE_LOGO = "/logo.webp";

/**
 * 左栏展示的站主署名。头像与名字都取自这条 byline
 * （`getBylineBySlug` 会走 locale fallback 链，中英各取各的 displayName）。
 */
export const OWNER_BYLINE_SLUG = "emdash-editorial";

export function resolveBlogSiteIdentity(settings?: BlogSiteIdentitySettings) {
	return {
		siteTitle: settings?.title ?? DEFAULT_SITE_TITLE,
		siteTagline: settings?.tagline ?? DEFAULT_SITE_TAGLINE,
		siteLogo: settings?.logo?.url
			? settings.logo
			: { url: DEFAULT_SITE_LOGO, alt: settings?.title ?? DEFAULT_SITE_TITLE },
	};
}
