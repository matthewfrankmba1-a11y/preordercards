import { listSuccessPhotos } from '../../lib/successPhotos';

export const metadata = {
  title: 'Success Stories — Topps Preorder Release Calendar',
};

export default function SuccessPage() {
  const photos = listSuccessPhotos();

  return (
    <>
      <header className="site-header">
        <div className="header-scrim"></div>
        <div className="wrap header-content">
          <h1>Success Stories</h1>
          <p className="tagline">Real orders, delivered. A look at collectors who registered interest and got their boxes.</p>
          <a className="header-nav-link" href="/">← Back to Releases</a>
        </div>
      </header>

      <main className="wrap">
        {photos.length === 0 ? (
          <div className="status">No success stories posted yet — check back soon.</div>
        ) : (
          <>
            <p className="success-count">
              {photos.length} order{photos.length === 1 ? '' : 's'} delivered and counting
            </p>
            <div className="photo-grid">
              {photos.map((photo) => (
                <div className="photo-card" key={photo.url}>
                  <img src={photo.url} alt="Order confirmation screenshot" loading="lazy" />
                </div>
              ))}
            </div>
          </>
        )}
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
