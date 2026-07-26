import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { getAdminSupabase, dbSelect, dbUpdate } from '../db/client';
import {
  extractTextsFromDrills,
  pregenerateAudios,
  DEFAULT_VOICE,
  DEFAULT_RATE,
  type AudioManifest,
} from '../services/ttsService';

const router = Router();
router.use(authRequired);

/**
 * 按需预生成音频
 * POST /api/tts/pregenerate
 * body: { templateId?, planId?, drills?, voice?, rate? }
 *
 * 1. 如果有 templateId，从 templates 表读取 drills
 * 2. 如果有 planId，从 plans 表读取 drills（分享计划）
 * 3. 也可以直接传 drills
 *
 * 生成后存到对应表的 audio_manifest 字段
 */
router.post('/pregenerate', async (req, res) => {
  try {
    const { templateId, planId, drills, voice, rate } = req.body as {
      templateId?: string;
      planId?: string;
      drills?: any[];
      voice?: string;
      rate?: string;
    };

    const userId = req.auth!.userId;
    const effectiveVoice = voice ?? DEFAULT_VOICE;
    const effectiveRate = rate ?? DEFAULT_RATE;

    // 获取 drills 数据
    let drillData: any[] = [];
    let storageTable: 'templates' | 'plans' | null = null;
    let storageId: string | null = null;

    let restDuration = 0;

    if (templateId) {
      const sb = getAdminSupabase();
      if (sb) {
        const { data, error } = await sb
          .from('templates')
          .select('id, user_id, drills, audio_manifest, rest_duration')
          .eq('id', templateId)
          .single();
        if (error || !data) {
          res.status(404).json({ error: 'Template not found' });
          return;
        }
        drillData = (data.drills as any[]) ?? [];
        restDuration = (data.rest_duration as number) ?? 0;
        storageTable = 'templates';
        storageId = data.id;

        const existing = data.audio_manifest as AudioManifest | null;
        if (existing && existing.voice === effectiveVoice && existing.audioMap) {
          const texts = extractTextsFromDrills(drillData, restDuration);
          const allCovered = texts.every((t) => existing.audioMap[t]);
          if (allCovered) {
            res.json({ success: true, manifest: existing, cached: true });
            return;
          }
        }
      }
    } else if (planId) {
      const sb = getAdminSupabase();
      if (sb) {
        const { data, error } = await sb
          .from('plans')
          .select('id, user_id, drills, audio_manifest')
          .eq('id', planId)
          .single();
        if (error || !data) {
          res.status(404).json({ error: 'Plan not found' });
          return;
        }
        drillData = (data.drills as any[]) ?? [];
        storageTable = 'plans';
        storageId = data.id;

        const existing = data.audio_manifest as AudioManifest | null;
        if (existing && existing.voice === effectiveVoice && existing.audioMap) {
          const texts = extractTextsFromDrills(drillData, restDuration);
          const allCovered = texts.every((t) => existing.audioMap[t]);
          if (allCovered) {
            res.json({ success: true, manifest: existing, cached: true });
            return;
          }
        }
      }
    } else if (drills) {
      drillData = drills;
      restDuration = (req.body as any).restDuration ?? 0;
    } else {
      res.status(400).json({ error: 'templateId, planId or drills is required' });
      return;
    }

    if (drillData.length === 0) {
      res.status(400).json({ error: 'No drills to generate' });
      return;
    }

    // 提取所有需要生成的文本
    const texts = extractTextsFromDrills(drillData, restDuration);

    if (texts.length === 0) {
      res.json({ success: true, manifest: { voice: effectiveVoice, rate: effectiveRate, generatedAt: new Date().toISOString(), audioMap: {} } });
      return;
    }

    // 预生成音频
    const manifest = await pregenerateAudios(texts, userId, {
      voice: effectiveVoice,
      rate: effectiveRate,
    });

    // 存到数据库
    if (storageTable && storageId) {
      const sb = getAdminSupabase();
      if (sb) {
        await sb
          .from(storageTable)
          .update({ audio_manifest: manifest })
          .eq('id', storageId);
      }
    }

    res.json({ success: true, manifest, cached: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tts] pregenerate error:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * 生成单条音频（实时）
 * POST /api/tts/generate
 * body: { text, voice?, rate? }
 */
router.post('/generate', async (req, res) => {
  try {
    const { text, voice, rate } = req.body as {
      text: string;
      voice?: string;
      rate?: string;
    };

    if (!text) {
      res.status(400).json({ error: 'text is required' });
      return;
    }

    // 动态导入避免循环依赖
    const { generateAndUploadAudio } = await import('../services/ttsService');
    const result = await generateAndUploadAudio(text, req.auth!.userId, {
      voice: voice ?? DEFAULT_VOICE,
      rate: rate ?? DEFAULT_RATE,
    });

    if (!result) {
      res.status(500).json({ error: 'TTS generation failed' });
      return;
    }

    res.json({ success: true, url: result.url, hash: result.hash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tts] generate error:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * 获取已有 manifest
 * GET /api/tts/manifest/:id?type=template|plan
 */
router.get('/manifest/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query as { type?: string };

    const table = type === 'plan' ? 'plans' : 'templates';
    const sb = getAdminSupabase();
    if (!sb) {
      res.status(500).json({ error: 'Database not configured' });
      return;
    }

    const { data, error } = await sb
      .from(table)
      .select('audio_manifest')
      .eq('id', id)
      .single();

    if (error || !data) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json({ success: true, manifest: data.audio_manifest ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const ttsRoutes = router;
