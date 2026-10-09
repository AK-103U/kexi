This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
pnpm dev              # Start the Astro dev server
pnpm typecheck        # astro check
pnpm check:spa        # Client-side navigation + TOC assertions (needs a running server)
pnpm check:shell      # Shell geometry + rail/header alignment at every breakpoint (needs a running server)
pnpm seed:bylines     # Backfill per-locale byline rows (restart dev afterwards)
pnpm seed:avatar      # Point the site-owner byline at an avatar image (restart dev afterwards)
npx emdash types      # Regenerate TypeScript types from a running site
```

The admin UI is at `http://localhost:4321/_emdash/admin`.

`NOTES.md` (Chinese) holds the deeper findings -- environment quirks, the byline locale
bug, the i18n mechanics. Read it before debugging anything unusual.

## Key Files

| File                          | Purpose                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`            | Astro config with `emdash()` integration, database, and storage                    |
| `src/i18n/config.ts`          | Single source of truth for locales; imported by `astro.config.mjs` and theme code  |
| `src/i18n/{zh,en}.json`       | UI dictionary (`MessageKey` derives from `zh.json`)                                |
| `src/live.config.ts`          | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`              | Schema definition + bilingual demo content                                         |
| `seed/bylines-i18n.json`      | Per-locale byline copy overrides                                                   |
| `emdash-env.d.ts`             | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Base.astro`      | Base layout: three-column shell, header, footer, drawer, EmDash wiring            |
| `src/components/SiteRail.astro` | Left rail contents -- owner avatar, name, site navigation                        |
| `src/components/TableOfContents.astro` | Right rail contents -- TOC with scroll highlighting                       |
| `src/utils/media.ts`          | Media URLs (`mediaUrl`, `avatarUrl`) -- storageKey only, see below                 |
| `src/pages/`                  | Astro pages -- all server-rendered                                                 |
| `scripts/shots.mjs`           | Screenshot script -- 20 routes × 3 breakpoints (desktop/tablet/mobile) × light/dark; `--only <page>`, `--bp <name>` |
| `scripts/check-spa.mjs`       | Client-side navigation + TOC regression assertions                                 |
| `scripts/check-shell.mjs`     | Three-column shell geometry + alignment assertions                                  |

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Documentation

The EmDash docs are available as an MCP server at `https://docs.emdashcms.com/mcp`. When you need to verify an API, hook, config option, field type, or pattern, call `search_docs` against the live documentation rather than relying on training-data recall. The docs reflect current behaviour; assumptions may not.

