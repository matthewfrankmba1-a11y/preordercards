import './globals.css';
import Script from 'next/script';
import { headers } from 'next/headers';

export const metadata = {
  title: 'Topps Preorder Release Calendar',
};

export default async function RootLayout({ children }) {
  const nonce = (await headers()).get('x-nonce');

  return (
    <html lang="en">
      <body>
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-0KK6YZP2DG"
          strategy="afterInteractive"
          nonce={nonce}
        />
        <Script src="/analytics.js" strategy="afterInteractive" nonce={nonce} />
        {children}
      </body>
    </html>
  );
}
