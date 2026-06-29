import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { formatDuration, formatTime } from '@/utils/duration';
import { useSpeech } from '@/hooks/useSpeech';
import { useAuthStore } from '@/store/authStore';
import type { Template, TrainingPlan, SessionState, TrainingRecord } from '@/types';
import { api } from '@/lib/api';

const initialSession: SessionState = {
  templateId: null,
  drillIndex: 0,
  remaining: 0,
  status: 'idle',
  startedAt: null,
  lastTickTs: null,
  drillStartedAt: null,
};

const mapPlanFromServer = (p: any): TrainingPlan => ({
  id: p.id,
  templateId: p.template_id,
  title: p.title,
  date: p.date,
  status: (p.status ?? 'planned') as 'planned' | 'completed' | 'skipped',
  note: p.note,
  createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
  completedAt: p.completed_at ? new Date(p.completed_at).getTime() : undefined,
});

const mapTemplateFromServer = (t: any): Template => ({
  id: t.id,
  name: t.name,
  description: t.description,
  drills: (t.drills ?? []).map((d: any) => ({
    id: d.id ?? '',
    title: d.title ?? '',
    duration: d.duration ?? 0,
    cues: (d.cues ?? []).map((c: any) => ({
      id: c.id ?? '',
      text: c.text ?? '',
      trigger: c.trigger ?? 'start',
      seconds: c.seconds,
    })),
  })),
  createdAt: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
});

export function ShareDetail() {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<TrainingPlan | null>(null);
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionState>(initialSession);
  const [currentRecordId, setCurrentRecordId] = useState<string | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const login = useAuthStore((s) => s.login);
  
  const { speak, stop, speaking } = useSpeech({ enabled: true });

  useEffect(() => {
    if (!planId) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }
    
    const fetchData = async () => {
      try {
        const res = await api.get<any>(`/records/share/${planId}`);
        if (res.data) {
          setPlan(mapPlanFromServer(res.data.plan));
          setTemplate(mapTemplateFromServer(res.data.template));
        } else {
          setError('分享内容不存在');
        }
      } catch (err) {
        setError('无法获取分享内容');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [planId]);

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
    if (session.status === 'running' && template && session.drillIndex < template.drills.length) {
      const drill = template.drills[session.drillIndex];
      const elapsed = session.drillStartedAt ? (Date.now() - session.drillStartedAt) / 1000 : 0;
      
      drill.cues.forEach((cue) => {
        if (cue.trigger === 'start' && elapsed < 1 && !speaking) {
          speak(cue.text);
        } else if (cue.trigger === 'timer' && cue.seconds !== undefined) {
          const triggerTime = drill.duration - cue.seconds;
          if (Math.abs(elapsed - triggerTime) < 0.5 && !speaking) {
            speak(cue.text);
          }
        }
      });
    }
  }, [session, template, speak, speaking]);

  useEffect(() => {
    if (session.status === 'finished' && template) {
      if (session.drillIndex < template.drills.length - 1) {
        const nextDrill = template.drills[session.drillIndex + 1];
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
            completed_drills: session.drillIndex + 1,
          });
        }
      } else {
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
      const res = await api.post<{ record: TrainingRecord }>('/records', {
        plan_id: plan.id,
        template_id: template.id,
        title: plan.title,
        status: 'in_progress',
        start_time: new Date().toISOString(),
        total_drills: template.drills.length,
        completed_drills: 0,
      });
      
      if (res.data?.record) {
        return res.data.record.id;
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
    
    if (!user) {
      await login('guest_' + Date.now());
    }
    
    const recordId = await createRecord();
    if (recordId) {
      setCurrentRecordId(recordId);
    }
    
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
      if (s.status !== 'paused') return s;
      return { ...s, status: 'running' as const, lastTickTs: Date.now() };
    });
  }, []);

  const skipToDrill = useCallback((index: number) => {
    if (!template) return;
    const drill = template.drills[index];
    if (!drill) return;
    stop();
    setSession({
      ...initialSession,
      templateId: template.id,
      drillIndex: index,
      remaining: drill.duration,
      status: session.status === 'running' ? 'running' : 'paused',
      startedAt: session.startedAt ?? Date.now(),
      lastTickTs: session.status === 'running' ? Date.now() : null,
      drillStartedAt: Date.now(),
    });
  }, [template, session.status, session.startedAt, stop]);

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
        <h1 className="text-xl font-bold text-slate-200 mb-2">分享链接无效</h1>
        <p className="text-slate-400 text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-lg p-4">
        <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold">{plan.title}</h1>
              <p className="text-slate-400 text-sm">{template.name}</p>
            </div>
            <button
              onClick={handleShare}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
              title="分享"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
            </button>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-slate-400">
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
          </div>
        </div>

        {session.status === 'idle' ? (
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 mb-4">
            <div className="text-center py-8">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold mb-2">准备开始训练</h2>
              <p className="text-slate-400 text-sm mb-6">点击下方按钮开始训练，语音指导将自动播放</p>
              <button
                onClick={startSession}
                className="w-full py-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 rounded-xl font-semibold transition-all"
              >
                开始训练
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6 mb-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">训练进行中</h2>
                <p className="text-slate-400 text-sm">
                  {template.drills[session.drillIndex]?.title}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-indigo-400">
                  {formatTime(session.remaining)}
                </p>
                <p className="text-slate-400 text-xs">
                  {session.drillIndex + 1}/{template.drills.length}
                </p>
              </div>
            </div>

            <div className="relative w-full h-3 bg-slate-800 rounded-full overflow-hidden mb-6">
              <div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-100"
                style={{ width: `${(session.remaining / (template.drills[session.drillIndex]?.duration || 1)) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-center gap-4">
              {session.status === 'running' ? (
                <button
                  onClick={pauseSession}
                  className="w-16 h-16 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center transition-all"
                >
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                </button>
              ) : (
                <button
                  onClick={resumeSession}
                  className="w-16 h-16 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 flex items-center justify-center transition-all"
                >
                  <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>
              )}
            </div>

            {speaking && (
              <div className="mt-4 flex items-center justify-center gap-2 text-indigo-400">
                <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
                </svg>
                <span className="text-sm">正在播放指导</span>
              </div>
            )}
          </div>
        )}

        <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            训练目录
          </h3>
          
          <div className="space-y-2">
            {template.drills.map((drill, index) => (
              <div 
                key={drill.id}
                className={`bg-slate-800/50 rounded-xl overflow-hidden transition-all cursor-pointer ${
                  session.drillIndex === index ? 'ring-2 ring-indigo-500' : ''
                }`}
                onClick={() => skipToDrill(index)}
              >
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      session.drillIndex === index 
                        ? 'bg-indigo-500 text-white' 
                        : index < session.drillIndex 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-slate-700 text-slate-400'
                    }`}>
                      {index < session.drillIndex ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{drill.title}</p>
                      <p className="text-slate-500 text-xs">{formatDuration(drill.duration)}</p>
                    </div>
                  </div>
                  <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showShareToast && (
          <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-slate-800 text-white px-6 py-3 rounded-xl shadow-lg">
            链接已复制到剪贴板
          </div>
        )}

        <div className="mt-6 text-center text-slate-500 text-xs">
          <p>由训练助手提供支持</p>
        </div>
      </div>
    </div>
  );
}
