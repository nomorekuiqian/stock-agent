'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, ChevronRight, Filter } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api, SectorInfo, SectorDigestHistoryItem } from '@/lib/api';

interface DigestHistoryItem extends SectorDigestHistoryItem {
  sector_name?: string;
}

export default function SectorArchivePage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [sectors, setSectors] = useState<SectorInfo[]>([]);
  const [selectedSectorId, setSelectedSectorId] = useState<string | null>(null);
  const [history, setHistory] = useState<DigestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login?redirect=/sectors/archive');
    }
  }, [authLoading, isAuthenticated, router]);

  // Load sectors
  useEffect(() => {
    const loadSectors = async () => {
      try {
        const data = await api.sectors.list();
        setSectors(data);
      } catch (err) {
        console.error('Failed to load sectors:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSectors();
  }, []);

  // Load history when sector changes
  useEffect(() => {
    const loadHistory = async () => {
      if (!selectedSectorId) {
        setHistory([]);
        return;
      }

      setLoadingHistory(true);
      try {
        const response = await api.sectors.getHistory(selectedSectorId, 90);
        const sectorInfo = sectors.find((s) => s.id === selectedSectorId);
        const historyWithNames: DigestHistoryItem[] = response.digests.map((d) => ({
          ...d,
          sector_name: sectorInfo?.name_zh || selectedSectorId,
        }));
        setHistory(historyWithNames);
      } catch (err) {
        console.error('Failed to load history:', err);
        setHistory([]);
      } finally {
        setLoadingHistory(false);
      }
    };

    loadHistory();
  }, [selectedSectorId, sectors]);

  // Format date for display
  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatShortDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return {
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        day: date.getDate(),
      };
    } catch {
      return { month: '', day: '' };
    }
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-20">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Page Header */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            {/* Back + Title */}
            <div className="space-y-3">
              <Link
                href="/sectors"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Sectors</span>
              </Link>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 max-w-[60px] bg-gradient-to-r from-primary to-transparent" />
                <span className="text-primary text-xs font-medium tracking-[0.2em] uppercase">SECTORS ARCHIVE</span>
              </div>

              <h1 className="text-3xl md:text-4xl font-editorial text-foreground tracking-tight">
                Past Digests
              </h1>

              <p className="text-muted-foreground text-sm md:text-base max-w-lg">
                Browse historical sector digests and analysis reports
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Filter Section */}
      <section className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="w-4 h-4" />
              <span>Filter by sector:</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setSelectedSectorId(null)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedSectorId === null
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-card text-muted-foreground border border-border/50 hover:border-emerald-500/30'
                }`}
              >
                All
              </button>
              {sectors.map((sector) => (
                <button
                  key={sector.id}
                  onClick={() => setSelectedSectorId(sector.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedSectorId === sector.id
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-card text-muted-foreground border border-border/50 hover:border-emerald-500/30'
                  }`}
                >
                  {sector.name_zh}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* History Grid */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        {loading ? (
          <div className="py-20">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading...</p>
            </div>
          </div>
        ) : loadingHistory ? (
          <div className="py-20">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <p className="text-muted-foreground text-sm">Loading history...</p>
            </div>
          </div>
        ) : history.length === 0 ? (
          <div className="py-20">
            <div className="text-center space-y-6">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-card border border-border/50 flex items-center justify-center">
                <Calendar className="w-10 h-10 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-xl font-medium text-foreground mb-2">
                  No archived digests yet
                </h3>
                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                  {selectedSectorId
                    ? 'No historical digests found for this sector. Generate some digests first!'
                    : 'Historical sector digests will appear here once generated.'}
                </p>
              </div>
              <Link
                href="/sectors"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-lg font-medium text-sm transition-all hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20"
              >
                <span>Generate Digest</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {history.map((item) => {
              const shortDate = formatShortDate(item.digest_date);
              return (
                <Link
                  key={item.id}
                  href={`/sectors/${item.sector_id}?date=${item.digest_date}`}
                  className="group v2-card p-4 transition-all"
                >
                  <div className="flex items-start gap-4">
                    {/* Date Badge */}
                    <div className="flex-shrink-0 flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <span className="text-xs font-data font-medium text-emerald-400 uppercase">
                        {shortDate.month}
                      </span>
                      <span className="text-lg font-data font-bold text-emerald-400">
                        {shortDate.day}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Sector Name */}
                      <div className="text-xs text-muted-foreground mb-1">
                        {item.sector_name}
                      </div>

                      {/* Title/Greeting */}
                      <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-emerald-400 transition-colors">
                        {item.greeting || formatDate(item.digest_date)}
                      </h3>
                    </div>

                    {/* Arrow */}
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
