import { headers } from 'next/headers';
import { BLOG_POSTS } from '../../../lib/blogPosts';

const POST = BLOG_POSTS.find((p) => p.slug === 'whats-coming-out-august-5-14-2026');

export const metadata = {
  title: `${POST.title} — PreorderCards Blog`,
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

export default async function WhatsComingOutAugustPost() {
  const nonce = (await headers()).get('x-nonce');

  return (
    <>
      <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: JSON.stringify(ARTICLE_JSONLD) }} />

      <header className="site-header compact">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>{POST.title}</h1>
          <p className="tagline">A quiet week, then a busy one — and not a raffle in sight.</p>
          <a className="header-nav-link" href="/blog.html">← Back to Blog</a>
        </div>
      </header>

      <main className="wrap">
        <article className="legal">
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>Published August 3, 2026 · 3 min read</p>

          <p>
            After last week's five-release stretch — including two same-day EQL raffle drops — the
            calendar takes a breath. There's exactly one release day this week, then things pick back
            up across the following week. Here's everything landing between August 5 and August 14,
            straight from our <a href="/">release calendar</a>.
          </p>

          <p>
            One thing worth flagging up front: <strong>every release in this stretch is standard
            checkout</strong>. No EQL raffle entries, no waiting to find out if you were selected.
            If you want in, you're buying at drop time like normal.
          </p>

          <h2>Wednesday, August 5 — Chrome Baseball hits retail</h2>
          <p>
            <strong>2026 Topps Chrome Baseball</strong> arrives in two retail configurations on the
            same day: a <strong>Mega Box</strong> and a <strong>Value Box</strong>. Both follow the
            hobby wave, which has already come and gone — this is the retail-channel release of a
            product hobby buyers have had for a while.
          </p>
          <p>
            That timing gap matters if you're deciding what to chase. Chrome's hobby configuration
            and its retail configurations are different products with different contents, so the
            hobby prices you've been watching aren't the comp for these.
          </p>

          <h2>Wednesday, August 12 — Pristine and Star Wars Chrome Galaxy</h2>
          <p>
            The busiest day of the stretch. <strong>2026 Topps Pristine</strong> (Hobby Box) is a
            premium baseball release built around on-card autographs and refractor parallels — the
            kind of product where the draw is hits rather than completing a base set.
          </p>
          <p>
            Landing the same day, <strong>2026 Topps Star Wars Chrome Galaxy</strong> brings the
            Chrome format to the Star Wars license, spanning characters and moments from across the
            galaxy. It drops in two configurations: a <strong>Hobby Box</strong> and a{' '}
            <strong>12-Box Case</strong> for anyone buying at volume.
          </p>

          <h2>Friday, August 14 — UFC Stadium Club</h2>
          <p>
            Closing out the stretch, <strong>2026 Topps UFC Stadium Club</strong> applies Stadium
            Club's photography-led design language to the UFC roster. Like Chrome Baseball on the
            5th, it releases in two configurations at once — a <strong>Hobby Box</strong> and a{' '}
            <strong>Mega Box</strong>.
          </p>

          <h2>What that adds up to</h2>
          <p>
            Four products across seven configurations in ten days, spanning baseball, entertainment,
            and MMA. If you sat out last week because raffle entry wasn't worth the hassle, this is
            the stretch to pay attention to — everything here is a straightforward buy.
          </p>

          <h2>How to get in before any of these drop</h2>
          <p>
            Register interest for free on the <a href="/">release calendar</a> — no payment
            collected upfront, and every release is clearly flagged as EQL raffle entry or standard
            checkout so you know exactly what to expect on drop day.
          </p>

          <p style={{ marginTop: '2rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
            Release dates come from public trackers and can change with little notice — always
            confirm on Topps.com before buying. Questions or a release we should be tracking? Email{' '}
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
            the UFC, Disney, Marvel, Lucasfilm, or any other brand or league referenced here. All
            product names and trademarks belong to their respective owners.
          </p>
          <p className="footer-links">
            <a href="/terms.html">Terms &amp; Conditions</a> · <a href="/trust.html">Trust</a> · <a href="/blog.html">Blog</a>
          </p>
        </div>
      </footer>
    </>
  );
}
