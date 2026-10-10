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
npm run sync-docs     # copy the docs from ../synaptane-public (see below)
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
                        SiteHeader, SiteFooter; blog/ (PostList, PostPage)
  components/starlight/ Starlight overrides: Header (+ site links), ThemeSelect, LanguageSelect,
                        MobileMenuFooter, EditLink (edits the source in synaptane/synaptane)
  styles/tokens.css     the application's tokens and @font-face (shared by site and docs)
  styles/site.css       base styles of the site pages
  styles/starlight.css  Starlight variables mapped onto the tokens
  pages/                site pages in English; pages/fr/ the same pages in French
  content/blog/{en,fr}/ blog posts (schema in src/content.config.ts)
  content/docs/         GENERATED docs (Starlight): docs/ (English), fr/docs/ (French)
  content/i18n/         overrides of Starlight's interface strings
public/                 served as is: CNAME, favicon, og.png, robots.txt, fonts/ (OFL),
                        docs/assets/ (GENERATED)
scripts/                sync-docs.mjs, check-links.mjs (Node, no dependency)
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
| Home | `src/pages/index.astro`, `src/pages/fr/index.astro` | Replace the `<Todo>` blocks. |
| Demo | `src/pages/demo/index.astro`, `src/pages/fr/demo/index.astro` | Presents the demo and links to it. |
| Static demo | `public/demo/app/` → `/demo/app/` | Generated files, committed. Keep its internal links valid (`check-links` covers them), or run `check-links -- --ignore /demo/app/`. Not indexed by Pagefind. |
| Blog | `src/content/blog/en/<slug>.md`, `src/content/blog/fr/<slug>.md` | Front matter: `title`, `description`, `date`, `author`, `lang` (+ `updated`, `draft`). Same file name in both languages. Delete the `hello-world` drafts. |
| Releases | `src/pages/releases/index.astro` (+ `fr/`) | Per-version pages can go in `src/pages/releases/[version].astro`. |
| Roadmap, About, Legal | `src/pages/{roadmap,about,legal}.astro` (+ `fr/`) | |
| 404 | `src/pages/404.astro` | One bilingual page (GitHub Pages serves a single `404.html`). |
| Docs | **not here**: `docs/` of synaptane/synaptane | See below. |

Before the launch, `grep -rn "<Todo" src/` must return nothing.

Rules for the site pages: no client framework and no external script; interactive bits are
small inline scripts (theme, copy button). Images in `src/assets/` go through
`astro:assets` (`Screenshot` accepts imported images or paths under `public/`). Colors, radii and
fonts come from the tokens (`var(--ink)`, `var(--accent)`, `var(--radius)`…); check both
themes. Tone: clear and direct, no marketing jargon; « vous » in French.

### Theme

Light (Paper) and dark (Slate) follow `prefers-color-scheme`. The switch stores the choice in
`localStorage` under `starlight-theme`, the key Starlight reads, so the site pages and the docs
share it. The tokens are a copy of the application's (`src/synaptane/web/static/app.css`):
update `src/styles/tokens.css` when they change there.

## Documentation

The docs are written in the main repository (`docs/X.md` in English, `docs/X.fr.md` in French)
and copied here by `npm run sync-docs`:

- `docs/X.md` → `src/content/docs/docs/X.md` (`/docs/X/`), `docs/X.fr.md` →
  `src/content/docs/fr/docs/X.md` (`/fr/docs/X/`), `docs/assets/*` → `public/docs/assets/`;
- the "English | Français" line is dropped (Starlight has its language switcher), the first
  `# Title` becomes the front matter `title`, the first paragraph the `description`, and the
  order of the links in `docs/index.md` the sidebar order;
- links between pages become site routes (anchors kept); links to other files of the repository
  (README, CHANGELOG, code…) point to GitHub at the synced ref.

The generated files are committed (the site builds without the main repository), start with a
"generated" comment, and are listed in `docs-sync.json` with the source commit. Do not edit
them: fix the main repository and sync again.

```sh
npm run sync-docs                                   # from ../synaptane-public, as it is
npm run sync-docs -- --source ../synaptane          # another local clone
npm run sync-docs -- --ref v1.0.0-rc.1              # clone synaptane/synaptane at a tag/branch/commit
npm run sync-docs -- --check                        # exit 1 if the committed docs are out of date
```

In CI, the **Sync docs** workflow does the same for a given ref (manual run, or
`repository_dispatch` of type `sync-docs` with `client_payload.ref`, which a release of the main
repository can send) and opens a pull request when the docs changed. The repository setting
*Actions → General → Allow GitHub Actions to create and approve pull requests* must be on.
Pull requests opened with the workflow token do not trigger other workflows: the sync workflow
builds and checks the site itself.

The sidebar groups (Overview, Guide, Administration, Reference, Development) are in
`astro.config.mjs`; a new folder under `docs/` needs a new group there. Search is Starlight's
Pagefind index, built for both languages, docs only.

## Deployment

`.github/workflows/deploy.yml`: on every push to `main`, `npm ci`, `npm run check`,
`npm run build`, `npm run check-links`, then deployment to GitHub Pages (pull requests run the
same checks without deploying). Actions are pinned by commit hash; Dependabot updates them and
the npm dependencies every week.

Repository settings: *Settings → Pages → Source: GitHub Actions*, custom domain
`synaptane.com`, *Enforce HTTPS*. DNS records: [docs/DNS.md](docs/DNS.md).

## License

The code of this site is under the [Apache License 2.0](LICENSE). The documentation comes from
[synaptane/synaptane](https://github.com/synaptane/synaptane), under the same license. Fonts:
SIL Open Font License (`public/fonts/OFL-*.txt`).
