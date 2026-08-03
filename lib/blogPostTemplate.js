// Turns a structured draft (see lib/blogDraft.js) into the exact page.js
// source text used by every post under app/blog/<slug>/. Templating with
// JSON.stringify for each text value — rather than asking the model to
// emit JSX directly — means arbitrary draft text (quotes, backticks, etc.)
// can never break the generated module's syntax.

function toFnName(slug) {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
    .replace(/[^a-zA-Z0-9]/g, '') + 'Post';
}

function estimateReadMinutes(draft) {
  const words = [draft.intro, ...draft.sections.map((s) => s.body), draft.closing]
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function renderBlogPostModule(draft, datePublished) {
  const fnName = toFnName(draft.slug);
  const readMinutes = estimateReadMinutes(draft);
  const publishedLabel = new Date(datePublished + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Headings/bodies go inside JSX expression containers ({...}) rather than
  // as raw JSX text, so JSON.stringify's escaping is preserved exactly —
  // slicing quotes off a stringified value to inline it as bare text would
  // leave literal backslash-escapes in the output for any heading containing
  // a quote, and a stray "<" or ">" in draft text would break JSX parsing.
  const sectionsJsx = draft.sections
    .map((s) => `          <h2>{${JSON.stringify(s.heading)}}</h2>\n          <p>{${JSON.stringify(s.body)}}</p>`)
    .join('\n\n');

  return `import { headers } from 'next/headers';
import { BLOG_POSTS } from '../../../lib/blogPosts';

const POST = BLOG_POSTS.find((p) => p.slug === ${JSON.stringify(draft.slug)});

export const metadata = {
  title: \`\${POST.title} — PreorderCards Blog\`,
  description: POST.description,
};

const ARTICLE_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: POST.title,
  description: POST.description,
  datePublished: POST.datePublished,
  dateModified: POST.datePublished,
  author: { '@type': 'Organization', name: 'PreorderCards' },
  publisher: { '@type': 'Organization', name: 'PreorderCards' },
};

export default async function ${fnName}() {
  const nonce = (await headers()).get('x-nonce');

  return (
    <>
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_JSONLD) }} />

      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>{POST.title}</h1>
          <p className="tagline">{${JSON.stringify(draft.tagline)}}</p>
          <a className="header-nav-link" href="/blog.html">← Back to Blog</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Published ${publishedLabel} · ${readMinutes} min read</p>

          <p>{${JSON.stringify(draft.intro)}}</p>

${sectionsJsx}

          <p>{${JSON.stringify(draft.closing)}}</p>

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
`;
}

function renderBlogPostsEntry(draft, datePublished) {
  return `  {\n    slug: ${JSON.stringify(draft.slug)},\n    title: ${JSON.stringify(draft.title)},\n    description: ${JSON.stringify(draft.description)},\n    datePublished: ${JSON.stringify(datePublished)},\n  },`;
}

module.exports = { renderBlogPostModule, renderBlogPostsEntry, toFnName };
