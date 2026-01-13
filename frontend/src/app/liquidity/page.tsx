import { redirect } from 'next/navigation';

// Redirect old /liquidity URL to new /tools/liquidity
export default function LiquidityRedirect() {
  redirect('/tools/liquidity');
}
