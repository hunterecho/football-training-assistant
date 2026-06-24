import { useCallback, useEffect, useRef, useState } from 'react';

type UseSpeechOptions = {
  enabled: boolean;
  rate?: number;
  volume?: number;
  voiceIndex?: number;
};

export function useSpeech(options: UseSpeechOptions) {
  const { enabled, rate = 1, volume = 1, voiceIndex = 0 } = options;
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const queueRef = useRef<string[]>([]);
  const speakingRef = useRef(false);
  const pausedRef = useRef(false);
  const enabledRef = useRef(enabled);
  const rateRef = useRef(rate);
  const volumeRef = useRef(volume);
  const voiceIndexRef = useRef(voiceIndex);
  const speakRef = useRef<(text: string) => void>(() => {});
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [lastError, setLastError] = useState<string>('');

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
      pausedRef.current = false;
    }
  }, [enabled, supported]);

  const pickVoice = useCallback((): SpeechSynthesisVoice | null => {
    const list = voicesRef.current;
    if (list.length === 0) return null;
    const zh = list.find((v) => v.lang.toLowerCase().startsWith('zh'));
    if (zh) return zh;
    return list[Math.min(voiceIndexRef.current, list.length - 1)] ?? null;
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      if (!enabledRef.current) return;
      if (!text) return;

      const synth = window.speechSynthesis;

      // Chrome bug: wake up the engine with a tiny resume() call.
      if (!synth.speaking && !synth.paused) {
        try { synth.resume(); } catch { /* noop */ }
      }

      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      u.rate = rateRef.current;
      u.volume = volumeRef.current;
      const v = pickVoice();
      if (v) u.voice = v;

      u.onstart = () => { speakingRef.current = true; };
      u.onend = () => {
        speakingRef.current = false;
        if (!enabledRef.current || pausedRef.current) return;
        const next = queueRef.current.shift();
        if (next) speakRef.current(next);
      };
      u.onerror = (e) => {
        if (e.error === 'canceled' || e.error === 'interrupted') {
          speakingRef.current = false;
          if (!enabledRef.current || pausedRef.current) return;
          const next = queueRef.current.shift();
          if (next) speakRef.current(next);
          return;
        }
        setLastError(`speech error: ${e.error}`);
        speakingRef.current = false;
        if (!enabledRef.current || pausedRef.current) return;
        const next = queueRef.current.shift();
        if (next) speakRef.current(next);
      };

      speakingRef.current = true;
      try {
        synth.speak(u);
      } catch (err) {
        setLastError(`speak failed: ${String(err)}`);
        speakingRef.current = false;
      }
    },
    [supported, pickVoice]
  );

  // Keep speakRef in sync so closures can call the latest speak function.
  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  const enqueue = useCallback(
    (text: string) => {
      if (!supported) return;
      if (!enabledRef.current) return;

      const synth = window.speechSynthesis;

      if (!synth.speaking && !synth.paused && !speakingRef.current) {
        speakRef.current(text);
      } else {
        queueRef.current.push(text);
      }
    },
    [supported]
  );

  const clear = useCallback(() => {
    if (!supported) return;
    queueRef.current = [];
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    speakingRef.current = false;
    pausedRef.current = false;
  }, [supported]);

  const pause = useCallback(() => {
    if (!supported) return;
    pausedRef.current = true;
    try { window.speechSynthesis.pause(); } catch { /* noop */ }
  }, [supported]);

  const resume = useCallback(() => {
    if (!supported) return;
    pausedRef.current = false;
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

  return { speak, enqueue, clear, pause, resume, supported, debug };
}

