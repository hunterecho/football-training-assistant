import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbInsert, dbSelect } from '../db/client';
import { getAdminSupabase } from '../db/client';

const router = Router();
router.use(authRequired);

interface DrillData {
  title: string;
  duration: number;
  summary?: string;
}

interface TemplateData {
  name: string;
  description?: string;
  drills: DrillData[];
}

interface PlanData {
  title: string;
  date: string;
  templateId: string;
}

function parseTrainingDescription(text: string): { template: TemplateData; planDate?: string } | null {
  try {
    const drills: DrillData[] = [];
    
    const durationPattern = /(\d+)\s*(分钟|分|秒)/gi;
    let match;
    while ((match = durationPattern.exec(text)) !== null) {
      const duration = parseInt(match[1]);
      const unit = match[2];
      const seconds = unit.includes('分') ? duration * 60 : duration;
      
      let title = '';
      const contextStart = Math.max(0, match.index - 50);
      const contextEnd = Math.min(text.length, match.index + 50);
      const context = text.slice(contextStart, contextEnd);
      
      const actionWords = ['热身', '训练', '练习', '对抗', '比赛', '休息', '拉伸', '技术', '体能', '传球', '射门', '防守', '进攻'];
      for (const word of actionWords) {
        if (context.includes(word)) {
          title = word;
          break;
        }
      }
      
      if (!title) {
        title = `训练环节 ${drills.length + 1}`;
      }
      
      drills.push({
        title,
        duration: seconds,
      });
    }
    
    if (drills.length === 0) {
      return null;
    }
    
    const datePattern = /(今天|明天|后天|本周|下周|(\d{4})[-/](\d{1,2})[-/](\d{1,2}))/;
    const dateMatch = text.match(datePattern);
    let planDate: string | undefined;
    
    if (dateMatch) {
      if (dateMatch[1] === '今天') {
        planDate = new Date().toISOString().split('T')[0];
      } else if (dateMatch[1] === '明天') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        planDate = tomorrow.toISOString().split('T')[0];
      } else if (dateMatch[1] === '后天') {
        const dayAfter = new Date();
        dayAfter.setDate(dayAfter.getDate() + 2);
        planDate = dayAfter.toISOString().split('T')[0];
      } else if (dateMatch[4] && dateMatch[5] && dateMatch[6]) {
        planDate = `${dateMatch[4]}-${dateMatch[5].padStart(2, '0')}-${dateMatch[6].padStart(2, '0')}`;
      }
    }
    
    const hasPlanKeyword = text.includes('训练计划') || text.includes('今天训练') || text.includes('安排');
    if (!planDate && hasPlanKeyword) {
      planDate = new Date().toISOString().split('T')[0];
    }
    
    return {
      template: {
        name: 'AI生成训练模板',
        description: `根据描述生成的训练模板: ${text.slice(0, 50)}...`,
        drills,
      },
      planDate,
    };
  } catch {
    return null;
  }
}

