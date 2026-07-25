// Public sitemap: the marketing root plus every PUBLISHED Review Tap page.
// The internal TagBooks app is PIN-gated and deliberately excluded (see robots).
import { SITE_URL, listPublishedReviewPages } from '../lib/reviewPages';

export const revalidate = 3600;

export default async function sitemap() {
  const pages = await listPublishedReviewPages();
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    ...pages.map((p) => ({
      url: `${SITE_URL}/r/${p.slug}`,
      lastModified: p.created_at ? new Date(p.created_at) : new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    })),
  ];
}
