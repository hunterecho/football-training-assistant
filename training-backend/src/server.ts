import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config, isSupabaseConfigured } from './config/index';
import { authRoutes } from './routes/auth';
import { templateRoutes } from './routes/templates';
import { planRoutes } from './routes/plans';
import { recordRoutes } from './routes/records';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';
import { llmRoutes } from './routes/llm';
import { llmProxyRoutes } from './routes/llmProxy';
import { ttsRoutes } from './routes/tts';
import { getSupabase } from './db/client';
import { ensureTtsBucket, ensureSystemManifest, DEFAULT_VOICE } from './services/ttsService';

async function ensurePlanColumns() {
  if (!isSupabaseConfigured()) return;
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.from('plans').select('source_plan_id').limit(1);
    console.log('[schema] source_plan_id column exists');
  } catch {
    console.log('[schema] Adding missing columns to plans table...');
    try {
      const url = `${config.supabaseUrl}/rest/v1/rpc/execute_sql`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.supabaseServiceKey}`,
          'apikey': config.supabaseServiceKey
        },
        body: JSON.stringify({
          sql: `
            alter table if exists public.plans
              add column if not exists source_plan_id text;
            alter table if exists public.plans
              add column if not exists sharer_name text;
            alter table if exists public.plans
              add column if not exists drills jsonb default '[]';
            alter table if exists public.training_records
              alter column template_id drop not null;
          `
        })
      });
      if (response.ok) {
        console.log('[schema] Columns added successfully');
      } else {
        const data = await response.json();
        console.warn('[schema] Failed to add columns via RPC:', data);
      }
    } catch (e) {
      console.warn('[schema] Failed to add columns:', e);
    }
  }
  
  try {
    await sb.from('training_records').select('rest_duration').limit(1);
    console.log('[schema] rest_duration column exists');
  } catch {
    console.log('[schema] Adding rest_duration column to training_records table...');
    try {
      const url = `${config.supabaseUrl}/rest/v1/rpc/execute_sql`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.supabaseServiceKey}`,
          'apikey': config.supabaseServiceKey
        },
        body: JSON.stringify({
          sql: `
            alter table if exists public.training_records
              add column if not exists rest_duration integer default 0;
          `
        })
      });
      if (response.ok) {
        console.log('[schema] rest_duration column added successfully');
      } else {
        const data = await response.json();
        console.warn('[schema] Failed to add rest_duration column:', data);
      }
    } catch (e) {
      console.warn('[schema] Failed to add rest_duration column:', e);
    }
  }

  // 确保 audio_manifest 列存在
  try {
    await sb.from('templates').select('audio_manifest').limit(1);
    console.log('[schema] templates.audio_manifest column exists');
  } catch {
    console.log('[schema] Adding audio_manifest columns...');
    try {
      const url = `${config.supabaseUrl}/rest/v1/rpc/execute_sql`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.supabaseServiceKey}`,
          'apikey': config.supabaseServiceKey
        },
        body: JSON.stringify({
          sql: `
            alter table if exists public.templates
              add column if not exists audio_manifest jsonb default '{}';
            alter table if exists public.plans
              add column if not exists audio_manifest jsonb default '{}';
          `
        })
      });
      if (response.ok) {
        console.log('[schema] audio_manifest columns added successfully');
      } else {
        const data = await response.json();
        console.warn('[schema] Failed to add audio_manifest columns:', data);
      }
    } catch (e) {
      console.warn('[schema] Failed to add audio_manifest columns:', e);
    }
  }
}

const app = express();

const allowedOrigins = [
  'https://hunterecho.github.io',
];
const localhostPattern = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+):\d+$/;
app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || localhostPattern.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));
app.use(express.json({ limit: '1mb' }));

app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    supabase: !!config.supabaseUrl,
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/records', recordRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/llm', llmRoutes);
app.use('/api/llm-proxy', llmProxyRoutes);
app.use('/api/tts', ttsRoutes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[error]', err);
    res.status(500).json({ error: err.message || 'Internal error' });
  }
);

Promise.all([ensurePlanColumns(), ensureTtsBucket()]).then(() => {
  app.listen(config.port, () => {
    console.log(`[backend] listening on http://localhost:${config.port}`);
    console.log(
      `[backend] supabase ${config.supabaseUrl ? 'configured' : 'NOT configured (mock mode)'}`
    );
  });

  // 后台异步预生成系统级公共语音（不阻塞服务启动）
  // 生成所有训练共享的固定文案 + 常见休息时长的音频
  // 即使失败也不影响服务可用性，训练执行时首次 GET /tts/system 会重试
  if (config.supabaseUrl) {
    setTimeout(() => {
      const systemUserId = 'system'; // 用一个固定 userId，避免依赖真实用户
      ensureSystemManifest(systemUserId)
        .then((manifest) => {
          const count = Object.keys(manifest.audioMap).length;
          console.log(`[tts] system manifest ready on startup: ${count} entries (voice=${manifest.voice || DEFAULT_VOICE})`);
        })
        .catch((err) => {
          console.warn('[tts] system manifest pregen on startup failed (will retry on first request):', err instanceof Error ? err.message : String(err));
        });
    }, 3000); // 延迟3秒，避免与 schema 迁移/健康检查竞争
  }
});
