import type { DrillInput, Template } from '@/types';
import { uid } from './duration';

export type LLMProvider = 'dashscope' | 'openai' | 'custom';

export type LLMParsed = {
  drills: DrillInput[];
  warnings: string[];
};

const PROMPT_TEMPLATE = `你是一个足球训练计划结构化助手。请把下面这份训练计划解析成 JSON，格式如下：
{
  "drills": [
    {
      "drillName": "环节名",
      "durationSeconds": 秒数,
      "summary": "一句话简介，可为空字符串",
      "cues": ["话术1", "话术2"]
    }
  ],
  "warnings": ["如果有环节时长未明确或存在歧义，在 warning 里说明；否则返回空数组"]
}

规则：
- durationSeconds 如果文中未明确，请根据环节类型合理估算，并在 warnings 里说明
- cues 字段请提取该环节的教学要点/口诀/讲解话术，每条不超过 40 字
- 保持环节顺序
- 仅输出 JSON，不要额外解释

原文：
---
${'{{SOURCE}}'}
---`;

async function extractJson(text: string): Promise<string> {
  // find first { or [ and last } or ]
  const start = Math.min(text.indexOf('{'), text.indexOf('['));
  if (start < 0) throw new Error('未返回 JSON');
  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket) + 1;
  if (end <= start) throw new Error('未返回 JSON');
  return text.slice(start, end);
}

export async function parseWithLLM(
  source: string,
  opts: {
    endpoint: string;
    apiKey: string;
    model: string;
    provider?: LLMProvider;
  }
): Promise<LLMParsed> {
  const prompt = PROMPT_TEMPLATE.replace('{{SOURCE}}', source);

  const body: Record<string, unknown> = {
    model: opts.model,
    messages: [
      { role: 'system', content: '你是一个严谨的 JSON 生成助手，只输出合法 JSON。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.2,
  };

  const res = await fetch(opts.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`LLM 请求失败: ${res.status}`);
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    content?: string;
  };
  const content =
    data.choices?.[0]?.message?.content ??
    (data as { content?: string }).content ??
    '';
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
}

export function drillInputsToTemplate(drills: DrillInput[], name = '导入的训练计划'): Template {
  return {
    id: uid('tpl'),
    name,
    drills: drills.map((d) => ({
      id: uid('drill'),
      title: d.drillName,
      duration: d.durationSeconds,
      summary: d.summary,
      cues: d.cues.map((text) => ({
        id: uid('cue'),
        text,
        trigger: 'start' as const,
      })),
    })),
    createdAt: Date.now(),
  };
}
