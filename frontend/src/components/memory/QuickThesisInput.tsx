'use client';

import { useState, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import { pickThesisPrompt } from '@/lib/thesis-prompts';

interface QuickThesisInputProps {
  symbol: string;
  onSave?: (thesis: string) => void;
  onSkip?: () => void;
  context?: 'just_added' | 'detail_expand' | 'red_alert';
}

export function QuickThesisInput({ symbol, onSave, onSkip, context = 'just_added' }: QuickThesisInputProps) {
  const [mode, setMode] = useState<'preset' | 'custom'>('preset');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const prompt = useMemo(() => pickThesisPrompt(context, symbol), [context, symbol]);

  const handleSave = useCallback(async (thesis: string) => {
    if (!thesis.trim() || saving) return;
    setSaving(true);
    try {
      await api.portfolio.patch(symbol, { thesis: thesis.trim() });
      setSaved(true);
      onSave?.(thesis.trim());
    } catch {
      // Silent fail
    } finally {
      setSaving(false);
    }
  }, [symbol, saving, onSave]);

  if (saved) {
    return (
      <div className="text-xs text-primary animate-fade-in-up py-1">
        已记住 — 下次 AI 讨论 {symbol} 时会参考
      </div>
    );
  }

  return (
    <div className="space-y-2 py-2 animate-fade-in-up">
      <p className="text-xs text-muted-foreground">
        {prompt.question}
        {context !== 'red_alert' && <span className="ml-1 text-muted-foreground/70">(可跳过)</span>}
      </p>

      {mode === 'preset' ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {prompt.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => handleSave(tag)}
              disabled={saving}
              className="text-xs px-2.5 py-1 rounded-full border border-border/50 bg-card/80 text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all disabled:opacity-50"
            >
              {tag}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMode('custom')}
            className="text-xs px-2.5 py-1 rounded-full border border-border/50 bg-card/80 text-muted-foreground hover:border-primary/30 transition-all"
          >
            自己写
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="ml-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            跳过
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 140))}
            placeholder="例如：看好 AI 基建长期增长"
            className="flex-1 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none transition-colors"
            maxLength={140}
            autoFocus
          />
          <button
            type="button"
            onClick={() => handleSave(text)}
            disabled={!text.trim() || saving}
            className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            保存
          </button>
          <button
            type="button"
            onClick={() => setMode('preset')}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            返回
          </button>
          <span className="text-xs text-muted-foreground">{text.length}/140</span>
        </div>
      )}
    </div>
  );
}
