import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbInsert, dbSelect, dbUpdate, dbDelete } from '../db/client';

const router = Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  try {
    const records = await dbSelect('training_records', 'user_id', req.auth!.userId, req.auth!.userId);
    const sorted = records.sort((a: any, b: any) => {
      const aTime = new Date(a.start_time || a.date || a.created_at).getTime();
      const bTime = new Date(b.start_time || b.date || b.created_at).getTime();
      return bTime - aTime;
    });
    res.json({ records: sorted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/', async (req, res) => {
  try {
    const { template_id, title, date, status, start_time, end_time, duration_seconds, completed_drills, total_drills, note } = req.body as {
      template_id?: string;
      title?: string;
      date?: string;
      status?: string;
      start_time?: string;
      end_time?: string;
      duration_seconds?: number;
      completed_drills?: number;
      total_drills?: number;
      note?: string;
    };
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    const record = await dbInsert(
      'training_records',
      {
        user_id: req.auth!.userId,
        template_id,
        title,
        date,
        status: status ?? 'planned',
        start_time,
        end_time,
        duration_seconds,
        completed_drills,
        total_drills,
        note,
      },
      req.auth!.userId
    );
    res.status(201).json({ record });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const record = await dbUpdate('training_records', req.params.id, req.body, req.auth!.userId);
    res.json({ record });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await dbDelete('training_records', req.params.id, req.auth!.userId);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const recordRoutes = router;
