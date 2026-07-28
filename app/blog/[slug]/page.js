import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import db from '../../../lib/db';

// Agent-authored posts live in the database, so this route must render per
// request — without this, Next would try to prerender it at build time, when
// Render's persistent disk (and therefore the database) isn't mounted.
// The two committed posts under app/blog/<slug>/ are unaffected: Next
// resolves their static segments before falling through to this one.
export const dynamic = 'force-dynamic';

function loadPost(slug) {
  const row = db.getBlogPostBySlug.get(slug);
  if (!row) return null;
  let sections;
  try {
    sections = JSON.parse(row.bodyJson);
  } catch {
    return null;
  }
  if (!Array.isArray(sections) || sections.length === 0) return null;
  return { ...row, sections };
}

// JSON.stringify escapes quotes but not '<', so a title containing the
// literal text "</script>" would close the JSON-LD block early and let the
// rest of it be parsed as markup. Escaping '<' as < is still valid JSON
// (it parses back to '<'), so consumers read the same value. The committed
// post pages inline the same JSON-LD safely because their content is
// hardcoded; this one renders stored text, so it has to escape.
function jsonLdScript(data) {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = loadPost(slug);
  if (!post) return { title: 'Post not found — PreorderCards Blog' };
  return {
    title: `${post.title} — PreorderCards Blog`,
    description: post.description,
  };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = loadPost(slug);
  if (!post) notFound();

  const nonce = (await headers()).get('x-nonce');

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.datePublished,
    dateModified: post.datePublished,
    author: { '@type': 'Organization', name: 'PreorderCards' },
    publisher: { '@type': 'Organization', name: 'PreorderCards' },
  };

  return (
    <>
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: jsonLdScript(articleJsonLd) }} />

      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>{post.title}</h1>
          {post.tagline ? <p className="tagline">{post.tagline}</p> : null}
          <a className="header-nav-link" href="/blog.html">← Back to Blog</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
            Published {formatDate(post.datePublished)} · {post.readMinutes} min read
          </p>

          {/* Rendered as real elements from stored text, never as raw HTML —
              nothing the model writes can inject markup into the page. */}
          {post.sections.map((section, i) => (
            <section key={i}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph, j) => (
                <p key={j}>{paragraph}</p>
              ))}
            </section>
          ))}

          <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Questions or a release we should be tracking? Email{' '}
            <a href="mailto:admin@preordercards.com">admin@preordercards.com</a>.
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
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a>
          </p>
        </div>
      </footer>
    </>
  );
}
