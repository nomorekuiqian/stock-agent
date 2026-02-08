import { redirect } from 'next/navigation';

// Redirect old /liquidity URL to new /macro/liquidity
export default function LiquidityRedirect() {
  redirect('/macro/liquidity');
}
