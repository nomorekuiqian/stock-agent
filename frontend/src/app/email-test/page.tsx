'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

export default function EmailTestPage() {
  const searchParams = useSearchParams();
  const reportIdParam = searchParams.get('report_id');

  const [emailHtml, setEmailHtml] = useState<string>('');
  const [reportInfo, setReportInfo] = useState<{ id: string; date: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportId, setReportId] = useState(reportIdParam || '');

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'html'>('preview');

  useEffect(() => {
    loadEmailPreview(reportIdParam || undefined);
  }, [reportIdParam]);

  const loadEmailPreview = async (id?: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getEmailPreview(id);
      setEmailHtml(result.html);
      setReportInfo({ id: result.report_id, date: result.report_date });
      setReportId(result.report_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const sendTestEmail = async () => {
    if (!email) {
      setSendResult({ success: false, message: 'Please enter an email address' });
      return;
    }

    setSending(true);
    setSendResult(null);
    try {
      const result = await api.sendReportEmail(email);
      setSendResult({
        success: result.success,
        message: result.success
          ? `Email sent successfully to ${result.sent_to}`
          : result.message || 'Failed to send email',
      });
    } catch (err) {
      setSendResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to send email',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-medium mb-2">
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Email Testing
              </div>
              <h1 className="text-xl font-semibold text-gray-900">Email Template Preview</h1>
              <p className="text-sm text-gray-500 mt-1">
                Preview and test the daily report email format (rendered by backend)
              </p>
            </div>
            <button
              onClick={() => loadEmailPreview(reportId || undefined)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Send Test Email */}
          <div className="lg:col-span-1 space-y-4">
            {/* Send Test Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Send Test Email</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="test@example.com"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  />
                </div>
                <button
                  onClick={sendTestEmail}
                  disabled={sending || !email}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {sending ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                        />
                      </svg>
                      Send Test Email
                    </>
                  )}
                </button>

                {sendResult && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      sendResult.success
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-red-50 text-red-700 border border-red-100'
                    }`}
                  >
                    {sendResult.message}
                  </div>
                )}
              </div>
            </div>

            {/* Report Info Card */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Report Info</h2>
              {loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin" />
                  Loading...
                </div>
              ) : error ? (
                <p className="text-sm text-red-500">{error}</p>
              ) : reportInfo ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Report Date</span>
                    <span className="text-gray-900 font-medium">{reportInfo.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Report ID</span>
                    <span className="text-gray-900 font-medium font-mono text-xs">
                      {reportInfo.id.slice(0, 8)}...
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Source</span>
                    <span className="text-emerald-600 font-medium">Backend API</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No report available</p>
              )}

              {/* Load Specific Report */}
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Load Specific Report
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reportId}
                    onChange={(e) => setReportId(e.target.value)}
                    placeholder="Report ID (UUID)"
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => loadEmailPreview(reportId || undefined)}
                    disabled={loading}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
                  >
                    Load
                  </button>
                </div>
              </div>
            </div>

            {/* View Mode Toggle */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-900 mb-4">View Mode</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('preview')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => setViewMode('html')}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    viewMode === 'html'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  HTML Code
                </button>
              </div>
            </div>
          </div>

          {/* Right Panel - Email Preview */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Preview Header */}
              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <span className="text-xs text-gray-500">
                    {viewMode === 'preview' ? 'Email Preview (Real Template)' : 'HTML Source'}
                  </span>
                </div>
                {viewMode === 'html' && emailHtml && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(emailHtml);
                      alert('HTML copied to clipboard!');
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    Copy
                  </button>
                )}
              </div>

              {/* Preview Content */}
              <div className="max-h-[700px] overflow-y-auto">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                    <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-400 animate-spin mb-3" />
                    <p className="text-sm">Loading email preview from backend...</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-20 text-red-400">
                    <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-sm font-medium">{error}</p>
                    <p className="text-xs text-gray-400 mt-1">Make sure the backend is running</p>
                  </div>
                ) : viewMode === 'preview' ? (
                  <div dangerouslySetInnerHTML={{ __html: emailHtml }} />
                ) : (
                  <pre className="p-4 text-xs text-gray-700 bg-gray-50 overflow-x-auto whitespace-pre-wrap font-mono">
                    {emailHtml}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
