import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbInsert, dbSelect, dbUpdate, dbDelete, dbCount } from '../db/client';

const router = Router();
router.use(authRequired);

// GET /api/templates — list current user's templates
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const limit = pageSize;
    const offset = (page - 1) * pageSize;

    const templates = await dbSelect('templates', 'user_id', req.auth!.userId, req.auth!.userId, limit, offset);
    const total = await dbCount('templates', 'user_id', req.auth!.userId);
    res.json({ templates, total, page, pageSize });
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
