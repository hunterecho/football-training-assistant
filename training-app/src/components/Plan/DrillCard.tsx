import type { Drill } from '@/types';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/utils/duration';
import { Play, Pause, SkipForward, Clock, ChevronRight } from 'lucide-react';

type Props = {
  drill: Drill;
  status: 'idle' | 'running' | 'paused' | 'done';
  remaining?: number;
  onStart?: () => void;
  onSkip?: () => void;
};

export function DrillCard({ drill, status, remaining, onStart, onSkip }: Props) {
  const isRunning = status === 'running';
  const isDone = status === 'done';
  const display =
    status === 'running' || status === 'paused'
      ? formatDuration(remaining ?? 0)
      : formatDuration(drill.duration);

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border p-4 transition-all',
        isRunning
          ? 'border-emerald-500/60 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
          : isDone
            ? 'border-slate-700 bg-slate-900/40 opacity-60'
            : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
      )}
    >
      {isRunning && (
        <div className="absolute inset-y-0 left-0 w-1 bg-emerald-400" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isRunning && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                进行中
              </span>
            )}
            {isDone && (
              <span className="rounded-full bg-slate-700/60 px-2 py-0.5 text-xs font-medium text-slate-400">
                已完成
              </span>
            )}
            <h3 className="truncate text-base font-semibold text-white">{drill.title}</h3>
          </div>
          {drill.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-slate-400">{drill.summary}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div
            className={cn(
              'font-mono text-2xl font-bold tabular-nums',
              isRunning ? 'text-emerald-400' : 'text-slate-200'
            )}
          >
            {display}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3 w-3" />
            <span>{formatDuration(drill.duration)}</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onStart}
          disabled={isDone}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
            isDone
              ? 'cursor-not-allowed bg-slate-800 text-slate-500'
              : isRunning
                ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
          )}
        >
          {isRunning ? (
            <>
              <Pause className="h-4 w-4" />
              暂停
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
            'flex items-center justify-center gap-1 rounded-xl border border-slate-700 px-3 py-2 text-sm transition-colors',
            isDone
              ? 'cursor-not-allowed text-slate-600'
              : 'text-slate-300 hover:border-slate-500 hover:bg-slate-800'
          )}
          aria-label="跳过"
        >
          <SkipForward className="h-4 w-4" />
        </button>
      </div>

      {drill.cues.length > 0 && (
        <div className="mt-3 rounded-xl bg-slate-950/50 p-2.5 text-xs text-slate-400">
          <div className="flex items-center gap-1 text-[11px] font-medium text-slate-500">
            <ChevronRight className="h-3 w-3" />
            教学话术（共 {drill.cues.length} 条）
          </div>
        </div>
      )}
    </div>
  );
}
