import express from 'express';
import { authRequired } from '../middleware/auth';
import { dbSelect, dbInsert, dbUpdate, dbDelete, dbCount, getSupabase, getAdminSupabase } from '../db/client';
import { config } from '../config';

const router = express.Router();

router.use(authRequired);

function logTime(label: string, start: number) {
  const elapsed = (Date.now() - start).toFixed(2);
  console.log(`[PERF] ${label}: ${elapsed}ms`);
}

router.get('/', async (req, res) => {
  const overallStart = Date.now();
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const limit = pageSize;
    const offset = (page - 1) * pageSize;
    const sharePlanId = req.query.sharePlanId as string | undefined;

    const dbSelectStart = Date.now();
    let plans = await dbSelect('plans', 'user_id', req.auth!.userId, req.auth!.userId, limit, offset);
    logTime('dbSelect plans by user_id', dbSelectStart);
    
    const dbCountStart = Date.now();
    let total = await dbCount('plans', 'user_id', req.auth!.userId);
    logTime('dbCount plans by user_id', dbCountStart);

    const sb = getSupabase();
    const adminClient = getAdminSupabase();
    
    if (sb && adminClient) {
      const templatesStart = Date.now();
      plans = await Promise.all(plans.map(async (plan: any) => {
        if (plan.template_id) {
          const templateRes = await adminClient
            .from('templates')
            .select('drills')
            .eq('id', plan.template_id)
            .single();
          if (!templateRes.error && templateRes.data && templateRes.data.drills) {
            return { ...plan, drills: templateRes.data.drills };
          }
        }
        return plan;
      }));
      logTime('fetch templates drills (parallel)', templatesStart);

      const ownPlanIds = new Set(plans.map((p: any) => p.id));
      
      const parallelStart = Date.now();
      const [recordRes, sharePlanData, inProgressRes] = await Promise.all([
        sb.from('training_records').select('plan_id, source_plan_id').eq('user_id', req.auth!.userId),
        
        sharePlanId ? (async () => {
          try {
            const res = await adminClient
              .from('plans')
              .select('id, user_id, title, date, status, note, drills, template_id, created_at')
              .eq('id', sharePlanId)
              .single();
            if (res.error || !res.data) return null;
            const [sharerRes, tplRes] = await Promise.all([
              adminClient.from('users').select('nickname').eq('id', res.data.user_id).single(),
              res.data.template_id 
                ? adminClient.from('templates').select('drills').eq('id', res.data.template_id).single()
                : Promise.resolve({ data: null }),
            ]);
            return {
              ...res.data,
              sharer_name: sharerRes.data?.nickname || '未知用户',
              drills: (tplRes.data?.drills as any) || res.data.drills || [],
            };
          } catch {
            return null;
          }
        })() : Promise.resolve(null),
        
        sb.from('training_records').select('plan_id').eq('user_id', req.auth!.userId).in('status', ['in_progress', 'paused']),
      ]);
      logTime('parallel queries (records + sharePlan + inProgress)', parallelStart);

      const sharedPlanIds = new Set<string>();
      if (!recordRes.error && recordRes.data) {
        recordRes.data.forEach((r: any) => {
          if (r.plan_id && !ownPlanIds.has(r.plan_id)) {
            sharedPlanIds.add(r.plan_id);
          }
        });
      }

      const sharedPlansStart = Date.now();
      const sharedPlans: any[] = await Promise.all(
        Array.from(sharedPlanIds).map(async (planId) => {
          const planRes = await adminClient
            .from('plans')
            .select('id, user_id, title, date, status, note, drills, template_id, created_at')
            .eq('id', planId)
            .single();
          if (planRes.error || !planRes.data) return null;
          
          const [sharerRes, tplRes] = await Promise.all([
            adminClient.from('users').select('nickname').eq('id', planRes.data.user_id).single(),
            planRes.data.template_id 
              ? adminClient.from('templates').select('drills').eq('id', planRes.data.template_id).single()
              : Promise.resolve({ data: null }),
          ]);
          
          return {
            ...planRes.data,
            drills: (tplRes.data?.drills as any) || planRes.data.drills || [],
            source_plan_id: planId,
            sharer_name: sharerRes.data?.nickname || '未知用户',
          };
        })
      ).then(results => results.filter(Boolean));
      logTime('fetch shared plans (parallel)', sharedPlansStart);

      if (sharePlanData) {
        const exists = plans.some((p: any) => p.id === sharePlanId);
        if (exists) {
          plans = plans.map((p: any) => {
            if (p.id === sharePlanId) {
              return { ...p, drills: sharePlanData.drills, source_plan_id: sharePlanId, sharer_name: sharePlanData.sharer_name };
            }
            return p;
          });
        } else {
          plans = [{
            ...sharePlanData,
            source_plan_id: sharePlanId,
            sharer_name: sharePlanData.sharer_name,
          }, ...plans];
        }
      } else if (sharedPlans.length > 0) {
        plans = [...sharedPlans, ...plans];
      }

      const inProgressPlanIds = new Set<string>();
      if (!inProgressRes.error && inProgressRes.data) {
        inProgressRes.data.forEach((r: any) => {
          if (r.plan_id) inProgressPlanIds.add(r.plan_id);
        });
      }

      plans.sort((a: any, b: any) => {
        const aInProgress = inProgressPlanIds.has(a.id);
        const bInProgress = inProgressPlanIds.has(b.id);
        if (aInProgress && !bInProgress) return -1;
        if (!aInProgress && bInProgress) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else {
      plans = await Promise.all(plans.map(async (plan: any) => {
        if (plan.template_id) {
          const templates = await dbSelect('templates', 'id', plan.template_id);
          if (templates.length > 0) {
            const template = templates[0] as any;
            if (template.drills) {
              return { ...plan, drills: template.drills };
            }
          }
        }
        return plan;
      }));
      plans.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    logTime('overall /api/plans', overallStart);
    res.json({ plans, total, page, pageSize });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[PERF] /api/plans ERROR: ${msg}`);
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
    const sb = getSupabase();
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
    
    let drills: any[] = [];
    if (template_id) {
      if (sb) {
        const tplRes = await sb
          .from('templates')
          .select('drills')
          .eq('id', template_id)
          .single();
        if (!tplRes.error && tplRes.data && tplRes.data.drills) {
          drills = tplRes.data.drills;
        }
      } else {
        const templates = await dbSelect('templates', 'id', template_id);
        if (templates.length > 0 && (templates[0] as any).drills) {
          drills = (templates[0] as any).drills;
        }
      }
    }
    
    const planData = plan as any;
    res.json({ plan: { ...planData, drills } });
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

router.get('/check-share/:planId', async (req, res) => {
  try {
    const { planId } = req.params;
    const adminClient = getAdminSupabase();
    
    if (adminClient) {
      const { data, error } = await adminClient
        .from('plans')
        .select('id, status, user_id')
        .eq('id', planId)
        .limit(1);
      
      if (error || !data || data.length === 0) {
        res.json({ exists: false, terminated: false, sharerId: null });
        return;
      }
      
      const plan = data[0];
      res.json({ 
        exists: true, 
        terminated: plan.status === 'terminated', 
        sharerId: plan.user_id 
      });
    } else {
      const plans = await dbSelect('plans', 'id', planId);
      if (plans.length === 0) {
        res.json({ exists: false, terminated: false, sharerId: null });
        return;
      }
      const plan = plans[0] as any;
      res.json({ 
        exists: true, 
        terminated: plan.status === 'terminated', 
        sharerId: plan.user_id 
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/accept-share', async (req, res) => {
  try {
    const { planId } = req.body;
    if (!planId) {
      res.status(400).json({ error: 'planId is required' });
      return;
    }

    let sharedPlan: { id: string; user_id: string; template_id: string; title?: string; date?: string; status?: string } | null = null;
    let originalTemplate: any = null;
    let sharerName = '';

    const adminClient = getAdminSupabase();
    if (adminClient) {
      const { data: sharedPlans, error: planError } = await adminClient
        .from('plans')
        .select('*')
        .eq('id', planId)
        .limit(1);
      if (planError || !sharedPlans || sharedPlans.length === 0) {
        res.status(404).json({ error: 'Plan not found' });
        return;
      }
      sharedPlan = sharedPlans[0];
      if (sharedPlan!.status === 'terminated') {
        res.status(400).json({ error: 'Plan has been terminated' });
        return;
      }

      const [tplRes, sharerRes] = await Promise.all([
        sharedPlan!.template_id 
          ? adminClient.from('templates').select('*').eq('id', sharedPlan!.template_id).limit(1)
          : Promise.resolve({ data: [], error: null }),
        adminClient.from('users').select('id, nickname, avatar').eq('id', sharedPlan!.user_id).limit(1),
      ]);

      if (sharedPlan!.template_id) {
        if (tplRes.error || !tplRes.data || tplRes.data.length === 0) {
          res.status(404).json({ error: 'Template not found' });
          return;
        }
        originalTemplate = tplRes.data[0];
      }

      if (!sharerRes.error && sharerRes.data && sharerRes.data.length > 0) {
        sharerName = sharerRes.data[0].nickname || '';
      }
    } else {
      const sharedPlans = await dbSelect('plans', 'id', planId);
      if (sharedPlans.length === 0) {
        res.status(404).json({ error: 'Plan not found' });
        return;
      }
      sharedPlan = sharedPlans[0] as { id: string; user_id: string; template_id: string; title?: string; date?: string; status?: string };
      if (sharedPlan!.status === 'terminated') {
        res.status(400).json({ error: 'Plan has been terminated' });
        return;
      }

      const templates = await dbSelect('templates', 'id', sharedPlan!.template_id);
      if (templates.length === 0) {
        res.status(404).json({ error: 'Template not found' });
        return;
      }
      originalTemplate = templates[0];

      const users = await dbSelect<any>('users', 'id', sharedPlan!.user_id);
      if (users.length > 0) {
        sharerName = users[0].nickname || '';
      }
    }

    const ownPlans = await dbSelect('plans', 'user_id', req.auth!.userId, req.auth!.userId);
    const existingPlan = ownPlans.find((p: any) => p.source_plan_id === planId);
    if (existingPlan) {
      res.json({ plan: existingPlan, existed: true });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    let planDate = sharedPlan!.date;
    if (!planDate || planDate < today) {
      planDate = today;
    }

    const plan = await dbInsert('plans', {
      user_id: req.auth!.userId,
      template_id: null,
      title: sharedPlan!.title,
      date: planDate,
      status: 'planned',
      drills: originalTemplate.drills || [],
      source_plan_id: planId,
      sharer_name: sharerName,
    });

    res.json({ plan, existed: false });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const planRoutes = router;
