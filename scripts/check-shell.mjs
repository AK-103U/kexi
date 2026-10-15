/**
 * 量测全站三栏布局。
 *
 * 核心验收：「右栏留空不渲染」—— 中栏左边缘 x 坐标必须全站一致。
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:4321";
/*
 * ⚠️ 必须去掉 Playwright 默认的 `--hide-scrollbars`。
 * 带上它滚动条宽度恒为 0，`clientWidth` 永远等于视口宽 —— 「一屏装得下的
 * 页面没有滚动条、居中外壳因此横移」这类漂移就永远量不出来（本文件曾经
 * 因此在漂移存在的情况下全绿）。去掉后本机量到 15px。
 */
const browser = await chromium.launch({
	...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : { channel: "chrome" }),
	ignoreDefaultArgs: ["--hide-scrollbars"],
});

const results = [];
const check = (name, ok, detail = "") => {
	results.push({ name, ok });
	console.log(`${ok ? "✔" : "✘"} ${name}${detail ? `  ${detail}` : ""}`);
};

const PAGES = {
	文章: "/posts/building-for-the-long-term",
	首页: "/",
	列表: "/posts",
	关于: "/pages/about",
	搜索: "/search",
};

// ---------- 1. 中栏位置全站一致（核心） ----------
console.log("\n=== 中栏左边缘一致性（1440px）===");
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const mains = {};
for (const [name, url] of Object.entries(PAGES)) {
	await page.goto(BASE + url, { waitUntil: "networkidle" });
	const box = await page.locator(".shell-main").first().boundingBox();
	mains[name] = box;
	console.log(`  ${name.padEnd(4)} x=${box.x.toFixed(0)} w=${box.width.toFixed(0)}`);
}
const xs = Object.values(mains).map((b) => Math.round(b.x));
const allSame = new Set(xs).size === 1;
check("中栏左边缘全站一致", allSame, `x = ${[...new Set(xs)].join(", ")}`);
check(
	"中栏列宽恒为 680",
	Object.values(mains).every((b) => Math.abs(b.width - 680) < 2),
	Object.entries(mains).map(([k, v]) => `${k}=${v.width.toFixed(0)}`).join(" "),
);
await page.close();

// ---------- 2. 断点行为 ----------
console.log("\n=== 断点行为 ===");
for (const w of [1440, 1200, 1199, 1000, 999, 640, 390]) {
	const p = await browser.newPage({ viewport: { width: w, height: 900 } });
	await p.goto(`${BASE}/posts/building-for-the-long-term`, { waitUntil: "networkidle" });

	const vis = async (sel) => {
		const el = p.locator(sel).first();
		return (await el.count()) ? await el.isVisible() : false;
	};
	const left = await vis(".rail--left");
	const right = await vis(".rail--right");
	const burger = await vis(".nav-burger");
	const menu = await vis(".rail-nav-link");
	const searchInputVisible = await vis(".site-search-input");
	const toolsVisible = await vis(".rail-tools");
	const toc = await p.locator(".toc-link").count();

	/*
	 * 左栏在**任何**宽度都可见 —— 页头取消后它是唯一的导航入口，窄屏改成贴顶
	 * 横栏而不是隐藏。所以这里量的是它的排布形态（侧栏 vs 横栏），不再是可见性。
	 */
	const railMode = await p.evaluate(() => {
		const el = document.querySelector(".rail--left");
		const b = el.getBoundingClientRect();
		return {
			position: getComputedStyle(el).position,
			w: Math.round(b.width),
			h: Math.round(b.height),
		};
	});

	const expectRight = w >= 1200;
	const expectBurger = w < 1000;
	const expectMenu = w >= 1000;
	const expectRailMode = "fixed";
	const counts = await Promise.all(
		[".site-search-input", ".theme-btn", ".lang-toggle", ".nav-burger"].map((sel) =>
			p.locator(sel).count(),
		),
	);
	const singleDom = counts.every((count) => count === 1);

	const ok =
		left &&
		right === expectRight &&
		burger === expectBurger &&
		menu === expectMenu &&
		searchInputVisible &&
		toolsVisible &&
		singleDom &&
		railMode.position === expectRailMode;
	check(
		`${w}px`,
		ok,
		`左栏=${left ? "有" : "无"} 右栏=${right ? "有" : "无"}(期望${expectRight ? "有" : "无"}) 汉堡=${burger ? "有" : "无"}(期望${expectBurger ? "有" : "无"}) 菜单=${menu ? "展开" : "收起"}(期望${expectMenu ? "展开" : "收起"}) 搜索框=${searchInputVisible ? "显示" : "隐藏"} 工具=${toolsVisible} 单份DOM=${singleDom} 左栏排布=${railMode.position}(期望${expectRailMode}) 左栏 ${railMode.w}×${railMode.h} TOC链接=${toc}`,
	);

	// 非文章页右栏轨道保留但内容空
	if (w >= 1200) {
		await p.goto(BASE + "/", { waitUntil: "networkidle" });
		const rightRail = p.locator(".rail--right").first();
		const railBox = await rightRail.boundingBox();
		const railText = (await rightRail.textContent())?.trim() ?? "";
		check(
			`${w}px 首页右栏轨道在但为空`,
			railBox !== null && railText === "",
			`轨道 w=${railBox?.width.toFixed(0)} 文本长度=${railText.length}`,
		);
	}
	await p.close();
}

