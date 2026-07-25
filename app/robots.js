// Only the customer-facing Review Tap pages (/r/) should be indexed. Everything
// else is the internal, PIN-gated staff app — keep it out of search. Most-
// specific match wins, so allow /r/ while disallowing the root catch-all.
import { SITE_URL } from '../lib/reviewPages';

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/r/',
        disallow: '/',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
