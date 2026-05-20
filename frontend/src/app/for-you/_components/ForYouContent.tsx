'use client';

import { useFeatureFlags } from '@/hooks/use-feature-flags';
import PaywallGuard from '@/components/PaywallGuard';
import { ForYouPageContentV1 } from './ForYouContentV1';
import { ForYouPageContentV2 } from './ForYouContentV2';
import { ForYouSkeleton } from './ForYouSkeleton';

export function ForYouContent() {
  const { has, isLoading } = useFeatureFlags();

  return (
    <PaywallGuard requiredFeature="for_you_website">
      {isLoading ? (
        <ForYouSkeleton />
      ) : has('for_you_v2') ? (
        <ForYouPageContentV2 />
      ) : (
        <ForYouPageContentV1 />
      )}
    </PaywallGuard>
  );
}
