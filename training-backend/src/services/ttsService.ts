import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { createHash } from 'crypto';
import { getAdminSupabase } from '../db/client';

// 云希男声 - 微软 Edge TTS 免费
export const DEFAULT_VOICE = 'zh-CN-YunxiNeural';
export const DEFAULT_RATE = '+0%';
export const DEFAULT_PITCH = '+0Hz';
export const DEFAULT_VOLUME = '+0%';

// MP3 格式，微信兼容性最好
const OUTPUT_FMT = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;

// Storage bucket 名称
export const TTS_BUCKET = 'tts-audio';

export type AudioManifestEntry = {
  text: string;
  url: string;
  hash: string;
};

export type AudioManifest = {
  voice: string;
  rate: string;
  generatedAt: string;
  audioMap: Record<string, AudioManifestEntry>;
};

/**
 * 生成文本内容的 hash，用于去重和存储路径
 */
export function textToHash(text: string, voice: string = DEFAULT_VOICE): string {
  return createHash('sha256')
    .update(`${voice}:${text}`)
    .digest('hex')
    .slice(0, 16);
}

/**
 * 生成 Storage 路径
 * 注意：路径不能包含中文字符，否则 Supabase Storage 会报 "Invalid key"
 * 使用纯 hash 作为文件名，相同文本+音色的音频可以跨用户复用
 */
export function storagePath(hash: string): string {
  return `${hash}.mp3`;
}

export type TtsGenerateResult =
  | { success: true; url: string; hash: string }
  | { success: false; error: string; stage: 'supabase' | 'tts-connect' | 'tts-generate' | 'tts-empty' | 'upload' };

/**
 * 使用 Edge TTS 生成单条音频并上传到 Supabase Storage
 * 返回带详细错误的结果对象
 */
export async function generateAndUploadAudio(
  text: string,
  userId: string,
  options: {
    voice?: string;
    rate?: string;
    pitch?: string;
    volume?: string;
  } = {}
): Promise<TtsGenerateResult> {
  const voice = options.voice ?? DEFAULT_VOICE;
  const rate = options.rate ?? DEFAULT_RATE;
  const pitch = options.pitch ?? DEFAULT_PITCH;
  const volume = options.volume ?? DEFAULT_VOLUME;

  const hash = textToHash(text, voice);
  const path = storagePath(hash);

  const sb = getAdminSupabase();
  if (!sb) {
    console.warn('[tts] Supabase not configured, skip upload');
    return { success: false, error: 'Supabase not configured', stage: 'supabase' };
  }

  // 构建 public URL（bucket 已设为 public）
  const publicUrl = `${sb.storage.from(TTS_BUCKET).getPublicUrl(path).data.publicUrl}`;

  // 先检查是否已存在（去重）
  try {
    const { data: existingList } = await sb.storage
      .from(TTS_BUCKET)
      .list('', { search: `${hash}.mp3` });
    if (existingList && existingList.length > 0) {
      console.log(`[tts] audio already exists: ${path}`);
      return { success: true, url: publicUrl, hash };
    }
  } catch {
    // 不存在，继续生成
  }

  // 用 Edge TTS 生成音频
  let audioBuffer: Buffer;
  try {
    const tts = new MsEdgeTTS();
    try {
      await tts.setMetadata(voice, OUTPUT_FMT);
    } catch (metaErr) {
      const msg = metaErr instanceof Error ? metaErr.message : String(metaErr);
      console.error('[tts] setMetadata (tts-connect) failed:', msg);
      return { success: false, error: `TTS连接失败: ${msg}`, stage: 'tts-connect' };
    }

    let audioStream: AsyncIterable<Buffer | Uint8Array>;
    try {
      const streamResult = tts.toStream(text, { rate, pitch, volume });
      audioStream = streamResult.audioStream;
    } catch (streamErr) {
      const msg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      console.error('[tts] toStream (tts-generate) failed:', msg);
      return { success: false, error: `TTS生成失败: ${msg}`, stage: 'tts-generate' };
    }

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      console.warn('[tts] generated empty audio for:', text.slice(0, 30));
      return { success: false, error: '生成音频为空 (0 字节)', stage: 'tts-empty' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tts] generation wrapper failed:', msg);
    return { success: false, error: `TTS生成异常: ${msg}`, stage: 'tts-generate' };
  }

  // 上传到 Supabase Storage
  try {
    const { error: uploadError } = await sb.storage
      .from(TTS_BUCKET)
      .upload(path, audioBuffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (uploadError) {
      console.error('[tts] upload failed:', uploadError.message);
      return { success: false, error: `上传失败: ${uploadError.message}`, stage: 'upload' };
    }

    console.log(`[tts] generated: ${path} (${audioBuffer.length} bytes)`);
    return { success: true, url: publicUrl, hash };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tts] storage error:', msg);
    return { success: false, error: `存储异常: ${msg}`, stage: 'upload' };
  }
}

function formatDurationChinese(seconds: number): string {
  if (seconds <= 0) return '0 秒';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `${s} 秒`;
  if (s === 0) return `${m} 分钟`;
  return `${m} 分 ${s} 秒`;
}

// 系统级公共语音：所有训练共享的固定文案 + 常见休息时长
// 这些在服务启动时预生成，训练时直接取，零 TTS 调用延迟
export const SYSTEM_REST_DURATIONS = [15, 20, 25, 30, 45, 60, 90, 120, 180];

