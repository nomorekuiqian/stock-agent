'use client';

interface MobileTabSwitchProps {
  activeTab: 'chat' | 'results';
  onTabChange: (tab: 'chat' | 'results') => void;
  /** Show a badge indicator on results tab when new results arrive */
  hasNewResults?: boolean;
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
}: MobileTabSwitchProps) {
  return (
    <div className="flex border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <button
        onClick={() => onTabChange('chat')}
        className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
          activeTab === 'chat'
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        对话
        {activeTab === 'chat' && (
          <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
        )}
      </button>
      <button
        onClick={() => onTabChange('results')}
        className={`flex-1 py-3 text-sm font-medium text-center transition-colors relative ${
          activeTab === 'results'
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        工作区
        {hasNewResults && activeTab !== 'results' && (
          <span className="absolute top-2.5 right-[calc(50%-16px)] w-1.5 h-1.5 rounded-full bg-primary" />
        )}
        {activeTab === 'results' && (
          <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
        )}
      </button>
    </div>
  );
}
