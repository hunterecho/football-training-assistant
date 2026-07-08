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
import { getSupabase } from './db/client';

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

ensurePlanColumns().then(() => {
  app.listen(config.port, () => {
    console.log(`[backend] listening on http://localhost:${config.port}`);
    console.log(
      `[backend] supabase ${config.supabaseUrl ? 'configured' : 'NOT configured (mock mode)'}`
    );
  });
});
