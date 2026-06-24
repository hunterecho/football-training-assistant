import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbInsert, dbSelect, dbUpdate, dbDelete } from '../db/client';

const router = Router();
router.use(authRequired);

// GET /api/templates — list current user's templates
router.get('/', async (req, res) => {
  try {
    const templates = await dbSelect('templates', 'user_id', req.auth!.userId, req.auth!.userId);
    res.json({ templates });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// POST /api/templates — create a template
router.post('/', async (req, res) => {
  try {
    const { name, description, drills } = req.body as {
      name?: string;
      description?: string;
      drills?: unknown;
    };
    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }
    const template = await dbInsert(
      'templates',
      {
        user_id: req.auth!.userId,
        name,
        description,
        drills: drills ?? [],
        is_public: false,
      },
      req.auth!.userId
    );
    res.status(201).json({ template });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// PATCH /api/templates/:id
router.patch('/:id', async (req, res) => {
  try {
    const template = await dbUpdate('templates', req.params.id, req.body, req.auth!.userId);
    res.json({ template });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

// DELETE /api/templates/:id
router.delete('/:id', async (req, res) => {
  try {
    await dbDelete('templates', req.params.id, req.auth!.userId);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const templateRoutes = router;
