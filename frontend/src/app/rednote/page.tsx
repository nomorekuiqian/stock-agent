'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, RedNoteContent, RedNoteListItem } from '@/lib/api';

// Emoji mapping for display
const EMOJI_MAP: Record<string, string> = {
  fire: '\u{1F525}',
  chart_increasing: '\u{1F4C8}',
  warning: '\u{26A0}\u{FE0F}',
  bank: '\u{1F3E6}',
  money: '\u{1F4B0}',
  rocket: '\u{1F680}',
  car: '\u{1F697}',
  lock: '\u{1F512}',
  briefcase: '\u{1F4BC}',
  globe: '\u{1F310}',
  calendar: '\u{1F4C5}',
  bulb: '\u{1F4A1}',
  target: '\u{1F3AF}',
  chart: '\u{1F4CA}',
  dollar: '\u{1F4B5}',
  star: '\u{2B50}',
  check: '\u{2705}',
  x: '\u{274C}',
  question: '\u{2753}',
  exclamation: '\u{2757}',
  arrow_up: '\u{2B06}\u{FE0F}',
  arrow_down: '\u{2B07}\u{FE0F}',
};

function getEmoji(emojiName: string): string {
  return EMOJI_MAP[emojiName] || emojiName;
}

// Copy button component
function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={`px-2 py-1 text-xs rounded transition-all ${
        copied
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-400'
      }`}
    >
      {copied ? 'Copied' : label || 'Copy'}
    </button>
  );
}

// Content card component
function ContentCard({
  title,
  children,
  copyText,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  copyText?: string;
  className?: string;
}) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-gray-900 dark:text-gray-100">{title}</h3>
        {copyText && <CopyButton text={copyText} />}
      </div>
      {children}
    </div>
  );
}

// Text display with preserved formatting
function FormattedText({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p className={`text-gray-700 dark:text-gray-300 whitespace-pre-wrap ${className}`}>
      {text}
    </p>
  );
}

