import { SITE_URL } from '../lib/seo';
import { BLOG_POSTS } from '../lib/blogPosts';
import { loadReleases, todayISO } from '../lib/releases';

// Served at /sitemap.xml via Next's file convention.
//
// Only publicly useful pages belong here. The seller dashboard, password
// reset, and marketplace admin routes are omitted on purpose: they are
// noindex'd, and listing a noindex URL in a sitemap is a contradictory
// signal that Search Console reports as an error.
export default function sitemap() {
  // The release calendar's freshness is the whole value of the homepage, so
  // its lastModified tracks the release data rather than the deploy date.
  let releasesLastUpdated = new Date();
  let releases = [];
  try {
    const data = loadReleases();
    const parsed = new Date(`${data.lastUpdated}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) releasesLastUpdated = parsed;
    releases = data.releases || [];
  } catch {
    // Fall back to "now" with no release URLs — a sitemap missing the release
    // pages is far better than a build that fails on unreadable release data.
  }

  const staticPages = [
    { path: '/', changeFrequency: 'daily', priority: 1.0, lastModified: releasesLastUpdated },
    { path: '/marketplace.html', changeFrequency: 'daily', priority: 0.9 },
    { path: '/releases', changeFrequency: 'daily', priority: 0.8, lastModified: releasesLastUpdated },
    { path: '/blog.html', changeFrequency: 'weekly', priority: 0.7 },
    { path: '/success.html', changeFrequency: 'weekly', priority: 0.6 },
    { path: '/verified-seller.html', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/pokemon-autocheckout.html', changeFrequency: 'monthly', priority: 0.5 },
    { path: '/trust.html', changeFrequency: 'monthly', priority: 0.4 },
    { path: '/terms.html', changeFrequency: 'yearly', priority: 0.3 },
  ];

  return [
    ...staticPages.map(({ path, changeFrequency, priority, lastModified }) => ({
      url: `${SITE_URL}${path}`,
      lastModified: lastModified || new Date(),
      changeFrequency,
      priority,
    })),
    ...BLOG_POSTS.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: new Date(`${post.datePublished}T00:00:00Z`),
      changeFrequency: 'monthly',
      priority: 0.6,
    })),
    // Upcoming releases are the pages worth crawling often — a release that
    // has already shipped still gets listed (the URL stays valid and can hold
    // its rankings) but at a lower priority and a much slower change rate.
    ...releases.map((release) => {
      const upcoming = release.releaseDate >= todayISO();
      return {
        url: `${SITE_URL}/releases/${release.id}`,
        lastModified: releasesLastUpdated,
        changeFrequency: upcoming ? 'daily' : 'yearly',
        priority: upcoming ? 0.8 : 0.3,
      };
    }),
  ];
}