// ---------- 3. 头像 ----------
console.log("\n=== 头像 ===");
const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p2.goto(BASE + "/", { waitUntil: "networkidle" });
const av = p2.locator(".site-identity-avatar").first();
if (await av.count()) {
	const box = await av.boundingBox();
	const radius = await av.evaluate((e) => getComputedStyle(e).borderRadius);
	const natural = await av.evaluate((e) => e.naturalWidth);
	const src = await av.getAttribute("src");
	check("头像存在", true);
	check("圆形", radius === "50%", radius);
	check("桌面渲染 52px", Math.abs(box.width - 52) < 1, `${box.width.toFixed(0)}px`);
	/*
	 * seed 的站主署名没有上传头像，左栏身份按设计回退到内置默认标志
	 * （public/logo.webp）。管理员上传头像后才改走 /_image
	 * 做服务端裁剪 —— 两种状态都合法，断言按实际分支检查，
	 * 不能假定一定存在自定义头像（此前正是因此长期误报）。
	 */
	if (src?.startsWith("/_image?")) {
		check(
			"自定义头像走 /_image 服务端裁剪（naturalWidth ≥ 96）",
			natural >= 96,
			`naturalWidth=${natural}`,
		);
	} else {
		check(
			"未上传头像时回退到内置默认标志",
			src === "/logo.webp",
			src ?? "(无 src)",
		);
	}
} else {
	check("头像存在", false, "左栏没有 .site-identity-avatar");
}
await p2.close();

// ---------- 4. 中英各自正确 ----------
console.log("\n=== 中英对照 ===");
/*
 * 署名 displayName 是专有名词，seed 只按默认语言（zh）写入一行；英文页
 * 靠主题层回退复用同一行（见 ADR 0003）。所以两种语言都应显示 seed 里的
 * 值 —— 英文页若回退失效会退到站点标题，断言即失败，这一条仍有效。
 */
for (const [name, url, expect] of [
	["中文首页", "/", "EmDash Editorial"],
	["英文首页", "/en", "EmDash Editorial"],
]) {
	const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await p.goto(BASE + url, { waitUntil: "networkidle" });
	const actual = (await p.locator(".site-identity-name").first().textContent())?.trim();
	check(`${name} 左栏署名`, actual === expect, `"${actual}"（期望 "${expect}"）`);
	await p.close();
}

// ---------- 5. 导航高亮 ----------
console.log("\n=== 当前页高亮 ===");
const p3 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
for (const [name, url, expectLabel] of [
	["文章页应高亮「文章」", "/posts/building-for-the-long-term", "文章"],
	["文章列表应高亮「文章」", "/posts", "文章"],
	["关于页应高亮「关于」", "/pages/about", "关于"],
	["英文文章列表应高亮 Posts", "/en/posts", "Posts"],
]) {
	await p3.goto(BASE + url, { waitUntil: "networkidle" });
	const current = (await p3.locator(".rail-nav-link.is-current").first().textContent())?.trim();
	check(name, current === expectLabel, `高亮="${current}"（期望 "${expectLabel}"）`);
}
await p3.close();

