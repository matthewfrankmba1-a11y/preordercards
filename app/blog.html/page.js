import { BLOG_POSTS } from '../../lib/blogPosts';
import db from '../../lib/db';

export const metadata = {
  title: 'Blog — PreorderCards',
  description: 'Weekly release roundups and hobby notes from PreorderCards: what\'s dropping, what\'s EQL, and what to watch in sports card collecting.',
};

// Half the index now comes from the database (posts written by the blog
// agent), so this page renders per request rather than at build time.
export const dynamic = 'force-dynamic';

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

// The committed posts and the agent-written ones share one chronological
// list — readers shouldn't be able to tell which is which.
function allPosts() {
  const stored = db.listBlogPosts.all().map((p) => ({
    slug: p.slug,
    title: p.title,
    description: p.description,
    datePublished: p.datePublished,
  }));
  return [...BLOG_POSTS, ...stored].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
}

export default function BlogIndexPage() {
  const posts = allPosts();

  return (
    <>
      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>PreorderCards Blog</h1>
          <p className="tagline">Weekly release roundups and hobby notes — what's dropping, what's EQL, and what to watch.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
          {' · '}
          <a className="header-nav-link" href="/newsletter.html">Get it by email →</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {posts.map((post) => (
              <li key={post.slug} style={{ padding: '1.25rem 0', borderBottom: '1px solid var(--border)' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 0.25rem' }}>{formatDate(post.datePublished)}</p>
                <h2 style={{ margin: '0 0 0.5rem' }}>
                  <a href={`/blog/${post.slug}`}>{post.title}</a>
                </h2>
                <p style={{ margin: '0 0 0.5rem' }}>{post.description}</p>
                <a href={`/blog/${post.slug}`}>Read more →</a>
              </li>
            ))}
          </ul>

          <p style={{ marginTop: '2rem' }}>
            New roundup every week. <a href="/newsletter.html">Get it in your inbox</a> the morning of the drops.
          </p>

          <p style={{ marginTop: '2rem' }}>
            <a href="/">← Back to the PreorderCards homepage</a>
          </p>
        </article>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <p className="disclaimer">
            This site is an independent release-tracking and interest-registration service.
            It is not affiliated with, endorsed by, or sponsored by Topps, MLB, the NBA, the NFL,
            the UFC, Disney, Marvel, or any other brand or league referenced here. All product
            names and trademarks belong to their respective owners.
          </p>
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a> · <a href="/newsletter.html">Newsletter</a>
          </p>
        </div>
      </footer>
    </>
  );
}
