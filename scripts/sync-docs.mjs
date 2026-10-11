#!/usr/bin/env node
// Copies the documentation of the main repository (synaptane/synaptane, folder `docs/`) into
// the Starlight content collection of this site.
//
//   docs/X.md     -> src/content/docs/docs/X.md       (English, served at /docs/X/)
//   docs/X.fr.md  -> src/content/docs/fr/docs/X.md    (French,  served at /fr/docs/X/)
//   docs/assets/* -> public/docs/assets/*             (served at /docs/assets/*; only the files
//                                                      used by the docs or the site, see ASSETS)
//   CHANGELOG.md  -> src/content/releases/CHANGELOG.md (release notes, rendered at /releases/)
//
// Usage:
//   node scripts/sync-docs.mjs                        # from ../synaptane-public (local clone)
//   node scripts/sync-docs.mjs --source ../synaptane  # from another local clone
//   node scripts/sync-docs.mjs --ref v1.0.0-rc.1      # shallow-clones synaptane/synaptane at a ref
//   node scripts/sync-docs.mjs --source ../x --ref main  # a ref of a local clone (left untouched)
//   node scripts/sync-docs.mjs --check                # writes nothing, exits 1 if out of date
//
// Options: --repo <owner/name> (default synaptane/synaptane), --link-ref <ref> (ref used in the
// GitHub links to files outside docs/; defaults to the synced ref, or to the branch of a local
// source). Environment: SYNC_DOCS_TOKEN, to clone the repository while it is private.
//
// The generated files are committed (the site builds without the main repository). Each one
// starts with a "generated" comment, and docs-sync.json lists them with the source commit: a
// new sync first removes the files of the previous one, so pages deleted upstream disappear.
// The pages are converted on the way (scripts/docs-transform.mjs, tested by
// `npm run test-sync-docs`): GitHub alerts (`> [!NOTE]`) become Starlight asides (`:::note`),
// and the French pages get French typography outside code (’, non-breaking spaces).
// Typography changes the ids of some French headings (`## Annexe : x` -> #annexe-x instead of
// #annexe--x): the links to them are updated (ids computed with github-slugger, as Astro does).
// Requirements: Node >= 22, git, and `npm ci` done (github-slugger comes with Astro).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import GithubSlugger from 'github-slugger';
import { convertCallouts, frenchTypography, isFence, mapOutsideInlineCode, updateFence } from './docs-transform.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'docs-sync.json');
const EN_DIR = 'src/content/docs/docs';
const FR_DIR = 'src/content/docs/fr/docs';
const ASSETS_DIR = 'public/docs/assets';
const CHANGELOG = 'src/content/releases/CHANGELOG.md';
const DOCS_BASE = { en: '/docs/', fr: '/fr/docs/' };
// docs/assets/ also holds files for the repository itself (logo, icon, social preview): only the
// assets a page of the docs or a file of the site (src/) links to are copied, plus these
// patterns, which the site builds at run time (src/components/home/Gallery.astro).
const ASSETS = [/^screenshot-[\w-]+\.png$/, /^architecture[\w-]*\.svg$/];

