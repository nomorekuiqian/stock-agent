'use client';

import { PanelLeft } from 'lucide-react';

interface MobileTabSwitchProps {
  activeTab: 'chat' | 'results';
  onTabChange: (tab: 'chat' | 'results') => void;
  /** Show a badge indicator on results tab when new results arrive */
  hasNewResults?: boolean;
  /** Opens the mobile conversation history drawer. */
  onHistoryOpen?: () => void;
}

/**
 * MobileTabSwitch - Top tab bar for mobile viewports.
 *
 * Two tabs: [对话 | 结果] with subtle emerald indicator on active tab.
 * Badge dot on results tab when new data arrives while viewing chat.
 */
export default function MobileTabSwitch({
  activeTab,
  onTabChange,
  hasNewResults = false,
  onHistoryOpen,
}: MobileTabSwitchProps) {
  return (
    <div className="flex items-center border-b border-border/50 bg-background/85 px-1 backdrop-blur-sm">
      {onHistoryOpen && (
        <button
          type="button"
          onClick={onHistoryOpen}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label="打开历史对话"
          title="历史对话"
        >
          <PanelLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <div className="flex min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onTabChange('chat')}
          className={`relative flex-1 py-3 text-center text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          对话
          {activeTab === 'chat' && (
            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
          )}
        </button>
        <button
          type="button"
          onClick={() => onTabChange('results')}
          className={`relative flex-1 py-3 text-center text-sm font-medium transition-colors ${
            activeTab === 'results'
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          工作区
          {hasNewResults && activeTab !== 'results' && (
            <span className="absolute top-2.5 right-[calc(50%-16px)] h-1.5 w-1.5 rounded-full bg-primary" />
          )}
          {activeTab === 'results' && (
            <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
          )}
        </button>
      </div>
    </div>
  );
}
