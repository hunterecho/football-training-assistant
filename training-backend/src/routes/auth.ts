import { Router } from 'express';
import { signToken, authRequired } from '../middleware/auth';
import { dbSelect, dbUpsertUser } from '../db/client';

const router = Router();

// POST /api/auth/mock — simple nickname-based login for local/dev
router.post('/mock', async (req, res) => {
  try {
    const { nickname } = req.body as { nickname?: string };
    if (!nickname || !nickname.trim()) {
      res.status(400).json({ error: 'nickname is required' });
      return;
    }
    const cleanName = nickname.trim();
    const existing = await dbSelect('users', 'id', cleanName);
    const user =
      (existing[0] as any) ??
      (await dbUpsertUser({
        id: cleanName,
        nickname: cleanName,
        role: 'coach',
        created_at: new Date().toISOString(),
      }));
    const token = signToken({
      userId: (user as any).id ?? cleanName,
      nickname: (user as any).nickname ?? cleanName,
      role: (user as any).role ?? 'coach',
    });
    res.json({ token, user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// GET /api/auth/me — return current user from token
router.get('/me', authRequired, async (req, res) => {
  try {
    const rows = await dbSelect('users', 'id', req.auth!.userId);
    const user = (rows[0] as any) ?? {
      id: req.auth!.userId,
      nickname: req.auth!.nickname,
      role: req.auth!.role,
    };
    res.json({ user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/auth/wechat — placeholder for future WeChat login
router.post('/wechat', async (_req, res) => {
  res.status(501).json({
    error: 'WeChat login is not yet implemented. Use /mock for development.',
  });
});

export const authRoutes = router;
