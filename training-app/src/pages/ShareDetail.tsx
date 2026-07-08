import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatDuration, formatTime, formatDurationChinese } from '@/utils/duration';
import { useSpeech } from '@/hooks/useSpeech';
import { useAuthStore } from '@/store/authStore';
import { useTrainingStore } from '@/store/trainingStore';
import type { Template, TrainingPlan, SessionState, TrainingRecord, CueTrigger, RecordStatus } from '@/types';
import { api } from '@/lib/api';
import { Clock, Users, RotateCcw, X, LogOut, UserCircle } from 'lucide-react';

const initialSession: SessionState = {
  templateId: null,
  drillIndex: 0,
  remaining: 0,
  status: 'idle',
  startedAt: null,
  lastTickTs: null,
  drillStartedAt: null,
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

const mapRecordFromServer = (r: { id: string; user_id: string; plan_id: string; template_id?: string; title: string; status: RecordStatus; start_time?: string; end_time?: string; duration_seconds?: number; completed_drills?: number; total_drills?: number; note?: string; created_at?: string; completed_at?: string; executor?: { id: string; nickname: string; avatar: string | null } }): TrainingRecord => ({
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
  
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  const logout = useAuthStore((s) => s.logout);
  const resetSession = useTrainingStore((s) => s.resetSession);
  
  const { enqueue, stop, clear, speaking, resume } = useSpeech({ enabled: true });

  const firedCueKeysRef = useRef<Set<string>>(new Set());
  const firedMinuteKeysRef = useRef<Set<string>>(new Set());
  const firedOneMinLeftRef = useRef<boolean>(false);
  const startedDrillRef = useRef<string>('');
  const prevDrillIndexRef = useRef<number>(session.drillIndex);

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
      setSession({
        ...initialSession,
        templateId: template.id,
        drillIndex,
        remaining: drill?.duration ?? 0,
        status: 'paused',
        startedAt: inProgress.startTime ? new Date(inProgress.startTime).getTime() : Date.now(),
        lastTickTs: null,
        drillStartedAt: Date.now(),
      });
    }
  }, [template, userRecords, user, session.status]);

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
            return { ...s, remaining: 0, status: 'finished' as const };
          }
          return { ...s, remaining, lastTickTs: nowTs };
        });
      }, 100);
    }
    
    return () => clearInterval(interval);
  }, [session.status]);

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
    }

    if (session.status === 'running' && session.remaining >= drill.duration - 0.05) {
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
  }, [session.status, session.drillIndex, session.remaining, template, enqueue, clear]);

  useEffect(() => {
    if (session.status === 'paused') {
      stop();
    } else if (session.status === 'running') {
      try { window.speechSynthesis?.resume(); } catch { /* noop */ }
      resume();
    } else if (session.status === 'idle' || session.status === 'ready') {
      clear();
    }
  }, [session.status, stop, resume, clear]);

  useEffect(() => {
    if (session.status === 'finished' && template) {
      if (session.drillIndex < template.drills.length - 1) {
        const nextDrill = template.drills[session.drillIndex + 1];
        const newCompletedCount = session.drillIndex + 1;
        setCompletedDrillsCount(newCompletedCount);
        setSession({
          ...initialSession,
          templateId: template.id,
          drillIndex: session.drillIndex + 1,
          remaining: nextDrill.duration,
          status: 'running',
          startedAt: session.startedAt ?? Date.now(),
          lastTickTs: Date.now(),
          drillStartedAt: Date.now(),
        });
        
        if (currentRecordId) {
          api.patch(`/records/${currentRecordId}`, {
            completed_drills: newCompletedCount,
          });
        }
      } else {
        setCompletedDrillsCount(template.drills.length);
        if (currentRecordId) {
          const endTime = Date.now();
          const durationSeconds = session.startedAt ? Math.round((endTime - session.startedAt) / 1000) : 0;
          api.patch(`/records/${currentRecordId}`, {
            status: 'completed',
            end_time: new Date(endTime).toISOString(),
            duration_seconds: durationSeconds,
            completed_drills: template.drills.length,
            completed_at: new Date(endTime).toISOString(),
          });
        }
      }
    }
  }, [session.status, session.drillIndex, template, currentRecordId]);

  const createRecord = useCallback(async () => {
    if (!plan || !template || !user) return null;
    
    try {
      const res = await api.post<{ record: { id: string; user_id: string; plan_id: string; template_id?: string; title: string; status: RecordStatus; start_time?: string; end_time?: string; duration_seconds?: number; completed_drills?: number; total_drills?: number; note?: string; created_at?: string; completed_at?: string; executor?: { id: string; nickname: string; avatar: string | null } } }>('/records', {
        plan_id: plan.id,
        template_id: template.id,
        title: plan.title,
        status: 'in_progress',
        start_time: new Date().toISOString(),
        total_drills: template.drills.length,
        completed_drills: 0,
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
  }, [plan, template, user]);

  const startSession = useCallback(async () => {
    if (!template) return;
    const drill = template.drills[0];
    if (!drill) return;
    
    const recordId = await createRecord();
    if (recordId) {
      setCurrentRecordId(recordId);
    }
    
    setCompletedDrillsCount(0);
    setSession({
      ...initialSession,
      templateId: template.id,
      drillIndex: 0,
      remaining: drill.duration,
      status: 'running',
      startedAt: Date.now(),
      lastTickTs: Date.now(),
      drillStartedAt: Date.now(),
    });
  }, [template, user, login, createRecord]);

  const pauseSession = useCallback(() => {
    setSession((s) => {
      if (s.status !== 'running') return s;
      stop();
      return { ...s, status: 'paused' as const };
    });
  }, [stop]);

  const resumeSession = useCallback(() => {
    setSession((s) => {
      if (s.status !== 'paused' && s.status !== 'idle' && s.status !== 'ready') return s;
      return { ...s, status: 'running' as const, lastTickTs: Date.now() };
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
    setSession(initialSession);
    setCompletedDrillsCount(0);
    setShowCancelConfirm(false);
    
    const [recordsRes] = await Promise.all([
      token ? api.get<{ records: unknown[] }>(`/records/by-plan/${planId}`).catch(() => null) : Promise.resolve(null),
    ]);
    if (recordsRes?.data?.records) {
      setUserRecords(recordsRes.data.records.map(mapRecordFromServer));
    }
  }, [currentRecordId, stop, token, planId]);

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
      status: 'paused' as const,
      startedAt: session.startedAt ?? Date.now(),
      lastTickTs: null,
      drillStartedAt: Date.now(),
    });
  }, [template, session.startedAt, stop]);

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

  const totalDuration = template?.drills.reduce((acc, d) => acc + d.duration, 0) ?? 0;
  const inProgressRecord = userRecords.find(r => r.status === 'in_progress' && r.userId === user?.id);
  const isOwnInProgress = !!inProgressRecord && (session.status === 'paused' || session.status === 'idle');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500" />
      </div>
    );
  }

  if (error || !plan || !template) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-4">🔗</div>
        <h1 className="text-xl font-bold text-theme-text-secondary mb-2">分享链接无效</h1>
        <p className="text-theme-text-muted text-center">{error}</p>
      </div>
    );
  }

  if (terminated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-xl font-bold text-theme-text-secondary mb-2">该训练计划已终止</h1>
        <p className="text-theme-text-muted text-center">计划创建者已终止此训练计划，无法继续执行</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-bg text-theme-text">
      <div className="mx-auto w-full max-w-lg p-4">
        {sharerName && (
          <div className="flex items-center justify-center mb-3">
            <div className="flex items-center gap-2 text-xs text-theme-text-muted bg-theme-bg-card-light backdrop-blur-sm px-3 py-1.5 rounded-full">
              <UserCircle className="w-4 h-4 text-theme-accent" />
              <span><span className="text-theme-accent font-medium">{sharerName}</span> 分享的训练计划</span>
            </div>
          </div>
        )}
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
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">{plan.title}</h1>
              <p className="text-theme-text-muted text-sm">{template.name}</p>
            </div>
            <button
              onClick={handleShare}
              className="p-2 rounded-lg bg-theme-bg-card hover:bg-theme-bg-card transition-colors"
              title="分享"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-theme-text-muted">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{plan.date || '无日期'}</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{formatDuration(totalDuration)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>{userRecords.length} 次记录</span>
            </div>
          </div>
        </div>

        

        {(session.status === 'idle' || session.status === 'ready' || session.status === 'finished') && !isOwnInProgress && (
          <div className="bg-theme-bg-card-subtle backdrop-blur-sm rounded-2xl p-6 mb-4">
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center">
                <svg className="w-10 h-10 text-theme-text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-2">
                {session.status === 'finished' ? '本次训练已完成' : '准备开始训练'}
              </h2>
              <p className="text-theme-text-muted text-sm mb-6">
                {session.status === 'finished'
                  ? '恭喜完成本次训练，点击下方按钮可再来一次'
                  : '点击下方按钮开始训练，语音指导将自动播放'}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={startSession}
                  className="flex-1 py-4 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl font-semibold transition-all"
                >
                  {session.status === 'finished' ? '再来一次' : '开始训练'}
                </button>
              </div>
            </div>
          </div>
        )}
        {(session.status === 'running' || session.status === 'paused') && (
          <div className="bg-theme-bg-card-subtle backdrop-blur-sm rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">训练进行中</h2>
                <p className="text-theme-text-muted text-sm">
                  {template.drills[session.drillIndex]?.title}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-theme-accent">
                  {formatTime(session.remaining)}
                </p>
                <p className="text-theme-text-muted text-xs">
                  {session.drillIndex + 1}/{template.drills.length}
                </p>
              </div>
            </div>

            <div className="relative w-full h-3 bg-theme-bg-card rounded-full overflow-hidden mb-6">
              <div 
                className="h-full bg-theme-accent transition-all duration-100"
                style={{ width: `${(session.remaining / (template.drills[session.drillIndex]?.duration || 1)) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-center gap-4">
              {session.status === 'running' ? (
                <button
                  onClick={pauseSession}
                  className="w-16 h-16 rounded-full bg-theme-bg-card hover:bg-theme-bg-card flex items-center justify-center transition-all"
                >
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={resumeSession}
                  className="w-16 h-16 rounded-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 flex items-center justify-center transition-all"
                >
                  <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              )}
            </div>

            {speaking && (
              <div className="mt-4 flex items-center justify-center gap-2 text-theme-accent">
                <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                </svg>
                <span className="text-sm">正在播放指导</span>
              </div>
            )}

            <div className="mt-4 flex justify-center gap-4">
              <button
                onClick={() => {
                  resetCurrentDrill();
                }}
                className="flex items-center gap-1.5 text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                重置当前环节
              </button>
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="flex items-center gap-1.5 text-xs text-theme-danger hover:text-theme-danger transition-colors"
              >
                <X className="w-3 h-3" />
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
        )}

        <div className="bg-theme-bg-card-subtle backdrop-blur-sm rounded-2xl p-4 mb-4">
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
          <div className="bg-theme-bg-card-subtle backdrop-blur-sm rounded-2xl p-6 mb-4">
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

        {showShareToast && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-theme-bg-card text-theme-text px-6 py-3 rounded-xl shadow-lg">
            链接已复制到剪贴板
          </div>
        )}

        <div className="mt-6 text-center text-theme-text-muted text-xs">
          <p>由训练助手提供支持</p>
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
