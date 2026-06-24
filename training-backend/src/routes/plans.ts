import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbInsert, dbSelect, dbUpdate, dbDelete } from '../db/client';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  try {
    const plans = await dbSelect('plans', 'user_id', req.auth!.userId, req.auth!.userId);
    res.json({ plans });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/', async (req, res) => {
  try {
    const { template_id, title, date, note, status } = req.body as {
      template_id?: string;
      title?: string;
      date?: string;
      note?: string;
      status?: string;
    };
    if (!template_id || !title || !date) {
      res.status(400).json({ error: 'template_id, title, date are required' });
      return;
    }
    const plan = await dbInsert(
      'plans',
      {
        user_id: req.auth!.userId,
        template_id,
        title,
        date,
        note,
        status: status ?? 'planned',
      },
      req.auth!.userId
    );
    res.status(201).json({ plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const plan = await dbUpdate('plans', req.params.id, req.body, req.auth!.userId);
    res.json({ plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await dbDelete('plans', req.params.id, req.auth!.userId);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const planRoutes = router;