// ---------- 6. 左栏分组与对齐 ----------
//
// 左栏改为 Tania 风格的品牌/外观顶部组、整行导航和底部工具。
// 检查共同左边缘而不是几何中轴，避免用图标绘制重心补偿布局。
console.log("\n=== 左栏分组与对齐 ===");
const p4 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p4.goto(BASE + "/posts/building-for-the-long-term", { waitUntil: "networkidle" });

const align = await p4.evaluate(() => {
	const left = (el) => el.getBoundingClientRect().left;
	const centerX = (el) => {
		const b = el.getBoundingClientRect();
		return b.x + b.width / 2;
	};
	const centerY = (el) => {
		const b = el.getBoundingClientRect();
		return b.y + b.height / 2;
	};
	const avatar = document.querySelector(".site-identity-avatar");
	const name = document.querySelector(".site-identity-name");
	const socials = document.querySelector(".rail-identity-socials");
	const navLink = document.querySelector(".rail-nav-link");
	const searchInput = document.querySelector(".site-search-input");
	const tools = document.querySelector(".rail-tools");
	return {
		avatarLeft: left(avatar),
		nameLeft: left(name),
		navLeft: left(navLink),
		searchLeft: left(searchInput),
		avatarCenterX: centerX(avatar),
		nameCenterX: centerX(name),
		socialsCenterX: centerX(socials),
		avatarCenterY: centerY(avatar),
		nameCenterY: centerY(name),
		socialsCenterY: centerY(socials),
		searchCenterY: centerY(searchInput),
		toolsCenterY: centerY(tools),
		toolsDirection: getComputedStyle(tools).flexDirection,
	};
});

check(
	"站长身份区居中排列且头像在上、名称居中在下、之后是外链",
	align.avatarCenterY < align.nameCenterY &&
		align.nameCenterY < align.socialsCenterY &&
		Math.abs(align.avatarCenterX - align.nameCenterX) < 2 &&
		Math.abs(align.nameCenterX - align.socialsCenterX) < 2,
	`头像 y=${align.avatarCenterY.toFixed(1)} cx=${align.avatarCenterX.toFixed(1)} / 名字 y=${align.nameCenterY.toFixed(1)} cx=${align.nameCenterX.toFixed(1)} / 外链 y=${align.socialsCenterY.toFixed(1)} cx=${align.socialsCenterX.toFixed(1)}`,
);
check(
	"主导航与搜索框共享左起点",
	Math.abs(align.navLeft - align.searchLeft) < 1,
	`导航 x=${align.navLeft.toFixed(1)} / 搜索 x=${align.searchLeft.toFixed(1)}`,
);
check(
	"桌面语言与主题同组横向排列并置于搜索框下方",
	align.toolsDirection === "row" && align.toolsCenterY > align.searchCenterY,
	`${align.toolsDirection}，工具 y=${align.toolsCenterY.toFixed(1)} > 搜索 y=${align.searchCenterY.toFixed(1)}`,
);

// 导航与搜索共同左起点要在每个桌面断点都成立。
const alignDev = [];
for (const w of [1440, 1280, 1200, 1199, 1100, 1000]) {
	await p4.setViewportSize({ width: w, height: 900 });
	await p4.waitForTimeout(150);
	const d = await p4.evaluate(() => {
		const x = (s) => document.querySelector(s).getBoundingClientRect().left;
		return x(".site-search-input") - x(".rail-nav-link");
	});
	alignDev.push(`${w}:${d.toFixed(1)}`);
}
check(
	"导航与搜索共享左起点在各桌面断点成立（±1px）",
	alignDev.every((s) => Math.abs(Number(s.split(":")[1])) < 1),
	alignDev.join(" "),
);

