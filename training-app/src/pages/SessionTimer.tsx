import { useEffect, useMemo, useRef, useState } from 'react';
import { useTrainingStore } from '@/store/trainingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useSpeech } from '@/hooks/useSpeech';
import { useBeep } from '@/hooks/useBeep';
import { useWakeLock } from '@/hooks/useWakeLock';
import { formatDuration } from '@/utils/duration';
import {
  Pause,
  Play,
  SkipForward,
  SkipBack,
  RotateCcw,
  Volume2,
  VolumeX,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function SessionTimer({ onBack }: { onBack?: () => void }) {
  const activeId = useTrainingStore((s) => s.activeTemplateId);
  const activePlanId = useTrainingStore((s) => s.activePlanId);
  const templates = useTrainingStore((s) => s.templates);
  const session = useTrainingStore((s) => s.session);
  const records = useTrainingStore((s) => s.records);
  const activeRecordId = useTrainingStore((s) => s.activeRecordId);
  const tickRaw = useTrainingStore((s) => s.tick);
  const nextDrillRaw = useTrainingStore((s) => s.nextDrill);
  const prevDrillRaw = useTrainingStore((s) => s.prevDrill);
  const pauseSession = useTrainingStore((s) => s.pauseSession);
  const resumeSession = useTrainingStore((s) => s.resumeSession);
  const startSessionRaw = useTrainingStore((s) => s.startSession);
  const resetSession = useTrainingStore((s) => s.resetSession);
  const addRecord = useTrainingStore((s) => s.addRecord);
  const updateRecord = useTrainingStore((s) => s.updateRecord);
  const toggleRecordStatus = useTrainingStore((s) => s.toggleRecordStatus);

  const settings = useSettingsStore((s) => s.settings);
  const [muted, setMuted] = useState(false);
  const effectiveSpeechEnabled = settings.speechEnabled && !muted;
  const speech = useSpeech({
    enabled: effectiveSpeechEnabled,
    rate: settings.speechRate,
    volume: settings.speechVolume,
    voiceIndex: settings.speechVoiceIndex,
  });
  const { beep } = useBeep();

  const template = useMemo(() => {
    // 优先使用 activeRecordId 关联的模板
    if (activeRecordId) {
      const activeRecord = records.find((r) => r.id === activeRecordId);
      if (activeRecord) {
        const tpl = templates.find((t) => t.id === activeRecord.templateId);
        if (tpl) return tpl;
      }
    }
    // 其次使用 activeTemplateId
    return templates.find((t) => t.id === activeId) ?? null;
  }, [templates, activeId, activeRecordId, records]);
  const drill = template?.drills[session.drillIndex] ?? null;

  // When muted changes, sync with speech engine.
  useEffect(() => {
    if (muted) {
      speech.clear();
    } else if (session.status === 'running' && drill) {
      // When unmuting during an active session, wake up the engine so
      // that the next cue/end-event enqueue works reliably.
      try { window.speechSynthesis?.resume(); } catch { /* noop */ }
    }
  }, [muted, speech, session.status, drill]);

  // Debug helper: log when speech is unsupported so the user knows.
  useEffect(() => {
    if (!speech.supported) {
      console.warn('[speech] 当前浏览器不支持 Web Speech API，语音播报不可用。');
    }
  }, [speech.supported]);

  // Refs to keep callbacks stable while always using latest.
  const tickRef = useRef(tickRaw);
  tickRef.current = tickRaw;
  const nextDrillRef = useRef(nextDrillRaw);
  nextDrillRef.current = nextDrillRaw;
  const prevDrillRef = useRef(prevDrillRaw);
  prevDrillRef.current = prevDrillRaw;
  const startSessionRef = useRef(startSessionRaw);
  startSessionRef.current = startSessionRaw;

  const lastEndedRef = useRef<boolean>(false);
  const lastFiveSecRef = useRef<number>(0);
  const firedCueKeysRef = useRef<Set<string>>(new Set());
  const firedMinuteKeysRef = useRef<Set<string>>(new Set());
  const firedOneMinLeftRef = useRef<boolean>(false);
  const startedDrillRef = useRef<string>('');
  const prevDrillIndexRef = useRef<number>(session.drillIndex);
  const recordIdRef = useRef<string | null>(null);

  useWakeLock(settings.keepScreenAwake && session.status === 'running');

  useEffect(() => {
    if (session.status === 'running' && session.startedAt && template) {
      // Check if there's already an in_progress record for this session
      const existingRecord = records.find(
        r => r.templateId === template.id && r.status === 'in_progress'
      );
      if (existingRecord) {
        recordIdRef.current = existingRecord.id;
        return;
      }
      if (!recordIdRef.current) {
        // If there's an active record (from a plan), update it to in_progress
        if (activeRecordId) {
          const activeRecord = records.find(r => r.id === activeRecordId);
          if (activeRecord && activeRecord.status === 'planned') {
            updateRecord(activeRecordId, {
              status: 'in_progress',
              startTime: session.startedAt,
              durationSeconds: 0,
              totalDrills: template.drills.length,
              completedDrills: session.drillIndex,
            });
            recordIdRef.current = activeRecordId;
            return;
          }
        }
        const recordIdPromise = addRecord({
          planId: activePlanId ?? undefined,
          templateId: template.id,
          userId: useAuthStore.getState().user?.id ?? 'unknown',
          title: template.name,
          status: 'in_progress',
          startTime: session.startedAt,
          durationSeconds: 0,
          totalDrills: template.drills.length,
          completedDrills: session.drillIndex,
        });
        recordIdPromise.then((recordId) => {
          recordIdRef.current = recordId;
        });
      }
    }
  }, [session.status, session.startedAt, template, activeRecordId, addRecord, updateRecord, records]);

  // Main tick loop — 250ms interval. Uses ref so effect isn't recreated every render.
  useEffect(() => {
    if (session.status !== 'running') return;
    const id = window.setInterval(() => {
      tickRef.current(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [session.status, session.drillIndex]);

  // When the session status changes, mirror to speech engine.
  useEffect(() => {
    if (session.status === 'paused') {
      speech.pause();
    } else if (session.status === 'running') {
      speech.resume();
    } else if (session.status === 'idle' || session.status === 'ready') {
      speech.clear();
    }
  }, [session.status]);

  useEffect(() => {
    if (!template || !drill) return;

    // When drill changes, cancel any still-playing speech from previous drill
    // so the new drill's intro/cues are heard immediately.
    if (prevDrillIndexRef.current !== session.drillIndex) {
      speech.clear();
      prevDrillIndexRef.current = session.drillIndex;
    }

    const drillKey = `${template.id}:${session.drillIndex}`;
    if (startedDrillRef.current !== drillKey) {
      startedDrillRef.current = drillKey;
      firedCueKeysRef.current = new Set();
      firedMinuteKeysRef.current = new Set();
      firedOneMinLeftRef.current = false;
      lastEndedRef.current = false;
      lastFiveSecRef.current = 0;
    }

    // Start of drill
    if (session.status === 'running' && session.remaining >= drill.duration - 0.05) {
      const intro = `现在开始 ${drill.title}，时长 ${formatDuration(drill.duration)}`;
      speech.enqueue(intro);
      beep({ enabled: settings.soundEnabled, frequency: 880, durationMs: 160 });
      drill.cues
        .filter((c) => c.trigger === 'start')
        .forEach((c) => {
          const key = `start:${c.id}`;
          if (!firedCueKeysRef.current.has(key)) {
            firedCueKeysRef.current.add(key);
            speech.enqueue(c.text);
          }
        });
    }

    const remainingInt = Math.max(0, Math.ceil(session.remaining));

    if (session.status === 'running' && session.remaining > 0) {
      const elapsed = drill.duration - session.remaining;

      // Reminder: every full minute boundary crossed (elapsed 60s, 120s, ...).
      // Say: "已过 N 分钟，还剩 X 分 Y 秒". Only once per minute.
      const elapsedMinutes = Math.floor(elapsed / 60);
      if (
        elapsedMinutes >= 1 &&
        !firedMinuteKeysRef.current.has(`m:${elapsedMinutes}`) &&
        elapsed >= elapsedMinutes * 60
      ) {
        firedMinuteKeysRef.current.add(`m:${elapsedMinutes}`);
        const left = Math.max(0, Math.ceil(drill.duration - elapsed));
        speech.enqueue(`已过 ${elapsedMinutes} 分钟，还剩 ${formatDuration(left)}`);
      }

      // Reminder: "还剩 1 分钟" — exactly once per drill when remaining ≤ 60s
      if (!firedOneMinLeftRef.current && remainingInt <= 60 && remainingInt > 5) {
        firedOneMinLeftRef.current = true;
        speech.enqueue('还剩一分钟');
      }

      // Interval cues (fire once when the mark is reached)
      drill.cues
        .filter((c) => c.trigger === 'interval' && c.seconds)
        .forEach((c) => {
          const key = `interval:${c.id}`;
          if (c.seconds && elapsed >= c.seconds && !firedCueKeysRef.current.has(key)) {
            firedCueKeysRef.current.add(key);
            speech.enqueue(c.text);
          }
        });

      // Periodic cues: at most twice per drill total.
      drill.cues
        .filter((c) => c.trigger === 'periodic' && c.seconds && c.seconds > 0)
        .forEach((c) => {
          if (!c.seconds) return;
          const key1 = `periodic:${c.id}:1`;
          const key2 = `periodic:${c.id}:2`;
          if (elapsed >= c.seconds && !firedCueKeysRef.current.has(key1)) {
            firedCueKeysRef.current.add(key1);
            speech.enqueue(c.text);
          } else if (elapsed >= c.seconds * 2 && !firedCueKeysRef.current.has(key2)) {
            firedCueKeysRef.current.add(key2);
            speech.enqueue(c.text);
          }
        });
    }

    // Countdown last 5 seconds (5, 4, 3, 2, 1)
    if (
      session.status === 'running' &&
      session.remaining > 0 &&
      remainingInt <= 5 &&
      remainingInt !== lastFiveSecRef.current
    ) {
      lastFiveSecRef.current = remainingInt;
      if (remainingInt > 0) {
        speech.enqueue(`${remainingInt}`);
        beep({ enabled: settings.soundEnabled, frequency: 440, durationMs: 80 });
      }
    }

    // End of drill
    if (session.status === 'finished' && !lastEndedRef.current) {
      lastEndedRef.current = true;
      const isLast = session.drillIndex >= template.drills.length - 1;
      if (isLast) {
        speech.enqueue('训练完成，大家辛苦了！');
        if (activeRecordId) {
          const record = records.find((r) => r.id === activeRecordId);
          if (record && record.status !== 'completed') {
            toggleRecordStatus(activeRecordId);
          }
        }
      } else {
        const next = template.drills[session.drillIndex + 1];
        speech.enqueue(`${drill.title} 完成，准备进入 ${next?.title ?? '下一环节'}`);
      }
      beep({ enabled: settings.soundEnabled, frequency: 880, durationMs: 220 });
      window.setTimeout(() => {
        speech.clear();
        nextDrillRef.current();
      }, 1800);
    }
  }, [session, drill, template, speech, beep, settings.soundEnabled]);

  // Remove auto-start — training only begins when user clicks the start button.
  // Existing session state (paused / finished) is restored as-is.

  if (!template) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="text-theme-text-muted">还没有选中训练模板</div>
        <button
          onClick={onBack}
          className="rounded-xl bg-theme-accent text-white px-4 py-2 text-sm font-medium hover:bg-theme-accent-hover"
        >
          去计划页选择
        </button>
      </div>
    );
  }

  if (session.status === 'idle' || !drill) {
    const totalSeconds = template ? template.drills.reduce((a, d) => a + d.duration, 0) : 0;
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-6 p-6 text-center">
        <div className="w-full max-w-sm rounded-3xl border border-theme-border bg-theme-bg-card-light p-6">
          <div className="text-xs uppercase tracking-widest text-theme-accent">
            训练计时
          </div>
          <div className="mt-2 text-2xl font-bold text-theme-text">
            {template?.name ?? '未选择模板'}
          </div>
          {template && (
            <div className="mt-2 flex items-center justify-center gap-2 text-sm text-theme-text-muted">
              <span>{template.drills.length} 个环节</span>
              <span>·</span>
              <span>总时长 {formatDuration(totalSeconds)}</span>
            </div>
          )}
          {template?.description && (
            <p className="mt-2 text-xs text-theme-text-muted">{template.description}</p>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 text-theme-text-muted">
          <div className="text-sm">准备好了吗？</div>
          <div className="text-xs">点击下方按钮开始训练</div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onBack}
            className="rounded-xl border border-theme-border bg-theme-bg-card px-5 py-3 text-sm text-theme-text-secondary hover:bg-theme-bg-card"
          >
            返回
          </button>
          <button
            onClick={() => {
              startSessionRef.current(template!.id, 0);
            }}
            disabled={!template}
            className="rounded-xl bg-theme-accent text-white px-6 py-3 text-sm font-semibold hover:bg-theme-accent-hover disabled:opacity-50"
          >
            开始训练
          </button>
        </div>
      </div>
    );
  }

  const isLast = session.drillIndex >= template.drills.length - 1 && session.status === 'finished';
  const progress = drill.duration === 0 ? 0 : 1 - session.remaining / drill.duration;
  const totalDrills = template.drills.length;

  return (
    <div className="relative mx-auto w-full max-w-2xl pb-28 pt-14">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onBack}
          className="rounded-lg bg-theme-bg-card px-3 py-1.5 text-sm text-theme-text-secondary hover:bg-theme-bg-card"
        >
          返回
        </button>
        <div className="text-sm text-theme-text-muted">
          {session.drillIndex + 1} / {totalDrills}
        </div>
        {/* 静音按钮在 header 右侧，避开 UserMenu */}
        <button
          onClick={() => {
            setMuted((m) => !m);
          }}
          className="rounded-lg bg-theme-bg-card p-2 text-theme-text-secondary hover:bg-theme-bg-card"
          aria-label="静音切换"
          title={effectiveSpeechEnabled ? '静音' : '取消静音'}
        >
          {effectiveSpeechEnabled ? (
            <Volume2 className="h-4 w-4" />
          ) : (
            <VolumeX className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="px-4">
        <div className="mb-2 text-center text-xs uppercase tracking-widest text-theme-accent">
          当前环节
        </div>
        <h1 className="text-center text-3xl font-bold text-theme-text">{drill.title}</h1>
        {drill.summary && (
          <p className="mt-1 text-center text-sm text-theme-text-muted">{drill.summary}</p>
        )}
      </div>

      {/* Big Timer */}
      <div className="relative mx-auto my-6 flex h-72 w-72 items-center justify-center">
        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="3"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={isLast ? '#10b981' : '#34d399'}
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 45}`}
            strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress)}`}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.4s linear' }}
          />
        </svg>
        <div className="flex flex-col items-center">
          <div
            className={cn(
              'font-mono text-6xl font-bold tabular-nums',
              session.remaining <= 5 ? 'text-red-400' : 'text-theme-text'
            )}
          >
            {formatDuration(session.remaining)}
          </div>
          <div className="mt-2 text-xs text-theme-text-muted">
            {session.status === 'running'
              ? '进行中'
              : session.status === 'paused'
                ? '已暂停'
                : session.status === 'ready'
                  ? '待开始'
                  : session.status === 'finished'
                    ? '已完成'
                    : ''}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mx-auto flex max-w-md items-center justify-center gap-3 px-4">
        <button
          onClick={() => { speech.clear(); prevDrillRef.current(); }}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-theme-border text-theme-text-secondary hover:bg-theme-bg-card"
          aria-label="上一个环节"
        >
          <SkipBack className="h-5 w-5" />
        </button>
        <button
          onClick={() => {
            if (session.status === 'running') {
              speech.pause();
              pauseSession();
            } else if (session.status === 'paused') {
              resumeSession();
              speech.resume();
            } else if (session.status === 'finished') {
              speech.clear();
              nextDrillRef.current();
            }
          }}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-theme-accent text-white shadow-lg shadow-theme-accent/30 hover:bg-theme-accent-hover"
        >
          {session.status === 'running' ? (
            <Pause className="h-8 w-8" />
          ) : (
            <Play className="h-8 w-8 translate-x-0.5" />
          )}
        </button>
        <button
          onClick={() => { speech.clear(); nextDrillRef.current(); }}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-theme-border text-theme-text-secondary hover:bg-theme-bg-card"
          aria-label="下一个环节"
        >
          <SkipForward className="h-5 w-5" />
        </button>
      </div>

      {/* Cues */}
      {drill.cues.length > 0 && (
        <div className="mx-auto mt-6 max-w-2xl px-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
            训练要点
          </div>
          <div className="space-y-2 rounded-2xl bg-theme-bg-card-muted p-3">
            {drill.cues.map((c, idx) => (
            <div
              key={c.id}
              className={cn(
                'rounded-xl border px-3 py-2 text-sm',
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
        </div>
      )}

      {isLast && (
        <div className="mx-auto mt-6 max-w-2xl px-4">
          <div className="rounded-2xl border border-theme-accent/30 bg-theme-accent-light p-6 text-center">
            <Trophy className="mx-auto mb-3 h-10 w-10 text-theme-text-secondary" />
            <div className="text-lg font-semibold text-theme-text">训练完成！</div>
            <button
              onClick={() => {
                if (recordIdRef.current && session.startedAt) {
                  const duration = Date.now() - session.startedAt;
                  updateRecord(recordIdRef.current, {
                    status: 'completed',
                    endTime: Date.now(),
                    durationSeconds: Math.round(duration / 1000),
                    completedDrills: template!.drills.length,
                  });
                }
                speech.clear();
                resetSession();
                if (onBack) onBack();
              }}
              className="mt-4 rounded-xl bg-theme-accent text-white px-4 py-2 text-sm font-medium hover:bg-theme-accent-hover"
            >
              返回计划页
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto mt-6 max-w-2xl px-4">
        <button
          onClick={() => {
            speech.clear();
            resetSession();
            if (onBack) onBack();
          }}
          className="mx-auto flex items-center gap-1.5 text-xs text-theme-text-muted hover:text-theme-text-secondary"
        >
          <RotateCcw className="h-3 w-3" />
          重置训练
        </button>
      </div>
    </div>
  );
}
