import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatDuration, formatTime, formatDurationChinese } from '@/utils/duration';
import { useSpeech } from '@/hooks/useSpeech';
import { useAuthStore } from '@/store/authStore';
import { useTrainingStore } from '@/store/trainingStore';
import type { Template, TrainingPlan, SessionState, TrainingRecord, CueTrigger, RecordStatus } from '@/types';
import { api } from '@/lib/api';
import { Clock, Users, RotateCcw, X, LogOut, UserCircle, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, ChevronDown, ChevronUp, Home, Timer } from 'lucide-react';
import { cn } from '@/lib/utils';

const initialSession: SessionState = {
  templateId: null,
  drillIndex: 0,
  remaining: 0,
  status: 'idle',
  previousStatus: null,
  startedAt: null,
  lastTickTs: null,
  drillStartedAt: null,
  restDuration: 0,
  restRemaining: 0,
};

const mapPlanFromServer = (p: { id: string; template_id?: string; title: string; date: string; status?: string; note?: string; drills?: unknown[]; sharer_name?: string; source_plan_id?: string; user_id?: string; created_at?: string; completed_at?: string }): TrainingPlan => ({
  id: p.id,
  templateId: p.template_id,
  title: p.title,
  date: p.date,
  status: (p.status ?? 'planned') as 'planned' | 'completed' | 'skipped' | 'terminated',
  note: p.note,
  createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
  completedAt: p.completed_at ? new Date(p.completed_at).getTime() : undefined,
});

const mapTemplateFromServer = (t: { id: string; name: string; description?: string; drills?: { id?: string; title?: string; duration?: number; summary?: string; cues?: { id?: string; text?: string; trigger?: string; seconds?: number }[] }[]; created_at?: string }): Template => ({
  id: t.id,
  name: t.name,
  description: t.description,
  drills: (t.drills ?? []).map((d) => ({
    id: d.id ?? '',
    title: d.title ?? '',
    duration: d.duration ?? 0,
    summary: d.summary ?? '',
    cues: (d.cues ?? []).map((c) => ({
      id: c.id ?? '',
      text: c.text ?? '',
      trigger: (c.trigger ?? 'start') as CueTrigger,
      seconds: c.seconds,
    })),
  })),
  createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
});

const mapRecordFromServer = (r: { id: string; user_id: string; plan_id: string; template_id?: string; title: string; status: RecordStatus; start_time?: string; end_time?: string; duration_seconds?: number; completed_drills?: number; total_drills?: number; note?: string; created_at?: string; completed_at?: string; executor?: { id: string; nickname: string; avatar: string | null }; rest_duration?: number }): TrainingRecord => ({
  id: r.id,
  userId: r.user_id,
  planId: r.plan_id,
  templateId: r.template_id,
  title: r.title,
  status: r.status,
  startTime: r.start_time ? new Date(r.start_time).getTime() : undefined,
  endTime: r.end_time ? new Date(r.end_time).getTime() : undefined,
  durationSeconds: r.duration_seconds,
  completedDrills: r.completed_drills,
  totalDrills: r.total_drills,
  note: r.note,
  createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
  completedAt: r.completed_at ? new Date(r.completed_at).getTime() : undefined,
  restDuration: r.rest_duration,
  executor: r.executor ? {
    id: r.executor.id,
    nickname: r.executor.nickname,
    avatar: r.executor.avatar,
  } : undefined,
});