This template ships with `.mcp.json`, `.cursor/mcp.json`, and `.vscode/mcp.json` so Claude Code, Cursor, and VS Code auto-discover the docs server. Other tools (OpenCode, Windsurf, etc.) need a manual one-time setup -- see [docs.emdashcms.com/docs-mcp](https://docs.emdashcms.com/docs-mcp).

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- **Media URLs take a storageKey, never a media id.** `/_emdash/api/media/file/<key>` calls `storage.download(key)`, so passing the ULID 404s. Use `mediaUrl()` / `avatarUrl()` from `src/utils/media.ts`, and read `byline.avatarStorageKey` (populated by the media LEFT JOIN), not `avatarMediaId`.
- When Astro's cache is enabled, pass content-query hints to `Astro.cache.set(cacheHint)`. Use the `WithCacheHint` variants for site settings, menus, taxonomies, and widget areas rendered by cached routes.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).

## This Template

A blog with posts, pages, categories, tags, full-text search, and RSS. Designed for personal writing, technical writing, indie newsletters, and anything where the writing is the product. Editorial-tech aesthetic: confident sans-serif, restrained accent, real article structure with bylines and reading time.

## Pages

| Page        | Path               | What it shows                                                                          |
| ----------- | ------------------ | -------------------------------------------------------------------------------------- |
| Home        | `/`                | Featured post (image above title), latest posts stack                                 |
| All posts   | `/posts`           | Article count, full post list with excerpts and tag chips                              |
| Post detail | `/posts/[slug]`    | Featured image, title, meta row under the title (bylines, date, reading time, tags), body, right-rail TOC |
| Search      | `/search`          | Full-text search UI                                                                    |
| Page        | `/pages/[slug]`    | Static page content (Portable Text)                                                    |
| Category    | `/category/[slug]` | Posts filtered by category                                                             |
| Tag         | `/tag/[slug]`      | Posts filtered by tag                                                                  |
| RSS         | `/rss.xml`         | Generated feed                                                                         |

Every public route also exists under `/en` (`src/pages/[locale]/` holds thin shells that
re-render the default-locale page with `locale` set). See **Internationalisation** below.

## Internationalisation

Two locales: **`zh` (default, no URL prefix)** and **`en` (`/en` prefix)**. `src/i18n/config.ts` is the single source of truth -- `astro.config.mjs` imports it to build Astro's `i18n` block, and theme code imports the same object at runtime.

- **Routing** -- default-locale pages live at `src/pages/*`; other locales are thin shells under `src/pages/[locale]/*` that import the default page and pass `locale`. A shell must validate with `isLang(locale)` and redirect to `/404` otherwise.
- **Pages read their own locale** -- `getLang(Astro)` off `Astro.currentLocale`. No prop drilling.
- **Pass `{ locale }` to every data call** -- `getEmDashCollection`, `getEmDashEntry`, `getMenu*`, `getTaxonomyTerms*`, `getTermsForEntries`, `search`. Anonymous requests have no locale in the ALS context, so omitting it silently returns the wrong language.
- **Links** -- always `localePath(lang, path)`, never a hand-built string, and always off `entry.data.slug` (in non-default locales `entry.id` carries an `en/` prefix).
- **Content is row-per-locale** -- one row per language, same slug, linked by `translation_group`. Adding a post means writing both rows in `seed/seed.json` with `translationOf`.
- **No fallback in lists** -- a post that only exists in `zh` won't appear on `/en/posts`. Detail pages do fall back, and show `post.translatedNotice` when they do.
- **Not translatable** -- `settings` (site title/tagline) and widget areas have no locale column. The header/footer are hand-built so their copy comes from the dictionary.

The UI dictionary is `src/i18n/{zh,en}.json`; `MessageKey` is derived from `zh.json`, so a missing key in `en.json` is a compile error.

`pnpm check:spa` runs Playwright assertions that client-side navigation (see below) is still actually working.

## The three-column shell

`Base.astro` owns the grid; pages supply content only. Page components must **not** declare their own outer `max-width` or horizontal padding -- that's what the shell is for.

- `.shell` is `grid-template-columns: var(--rail-width) minmax(0, var(--content-width)) var(--rail-width)` with `align-items: start`. That last part is load-bearing: with the default `stretch`, each rail would grow to the full row height and `position: sticky` would have no scroll range to move within.
- The right rail's **track is always present**; its contents come from a named slot (`<slot name="rail" />`) that only article pages fill. Non-article pages render an empty 200px rail on purpose -- it keeps the content column at the same x everywhere.
- Width budget (including a ~15px classic scrollbar, reserved on every page by `scrollbar-gutter: stable`): `200 + 24 + 680 + 24 + 200 = 1128`, plus 48px of padding = 1176, plus the scrollbar ≈ 1191. Hence the 1200px breakpoint.
- The mobile drawer duplicates the menu links. Both copies come from the same `menu.items`; the drawer deliberately omits the avatar and name.
- The left rail is **centre-aligned on one axis**: `.rail-identity-wrap` is the flex column that centres the avatar, the name and the nav list together. Add new rail blocks inside it and they inherit the axis -- don't re-centre per child.
- The header's `.nav-right` (search + toggles) sits on the **page's centre line** on desktop. `.nav` is `grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr)` so the middle track centres regardless of what the side tracks hold. The `minmax(0, …)` lower bound matters: a bare `1fr` floors at `min-content`, so a wide burger or admin link would shove the middle track off-centre. Below 640px the search box goes full-width instead and centring is dropped on purpose.
- **No layout drift on client-side navigation.** Two things keep the shell still when ClientRouter swaps the page, and both are load-bearing:
  - `html { scrollbar-gutter: stable }`. Without it a page that fits in one viewport (`/pages/about`) has no scrollbar, so its `clientWidth` is ~15px wider than a long page's and the centred shell shifts sideways mid-navigation.
  - `.rail`'s sticky `top` must equal its **resting** position: `--rail-sticky-top: calc(var(--nav-height) + 1px + var(--shell-pad-top))`. The `+1px` is the header's bottom border. If the two differ, the rail jumps by that difference when scroll resets to 0. Both values derive from `--shell-pad-top` -- change that one variable, never the padding and the sticky offset separately.

  `check:shell` asserts both, but it only sees them because it launches Chrome **without** Playwright's default `--hide-scrollbars` (which forces scrollbar width to 0 and hides the whole class of bug). Any new layout-checking script must do the same.

## Images

`/_image` (Astro's endpoint, wrapped by EmDash) does server-side cropping -- `?w=96&h=96&fit=cover&f=webp` turns a 1200×800 JPEG into a 3.7KB square WebP. Use it rather than scaling a large image down in CSS. Helpers live in `src/utils/media.ts`.

**`sharp` is a direct dependency for a reason.** Astro lists it as an optional peer; under pnpm's strict node_modules layout a transitive-only `sharp` resolves in dev (Vite's resolver is looser) but **not** in the production build, where `/_image` returns 500 with `Could not find Sharp`. Don't remove it from `dependencies`.

## Client-side navigation

`Base.astro` renders `<ClientRouter />` (from `astro:transitions`), so in-site clicks swap the document client-side instead of doing a full page load. The site is still an MPA -- first paint, crawler HTML, RSS and hreflang are all server-rendered.

Two things this breaks if you're not careful:

- **Module scripts run once.** Anything binding to nodes that get swapped must re-init on `astro:page-load` and assign listeners with `onclick` (not `addEventListener`) so repeat runs don't stack. The theme switcher, the nav drawer, and the TOC all do this.
- **Failure is silent.** The page still navigates, the content is still right, and `curl` looks normal -- it just quietly reverts to full page loads. `pnpm check:spa` catches this by planting a marker on `window` and checking it survives a click.

The TOC was the victim of the first rule: it built its list once on module execution, so navigating article → list → article client-side left the TOC empty. `check:spa` now walks exactly that path and asserts the list is populated and not duplicated.

Prefetch is on by default with `<ClientRouter />` (`init({ prefetchAll: true })`) -- no config needed.

## Schema

- `posts` collection: `title`, `featured_image`, `content` (Portable Text), `excerpt` (text).
- `pages` collection: `title`, `content` (Portable Text). Used for `/about` etc.
- Taxonomies: `category`, `tag`.
- Single `primary` menu (Home, About, Posts by default).

Site settings have `title` and `tagline` -- both render in the header / footer.

## Visual character

Single typeface: **Public Sans** on `--font-body`, used for everything including headings (`--font-heading` defaults to the body face; tighter letter-spacing on h1/h2). **JetBrains Mono** on `--font-mono` for inline code and code blocks. Body and headings share the same family; weight and size carry the hierarchy (`--font-weight-heading` 600, `--font-weight-display` 600 for h1/page titles).

The brand colour is `#e86233` (a citrus orange, `--color-brand`) -- used for links, the post-card title hover, and the search input focus ring. There's also a secondary text colour (`--color-text-secondary`) and a `--color-muted` for meta info. Don't add a second accent.

The layout is a **three-column document shell**, owned by `Base.astro` and applied site-wide: a 200px left rail (owner avatar + name + site navigation), a 680px content column, and a 200px right rail (the article TOC). Rails are sticky. The right rail's track is reserved on **every** page but its contents render only on article pages -- that keeps the content column at the same x everywhere instead of re-centring page to page. Breakpoints: below 1200px the right rail is dropped, below 1000px the left rail is dropped and its navigation moves into a hamburger drawer in the header.

The bylines / date / reading time / tags meta sits as a single row directly under the title, using inline Tabler icons. The article hero image sits **above** the title, inside the content column.

## Customisation

Design tokens live in `src/styles/tokens.css` with their default values. To restyle the site, override tokens in `src/styles/theme.css` -- declarations there are unlayered, so they always beat the `@layer base` defaults. Don't edit `tokens.css` or `Base.astro` for visual changes.

Colours are defined with `light-dark(<light>, <dark>)`, so each token carries both modes. Overriding with a plain colour changes light and dark at once; use `light-dark()` in the override to keep them distinct. There is no separate dark palette to maintain.

Webfonts are configured in `astro.config.mjs` under `fonts:`. To swap the body face, change the `name:` for the entry bound to `cssVariable: "--font-body"`. Good alternatives: Geist, IBM Plex Sans, Söhne (if you have a licence), Public Sans. If you want a serif-bodied blog, swap to a humanist serif like Source Serif, Crimson Pro, or Lora -- but then also raise `--font-size-base` to `1.0625rem` for readability. To give headings their own face (or use a system font) without touching the font pipeline, override `--font-heading` or `--font-body` in `theme.css`.

CSS variables worth knowing (see `tokens.css` for the full list):

- `--color-brand`, `--color-brand-hover`, `--color-on-brand`, `--color-brand-ring`
- `--color-bg`, `--color-bg-subtle`, `--color-surface`, `--color-text`, `--color-text-secondary`, `--color-muted`, `--color-border`, `--color-border-subtle`
- `--font-body`, `--font-heading`, `--font-mono`
- `--font-weight-heading` (600) / `--font-weight-display` (600) -- heading weights; lower them if you switch to a serif
- `--tracking-tight` / `--tracking-snug` / `--tracking-wide` / `--tracking-wider` -- letter-spacing tokens used across headings and meta labels
- `--content-width` (680px) -- article body column
- `--wide-width` (1200px) -- max container (header, footer)
- `--rail-width` (200px) -- left and right rail of the three-column shell
- `--avatar-size-{xs,sm,md,lg}` -- byline avatars at each scale; `lg` (40px) is the rail avatar

## What not to do

- Don't add a second accent colour or coloured section backgrounds. The page should be black, white, and one orange.
- Don't replace Public Sans with a display sans (Bebas, Anton, etc.). Headings rely on weight contrast, not novelty faces.
- Don't collapse the three-column shell on desktop, and don't let the right rail's track disappear on non-article pages -- the reserved track is what keeps the content column from jumping between pages.
- Don't put the post meta back into a left column -- it belongs on one row under the title.
- Don't let page components declare their own outer `max-width` / horizontal padding -- the shell owns column width and page gutters.
- Don't reach for a byline's `avatarMediaId` when building an image URL -- it 404s. Use `avatarStorageKey` via `mediaUrl()`.
- Don't use stock blog copy ("Welcome to my blog", "Stay tuned for more"). Write a real tagline that says what this blog is about.
- Don't seed the home page with three identical placeholder posts. If you only have one real post, show one real post.
- Comments are enabled on posts and rendered on the post detail page. Configure moderation before publishing the site, or remove `commentsEnabled` and the comments UI together.
