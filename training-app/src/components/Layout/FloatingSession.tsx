import { useState, useEffect, useMemo, useRef } from 'react';
import { useTrainingStore } from '@/store/trainingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useSpeech } from '@/hooks/useSpeech';
import { useBeep } from '@/hooks/useBeep';
import { useWakeLock } from '@/hooks/useWakeLock';
import { formatDuration } from '@/utils/duration';
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  Volume2,
  VolumeX,
  Trophy,
  X,
  Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function FloatingSession() {
  const [open, setOpen] = useState(false);
  const session = useTrainingStore((s) => s.session);
  const records = useTrainingStore((s) => s.records);
  const activeRecordId = useTrainingStore((s) => s.activeRecordId);
  const activePlanId = useTrainingStore((s) => s.activePlanId);
  const activeTemplateId = useTrainingStore((s) => s.activeTemplateId);
  const templates = useTrainingStore((s) => s.templates);
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
    if (activeRecordId) {
      const activeRecord = records.find((r) => r.id === activeRecordId);
      if (activeRecord) {
        const tpl = templates.find((t) => t.id === activeRecord.templateId);
        if (tpl) return tpl;
      }
    }
    return templates.find((t) => t.id === activeTemplateId) ?? null;
  }, [templates, activeTemplateId, activeRecordId, records]);

  const drill = template?.drills[session.drillIndex] ?? null;

  useEffect(() => {
    if (muted) {
      speech.clear();
    } else if (session.status === 'running' && drill) {
      try { window.speechSynthesis?.resume(); } catch { /* noop */ }
    }
  }, [muted, speech, session.status, drill]);

  useEffect(() => {
    if (!speech.supported) {
      console.warn('[speech] 当前浏览器不支持 Web Speech API，语音播报不可用。');
    }
  }, [speech.supported]);

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
      const existingRecord = records.find(
        r => r.templateId === template.id && r.status === 'in_progress'
      );
      if (existingRecord) {
        recordIdRef.current = existingRecord.id;
        return;
      }
      if (!recordIdRef.current) {
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
        recordIdPromise.then((id) => {
          recordIdRef.current = id;
        });
      }
    }
  }, [session.status, session.startedAt, template, activeRecordId, addRecord, updateRecord, records]);

  useEffect(() => {
    if (session.status !== 'running') return;
    const id = window.setInterval(() => {
      tickRef.current(Date.now());
    }, 250);
    return () => window.clearInterval(id);
  }, [session.status, session.drillIndex]);

  useEffect(() => {
    if (session.status === 'paused') {
      speech.pause();
    } else if (session.status === 'running') {
      speech.resume();
    } else if (session.status === 'idle') {
      speech.clear();
    }
  }, [session.status]);

  useEffect(() => {
    if (!template || !drill) return;

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

      if (!firedOneMinLeftRef.current && remainingInt <= 60 && remainingInt > 5) {
        firedOneMinLeftRef.current = true;
        speech.enqueue('还剩一分钟');
      }

      drill.cues
        .filter((c) => c.trigger === 'interval' && c.seconds)
        .forEach((c) => {
          const key = `interval:${c.id}`;
          if (c.seconds && elapsed >= c.seconds && !firedCueKeysRef.current.has(key)) {
            firedCueKeysRef.current.add(key);
            speech.enqueue(c.text);
          }
        });

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

  const isLast = session.status === 'finished' && session.drillIndex >= (template?.drills.length ?? 0) - 1;
  const progress = !drill || drill.duration === 0 ? 0 : 1 - session.remaining / drill.duration;
  const totalDrills = template?.drills.length ?? 0;

  return (
    <>
      {/* Floating button - only show when there's something to train */}
      {template && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'fixed bottom-20 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full px-5 py-3 shadow-lg transition-all hover:scale-105',
            session.status === 'running'
              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/30'
              : session.status === 'paused'
                ? 'bg-amber-500 text-slate-950 shadow-amber-500/30'
                : 'bg-slate-800 text-slate-200 shadow-slate-900/50 border border-slate-700'
          )}
        >
          <Timer className="h-5 w-5" />
          {session.status === 'running' ? (
            <span className="font-mono text-sm font-bold tabular-nums">
              {formatDuration(session.remaining)}
            </span>
          ) : session.status === 'paused' ? (
            <span className="text-sm font-medium">已暂停</span>
          ) : (
            <span className="text-sm font-medium">开始训练</span>
          )}
        </button>
      )}

      {/* Panel overlay */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col">
          {/* Backdrop */}
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-2xl">
            {/* Panel header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/5 bg-slate-950/80 px-4 py-3 backdrop-blur">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">
                  {activeRecordId
                    ? records.find(r => r.id === activeRecordId)?.title ?? template?.name
                    : template?.name ?? '训练详情'}
                </div>
                {session.startedAt && (
                  <div className="mt-0.5 text-xs text-slate-400">
                    开始于 {new Date(session.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpen(false)}
                className="ml-3 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Panel content */}
            <div className="p-4 pb-28">
              {!template || session.status === 'idle' || !drill ? (
                <div className="flex flex-col items-center gap-6 py-12 text-center">
                  <div className="w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/60 p-6">
                    <div className="text-xs uppercase tracking-widest text-emerald-400">
                      训练计时
                    </div>
                    <div className="mt-2 text-2xl font-bold text-white">
                      {template?.name ?? '未选择模板'}
                    </div>
                    {template && (
                      <div className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-400">
                        <span>{template.drills.length} 个环节</span>
                        <span>·</span>
                        <span>总时长 {formatDuration(template.drills.reduce((a, d) => a + d.duration, 0))}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      if (template) startSessionRef.current(template.id, 0);
                    }}
                    disabled={!template}
                    className="rounded-xl bg-emerald-500 px-8 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    开始训练
                  </button>
                </div>
              ) : (
                <>
                  {/* Drill info */}
                  <div className="mb-4 text-center">
                    <div className="text-xs uppercase tracking-widest text-emerald-400">
                      当前环节 {session.drillIndex + 1} / {totalDrills}
                    </div>
                    <h2 className="mt-1 text-2xl font-bold text-white">{drill.title}</h2>
                    {drill.summary && (
                      <p className="mt-1 text-sm text-slate-400">{drill.summary}</p>
                    )}
                  </div>

                  {/* Timer circle */}
                  <div className="relative mx-auto my-4 flex h-56 w-56 items-center justify-center">
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle
                        cx="50" cy="50" r="45" fill="none"
                        stroke={isLast ? '#10b981' : '#34d399'}
                        strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 45}`}
                        strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress)}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.4s linear' }}
                      />
                    </svg>
                    <div className="flex flex-col items-center">
                      <div className={cn('font-mono text-5xl font-bold tabular-nums', session.remaining <= 5 ? 'text-red-400' : 'text-white')}>
                        {formatDuration(session.remaining)}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {session.status === 'running' ? '进行中' : session.status === 'paused' ? '已暂停' : '已完成'}
                      </div>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="mx-auto flex max-w-md items-center justify-center gap-3">
                    <button
                      onClick={() => { speech.clear(); prevDrillRef.current(); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800"
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
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/30 hover:bg-emerald-400"
                    >
                      {session.status === 'running' ? (
                        <Pause className="h-7 w-7" />
                      ) : (
                        <Play className="h-7 w-7 translate-x-0.5" />
                      )}
                    </button>
                    <button
                      onClick={() => { speech.clear(); nextDrillRef.current(); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      <SkipForward className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Mute toggle */}
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={() => setMuted((m) => !m)}
                      className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800"
                    >
                      {effectiveSpeechEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                      {effectiveSpeechEnabled ? '语音播报中' : '已静音'}
                    </button>
                  </div>

                  {/* Cues */}
                  <div className="mt-6">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">
                      教学话术
                    </div>
                    <div className="max-h-48 space-y-2 overflow-y-auto rounded-2xl bg-slate-900/70 p-3">
                      {drill.cues.length === 0 && (
                        <div className="p-4 text-center text-sm text-slate-500">暂无话术</div>
                      )}
                      {drill.cues.map((c, idx) => (
                        <div
                          key={c.id}
                          className={cn(
                            'rounded-xl border px-3 py-2 text-sm',
                            c.trigger === 'start'
                              ? 'border-emerald-500/30 bg-emerald-500/5 text-slate-200'
                              : 'border-slate-800 bg-slate-950/40 text-slate-300'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span className="mt-0.5 text-xs text-slate-500">#{idx + 1}</span>
                            <p className="flex-1 leading-relaxed">{c.text}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Completion */}
                  {isLast && (
                    <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
                      <Trophy className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
                      <div className="text-lg font-semibold text-white">训练完成！</div>
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
                          recordIdRef.current = null;
                        }}
                        className="mt-4 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
                      >
                        结束训练
                      </button>
                    </div>
                  )}

                  {/* Reset */}
                  <div className="mt-6 flex justify-center">
                    <button
                      onClick={() => {
                        speech.clear();
                        resetSession();
                        recordIdRef.current = null;
                      }}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300"
                    >
                      <RotateCcw className="h-3 w-3" />
                      重置训练
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
