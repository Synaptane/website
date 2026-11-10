// Markdown transformations applied by scripts/sync-docs.mjs to the copied docs, kept apart so
// that scripts/docs-transform.test.mjs can test them (`npm run test-sync-docs`).
//
// - convertCallouts: GitHub alerts (`> [!NOTE]`…) -> Starlight asides (`:::note`…);
// - frenchTypography: French typography outside code (apostrophes, non-breaking spaces);
// - pageDescription: the description of a page (its first real paragraph, at most 155 characters);
// - translatedAnchor: the id, in a translation, of a heading of the original page;
// - isFence, updateFence, mapOutsideInlineCode, stripInline: helpers shared with sync-docs.mjs.
//
// No dependency: Node >= 22.

/** Non-breaking space (before `:` and inside « »). */
export const NBSP = '\u00A0';
/** Narrow non-breaking space (before `;`, `?` and `!`). */
export const NNBSP = '\u202F';

// ---------- Fenced code blocks and inline code ----------
export function isFence(line) {
  return /^\s{0,3}(`{3,}|~{3,})/.test(line);
}

/** Tracks fenced code blocks: returns the open fence after `line`, or null. */
export function updateFence(open, line) {
  const m = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return open;
  if (!open) return m[1];
  if (m[1][0] === open[0] && m[1].length >= open.length && m[2].trim() === '') return null;
  return open;
}

/** Like updateFence, but also accepts fences indented by more than 3 spaces (in lists). */
function updateFenceLenient(open, line) {
  const m = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m) return open;
  if (!open) return m[1];
  if (m[1][0] === open[0] && m[1].length >= open.length && m[2].trim() === '') return null;
  return open;
}

/** Applies `fn` to the parts of `line` that are not inline code spans. */
export function mapOutsideInlineCode(line, fn) {
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

// ---------- GitHub alerts -> Starlight asides ----------
const CALLOUTS = {
  NOTE: ':::note',
  TIP: ':::tip',
  IMPORTANT: ':::note[Important]',
  WARNING: ':::caution',
  CAUTION: ':::danger',
};

/**
 * Converts the GitHub alerts outside code blocks:
 *
 *   > [!WARNING]            :::caution
 *   > First line,      ->   First line,
 *   > second line.          second line.
 *                           :::
 *
 * The indentation of the alert is kept (an alert inside a list item stays in it).
 */
export function convertCallouts(markdown) {
  const lines = markdown.split('\n');
  const out = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const wasFence = fence;
    fence = updateFenceLenient(fence, line);
    // An alert is the first line of a blockquote.
    const first = !wasFence && !fence && !/^\s*>/.test(lines[i - 1] ?? '');
    const m = first ? /^(\s*)>\s?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i.exec(line) : null;
    if (!m) {
      out.push(line);
      continue;
    }
    const indent = m[1];
    const quoted = new RegExp(`^${indent}>( ?)(.*)$`);
    const body = [];
    while (i + 1 < lines.length) {
      const q = quoted.exec(lines[i + 1]);
      if (!q) break;
      body.push(q[2] === '' ? '' : indent + q[2]);
      i++;
    }
    while (body.length && body[0].trim() === '') body.shift();
    while (body.length && body.at(-1).trim() === '') body.pop();
    out.push(indent + CALLOUTS[m[2].toUpperCase()], ...body, `${indent}:::`);
  }
  return out.join('\n');
}

// ---------- French typography ----------
// Private-use characters around the index of a protected part (code, URL, HTML tag…).
const MASK_OPEN = '\uE000';
const MASK_CLOSE = '\uE001';

/**
 * French typography of a Markdown text, outside code and markup: straight apostrophes after a
 * letter become ’; the regular space before `:` becomes a non-breaking space, before `;`, `?`
 * and `!` a narrow non-breaking space; « and » get a non-breaking space inside.
 *
 * Left untouched: fenced code blocks, inline code, URLs (link and image targets, autolinks,
 * bare URLs, link reference definitions), HTML tags and comments, table delimiter rows and
 * aside markers (`:::note`). Only existing spaces are replaced (`http:`, `12:30`, `key:value`
 * are not changed), and only before a punctuation mark followed by a space or the end of the
 * text (`:::`, `:---` and `![image]` are not changed).
 */
export function frenchTypography(markdown) {
  const lines = markdown.split('\n');
  let fence = null;
  let comment = false;
  return lines
    .map((line) => {
      const wasFence = fence;
      fence = updateFenceLenient(fence, line);
      if (wasFence || fence) return line; // inside a block, or its opening line
      // A multi-line HTML comment: left as is.
      if (comment) {
        if (line.includes('-->')) comment = false;
        return line;
      }
      if (/<!--(?![\s\S]*-->)/.test(line)) {
        comment = true;
        return line;
      }
      if (/^\s*:::/.test(line)) return line; // aside marker
      if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) return line; // table delimiter row
      return typographyOfLine(line);
    })
    .join('\n');
}

function typographyOfLine(line) {
  const kept = [];
  const mask = (s) => `${MASK_OPEN}${kept.push(s) - 1}${MASK_CLOSE}`;
  // Inline code spans first: they may contain anything (URLs, `<tags>`, quotes…).
  let text = maskInlineCode(line, mask);
  text = text
    // Link reference definition: `[label]: url "title"` (the label stays prose).
    .replace(/^(\s*\[[^\]]+\]:)(\s*\S.*)$/, (_, label, rest) => label + mask(rest))
    // HTML comments and tags (attributes included).
    .replace(/<!--[\s\S]*?-->/g, mask)
    .replace(/<\/?[A-Za-z][^<>]*>/g, mask)
    // Autolinks: <https://…>, <a@b.c>.
    .replace(/<[^<>\s]+[:@][^<>\s]*>/g, mask)
    // Link and image targets: ](url "title").
    .replace(/\]\((?:<[^>]*>|[^()\s]*(?:\([^()\s]*\)[^()\s]*)*)(?:\s+"[^"]*")?\)/g, mask)
    // Bare URLs.
    .replace(/\b(?:https?|ftp|mailto):[^\s<>`\uE000]*[^\s<>`\uE000.,;:!?)\]»]/g, mask);

  text = text
    // Apostrophe after a letter (l'API, aujourd'hui, d'`index`).
    .replace(/(?<=\p{L})'/gu, '’')
    // Space before : ; ? ! followed by a space, a closing mark or the end.
    .replace(/[ \u00A0\u202F]+(:|[;?!]+)(?=$|[\s)\]»*_"’'.,]|\uE000)/g, (_, marks) =>
      `${marks[0] === ':' ? NBSP : NNBSP}${marks}`)
    // « and »: a non-breaking space inside.
    .replace(/«[ \u00A0\u202F]*(?=\S)/g, `«${NBSP}`)
    .replace(/(?<=\S)[ \u00A0\u202F]*»/g, `${NBSP}»`);

  // Unmask (a masked part may contain another one: `[x](<a b.md>)`).
  const placeholder = new RegExp(`${MASK_OPEN}(\\d+)${MASK_CLOSE}`, 'g');
  while (text.includes(MASK_OPEN)) text = text.replace(placeholder, (_, n) => kept[Number(n)]);
  return text;
}

/** Replaces the inline code spans of `line` with `mask(span)`. */
function maskInlineCode(line, mask) {
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
    if (end < 0) return result + line.slice(i, start) + mask(line.slice(start));
    result += line.slice(i, start) + mask(line.slice(start, end + run));
    i = end + run;
  }
  return result + line.slice(i);
}

// ---------- Page description ----------
/** Text of a Markdown inline fragment without its markup (links, images, emphasis, code). */
export function stripInline(s) {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_](.+?)[*_](?=\W|$)/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    .trim();
}

// A line that starts a block other than a paragraph: heading, code, aside, list item, quote,
// table, HTML, image, thematic break, link reference definition.
const NOT_PROSE = /^(#|```|~~~|:::|[-*+]\s|\d+[.)]\s|>|\||<|!\[|(?:-{3,}|\*{3,}|_{3,})$|\[[^\]]+\]:\s)/;

