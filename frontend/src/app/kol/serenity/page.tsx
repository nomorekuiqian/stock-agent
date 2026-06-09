import { redirect } from 'next/navigation';

// `/kol/serenity` is a friendly alias for the canonical backend username
// `aleabitoreddit`. Redirect so the multi-page [username] dynamic route handles
// the actual rendering (PersonaHero + SubNav + sub-pages).
export default function SerenityAliasPage() {
  redirect('/kol/aleabitoreddit');
}
