import type { Drill } from '@/types';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/utils/duration';
import { Play, Pause, SkipForward, Clock, ChevronRight, ChevronDown } from 'lucide-react';

type Props = {
  drill: Drill;
  status: 'idle' | 'running' | 'paused' | 'done';
  remaining?: number;
  isLast?: boolean;
  onStart?: () => void;
  onPause?: () => void;
  onSkip?: () => void;
  onClick?: () => void;
};

export function DrillCard({ drill, status, remaining, isLast, onStart, onPause, onSkip, onClick }: Props) {
  const [cuesExpanded, setCuesExpanded] = useState(false);
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  const isDone = status === 'done';
  const display =
    status === 'running' || status === 'paused'
      ? formatDuration(remaining ?? 0)
      : formatDuration(drill.duration);

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onClick?.();
  };

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-4 transition-all',
        isRunning || isPaused ? 'cursor-pointer' : '',
        isRunning
          ? 'border-theme-accent bg-theme-accent-light shadow-lg'
          : isPaused
            ? 'border-theme-warning bg-theme-warning/10 shadow-lg shadow-amber-500/10'
            : isDone
              ? 'border-theme-border bg-theme-bg-secondary-muted opacity-60'
              : 'border-theme-border bg-theme-bg-card hover:border-theme-accent hover:bg-theme-accent-light'
      )}
      onClick={handleCardClick}
    >
      {isRunning && (
        <div className="absolute inset-y-0 left-0 w-1 bg-theme-accent" />
      )}
      {isPaused && (
        <div className="absolute inset-y-0 left-0 w-1 bg-amber-400" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="flex items-center gap-1 rounded-full bg-theme-accent px-2 py-0.5 text-xs font-medium text-white">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-theme-bg-card" />
                进行中
              </span>
            )}
            {isPaused && (
              <span className="flex items-center gap-1 rounded-full bg-theme-warning px-2 py-0.5 text-xs font-medium text-white">
                <Pause className="h-3 w-3" />
                已暂停
              </span>
            )}
            {isDone && (
              <span className="rounded-full bg-theme-border px-2 py-0.5 text-xs font-medium text-theme-text-muted">
                已完成
              </span>
            )}
            <h3 className="truncate text-base font-semibold text-theme-text">{drill.title}</h3>
          </div>
          {drill.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-theme-text-muted">{drill.summary}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div
            className={cn(
              'font-mono text-2xl font-bold tabular-nums',
              isRunning ? 'text-theme-accent' : 'text-theme-text-secondary'
            )}
          >
            {display}
          </div>
          <div className="flex items-center gap-1 text-xs text-theme-text-muted">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(drill.duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => {
            if (isRunning) {
              onPause?.();
            } else {
              onStart?.();
            }
          }}
          disabled={isDone}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
            isDone
              ? 'cursor-not-allowed bg-theme-bg-card text-theme-text-muted'
              : isRunning
                ? 'bg-theme-warning/20 text-theme-warning hover:bg-theme-warning/30'
                : isPaused
                  ? 'bg-theme-warning/20 text-theme-warning hover:bg-theme-warning/30'
                  : 'bg-theme-accent text-white hover:bg-theme-accent-hover'
          )}
        >
          {isRunning ? (
            <>
              <Pause className="h-4 w-4" />
              暂停
            </>
          ) : isPaused ? (
            <>
              <Play className="h-4 w-4" />
              恢复
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              {isDone ? '已完成' : '开始'}
            </>
          )}
        </button>
        <button
          onClick={onSkip}
          disabled={isDone}
          className={cn(
            'flex items-center justify-center gap-1 rounded-xl border border-theme-border px-3 py-2 text-sm transition-colors',
            isDone
              ? 'cursor-not-allowed text-theme-text-muted'
              : 'text-theme-text-secondary hover:border-theme-accent hover:bg-theme-bg-card'
          )}
          aria-label={isLast ? '结束' : '跳过'}
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      {drill.cues.length > 0 && (
        <div className="mt-3 rounded-xl bg-theme-bg-card-subtle overflow-hidden">
          <button
            onClick={() => setCuesExpanded(!cuesExpanded)}
            className="w-full flex items-center justify-between px-2.5 py-2 text-xs text-theme-text-muted hover:bg-theme-bg-card-subtle"
          >
            <div className="flex items-center gap-1 text-[11px] font-medium text-theme-text-muted">
              <ChevronRight className="h-3 w-3" />
              训练要点（共 {drill.cues.length} 条）
            </div>
            <ChevronDown className={cn('h-3 w-3 text-theme-text-muted transition-transform', cuesExpanded && 'rotate-180')} />
          </button>
          {cuesExpanded && (
            <div className="space-y-2 px-2.5 pb-2.5">
              {drill.cues.map((c, idx) => (
                <div
                  key={c.id}
                  className={cn(
                    'rounded-lg border px-3 py-2 text-sm',
                    c.trigger === 'start'
                      ? 'border-theme-accent/30 bg-theme-accent/5 text-theme-text-secondary'
                      : 'border-theme-border bg-theme-bg-card-faint text-theme-text-secondary'
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 text-xs text-theme-text-muted">#{idx + 1}</span>
                    <p className="flex-1 leading-relaxed">{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
