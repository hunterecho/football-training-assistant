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

  // 通用：检测列是否存在（supabase-js 不 throw，需检查 error 字段）
  const checkColumn = async (table: string, column: string): Promise<boolean> => {
    const { error } = await sb.from(table).select(column).limit(1);
    if (error && /column .* does not exist|Could not find the .* column/i.test(error.message)) {
      return false;
    }
    return true;
  };

  // plans.source_plan_id
  if (!(await checkColumn('plans', 'source_plan_id'))) {
    console.warn('[schema] plans.source_plan_id missing — please run migration SQL in Supabase SQL Editor');
  }

  // training_records.rest_duration
  if (!(await checkColumn('training_records', 'rest_duration'))) {
    console.warn('[schema] training_records.rest_duration missing — please run migration SQL in Supabase SQL Editor');
  }

  // templates.audio_manifest + plans.audio_manifest
  const tplHasAm = await checkColumn('templates', 'audio_manifest');
  const planHasAm = await checkColumn('plans', 'audio_manifest');
  if (!tplHasAm || !planHasAm) {
    console.warn('[schema] audio_manifest column(s) missing — please run in Supabase SQL Editor:');
    console.warn('[schema]   alter table public.templates add column if not exists audio_manifest jsonb default \'{}\';');
    console.warn('[schema]   alter table public.plans add column if not exists audio_manifest jsonb default \'{}\';');
  } else {
    console.log('[schema] audio_manifest columns OK');
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