/* 桌面搜索输入框常驻显示；搜索输入框与导航共享左起点。 */
await p4.setViewportSize({ width: 1440, height: 900 });
await p4.waitForTimeout(150);
check("桌面搜索输入框默认常驻显示", await p4.locator(".site-search-input").isVisible());
const railEdges = await p4.evaluate(() => {
	const left = (s) => document.querySelector(s).getBoundingClientRect().left;
	return {
		rail: document.querySelector(".rail--left").getBoundingClientRect(),
		search: left(".site-search"),
		nav: left(".rail-nav-link"),
	};
});
check(
	"搜索输入框与导航共享左起点",
	Math.abs(railEdges.search - railEdges.nav) < 1,
	`搜索 x=${railEdges.search.toFixed(1)} / 导航 x=${railEdges.nav.toFixed(1)}`,
);

/*
 * 搜索结果下拉必须能超出左栏宽度 —— 左栏只有 200px，按输入框宽度
 * 排会挤成一列单字。同时它不能被祖先裁掉（左栏不得有 overflow: auto）。
 */
await p4.locator(".site-search-input").fill("EmDash");
await p4.waitForTimeout(900);
const resultsBox = await p4.evaluate(() => {
	const el = document.querySelector(".site-search-results");
	if (!el || el.hidden) return null;
	const b = el.getBoundingClientRect();
	const rail = document.querySelector(".rail--left").getBoundingClientRect();
	return { w: +b.width.toFixed(1), right: +b.right.toFixed(1), railRight: +rail.right.toFixed(1) };
});
check(
	"搜索结果下拉比左栏宽（不挤成单字列）",
	resultsBox !== null && resultsBox.w > 200,
	resultsBox ? `下拉 w=${resultsBox.w}（左栏 ${railEdges.rail.width.toFixed(0)}）` : "没有出现下拉",
);
check(
	"搜索结果下拉没有被左栏裁掉",
	resultsBox !== null && resultsBox.right > resultsBox.railRight,
	resultsBox ? `下拉右缘 ${resultsBox.right} / 左栏右缘 ${resultsBox.railRight}` : "没有出现下拉",
);
await p4.goto(BASE + "/posts/building-for-the-long-term", { waitUntil: "networkidle" });

const searchStyle = await p4.evaluate(() => {
	const cs = getComputedStyle(document.querySelector(".site-search-input"));
	const tools = getComputedStyle(document.querySelector(".rail-tools"));
	return {
		borderWidth: cs.borderTopWidth,
		background: cs.backgroundColor,
		toolsDirection: tools.flexDirection,
		toolsColumnGap: tools.columnGap,
		searchCount: document.querySelectorAll(".site-search-input").length,
	};
});
check("搜索框无边框", searchStyle.borderWidth === "0px", searchStyle.borderWidth);
check(
	"搜索框浅灰底（--color-surface）",
	searchStyle.background === "rgb(247, 247, 247)",
	searchStyle.background,
);
check("搜索框仅渲染一份", searchStyle.searchCount === 1, `${searchStyle.searchCount} 份`);
check(
	"桌面语言与主题同排、间距 4px",
	searchStyle.toolsDirection === "row" && searchStyle.toolsColumnGap === "4px",
	`${searchStyle.toolsDirection} / ${searchStyle.toolsColumnGap}`,
);

