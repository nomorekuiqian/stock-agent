'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function LoadingState() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="w-12 h-12 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto" />
      </div>
    </main>
  );
}

function FeedbackContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const rating = searchParams.get('rating');
  const error = searchParams.get('error');

  const getRatingDisplay = (r: string | null) => {
    switch (r) {
      case 'satisfied':
        return { text: 'satisfied', color: 'text-emerald-600', bg: 'bg-emerald-100' };
      case 'neutral':
        return { text: 'okay', color: 'text-amber-600', bg: 'bg-amber-100' };
      case 'dissatisfied':
        return { text: 'dissatisfied', color: 'text-red-600', bg: 'bg-red-100' };
      default:
        return { text: '', color: 'text-gray-600', bg: 'bg-gray-100' };
    }
  };

  const ratingInfo = getRatingDisplay(rating);

  // Success state
  if (status === 'success') {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Thanks for your feedback!
            </h1>
            <p className="text-sm text-gray-500">
              Your opinion helps us improve our daily reports.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            {rating && (
              <div className="mb-6">
                <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${ratingInfo.bg} ${ratingInfo.color}`}>
                  You rated: {ratingInfo.text}
                </span>
              </div>
            )}
            <p className="text-sm text-gray-500 mb-6">
              We appreciate you taking the time to share your thoughts. Your feedback will help us create better market analysis for you.
            </p>
            <Link
              href="/today"
              className="inline-block px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm transition-all hover:bg-emerald-700"
            >
              View Today&apos;s Report
            </Link>
          </div>

          <div className="text-center mt-6">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Back to homepage
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Duplicate state
  if (status === 'duplicate') {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Feedback Already Received
            </h1>
            <p className="text-sm text-gray-500">
              You&apos;ve already submitted feedback for this report.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            {rating && (
              <div className="mb-6">
                <span className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${ratingInfo.bg} ${ratingInfo.color}`}>
                  Your rating: {ratingInfo.text}
                </span>
              </div>
            )}
            <p className="text-sm text-gray-500 mb-6">
              Your feedback has been updated. Thank you for letting us know what you think!
            </p>
            <Link
              href="/today"
              className="inline-block px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm transition-all hover:bg-emerald-700"
            >
              View Today&apos;s Report
            </Link>
          </div>

          <div className="text-center mt-6">
            <Link
              href="/"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Back to homepage
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Error state
  const getErrorMessage = (err: string | null) => {
    switch (err) {
      case 'missing_params':
        return 'Some required information was missing from the request.';
      case 'invalid_rating':
        return 'The rating value was invalid.';
      case 'server_error':
        return 'Something went wrong on our end. Please try again later.';
      default:
        return err || 'An unexpected error occurred.';
    }
  };

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Something Went Wrong
          </h1>
          <p className="text-sm text-gray-500">
            We couldn&apos;t process your feedback.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
          <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-6">
            <p className="text-sm text-red-600">{getErrorMessage(error)}</p>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            Please try clicking the feedback button in your email again, or contact us if the problem persists.
          </p>
          <Link
            href="/today"
            className="inline-block px-6 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm transition-all hover:bg-emerald-700"
          >
            View Today&apos;s Report
          </Link>
        </div>

        <div className="text-center mt-6">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Back to homepage
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function FeedbackPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <FeedbackContent />
    </Suspense>
  );
}
