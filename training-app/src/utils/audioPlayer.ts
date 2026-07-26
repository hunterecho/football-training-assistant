/**
 * 音频播放器 - 优先使用预生成的 TTS 音频文件
 * 在微信环境下比 speechSynthesis 更可靠
 */

let audioCtx: AudioContext | null = null;
const preloadedCache = new Map<string, HTMLAudioElement>();

function ensureAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume().catch(() => undefined);
  }
  return audioCtx;
}

/**
 * 预加载音频文件，减少首次播放延迟
 */
export function preloadAudio(url: string): void {
  if (preloadedCache.has(url)) return;
  try {
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.load();
    preloadedCache.set(url, audio);
  } catch {
    // noop
  }
}

/**
 * 播放音频文件，返回 Promise
 * 在微信环境下也能正常工作（需要先 unlock）
 */
export function playAudioUrl(url: string, volume = 1): Promise<void> {
  return new Promise((resolve) => {
    if (!url) {
      resolve();
      return;
    }

    // 确保 AudioContext 已激活（微信解锁）
    ensureAudioCtx();

    let audio = preloadedCache.get(url);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = 'auto';
      preloadedCache.set(url, audio);
    }

    // 重置播放位置
    audio.currentTime = 0;
    audio.volume = Math.max(0, Math.min(1, volume));

    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      audio!.removeEventListener('ended', finish);
      audio!.removeEventListener('error', finish);
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

    // 超时保护：最长 30 秒后自动 resolve
    window.setTimeout(() => finish(), 30000);
  });
}

/**
 * 停止指定 URL 的音频
 */
export function stopAudio(url: string): void {
  const audio = preloadedCache.get(url);
  if (audio) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // noop
    }
  }
}

/**
 * 停止所有缓存的音频
 */
export function stopAllAudio(): void {
  for (const audio of preloadedCache.values()) {
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {
      // noop
    }
  }
}
