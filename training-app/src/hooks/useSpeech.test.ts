import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSpeech } from './useSpeech';
import type { AudioManifest } from '@/types';

// ===== Mock 依赖模块避免副作用 =====
vi.mock('@/utils/wechat', () => ({
  isWechatBrowser: () => false,
  isWechatIOS: () => false,
  unlockAudio: () => {},
}));

vi.mock('@/utils/audioPlayer', () => ({
  preloadAudio: vi.fn(),
}));

// ===== Mock Audio =====
class MockAudio {
  src = '';
  preload = '';
  volume = 1;
  paused = false;
  private listeners: Record<string, Set<EventListener>> = {};
  static instances: MockAudio[] = [];

  constructor(src?: string) {
    if (src) this.src = src;
    MockAudio.instances.push(this);
  }
  play() {
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(listener);
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners[type]?.delete(listener);
  }
  // 辅助方法：触发 ended 事件以推进队列
  _triggerEnded() {
    this.listeners['ended']?.forEach((l) => l({} as any));
  }
  static reset() {
    MockAudio.instances = [];
  }
}

global.Audio = MockAudio as any;

// ===== Mock SpeechSynthesisUtterance（jsdom 不提供）=====
global.SpeechSynthesisUtterance = class MockUtterance {
  text: string;
  lang = '';
  rate = 1;
  volume = 1;
  voice: any = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
} as any;

// ===== Mock speechSynthesis =====
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
Object.defineProperty(window, 'speechSynthesis', {
  value: {
    speak: mockSpeak,
    cancel: mockCancel,
    speaking: false,
    paused: false,
    resume: vi.fn(),
    pause: vi.fn(),
    getVoices: () => [],
    onvoiceschanged: null,
  },
  writable: true,
});

// 刷新微任务
const flush = () => new Promise<void>((r) => setTimeout(r, 0));

// 辅助：构造 manifest
function makeManifest(key: string, url = 'https://example.com/audio.mp3'): AudioManifest {
  return {
    voice: 'zh-CN-YunxiNeural',
    rate: '+0%',
    generatedAt: '2026-01-01T00:00:00.000Z',
    audioMap: { [key]: { text: key, url, hash: 'fakehash' } },
  };
}

