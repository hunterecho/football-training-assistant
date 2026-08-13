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
  // ⚠️ 关键修复：用 epoch 计数器防止旧 Promise 覆盖新 Promise 的结果
  // 之前移除了 cancelled 标志（因为 speech 引用变化会误触发 cleanup），
  // 但这导致当 fallbackManifest 从 null 变为非 null 时，effect 会重新运行，
  // 两个并发的 Promise.all 可能以任意顺序 resolve：
  //   1. 第一次（无 fallback）→ 空 merged manifest
  //   2. 第二次（有 fallback）→ 非空 merged manifest
  // 如果第一次的 Promise 后 resolve，会用空 manifest 覆盖第二次的非空 manifest
  // 用 epoch 确保只有最后一次 effect 的 Promise 结果才会被应用
  const requestEpochRef = useRef(0);

  // ⚠️ 关键修复：用 ref 保存 speech.setAudioManifest 和 fallbackManifest
  // 避免它们作为 useEffect 依赖时，因引用变化导致 effect 被 cleanup（cancelled=true）
  // 之前 speech 对象每次渲染都是新引用（useFallback/speaking 等内部 state 变化引起），
  // 导致 Promise.all 尚未 resolve 就被 cancel，setAudioManifest 永远不被调用 → audioMap 为空 → 走兜底
  const setAudioManifestRef = useRef(speech.setAudioManifest);
  setAudioManifestRef.current = speech.setAudioManifest;
  const fallbackManifestRef = useRef(fallbackManifest);
  fallbackManifestRef.current = fallbackManifest;

  // ⚠️ 关键：当 fallbackManifest 的 audioMap 内容变化时（如 syncFromServer 更新了 store），
  // 强制清除 loadedKeyRef 让下次 effect 重新拉取 DB
  // 这解决了跨设备场景：设备B打开 → syncFromServer 拉取最新 manifest → useTtsManifest 能获取到最新数据
  const prevFallbackKeysRef = useRef<string>('');
  const currentFallbackKeys = Object.keys(fallbackManifest?.audioMap ?? {}).sort().join(',');
  useEffect(() => {
    if (currentFallbackKeys !== prevFallbackKeysRef.current) {
      prevFallbackKeysRef.current = currentFallbackKeys;
      loadedKeyRef.current = '';
    }
  }, [currentFallbackKeys]);

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

    // 用 epoch 标记本次请求，只有最新的请求结果才会被应用
    // 防止旧 Promise（无 fallback）resolve 后覆盖新 Promise（有 fallback）的结果
    const myEpoch = ++requestEpochRef.current;

    const type = templateId ? 'template' : 'plan';
    const id = (templateId || planId)!;
    const currentFallback = fallbackManifestRef.current;

    Promise.all([
      api.get<{ success: boolean; manifest: AudioManifest | null }>(`/tts/manifest/${id}?type=${type}`)
        .then((res) => {
          if (res.error) {
            console.warn('[tts] GET /tts/manifest/:id 返回错误:', res.error);
            return null;
          }
          const m = res.data?.manifest ?? null;
          return m;
        }),
      api.get<{ success: boolean; manifest: AudioManifest }>('/tts/system')
        .then((res) => {
          if (res.error) {
            console.warn('[tts] GET /tts/system 返回错误:', res.error);
            return { voice: '', rate: '', generatedAt: '', audioMap: {} } as AudioManifest;
          }
          const m = res.data?.manifest ?? { voice: '', rate: '', generatedAt: '', audioMap: {} } as AudioManifest;
          return m;
        }),
    ])
      .then(([templateManifest, systemManifest]) => {
        // ⚠️ 关键：如果这不是最新的请求，跳过（旧 Promise 的结果）
        if (myEpoch !== requestEpochRef.current) {
          return;
        }

        // DB 拉不到模板 manifest 时，尝试用内存中的 fallback（store 里的）
        let effectiveTemplateManifest = templateManifest;
        const dbCount = Object.keys(templateManifest?.audioMap ?? {}).length;
        if (dbCount === 0 && currentFallback) {
          effectiveTemplateManifest = currentFallback;
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

        // 通过 ref 调用，避免依赖 speech 对象引用
        setAudioManifestRef.current(merged);

        // 模板级 audioMap 是否为空——用于提示用户去生成
        const tplCount = Object.keys(templateAudioMap).length;
        setTemplateAudioMissing(tplCount === 0);
        setManifestReady(true);
      })
      .catch((err) => {
        // 旧的请求失败也不应用
        if (myEpoch !== requestEpochRef.current) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn('[tts] load manifest failed:', msg);
        setManifestError(msg);
        // 即使失败也尝试用 fallback
        if (currentFallback) {
          setAudioManifestRef.current(currentFallback);
          setTemplateAudioMissing(Object.keys(currentFallback.audioMap ?? {}).length === 0);
        } else {
          setTemplateAudioMissing(true);
        }
        setManifestReady(true);
      });
    // ⚠️ 依赖数组不包含 speech 和 fallbackManifest（通过 ref 访问），避免引用变化中断请求
  }, [enabled, token, key, fallbackKey, templateId, planId]);

  return { manifestReady, manifestError, templateAudioMissing };
}
