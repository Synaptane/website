// RSS feed of the English blog: /blog/rss.xml. French twin: src/pages/fr/blog/rss.xml.ts.
import type { APIRoute } from 'astro';
import { blogFeed } from '../../lib/feed';

export const GET: APIRoute = ({ site }) => blogFeed('en', site);