describe('useSpeech', () => {
  beforeEach(() => {
    MockAudio.reset();
    mockSpeak.mockClear();
    mockCancel.mockClear();
  });

  // ========== 1. normalizeText（通过 audioMap 匹配间接验证）==========
  describe('normalizeText（通过 audioMap 匹配间接验证）', () => {
    it('能匹配含 & 的文本', async () => {
      const { result } = renderHook(() => useSpeech({ enabled: true }));
      act(() => result.current.setAudioManifest(makeManifest('热身 & 拉伸')));
      act(() => result.current.enqueue('热身 & 拉伸'));
      await flush();
      // audioUrl 命中：应创建 Audio，而非走 speechSynthesis
      expect(MockAudio.instances.length).toBe(1);
      expect(MockAudio.instances[0].src).toBe('https://example.com/audio.mp3');
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('能匹配含 &amp; HTML 实体的文本', async () => {
      const { result } = renderHook(() => useSpeech({ enabled: true }));
      // manifest 存储 "热身 & 拉伸"
      act(() => result.current.setAudioManifest(makeManifest('热身 & 拉伸')));
      // enqueue "热身 &amp; 拉伸"，normalizeText 解码 &amp; → & 后应命中
      act(() => result.current.enqueue('热身 &amp; 拉伸'));
      await flush();
      expect(MockAudio.instances.length).toBe(1);
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('能匹配含全角标点的文本', async () => {
      const { result } = renderHook(() => useSpeech({ enabled: true }));
      // manifest 存储半角逗号
      act(() => result.current.setAudioManifest(makeManifest('热身,拉伸')));
      // enqueue 全角逗号，normalizeText 转半角后应命中
      act(() => result.current.enqueue('热身，拉伸'));
      await flush();
      expect(MockAudio.instances.length).toBe(1);
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('能匹配含多余空格的文本', async () => {
      const { result } = renderHook(() => useSpeech({ enabled: true }));
      act(() => result.current.setAudioManifest(makeManifest('热身 拉伸')));
      // enqueue 含多个空格，normalizeText 移除所有空白后应命中
      act(() => result.current.enqueue('  热身   拉伸  '));
      await flush();
      expect(MockAudio.instances.length).toBe(1);
      expect(mockSpeak).not.toHaveBeenCalled();
    });
  });

  // ========== 2. 队列串行播放 ==========
  describe('队列串行播放', () => {
    it('enqueue 多个音频后应按顺序串行播放', async () => {
      const { result } = renderHook(() => useSpeech({ enabled: true }));
      act(() => {
        result.current.setAudioManifest({
          voice: 'v',
          rate: '+0%',
          generatedAt: '',
          audioMap: {
            A: { text: 'A', url: 'https://example.com/a.mp3', hash: 'a' },
            B: { text: 'B', url: 'https://example.com/b.mp3', hash: 'b' },
            C: { text: 'C', url: 'https://example.com/c.mp3', hash: 'c' },
          },
        });
      });

      act(() => {
        result.current.enqueue('A');
        result.current.enqueue('B');
        result.current.enqueue('C');
      });
      await flush();

      // 串行：此时应只创建了 A 的 Audio（B、C 在队列等待）
      expect(MockAudio.instances.length).toBe(1);
      expect(MockAudio.instances[0].src).toBe('https://example.com/a.mp3');

      // 触发 A 的 ended，B 应开始播放
      await act(async () => {
        (MockAudio.instances[0] as any)._triggerEnded();
      });
      expect(MockAudio.instances.length).toBe(2);
      expect(MockAudio.instances[1].src).toBe('https://example.com/b.mp3');

      // 触发 B 的 ended，C 应开始播放
      await act(async () => {
        (MockAudio.instances[1] as any)._triggerEnded();
      });
      expect(MockAudio.instances.length).toBe(3);
      expect(MockAudio.instances[2].src).toBe('https://example.com/c.mp3');
    });

    it('clear() 应停止当前播放并清空队列', async () => {
      const { result } = renderHook(() => useSpeech({ enabled: true }));
      act(() => {
        result.current.setAudioManifest({
          voice: 'v',
          rate: '+0%',
          generatedAt: '',
          audioMap: {
            A: { text: 'A', url: 'https://example.com/a.mp3', hash: 'a' },
            B: { text: 'B', url: 'https://example.com/b.mp3', hash: 'b' },
          },
        });
      });

      act(() => {
        result.current.enqueue('A');
        result.current.enqueue('B');
      });
      await flush();
      expect(MockAudio.instances.length).toBe(1);

      // 调用 clear
      act(() => {
        result.current.clear();
      });
      // cancel 被调用，当前 audio 被暂停并清空 src
      expect(mockCancel).toHaveBeenCalled();
      expect(MockAudio.instances[0].src).toBe('');
      expect(MockAudio.instances[0].paused).toBe(true);

      // 触发 A 的 ended（模拟 clear 前的回调），队列已清空，B 不应播放
      await act(async () => {
        (MockAudio.instances[0] as any)._triggerEnded();
      });
      expect(MockAudio.instances.length).toBe(1);
    });
  });

  // ========== 3. audioMap 匹配 ==========
  describe('audioMap 匹配', () => {
    it('setAudioManifest 设置后 enqueue 能命中预生成音频', async () => {
      const { result } = renderHook(() => useSpeech({ enabled: true }));
      act(() =>
        result.current.setAudioManifest(makeManifest('开球', 'https://example.com/kickoff.mp3'))
      );
      act(() => result.current.enqueue('开球'));
      await flush();
      expect(MockAudio.instances.length).toBe(1);
      expect(MockAudio.instances[0].src).toBe('https://example.com/kickoff.mp3');
      expect(mockSpeak).not.toHaveBeenCalled();
    });

    it('未命中的文本走兜底（speechSynthesis）', async () => {
      const { result } = renderHook(() => useSpeech({ enabled: true }));
      act(() =>
        result.current.setAudioManifest(makeManifest('开球', 'https://example.com/kickoff.mp3'))
      );
      // 不在 manifest 中的文本
      act(() => result.current.enqueue('不在 manifest 中的文本'));
      await flush();
      // 兜底走 speechSynthesis：不应创建 Audio
      expect(MockAudio.instances.length).toBe(0);
      expect(mockSpeak).toHaveBeenCalledTimes(1);
    });
  });
});