const fmtDateTime = (ts?: number) => {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getMonth() + 1}-${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function ShareDetail() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [terminated, setTerminated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState>(initialSession);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [userRecords, setUserRecords] = useState<TrainingRecord[]>([]);
  const [completedDrillsCount, setCompletedDrillsCount] = useState(0);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [sharerName, setSharerName] = useState('');
  const [showRestSettings, setShowRestSettings] = useState(false);
  const [customRestDuration, setCustomRestDuration] = useState(0);
  const [showRestModal, setShowRestModal] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [open, setOpen] = useState(true);
  
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const resetSession = useTrainingStore((s) => s.resetSession);
  
  const { enqueue, stop, clear, speaking, resume, pause } = useSpeech({ enabled: speechEnabled });

  const firedCueKeysRef = useRef<Set<string>>(new Set());
  const firedMinuteKeysRef = useRef<Set<string>>(new Set());
  const firedOneMinLeftRef = useRef<boolean>(false);
  const startedDrillRef = useRef<string>('');
  const prevDrillIndexRef = useRef<number>(session.drillIndex);
  const recordIdRef = useRef<string | null>(null);
  const firedIntroRef = useRef<boolean>(false);
  const firedRestStartRef = useRef<boolean>(false);
  const firedRestEndRef = useRef<boolean>(false);
  const lastRestSecRef = useRef<number>(0);
  const lastEndedRef = useRef<boolean>(false);
  const lastFiveSecRef = useRef<number>(0);

  useEffect(() => {
    if (!planId) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }
    
    const fetchData = async () => {
      try {
        const [shareRes, recordsRes] = await Promise.all([
          api.get<{ plan: unknown; template: unknown; terminated?: boolean; sharerName?: string }>(`/records/share/${planId}`).catch(() => null),
          token ? api.get<{ records: unknown[] }>(`/records/by-plan/${planId}`).catch(() => null) : Promise.resolve(null),
        ]);
        
        if (shareRes?.data) {
          setPlan(mapPlanFromServer(shareRes.data.plan));
          setTemplate(mapTemplateFromServer(shareRes.data.template));
          setTerminated(!!shareRes.data.terminated);
          setSharerName(shareRes.data.sharerName || '');
        } else {
          setError('分享内容不存在');
        }
        
        if (recordsRes?.data?.records) {
          const records = recordsRes.data.records.map(mapRecordFromServer);
          setUserRecords(records);
          
          const inProgress = records.find(r => r.status === 'in_progress' && r.userId === user?.id);
          if (inProgress) {
            setCurrentRecordId(inProgress.id);
            const completed = inProgress.completedDrills ?? 0;
            setCompletedDrillsCount(completed);
          }
        }
      } catch {
        setError('无法获取分享内容');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [planId, token]);

  useEffect(() => {
    if (!template || !userRecords.length || session.status !== 'idle') return;
    
    const inProgress = userRecords.find(r => r.status === 'in_progress' && r.userId === user?.id);
    if (inProgress) {
      const completed = inProgress.completedDrills ?? 0;
      const drillIndex = completed;
      const drill = template.drills[drillIndex];
      const restDuration = inProgress.restDuration ?? (customRestDuration > 0 ? customRestDuration : 0);
      if (drill) {
        setCurrentRecordId(inProgress.id);
        setCompletedDrillsCount(completed);
        setCustomRestDuration(restDuration);
        setSession({
          ...initialSession,
          templateId: template.id,
          drillIndex,
          remaining: drill.duration,
          status: 'paused',
          startedAt: inProgress.startTime ? new Date(inProgress.startTime).getTime() : Date.now(),
          lastTickTs: null,
          drillStartedAt: Date.now(),
          restDuration,
          restRemaining: 0,
        });
      }
    }
  }, [template, userRecords, user, session.status, customRestDuration]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    if (session.status === 'running') {
      interval = setInterval(() => {
        setSession((s) => {
          if (s.status !== 'running') return s;
          const nowTs = Date.now();
          const lastTs = s.lastTickTs ?? nowTs;
          const deltaMs = Math.max(0, nowTs - lastTs);
          const deltaSec = deltaMs / 1000;
          const remaining = Math.max(0, s.remaining - deltaSec);
          if (remaining <= 0) {
            const current = getSessionState();
            const tpl = current.template;
            if (tpl && s.drillIndex < tpl.drills.length - 1) {
              const restDuration = s.restDuration > 0 ? s.restDuration : 0;
              return {
                ...s,
                remaining: 0,
                status: 'resting' as const,
                restRemaining: restDuration,
                lastTickTs: Date.now(),
              };
            }
            return { ...s, remaining: 0, status: 'finished' as const };
          }
          return { ...s, remaining, lastTickTs: nowTs };
        });
      }, 100);
    }
    
    if (session.status === 'resting') {
      interval = setInterval(() => {
        setSession((s) => {
          if (s.status !== 'resting') return s;
          const nowTs = Date.now();
          const lastTs = s.lastTickTs ?? nowTs;
          const deltaMs = Math.max(0, nowTs - lastTs);
          const deltaSec = deltaMs / 1000;
          const restRemaining = Math.max(0, s.restRemaining - deltaSec);
          if (restRemaining <= 0) {
            const current = getSessionState();
            const tpl = current.template;
            if (tpl && current.session.drillIndex < tpl.drills.length - 1) {
              const nextDrill = tpl.drills[current.session.drillIndex + 1];
              return {
                ...current.session,
                drillIndex: current.session.drillIndex + 1,
                remaining: nextDrill.duration,
                status: 'running' as const,
                restRemaining: 0,
                lastTickTs: Date.now(),
                drillStartedAt: Date.now(),
              };
            }
            return { ...s, restRemaining: 0, status: 'finished' as const };
          }
          return { ...s, restRemaining, lastTickTs: nowTs };
        });
      }, 100);
    }
    
    return () => clearInterval(interval);
  }, [session.status]);

  const getSessionState = () => {
    return { session, template };
  };

  useEffect(() => {
    if (!template) return;
    const drill = template.drills[session.drillIndex];
    if (!drill) return;

    if (prevDrillIndexRef.current !== session.drillIndex) {
      clear();
      prevDrillIndexRef.current = session.drillIndex;
    }

    const drillKey = `${template.id}:${session.drillIndex}`;
    if (startedDrillRef.current !== drillKey) {
      startedDrillRef.current = drillKey;
      firedCueKeysRef.current = new Set();
      firedMinuteKeysRef.current = new Set();
      firedOneMinLeftRef.current = false;
      lastEndedRef.current = false;
      firedIntroRef.current = false;
    }

    if (session.status === 'running' && session.remaining >= drill.duration - 0.05 && !firedIntroRef.current) {
      firedIntroRef.current = true;
      const intro = `现在开始 ${drill.title}，时长 ${formatDurationChinese(drill.duration)}`;
      enqueue(intro);
      
      drill.cues
        .filter((c) => c.trigger === 'start')
        .forEach((c) => {
          const key = `start:${c.id}`;
          if (!firedCueKeysRef.current.has(key)) {
            firedCueKeysRef.current.add(key);
            enqueue(c.text);
          }
        });
    }

    if (session.status === 'running' && session.remaining > 0) {
      const elapsed = drill.duration - session.remaining;

      drill.cues
        .filter((c) => c.trigger === 'interval' && c.seconds)
        .forEach((c) => {
          const key = `interval:${c.id}`;
          if (c.seconds && elapsed >= c.seconds && !firedCueKeysRef.current.has(key)) {
            firedCueKeysRef.current.add(key);
            enqueue(c.text);
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
            enqueue(c.text);
          } else if (elapsed >= c.seconds * 2 && !firedCueKeysRef.current.has(key2)) {
            firedCueKeysRef.current.add(key2);
            enqueue(c.text);
          }
        });
    }

    const remainingInt = Math.max(0, Math.ceil(session.remaining));

    if (session.status === 'running' && session.remaining > 0 && remainingInt <= 5 && remainingInt !== lastFiveSecRef.current) {
      lastFiveSecRef.current = remainingInt;
      if (remainingInt > 0) {
        enqueue(`${remainingInt}`, 'high');
      }
    }

    if (session.status === 'finished' && !lastEndedRef.current) {
      lastEndedRef.current = true;
      enqueue('训练完成，大家辛苦了！');
      if (currentRecordId) {
        const record = userRecords.find((r) => r.id === currentRecordId);
        if (record && record.status !== 'completed') {
          const endTime = Date.now();
          const durationSeconds = session.startedAt ? Math.round((endTime - session.startedAt) / 1000) : 0;
          api.patch(`/records/${currentRecordId}`, {
            status: 'completed',
            end_time: new Date(endTime).toISOString(),
            duration_seconds: durationSeconds,
            completed_drills: template.drills.length,
            completed_at: new Date(endTime).toISOString(),
          }).then(() => {
            if (token) {
              api.get<{ records: unknown[] }>(`/records/by-plan/${planId}`).then((recordsRes) => {
                if (recordsRes?.data?.records) {
                  setUserRecords(recordsRes.data.records.map(mapRecordFromServer));
                }
              }).catch(() => {});
            }
          });
        }
      }
      
      firedCueKeysRef.current = new Set();
      firedMinuteKeysRef.current = new Set();
      firedOneMinLeftRef.current = false;
      firedIntroRef.current = false;
      firedRestStartRef.current = false;
      firedRestEndRef.current = false;
      lastFiveSecRef.current = 0;
      lastRestSecRef.current = 0;
      clear();
      resetSession();
    }

    if (session.status === 'resting' && session.restRemaining >= session.restDuration - 0.05 && !firedRestStartRef.current) {
      firedRestStartRef.current = true;
      const next = template.drills[session.drillIndex + 1];
      const restMsg = next ? `现在开始休息，准备下一个环节：${next.title}` : '现在开始休息';
      enqueue(restMsg);
    }

    if (session.status === 'resting' && session.restRemaining > 0) {
      const restRemainingInt = Math.max(0, Math.ceil(session.restRemaining));
      
      if (restRemainingInt === 10 && !firedRestEndRef.current) {
        firedRestEndRef.current = true;
        const next = template.drills[session.drillIndex + 1];
        const endMsg = next ? `休息即将结束，准备开始：${next.title}` : '休息即将结束';
        enqueue(endMsg);
      }

      if (restRemainingInt <= 5 && restRemainingInt !== lastRestSecRef.current) {
        lastRestSecRef.current = restRemainingInt;
        if (restRemainingInt > 0) {
          enqueue(`${restRemainingInt}`, 'high');
        }
      }
    }

    if (session.status !== 'resting') {
      firedRestStartRef.current = false;
      firedRestEndRef.current = false;
      lastRestSecRef.current = 0;
    }
  }, [session.status, session.drillIndex, session.remaining, session.restRemaining, template, enqueue, clear, currentRecordId]);

  useEffect(() => {
    if (session.status === 'paused') {
      pause();
    } else if (session.status === 'running' || session.status === 'resting') {
      resume();
    } else if (session.status === 'idle' || session.status === 'ready') {
      clear();
    }
  }, [session.status, pause, resume, clear]);

  const startRest = useCallback(() => {
    if (!template) return;
    const restDuration = customRestDuration > 0 ? customRestDuration : 0;
    if (restDuration <= 0) {
      nextDrill();
      return;
    }
    
    const newCompletedCount = session.drillIndex + 1;
    setCompletedDrillsCount(newCompletedCount);
    
    if (currentRecordId) {
      api.patch(`/records/${currentRecordId}`, {
        completed_drills: newCompletedCount,
      });
    }
    
    setSession((s) => ({
      ...s,
      status: 'resting',
      restDuration,
      restRemaining: restDuration,
      lastTickTs: Date.now(),
    }));
  }, [template, customRestDuration, session.drillIndex, currentRecordId]);

  const nextDrill = useCallback(() => {
    if (!template) return;
    const nextIndex = session.drillIndex + 1;
    if (nextIndex >= template.drills.length) return;
    
    const nextDrillData = template.drills[nextIndex];
    const newCompletedCount = session.drillIndex + 1;
    setCompletedDrillsCount(newCompletedCount);
    
    if (currentRecordId) {
      api.patch(`/records/${currentRecordId}`, {
        completed_drills: newCompletedCount,
      });
    }
    
    setSession({
      ...initialSession,
      templateId: template.id,
      drillIndex: nextIndex,
      remaining: nextDrillData.duration,
      status: 'running',
      startedAt: session.startedAt ?? Date.now(),
      lastTickTs: Date.now(),
      drillStartedAt: Date.now(),
      restDuration: customRestDuration > 0 ? customRestDuration : 0,
      restRemaining: 0,
    });
  }, [template, session.drillIndex, session.startedAt, currentRecordId]);

  const prevDrill = useCallback(() => {
    if (!template) return;
    const prevIndex = session.drillIndex - 1;
    if (prevIndex < 0) return;
    
    const prevDrillData = template.drills[prevIndex];
    setSession({
      ...initialSession,
      templateId: template.id,
      drillIndex: prevIndex,
      remaining: prevDrillData.duration,
      status: 'running',
      startedAt: session.startedAt ?? Date.now(),
      lastTickTs: Date.now(),
      drillStartedAt: Date.now(),
      restDuration: customRestDuration > 0 ? customRestDuration : 0,
      restRemaining: 0,
    });
  }, [template, session.drillIndex, session.startedAt]);

  const createRecord = useCallback(async () => {
    if (!plan || !template || !user) return null;
    
    try {
      const res = await api.post<{ record: { id: string; user_id: string; plan_id: string; template_id?: string; title: string; status: RecordStatus; start_time?: string; end_time?: string; duration_seconds?: number; completed_drills?: number; total_drills?: number; note?: string; created_at?: string; completed_at?: string; executor?: { id: string; nickname: string; avatar: string | null }; rest_duration?: number } }>('/records', {
        plan_id: plan.id,
        template_id: template.id,
        title: plan.title,
        status: 'in_progress',
        start_time: new Date().toISOString(),
        total_drills: template.drills.length,
        completed_drills: 0,
        rest_duration: customRestDuration > 0 ? customRestDuration : 0,
      });
      
      if (res.data?.record) {
        const record = mapRecordFromServer(res.data.record);
        setUserRecords(prev => [record, ...prev]);
        return record.id;
      }
    } catch {
      console.warn('Failed to create record');
    }
    return null;
  }, [plan, template, user, customRestDuration]);

  const startSession = useCallback(async () => {
    if (!template) return;
    const drill = template.drills[session.drillIndex];
    if (!drill) return;
    
    const recordId = await createRecord();
    if (recordId) {
      setCurrentRecordId(recordId);
    }
    
    setCompletedDrillsCount(session.drillIndex);
    
    const drillKey = `${template.id}:${session.drillIndex}`;
    startedDrillRef.current = drillKey;
    firedCueKeysRef.current = new Set();
    firedMinuteKeysRef.current = new Set();
    firedOneMinLeftRef.current = false;
    firedIntroRef.current = false;
    
    const intro = `现在开始 ${drill.title}，时长 ${formatDurationChinese(drill.duration)}`;
    enqueue(intro);
    
    drill.cues
      .filter((c) => c.trigger === 'start')
      .forEach((c) => {
        const key = `start:${c.id}`;
        if (!firedCueKeysRef.current.has(key)) {
          firedCueKeysRef.current.add(key);
          enqueue(c.text);
        }
      });
    
    setSession({
      ...initialSession,
      templateId: template.id,
      drillIndex: session.drillIndex,
      remaining: drill.duration,
      status: 'running',
      startedAt: Date.now(),
      lastTickTs: Date.now(),
      drillStartedAt: Date.now(),
      restDuration: customRestDuration > 0 ? customRestDuration : 0,
      restRemaining: 0,
    });
  }, [template, createRecord, session.drillIndex, enqueue]);

  const pauseSession = useCallback(() => {
    setSession((s) => {
      if (s.status !== 'running' && s.status !== 'resting') return s;
      pause();
      return { ...s, status: 'paused', previousStatus: s.status };
    });
  }, [pause]);

  const resumeSession = useCallback(() => {
    setSession((s) => {
      if (s.status !== 'paused') return s;
      const resumeStatus = s.previousStatus ?? (s.restRemaining > 0 ? 'resting' : 'running');
      return { ...s, status: resumeStatus, previousStatus: null, lastTickTs: Date.now() };
    });
  }, []);

  const resetCurrentDrill = useCallback(() => {
    if (!template) return;
    stop();
    setSession((s) => {
      const drill = template.drills[s.drillIndex];
      if (!drill) return s;
      return {
        ...s,
        remaining: drill.duration,
        status: 'paused',
        drillStartedAt: Date.now(),
        lastTickTs: null,
      };
    });
  }, [template, stop]);

  const cancelTraining = useCallback(async () => {
    stop();
    if (currentRecordId) {
      await api.delete(`/records/${currentRecordId}`);
      setCurrentRecordId(null);
    }
    
    const [recordsRes] = await Promise.all([
      token ? api.get<{ records: unknown[] }>(`/records/by-plan/${planId}`).catch(() => null) : Promise.resolve(null),
    ]);
    if (recordsRes?.data?.records) {
      setUserRecords(recordsRes.data.records.map(mapRecordFromServer));
    }
    
    setSession({ ...initialSession, restDuration: customRestDuration > 0 ? customRestDuration : 0 });
    setCompletedDrillsCount(0);
    setShowCancelConfirm(false);
    prevDrillIndexRef.current = 0;
    startedDrillRef.current = '';
    firedCueKeysRef.current = new Set();
    firedMinuteKeysRef.current = new Set();
    firedOneMinLeftRef.current = false;
    firedIntroRef.current = false;
    firedRestStartRef.current = false;
    firedRestEndRef.current = false;
    lastRestSecRef.current = 0;
    lastEndedRef.current = false;
    lastFiveSecRef.current = 0;
  }, [currentRecordId, stop, token, planId, customRestDuration]);

  const skipToDrill = useCallback((index: number) => {
    if (!template) return;
    const drill = template.drills[index];
    if (!drill) return;
    if (session.status === 'running' || session.status === 'paused') return;
    stop();
    setSession({
      ...initialSession,
      templateId: template.id,
      drillIndex: index,
      remaining: drill.duration,
      status: 'idle' as const,
      startedAt: null,
      lastTickTs: null,
      drillStartedAt: null,
      restDuration: customRestDuration > 0 ? customRestDuration : 0,
      restRemaining: 0,
    });
  }, [template, stop]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: plan?.title || '训练计划',
        text: '来一起完成这个训练计划吧！',
        url: window.location.href,
      }).catch(() => {
        setShowShareToast(true);
        setTimeout(() => setShowShareToast(false), 2000);
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2000);
    }
  };

  const goHome = () => {
    navigate(`/?sharePlanId=${planId}`);
  };

  const totalDuration = template?.drills.reduce((acc, d) => acc + d.duration, 0) ?? 0;
  const inProgressRecord = userRecords.find(r => r.status === 'in_progress' && r.userId === user?.id);
  const isOwnInProgress = !!inProgressRecord && (session.status === 'paused' || session.status === 'idle');
  const sessionDrills = template?.drills ?? [];
  const drill = template?.drills[session.drillIndex];
  const progress = !drill || drill.duration === 0 ? 0 : 1 - session.remaining / drill.duration;
  const restProgress = session.restDuration === 0 ? 0 : 1 - session.restRemaining / session.restDuration;
  const nextDrillData = sessionDrills[session.drillIndex + 1];
  const totalDrills = sessionDrills.length;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-bg">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-theme-accent" />
      </div>
    );
  }

  if (error || !plan || !template) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-theme-bg">
        <div className="text-6xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-theme-text-secondary mb-2">分享链接无效</h1>
        <p className="text-theme-text-muted text-center">{error}</p>
      </div>
    );
  }

  if (terminated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-theme-bg">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-xl font-bold text-theme-text-secondary mb-2">该训练计划已终止</h1>
        <p className="text-theme-text-muted text-center">计划创建者已终止此训练计划，无法继续执行</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-bg">
      <div className="mx-auto w-full max-w-lg">
        {sharerName && (
          <div className="flex items-center justify-center mb-3 pt-4">
            <div className="flex items-center gap-2 text-xs text-theme-text-muted bg-theme-bg-card-light backdrop-blur-sm px-3 py-1.5 rounded-full">
              <UserCircle className="w-4 h-4 text-theme-accent" />
              <span><span className="text-theme-accent font-medium">{sharerName}</span> 分享的训练计划</span>
            </div>
          </div>
        )}
        
        <div className="mx-auto w-full max-w-lg p-4">
          <div className="flex justify-end mb-1">
            <button
              onClick={() => {
                logout();
                resetSession();
                navigate('/login', { replace: true });
              }}
              className="flex items-center gap-1 text-xs text-theme-text-muted hover:text-theme-text-secondary px-2 py-1 rounded transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              退出登录
            </button>
          </div>
          
          <div className="bg-theme-bg-card-subtle backdrop-blur-sm rounded-2xl p-6 mb-4">
            <div className="mb-4">
              <h1 className="text-xl font-bold">{plan.title}</h1>
              <p className="text-theme-text-muted text-sm">{template.name}</p>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-theme-text-muted">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{plan.date || '无日期'}</span>
              </div>
              
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>{userRecords.length} 次记录</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-t-3xl shadow-2xl min-h-[60vh]">
            <div className="p-4 pb-32">
              {sessionDrills.length === 0 || session.status === 'idle' || session.status === 'finished' || !drill ? (
                <div className="flex flex-col items-center gap-6 py-8 text-center">
                  <div className="w-full max-w-sm rounded-3xl border border-theme-border bg-white p-6">
                    <div className="text-xs uppercase tracking-widest text-theme-accent">
                      训练计时
                    </div>
                    <div className="mt-2 text-2xl font-bold text-theme-text">
                      {plan.title}
                    </div>
                    {sessionDrills.length > 0 && (
                      <div className="mt-2 text-sm text-theme-text-muted">
                        {sessionDrills.length} 个环节
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (session.status === 'finished') {
                        setSession({
                          ...initialSession,
                          templateId: template?.id ?? '',
                          drillIndex: 0,
                          remaining: template?.drills[0]?.duration ?? 0,
                          status: 'idle',
                          startedAt: null,
                          lastTickTs: null,
                          drillStartedAt: null,
                          restDuration: customRestDuration > 0 ? customRestDuration : 0,
                          restRemaining: 0,
                        });
                      } else {
                        setShowRestModal(true);
                      }
                    }}
                    disabled={sessionDrills.length === 0}
                    className="rounded-xl bg-theme-accent text-white px-8 py-3 text-sm font-semibold hover:bg-theme-accent-hover disabled:opacity-50"
                  >
                    {session.status === 'finished' ? '再来一次' : '开始训练'}
                  </button>
                </div>
              ) : session.status === 'resting' || (session.status === 'paused' && session.previousStatus === 'resting') ? (
                <div className="flex flex-col items-center gap-6 py-8 text-center">
                  <div className="mb-4 text-center">
                    <div className="text-xs uppercase tracking-widest text-amber-500">
                      休息时间
                    </div>
                    <h2 className="mt-1 text-2xl font-bold text-theme-text">休息中</h2>
                    {nextDrillData && (
                      <p className="mt-1 text-sm text-theme-text-muted">
                        下一环节：{nextDrillData.title}
                      </p>
                    )}
                  </div>

                  <div className="relative mx-auto my-4 flex h-56 w-56 items-center justify-center">
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                      <circle
                        cx="50" cy="50" r="45" fill="none"
                        stroke="#f59e0b"
                        strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 45}`}
                        strokeDashoffset={`${2 * Math.PI * 45 * (1 - restProgress)}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dashoffset 0.4s linear' }}
                      />
                    </svg>
                    <div className="flex flex-col items-center">
                      <div className={cn('font-mono text-5xl font-bold tabular-nums', session.restRemaining <= 5 ? 'text-red-400' : 'text-theme-text')}>
                        {formatDuration(session.restRemaining)}
                      </div>
                      <div className="mt-1 text-xs text-amber-500">休息中</div>
                    </div>
                  </div>

                  <div className="mx-auto flex max-w-md items-center justify-center gap-3">
                    <button
                      onClick={() => { clear(); prevDrill(); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-theme-border text-theme-text-secondary hover:bg-theme-bg-card"
                    >
                      <SkipBack className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {
                        if (session.status === 'resting') {
                          pause();
                          pauseSession();
                        } else if (session.status === 'paused') {
                          resumeSession();
                          resume();
                        }
                      }}
                      className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg shadow-amber-500/30 hover:bg-amber-600"
                    >
                      {session.status === 'resting' ? (
                        <Pause className="h-7 w-7" />
                      ) : (
                        <Play className="h-7 w-7 translate-x-0.5" />
                      )}
                    </button>
                    <button
                      onClick={() => { clear(); nextDrill(); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-theme-border text-theme-text-secondary hover:bg-theme-bg-card"
                    >
                      <SkipForward className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => setSpeechEnabled(!speechEnabled)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors',
                        speechEnabled
                          ? 'bg-theme-accent/10 text-theme-accent'
                          : 'bg-theme-bg-card text-theme-text-muted'
                      )}
                    >
                      {speechEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                      {speechEnabled ? '语音播报' : '已静音'}
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-theme-danger hover:bg-theme-danger/10 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      取消训练
                    </button>
                  </div>

                  {showCancelConfirm && (
                    <div className="mt-4 rounded-lg border border-theme-danger/30 bg-theme-danger/10 p-4">
                      <div className="text-sm text-theme-danger mb-3">
                        确定要取消这次训练吗？训练记录将被删除。
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 rounded-lg bg-theme-bg-card px-4 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-bg-card"
                        >
                          再想想
                        </button>
                        <button
                          onClick={cancelTraining}
                          className="flex-1 rounded-lg bg-theme-danger px-4 py-2 text-sm font-medium text-white hover:bg-theme-danger"
                        >
                          取消训练
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="mb-4 text-center">
                    <div className="text-xs uppercase tracking-widest text-theme-accent">
                      当前环节 {session.drillIndex + 1} / {totalDrills}
                    </div>
                    <h2 className="mt-1 text-2xl font-bold text-theme-text">{drill.title}</h2>
                    {drill.summary && (
                      <p className="mt-1 text-sm text-theme-text-muted">{drill.summary}</p>
                    )}
                  </div>

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

                  <div className="mx-auto flex max-w-md items-center justify-center gap-3">
                    <button
                      onClick={() => { clear(); prevDrill(); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-theme-border text-theme-text-secondary hover:bg-theme-bg-card"
                    >
                      <SkipBack className="h-5 w-5" />
                    </button>
                    <button
                      onClick={() => {
                        if (session.status === 'running') {
                          pause();
                          pauseSession();
                        } else if (session.status === 'paused' || session.status === 'ready') {
                          resumeSession();
                          resume();
                        } else if (session.status === 'finished') {
                          clear();
                          nextDrill();
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
                      onClick={() => { clear(); nextDrill(); }}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-theme-border text-theme-text-secondary hover:bg-theme-bg-card"
                    >
                      <SkipForward className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-4 flex justify-center gap-2">
                    <button
                      onClick={() => setSpeechEnabled(!speechEnabled)}
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors',
                        speechEnabled
                          ? 'bg-theme-accent/10 text-theme-accent'
                          : 'bg-theme-bg-card text-theme-text-muted'
                      )}
                    >
                      {speechEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                      {speechEnabled ? '语音播报' : '已静音'}
                    </button>
                    <button
                      onClick={resetCurrentDrill}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      重置当前环节
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-theme-danger hover:bg-theme-danger/10 transition-colors"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      取消训练
                    </button>
                  </div>

                  {showCancelConfirm && (
                    <div className="mt-4 rounded-lg border border-theme-danger/30 bg-theme-danger/10 p-4">
                      <div className="text-sm text-theme-danger mb-3">
                        确定要取消这次训练吗？训练记录将被删除。
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowCancelConfirm(false)}
                          className="flex-1 rounded-lg bg-theme-bg-card px-4 py-2 text-sm font-medium text-theme-text-secondary hover:bg-theme-bg-card"
                        >
                          再想想
                        </button>
                        <button
                          onClick={cancelTraining}
                          className="flex-1 rounded-lg bg-theme-danger px-4 py-2 text-sm font-medium text-white hover:bg-theme-danger"
                        >
                          取消训练
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <h3 className="font-semibold">训练目录</h3>
                </div>
                
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                  {template.drills.map((drill, index) => {
                    const isActive = session.drillIndex === index;
                    const isCompleted = index < completedDrillsCount;
                    return (
                      <button 
                        key={drill.id}
                        onClick={() => skipToDrill(index)}
                        disabled={session.status === 'running' || session.status === 'paused'}
                        className={`flex-shrink-0 w-32 rounded-xl overflow-hidden transition-all text-left ${
                          isActive 
                            ? 'ring-2 ring-theme-accent bg-theme-accent/5' 
                            : isCompleted
                              ? 'bg-theme-accent-light/50' 
                              : 'bg-theme-bg-card hover:bg-theme-bg-card-subtle'
                        } ${(session.status === 'running' || session.status === 'paused') && !isActive ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <div className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium ${
                              isActive 
                                ? 'bg-theme-accent text-white' 
                                : isCompleted
                                  ? 'bg-theme-accent-light text-theme-accent' 
                                  : 'bg-theme-border text-theme-text-muted'
                            }`}>
                              {isCompleted ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                index + 1
                              )}
                            </div>
                            <span className="text-xs text-theme-text-muted font-mono">
                              {formatDuration(drill.duration)}
                            </span>
                          </div>
                          <p className={`font-medium text-sm line-clamp-2 ${isCompleted ? 'line-through text-theme-text-muted' : 'text-theme-text'}`}>
                            {drill.title}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {userRecords.length > 0 && (
                <div className="mt-6 bg-theme-bg-card-subtle backdrop-blur-sm rounded-2xl p-4">
                  <h3 className="font-semibold mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    我的训练记录 ({userRecords.length})
                  </h3>
                  <div className="space-y-2">
                    {userRecords.map((record) => (
                      <RecordItem key={record.id} record={record} template={template} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {session.status !== 'running' && session.status !== 'resting' && session.status !== 'paused' && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-theme-border p-4 z-50">
              <button
                onClick={goHome}
                className="w-full flex items-center justify-center gap-2 bg-theme-accent text-white rounded-xl py-3 font-semibold hover:bg-theme-accent-hover"
              >
                <Home className="h-5 w-5" />
                返回首页
              </button>
            </div>
          )}

          {showShareToast && (
            <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2 bg-theme-bg-card text-theme-text px-6 py-3 rounded-xl shadow-lg z-50">
              链接已复制到剪贴板
            </div>
          )}

          {showRestModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-sm rounded-2xl border border-theme-border bg-white p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-theme-accent" />
                    <h3 className="text-lg font-semibold text-theme-text">设置休息时长</h3>
                  </div>
                  <button
                    onClick={() => setShowRestModal(false)}
                    className="rounded-lg p-1 text-theme-text-muted hover:bg-theme-bg-card"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                {plan && (
                  <div className="mt-3 text-sm text-theme-text-muted">
                    训练计划：{plan.title}
                  </div>
                )}

                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-theme-text-muted">休息时长</span>
                    <span className="text-xl font-bold text-theme-accent">{formatDuration(customRestDuration)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="300"
                    step="15"
                    value={customRestDuration}
                    onChange={(e) => setCustomRestDuration(Number(e.target.value))}
                    className="mt-3 w-full accent-theme-accent"
                  />
                  <div className="mt-2 flex justify-between text-xs text-theme-text-muted">
                    <span>无休息</span>
                    <span>5分钟</span>
                  </div>
                </div>

                <div className="mt-4 flex gap-2">
                  {[0, 30, 60, 90].map((val) => (
                    <button
                      key={val}
                      onClick={() => setCustomRestDuration(val)}
                      className={cn(
                        'flex-1 rounded-lg py-2 text-xs font-medium transition-colors',
                        customRestDuration === val
                          ? 'bg-theme-accent text-white'
                          : 'bg-theme-bg-card text-theme-text-secondary hover:bg-theme-bg-card'
                      )}
                    >
                      {val === 0 ? '无休息' : formatDuration(val)}
                    </button>
                  ))}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => setShowRestModal(false)}
                    className="flex-1 rounded-xl border border-theme-border bg-theme-bg-card px-4 py-3 text-sm text-theme-text-secondary hover:bg-theme-bg-card"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => {
                      setShowRestModal(false);
                      startSession();
                    }}
                    className="flex-1 rounded-xl bg-theme-accent text-white px-4 py-3 text-sm font-semibold hover:bg-theme-accent-hover"
                  >
                    开始训练
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecordItem({ record, template }: { record: TrainingRecord; template: Template }) {
  const tpl = template;
  const isCompleted = record.status === 'completed';
  const isSkipped = record.status === 'skipped';
  const isInProgress = record.status === 'in_progress';

  return (
    <div className={`rounded-xl border p-3 ${
      isCompleted || isSkipped
        ? 'border-theme-border bg-theme-bg-secondary-muted'
        : isInProgress
          ? 'border-theme-accent/30 bg-theme-accent/5'
          : 'border-theme-border bg-theme-bg-card-light'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className={`text-sm font-medium ${isCompleted || isSkipped ? 'text-theme-text-muted line-through' : 'text-theme-text'}`}>
            {record.title}
          </h4>
          {isInProgress && (
            <span className="rounded-full bg-theme-accent/20 px-2 py-0.5 text-[10px] font-medium text-theme-accent">训练中</span>
          )}
          {isCompleted && (
            <span className="rounded-full bg-theme-accent/20 px-2 py-0.5 text-[10px] font-medium text-theme-accent">已完成</span>
          )}
          {isSkipped && (
            <span className="rounded-full bg-theme-border px-2 py-0.5 text-[10px] font-medium text-theme-text-muted">已跳过</span>
          )}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-theme-text-muted">
        {record.startTime && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {fmtDateTime(record.startTime)}
          </span>
        )}
        {record.durationSeconds && (
          <span>{formatDuration(record.durationSeconds)}</span>
        )}
        {record.completedDrills !== undefined && tpl && (
          <span>{record.completedDrills}/{tpl.drills.length} 环节</span>
        )}
      </div>
    </div>
  );
}