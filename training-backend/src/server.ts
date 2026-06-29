import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { config } from './config/index';
import { authRoutes } from './routes/auth';
import { templateRoutes } from './routes/templates';
import { planRoutes } from './routes/plans';
import { recordRoutes } from './routes/records';
import { userRoutes } from './routes/users';
import { settingsRoutes } from './routes/settings';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://hunterecho.github.io',
];
app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));
app.use(express.json({ limit: '1mb' }));

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

app.listen(config.port, () => {
  console.log(`[backend] listening on http://localhost:${config.port}`);
  console.log(
    `[backend] supabase ${config.supabaseUrl ? 'configured' : 'NOT configured (mock mode)'}`
  );
});
