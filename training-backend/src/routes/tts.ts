import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { getAdminSupabase, dbSelect, dbUpdate } from '../db/client';
import {
  extractTextsFromDrills,
  pregenerateAudios,
  DEFAULT_VOICE,
  DEFAULT_RATE,
  ensureSystemManifest,
  TTS_BUCKET,
  type AudioManifest,
  type PregenerateErrorEntry,
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

    let restDuration = (req.body as any).restDuration ?? 0;

    // 优先用 body 里带的 drills（前端已有数据，避免查 DB 失败）
    // templateId/planId 只用于查已有 manifest（缓存命中）和写回 audio_manifest
    if (drills && drills.length > 0) {
      drillData = drills;
      // 如果同时带了 templateId/planId，尝试读取已有 manifest 做缓存命中
      if (templateId) {
        const sb = getAdminSupabase();
        if (sb) {
          const { data, error } = await sb
            .from('templates')
            .select('id, audio_manifest')
            .eq('id', templateId)
            .maybeSingle();
          if (error) {
            console.warn('[tts] template lookup by id error:', templateId, error.message);
          } else if (data) {
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
          } else {
            // templateId 查不到 → 可能用户给的 templateId 不是 DB 的真实 id。
            // 尝试 fallback：按当前 userId + template name 匹配一次
            // drills 里没有 name 没法用 name 匹配，就稍后尝试直接用 templateId 写回
            console.warn('[tts] template not found in DB by templateId=', templateId, 'userId=', req.auth!.userId);
          }
          // 查不到也不报错——drills 已有，照样生成
        }
      } else if (planId) {
        const sb = getAdminSupabase();
        if (sb) {
          const { data } = await sb
            .from('plans')
            .select('id, audio_manifest')
            .eq('id', planId)
            .maybeSingle();
          if (data) {
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
        }
      }
    } else if (templateId) {
      // 没传 drills，只能查 DB
      const sb = getAdminSupabase();
      if (sb) {
        const { data, error } = await sb
          .from('templates')
          .select('id, user_id, drills, audio_manifest')
          .eq('id', templateId)
          .single();
        if (error || !data) {
          res.status(404).json({ error: 'Template not found' });
          return;
        }
        drillData = (data.drills as any[]) ?? [];
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
      // 没传 drills，只能查 DB
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
    const preResult = await pregenerateAudios(texts, userId, {
      voice: effectiveVoice,
      rate: effectiveRate,
    });

    // 存到数据库
    let persisted = false;
    let persistError: string | undefined;
    let attemptedStorageId = storageId;
    if (!storageId && templateId) {
      // 尝试直接用前端传来的 templateId 写回一次（可能是 ID 格式不一致但 update 能匹配到）
      attemptedStorageId = templateId;
      storageTable = storageTable ?? 'templates';
    }
    if (!storageId && planId) {
      attemptedStorageId = planId;
      storageTable = storageTable ?? 'plans';
    }

    if (storageTable && attemptedStorageId) {
      try {
        const sb = getAdminSupabase();
        if (!sb) {
          persistError =
            'Database not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing)';
        } else {
          const { data: updateData, error: updateError, status, statusText } = await sb
            .from(storageTable)
            .update({ audio_manifest: preResult.manifest } as any)
            .eq('id', attemptedStorageId)
            .select('id, audio_manifest')
            .maybeSingle();
          if (updateError) {
            persistError = updateError.message;
            console.error('[tts] write-back audio_manifest failed:', updateError);
          } else if (!updateData) {
            // update 没有匹配到任何行——ID 不存在于 DB
            persistError = `Template/Plan ${attemptedStorageId} 不存在于 DB（update 匹配 0 行），音频已生成但未持久化`;
            console.warn('[tts] write-back matched 0 rows:', storageTable, attemptedStorageId);
          } else {
            persisted = true;
            console.log(
              `[tts] audio_manifest persisted to ${storageTable}/${attemptedStorageId},`,
              `${preResult.successCount}/${preResult.totalTexts} audios`,
              `(status=${status} ${statusText || ''})`
            );
          }
        }
      } catch (e) {
        persistError = e instanceof Error ? e.message : String(e);
        console.error('[tts] write-back exception:', e);
      }
    } else {
      // 连 templateId/planId 都没传——把当前用户 DB 里的模板 ID 列出来帮助排查
      try {
        const sb = getAdminSupabase();
        if (sb && req.auth?.userId) {
          const { data: list } = await sb
            .from('templates')
            .select('id, name')
            .eq('user_id', req.auth.userId)
            .limit(20);
          if (list && list.length > 0) {
            const sample = list.map((t: any) => `${t.name}(${t.id})`).join('; ');
            persistError =
              `Neither templateId nor planId matched a DB record.` +
              ` Current user templates in DB (first 20): ${sample}`;
          } else {
            persistError =
              `Neither templateId nor planId matched a DB record.` +
              ` Current user has 0 templates in DB — may need to create or sync templates first.`;
          }
        } else {
          persistError = 'Neither templateId nor planId matched a DB record';
        }
      } catch {
        persistError = 'Neither templateId nor planId matched a DB record';
      }
      console.warn('[tts] skip write-back:', persistError);
    }

    res.json({
      success: true,
      manifest: preResult.manifest,
      cached: false,
      persisted,
      persistError,
      totalTexts: preResult.totalTexts,
      successCount: preResult.successCount,
      errors: preResult.errors as PregenerateErrorEntry[],
    });
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

    if (!result.success) {
      res.status(500).json({ error: result.error, stage: result.stage });
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
      .maybeSingle();

    if (error) {
      console.error('[tts] manifest query error:', error.message);
      res.status(500).json({ error: error.message });
      return;
    }

    // 找不到记录时返回空 manifest（而非 404），让前端走兜底逻辑
    res.json({ success: true, manifest: data?.audio_manifest ?? null });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

/**
 * 获取系统级公共语音 manifest（固定文案 + 常见休息时长）
 * GET /api/tts/system
 * 所有训练共享，零 TTS 调用延迟
 */
router.get('/system', async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const manifest = await ensureSystemManifest(userId);
    res.json({ success: true, manifest });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tts] system manifest failed:', err);
    res.status(500).json({ error: msg });
  }
});

/**
 * 一键重置所有语音数据（架构升级后清理脏数据用）
 * POST /api/tts/admin/reset-all
 * 1. 清空 templates / plans 表 audio_manifest 字段（当前用户范围）
 * 2. 可选：清空 tts-audio bucket 下的所有对象
 * 仅当前登录用户自己的数据，不涉及他人
 */
router.post('/admin/reset-all', async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const { clearStorage = true } = (req.body || {}) as { clearStorage?: boolean };
    const sb = getAdminSupabase();
    if (!sb) {
      res.status(500).json({ error: 'Database not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY missing)' });
      return;
    }

    const results: Record<string, unknown> = {};

    // 1. 清空当前用户 templates 的 audio_manifest
    const tplUpdate = await sb
      .from('templates')
      .update({ audio_manifest: null } as any)
      .eq('user_id', userId);
    results.templates = { error: tplUpdate.error?.message ?? null, status: tplUpdate.status };

    // 2. 清空当前用户 plans 的 audio_manifest（表结构有该字段时才生效，字段不存在会忽略报错并返回错误）
    const planUpdate = await sb
      .from('plans')
      .update({ audio_manifest: null } as any)
      .eq('user_id', userId);
    results.plans = { error: planUpdate.error?.message ?? null, status: planUpdate.status };

    // 3. 清空 system_settings 中的 system manifest 缓存（key: tts.system_manifest）
    const sysSetUpdate = await sb
      .from('system_settings')
      .delete()
      .eq('key', 'tts.system_manifest');
    results.systemSettings = { error: (sysSetUpdate as any).error?.message ?? null, status: (sysSetUpdate as any).status };

    // 4. 清空 tts-audio bucket（可选，默认开启）
    if (clearStorage) {
      try {
        const { data: listData, error: listError } = await sb
          .storage
          .from(TTS_BUCKET)
          .list('', { limit: 1000, offset: 0 });
        if (listError) {
          results.storage = { step: 'list', error: listError.message };
        } else if (listData && listData.length > 0) {
          const paths = listData.map((f) => f.name);
          const { error: rmError } = await sb
            .storage
            .from(TTS_BUCKET)
            .remove(paths);
          results.storage = {
            step: 'remove',
            removed: paths.length,
            error: rmError?.message ?? null,
          };
        } else {
          results.storage = { step: 'list', removed: 0, error: null };
        }
      } catch (e) {
        results.storage = {
          step: 'exception',
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }

    res.json({ success: true, userId, results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[tts] reset-all exception:', err);
    res.status(500).json({ error: msg });
  }
});

export const ttsRoutes = router;
