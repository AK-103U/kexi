import { getPluginSettings } from "emdash";

/**
 * 图片显示比例（来自 image-ratios 插件）。
 *
 * 三处图片位置各自可配：首页主图（featured）、文章配图（hero）、首页卡片
 * （card）。设置由 `@ak-103u/emdash-plugin-image-ratios` 声明，管理员在后台
 * 「插件」页调整；这里读取并把结果翻译成 CSS 自定义属性。
 *
 * 插件关闭时返回 `enabled: false`，主题不注入任何覆盖，完全沿用内置样式 ——
 * 这正是「用与不用」对比的基础。
 *
 * 设置项默认值不会自动落库（EmDash 明确要求调用方自己兜底），所以这里对每个
 * 键都带默认值。
 */

/** 插件 id，必须与插件包 `src/index.js` 中的 `PLUGIN_ID` 一致。 */
const PLUGIN_ID = "image-ratios";

/** 主题内置比例，与关闭插件时的样式保持一致。 */
const BUILTIN = {
	featured: "4 / 3",
	hero: "auto",
	card: "16 / 10",
} as const;

export interface ImageRatioState {
	/** 是否启用插件控制。关闭时 `css` 为空、页面不加标记属性。 */
	enabled: boolean;
	/** 注入到 `<style>` 的 `:root` 规则；关闭时为空字符串。 */
	css: string;
}

/** 预设值 → CSS `aspect-ratio` 记号。`native` 表示不设比例、按原图显示。 */
function toCssRatio(preset: unknown, custom: unknown): string {
	if (typeof preset !== "string") return "auto";
	if (preset === "native") return "auto";
	if (preset === "custom") {
		// 自定义数值直接作为 `aspect-ratio` 的比值；越界或非数字时退回 auto。
		const n = typeof custom === "number" ? custom : Number(custom);
		return Number.isFinite(n) && n > 0 ? String(n) : "auto";
	}
	// 预设写作 "16/10"，转成 CSS 允许的 "16 / 10"。
	const match = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(preset);
	if (!match) return "auto";
	return `${match[1]} / ${match[2]}`;
}

/**
 * 读取插件设置并生成注入用的 CSS。
 *
 * 读不到设置（插件未安装、未保存过）时按关闭处理，主题行为不变。
 */
export async function resolveImageRatios(): Promise<ImageRatioState> {
	let settings: Record<string, unknown> = {};
	try {
		settings = await getPluginSettings(PLUGIN_ID);
	} catch {
		// 插件未安装或设置表不可用：按关闭处理，不让页面渲染失败。
		return { enabled: false, css: "" };
	}

	if (settings.enabled !== true) {
		return { enabled: false, css: "" };
	}

	const featured = toCssRatio(
		settings.featuredRatio,
		settings.featuredCustomRatio,
	);
	const hero = toCssRatio(settings.heroRatio, settings.heroCustomRatio);
	const card = toCssRatio(settings.cardRatio, settings.cardCustomRatio);

	return {
		enabled: true,
		// 变量在组件样式里都有 fallback（内置比例），所以关闭插件时
		// 不输出任何内容，行为与改动前完全一致。
		css:
			`:root{` +
			`--ratio-featured:${featured};` +
			`--ratio-hero:${hero};` +
			// 插件接管后由所选比例决定高度，不再用 420px 的封顶。
			`--hero-max-height:none;` +
			`--ratio-card:${card};` +
			// 卡片容器是固定比例、图片填满；选「原图比例」时容器改由图片
			// 撑高，所以图片不能再设 100% 高度。
			`--card-img-height:${card === "auto" ? "auto" : "100%"};` +
			`}`,
	};
}

/** 供样式表引用：关闭插件时主题使用的内置比例。 */
export const BUILTIN_IMAGE_RATIOS = BUILTIN;
