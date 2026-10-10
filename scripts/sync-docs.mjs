#!/usr/bin/env node
// Copies the documentation of the main repository (synaptane/synaptane, folder `docs/`) into
// the Starlight content collection of this site.
//
//   docs/X.md     -> src/content/docs/docs/X.md       (English, served at /docs/X/)
//   docs/X.fr.md  -> src/content/docs/fr/docs/X.md    (French,  served at /fr/docs/X/)
//   docs/assets/* -> public/docs/assets/*             (served at /docs/assets/*)
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
// No dependency: Node >= 22 and git.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MANIFEST = join(ROOT, 'docs-sync.json');
const EN_DIR = 'src/content/docs/docs';
const FR_DIR = 'src/content/docs/fr/docs';
const ASSETS_DIR = 'public/docs/assets';
const DOCS_BASE = { en: '/docs/', fr: '/fr/docs/' };

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
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 24).join('\n').replace(/^\/\/ ?/gm, ''));
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

  for (const page of pages) {
    const lang = page.endsWith('.fr.md') ? 'fr' : 'en';
    const slug = page.replace(/(\.fr)?\.md$/, '');
    const target = posix.join(lang === 'fr' ? FR_DIR : EN_DIR, `${slug}.md`);
    const text = await readFile(join(docsRoot, page), 'utf8');
    out.set(target, convert(text, { page, lang, slug, order, warnings }));
  }
  for (const asset of assets) {
    out.set(posix.join(ASSETS_DIR, asset.slice('assets/'.length)), await readFile(join(docsRoot, asset)));
  }

  // Every English page should have its French counterpart (and the reverse).
  const slugs = (lang) => new Set(pages.filter((p) => p.endsWith('.fr.md') === (lang === 'fr')).map((p) => p.replace(/(\.fr)?\.md$/, '')));
  const en = slugs('en');
  const fr = slugs('fr');
  for (const s of en) if (!fr.has(s)) warnings.push(`docs/${s}.md has no French translation (Starlight shows the English page under /fr/).`);
  for (const s of fr) if (!en.has(s)) warnings.push(`docs/${s}.fr.md has no English original.`);

  const manifest = {
    comment: 'Generated by scripts/sync-docs.mjs: the files below are copies of the main repository docs. Do not edit them; run `npm run sync-docs`.',
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
  console.log(`Synced ${pages.length} pages and ${assets.length} assets from ${args.repo}@${ref} (${commit.slice(0, 12)}); ${stale.length} stale file(s) removed.`);
}

// ---------- Conversion of one page ----------
function convert(text, { page, lang, slug, order, warnings }) {
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

  const body = rewriteLinks(lines.join('\n'), { page, lang, warnings });
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

/** Maps one URL found in docs/<page> to its URL on the site (or on GitHub). */
function rewriteUrl(url, { page, lang, warnings }) {
  if (/^([a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(url) || url === '' || url === '…') return url;
  const [pathPart, hash = ''] = splitHash(url);
  const fromDir = posix.dirname(`docs/${page}`);
  const target = posix.normalize(posix.join(fromDir, decodeURI(pathPart)));

  if (target.startsWith('docs/assets/')) return `/docs/assets/${encodeURI(target.slice('docs/assets/'.length))}${hash}`;
  if (target.startsWith('docs/') && target.endsWith('.md')) {
    const rel = target.slice('docs/'.length);
    const targetLang = rel.endsWith('.fr.md') ? 'fr' : 'en';
    const slug = rel.replace(/(\.fr)?\.md$/, '').replace(/(^|\/)index$/, '');
    if (!existsSync(join(source, target))) warnings.push(`docs/${page}: link to missing page ${target}.`);
    if (targetLang !== lang) warnings.push(`docs/${page}: link to ${target} (other language).`);
    return `${DOCS_BASE[targetLang]}${slug ? `${slug}/` : ''}${hash}`;
  }
  if (target.startsWith('../')) {
    warnings.push(`docs/${page}: link outside the repository (${url}), left as is.`);
    return url;
  }
  // A file or folder of the repository outside docs/ (README, CHANGELOG, code…): on GitHub.
  const full = join(source, target);
  if (!existsSync(full)) warnings.push(`docs/${page}: link to missing file ${target}.`);
  const kind = existsSync(full) && statSync(full).isDirectory() ? 'tree' : 'blob';
  return `${GITHUB}/${kind}/${linkRef}/${encodeURI(target)}${hash}`;
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

function isFence(line) {
  return /^\s{0,3}(`{3,}|~{3,})/.test(line);
}

/** Tracks fenced code blocks: returns the open fence after `line`, or null. */
function updateFence(open, line) {
  const m = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return open;
  if (!open) return m[1];
  if (m[1][0] === open[0] && m[1].length >= open.length && m[2].trim() === '') return null;
  return open;
}

/** Applies `fn` to the parts of `line` that are not inline code spans. */
function mapOutsideInlineCode(line, fn) {
  let result = '';
  let i = 0;
  while (i < line.length) {
    const start = line.indexOf('`', i);
    if (start < 0) break;
    let run = 1;
    while (line[start + run] === '`') run++;
    const ticks = '`'.repeat(run);
    let end = line.indexOf(ticks, start + run);
    while (end >= 0 && line[end + run] === '`') end = line.indexOf(ticks, end + run + 1);
    if (end < 0) {
      // Unclosed span on this line (it may continue on the next one): leave the rest as is.
      result += fn(line.slice(i, start)) + line.slice(start);
      return result;
    }
    result += fn(line.slice(i, start)) + line.slice(start, end + run);
    i = end + run;
  }
  return result + fn(line.slice(i));
}

function firstParagraph(body) {
  const blocks = body.split(/\n\s*\n/);
  for (const block of blocks) {
    const t = block.trim();
    if (!t || /^(#|```|~~~|[-*+] |\d+\. |>|\||<|!\[)/.test(t)) continue;
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
