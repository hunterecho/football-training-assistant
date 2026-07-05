import { useState, useEffect, useMemo, useRef } from 'react';
import { useTrainingStore } from '@/store/trainingStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useSpeech } from '@/hooks/useSpeech';
import { useBeep } from '@/hooks/useBeep';
import { useWakeLock } from '@/hooks/useWakeLock';
import { formatDuration, formatDurationChinese } from '@/utils/duration';
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
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const sessionPanelOpen = useTrainingStore((s) => s.sessionPanelOpen);
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
  const cancelSession = useTrainingStore((s) => s.cancelSession);
  const resetCurrentDrill = useTrainingStore((s) => s.resetCurrentDrill);
  const addRecord = useTrainingStore((s) => s.addRecord);
  const updateRecord = useTrainingStore((s) => s.updateRecord);
  const toggleRecordStatus = useTrainingStore((s) => s.toggleRecordStatus);
  const setSessionPanelOpen = useTrainingStore((s) => s.setSessionPanelOpen);

  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.update);
  const [onlyTimerMode, setOnlyTimerMode] = useState(() => {
    const saved = localStorage.getItem('training_onlyTimerMode');
    return saved ? JSON.parse(saved) : false;
  });
  const effectiveSpeechEnabled = settings.speechEnabled;
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
    if (!settings.speechEnabled) {
      speech.clear();
    } else if (session.status === 'running' && drill) {
      try { window.speechSynthesis?.resume(); } catch { /* noop */ }
    }
  }, [settings.speechEnabled, speech, session.status, drill]);

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
      const currentUserId = useAuthStore.getState().user?.id;
      
      if (activeRecordId) {
        const existingRecord = records.find(r => r.id === activeRecordId);
        if (existingRecord) {
          recordIdRef.current = activeRecordId;
          if (existingRecord.status !== 'in_progress') {
            updateRecord(activeRecordId, {
              status: 'in_progress',
              startTime: session.startedAt,
              durationSeconds: 0,
              totalDrills: template.drills.length,
              completedDrills: session.drillIndex,
            });
          }
          return;
        }
      }
      
      const existingRecord = records.find(
        r => r.templateId === template.id && r.status === 'in_progress' && r.userId === currentUserId
      );
      if (existingRecord) {
        recordIdRef.current = existingRecord.id;
        return;
      }
    }
  }, [session.status, session.startedAt, template, activeRecordId, records, updateRecord]);

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
    } else if (session.status === 'idle' || session.status === 'ready') {
      speech.clear();
    }
  }, [session.status]);

  useEffect(() => {
    if (session.status === 'idle') {
      setOpen(false);
    }
  }, [session.status]);

  useEffect(() => {
    if (session.status === 'running' || session.status === 'paused') {
      setOpen(true);
      setSessionPanelOpen(true);
    }
  }, [session.status, session.templateId]);

  useEffect(() => {
    if (sessionPanelOpen && (session.status === 'running' || session.status === 'paused' || session.status === 'finished')) {
      setOpen(true);
    }
  }, [sessionPanelOpen]);

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
      const intro = `现在开始 ${drill.title}，时长 ${formatDurationChinese(drill.duration)}`;
      speech.enqueue(intro);
      beep({ enabled: settings.soundEnabled, frequency: 880, durationMs: 160 });
      if (!onlyTimerMode) {
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
        speech.enqueue(`已过 ${elapsedMinutes} 分钟，还剩 ${formatDurationChinese(left)}`);
      }

      if (!firedOneMinLeftRef.current && remainingInt <= 60 && remainingInt > 5) {
        firedOneMinLeftRef.current = true;
        speech.enqueue('还剩一分钟');
      }

      if (!onlyTimerMode) {
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
      {/* Floating button - only show when training is active */}
      {template && session.status !== 'idle' && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'fixed bottom-20 left-1/2 z-50 -translate-x-1/2 flex items-center gap-2 rounded-full px-5 py-3 shadow-lg transition-all hover:scale-105',
            session.status === 'running'
              ? 'bg-theme-accent text-white shadow-theme-accent/30'
              : session.status === 'paused'
                ? 'bg-theme-warning text-white shadow-theme-warning/30'
                : 'bg-sky-500 text-white shadow-sky-500/30'
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
            <span className="text-sm font-medium">训练中</span>
          )}
        </button>
      )}

      {/* Panel overlay */}
      {open && (
        <div className="fixed inset-0 z-[60] flex flex-col">
          {/* Backdrop */}
          <div className="flex-1 bg-black/60 backdrop-blur-sm" onClick={() => { setOpen(false); setSessionPanelOpen(false); }} />

          {/* Panel */}
          <div className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white shadow-2xl">
            {/* Panel header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-theme-border bg-white px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-theme-text">
                  {activeRecordId
                    ? records.find(r => r.id === activeRecordId)?.title ?? template?.name
                    : template?.name ?? '训练详情'}
                </div>
                {session.startedAt && (
                  <div className="mt-0.5 text-xs text-theme-text-muted">
                    开始于 {new Date(session.startedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setOpen(false); setSessionPanelOpen(false); }}
                className="ml-3 shrink-0 rounded-lg p-1.5 text-theme-text-muted hover:bg-theme-bg-card hover:text-theme-text-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Panel content */}
            <div className="p-4 pb-28">
              {!template || session.status === 'idle' || !drill ? (
                <div className="flex flex-col items-center gap-6 py-12 text-center">
                  <div className="w-full max-w-sm rounded-3xl border border-theme-border bg-white p-6">
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
                        <span>总时长 {formatDuration(template.drills.reduce((a, d) => a + d.duration, 0))}</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={async () => {
                      if (!template) return;
                      
                      if (!activeRecordId) {
                        const newRecordIdPromise = addRecord({
                          planId: activePlanId ?? undefined,
                          templateId: template.id,
                          userId: useAuthStore.getState().user?.id ?? 'unknown',
                          title: template.name,
                          status: 'in_progress',
                          startTime: Date.now(),
                          totalDrills: template.drills.length,
                          completedDrills: 0,
                        });
                        const newRecordId = await newRecordIdPromise;
                        if (newRecordId) {
                          useTrainingStore.getState().setActiveRecord(newRecordId);
                          recordIdRef.current = newRecordId;
                        }
                      }
                      
                      startSessionRef.current(template.id, 0);
                    }}
                    disabled={!template}
                    className="rounded-xl bg-theme-accent text-white px-8 py-3 text-sm font-semibold hover:bg-theme-accent-hover disabled:opacity-50"
                  >
                    开始训练
                  </button>
                </div>
              ) : (
                <>
                  {/* Drill info */}
                  <div className="mb-4 text-center">
                    <div className="text-xs uppercase tracking-widest text-theme-accent">
                      当前环节 {session.drillIndex + 1} / {totalDrills}
                    </div>
                    <h2 className="mt-1 text-2xl font-bold text-theme-text">{drill.title}</h2>
                    {drill.summary && (
                      <p className="mt-1 text-sm text-theme-text-muted">{drill.summary}</p>
                    )}
                  </div>

                  {/* Timer circle */}
                  <div className="relative mx-auto my-4 flex h-56 w-56 items-center justify-center">
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle
                        cx="50" cy="50" r="45" fill="none"
                        stroke="var(--color-accent)"
                        strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 45}`}
                        strokeDashoffset={`${2 * Math.PI * 45 * (1 - progress)}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.4s linear' }}
                      />
                    </svg>
                    <div className="flex flex-col items-center">
                      <div className={cn('font-mono text-5xl font-bold tabular-nums', session.remaining <= 5 ? 'text-red-400' : 'text-theme-text')}>
                        {formatDuration(session.remaining)}
                      </div>
                      <div className="mt-1 text-xs text-theme-text-muted">
                        {session.status === 'running' ? '进行中' : session.status === 'paused' ? '已暂停' : session.status === 'ready' ? '待开始' : '已完成'}
                      </div>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="mx-auto flex max-w-md items-center justify-center gap-3">
                    <button
                      onClick={() => { speech.clear(); prevDrillRef.current(); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-theme-border text-theme-text-secondary hover:bg-theme-bg-card"
                    >
                      <SkipBack className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {
                        if (session.status === 'running') {
                          speech.pause();
                          pauseSession();
                        } else if (session.status === 'paused' || session.status === 'ready') {
                          resumeSession();
                          speech.resume();
                        } else if (session.status === 'finished') {
                          speech.clear();
                          nextDrillRef.current();
                        }
                      }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-theme-accent text-white shadow-lg shadow-theme-accent/30 hover:bg-theme-accent-hover"
                    >
                      {session.status === 'running' ? (
                        <Pause className="h-7 w-7" />
                      ) : (
                        <Play className="h-7 w-7 translate-x-0.5" />
                      )}
                    </button>
                    <button
                      onClick={() => { speech.clear(); nextDrillRef.current(); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-theme-border text-theme-text-secondary hover:bg-theme-bg-card"
                    >
                      <SkipForward className="h-5 w-5" />
                    </button>
                  </div>

                  {/* Mute toggle & Only timer mode */}
                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => updateSettings({ speechEnabled: !settings.speechEnabled })}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors',
                        settings.speechEnabled
                          ? 'bg-theme-accent/10 text-theme-accent'
                          : 'bg-theme-bg-card text-theme-text-muted'
                      )}
                    >
                      {settings.speechEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                      {settings.speechEnabled ? '语音播报' : '已静音'}
                    </button>
                    <button
                      onClick={() => setOnlyTimerMode((m) => {
                        const newValue = !m;
                        localStorage.setItem('training_onlyTimerMode', JSON.stringify(newValue));
                        return newValue;
                      })}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors',
                        onlyTimerMode
                          ? 'bg-theme-accent/10 text-theme-accent'
                          : 'bg-theme-bg-card text-theme-text-muted'
                      )}
                    >
                      <Timer className="h-3.5 w-3.5" />
                      {onlyTimerMode ? '仅播放计时' : '播放要点'}
                    </button>
                  </div>

                  {/* Cues */}
                  {drill.cues.length > 0 && (
                    <div className="mt-6">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-theme-text-muted">
                        训练要点
                      </div>
                      <div className="space-y-2 rounded-2xl bg-theme-bg-card-subtle p-3">
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

                  {/* Completion */}
                  {isLast && (
                    <div className="mt-6 rounded-2xl border border-theme-accent/30 bg-theme-accent-light p-6 text-center">
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
                          recordIdRef.current = null;
                        }}
                        className="mt-4 rounded-xl bg-theme-accent text-white px-4 py-2 text-sm font-medium hover:bg-theme-accent-hover"
                      >
                        结束训练
                      </button>
                    </div>
                  )}

                  {/* Reset & Cancel */}
                  <div className="mt-6 flex justify-center gap-4">
                    <button
                      onClick={() => {
                        speech.clear();
                        resetCurrentDrill();
                      }}
                      className="flex items-center gap-1.5 text-xs text-theme-text-muted hover:text-theme-text-secondary"
                    >
                      <RotateCcw className="h-3 w-3" />
                      重置当前环节
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="flex items-center gap-1.5 text-xs text-theme-danger hover:text-theme-danger"
                    >
                      <X className="h-3 w-3" />
                      取消训练
                    </button>
                  </div>

                  {/* Cancel Confirmation Modal */}
                  {showCancelConfirm && (
                    <div className="mt-6 rounded-2xl border border-theme-danger/30 bg-theme-danger/10 p-4">
                      <div className="text-sm text-theme-danger mb-3">
                        确定要取消这次训练吗？训练记录将被删除。
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 rounded-lg border border-theme-border bg-theme-bg-card px-4 py-2 text-sm text-theme-text-secondary hover:bg-theme-bg-card"
                        >
                          保留训练
                        </button>
                        <button
                          onClick={() => {
                            speech.clear();
                            cancelSession();
                            recordIdRef.current = null;
                            setShowCancelConfirm(false);
                            setOpen(false);
                          }}
                          className="flex-1 rounded-lg bg-theme-danger px-4 py-2 text-sm font-medium text-white hover:bg-theme-danger"
                        >
                          取消训练
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