// 窄屏下汉堡与搜索框在同一行：搜索框占满剩余宽度，且不把中列挤偏。
await p4.setViewportSize({ width: 999, height: 900 });
await p4.waitForTimeout(120);
const burgerVisible = await p4.locator(".nav-burger").isVisible();
check("999px 汉堡可见（对照条件成立）", burgerVisible);
await p4.locator(".nav-burger").click();
check(
	"汉堡展开唯一一份菜单并更新 aria-expanded 与按钮名称",
	(await p4.locator(".rail-menu").isVisible()) &&
		(await p4.locator(".nav-burger").getAttribute("aria-expanded")) === "true" &&
		(await p4.locator(".nav-burger").getAttribute("aria-label")) === "关闭导航菜单",
);
await p4.locator(".nav-burger").click();
check(
	"再次点击汉堡收起菜单并恢复按钮名称",
	!(await p4.locator(".rail-menu").isVisible()) &&
		(await p4.locator(".nav-burger").getAttribute("aria-expanded")) === "false" &&
		(await p4.locator(".nav-burger").getAttribute("aria-label")) === "打开导航菜单",
);
const narrowBar = await p4.evaluate(() => {
	const rail = document.querySelector(".rail--left").getBoundingClientRect();
	const burger = document.querySelector(".nav-burger").getBoundingClientRect();
	const search = document.querySelector(".site-search").getBoundingClientRect();
	const tools = document.querySelector(".rail-tools").getBoundingClientRect();
	const main = document.querySelector(".shell-main").getBoundingClientRect();
	return {
		railW: +rail.width.toFixed(1),
		searchW: +search.width.toFixed(1),
		burgerRight: +burger.right.toFixed(1),
		searchLeft: +search.left.toFixed(1),
		searchTop: +search.top.toFixed(1),
		searchBottom: +search.bottom.toFixed(1),
		toolsTop: +tools.top.toFixed(1),
		toolsBottom: +tools.bottom.toFixed(1),
		mainTop: +main.top.toFixed(1),
		railBottom: +rail.bottom.toFixed(1),
		mainX: +main.x.toFixed(1),
	};
});
check(
	"999px 搜索框占满横栏剩余宽度",
	narrowBar.searchW > 300,
	`搜索 w=${narrowBar.searchW} 汉堡右缘=${narrowBar.burgerRight} 搜索左缘=${narrowBar.searchLeft}`,
);
check(
	"999px 搜索框、语言和主题同处横栏一行",
	Math.abs(
		(narrowBar.toolsTop + narrowBar.toolsBottom) / 2 -
			(narrowBar.searchTop + narrowBar.searchBottom) / 2,
	) < 1,
	`搜索 y=${narrowBar.searchTop}–${narrowBar.searchBottom} 工具 y=${narrowBar.toolsTop}–${narrowBar.toolsBottom}`,
);
check(
	"999px 中栏顶部让开贴顶横栏（不重叠）",
	narrowBar.mainTop >= narrowBar.railBottom - 1,
	`横栏底 ${narrowBar.railBottom} / 中栏顶 ${narrowBar.mainTop}`,
);

await p4.setViewportSize({ width: 390, height: 844 });
await p4.waitForTimeout(120);
const compactBar = await p4.evaluate(() => {
	const box = (selector) => {
		const b = document.querySelector(selector).getBoundingClientRect();
		return { left: b.left, right: b.right, cy: b.top + b.height / 2, width: b.width };
	};
	return {
		identity: box(".site-identity-avatar"),
		nameVisible: getComputedStyle(document.querySelector(".site-identity-name")).display !== "none",
		search: box(".site-search-input"),
		tools: box(".rail-tools"),
		burger: box(".nav-burger"),
	};
});
const headerItems = [compactBar.identity, compactBar.search, compactBar.tools, compactBar.burger];
check(
	"390px 顶栏品牌、搜索、语言/主题和汉堡同排且不重叠",
	compactBar.identity.width > 0 &&
		compactBar.nameVisible &&
		headerItems.slice(1).every((item, index) => item.left >= headerItems[index].right - 1) &&
		headerItems.every((item) => Math.abs(item.cy - headerItems[0].cy) < 1),
	`搜索宽 ${compactBar.search.width.toFixed(0)}px，品牌名显示=${compactBar.nameVisible}`,
);
await p4.locator(".nav-burger").click();
const fullMenu = await p4.evaluate(() => {
	const menu = document.querySelector(".rail-menu").getBoundingClientRect();
	const rail = document.querySelector(".rail--left").getBoundingClientRect();
	return { menu, rail };
});
check(
	"390px 菜单从顶栏下展开并覆盖视口余高",
	Math.abs(fullMenu.menu.y - 56) < 1 &&
		Math.abs(fullMenu.menu.height - (844 - 56)) < 1 &&
		Math.abs(fullMenu.menu.width - fullMenu.rail.width) < 1,
	`菜单 ${fullMenu.menu.width.toFixed(0)}×${fullMenu.menu.height.toFixed(0)}，y=${fullMenu.menu.y.toFixed(0)}`,
);
await p4.close();

