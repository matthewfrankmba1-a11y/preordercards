import MarketplaceClient from './MarketplaceClient';

export const metadata = {
  title: 'Marketplace — Factory-Sealed Topps Boxes from Vetted Sellers | PreorderCards',
  description:
    'Browse fixed-price listings of factory-sealed, in-hand Topps trading card boxes from vetted PreorderCards sellers. No bidding — original seal and retailer tracking required on every item.',
  alternates: { canonical: '/marketplace.html' },
  openGraph: {
    title: 'PreorderCards Marketplace — Factory-Sealed Topps Boxes',
    description:
      'Fixed-price listings of factory-sealed, in-hand Topps inventory from vetted sellers. No bidding or offers.',
    type: 'website',
    url: '/marketplace.html',
  },
};

export default function MarketplacePage() {
  return <MarketplaceClient />;
}
