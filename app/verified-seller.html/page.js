import VerifiedSellerApplyClient from './VerifiedSellerApplyClient';

export const metadata = {
  title: 'Become a Verified Seller — PreorderCards',
  description:
    'Apply to become a vetted PreorderCards Marketplace seller and list factory-sealed, in-hand Topps inventory to buyers who have already registered interest.',
  alternates: { canonical: '/verified-seller.html' },
};

export default function VerifiedSellerApplyPage() {
  return <VerifiedSellerApplyClient />;
}