// ---------- 6b. 左栏页脚位置 ----------
console.log("\n=== 左栏页脚位置 ===");
const p6 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const sideFooters = [];
for (const width of [1440, 1100]) {
	await p6.setViewportSize({ width, height: 900 });
	await p6.goto(BASE + "/posts/building-for-the-long-term", { waitUntil: "networkidle" });
	sideFooters.push(await p6.evaluate(() => {
		const rail = document.querySelector(".rail--left").getBoundingClientRect();
		const footer = document.querySelector(".site-footer").getBoundingClientRect();
		const menu = document.querySelector(".rail-menu").getBoundingClientRect();
		return {
			railX: rail.x,
			railBottom: rail.bottom,
			footerBottom: footer.bottom,
			menuBottom: menu.bottom,
			footerX: footer.x,
			position: getComputedStyle(document.querySelector(".site-footer")).position,
			visible: footer.width > 0 && getComputedStyle(document.querySelector(".rail-menu")).display !== "none",
		};
	}));
}
check(
	"桌面页脚位于左栏导航区底部且不吸附视口",
	sideFooters.every(({ railX, railBottom, footerBottom, footerX, position, visible }) =>
		visible && position === "static" && Math.abs(footerBottom - railBottom) < 1 && Math.abs(footerX - railX) < 1,
	),
	sideFooters.map(({ railX, railBottom, footerBottom, footerX, position }) =>
		`rail=${railX.toFixed(1)}–${railBottom.toFixed(1)} footer=${footerX.toFixed(1)}–${footerBottom.toFixed(1)} ${position}`
	).join(" / "),
);

await p6.setViewportSize({ width: 390, height: 844 });
await p6.goto(BASE + "/posts/building-for-the-long-term", { waitUntil: "networkidle" });
await p6.locator(".nav-burger").click();
const mobileFooter = await p6.evaluate(() => {
	const menu = document.querySelector(".rail-menu").getBoundingClientRect();
	const footer = document.querySelector(".site-footer").getBoundingClientRect();
	return {
		menuBottom: menu.bottom,
		footerBottom: footer.bottom,
		footerY: footer.y,
		visible: footer.width > 0,
		open: document.querySelector(".nav-burger").getAttribute("aria-expanded") === "true",
	};
});
check(
	"移动端展开菜单后页脚出现在导航下方",
	mobileFooter.open && mobileFooter.visible && mobileFooter.footerY > 56 && mobileFooter.footerBottom <= mobileFooter.menuBottom + 1,
	`y=${mobileFooter.footerY.toFixed(1)} bottom=${mobileFooter.footerBottom.toFixed(1)} menu=${mobileFooter.menuBottom.toFixed(1)}`,
);
const footerContents = await p6.evaluate(() => ({
	rss: [...document.querySelectorAll(".footer-icon-link")].some((link) => link.getAttribute("href")?.endsWith("/rss.xml")),
	socialIcons: [...document.querySelectorAll('.footer-icon-link[target="_blank"]')].map((link) => ({
		label: link.getAttribute("aria-label"),
		icon: link.querySelector("svg") !== null,
		visibleName: link.textContent.trim(),
	})),
	badges: document.querySelectorAll(".footer-badge").length,
	emdash: document.querySelector(".footer-credit a")?.textContent.trim(),
}));
check("侧栏页脚以图标显示 RSS", footerContents.rss);
check(
	"已配置社交链接使用带无障碍名称的内联图标、不显示平台文字",
	footerContents.socialIcons.length > 0 && footerContents.socialIcons.every((item) => item.label && item.icon && !item.visibleName),
	footerContents.socialIcons.map(({ label, icon, visibleName }) => `${label}:svg=${icon}/text=${visibleName || "∅"}`).join(" / "),
);
check("侧栏页脚不渲染项目或平台徽章", footerContents.badges === 0, `${footerContents.badges} 个徽章`);
check("页脚品牌署名只显示 EmDash", footerContents.emdash === "EmDash", footerContents.emdash ?? "未找到");
await p6.close();