/**
 * Description of a page (`<meta name="description">`, shown in search results): its first real
 * paragraph of prose, without markup. Skipped: code blocks, asides, lists, tables, quotes, HTML,
 * indented lines (the rest of a list item), paragraphs shorter than `min` characters and those
 * that end with `:`, which only introduce what follows ("With Docker:"). A paragraph stops at the
 * first line that starts another block ("Each space is a wiki.\n- The tree…": the first line).
 * Longer than `max` characters, the text is cut after its last sentence that fits (if that keeps
 * at least half of `max`), otherwise after its last whole word, followed by "…".
 * No paragraph long enough: the first short one that does not end with `:`, otherwise ''.
 */
export function pageDescription(markdown, { min = 50, max = 155 } = {}) {
  let fence = null;
  let asides = 0;
  let paragraph = null; // lines of the paragraph being read
  let other = false; // inside another block, until the next blank line
  let fallback = '';
  for (const line of [...markdown.split('\n'), '']) {
    const wasFence = fence;
    fence = updateFenceLenient(fence, line);
    const trimmed = line.trim();
    let ends = trimmed === '' || Boolean(wasFence || fence);
    if (!ends && trimmed.startsWith(':::')) {
      asides = trimmed === ':::' ? Math.max(0, asides - 1) : asides + 1;
      ends = true;
    }
    if (!ends && paragraph && NOT_PROSE.test(trimmed)) ends = true;
    if (ends) {
      if (paragraph) {
        const text = stripInline(paragraph.join(' '));
        paragraph = null;
        if (!text.endsWith(':')) {
          if (text.length >= min) return shorten(text, { max });
          fallback ||= text;
        }
      }
      other = trimmed !== '';
      continue;
    }
    if (asides) continue;
    if (paragraph) paragraph.push(trimmed);
    else if (!other && !/^\s/.test(line) && !NOT_PROSE.test(trimmed)) paragraph = [trimmed];
    else other = true;
  }
  return shorten(fallback, { max });
}

function shorten(text, { max }) {
  if (text.length <= max) return text;
  // After the last sentence (. ! ? or … followed by a space) that fits.
  let cut = -1;
  for (const m of text.slice(0, max + 1).matchAll(/[.!?…](?=\s)/g)) cut = m.index + 1;
  if (cut >= max / 2) return text.slice(0, cut);
  // Otherwise after the last whole word, without a trailing punctuation mark or space.
  return `${text.slice(0, max).replace(/\s+\S*$/, '').replace(/[\s,;:(\-–—]+$/u, '')}…`;
}

// ---------- Anchors of a translation ----------
/**
 * The id, in a translated page, of the heading `id` of the original page: the heading at the
 * same position. The translations of the repository keep the outline of the original (same
 * headings, same levels, same order) while their ids differ (#known-limitations ->
 * #limites-connues). `original` and `translation` are the headings of each page in order, as
 * { depth, id }. Null when the outlines differ (the position would not be reliable) or when the
 * original has no heading `id`.
 */
export function translatedAnchor(original, translation, id) {
  if (original.length !== translation.length) return null;
  if (original.some((h, i) => h.depth !== translation[i].depth)) return null;
  const i = original.findIndex((h) => h.id === id);
  return i < 0 ? null : translation[i].id;
}
