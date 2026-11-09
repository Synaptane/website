/**
 * Status of the latest version (SITE.version), from the release notes (the `releases`
 * collection, i.e. the main repository's CHANGELOG.md): released on a date, or still to come.
 * The hero, the footer and the releases page use it, so they always say the same thing.
 *
 * A stable version (v1.15.0) is the "Latest release"; only a pre-release (a version with a
 * suffix, v1.0.0-rc.1) is a "Preview", like the badge of the releases page.
 */
import { getCollection } from 'astro:content';
import { formatDate, useTranslations, type Lang } from '../i18n';
import { SITE } from '../site';

export interface ReleaseStatus {
  /** 'v1.15.0', or 'v1.0.0-rc.1' for a pre-release */
  version: string;
  /** Release date (YYYY-MM-DD) from the changelog, or null while it is not released. */
  date: string | null;
}

export async function releaseStatus(): Promise<ReleaseStatus> {
  const entries = await getCollection('releases');
  const entry = entries.find((e) => `v${e.data.version}` === SITE.version);
  return { version: SITE.version, date: entry?.data.date ?? null };
}

/** A pre-release has a suffix after the version number (v1.0.0-rc.1, v2.0.0-beta.2). */
export function isPrerelease(status: ReleaseStatus): boolean {
  return /-/.test(status.version);
}

/**
 * Short label for the hero (the version is shown next to it): "Latest release" once released,
 * "Coming soon" before; "Preview" and "Preview coming soon" for a pre-release.
 */
export function releaseLabel(status: ReleaseStatus, lang: Lang): string {
  const t = useTranslations(lang).release;
  if (isPrerelease(status)) return status.date ? t.preview : t.previewUpcoming;
  return status.date ? t.latest : t.upcoming;
}

/**
 * Sentence for the footer: "Latest release: v1.15.0, released on November 9, 2026.", or
 * "Next release: v1.16.0, coming soon." before the release ("Preview: …" for a pre-release).
 */
export function releaseSentence(status: ReleaseStatus, lang: Lang): string {
  const t = useTranslations(lang).release;
  const label = isPrerelease(status) ? t.preview : status.date ? t.latest : t.next;
  const template = status.date ? t.released : t.coming;
  return template
    .replace('{label}', label)
    .replace('{version}', status.version)
    .replace('{date}', status.date ? formatDate(new Date(`${status.date}T00:00:00Z`), lang) : '');
}
