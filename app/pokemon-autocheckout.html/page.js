import PokemonAutocheckoutClient from './PokemonAutocheckoutClient';

export const metadata = {
  title: 'Pokemon Center Autocheckout — PreorderCards',
  description: "Pokemon Center restocks randomly — sign up for Autocheckout and we'll grab it the moment it's back in stock.",
};

export default function PokemonAutocheckoutPage() {
  return <PokemonAutocheckoutClient />;
}
