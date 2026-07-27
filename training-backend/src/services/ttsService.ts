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
 */
export function storagePath(userId: string, hash: string): string {
  return `${userId}/${hash}.mp3`;
}

/**
 * 使用 Edge TTS 生成单条音频并上传到 Supabase Storage
 * 返回公开访问 URL
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
): Promise<{ url: string; hash: string } | null> {
  const voice = options.voice ?? DEFAULT_VOICE;
  const rate = options.rate ?? DEFAULT_RATE;
  const pitch = options.pitch ?? DEFAULT_PITCH;
  const volume = options.volume ?? DEFAULT_VOLUME;

  const hash = textToHash(text, voice);
  const path = storagePath(userId, hash);

  const sb = getAdminSupabase();
  if (!sb) {
    console.warn('[tts] Supabase not configured, skip upload');
    return null;
  }

  // 构建 public URL（bucket 已设为 public）
  const publicUrl = `${sb.storage.from(TTS_BUCKET).getPublicUrl(path).data.publicUrl}`;

  // 先检查是否已存在（去重）
  try {
    const { data: existingList } = await sb.storage
      .from(TTS_BUCKET)
      .list(path.split('/')[0], { search: path.split('/')[1] });
    if (existingList && existingList.length > 0) {
      console.log(`[tts] audio already exists: ${path}`);
      return { url: publicUrl, hash };
    }
  } catch {
    // 不存在，继续生成
  }

  // 用 Edge TTS 生成音频
  let audioBuffer: Buffer;
  try {
    const tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FMT);

    const { audioStream } = tts.toStream(text, {
      rate,
      pitch,
      volume,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      console.warn('[tts] generated empty audio for:', text.slice(0, 30));
      return null;
    }
  } catch (err) {
    console.error('[tts] generation failed:', err);
    return null;
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
      return null;
    }

    console.log(`[tts] generated: ${path} (${audioBuffer.length} bytes)`);
    return { url: publicUrl, hash };
  } catch (err) {
    console.error('[tts] storage error:', err);
    return null;
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

/**
 * 从模板/计划的 drills 中提取所有需要预生成的文本
 * 包括：原始文本 + 前端实际播报的组合文本
 */
export function extractTextsFromDrills(
  drills: Array<{
    title?: string;
    duration?: number;
    summary?: string;
    cues?: Array<{ text?: string }>;
  }>,
  restDuration: number = 0
): string[] {
  const texts: string[] = [];

  for (const drill of drills) {
    if (drill.title) {
      texts.push(drill.title);
      const durationStr = drill.duration ? formatDurationChinese(drill.duration) : '';
      texts.push(`现在开始 ${drill.title}，时长 ${durationStr}`);
      texts.push(`${drill.title} 完成`);
      if (restDuration > 0) {
        texts.push(`${drill.title} 完成，休息 ${formatDurationChinese(restDuration)}`);
      }
    }
    if (drill.summary) {
      texts.push(drill.summary);
    }
    if (drill.cues) {
      for (const cue of drill.cues) {
        if (cue.text) {
          texts.push(cue.text);
        }
      }
    }
  }

  texts.push('训练完成，大家辛苦了！');
  texts.push('还剩一分钟');
  texts.push('休息结束');
  texts.push('开始休息');

  return texts;
}

/**
 * 批量预生成音频
 */
export async function pregenerateAudios(
  texts: string[],
  userId: string,
  options: {
    voice?: string;
    rate?: string;
  } = {}
): Promise<AudioManifest> {
  const voice = options.voice ?? DEFAULT_VOICE;
  const rate = options.rate ?? DEFAULT_RATE;

  const audioMap: Record<string, AudioManifestEntry> = {};

  // 串行生成，避免并发太多被限流
  for (const text of texts) {
    if (!text) continue;
    const result = await generateAndUploadAudio(text, userId, {
      voice,
      rate,
    });
    if (result) {
      audioMap[text] = {
        text,
        url: result.url,
        hash: result.hash,
      };
    }
  }

  return {
    voice,
    rate,
    generatedAt: new Date().toISOString(),
    audioMap,
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
