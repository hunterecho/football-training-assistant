import { Router } from 'express';
import { authRequired } from '../middleware/auth';
import { dbGetSystemSettings, dbSelect, dbUpdate } from '../db/client';

const router = Router();
router.use(authRequired);

const LLM_TIMEOUT = 120000;

interface LLMSettings {
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
}

interface LLMParsed {
  drills: {
    drillName: string;
    durationSeconds: number;
    summary?: string;
    cues: string[];
  }[];
  warnings: string[];
}

const PROMPT_TEMPLATE = `你是一个专业的训练计划解析助手。请仔细分析以下训练计划文本，提取每个训练环节的信息，并以标准JSON格式输出。

训练计划原文：
---
${'{{SOURCE}}'}
---

输出格式要求：
{
  "drills": [
    {
      "drillName": "训练环节名称",
      "durationSeconds": 时长（秒数）,
      "cues": ["要点1", "要点2", "要点3"]
    }
  ],
  "warnings": ["如果有环节时长未明确或存在歧义，在此说明；否则返回空数组"]
}

解析规则：
1. 识别所有训练环节，按原文顺序排列
2. 从"XX分钟"或时间范围中提取时长，转换为秒数
3. cues字段提取该环节的教学要点、动作说明、注意事项等，每条不超过40字
4. 保持环节名称简洁清晰
5. 仅输出JSON字符串，不要包含其他解释文字`;

async function extractJson(text: string): Promise<string> {
  const start = Math.min(text.indexOf('{'), text.indexOf('['));
  if (start < 0) throw new Error('未返回 JSON');
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket) + 1;
  if (end <= start) throw new Error('未返回 JSON');
  return text.slice(start, end);
}

async function callLLM(source: string, settings: LLMSettings): Promise<LLMParsed> {
  const prompt = PROMPT_TEMPLATE.replace('{{SOURCE}}', source);

  const body: Record<string, unknown> = {
    model: settings.model || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: '你是一个专业的训练计划解析助手。请仔细分析训练计划文本，提取每个训练环节的名称、时长和教学要点，以标准JSON格式输出。',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
    max_tokens: 2000,
    top_p: 0.9,
    frequency_penalty: 0,
    presence_penalty: 0,
  };

  let endpoint = settings.endpoint;
  if (!endpoint.endsWith('/chat/completions')) {
    if (!endpoint.endsWith('/')) {
      endpoint += '/';
    }
    endpoint += 'chat/completions';
  }

  console.log(`[LLM] Calling endpoint: ${endpoint}`);
  console.log(`[LLM] Model: ${settings.model}`);
  console.log(`[LLM] Input length: ${source.length} chars`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(`[LLM] Timeout after ${LLM_TIMEOUT}ms`);
    controller.abort();
  }, LLM_TIMEOUT);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    console.log(`[LLM] Response status: ${res.status}`);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`[LLM] Error response: ${errText}`);
      throw new Error(`LLM 请求失败: ${res.status} ${errText}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      content?: string;
      usage?: { total_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
    };

    if (data.usage) {
      console.log(`[LLM] Usage: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total`);
    }

    const content =
      data.choices?.[0]?.message?.content ??
      (data as { content?: string }).content ??
      '';

    console.log(`[LLM] Response content length: ${content.length} chars`);
    console.log(`[LLM] Response content preview: ${content.slice(0, 200)}...`);

    if (!content.trim()) {
      throw new Error('LLM 返回为空');
    }

    const jsonStr = await extractJson(content);
    const parsed = JSON.parse(jsonStr) as LLMParsed;

    if (!Array.isArray(parsed.drills)) {
      throw new Error('LLM 返回的 JSON 格式不正确');
    }

    return {
      drills: parsed.drills.map((d) => ({
        drillName: String(d.drillName ?? '未命名'),
        durationSeconds: Number(d.durationSeconds) || 300,
        summary: d.summary ? String(d.summary) : undefined,
        cues: Array.isArray(d.cues) ? d.cues.map(String) : [],
      })),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getUserTrialCount(userId: string): Promise<number> {
  const rows = await dbSelect('users', 'id', userId);
  const user = rows[0];
  if (!user) return 0;
  const userSettings = (user as any).settings ?? {};
  return userSettings.llmTrialCount ?? 0;
}

async function updateUserTrialCount(userId: string, count: number): Promise<void> {
  const rows = await dbSelect('users', 'id', userId);
  const user = rows[0];
  if (!user) return;
  const userSettings = (user as any).settings ?? {};
  await dbUpdate('users', userId, {
    settings: { ...userSettings, llmTrialCount: count },
  });
}

router.post('/parse', async (req, res) => {
  try {
    const { source } = req.body as { source: string };

    if (!source || !source.trim()) {
      res.status(400).json({ error: '请提供训练文档内容' });
      return;
    }

    const llmSettings = (await dbGetSystemSettings('llm_config')) as LLMSettings;
    const trialCountSetting = (await dbGetSystemSettings('trial_count')) as number;

    if (!llmSettings || llmSettings.provider === 'none' || !llmSettings.endpoint || !llmSettings.apiKey) {
      res.status(400).json({ error: 'LLM 服务尚未配置，请联系管理员' });
      return;
    }

    const isAdmin = req.auth!.role === 'admin';
    const isPremium = req.auth!.role === 'premium';
    const currentTrialCount = await getUserTrialCount(req.auth!.userId);
    const remainingTrials = Math.max(0, (trialCountSetting || 0) - currentTrialCount);

    if (!isAdmin && !isPremium && remainingTrials <= 0) {
      res.status(403).json({
        error: '试用次数已用完',
        remainingTrials: 0,
        trialLimit: trialCountSetting || 0,
      });
      return;
    }

    const result = await callLLM(source, llmSettings);

    if (!isAdmin && !isPremium) {
      await updateUserTrialCount(req.auth!.userId, currentTrialCount + 1);
    }

    res.json({
      success: true,
      data: result,
      remainingTrials: isAdmin || isPremium ? -1 : remainingTrials - 1,
      trialLimit: trialCountSetting || 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[LLM] Parse error: ${msg}`);
    res.status(500).json({ error: msg });
  }
});

router.get('/trial-status', async (req, res) => {
  try {
    const isAdmin = req.auth!.role === 'admin';
    const isPremium = req.auth!.role === 'premium';
    const trialCountSetting = (await dbGetSystemSettings('trial_count')) as number;
    const currentTrialCount = await getUserTrialCount(req.auth!.userId);
    const remainingTrials = Math.max(0, (trialCountSetting || 0) - currentTrialCount);

    res.json({
      isAdmin,
      isPremium,
      remainingTrials: isAdmin || isPremium ? -1 : remainingTrials,
      trialLimit: trialCountSetting || 0,
      canUseLLM: isAdmin || isPremium || remainingTrials > 0,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export const llmProxyRoutes = router;