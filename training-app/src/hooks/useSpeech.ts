import { useCallback, useEffect, useRef, useState } from 'react';
import { isWechatBrowser, isWechatIOS, unlockAudio } from '@/utils/wechat';
import { playAudioUrl, stopAllAudio, preloadAudio } from '@/utils/audioPlayer';
import type { AudioManifest } from '@/types';

type UseSpeechOptions = {
  enabled: boolean;
  rate?: number;
  volume?: number;
  voiceIndex?: number;
};

type QueueItem = {
  text: string;
  priority: 'high' | 'normal';
  /** 如果有 audioUrl，优先播放预生成音频文件，串行处理 */
  audioUrl?: string;
};

type FallbackBeepType = 'start' | 'end' | 'countdown' | 'alert';

export function useSpeech(options: UseSpeechOptions) {
  const { enabled, rate = 1.2, volume = 1, voiceIndex = 0 } = options;
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const speakingRef = useRef(false);
  const enabledRef = useRef(enabled);
  const rateRef = useRef(rate);
  const volumeRef = useRef(volume);
  const voiceIndexRef = useRef(voiceIndex);
  const isProcessingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const fallbackBeepRef = useRef(false);
  // 预生成音频映射: text -> url
  const audioMapRef = useRef<Map<string, string>>(new Map());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [lastError, setLastError] = useState<string>('');
  const [speaking, setSpeaking] = useState(false);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { voiceIndexRef.current = voiceIndex; }, [voiceIndex]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    unlockAudio();

    const wechat = isWechatBrowser();
    const wechatIOS = isWechatIOS();

    if (wechat && supported) {
      const testTimer = window.setTimeout(() => {
        try {
          const voices = window.speechSynthesis.getVoices();
          if (voices.length === 0 || wechatIOS) {
            setUseFallback(true);
            fallbackBeepRef.current = true;
          }
        } catch {
          setUseFallback(true);
          fallbackBeepRef.current = true;
        }
      }, 1000);
      return () => window.clearTimeout(testTimer);
    }

    if (!supported) {
      setUseFallback(true);
      fallbackBeepRef.current = true;
    }
  }, [supported]);

  const ensureAudioCtx = useCallback((): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtxRef.current = new Ctor();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
    return ctx;
  }, []);

  const playFallbackBeep = useCallback((type: FallbackBeepType = 'alert') => {
    if (!enabledRef.current) return;
    const ctx = ensureAudioCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0, now);

    let freq = 880;
    let duration = 0.15;
    let pattern: { freq: number; dur: number; gap?: number }[] = [];

    switch (type) {
      case 'start':
        pattern = [
          { freq: 660, dur: 0.1 },
          { freq: 880, dur: 0.15, gap: 0.05 },
        ];
        break;
      case 'end':
        pattern = [
          { freq: 880, dur: 0.1 },
          { freq: 660, dur: 0.1, gap: 0.05 },
          { freq: 440, dur: 0.2, gap: 0.05 },
        ];
        break;
      case 'countdown':
        pattern = [{ freq: 1200, dur: 0.08 }];
        break;
      case 'alert':
      default:
        pattern = [{ freq: 880, dur: 0.12 }];
        break;
    }

    let t = now;
    pattern.forEach((p) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = p.freq;
      osc.connect(gain);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volumeRef.current * 0.3, t + 0.01);
      gain.gain.linearRampToValueAtTime(0.0001, t + p.dur);
      osc.start(t);
      osc.stop(t + p.dur + 0.02);
      t += p.dur + (p.gap ?? 0);
    });
  }, [ensureAudioCtx]);

  const vibrate = useCallback((pattern: number | number[] = 100) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch {
        // noop
      }
    }
  }, []);

  useEffect(() => {
    if (!supported) return;

    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) {
        voicesRef.current = v;
        setVoices(v);
      }
    };

    load();
    window.speechSynthesis.onvoiceschanged = load;

    const pollTimer = window.setInterval(() => {
      if (voicesRef.current.length === 0) load();
    }, 200);

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.clearInterval(pollTimer);
    };
  }, [supported]);

  useEffect(() => {
    if (!enabled && supported) {
      queueRef.current = [];
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      speakingRef.current = false;
      setSpeaking(false);
      isProcessingRef.current = false;
    }
  }, [enabled, supported]);

  const pickVoice = useCallback((): SpeechSynthesisVoice | null => {
    const list = voicesRef.current;
    if (list.length === 0) return null;
    const zh = list.find((v) => v.lang.toLowerCase().startsWith('zh'));
    if (zh) return zh;
    return list[Math.min(voiceIndexRef.current, list.length - 1)] ?? null;
  }, []);

  // 处理预生成音频文件的串行播放
  // 使用独立的 Audio 实例（不通过 preloadedCache），避免并发时互相重置
  const playAudioItem = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!url) {
        resolve();
        return;
      }

      // 确保 AudioContext 已激活（微信解锁）
      ensureAudioCtx();

      // 使用新的 Audio 实例，避免 preloadedCache 中的实例被并发重置
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.volume = Math.max(0, Math.min(1, volumeRef.current));

      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        audio.removeEventListener('ended', finish);
        audio.removeEventListener('error', finish);
        resolve();
      };

      audio.addEventListener('ended', finish, { once: true });
      audio.addEventListener('error', finish, { once: true });

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // 播放失败（可能未解锁），静默处理
          finish();
        });
      }

      // 超时保护：最长 60 秒后自动 resolve
      window.setTimeout(() => finish(), 60000);
    });
  }, [ensureAudioCtx]);

  // 统一的队列处理：先处理预生成音频，再处理 speechSynthesis
  const processQueue = useCallback(async () => {
    if (!enabledRef.current) return;
    if (isProcessingRef.current) return;

    // 1. 优先处理预生成音频（必须串行，一次只播一个）
    const audioItem = queueRef.current.find((item) => item.audioUrl);
    if (audioItem) {
      // 如果正在播放 speechSynthesis，先取消
      if (supported && window.speechSynthesis.speaking) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      }

      isProcessingRef.current = true;
      speakingRef.current = true;
      setSpeaking(true);

      // 从队列中移除
      queueRef.current = queueRef.current.filter((item) => item !== audioItem);

      const audioUrl = audioItem.audioUrl!;
      console.log('[speech] ✅ 播放预生成音频:', audioItem.text.slice(0, 40));

      await playAudioItem(audioUrl);

      isProcessingRef.current = false;
      speakingRef.current = false;
      setSpeaking(false);

      // 继续处理下一个
      if (queueRef.current.length > 0) {
        processQueue();
      }
      return;
    }

    // 2. 处理 speechSynthesis 队列
    if (!supported) return;
    if (window.speechSynthesis.speaking) return;

    const highPriority = queueRef.current.find((item) => item.priority === 'high');
    const next = highPriority || queueRef.current.shift();
    if (!next) {
      isProcessingRef.current = false;
      speakingRef.current = false;
      setSpeaking(false);
      return;
    }

    if (highPriority) {
      queueRef.current = queueRef.current.filter((item) => item !== next);
    }

    isProcessingRef.current = true;
    speakingRef.current = true;
    setSpeaking(true);

    const u = new SpeechSynthesisUtterance(next.text);
    u.lang = 'zh-CN';
    u.rate = rateRef.current;
    u.volume = volumeRef.current;
    const v = pickVoice();
    if (v) u.voice = v;

    u.onstart = () => {
      speakingRef.current = true;
      setSpeaking(true);
    };

    u.onend = () => {
      isProcessingRef.current = false;
      speakingRef.current = false;
      setSpeaking(false);
      if (!enabledRef.current) return;
      processQueue();
    };

    u.onerror = (e) => {
      isProcessingRef.current = false;
      speakingRef.current = false;
      setSpeaking(false);
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        setLastError(`speech error: ${e.error}`);
        if (!fallbackBeepRef.current) {
          setUseFallback(true);
          fallbackBeepRef.current = true;
        }
      }
      if (!enabledRef.current) return;
      processQueue();
    };

    try {
      window.speechSynthesis.speak(u);
    } catch (err) {
      setLastError(`speak failed: ${String(err)}`);
      isProcessingRef.current = false;
      speakingRef.current = false;
      setSpeaking(false);
      if (!fallbackBeepRef.current) {
        setUseFallback(true);
        fallbackBeepRef.current = true;
      }
      processQueue();
    }
  }, [supported, pickVoice, playAudioItem]);

  // 规范化文本用于 audioMap 查找：移除所有空白字符
  const normalizeText = (s: string): string => s.replace(/\s+/g, '').toLowerCase();

  // 设置预生成的音频清单
  const setAudioManifest = useCallback((manifest: AudioManifest | null) => {
    const map = new Map<string, string>();
    if (manifest?.audioMap) {
      for (const [text, entry] of Object.entries(manifest.audioMap)) {
        // 存储原始 key 和规范化 key 两份，提高匹配率
        map.set(text, entry.url);
        const norm = normalizeText(text);
        if (norm !== text) {
          map.set(norm, entry.url);
        }
        // 预加载音频文件
        preloadAudio(entry.url);
      }
    }
    audioMapRef.current = map;
    console.log('[speech] setAudioManifest: audioMap 条目数 =', map.size, '(manifest audioMap keys =', Object.keys(manifest?.audioMap ?? {}).length, ')');
  }, []);

  const enqueue = useCallback(
    (text: string, priority: 'high' | 'normal' = 'normal') => {
      if (!enabledRef.current) return;
      if (!text) return;

      // 查找预生成音频
      let audioUrl = audioMapRef.current.get(text);
      if (!audioUrl) {
        audioUrl = audioMapRef.current.get(normalizeText(text));
      }

      if (audioUrl) {
        // 预生成音频加入队列，串行播放
        // 高优先级：清空已有队列
        if (priority === 'high') {
          stopAllAudio();
          if (supported) {
            try { window.speechSynthesis.cancel(); } catch { /* noop */ }
          }
          queueRef.current = [{ text, priority, audioUrl }];
          isProcessingRef.current = false;
          processQueue();
          return;
        }

        // 低优先级：加入队列（去重）
        const existing = queueRef.current.find(
          (item) => item.text === text && item.priority === 'normal' && item.audioUrl === audioUrl
        );
        if (!existing) {
          queueRef.current.push({ text, priority, audioUrl });
        }

        // 如果当前没有在处理队列，开始处理
        if (!isProcessingRef.current) {
          processQueue();
        }
        return;
      }

      // audioMap 中找不到该文本——记录便于排查 key 不匹配问题
      console.warn('[speech] ❌ audioMap 未命中，走兜底:', text.slice(0, 40), '| audioMap.size=', audioMapRef.current.size);

      if (fallbackBeepRef.current || !supported) {
        const lower = text.toLowerCase();
        if (lower.includes('开始') || lower.includes('现在')) {
          playFallbackBeep('start');
          vibrate([50, 30, 50]);
        } else if (lower.includes('完成') || lower.includes('结束') || lower.includes('辛苦')) {
          playFallbackBeep('end');
          vibrate([100, 50, 100, 50, 100]);
        } else if (/^\d+$/.test(text.trim())) {
          playFallbackBeep('countdown');
          vibrate(80);
        } else {
          playFallbackBeep('alert');
          vibrate(100);
        }
        return;
      }

      if (priority === 'high') {
        queueRef.current = [{ text, priority }];
        if (window.speechSynthesis.speaking) {
          try { window.speechSynthesis.cancel(); } catch { /* noop */ }
        }
        isProcessingRef.current = false;
        processQueue();
        return;
      }

      const existing = queueRef.current.find((item) => item.text === text && item.priority === 'normal');
      if (!existing) {
        queueRef.current.push({ text, priority });
      }

      if (!window.speechSynthesis.speaking && !isProcessingRef.current) {
        processQueue();
      }
    },
    [supported, processQueue, playFallbackBeep, vibrate]
  );

  const speak = useCallback(
    (text: string) => {
      enqueue(text, 'normal');
    },
    [enqueue]
  );

  const clear = useCallback(() => {
    queueRef.current = [];
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    stopAllAudio();
    speakingRef.current = false;
    setSpeaking(false);
    isProcessingRef.current = false;
  }, [supported]);

  const stop = useCallback(() => {
    queueRef.current = [];
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    stopAllAudio();
    speakingRef.current = false;
    setSpeaking(false);
    isProcessingRef.current = false;
  }, [supported]);

  const pause = useCallback(() => {
    if (supported) {
      try { window.speechSynthesis.pause(); } catch { /* noop */ }
    }
    // 暂停预生成音频
    stopAllAudio();
    speakingRef.current = false;
  }, [supported]);

  const resume = useCallback(() => {
    if (enabledRef.current && supported) {
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
      // 恢复后检查队列：如果 speechSynthesis 没在播放但队列有待播放项，继续处理
      window.setTimeout(() => {
        if (!enabledRef.current) return;
        if (!isProcessingRef.current && queueRef.current.length > 0) {
          processQueue();
        }
      }, 200);
    }
    ensureAudioCtx();
  }, [supported, ensureAudioCtx, processQueue]);

  const debug = {
    supported,
    voiceCount: voices.length,
    voices: voices.map((v) => `${v.name} (${v.lang})`),
    lastError,
    useFallback,
    isWechat: isWechatBrowser(),
  };

  return { speak, enqueue, clear, pause, resume, stop, speaking, supported, debug, useFallback, playFallbackBeep, vibrate, setAudioManifest };
}
