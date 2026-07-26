import './globals.css';
import Script from 'next/script';

export const metadata = {
  title: 'Topps Preorder Release Calendar',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-0KK6YZP2DG"
          strategy="afterInteractive"
        />
        <Script src="/analytics.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
