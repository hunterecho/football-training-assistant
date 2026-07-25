export function isWechatBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return ua.includes('micromessenger');
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua);
}

export function isWechatIOS(): boolean {
  return isWechatBrowser() && isIOS();
}

export function isWechatAndroid(): boolean {
  return isWechatBrowser() && !isIOS();
}

let audioUnlocked = false;

export function unlockAudio(): void {
  if (audioUnlocked) return;
  if (typeof window === 'undefined') return;

  const tryUnlock = () => {
    if (audioUnlocked) return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(0.01);
      ctx.close().catch(() => undefined);
    }

    if ('speechSynthesis' in window) {
      try {
        const u = new SpeechSynthesisUtterance('');
        u.volume = 0;
        window.speechSynthesis.speak(u);
        window.speechSynthesis.cancel();
      } catch {
        // noop
      }
    }

    const audio = document.getElementById('audio-context-bootstrap') as HTMLAudioElement | null;
    if (audio) {
      audio.play().then(() => {
        audio.pause();
      }).catch(() => undefined);
    }

    audioUnlocked = true;
    window.removeEventListener('touchstart', tryUnlock);
    window.removeEventListener('click', tryUnlock);
    window.removeEventListener('keydown', tryUnlock);
  };

  window.addEventListener('touchstart', tryUnlock, { once: true, passive: true });
  window.addEventListener('click', tryUnlock, { once: true });
  window.addEventListener('keydown', tryUnlock, { once: true });
}

export function isAudioUnlocked(): boolean {
  return audioUnlocked;
}

export function getWechatFloatingGuideText(): string {
  if (isWechatIOS()) {
    return '点击右上角「...」→ 选择「浮窗」，训练中可随时查看';
  }
  if (isWechatAndroid()) {
    return '点击右上角「...」→ 选择「浮窗」，训练中可随时查看';
  }
  return '微信浮窗功能可让训练页面悬浮显示';
}
