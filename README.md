# synaptane.com

Source of [synaptane.com](https://synaptane.com): the website and the documentation of
[Synaptane](https://github.com/synaptane/synaptane), the team second brain stored in Git.

Built with [Astro](https://astro.build) and [Starlight](https://starlight.astro.build) (docs),
in English (`/`) and French (`/fr/`), themed like the application (Paper by day, Slate by
night). Static, served by GitHub Pages. No analytics, no cookies, no third-party script or font.

## Run locally

Node 22 and npm.

```sh
npm ci
npm run dev           # http://localhost:4321, live reload (drafts shown)
npm run build         # static site in dist/ (+ Pagefind search index, sitemap)
npm run preview       # serve dist/
npm run check         # astro check: TypeScript and Astro diagnostics
npm run check-links   # internal links and #anchors of dist/ (after a build, no network)
npm run check-demo    # the static demo: read-only, no secret, links (python3, no dependency)
npm run sync-docs     # copy the docs from ../synaptane-public (see below)
npm run test-sync-docs # tests of the Markdown conversion of sync-docs (node --test)
npm run build-demo    # regenerate the static demo from ../synaptane-public (see below)
```

## Structure

```text
astro.config.mjs        site URL, languages, Starlight (sidebar, theme, component overrides)
src/
  site.ts               facts used everywhere: GitHub URLs, version, main navigation
  i18n/                 interface strings: en.ts, fr.ts (same keys, checked by TypeScript)
                        + index.ts helpers (getLang, useTranslations, localizePath…)
  layouts/Base.astro    layout of every site page: SEO head, hreflang, header, footer
  components/           Button, Section, Card, CardGrid, CodeBlock (copy button), Screenshot
                        (light/dark), PageHeader, Todo, Icon, ThemeControl, LanguageSwitcher,
                        SiteHeader, SiteFooter, Lightbox (screenshot viewer), FontPreload; content/
                        (ReleaseNotes, Roadmap, AuthorCard, NewsletterNote)
  components/starlight/ Starlight overrides: Header (laid out like SiteHeader, + site links),
                        ThemeSelect, LanguageSelect, MobileMenuFooter, EditLink (edits the
                        source in synaptane/synaptane), MarkdownContent (wraps each table in a
                        focusable area that scrolls sideways on narrow screens), Head (social
                        preview, og:locale, structured data)
  styles/tokens.css     the application's tokens and @font-face, + adjusted fallback fonts (site and docs)
  styles/site.css       base styles of the site pages
  styles/starlight.css  Starlight variables mapped onto the tokens
  pages/                site pages in English; pages/fr/ the same pages in French
  content/releases/     GENERATED copy of the main repository's CHANGELOG.md (release notes)
                        + links.fr.json (French equivalents of its links)
  lib/                  changelog.ts (CHANGELOG parser), screenshots.ts (screenshots of the app
                        in src/assets/app/, by name, language and theme), structured-data.ts
                        (schema.org JSON-LD), install.ts (install commands), not-found.ts and
                        known-pages.ts (suggestions and docs search of the 404 pages)
  route-data.ts         Starlight route middleware: the <title> of the docs pages
  content/docs/         GENERATED docs (Starlight): docs/ (English), fr/docs/ (French)
  content/i18n/         overrides of Starlight's interface strings
public/                 served as is: CNAME, favicon, og.png and og-fr.png (GENERATED), robots.txt,
                        fonts/ (OFL), images/, docs/assets/ (GENERATED), demo/app/ and
                        fr/demo/app/ (GENERATED)
scripts/                sync-docs.mjs, check-links.mjs (Node, no dependency); csp.mjs (Astro
                        integration: Content-Security-Policy and referrer policy of every page);
                        build-demo/ (static demo generator, Python, see its README);
                        og-image.py (social preview images og.png and og-fr.png, from the tokens,
                        the logo and the demo: uv run --no-project --with playwright python scripts/og-image.py)
docs/DNS.md             DNS records and GitHub Pages settings for synaptane.com
```

### Languages

English is at the root, French under `/fr/`. The languages are declared once, in Starlight's
`locales` (`astro.config.mjs`); Starlight derives Astro's `i18n` configuration from them, so
`Astro.currentLocale` and `astro:i18n` work in the site pages too.

**Convention: one file per language, same path.** Each site page exists twice:
`src/pages/about.astro` (`/about/`) and `src/pages/fr/about.astro` (`/fr/about/`). The page copy
is written in the page files themselves (no copy in dictionaries); only the shared interface
strings (header, footer, buttons) live in `src/i18n/`. This was preferred to a single dynamic
route per page because the pages are mostly prose: each language reads and edits naturally,
and two people can work on two pages without touching a shared file.

The language switcher and the `hreflang` links assume the twin exists at the same path. A page
without translation passes `alternate={null}` (or another URL) to `Base`. URLs always end with a
slash (`trailingSlash: 'always'`); build links with `localizePath('/docs/', lang)`.

### Where to write

| Page | Files | Notes |
| --- | --- | --- |
| Home | `src/pages/index.astro`, `src/pages/fr/index.astro` | The install commands shown on the home and demo pages are in `src/lib/install.ts`. |
| Demo | `src/pages/demo/index.astro`, `src/pages/fr/demo/index.astro` | Presents the demo and links to it. |
| Static demo | `public/demo/app/` → `/demo/app/`, `public/fr/demo/app/` → `/fr/demo/app/` | **Generated** by `scripts/build-demo/`, committed; do not edit. `check-links` and `check-demo` cover them. Not indexed (Pagefind, `noindex`; its HTML fragments, `-/tree/` and `-/related/`, are kept out of crawling by `public/robots.txt`). |
| Releases | `src/pages/releases/index.astro` (+ `fr/`) | Generated from the main repository's `CHANGELOG.md` (`npm run sync-docs`): one section per version. Do not write release notes here. |
| Roadmap, About, Legal | `src/pages/{roadmap,about,legal}.astro` (+ `fr/`) | |
| 404 | `src/pages/404.astro`, `src/pages/fr/404.astro` | GitHub Pages serves a single bilingual `404.html`; under `/fr/` it loads the French one, which restores the address. With JavaScript, `src/lib/not-found.ts` suggests the page the address probably meant (a link copied from the repository, `/docs/x.md`; a missing `/docs/`; a typo) and searches the docs (Pagefind) for a `/docs/…` address. |
| Docs | **not here**: `docs/` of synaptane/synaptane | See below. |

Content still to write goes in a `<Todo>` block (`src/components/Todo.astro`), clearly visible on the
page. None may be published: `grep -rn "<Todo" src/pages` must return nothing.

Rules for the site pages: no client framework and no external script; interactive bits are
small inline scripts (theme, copy button). Every page gets a Content-Security-Policy at build time
(`scripts/csp.mjs`): the site's own files, and the inline scripts of the page by their hash,
computed then; an inline event handler (`onclick="…"`) or a script from another domain is blocked.
Printed, a site page is on white paper, without menus, footer or buttons, with the address of the
links of the text (`@media print` in `src/styles/site.css`). Images in `src/assets/` go through
`astro:assets` (`Screenshot` accepts imported images or paths under `public/`). Colors, radii and
fonts come from the tokens (`var(--ink)`, `var(--accent)`, `var(--radius)`…); check both
themes. Tone: clear and direct, no marketing jargon; « vous » in French.

### Theme

Light (Paper) and dark (Slate) follow `prefers-color-scheme`. The switch stores the choice in
`localStorage` under `starlight-theme`, the key Starlight reads, so the site pages and the docs
share it. The tokens are a copy of the application's (`src/synaptane/web/static/app.css`):
update `src/styles/tokens.css` when they change there.

The site derives from these tokens (colors, radii, spacing) but keeps one identity in both
themes, where the application changes its fonts with the theme. The « Site identity » block at
the end of `tokens.css` sets:

- **Display and text font: Geist** (Geist Mono for code), in both themes: the hero, the titles
  of the site pages and of the docs, the text. It is Slate's font and that of the social preview
  images, it holds up at hero size and next to the wordmark of the logo; a single family also
  means a single font to preload (`src/components/FontPreload.astro`) and no second sans that
  looks almost the same.
- **Reading font: Geist too**, at Slate's size (16.5px, line height 1.7), for the long text
  (about, legal, docs): no switch from a serif to a sans with the theme. The docs are dense with
  code, tables and asides, already set in the sans.
- **Brand color: the lime of the logo's dot, `#B6F36A`**, in both themes: favicon,
  apple-touch-icon, social images (`og.png`, `og-fr.png`, dark background), dark logo. The light
  logo (`src/assets/brand/logo.svg`) has the same hue darkened, `#7BC91D`, to stay visible on the
  light background.
- **Interface color**: `--accent` of the theme, i.e. teal (`#1F6F6A`) in light for links,
  buttons and focus, lime in dark. Lime text is not readable on a light background (1.2:1), so in
  light lime is the brand, teal the interface.

The application keeps its two themes (Paper: Instrument Sans, Newsreader; Slate: Geist); the
screenshots and the static demo show them as they are. All the fonts stay in `public/fonts/`:
the demo uses them.


## Documentation

The docs are written in the main repository (`docs/X.md` in English, `docs/X.fr.md` in French)
and copied here by `npm run sync-docs`:

- `docs/X.md` → `src/content/docs/docs/X.md` (`/docs/X/`), `docs/X.fr.md` →
  `src/content/docs/fr/docs/X.md` (`/fr/docs/X/`), `docs/assets/*` → `public/docs/assets/`
  (only the assets a page or a file of `src/` links to, plus `screenshot-*.png` and
  `architecture*.svg`, which the home page uses);
- GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`) become
  Starlight asides (`:::note`, `:::tip`, `:::note[Important]`, `:::caution`, `:::danger`);
- the French pages get French typography outside code, URLs and HTML (`’`, a non-breaking space
  before `:` and inside « », a narrow one before `; ? !`), and the links to the headings whose
  id changed are updated (`scripts/docs-transform.mjs`, tested by `npm run test-sync-docs`);
- the "English | Français" line is dropped (Starlight has its language switcher), the first
  `# Title` becomes the front matter `title`, the first real paragraph of prose the
  `description` (paragraphs under 50 characters or ending with `:` are skipped; cut at 155
  characters, after a sentence if possible; a `description` in the source front matter wins),
  and the order of the links in `docs/index.md` the sidebar order;
- links between pages become site routes (anchors kept); links to other files of the repository
  (README, CHANGELOG, code…) point to GitHub at the synced ref;
- `CHANGELOG.md` → `src/content/releases/CHANGELOG.md`, with the same link rewriting. The
  `releases` collection (`src/content.config.ts`, parser in `src/lib/changelog.ts`) splits it into
  versions (Keep a Changelog: `## [1.0.0] - 2026-11-02`, `## [Unreleased]`, `[1.0.0]: <url>`), and
  `/releases/` renders one section per version. A version without a date shows "Unreleased" and
  links to the changelog on GitHub instead of its release page, with a "Coming soon" badge
("Preview coming soon" for a pre-release); the hero and the footer say the same
(`src/lib/release.ts`): "Latest release" for a released stable version (green dot in the hero),
"Coming soon" / "Next release" before its date, "Preview" only for a version with a suffix
(`v1.0.0-rc.1`, amber dot). A version without a date and without any note (the empty
`## [Unreleased]` kept between two versions) is left out: no section, no link in the list of
versions. Each version shows its introduction (the paragraph before its first `###` heading) and
the number of entries per section; its full notes are folded (`<details>`), open for the latest
version only, and a link to `#v1.9.0` or to one of its headings opens them. On the French page,
the section headings (Added, Changed…) are translated; the notes stay in English, but their links
lead to the French pages when they exist: `src/content/releases/links.fr.json`, written by
sync-docs, maps `/docs/x/#id` to `/fr/docs/x/#french-id` and `README.md#id` (on GitHub) to
`README.fr.md#french-id` (the French heading at the same position: the translations keep the
outline of the original).

The generated files are committed (the site builds without the main repository), start with a
"generated" comment, and are listed in `docs-sync.json` with the source commit. Do not edit
them: fix the main repository and sync again.

```sh
npm run sync-docs                                   # from ../synaptane-public, as it is
npm run sync-docs -- --source ../synaptane          # another local clone
npm run sync-docs -- --ref v1.0.0-rc.1              # clone synaptane/synaptane at a tag/branch/commit
npm run sync-docs -- --check                        # exit 1 if the committed docs are out of date
```

`--check` compares the committed files with a sync at the ref recorded in `docs-sync.json` (the
release they come from), taken from `../synaptane-public` (or `--source`) when it exists, else
from GitHub: a local clone that has moved on since the release does not make it fail. Add
`--ref <ref>` to check against another ref.

In CI, the **Sync docs** workflow does the same for a given ref (manual run, or
`repository_dispatch` of type `sync-docs` with `client_payload.ref`, which a release of the main
repository can send) and opens a pull request when the docs changed. The repository setting
*Actions → General → Allow GitHub Actions to create and approve pull requests* must be on.
Pull requests opened with the workflow token do not trigger other workflows: the sync workflow
builds and checks the site itself.

The sidebar groups (Overview, Guide, Administration, Reference, Development) are in
`astro.config.mjs`; a new folder under `docs/` needs a new group there. Search is Starlight's
Pagefind index, built for both languages, docs only.

## Static demo

`/demo/app/` (English) and `/fr/demo/app/` (French) are a frozen copy of the real Synaptane
interface, generated from the Acme demo wiki on a throwaway instance: about 175 pages per
language (wiki with its PDF, Office, image and HTML files, history and diffs, inbox, health,
activity, routines, prepared searches, AI assistants), read-only, without any request to a
server. `public/demo/app/MANIFEST.json` gives the Synaptane version and commit, the date and the
list of pages.

```sh
(cd ../synaptane-public && docker compose -f compose.dev.yaml up -d)   # PostgreSQL + pgvector
npm run build-demo                                                    # ~30 s
npm run build && npm run check-links && npm run check-demo
uv run --no-project --with playwright python scripts/build-demo/browse.py   # headless check
```

How it works, what is frozen and what is disabled: [scripts/build-demo/README.md](scripts/build-demo/README.md).
The presentation pages are `src/pages/demo/index.astro` and `src/pages/fr/demo/index.astro`
(they read the version, date and queries from the manifest). The screenshots of the application
on the site (home page, `/demo/` page) are taken on the static demo by `browse.py --gallery`, in
both languages and both themes: see the generator's README.

## Deployment

`.github/workflows/deploy.yml`: on every push to `main`, `npm ci`, `npm run check`,
`npm run build`, `npm run check-links`, `npm run check-demo`, then deployment to GitHub Pages (pull requests run the
same checks without deploying). Actions are pinned by commit hash; Dependabot updates them and
the npm dependencies every week.

Repository settings: *Settings → Pages → Source: GitHub Actions*, custom domain
`synaptane.com`, *Enforce HTTPS*. DNS records: [docs/DNS.md](docs/DNS.md). GitHub Pages sets the
HTTP headers itself: every file is cached 10 minutes, hashed ones included, and no security header
can be added (no HSTS); the CSP and the referrer policy are in a `<meta>` of each page. Details
and what would change it: [docs/DNS.md](docs/DNS.md#http-headers-and-cache-the-limits-of-github-pages).

## License

The code of this site is under the [Apache License 2.0](LICENSE). The documentation comes from
[synaptane/synaptane](https://github.com/synaptane/synaptane), under the same license. Fonts:
SIL Open Font License (`public/fonts/OFL-*.txt`).
