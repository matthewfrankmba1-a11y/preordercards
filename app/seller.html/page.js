import SellerClient from './SellerClient';

export const metadata = {
  title: 'Seller Dashboard — PreorderCards',
  // Invite-key-holders only: nothing here is useful in search results, and an
  // indexed login page competes with the real pages for the brand query.
  robots: { index: false, follow: true },
};

export default function SellerPage() {
  return <SellerClient />;
}