const { values: args } = parseArgs({
  options: {
    source: { type: 'string' },
    ref: { type: 'string' },
    repo: { type: 'string', default: 'synaptane/synaptane' },
    'link-ref': { type: 'string' },
    check: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (args.help) {
  const header = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1);
  console.log(header.slice(0, header.findIndex((l) => !l.startsWith('//'))).join('\n').replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}

const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// ---------- Source ----------
let source;
let tempDir;
let ref = args.ref;
if (!args.ref) {
  // Local clone, as it is (working tree included).
  source = resolve(ROOT, args.source ?? '../synaptane-public');
  if (!existsSync(join(source, 'docs'))) fail(`No docs/ folder in ${source}. Use --source <path> or --ref <ref>.`);
  ref = safe(() => git(source, 'rev-parse', '--abbrev-ref', 'HEAD')) || 'main';
  if (ref === 'HEAD') ref = 'main';
} else {
  // A ref: clone it into a temporary folder, from GitHub or from --source (left untouched).
  tempDir = mkdtempSync(join(tmpdir(), 'synaptane-docs-'));
  source = join(tempDir, 'repo');
  const url = args.source ? `file://${resolve(ROOT, args.source)}` : `https://github.com/${args.repo}.git`;
  // A private repository needs a token with read access: SYNC_DOCS_TOKEN (sent as an HTTP
  // header, never written in the URL or in the logs).
  const token = process.env.SYNC_DOCS_TOKEN;
  const auth = token && !args.source
    ? ['-c', `http.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`]
    : [];
  console.log(`Cloning ${url} at ${ref}…`);
  try {
    try {
      git(ROOT, ...auth, 'clone', '--quiet', '--depth', '1', '--branch', ref, url, source);
    } catch {
      // A commit SHA is not a branch or a tag: fetch it explicitly.
      rmSync(source, { recursive: true, force: true });
      git(ROOT, 'init', '--quiet', source);
      git(source, ...auth, 'fetch', '--quiet', '--depth', '1', url, ref);
      git(source, 'checkout', '--quiet', 'FETCH_HEAD');
    }
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    fail(`Could not get ${url} at ${ref}: ${String(error.stderr || error.message).trim()}\n` +
      'For a private repository, set SYNC_DOCS_TOKEN (a token that can read it).');
  }
}
const commit = safe(() => git(source, 'rev-parse', 'HEAD')) || 'unknown';
const linkRef = args['link-ref'] ?? ref;
const GITHUB = `https://github.com/${args.repo}`;

try {
  await main();
} finally {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
}

async function main() {
  const docsRoot = join(source, 'docs');
  const all = (await walk(docsRoot)).map((p) => relative(docsRoot, p).split('\\').join('/'));
  const pages = all.filter((p) => p.endsWith('.md') && !p.startsWith('assets/'));
  const assets = all.filter((p) => p.startsWith('assets/'));

  // Sidebar order: the order in which docs/index.md links to the pages.
  const order = sidebarOrder(await readFile(join(docsRoot, 'index.md'), 'utf8'));

  /** @type {Map<string, string | Buffer>} generated path (from ROOT) -> content */
  const out = new Map();
  const warnings = [];
  /** @type {Map<string, Map<string, string>>} page URL (/fr/docs/x/) -> old id -> new id */
  const anchors = new Map();

  for (const page of pages) {
    const lang = page.endsWith('.fr.md') ? 'fr' : 'en';
    const slug = page.replace(/(\.fr)?\.md$/, '');
    const target = posix.join(lang === 'fr' ? FR_DIR : EN_DIR, `${slug}.md`);
    const text = await readFile(join(docsRoot, page), 'utf8');
    out.set(target, convert(text, { page, lang, slug, order, warnings, file: `docs/${page}`, anchors }));
  }
  // French headings whose id changed with the typography: update the links to them.
  for (const [target, content] of out) {
    if (target.startsWith(`${FR_DIR}/`)) out.set(target, updateAnchors(content, target, anchors));
  }
  // Assets used by the docs (links rewritten to /docs/assets/…) or by the site sources.
  const used = new Set();
  const collect = (text) => {
    // (a name built at run time, `screenshot-${name}.png`, is covered by ASSETS)
    for (const m of text.matchAll(/\/docs\/assets\/([^\s"'`)<>?#${}]+)(?![$\w{-])/g)) used.add(decodeURI(m[1]));
  };
  for (const content of out.values()) collect(content);
  for (const file of await walk(join(ROOT, 'src'))) {
    if (/\.(astro|ts|mjs|js|css|md|mdx|json)$/.test(file) && !file.startsWith(join(ROOT, 'src/content/docs'))) {
      collect(await readFile(file, 'utf8'));
    }
  }
  let skipped = 0;
  for (const asset of assets) {
    const name = asset.slice('assets/'.length);
    if (!used.has(name) && !ASSETS.some((re) => re.test(name))) {
      skipped++;
      continue;
    }
    out.set(posix.join(ASSETS_DIR, name), await readFile(join(docsRoot, asset)));
  }
  for (const name of used) {
    if (!assets.includes(`assets/${name}`)) warnings.push(`/docs/assets/${name} is linked to but not in docs/assets/.`);
  }

  // The changelog (Keep a Changelog, English only), parsed by the `releases` collection
  // (src/content.config.ts). Links to other files of the repository point to GitHub.
  if (existsSync(join(source, 'CHANGELOG.md'))) {
    const text = (await readFile(join(source, 'CHANGELOG.md'), 'utf8')).replace(/\r\n?/g, '\n');
    const header =
      `<!-- Generated by scripts/sync-docs.mjs from ${args.repo}@${ref} (${commit.slice(0, 12)}): CHANGELOG.md.\n` +
      '     Do not edit this file: change the main repository, then run `npm run sync-docs`. -->\n\n';
    out.set(CHANGELOG, header + rewriteLinks(text, { page: 'CHANGELOG.md', lang: 'en', warnings, file: 'CHANGELOG.md' }).replace(/\s*$/, '\n'));
  } else {
    warnings.push('No CHANGELOG.md in the source: the release notes are not updated.');
  }

  // Every English page should have its French counterpart (and the reverse).
  const slugs = (lang) => new Set(pages.filter((p) => p.endsWith('.fr.md') === (lang === 'fr')).map((p) => p.replace(/(\.fr)?\.md$/, '')));
  const en = slugs('en');
  const fr = slugs('fr');
  for (const s of en) if (!fr.has(s)) warnings.push(`docs/${s}.md has no French translation (Starlight shows the English page under /fr/).`);
  for (const s of fr) if (!en.has(s)) warnings.push(`docs/${s}.fr.md has no English original.`);

  const manifest = {
    comment: 'Generated by scripts/sync-docs.mjs: the files below are copies of the main repository docs and changelog. Do not edit them; run `npm run sync-docs`.',
    repository: args.repo,
    ref,
    commit,
    files: [...out.keys()].sort(),
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;

  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')).files ?? [] : [];
  const stale = previous.filter((f) => !out.has(f));

  if (args.check) {
    const changed = [...out].filter(([f, c]) => !sameContent(join(ROOT, f), c)).map(([f]) => f);
    const manifestChanged = !sameContent(MANIFEST, manifestText);
    if (changed.length || stale.length || manifestChanged) {
      console.error(`Docs out of date (${changed.length} changed, ${stale.length} removed). Run npm run sync-docs.`);
      for (const f of [...changed, ...stale]) console.error(`  ${f}`);
      process.exit(1);
    }
    console.log('Docs up to date.');
    return;
  }

  for (const f of stale) await rm(join(ROOT, f), { force: true });
  for (const [f, content] of out) {
    await mkdir(dirname(join(ROOT, f)), { recursive: true });
    await writeFile(join(ROOT, f), content);
  }
  await writeFile(MANIFEST, manifestText);
  await removeEmptyDirs([EN_DIR, FR_DIR, ASSETS_DIR].map((d) => join(ROOT, d)));

  for (const w of warnings) console.warn(`warning: ${w}`);
  console.log(`Synced ${pages.length} pages, ${assets.length - skipped} assets (${skipped} unused, not copied)${out.has(CHANGELOG) ? ' and the changelog' : ''} from ${args.repo}@${ref} (${commit.slice(0, 12)}); ${stale.length} stale file(s) removed.`);
}

// ---------- Conversion of one page ----------
function convert(text, { page, lang, slug, order, warnings, file, anchors }) {
  let lines = text.replace(/\r\n?/g, '\n').split('\n');

  // Front matter of the source, if any (kept and merged).
  let sourceFrontmatter = '';
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1);
    if (end > 0) {
      sourceFrontmatter = lines.slice(1, end).join('\n');
      lines = lines.slice(end + 1);
    }
  }

  // Cross-language line ("English | [Français](x.fr.md)"): Starlight has its language picker.
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first >= 0 && /^\s*\[?English\]?(\([^)]*\))?\s*\|\s*\[?Français\]?(\([^)]*\))?\s*$/.test(lines[first])) {
    lines.splice(first, 1);
  }

  // GitHub alerts -> Starlight asides; French typography (title and description included).
  let prose = convertCallouts(lines.join('\n'));
  if (lang === 'fr') {
    const before = headingIds(prose);
    prose = frenchTypography(prose);
    const after = headingIds(prose);
    const changed = new Map(before.map((id, i) => [id, after[i]]).filter(([a, b]) => a !== b));
    if (changed.size) anchors.set(`${DOCS_BASE.fr}${slug.replace(/(^|\/)index$/, '')}${slug === 'index' ? '' : '/'}`, changed);
  }
  lines = prose.split('\n');

  // Title: the first level-1 heading outside code blocks, removed from the body.
  let title;
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    fence = updateFence(fence, lines[i]);
    if (fence || isFence(lines[i])) continue;
    const m = /^#\s+(.+?)\s*#*\s*$/.exec(lines[i]);
    if (m) {
      title = m[1];
      lines.splice(i, 1);
      break;
    }
  }
  if (!title) {
    title = slug.split('/').pop();
    warnings.push(`docs/${page}: no "# Title" heading, the file name is used.`);
  }
  while (lines.length && lines[0].trim() === '') lines.shift();

  const body = rewriteLinks(lines.join('\n'), { page, lang, warnings, file });
  const description = firstParagraph(body);

  const fm = [
    `# Generated by scripts/sync-docs.mjs from ${args.repo}@${ref} (${commit.slice(0, 12)}): docs/${page}.`,
    '# Do not edit this file: change the main repository, then run `npm run sync-docs`.',
    `title: ${yamlString(stripInline(title))}`,
  ];
  if (description && !/^description:/m.test(sourceFrontmatter)) fm.push(`description: ${yamlString(description)}`);
  const position = order.get(slug.replace(/\/index$/, '') || 'index');
  if (position !== undefined && !/^sidebar:/m.test(sourceFrontmatter)) fm.push('sidebar:', `  order: ${position}`);
  if (sourceFrontmatter.trim()) fm.push(sourceFrontmatter.trim());

  return `---\n${fm.join('\n')}\n---\n\n${body.replace(/\s*$/, '\n')}`;
}

/** Rewrites Markdown links and images outside code (fenced blocks and inline code spans). */
function rewriteLinks(markdown, ctx) {
  const lines = markdown.split('\n');
  let fence = null;
  return lines
    .map((line) => {
      const wasFence = fence;
      fence = updateFence(fence, line);
      if (wasFence || fence) return line; // inside a block, or its opening line
      return mapOutsideInlineCode(line, (segment) =>
        segment
          // [text](url "title") and ![alt](url)
          .replace(/(\]\()(<[^>]*>|[^)\s]+)((?:\s+"[^"]*")?\))/g, (_, open, url, close) => {
            const bare = url.startsWith('<') ? url.slice(1, -1) : url;
            return `${open}${rewriteUrl(bare, ctx)}${close}`;
          })
          // HTML: src="…", href="…", srcset="…"
          .replace(/\b(src|href|srcset)="([^"]+)"/g, (_, attr, value) => {
            const rewritten = attr === 'srcset'
              ? value.split(',').map((part) => part.trim().replace(/^\S+/, (u) => rewriteUrl(u, ctx))).join(', ')
              : rewriteUrl(value, ctx);
            return `${attr}="${rewritten}"`;
          }),
      );
    })
    .join('\n');
}

