import ResetPasswordClient from './ResetPasswordClient';

export const metadata = {
  title: 'Reset Password — PreorderCards',
  // Reached only via a one-time emailed token; never a valid search result.
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
