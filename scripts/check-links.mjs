#!/usr/bin/env node
// Checks the internal links of the built site (dist/): every link, image, script, stylesheet
// and hreflang/canonical URL that points to synaptane.com must lead to a built file, and every
// #anchor must exist in the target page. External links are not checked (no network calls).
//
// Usage: npm run build && npm run check-links
//   node scripts/check-links.mjs [--dist dist] [--ignore /demo/app/] [--ignore …]
//
// Rules (trailingSlash: 'always' in astro.config.mjs): a page URL ends with a slash (/about/,
// not /about); a URL that only works through GitHub Pages' redirect is reported.
// No dependency: Node >= 22.

import { existsSync, statSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';

const SITE = 'https://synaptane.com';

const { values: args } = parseArgs({
  options: {
    dist: { type: 'string', default: 'dist' },
    ignore: { type: 'string', multiple: true, default: [] },
  },
});
const DIST = resolve(args.dist);
if (!existsSync(DIST)) {
  console.error(`No ${args.dist}/ folder: run npm run build first.`);
  process.exit(2);
}

const files = (await walk(DIST)).filter((f) => f.endsWith('.html'));
/** @type {Map<string, Set<string>>} file -> ids */
const idCache = new Map();
/** @type {Map<string, string[]>} page -> problems */
const problems = new Map();
let checked = 0;

for (const file of files) {
  const html = await readFile(file, 'utf8');
  const pageUrl = new URL(urlPathOf(file), SITE);
  for (const { attr, value } of extractUrls(html)) {
    const urls = attr === 'srcset' ? value.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean) : [value];
    for (const raw of urls) {
      const problem = await checkUrl(decodeEntities(raw), pageUrl);
      checked++;
      if (problem) {
        const key = urlPathOf(file);
        if (!problems.has(key)) problems.set(key, []);
        problems.get(key).push(`${raw}: ${problem}`);
      }
    }
  }
}

const count = [...problems.values()].reduce((n, p) => n + p.length, 0);
if (count) {
  for (const [page, list] of problems) {
    console.error(`\n${page}`);
    for (const p of [...new Set(list)]) console.error(`  ✗ ${p}`);
  }
  console.error(`\n${count} broken internal link(s) in ${problems.size} page(s) (${checked} checked, ${files.length} pages).`);
  process.exit(1);
}
console.log(`All ${checked} internal links and anchors OK (${files.length} pages).`);

// ---------- Checks ----------
async function checkUrl(raw, pageUrl) {
  if (!raw || /^(mailto|tel|javascript|data):/i.test(raw)) return null;
  let url;
  try {
    url = new URL(raw, pageUrl);
  } catch {
    return 'invalid URL';
  }
  if (url.origin !== SITE) return null; // external: not checked
  const path = safeDecode(url.pathname);
  if (args.ignore.some((prefix) => path.startsWith(prefix))) return null;

  const target = resolveFile(path);
  if (!target) return 'not found';
  if (target.redirect) return `missing trailing slash (use ${path}/)`;
  if (url.hash && url.hash !== '#' && target.file.endsWith('.html')) {
    const id = safeDecode(url.hash.slice(1));
    const ids = await idsOf(target.file);
    if (!ids.has(id)) return `anchor #${id} not found in ${urlPathOf(target.file)}`;
  }
  return null;
}

/** Maps a URL path to a file of dist/ (or reports a directory URL without its slash). */
function resolveFile(path) {
  const local = join(DIST, ...path.split('/').filter(Boolean));
  if (!local.startsWith(DIST)) return null;
  if (path.endsWith('/')) {
    const index = join(local, 'index.html');
    return existsSync(index) ? { file: index } : null;
  }
  if (existsSync(local) && statSync(local).isFile()) return { file: local };
  if (existsSync(join(local, 'index.html'))) return { file: join(local, 'index.html'), redirect: true };
  return null;
}

async function idsOf(file) {
  if (!idCache.has(file)) {
    const html = await readFile(file, 'utf8');
    const ids = new Set();
    for (const m of html.matchAll(/\s(?:id|name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      ids.add(decodeEntities(m[1] ?? m[2] ?? m[3]));
    }
    ids.add('top'); // browsers scroll to the top for #top
    idCache.set(file, ids);
  }
  return idCache.get(file);
}

// ---------- HTML ----------
/** URLs of a page: <a href>, <link href>, <img|script|source|iframe src>, srcset, og:image. */
function* extractUrls(html) {
  // Ignore the content of inline scripts, styles and templates.
  const cleaned = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1>/gi, (m, tag) =>
    tag.toLowerCase() === 'script' ? m.replace(/>[\s\S]*<\/script>$/i, '></script>') : '',
  );
  for (const tag of cleaned.matchAll(/<(a|link|img|script|source|iframe|area|meta)\b([^>]*)>/gi)) {
    const name = tag[1].toLowerCase();
    const attrs = parseAttrs(tag[2]);
    if (name === 'meta') {
      const prop = attrs.property ?? attrs.name;
      if ((prop === 'og:image' || prop === 'twitter:image' || prop === 'og:url') && attrs.content) {
        yield { attr: 'content', value: attrs.content };
      }
      continue;
    }
    if (name === 'link' && /\b(preconnect|dns-prefetch)\b/.test(attrs.rel ?? '')) continue;
    for (const attr of ['href', 'src', 'srcset']) {
      if (attrs[attr] !== undefined) yield { attr, value: attrs[attr] };
    }
  }
}

function parseAttrs(source) {
  const attrs = {};
  for (const m of source.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// ---------- Files ----------
function urlPathOf(file) {
  const rel = relative(DIST, file).split(sep).join('/');
  return `/${rel.replace(/(^|\/)index\.html$/, '$1')}`;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = await Promise.all(entries.map((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])));
  return out.flat();
}
