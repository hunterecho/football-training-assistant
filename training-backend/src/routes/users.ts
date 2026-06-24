import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbSelect, dbUpdate } from '../db/client';

const router = Router();
router.use(authRequired);

router.get('/me', async (req, res) => {
  try {
    const rows = await dbSelect('users', 'id', req.auth!.userId);
    const user =
      rows[0] ??
      ({
        id: req.auth!.userId,
        nickname: req.auth!.nickname,
        role: req.auth!.role,
      } as const);
    res.json({ user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch('/me', async (req, res) => {
  try {
    const user = await dbUpdate('users', req.auth!.userId, req.body);
    res.json({ user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const userRoutes = router;