// ---------- 7. SPA 导航不漂移 ----------
//
// 两条曾经真实存在的漂移，都只在「客户端导航」时显形：
//   a) 短页面（/pages/about，正好一屏高）没有滚动条，clientWidth 比长页面宽
//      15px，居中的外壳整体横移。
//   b) 在滚动状态下切页时 scrollY 归零，rail 的视口位置应保持不变。
// 修法是 html { scrollbar-gutter: stable } 与桌面侧栏固定定位。
console.log("\n=== SPA 导航不漂移 ===");
const p5 = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const geom = () =>
	p5.evaluate(() => {
		const box = (s) => {
			const el = document.querySelector(s);
			if (!el) return null;
			const b = el.getBoundingClientRect();
			return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1) };
		};
		return {
			main: box(".shell-main"),
			railL: box(".rail--left"),
			shell: box(".shell"),
			footer: box(".site-footer"),
			footerX: box(".site-footer").x,
			scrollY: Math.round(window.scrollY),
		};
	});

// 静止参考：整页加载时的各区域位置（同一页面，scroll 0）
await p5.goto(BASE + "/posts", { waitUntil: "networkidle" });
await p5.waitForTimeout(300);
const rest = await geom();

// a) 列表 → /pages/about（无滚动条的短页面）
await p5.locator('a[href="/pages/about"]:visible').first().click();
await p5.waitForURL("**/pages/about", { timeout: 10000 });
await p5.waitForTimeout(1200);
const afterAbout = await geom();
check(
	"切到 /pages/about 中栏不横移",
	Math.abs(afterAbout.main.x - rest.main.x) < 1,
	`x ${rest.main.x} → ${afterAbout.main.x}`,
);
check(
	"切到 /pages/about 左栏不横移",
	Math.abs(afterAbout.railL.x - rest.railL.x) < 1,
	`x ${rest.railL.x} → ${afterAbout.railL.x}`,
);
// 左栏保持 fixed；页脚随侧栏自然排列，左栏对齐不应因页面改变。
check(
	"切到 /pages/about 左栏 y 不变化",
	Math.abs(afterAbout.railL.y - rest.railL.y) < 1,
	`y ${rest.railL.y} → ${afterAbout.railL.y}`,
);
check(
	"切到 /pages/about 后页脚仍与左栏左边缘对齐",
	Math.abs(afterAbout.footerX - afterAbout.railL.x) < 1,
	`页脚 x=${afterAbout.footerX} / 左栏 x=${afterAbout.railL.x}`,
);

// b) 滚动不该移动 rail —— 固定定位必须与静止位重合
// 不变量是：rail 无论在滚动中还是切页后，位置都该与静止时一致。
await p5.goto(BASE + "/posts/notes-on-simplicity", { waitUntil: "networkidle" });
await p5.waitForTimeout(300);
const postRest = await geom();
await p5.evaluate(() => window.scrollTo(0, 900));
await p5.waitForTimeout(400);
const scrolled = await geom();
check(
	"滚动时左栏不移动（fixed 位 = 静止位）",
	Math.abs(scrolled.railL.y - postRest.railL.y) < 1,
	`静止 ${postRest.railL.y} → 滚动 900 后 ${scrolled.railL.y}`,
);

await p5.locator('a[href="/posts"]:visible').first().click();
await p5.waitForURL("**/posts", { timeout: 10000 });
await p5.waitForTimeout(1200);
const afterScrollNav = await geom();
check(
	"滚动状态下切页，左栏 y 不弹动",
	Math.abs(afterScrollNav.railL.y - rest.railL.y) < 1,
	`静止 ${rest.railL.y} / 滚动时 ${scrolled.railL.y} / 切页后 ${afterScrollNav.railL.y}`,
);
check(
	"滚动状态下切页，中栏 x 不横移",
	Math.abs(afterScrollNav.main.x - rest.main.x) < 1,
	`x ${rest.main.x} → ${afterScrollNav.main.x}`,
);
check(
	"滚动状态下切页，页脚仍与左栏左边缘对齐",
	Math.abs(afterScrollNav.footerX - afterScrollNav.railL.x) < 1,
	`页脚 x=${afterScrollNav.footerX} / 左栏 x=${afterScrollNav.railL.x}`,
);
check("切页后 scrollY 归零（对照条件成立）", afterScrollNav.scrollY === 0);
await p5.close();

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
