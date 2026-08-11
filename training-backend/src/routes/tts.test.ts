import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// mock auth 中间件，跳过鉴权
vi.mock('../middleware/auth', () => ({
  authRequired: (req: any, _res: any, next: any) => {
    req.auth = { userId: 'test-user', nickname: 'tester', role: 'user' };
    next();
  },
}));

import { ttsRoutes } from './tts';

const app = express();
app.use(express.json());
app.use('/api/tts', ttsRoutes);

describe('tts 路由', () => {
  it('POST /pregenerate 无 templateId/planId/drills 时返回 400', async () => {
    const res = await request(app).post('/api/tts/pregenerate').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/templateId|planId|drills/);
  });

  it('POST /generate 无 text 时返回 400', async () => {
    const res = await request(app).post('/api/tts/generate').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/text/);
  });
});