/** Maps one URL found in `file` (docs/<page>, CHANGELOG.md) to its URL on the site (or on GitHub). */
function rewriteUrl(url, { lang, warnings, file }) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(url) || url === '' || url === '…') return url;
  const [pathPart, hash = ''] = splitHash(url);
  const fromDir = posix.dirname(file);
  const target = posix.normalize(posix.join(fromDir, decodeURI(pathPart)));

  if (target.startsWith('docs/assets/')) return `/docs/assets/${encodeURI(target.slice('docs/assets/'.length))}${hash}`;
  if (target.startsWith('docs/') && target.endsWith('.md')) {
    const rel = target.slice('docs/'.length);
    const targetLang = rel.endsWith('.fr.md') ? 'fr' : 'en';
    const slug = rel.replace(/(\.fr)?\.md$/, '').replace(/(^|\/)index$/, '');
    if (!existsSync(join(source, target))) warnings.push(`${file}: link to missing page ${target}.`);
    if (targetLang !== lang) warnings.push(`${file}: link to ${target} (other language).`);
    return `${DOCS_BASE[targetLang]}${slug ? `${slug}/` : ''}${hash}`;
  }
  if (target.startsWith('../')) {
    warnings.push(`${file}: link outside the repository (${url}), left as is.`);
    return url;
  }
  // A file or folder of the repository outside docs/ (README, CHANGELOG, code…): on GitHub.
  const full = join(source, target);
  if (!existsSync(full)) warnings.push(`${file}: link to missing file ${target}.`);
  const kind = existsSync(full) && statSync(full).isDirectory() ? 'tree' : 'blob';
  return `${GITHUB}/${kind}/${linkRef}/${encodeURI(target)}${hash}`;
}

