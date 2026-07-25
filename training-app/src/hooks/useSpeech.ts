import { useCallback, useEffect, useRef, useState } from 'react';
import { isWechatBrowser, isWechatIOS, unlockAudio } from '@/utils/wechat';

type UseSpeechOptions = {
  enabled: boolean;
  rate?: number;
  volume?: number;
  voiceIndex?: number;
};

type QueueItem = {
  text: string;
  priority: 'high' | 'normal';
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

  const processQueue = useCallback(() => {
    if (!supported) return;
    if (!enabledRef.current) return;
    if (isProcessingRef.current) return;
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
  }, [supported, pickVoice]);

  const enqueue = useCallback(
    (text: string, priority: 'high' | 'normal' = 'normal') => {
      if (!enabledRef.current) return;
      if (!text) return;

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
    speakingRef.current = false;
    setSpeaking(false);
    isProcessingRef.current = false;
  }, [supported]);

  const stop = useCallback(() => {
    queueRef.current = [];
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    speakingRef.current = false;
    setSpeaking(false);
    isProcessingRef.current = false;
  }, [supported]);

  const pause = useCallback(() => {
    if (supported) {
      try { window.speechSynthesis.pause(); } catch { /* noop */ }
    }
  }, [supported]);

  const resume = useCallback(() => {
    if (enabledRef.current && supported) {
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
    }
    ensureAudioCtx();
  }, [supported, ensureAudioCtx]);

  const debug = {
    supported,
    voiceCount: voices.length,
    voices: voices.map((v) => `${v.name} (${v.lang})`),
    lastError,
    useFallback,
    isWechat: isWechatBrowser(),
  };

  return { speak, enqueue, clear, pause, resume, stop, speaking, supported, debug, useFallback, playFallbackBeep, vibrate };
}
