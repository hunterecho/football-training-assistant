export function formatDuration(seconds: number): string {
  if (seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatDurationChinese(seconds: number): string {
  if (seconds <= 0) return '0 秒';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s} 秒`;
  if (s === 0) return `${m} 分钟`;
  return `${m} 分 ${s} 秒`;
}

export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  // 1 分 30 秒 / 1分30秒
  const zhMixed = t.match(/(\d+)\s*分\s*(\d+)\s*秒/);
  if (zhMixed) return parseInt(zhMixed[1]) * 60 + parseInt(zhMixed[2]);
  // 5 分钟 / 5 分
  const zhMin = t.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分|minute|min|m)\b/i);
  if (zhMin) return Math.round(parseFloat(zhMin[1]) * 60);
  // 30 秒
  const zhSec = t.match(/(\d+(?:\.\d+)?)\s*(?:秒钟|秒|second|sec|s)\b/i);
  if (zhSec) return Math.round(parseFloat(zhSec[1]));
  // plain number => seconds
  const num = t.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  if (num) return Math.round(parseFloat(num[1]));
  return null;
}

export function totalDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) {
    return `${h} 时 ${m} 分 ${s} 秒`;
  }
  if (m > 0) {
    return `${m} 分 ${s} 秒`;
  }
  return `${s} 秒`;
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
