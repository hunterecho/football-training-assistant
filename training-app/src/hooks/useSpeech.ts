import { useCallback, useEffect, useRef, useState } from 'react';

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
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [lastError, setLastError] = useState<string>('');
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { voiceIndexRef.current = voiceIndex; }, [voiceIndex]);

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
      processQueue();
    }
  }, [supported, pickVoice]);

  const enqueue = useCallback(
    (text: string, priority: 'high' | 'normal' = 'normal') => {
      if (!supported) return;
      if (!enabledRef.current) return;
      if (!text) return;

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
    [supported, processQueue]
  );

  const speak = useCallback(
    (text: string) => {
      enqueue(text, 'normal');
    },
    [enqueue]
  );

  const clear = useCallback(() => {
    if (!supported) return;
    queueRef.current = [];
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    speakingRef.current = false;
    setSpeaking(false);
    isProcessingRef.current = false;
  }, [supported]);

  const stop = useCallback(() => {
    if (!supported) return;
    queueRef.current = [];
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    speakingRef.current = false;
    setSpeaking(false);
    isProcessingRef.current = false;
  }, [supported]);

  const pause = useCallback(() => {
    if (!supported) return;
    try { window.speechSynthesis.pause(); } catch { /* noop */ }
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    if (enabledRef.current) {
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
    }
  }, [supported]);

  const debug = {
    supported,
    voiceCount: voices.length,
    voices: voices.map((v) => `${v.name} (${v.lang})`),
    lastError,
  };

  return { speak, enqueue, clear, pause, resume, stop, speaking, supported, debug };
}
