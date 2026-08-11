import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { AudioManifest, Drill } from '@/types';

type SpeechInstance = {
  setAudioManifest: (manifest: AudioManifest | null) => void;
};

type UseTtsManifestOptions = {
  speech: SpeechInstance;
  /** 模板 ID：优先用这个从 DB 取已生成的 manifest */
  templateId?: string;
  /** 计划 ID：当是计划训练且没 templateId 时用这个 */
  planId?: string;
  /** drills（模板/计划没有 manifest 时，可用于展示缺失项数量） */
  drills?: Drill[];
  /** 训练设置的休息时长（只用于提示，不在此生成） */
  restDuration?: number;
  enabled?: boolean;
  /** 内存中的 manifest（store 里的），作为 DB 拉取失败时的 fallback */
  fallbackManifest?: AudioManifest | null;
};

/**
 * 加载 TTS manifest（新架构：只读，不写、不触发 TTS 生成）
 *
 * 1. 并行 GET 模板 manifest（GET /tts/manifest/:id）+ GET 系统级公共语音（GET /tts/system）
 * 2. 合并两者的 audioMap 后给到 speech.setAudioManifest
 * 3. 返回 manifestReady / manifestError / templateAudioMissing
 *
 * 设计原则：
 * - 训练执行时绝不调 pregenerate（TTS 生成放在模板编辑页）
 * - 不写全局 trainingStore.audioManifest（避免污染/时序竞态）
 * - 模板 manifest 缺失时不阻塞，给出标记让页面提示用户
 */
export function useTtsManifest({ speech, templateId, planId, enabled = true, fallbackManifest }: UseTtsManifestOptions) {
  const token = useAuthStore((s) => s.token);
  const [manifestReady, setManifestReady] = useState(false);
  const [manifestError, setManifestError] = useState<string>('');
  /** 模板级 manifest 是否缺失（为空或 audioMap 空）——用于页面提示用户去模板页生成 */
  const [templateAudioMissing, setTemplateAudioMissing] = useState(false);
  const loadedKeyRef = useRef<string>('');

  // 计算稳定的 key：templateId > planId
  // 加入 fallbackManifest 是否存在的标记，确保 fallback 可用时重新加载
  const hasFallback = !!(fallbackManifest && Object.keys(fallbackManifest.audioMap ?? {}).length > 0);
  const key = templateId ? `tpl:${templateId}` : planId ? `plan:${planId}` : '';
  // fallback 从无到有时，允许重新加载一次
  const fallbackKey = hasFallback ? '+fb' : '';

  useEffect(() => {
    if (!enabled || !token) return;
    if (!key) return;

    // 同一 key 已加载过就不再请求（避免 effect 重入/依赖变化重复拉）
    // 但 fallback 从无到有时允许重新加载（用户刚生成完语音）
    const fullKey = key + fallbackKey;
    if (loadedKeyRef.current === fullKey) return;
    loadedKeyRef.current = fullKey;

    setManifestReady(false);
    setManifestError('');
    setTemplateAudioMissing(false);

    let cancelled = false;

    const type = templateId ? 'template' : 'plan';
    const id = (templateId || planId)!;

    Promise.all([
      api.get<{ success: boolean; manifest: AudioManifest | null }>(`/tts/manifest/${id}?type=${type}`)
        .then((res) => res.data?.manifest ?? null),
      api.get<{ success: boolean; manifest: AudioManifest }>('/tts/system')
        .then((res) => res.data?.manifest ?? { voice: '', rate: '', generatedAt: '', audioMap: {} }),
    ])
      .then(([templateManifest, systemManifest]) => {
        if (cancelled) return;

        // DB 拉不到模板 manifest 时，尝试用内存中的 fallback（store 里的）
        let effectiveTemplateManifest = templateManifest;
        if ((!templateManifest || Object.keys(templateManifest.audioMap ?? {}).length === 0) && fallbackManifest) {
          console.log('[tts] DB manifest 为空，使用内存 fallback manifest（store）');
          effectiveTemplateManifest = fallbackManifest;
        }

        // 合并 audioMap：系统级在前，模板级覆盖同名 key（正常不会冲突）
        const mergedAudioMap: Record<string, { text: string; url: string; hash: string }> = {};
        if (systemManifest?.audioMap) {
          for (const [k, v] of Object.entries(systemManifest.audioMap)) {
            mergedAudioMap[k] = v;
          }
        }
        const templateAudioMap = effectiveTemplateManifest?.audioMap ?? {};
        for (const [k, v] of Object.entries(templateAudioMap)) {
          mergedAudioMap[k] = v;
        }

        const merged: AudioManifest = {
          voice: systemManifest?.voice || effectiveTemplateManifest?.voice || '',
          rate: systemManifest?.rate || effectiveTemplateManifest?.rate || '',
          generatedAt: new Date().toISOString(),
          audioMap: mergedAudioMap,
        };

        console.log('[tts] manifest loaded:', {
          templateCount: Object.keys(templateAudioMap).length,
          systemCount: Object.keys(systemManifest?.audioMap ?? {}).length,
          mergedCount: Object.keys(mergedAudioMap).length,
          usedFallback: effectiveTemplateManifest !== templateManifest,
        });

        speech.setAudioManifest(merged);

        // 模板级 audioMap 是否为空——用于提示用户去生成
        const tplCount = Object.keys(templateAudioMap).length;
        setTemplateAudioMissing(tplCount === 0);
        setManifestReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[tts] load manifest failed:', msg);
        setManifestError(msg);
        // 即使失败也尝试用 fallback
        if (fallbackManifest) {
          console.log('[tts] API 失败，使用内存 fallback manifest');
          speech.setAudioManifest(fallbackManifest);
          setTemplateAudioMissing(Object.keys(fallbackManifest.audioMap ?? {}).length === 0);
        } else {
          setTemplateAudioMissing(true);
        }
        setManifestReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, token, key, fallbackKey, templateId, planId, speech, fallbackManifest]);

  return { manifestReady, manifestError, templateAudioMissing };
}
