/**
 * Screenshots of the application, taken on the static demo by
 * `scripts/build-demo/browse.py --gallery` (see its README): src/assets/app/<name>-<lang>-<theme>.png
 * is the whole window (16:10), `…-crop.png` its useful part (the home page gallery),
 * `…-mobile.png` the same page on a phone (the hero, the /demo/ page). Each page picks the
 * screenshots of its own language; the light and dark ones are both in the page, only the one
 * of the current theme is loaded (see Screenshot.astro).
 */
import type { ImageMetadata } from 'astro';
import type { Lang } from '../i18n';

const files = import.meta.glob<ImageMetadata>('../assets/app/*.png', { eager: true, import: 'default' });

export type ShotPart = 'full' | 'crop' | 'mobile';
export interface ShotImages {
  light: ImageMetadata;
  dark: ImageMetadata;
}

function file(name: string, lang: Lang, theme: 'light' | 'dark', part: ShotPart): ImageMetadata | undefined {
  const suffix = part === 'full' ? '' : `-${part}`;
  return files[`../assets/app/${name}-${lang}-${theme}${suffix}.png`];
}

/** The light and dark versions of a screenshot in a language (English when it has no French one). */
export function shot(name: string, lang: Lang, part: ShotPart = 'full'): ShotImages {
  for (const l of [lang, 'en'] as const) {
    const light = file(name, l, 'light', part);
    const dark = file(name, l, 'dark', part);
    if (light && dark) return { light, dark };
  }
  throw new Error(`No screenshot "${name}" (${part}) in src/assets/app/: run browse.py --gallery`);
}
