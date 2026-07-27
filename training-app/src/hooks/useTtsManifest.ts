import { useEffect, useRef } from 'react';
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
 */
export function useTtsManifest({ speech, templateId, planId, drills, restDuration = 0, enabled = true }: UseTtsManifestOptions) {
  const audioManifest = useTrainingStore((s) => s.audioManifest);
  const setAudioManifest = useTrainingStore((s) => s.setAudioManifest);
  const token = useAuthStore((s) => s.token);
  const fetchedKeyRef = useRef<string>('');

  // manifest 变化时同步到 speech
  useEffect(() => {
    speech.setAudioManifest(audioManifest);
  }, [audioManifest, speech]);

  // 预生成音频
  useEffect(() => {
    if (!enabled || !token) return;

    const key = templateId ? `tpl:${templateId}` : planId ? `plan:${planId}` : '';
    if (!key || key === fetchedKeyRef.current) return;

    // drills 为空时不预生成
    if (drills && drills.length === 0) return;

    fetchedKeyRef.current = key;

    const body: Record<string, unknown> = {};
    if (templateId) body.templateId = templateId;
    if (planId) body.planId = planId;
    body.restDuration = restDuration;
    if (drills && !templateId && !planId) {
      body.drills = drills.map((d) => ({
        title: d.title,
        summary: d.summary,
        cues: d.cues?.map((c) => ({ text: c.text })),
      }));
    }

    api
      .post<{ success: boolean; manifest: AudioManifest; cached?: boolean }>('/tts/pregenerate', body)
      .then((res) => {
        if (res.data?.manifest) {
          setAudioManifest(res.data.manifest);
        }
      })
      .catch((err) => {
        console.warn('[tts] pregenerate failed:', err);
      });
  }, [enabled, token, templateId, planId, drills, restDuration, setAudioManifest]);
}
