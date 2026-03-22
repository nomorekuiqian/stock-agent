import { Suspense } from 'react';
import { ForYouContent } from './_components/ForYouContent';
import { ForYouSkeleton } from './_components/ForYouSkeleton';

export default function ForYouPage() {
  return (
    <Suspense fallback={<ForYouSkeleton />}>
      <ForYouContent />
    </Suspense>
  );
}
