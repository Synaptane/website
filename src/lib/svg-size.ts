/**
 * Size of an SVG of public/, read from its viewBox at build time. The architecture diagram comes
 * from the product repository (npm run sync-docs): its height changes with it, and the page must
 * reserve the right space for it (no layout shift, no distortion).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function svgSize(publicPath: string): { width: number; height: number } {
  const svg = readFileSync(join(process.cwd(), 'public', publicPath), 'utf8');
  const box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  if (!box) throw new Error(`${publicPath}: no viewBox`);
  return { width: Number(box[1]), height: Number(box[2]) };
}