export default function RedNotePage() {
  const [content, setContent] = useState<RedNoteContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [posts, setPosts] = useState<RedNoteListItem[]>([]);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Fetch list of posts on mount
  useEffect(() => {
    let isInitialMount = true;
    const fetchPosts = async () => {
      try {
        const response = await api.listRedNotePosts(20);
        if (response.success && response.posts) {
          setPosts(response.posts);
          // Auto-select the first (latest) post only on initial mount
          if (response.posts.length > 0 && isInitialMount) {
            setSelectedPostId(response.posts[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to fetch posts list:', err);
      }
    };
    fetchPosts();
    return () => {
      isInitialMount = false;
    };
  }, []);

  // Fetch selected post content
  const fetchPost = useCallback(async (postId: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getRedNoteById(postId);
      if (response.success && response.content) {
        setContent(response.content);
        setReportDate(response.report_date || null);
      } else {
        setError(response.error || 'No content available');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch content');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch content when selected post changes
  useEffect(() => {
    if (selectedPostId) {
      fetchPost(selectedPostId);
    }
  }, [selectedPostId, fetchPost]);

  const handlePostChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedPostId(e.target.value);
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">RedNote Content</h1>
          {posts.length > 0 && (
            <select
              value={selectedPostId || ''}
              onChange={handlePostChange}
              className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {posts.map((post) => (
                <option key={post.id} value={post.id}>
                  {post.report_date} - {post.title}
                </option>
              ))}
            </select>
          )}
        </div>
        {reportDate && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Report Date: {reportDate}
          </p>
        )}
      </div>

      {error && !content && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-6">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {content && (
        <div className="space-y-4">
          {/* Page 1: Cover */}
          <ContentCard
            title="Page 1: Cover"
            copyText={`${content.cover_title}\n${content.cover_subtitle}\n${content.date}`}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Title</span>
                <span className="text-xl font-bold text-gray-900 dark:text-gray-100 flex-1">
                  {content.cover_title}
                </span>
                <CopyButton text={content.cover_title} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Subtitle</span>
                <span className="text-gray-700 dark:text-gray-300 flex-1">{content.cover_subtitle}</span>
                <CopyButton text={content.cover_subtitle} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Date</span>
                <span className="text-gray-700 dark:text-gray-300 flex-1">{content.date}</span>
                <CopyButton text={content.date} />
              </div>
            </div>
          </ContentCard>

          {/* Page 2: Market Summary */}
          <ContentCard
            title="Page 2: Market Summary"
            copyText={`${content.market_summary_p1}\n\n${content.market_summary_p2}\n\n${content.index_data}`}
          >
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Paragraph 1</span>
                  <CopyButton text={content.market_summary_p1} />
                </div>
                <FormattedText text={content.market_summary_p1} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Paragraph 2</span>
                  <CopyButton text={content.market_summary_p2} />
                </div>
                <FormattedText text={content.market_summary_p2} />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Index Data</span>
                  <CopyButton text={content.index_data} />
                </div>
                <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                  {content.index_data}
                </code>
              </div>
            </div>
          </ContentCard>

          {/* Page 3: News Highlights */}
          <ContentCard
            title="Page 3: News Highlights"
            copyText={content.news_highlights.map((n, i) => {
              const parts = n.split(' ');
              const emoji = parts[0];
              const text = parts.slice(1).join(' ');
              return `${i + 1}. ${getEmoji(emoji)} ${text}`;
            }).join('\n')}
          >
            <div className="space-y-2">
              {content.news_highlights.map((news, idx) => {
                const parts = news.split(' ');
                const emoji = parts[0];
                const text = parts.slice(1).join(' ');
                const displayText = `${idx + 1}. ${getEmoji(emoji)} ${text}`;
                return (
                  <div key={idx} className="flex items-start gap-3 py-1">
                    <span className="text-gray-700 dark:text-gray-300 flex-1">
                      {displayText}
                    </span>
                    <CopyButton text={displayText} />
                  </div>
                );
              })}
            </div>
          </ContentCard>

          {/* Page 4: Hot Topics */}
          <ContentCard
            title="Page 4: Hot Topics"
            copyText={content.hot_topics.map(t =>
              `${getEmoji(t.emoji)} ${t.title}\n${t.what}\n${t.so_what}`
            ).join('\n\n')}
          >
            <div className="space-y-4">
              {content.hot_topics.map((topic, idx) => (
                <div key={idx} className="border-l-2 border-emerald-500 pl-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {getEmoji(topic.emoji)} {topic.title}
                    </span>
                    <CopyButton
                      text={`${getEmoji(topic.emoji)} ${topic.title}\n${topic.what}\n${topic.so_what}`}
                    />
                  </div>
                  <div className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                    <p>{topic.what}</p>
                    <p>{topic.so_what}</p>
                  </div>
                </div>
              ))}
            </div>
          </ContentCard>

          {/* Page 5: Future Events */}
          <ContentCard
            title="Page 5: Future Events"
            copyText={
              content.future_events.map(e => `${e.date} ${e.event}: ${e.impact}`).join('\n') +
              '\n\n' + content.outlook_summary
            }
          >
            <div className="space-y-3">
              <div className="space-y-2">
                {content.future_events.map((event, idx) => (
                  <div key={idx} className="flex items-start gap-3 py-1">
                    <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded whitespace-nowrap">
                      {event.date}
                    </span>
                    <div className="flex-1">
                      <span className="font-medium text-gray-900 dark:text-gray-100">{event.event}</span>
                      <span className="text-gray-500 dark:text-gray-400"> - </span>
                      <span className="text-gray-700 dark:text-gray-300">{event.impact}</span>
                    </div>
                    <CopyButton text={`${event.date} ${event.event}: ${event.impact}`} />
                  </div>
                ))}
              </div>
              <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">Outlook Summary</span>
                  <CopyButton text={content.outlook_summary} />
                </div>
                <FormattedText text={content.outlook_summary} className="text-sm" />
              </div>
            </div>
          </ContentCard>

          {/* Page 6: CTA */}
          <ContentCard
            title="Page 6: CTA"
            copyText={`${content.cta_question}\n${content.cta_options}`}
          >
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Question</span>
                <span className="text-gray-900 dark:text-gray-100 font-medium flex-1">
                  {content.cta_question}
                </span>
                <CopyButton text={content.cta_question} />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-16">Options</span>
                <span className="text-gray-700 dark:text-gray-300 flex-1">{content.cta_options}</span>
                <CopyButton text={content.cta_options} />
              </div>
            </div>
          </ContentCard>

          {/* Post Body */}
          <ContentCard title="Post Body" copyText={content.body}>
            <FormattedText text={content.body} />
          </ContentCard>

          {/* Tags */}
          <ContentCard title="Tags" copyText={content.tags}>
            <div className="flex flex-wrap gap-2">
              {content.tags.split(/\s+/).map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded text-sm"
                >
                  {tag}
                </span>
              ))}
            </div>
          </ContentCard>

          {/* Copy All Button */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
            <CopyButton
              text={JSON.stringify(content, null, 2)}
              label="Copy All as JSON"
            />
          </div>
        </div>
      )}
    </main>
  );
}
