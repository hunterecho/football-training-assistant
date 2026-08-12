import { useCallback, useEffect, useRef, useState } from 'react';
import { isWechatBrowser, isWechatIOS, unlockAudio } from '@/utils/wechat';
import { preloadAudio } from '@/utils/audioPlayer';
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

/**
 * 规范化文本用于 audioMap 查找：
 * 1. 移除所有空白字符
 * 2. 转为小写
 * 3. 解码 HTML 实体（&amp; → & 等）
 * 4. 统一全角/半角标点
 */
function normalizeText(s: string): string {
  return s
    .replace(/\s+/g, '')
    .toLowerCase()
    // 解码常见 HTML 实体
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // 统一全角标点为半角
    .replace(/\u3000/g, ' ')
    .replace(/，/g, ',')
    .replace(/。/g, '.')
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .replace(/！/g, '!')
    .replace(/？/g, '?')
    .replace(/（/g, '(')
    .replace(/）/g, ')');
}

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
  // 复用的单例 Audio 实例：避免微信限制多 Audio 实例
  const audioItemRef = useRef<HTMLAudioElement | null>(null);
  // 预生成音频映射: normalizedText -> url
  const audioMapRef = useRef<Map<string, string>>(new Map());
  // 跟踪当前正在播放的 Audio 实例，用于 clear/stop 时停止
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
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
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
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
      // 停止当前播放的音频
      if (currentAudioRef.current) {
        try { currentAudioRef.current.pause(); currentAudioRef.current.src = ''; } catch { /* noop */ }
        currentAudioRef.current = null;
      }
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

  /**
   * 停止当前正在播放的预生成音频
   * 在切换环节、clear、stop 时调用
   */
  const stopCurrentAudio = useCallback(() => {
    // currentAudioRef 指向复用的单例 audioItemRef
    const audio = audioItemRef.current;
    if (audio) {
      try {
        audio.pause();
        // 清空前先取消事件绑定，避免残留事件触发
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplaythrough = null;
      } catch { /* noop */ }
    }
    currentAudioRef.current = null;
  }, []);

  // 处理预生成音频文件的串行播放
  // ⚠️ 微信环境适配：ended 事件在微信 webview 中经常不触发
  // 修复策略：
  // 1. 复用单例 Audio 实例（避免微信限制多 Audio 实例）
  // 2. 同时监听 ended / error / canplaythrough 事件（不用 { once }，onended/onerror 赋值）
  // 3. 启动 300ms 轮询 + ended 检测（endeded 事件不触发时靠轮询兜底）
  // 4. 超时从 60s 缩短为音频时长+5s，最长 15s
  const playAudioItem = useCallback((url: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!url) {
        resolve();
        return;
      }

      // 确保 AudioContext 已激活（微信解锁）
      ensureAudioCtx();

      // 复用单例 Audio：微信限制多 Audio 实例
      // 不调用 stopCurrentAudio()，避免破坏同一实例
      if (!audioItemRef.current) {
        audioItemRef.current = new Audio();
      }
      const audio = audioItemRef.current;
      // 先暂停再换 src（避免微信出现资源竞争）
      try { audio.pause(); } catch { /* noop */ }
      audio.preload = 'auto';
      audio.volume = Math.max(0, Math.min(1, volumeRef.current));
      currentAudioRef.current = audio;

      let resolved = false;
      let pollTimer: number | undefined;
      let hardTimeout: number | undefined;
      let estimatedMaxMs = 15000; // 默认最长 15s

      const finish = (reason: string) => {
        if (resolved) return;
        resolved = true;
        console.log('[speech] playAudioItem finish:', reason, 'url-tail=', url.slice(-30));
        if (pollTimer) window.clearInterval(pollTimer);
        if (hardTimeout) window.clearTimeout(hardTimeout);
        audio.onended = null;
        audio.onerror = null;
        audio.oncanplaythrough = null;
        if (currentAudioRef.current === audio) {
          // 不置 null，保持单例下次复用
          // currentAudioRef.current = null;
        }
        resolve();
      };

      audio.onended = () => finish('ended-event');
      audio.onerror = (e) => finish('error-event:' + String(e));
      audio.oncanplaythrough = () => {
        // 能播放时重新预估时长
        const dur = audio.duration;
        if (dur > 0 && isFinite(dur)) {
          if (hardTimeout) window.clearTimeout(hardTimeout);
          estimatedMaxMs = Math.max(3000, Math.min(15000, Math.ceil((dur + 3) * 1000)));
          hardTimeout = window.setTimeout(() => finish('hard-timeout'), estimatedMaxMs);
        }
      };

      audio.src = url;
      audio.load();

      // 轮询兜底：微信经常不触发 ended 事件
      // 每 300ms 检查一次 currentTime 是否抵达终点（或停止变化超过阈值）
      let lastPlaybackTime = 0;
      let stagnantCount = 0;
      pollTimer = window.setInterval(() => {
        if (resolved) return;
        try {
          if (audio.ended) {
            finish('poll-ended');
            return;
          }
          // 播放完成的另一个判断：currentTime >= duration - 0.2
          const dur = audio.duration;
          if (dur > 0 && isFinite(dur) && audio.currentTime >= dur - 0.15) {
            finish('poll-duration');
            return;
          }
          // 播放停滞检测：如果有时间但 1.5s 内没有前进（可能卡死）
          if (audio.currentTime > 0) {
            if (Math.abs(audio.currentTime - lastPlaybackTime) < 0.1) {
              stagnantCount++;
              if (stagnantCount >= 5) { // ~1.5s 没动
                finish('poll-stagnant');
                return;
              }
            } else {
              stagnantCount = 0;
            }
          }
          lastPlaybackTime = audio.currentTime;
        } catch { /* noop */ }
      }, 300);

      // 硬超时兜底：不管什么原因，最多 15s 就结束
      hardTimeout = window.setTimeout(() => finish('hard-timeout'), estimatedMaxMs);

      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise
          .then(() => {
            console.log('[speech] playAudioItem play() ok, duration=', audio.duration, 'stagnantCount=', stagnantCount);
          })
          .catch((err1) => {
            console.warn('[speech] playAudioItem first play rejected:', err1?.message || String(err1));
            // 重试一次：重新解锁 AudioContext
            ensureAudioCtx();
            const retryPromise = audio.play();
            if (retryPromise && typeof retryPromise.catch === 'function') {
              retryPromise.catch((err2) => {
                console.warn('[speech] playAudioItem retry also rejected:', err2?.message || String(err2));
                // 两次都失败，直接结束，避免卡住整条队列
                finish('play-rejected');
              });
            }
          });
      }
    });
  }, [ensureAudioCtx]);

  // 队列看门狗：如果 isProcessing=true 超过 30s，强制解锁继续处理下一条
  // 解决微信/移动端偶现的 Promise 永远不 resolve 导致队列卡死
  const queueWatchdogRef = useRef<number | undefined>(undefined);
  const processingStartedRef = useRef<number>(0);
  const processQueueRef = useRef<() => Promise<void>>(async () => {});

  // 统一的队列处理：严格 FIFO，按入队顺序依次播放
  // 解决之前的顺序错乱问题：旧代码用 find(item => item.audioUrl) 跳过了队首无音频项
  const processQueue = useCallback(async () => {
    if (!enabledRef.current) return;
    if (isProcessingRef.current) return;

    // 取队首元素（严格 FIFO）
    const next = queueRef.current.shift();
    if (!next) {
      isProcessingRef.current = false;
      speakingRef.current = false;
      setSpeaking(false);
      return;
    }

    isProcessingRef.current = true;
    speakingRef.current = true;
    setSpeaking(true);
    processingStartedRef.current = Date.now(); // 看门狗计时起点

    if (next.audioUrl) {
      // 预生成音频：串行播放
      console.log('[speech] ✅ 播放预生成音频:', next.text.slice(0, 40));
      // 取消可能正在播放的 speechSynthesis
      if (supported && window.speechSynthesis.speaking) {
        try { window.speechSynthesis.cancel(); } catch { /* noop */ }
      }
      await playAudioItem(next.audioUrl);
    } else if (fallbackBeepRef.current || !supported) {
      // 兜底提示音：根据文本内容选择提示音类型
      console.log('[speech] 🔔 播放兜底提示音:', next.text.slice(0, 40));
      const lower = next.text.toLowerCase();
      if (lower.includes('开始') || lower.includes('现在')) {
        playFallbackBeep('start');
        vibrate([50, 30, 50]);
      } else if (lower.includes('完成') || lower.includes('结束') || lower.includes('辛苦')) {
        playFallbackBeep('end');
        vibrate([100, 50, 100, 50, 100]);
      } else if (/^\d+$/.test(next.text.trim())) {
        playFallbackBeep('countdown');
        vibrate(80);
      } else {
        playFallbackBeep('alert');
        vibrate(100);
      }
      // 短暂延迟后继续下一条，避免提示音叠在一起
      await new Promise(resolve => setTimeout(resolve, 300));
    } else {
      // speechSynthesis 播报
      await new Promise<void>((resolve) => {
        const u = new SpeechSynthesisUtterance(next.text);
        u.lang = 'zh-CN';
        u.rate = rateRef.current;
        u.volume = volumeRef.current;
        const v = pickVoice();
        if (v) u.voice = v;

        let resolved = false;
        const done = () => {
          if (resolved) return;
          resolved = true;
          resolve();
        };

        u.onend = done;
        u.onerror = (e) => {
          if (e.error !== 'canceled' && e.error !== 'interrupted') {
            setLastError(`speech error: ${e.error}`);
            if (!fallbackBeepRef.current) {
              setUseFallback(true);
              fallbackBeepRef.current = true;
            }
          }
          done();
        };

        // 超时保护：10 秒后自动结束
        const timeout = window.setTimeout(done, 10000);

        try {
          window.speechSynthesis.speak(u);
        } catch (err) {
          setLastError(`speak failed: ${String(err)}`);
          window.clearTimeout(timeout);
          if (!fallbackBeepRef.current) {
            setUseFallback(true);
            fallbackBeepRef.current = true;
          }
          done();
        }
      });
    }

    isProcessingRef.current = false;
    speakingRef.current = false;
    setSpeaking(false);

    // 继续处理队列
    if (queueRef.current.length > 0 && enabledRef.current) {
      processQueue();
    }
  }, [supported, pickVoice, playAudioItem, playFallbackBeep, vibrate]);

  // 同步 processQueue 最新引用到 ref，供 watchdog 使用（避免声明顺序问题）
  processQueueRef.current = processQueue;

  // 队列看门狗：isProcessing=true 超过 30s 时强制解锁（processQueue 用 ref 访问，无声明顺序问题）
  useEffect(() => {
    if (queueWatchdogRef.current) return;
    queueWatchdogRef.current = window.setInterval(() => {
      if (isProcessingRef.current) {
        const elapsed = Date.now() - processingStartedRef.current;
        if (elapsed > 30000) {
          console.warn('[speech] ⚠️ 看门狗触发：processing 超过 30s，强制解锁队列，已处理=', elapsed, 'ms');
          stopCurrentAudio();
          if (supported) {
            try { window.speechSynthesis.cancel(); } catch { /* noop */ }
          }
          isProcessingRef.current = false;
          speakingRef.current = false;
          setSpeaking(false);
          if (queueRef.current.length > 0 && enabledRef.current) {
            // 不直接依赖 processQueue 标识符（声明在后面），通过 ref 访问
            void processQueueRef.current();
          }
        }
      }
    }, 1000);
    return () => {
      if (queueWatchdogRef.current) {
        window.clearInterval(queueWatchdogRef.current);
        queueWatchdogRef.current = undefined;
      }
    };
  }, [supported, stopCurrentAudio]);

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

      // 查找预生成音频：先原始 key，再规范化 key
      let audioUrl = audioMapRef.current.get(text);
      if (!audioUrl) {
        audioUrl = audioMapRef.current.get(normalizeText(text));
      }

      if (audioUrl) {
        console.log('[speech] enqueue hit:', text.slice(0, 40));
      } else {
        console.warn('[speech] enqueue miss:', text.slice(0, 40), '| audioMap.size=', audioMapRef.current.size);
      }

      const item: QueueItem = { text, priority, ...(audioUrl ? { audioUrl } : {}) };

      if (priority === 'high') {
        // 高优先级：清空队列，立即播放
        stopCurrentAudio();
        if (supported) {
          try { window.speechSynthesis.cancel(); } catch { /* noop */ }
        }
        queueRef.current = [item];
        isProcessingRef.current = false;
        processQueue();
        return;
      }

      // 低优先级：加入队列（去重）
      const existing = queueRef.current.find(
        (it) => it.text === text && it.priority === 'normal'
      );
      if (!existing) {
        queueRef.current.push(item);
      }

      // 如果当前没有在处理队列，开始处理
      if (!isProcessingRef.current) {
        processQueue();
      }
    },
    [supported, processQueue, stopCurrentAudio]
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
    stopCurrentAudio();
    speakingRef.current = false;
    setSpeaking(false);
    isProcessingRef.current = false;
  }, [supported, stopCurrentAudio]);

  const stop = useCallback(() => {
    queueRef.current = [];
    if (supported) {
      try { window.speechSynthesis.cancel(); } catch { /* noop */ }
    }
    stopCurrentAudio();
    speakingRef.current = false;
    setSpeaking(false);
    isProcessingRef.current = false;
  }, [supported, stopCurrentAudio]);

  const pause = useCallback(() => {
    if (supported) {
      try { window.speechSynthesis.pause(); } catch { /* noop */ }
    }
    stopCurrentAudio();
    speakingRef.current = false;
  }, [supported, stopCurrentAudio]);

  const resume = useCallback(() => {
    if (enabledRef.current && supported) {
      try { window.speechSynthesis.resume(); } catch { /* noop */ }
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