router.post('/parse', async (req, res) => {
  try {
    const { description } = req.body as { description: string };
    
    if (!description) {
      res.status(400).json({ error: 'description is required' });
      return;
    }
    
    const result = parseTrainingDescription(description);
    
    if (!result) {
      res.status(400).json({
        error: '无法解析训练描述，请提供更详细的训练安排，例如："前十分钟热身然后二十五分钟技术训练"',
        needsMoreInfo: true,
        suggestions: [
          '请提供具体的训练环节和时长',
          '例如："热身10分钟，技术训练25分钟，对抗比赛20分钟"',
          '可以指定日期："今天安排一个训练计划，热身10分钟..."',
        ],
      });
      return;
    }
    
    res.json({
      success: true,
      template: result.template,
      planDate: result.planDate,
      needsConfirmation: !result.planDate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/create', async (req, res) => {
  try {
    const { template, planDate } = req.body as {
      template: TemplateData;
      planDate?: string;
    };
    
    if (!template || !template.name || !template.drills || template.drills.length === 0) {
      res.status(400).json({ error: 'template data is invalid' });
      return;
    }
    
    const createdTemplate = await dbInsert(
      'templates',
      {
        user_id: req.auth!.userId,
        name: template.name,
        description: template.description,
        drills: template.drills,
        is_public: false,
      },
      req.auth!.userId
    ) as { id: string };
    
    let createdPlan = null;
    let shareUrl = null;
    
    if (planDate) {
      createdPlan = await dbInsert(
        'plans',
        {
          user_id: req.auth!.userId,
          template_id: createdTemplate.id,
          title: template.name,
          date: planDate,
          status: 'planned',
        },
        req.auth!.userId
      ) as { id: string };
      
      shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/share/${createdPlan.id}`;
    }
    
    res.json({
      success: true,
      template: createdTemplate,
      plan: createdPlan,
      shareUrl,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const { description } = req.body as { description: string };
    
    if (!description) {
      res.status(400).json({ error: 'description is required' });
      return;
    }
    
    const parsed = parseTrainingDescription(description);
    
    if (!parsed) {
      res.status(400).json({
        error: '无法解析训练描述',
        needsMoreInfo: true,
      });
      return;
    }
    
    const createdTemplate = await dbInsert(
      'templates',
      {
        user_id: req.auth!.userId,
        name: parsed.template.name,
        description: parsed.template.description,
        drills: parsed.template.drills,
        is_public: false,
      },
      req.auth!.userId
    ) as { id: string };
    
    let createdPlan = null;
    let shareUrl = null;
    
    if (parsed.planDate) {
      createdPlan = await dbInsert(
        'plans',
        {
          user_id: req.auth!.userId,
          template_id: createdTemplate.id,
          title: parsed.template.name,
          date: parsed.planDate,
          status: 'planned',
        },
        req.auth!.userId
      ) as { id: string };
      
      shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/share/${createdPlan.id}`;
    }
    
    res.json({
      success: true,
      template: createdTemplate,
      plan: createdPlan,
      shareUrl,
      needsDate: !parsed.planDate,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

router.post('/card', async (req, res) => {
  try {
    const { planId } = req.body as { planId: string };
    
    if (!planId) {
      res.status(400).json({ error: 'planId is required' });
      return;
    }
    
    const sb = getAdminSupabase();
    if (!sb) {
      res.status(500).json({ error: 'Database not configured' });
      return;
    }
    
    const { data: plan, error: planError } = await sb
      .from('plans')
      .select('id, title, date, template_id')
      .eq('id', planId)
      .single();
    
    if (planError || !plan) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    
    const { data: template, error: templateError } = await sb
      .from('templates')
      .select('name, drills')
      .eq('id', plan.template_id)
      .single();
    
    if (templateError || !template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    
    const totalDuration = (template.drills as any[]).reduce((acc: number, d: any) => acc + (d.duration || 0), 0);
    const drillCount = (template.drills as any[]).length;
    
    const shareUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/share/${planId}`;
    
    const cardData = {
      type: 'training_plan',
      title: plan.title,
      date: plan.date,
      totalDuration: formatDuration(totalDuration),
      drillCount,
      drills: (template.drills as any[]).map((d: any) => ({
        title: d.title,
        duration: formatDuration(d.duration),
      })),
      shareUrl,
      thumbnail: generateThumbnail(template.drills),
    };
    
    res.json({
      success: true,
      card: cardData,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`;
  }
  return `${secs}秒`;
}

function generateThumbnail(drills: any[]): string {
  const keywords: Record<string, string> = {
    '热身': '🏃',
    '训练': '⚽',
    '练习': '🎯',
    '对抗': '💪',
    '比赛': '🏆',
    '休息': '😴',
    '拉伸': '🧘',
    '技术': '⚡',
    '体能': '🔥',
    '传球': '🔄',
    '射门': '🎯',
    '防守': '🛡️',
    '进攻': '⚔️',
  };
  
  let emoji = '⚽';
  for (const drill of drills) {
    for (const [keyword, icon] of Object.entries(keywords)) {
      if (drill.title && drill.title.includes(keyword)) {
        emoji = icon;
        break;
      }
    }
  }
  
  return emoji;
}

export const llmRoutes = router;