export function getSystemTexts(): string[] {
  const texts: string[] = [
    '训练完成，大家辛苦了！',
    '还剩一分钟',
    '休息结束',
    '开始休息',
    '准备下一环节',
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
  ];
  for (const n of SYSTEM_REST_DURATIONS) {
    texts.push(`休息 ${formatDurationChinese(n)}`);
  }
  // 每分钟、每分的"已过 N 分钟，还剩..."这类文案太多，不预生成——训练时如果找不到就走兜底
  // 但补几个常用的"已过 1 分钟，还剩..."常见组合不值得，保持简洁
  return texts;
}

// 缓存系统级 manifest（服务启动时生成，不会变）
let cachedSystemManifest: AudioManifest | null = null;

export async function ensureSystemManifest(userId: string): Promise<AudioManifest> {
  if (cachedSystemManifest && Object.keys(cachedSystemManifest.audioMap).length > 0) {
    return cachedSystemManifest;
  }
  const texts = getSystemTexts();
  const result = await pregenerateAudios(texts, userId, { voice: DEFAULT_VOICE, rate: DEFAULT_RATE });
  // ⚠️ 关键：只有生成成功（audioMap 非空）才缓存
  // 之前如果 TTS 服务不可用导致全部失败，空 manifest 被缓存，后续请求永远返回空
  const audioCount = Object.keys(result.manifest.audioMap).length;
  if (audioCount > 0) {
    cachedSystemManifest = result.manifest;
    console.log(`[tts] system manifest ready: ${audioCount}/${texts.length} texts`);
  } else {
    console.warn(`[tts] system manifest 生成失败 (0/${texts.length})，不缓存，下次重试`);
  }
  return result.manifest;
}

/**
 * 从模板/计划的 drills 中提取所有需要预生成的文本
 * 只包含模板级文本（跟具体 drill 绑定），休息相关文案在系统级语音中
 */
export function extractTextsFromDrills(
  drills: Array<{
    title?: string;
    duration?: number;
    summary?: string;
    cues?: Array<{ text?: string }>;
  }>,
  _restDuration: number = 0
): string[] {
  const texts: string[] = [];

  for (const drill of drills) {
    if (drill.title) {
      const title = drill.title.trim();
      texts.push(title);
      const durationStr = drill.duration ? formatDurationChinese(drill.duration) : '';
      texts.push(`现在开始 ${title}，时长 ${durationStr}`);
      texts.push(`${title} 完成`);
    }
    if (drill.summary) {
      const summary = drill.summary.trim();
      if (summary) texts.push(summary);
    }
    if (drill.cues) {
      for (const cue of drill.cues) {
        if (cue.text) {
          const t = cue.text.trim();
          if (t) texts.push(t);
        }
      }
    }
  }

  return texts;
}

export type PregenerateErrorEntry = { text: string; error: string; stage: string };

export type PregenerateResult = {
  manifest: AudioManifest;
  errors: PregenerateErrorEntry[];
  totalTexts: number;
  successCount: number;
};

/**
 * 批量预生成音频，返回带错误详情的结果
 */
export async function pregenerateAudios(
  texts: string[],
  userId: string,
  options: {
    voice?: string;
    rate?: string;
  } = {}
): Promise<PregenerateResult> {
  const voice = options.voice ?? DEFAULT_VOICE;
  const rate = options.rate ?? DEFAULT_RATE;

  const audioMap: Record<string, AudioManifestEntry> = {};
  const errors: PregenerateErrorEntry[] = [];
  const dedupedTexts = Array.from(new Set(texts.filter((t) => !!t)));
  const totalTexts = dedupedTexts.length;
  let successCount = 0;

  // 串行生成，避免并发太多被限流
  for (const text of dedupedTexts) {
    const result = await generateAndUploadAudio(text, userId, { voice, rate });
    if (result.success) {
      audioMap[text] = {
        text,
        url: result.url,
        hash: result.hash,
      };
      successCount++;
    } else {
      errors.push({ text: text.length > 40 ? text.slice(0, 40) + '…' : text, error: result.error, stage: result.stage });
      // 只打印前 3 条错误到日志，避免刷屏
      if (errors.length <= 3) {
        console.warn(`[tts] failed #${errors.length}: [${result.stage}] ${result.error} for "${text.slice(0, 30)}"`);
      }
    }
  }

  if (errors.length > 0) {
    console.warn(`[tts] pregenerate summary: ${successCount}/${totalTexts} succeeded, ${errors.length} failed`);
  }

  return {
    manifest: {
      voice,
      rate,
      generatedAt: new Date().toISOString(),
      audioMap,
    },
    errors,
    totalTexts,
    successCount,
  };
}

/**
 * 确保 Storage bucket 存在
 */
export async function ensureTtsBucket(): Promise<void> {
  const sb = getAdminSupabase();
  if (!sb) return;

  try {
    const { data: buckets } = await sb.storage.listBuckets();
    const exists = buckets?.some((b) => b.name === TTS_BUCKET);
    if (!exists) {
      const { error } = await sb.storage.createBucket(TTS_BUCKET, {
        public: true,
        fileSizeLimit: '5MB',
      });
      if (error) {
        console.warn('[tts] create bucket failed:', error.message);
      } else {
        console.log('[tts] bucket created (public):', TTS_BUCKET);
      }
    } else {
      // 确保已存在的 bucket 是 public
      const bucket = buckets?.find((b) => b.name === TTS_BUCKET);
      if (bucket && !bucket.public) {
        const { error } = await sb.storage.updateBucket(TTS_BUCKET, {
          public: true,
          fileSizeLimit: '5MB',
        });
        if (error) {
          console.warn('[tts] update bucket to public failed:', error.message);
        } else {
          console.log('[tts] bucket updated to public:', TTS_BUCKET);
        }
      }
    }
  } catch (err) {
    console.warn('[tts] ensure bucket error:', err);
  }
}