// ---------- Heading ids ----------
/** Ids of the headings of a Markdown text (outside code blocks), as Astro computes them. */
function headingIds(markdown) {
  const slugger = new GithubSlugger();
  const ids = [];
  let fence = null;
  for (const line of markdown.split('\n')) {
    const wasFence = fence;
    fence = updateFence(fence, line);
    if (wasFence || fence) continue;
    const m = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) ids.push(slugger.slug(stripInline(m[1])));
  }
  return ids;
}

/** Updates the links of a French page to the headings whose id changed (same page or another). */
function updateAnchors(content, target, anchors) {
  if (!anchors.size) return content;
  const self = `${DOCS_BASE.fr}${target.slice(FR_DIR.length + 1).replace(/\.md$/, '').replace(/(^|\/)index$/, '')}`;
  const selfUrl = self.endsWith('/') ? self : `${self}/`;
  const fix = (page, id) => {
    const map = anchors.get(page || selfUrl);
    if (!map) return id;
    const decoded = safe(() => decodeURIComponent(id)) || id;
    return map.has(decoded) ? map.get(decoded) : id;
  };
  return content
    .replace(/(\]\(|\bhref=")(\/fr\/docs\/[^)"#\s]*)?#([^)"\s]+)/g, (_, open, page = '', id) => `${open}${page}#${fix(page, id)}`);
}

// ---------- Helpers ----------
function sidebarOrder(indexMarkdown) {
  const order = new Map([['index', 0]]);
  let n = 1;
  for (const m of indexMarkdown.matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
    const target = posix.normalize(m[1]);
    if (target.startsWith('../')) continue;
    const slug = target.replace(/\.md$/, '');
    if (!order.has(slug)) order.set(slug, n++);
  }
  return order;
}

function firstParagraph(body) {
  const blocks = body.split(/\n\s*\n/);
  for (const block of blocks) {
    const t = block.trim();
    if (!t || /^(#|```|~~~|:::|[-*+] |\d+\. |>|\||<|!\[)/.test(t)) continue;
    let text = stripInline(t.replace(/\s*\n\s*/g, ' '));
    if (text.length > 200) text = `${text.slice(0, 197).replace(/\s+\S*$/, '')}…`;
    return text;
  }
  return '';
}

function stripInline(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

function yamlString(s) {
  return JSON.stringify(s); // a JSON string is a valid double-quoted YAML scalar
}

function splitHash(url) {
  const i = url.indexOf('#');
  return i < 0 ? [url, ''] : [url.slice(0, i), url.slice(i)];
}

function sameContent(path, content) {
  if (!existsSync(path)) return false;
  const current = readFileSync(path);
  return Buffer.isBuffer(content) ? current.equals(content) : current.toString('utf8') === content;
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])));
  return files.flat().sort();
}

async function removeEmptyDirs(dirs) {
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const e of await readdir(dir, { withFileTypes: true })) {
      if (e.isDirectory()) await removeEmptyDirs([join(dir, e.name)]);
    }
    if ((await readdir(dir)).length === 0) await rm(dir, { recursive: true });
  }
}

function safe(fn) {
  try {
    return fn();
  } catch {
    return '';
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
