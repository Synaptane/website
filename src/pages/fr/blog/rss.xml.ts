// Flux RSS du blog en français : /fr/blog/rss.xml. Jumeau anglais : src/pages/blog/rss.xml.ts.
import type { APIRoute } from 'astro';
import { blogFeed } from '../../../lib/feed';

export const GET: APIRoute = ({ site }) => blogFeed('fr', site);
