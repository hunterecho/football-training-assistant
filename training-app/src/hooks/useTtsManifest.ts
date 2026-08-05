import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useTrainingStore } from '@/store/trainingStore';
import { useAuthStore } from '@/store/authStore';
import type { AudioManifest, Drill } from '@/types';

type SpeechInstance = {
  setAudioManifest: (manifest: AudioManifest | null) => void;
};

type UseTtsManifestOptions = {
  speech: SpeechInstance;
  templateId?: string;
  planId?: string;
  drills?: Drill[];
  restDuration?: number;
  enabled?: boolean;
};

/**
 * 自动预生成 TTS 音频并设置到 speech 实例
 * 训练开始时调用后端预生成接口，完成后设置到 speech
 * 返回 manifestReady 表示音频清单是否已加载完成
 */
export function useTtsManifest({ speech, templateId, planId, drills, restDuration = 0, enabled = true }: UseTtsManifestOptions) {
  const audioManifest = useTrainingStore((s) => s.audioManifest);
  const setAudioManifest = useTrainingStore((s) => s.setAudioManifest);
  const token = useAuthStore((s) => s.token);
  const fetchedKeyRef = useRef<string>('');
  const [manifestReady, setManifestReady] = useState(false);
  const [manifestError, setManifestError] = useState<string>('');

  // manifest 变化时同步到 speech
  useEffect(() => {
    speech.setAudioManifest(audioManifest);
    setManifestReady(!!audioManifest && !!audioManifest.audioMap && Object.keys(audioManifest.audioMap).length > 0);
  }, [audioManifest, speech]);

  // 预生成音频
  useEffect(() => {
    if (!enabled || !token) return;

    // 计算请求 key：templateId > planId > drills hash（全部 drills 标题拼接）
    let key = '';
    if (templateId) {
      key = `tpl:${templateId}`;
    } else if (planId) {
      key = `plan:${planId}`;
    } else if (drills && drills.length > 0) {
      const drillsSig = drills.map((d) => `${d.title}:${d.duration}`).join('|');
      key = `drills:${btoa(unescape(encodeURIComponent(drillsSig))).slice(0, 32)}`;
    }
    if (!key) return;

    // drills 为空时不预生成
    if (drills && drills.length === 0) return;

    // 如果已有 manifest 且 key 匹配，不重复获取
    if (key === fetchedKeyRef.current && audioManifest) return;

    fetchedKeyRef.current = key;

    const body: Record<string, unknown> = {};
    if (templateId) body.templateId = templateId;
    if (planId) body.planId = planId;
    body.restDuration = restDuration;
    if (drills && !templateId && !planId) {
      body.drills = drills.map((d) => ({
        title: d.title,
        duration: d.duration,
        summary: d.summary,
        cues: d.cues?.map((c) => ({ text: c.text })),
      }));
    }

    setManifestError('');
    api
      .post<{ success: boolean; manifest: AudioManifest; cached?: boolean }>('/tts/pregenerate', body)
      .then((res) => {
        if (res.data?.manifest) {
          setAudioManifest(res.data.manifest);
          setManifestReady(true);
        } else if (res.error) {
          setManifestError(res.error);
        }
      })
      .catch((err) => {
        console.warn('[tts] pregenerate failed:', err);
        setManifestError(err instanceof Error ? err.message : String(err));
      });
  }, [enabled, token, templateId, planId, drills, restDuration, setAudioManifest, audioManifest]);

  return { manifestReady, manifestError };
}
