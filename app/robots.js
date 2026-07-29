import { SITE_URL } from '../lib/seo';

// Served at /robots.txt via Next's file convention. Note that the private
// pages (seller.html, reset-password.html, marketplace-admin.html) are
// deliberately NOT disallowed here — they carry `robots: { index: false }`
// in their own metadata instead. Disallowing a URL in robots.txt stops
// crawling, which means Google never reads the noindex tag and the URL can
// still surface as a bare link; letting it crawl and find the noindex is
// what actually keeps it out of the index.
export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
