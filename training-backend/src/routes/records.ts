import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbInsert, dbSelect, dbUpdate, dbDelete, getSupabase } from '../db/client';

const router = Router();

router.get('/share/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const plans = await dbSelect('plans', 'id', planId);
    if (plans.length === 0) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    const plan = plans[0] as { id: string; user_id: string; template_id: string; status?: string; title?: string; date?: string };
    const templates = await dbSelect('templates', 'id', plan.template_id);
    if (templates.length === 0) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const template = templates[0];
    
    let sharerName = '';
    const sb = getSupabase();
    if (sb) {
      const { data: users, error } = await sb
        .from('users')
        .select('id, nickname, avatar')
        .eq('id', plan.user_id)
        .limit(1);
      if (error) {
        console.warn('Failed to fetch sharer info:', error.message);
      } else if (users && users.length > 0) {
        sharerName = users[0].nickname || '';
      }
    } else {
      const users = await dbSelect<any>('users', 'id', plan.user_id);
      if (users.length > 0) {
        sharerName = users[0].nickname || '';
      }
    }
    
    res.json({
      plan,
      template,
      sharerName,
      terminated: plan.status === 'terminated',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.use(authRequired);

router.get('/by-plan/:planId', async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const { planId } = req.params;
    const sb = getSupabase();

    if (sb) {
      const { data, error } = await sb
        .from('training_records')
        .select(`
          id, user_id, plan_id, template_id, title, status,
          start_time, end_time, duration_seconds, completed_drills,
          total_drills, note, created_at, completed_at, rest_duration,
          executor:users!training_records_user_id_fkey (id, nickname, avatar)
        `)
        .eq('plan_id', planId)
        .eq('user_id', userId)
        .order('start_time', { ascending: false });
      if (error) throw new Error(error.message);
      const records = (data ?? []).map((r: any) => ({
        ...r,
        executor: Array.isArray(r.executor) ? r.executor[0] : r.executor,
      }));
      res.json({ records });
    } else {
      const records = await dbSelect<any>('training_records', 'plan_id', planId, userId);
      res.json({ records });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.get('/', async (req, res) => {
  try {
    const userId = req.auth!.userId;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const sb = getSupabase();

    type EnrichedRecord = {
      id: string;
      user_id: string;
      plan_id: string | null;
      template_id: string;
      title: string;
      status: string;
      start_time: string | null;
      end_time: string | null;
      duration_seconds: number | null;
      completed_drills: number | null;
      total_drills: number | null;
      note: string | null;
      created_at: string;
      completed_at: string | null;
      executor?: { id: string; nickname: string; avatar: string | null };
    };

    let records: EnrichedRecord[] = [];
    let total = 0;

    if (sb) {
      const { data: ownData, error: ownErr } = await sb
        .from('training_records')
        .select(`
          id, user_id, plan_id, template_id, title, status,
          start_time, end_time, duration_seconds, completed_drills,
          total_drills, note, created_at, completed_at,
          executor:users!training_records_user_id_fkey (id, nickname, avatar)
        `)
        .eq('user_id', userId);
      if (ownErr) throw new Error(ownErr.message);

      const { data: planData, error: planErr } = await sb
        .from('plans')
        .select('id')
        .eq('user_id', userId);
      if (planErr) throw new Error(planErr.message);
      const ownPlanIds = ((planData ?? []) as any[]).map((p) => p.id);

      let sharedData: any[] = [];
      if (ownPlanIds.length > 0) {
        const { data: shared, error: sharedErr } = await sb
          .from('training_records')
          .select(`
            id, user_id, plan_id, template_id, title, status,
            start_time, end_time, duration_seconds, completed_drills,
            total_drills, note, created_at, completed_at,
            executor:users!training_records_user_id_fkey (id, nickname, avatar)
          `)
          .neq('user_id', userId)
          .in('plan_id', ownPlanIds);
        if (sharedErr) throw new Error(sharedErr.message);
        sharedData = shared ?? [];
      }

      const raw = [...(ownData ?? []), ...sharedData];
      const seen = new Set<string>();
      records = raw
        .filter((r) => {
          if (seen.has(r.id)) return false;
          seen.add(r.id);
          return true;
        })
        .map((r) => ({
          ...r,
          executor: Array.isArray(r.executor) ? r.executor[0] : r.executor,
        })) as EnrichedRecord[];
      total = records.length;
    } else {
      const own = await dbSelect<any>('training_records', 'user_id', userId, userId);
      const userMap = new Map<string, any>();
      const allUsers = await dbSelect<any>('users', 'user_id', '__ALL__');
      for (const u of allUsers) userMap.set(u.id, u);

      const planOwners = await dbSelect<any>('plans', 'user_id', userId);
      const ownerPlanIds = new Set<string>(planOwners.map((p: any) => p.id));

      const allUserIds = Array.from(userMap.keys());
      const allRecordsPerUser = await Promise.all(
        allUserIds.map((uid) => dbSelect<any>('training_records', 'user_id', uid, uid))
      );
      const allRecords = allRecordsPerUser.flat();

      const planRecords = allRecords.filter((r: any) => ownerPlanIds.has(r.plan_id));

      const seen = new Set<string>();
      const combined: EnrichedRecord[] = [];
      const push = (r: any) => {
        if (!r || seen.has(r.id)) return;
        seen.add(r.id);
        const u = userMap.get(r.user_id);
        combined.push({
          ...r,
          executor: u ? { id: u.id, nickname: u.nickname, avatar: u.avatar ?? null } : undefined,
        });
      };
      own.forEach(push);
      planRecords.forEach(push);
      records = combined;
      total = records.length;
    }

    const sorted = records.sort((a, b) => {
      const aTime = new Date(a.start_time || a.created_at).getTime();
      const bTime = new Date(b.start_time || b.created_at).getTime();
      return bTime - aTime;
    });

    const offset = (page - 1) * pageSize;
    const paginated = sorted.slice(offset, offset + pageSize);

    res.json({ records: paginated, total, page, pageSize });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/', async (req, res) => {
  try {
    const { plan_id, template_id, title, status, start_time, end_time, duration_seconds, completed_drills, total_drills, note, source_plan_id, sharer_name, sharer_id, rest_duration } = req.body as {
      plan_id?: string;
      template_id?: string;
      title?: string;
      status?: string;
      start_time?: string;
      end_time?: string;
      duration_seconds?: number;
      completed_drills?: number;
      total_drills?: number;
      note?: string;
      source_plan_id?: string;
      sharer_name?: string;
      sharer_id?: string;
      rest_duration?: number;
    };
    if (!title) {
      res.status(400).json({ error: 'title is required' });
      return;
    }
    
    const record = await dbInsert(
      'training_records',
      {
        user_id: req.auth!.userId,
        plan_id,
        template_id,
        title,
        status: status ?? 'planned',
        start_time,
        end_time,
        duration_seconds,
        completed_drills,
        total_drills,
        note,
        source_plan_id,
        sharer_name,
        sharer_id,
        rest_duration,
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
