import express from 'express';
import { authRequired } from '../middleware/auth';
import { dbSelect, dbInsert, dbUpdate, dbDelete, dbCount } from '../db/client';

const router = express.Router();

router.use(authRequired);

router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const plans = await dbSelect('plans', 'user_id', req.auth!.userId, req.auth!.userId, limit, offset);
    const total = await dbCount('plans', 'user_id', req.auth!.userId);
    
    plans.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ plans, total, page, pageSize });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const plans = await dbSelect('plans', 'id', id);
    if (plans.length === 0) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    if ((plans[0] as any).user_id !== req.auth!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    res.json({ plan: plans[0] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/', async (req, res) => {
  try {
    const { template_id, title, date, status, note } = req.body;
    if (!template_id || !title) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const plan = await dbInsert('plans', {
      user_id: req.auth!.userId,
      template_id,
      title,
      date,
      status: status || 'planned',
      note,
    });
    res.json({ plan });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const plans = await dbSelect('plans', 'id', id);
    if (plans.length === 0) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    if ((plans[0] as any).user_id !== req.auth!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const { title, status, date, note, completed_at } = req.body;
    const updates: Record<string, unknown> = {};
    if (title !== undefined) updates.title = title;
    if (status !== undefined) updates.status = status;
    if (date !== undefined) updates.date = date;
    if (note !== undefined) updates.note = note;
    if (completed_at !== undefined) updates.completed_at = completed_at;
    const updated = await dbUpdate('plans', id, updates, req.auth!.userId);
    res.json({ plan: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const plans = await dbSelect('plans', 'id', id);
    if (plans.length === 0) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    if ((plans[0] as any).user_id !== req.auth!.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await dbDelete('plans', id);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const planRoutes = router;
