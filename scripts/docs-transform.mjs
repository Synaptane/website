// Markdown transformations applied by scripts/sync-docs.mjs to the copied docs, kept apart so
// that scripts/docs-transform.test.mjs can test them (`npm run test-sync-docs`).
//
// - convertCallouts: GitHub alerts (`> [!NOTE]`…) -> Starlight asides (`:::note`…);
// - frenchTypography: French typography outside code (apostrophes, non-breaking spaces);
// - isFence, updateFence, mapOutsideInlineCode: helpers shared with sync-docs.mjs.
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
