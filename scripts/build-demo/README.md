# Static demo generator

Builds the static demo of synaptane.com (`/demo/app/`, `/fr/demo/app/`): the **real pages of
the Synaptane interface**, generated from the Acme demo wiki and frozen into plain HTML. Visitors
move around as in the product (tree, links, tabs, history, search), but nothing can be changed
and nothing calls a server. A banner on every page says so, links to the installation guide, and
leads back to the demo's page on the site (`/demo/`, `/fr/demo/`).

The output is committed (`public/demo/app/`, `public/fr/demo/app/`): the site builds without the
application. Regenerate it after a Synaptane release, or when the interface or the demo data
changed.

## Regenerate

Needs `uv`, `git`, a clone of [synaptane/synaptane](https://github.com/synaptane/synaptane)
next to this repository (`../synaptane-public`, or `SYNAPTANE_APP=…`), `tesseract` with the
English and French data (packages `tesseract-ocr`, `tesseract-ocr-eng`, `tesseract-ocr-fra`:
the scanned PDF and the image of the data set are read by OCR; the build stops without it),
`catdoc` (package `catdoc`, with `xls2csv` and `catppt`: the 2019 inventory of the data set is an
old `.xls` file; the build stops without it too) and a PostgreSQL with pgvector, such as the
application's development one:

```sh
(cd ../synaptane-public && docker compose -f compose.dev.yaml up -d)   # 127.0.0.1:5433
npm run build-demo            # = scripts/build-demo/build.sh
npm run build && npm run check-links && npm run check-demo
uv run --no-project --with playwright python scripts/build-demo/browse.py   # headless check
```

`browse.py --gallery` (with `--with pillow --with imagequant`, about 4 minutes) also retakes the
site's screenshots of the application in `src/assets/app/` (list `GALLERY` of `browse.py`): the
home page hero and gallery, and the `/demo/` page, in English and French, light and dark,
without the demo's banner and notes. For each screen: `<name>-<lang>-<theme>.png`, the whole
window (2000×1250, opened by the viewer), and `…-crop.png`, its useful part, readable in a
gallery frame, or `…-mobile.png`, the same page on a phone (390 px wide, shown under 640 px).
256-color PNG; Astro serves them in WebP. `src/lib/screenshots.ts` picks them by name and
language; a page loads only those of its language and theme.

Options of `build.sh`: `--admin-url` (a PostgreSQL role allowed to create databases, default
`postgresql://synaptane:synaptane@127.0.0.1:5433/postgres`), `--db-name` (default
`synaptane_staticdemo`; it must contain `staticdemo`). The run takes about half a minute.

## How it works

`build.sh` runs `build_demo.py` in the application's own Python environment
(`uv run --project ../synaptane-public`, plus `httpx` and `beautifulsoup4`).

1. **Throwaway instance** (`instance.py`): a dedicated database, created then dropped; a
   temporary data folder; `SYNAPTANE_ALLOW_LOCAL_REPOS=true`; `synaptane init`, `db upgrade`.
   The demo Git repository is seeded here with the data set (`examples/acme-wiki`, through the
   application's own `demo.dataset_files`), dated two weeks back, then **a little fictional
   life** (`life.py`): five commits by the people of the data set (a guest VLAN, recovery
   targets in the restore procedure, GitLab backups, VPN troubleshooting, and a page
   verification), dated relative to the build day. `synaptane demo` then creates the `demo`
   account, the `acme` organization and the `acme/it` space, syncs and indexes. A routine
   (consistency check) is added, to be seen, never run.
2. **Last night's tidy-up, replayed without AI** (`tidy_replay.py`, in the instance's
   environment). The organization gets an AI setting (Anthropic, the provider's default model)
   with a placeholder key, then the application's own scheduled run goes over the six notes of
   the inbox. Only the model is replaced: a conversation that answers with the tool calls
   written in `life.TIDY_RUN` (read the notes and the pages, edit `infra/storage.md` and
   `team/meetings.md`, file the CSV next to `network/topology.md`, create a decision page,
   leave "Old server?" with a question for its author). The rest is the application's code:
   the tools, the end-of-run check, the single commit by "Synaptane tidy-up", the notes closed
   or left with their reason, the log with its operations, quality measures and cost (of the
   tokens declared for each turn). Its clock is set to last night's 02:00 (Europe/Paris); the
   worker's follow-up (sync, index) is done by the script. Two notes are then dropped, as the
   application writes them, between the run and the build (`life.NEW_NOTES`): they wait for
   the next run. No provider is ever opened (the script makes sure of it), and AI keys of the
   environment are not passed on. The plan is checked against the wiki before the run and the
   outcome after it (5 notes filed, 1 left, no tool error): when the data set no longer fits,
   the build stops and says why. The static demo says, on the Tidy-up page, the pages of the
   run and the inbox, that the run was replayed and that nothing runs there.
3. **Crawl**: `synaptane serve` on a free port, signed in as `demo`, once per interface
   language (the account's language is switched between the two passes). The crawl follows
   links from a few seeds, within an allow list (`Rules.classify`): home, organization, space,
   every wiki page and folder (and the "missing page" view of the broken link), every page
   history, the diffs of the fictional commits (the tidy-up run's included) and of the pages
   they touch, raw files (the
   PDF, image, HTML and Office files of `infra/documents/`, its `archive/`, and `team/documents/`), inbox and
   notes, the tidy-up log and the pages changed by the run, activity (and its filters), health (and its periods),
   routines (list and log), purpose, the prepared searches (`QUERIES`: the last four, `kestrel`,
   `mttr`, `docking` and `netware`, find the scan by OCR, the slides, the spreadsheet and the old
   `.xls` inventory), "View source" of
   the HTML file, and "AI assistants" (the demo account has no token). Tree folders and "See also" panels, loaded by the page script,
   are frozen as HTML fragments.
4. **Rewrite** (`Rewriter`): internal links point to the frozen files
   (`/o/acme/it/p/x.md` → `/demo/app/o/acme/it/p/x.md/`, `?kind=page` → `/@kind-page/`,
   `/search?q=vpn` → `/search/vpn/`); a link to anything else leads to the "Not available in
   the static demo" page (`/demo/app/unavailable/`). Static files are copied under
   `/demo/app/static/` (shared by both languages); the fonts, identical to the site's, are
   taken from `/fonts/`. Then, on every page:
   - every form except search is frozen: `action`/`method` removed, `data-demo-off`, every
     control (and fieldset) `disabled` + `aria-disabled="true"`; every submit button anywhere
     too; CSRF fields removed;
   - the search palette (live JSON) is removed; Ctrl+K and `/` open the search page; the search
     form leads to a prepared search or says which words are available;
   - polling hooks (assistant test, tidy-up state) are removed, the user id becomes `demo`, the
     instance address becomes `https://brain.acme.example` (fictional);
   - a strict `Content-Security-Policy` meta (the application's, plus `form-action 'none'`),
     `noindex`, `demo.css`, `demo.js` (before the application's `preferences.js`) and the
     banner (link back to the demo's page on the site, theme switch shared with the site, link
     to the page in the other language; on phones, shorter labels keep it to two lines);
   - "Download" links get the `download` attribute (a static file has no
     `Content-Disposition`); a document without preview (Word, PowerPoint, Excel) shows its
     extracted text unfolded;
   - the Tidy-up page and the pages of the run get a note: the run was replayed when the demo
     was generated, without AI (tokens and cost are an estimate), and nothing runs in the
     static demo; the inbox gets a shorter one, with a link to the Tidy-up tab. The run's
     operations are shown unfolded.

   Files keep their bytes: the PDF opens in the browser's viewer, in the page's frame, as in
   the application. The HTML file is shown in its sandboxed frame (opaque origin); since
   GitHub Pages sends no header, it carries the policy the application gives raw files as a
   meta (`default-src 'none'; style-src 'unsafe-inline'`…): its own styles, no script, nothing
   from the network, even opened on its own.
5. **Manifest**: `public/demo/app/MANIFEST.json` (Synaptane version and commit, date, queries,
   every page with its English and French addresses and titles).
6. **Checks**: `check_demo.py` (standard library only, also in CI as `npm run check-demo`):
   links of the demo resolve, no external resource, no inline script/style/event attribute
   (inline styles allowed in the wiki's HTML files, which must carry their policy),
   a banner with its link back to `/demo/` (`/fr/demo/`) on every page, every form frozen, and no CSRF token, cookie name, Bearer token, `sk-` key, localhost or
   127.0.0.1, local path, `file://` URL, or e-mail address outside `*.example`/`*.internal`.
   `browse.py` (Playwright, full headless Chromium for its PDF viewer, after `npm run build`):
   every request stays on demo files or `/fonts/`, no console error, no active control, a
   forced submission changes nothing, the theme switch, the PDF viewer, the rendered HTML file,
   the extracted text of the slides, a click-through path (and one from the tidy-up log to a
   diff of the run), the link back to the site and the two-line banner at 360 px, and screenshots in `screenshots/demo/` (`--gallery` also
   refreshes the site's screenshots in `src/assets/app/`, see above).

The instance is always torn down (server stopped, database dropped, folder deleted), even after
an error.

## Files

| File | Role |
| --- | --- |
| `build.sh` | entry point: the application's environment, then `build_demo.py` |
| `build_demo.py` | crawl rules, URL mapping, rewriting, output, manifest |
| `instance.py` | throwaway instance: database, data folder, seed, `serve`, sign-in, cleanup |
| `life.py` | the fictional commits, the model's side of the tidy-up run, the notes dropped since |
| `tidy_replay.py` | the tidy-up run replayed through the application's code, without AI |
| `demo.js`, `demo.css` | copied to `/demo/app/static/`: banner, frozen forms, search, theme |
| `check_demo.py` | checks of the output (no dependency) |
| `browse.py` | headless browser checks and screenshots |

Do not edit the generated files by hand: change the generator and run it again.
