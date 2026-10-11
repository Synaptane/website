/**
 * Status of the latest version (SITE.version), from the release notes (the `releases`
 * collection, i.e. the main repository's CHANGELOG.md): released on a date, or still to come.
 * The hero, the footer and the releases page use it, so they always say the same thing.
 */
import { getCollection } from 'astro:content';
import { formatDate, useTranslations, type Lang } from '../i18n';
import { SITE } from '../site';

export interface ReleaseStatus {
  /** 'v1.0.0-rc.1' */
  version: string;
  /** Release date (YYYY-MM-DD) from the changelog, or null while it is not released. */
  date: string | null;
}

export async function releaseStatus(): Promise<ReleaseStatus> {
  const entries = await getCollection('releases');
  const entry = entries.find((e) => `v${e.data.version}` === SITE.version);
  return { version: SITE.version, date: entry?.data.date ?? null };
}

/** Short label: "Preview" once released, "Preview coming soon" before. */
export function releaseLabel(status: ReleaseStatus, lang: Lang): string {
  const t = useTranslations(lang).release;
  return status.date ? t.preview : t.upcoming;
}

/** Sentence for the footer: "Preview: v1.0.0-rc.1, released on October 20, 2026." */
export function releaseSentence(status: ReleaseStatus, lang: Lang): string {
  const t = useTranslations(lang).release;
  return status.date
    ? t.released.replace('{version}', status.version).replace('{date}', formatDate(new Date(`${status.date}T00:00:00Z`), lang))
    : t.coming.replace('{version}', status.version);
}
