/**
 * Parser of the changelog of the main repository (Keep a Changelog 1.1), copied by
 * `npm run sync-docs` to src/content/releases/CHANGELOG.md and loaded by the `releases`
 * collection (src/content.config.ts). No dependency: the version bodies stay Markdown and are
 * rendered by Astro.
 *
 *   ## [1.1.0] - 2026-11-02        -> version 1.1.0, released on that date
 *   ## [1.0.0-rc.1] - Unreleased   -> version 1.0.0-rc.1, not released yet
 *   ## [Unreleased]                -> the changes waiting for the next version
 *   [1.1.0]: https://github.com/…  -> link of the version (reference definitions at the end)
 *
 * A version not released yet that has no note (Keep a Changelog keeps an empty `## [Unreleased]`
 * between two versions, sometimes with empty `### Added`… headings) is left out: the releases
 * page shows neither its section nor its link in the list of versions. Once it has notes, it is
 * shown like the other versions.
 */

export interface ChangelogVersion {
  /** '1.0.0-rc.1', or 'Unreleased' for the section of the coming changes. */
  version: string;
  /** Release date (YYYY-MM-DD), or null when the version is not released yet. */
  date: string | null;
  /** True without a release date ("Unreleased" in the heading, or the [Unreleased] section). */
  unreleased: boolean;
  /** True for a version marked [YANKED]. */
  yanked: boolean;
  /** URL of the reference definition `[version]: url`, if any. */
  url: string | null;
  /** Markdown of the version, without its heading and the reference definitions. */
  body: string;
}

const HEADING = /^##\s+\[?([^\]\s]+)\]?(?:\s+-\s+(.*?))?\s*$/;
const DEFINITION = /^\[([^\]]+)\]:\s*(\S+)\s*$/;

/** True when a version body holds at least one note: something else than headings and comments. */
export function hasNotes(body: string): boolean {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .some((line) => line.trim() !== '' && !/^\s{0,3}#{1,6}(\s|$)/.test(line));
}

/**
 * The versions of a changelog, in file order (newest first by convention), without the versions
 * not released yet that have no note (see above).
 */
export function parseChangelog(markdown: string): ChangelogVersion[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const links = new Map<string, string>();
  for (const line of lines) {
    const m = DEFINITION.exec(line);
    if (m?.[1] && m[2]) links.set(m[1].toLowerCase(), m[2]);
  }

  const versions: ChangelogVersion[] = [];
  let current: { heading: RegExpExecArray; body: string[] } | null = null;
  let fence = false;
  const flush = () => {
    if (!current) return;
    const version = current.heading[1] ?? '';
    const rest = current.heading[2] ?? '';
    const date = /\b(\d{4}-\d{2}-\d{2})\b/.exec(rest)?.[1] ?? null;
    const isUnreleasedSection = version.toLowerCase() === 'unreleased';
    const body = current.body.join('\n').trim();
    // Nothing to announce yet: no section, no link in the list of versions.
    if ((isUnreleasedSection || !date) && !hasNotes(body)) return;
    versions.push({
      version: isUnreleasedSection ? 'Unreleased' : version,
      date,
      unreleased: isUnreleasedSection || !date,
      yanked: /\[?yanked\]?/i.test(rest),
      url: links.get(version.toLowerCase()) ?? null,
      body,
    });
  };

  for (const line of lines) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    const heading = fence ? null : HEADING.exec(line);
    if (heading) {
      flush();
      current = { heading, body: [] };
      continue;
    }
    if (!current) continue; // title and introduction of the file
    if (!fence && DEFINITION.test(line)) continue;
    current.body.push(line);
  }
  flush();
  return versions;
}

/** The anchor of a version on the releases page: '1.0.0-rc.1' -> 'v1.0.0-rc.1'. */
export function versionAnchor(version: string): string {
  return version === 'Unreleased' ? 'unreleased' : `v${version}`;
}

/**
 * The sections of a version body (### Added, ### Changed…) with the number of their entries
 * (top-level list items, the nested ones and the #### subheadings being part of them), in body
 * order. Shown as the summary of the full notes on the releases page.
 */
export function sectionCounts(body: string): { heading: string; count: number }[] {
  const counts: { heading: string; count: number }[] = [];
  let fence = false;
  for (const line of body.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const heading = /^###\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading?.[1]) counts.push({ heading: heading[1], count: 0 });
    else if (/^[-*+]\s/.test(line) && counts.length) counts[counts.length - 1]!.count++;
  }
  return counts.filter((s) => s.count > 0);
}
