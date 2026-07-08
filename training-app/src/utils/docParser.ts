import type { Drill, Template, Cue } from '@/types';
import { parseDuration, uid } from './duration';

export type ParseWarning = string;

export type ParseResult = {
  template: Template;
  warnings: ParseWarning[];
};

const DRILL_KEYWORDS = [
  '热身', '球感', '传球', '射门', '运球', '过人', '接球', '停球',
  '协调', '灵敏', '耐力', '力量', '小比赛', '比赛', '对抗', '放松',
  '拉伸', '总结', '基本功', '技术', '战术', '游戏', '趣味', '活动',
];

const SECTION_HEADING_RE = [
  /^#{1,6}\s+/,                                          // markdown # heading
  /^[\d]+[.、)：:]\s*/,                                  // 1. / 1) / 1: / 1、
  /^[一二三四五六七八九十百]+[.、)：:]\s*/,              // 一、/ 一)
  /^第[一二三四五六七八九十百\d]+[节部分章项]/,             // 第一节 / 第二部分
];

function isSectionHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  // Skip level-1 markdown headings (usually document title like "# 7月15日 训练计划")
  const h1Match = t.match(/^#\s+(?!#)/);
  if (h1Match) {
    // Only treat H1 as section if it contains drill keywords AND duration hint
    const hasKeyword = DRILL_KEYWORDS.some((k) => t.includes(k));
    const hasDuration = /\d+\s*(分|分钟|min|m|秒|秒钟|sec|s)/i.test(t);
    return hasKeyword && hasDuration && t.length <= 30;
  }
  // If line looks like a bullet/content line, don't treat as heading
  if (/^[\s]*[-*+]\s+/.test(t)) return false;
  for (const re of SECTION_HEADING_RE) {
    if (re.test(t)) return true;
  }
  // Lines containing BOTH a drill keyword AND a duration hint are headings
  // e.g. "热身（5 分钟）" or "小比赛 15 分钟"
  const hasKeyword = DRILL_KEYWORDS.some((k) => t.includes(k));
  const hasDuration = /\d+\s*(分|分钟|min|m|秒|秒钟|sec|s)/i.test(t);
  // Strict length: headings should be short (<=20 chars), long lines are descriptions
  if (hasKeyword && hasDuration && t.length <= 20) return true;
  return false;
}

function stripHeadingDecorations(t: string): string {
  let out = t.trim();
  // Remove markdown heading markers
  out = out.replace(/^#{1,6}\s*/, '');
  // Remove number prefix like "一、" / "1. " / "1)" / "一)"
  out = out.replace(/^[\d一二三四五六七八九十百]+[\s]*[.、)：:]\s*/, '');
  // Remove chapter prefix like "第一节"
  out = out.replace(/^第[一二三四五六七八九十百\d]+[节部分章项]\s*/, '');
  // Remove bullet markers
  out = out.replace(/^[\s]*[-*+]\s*/, '');
  // Remove duration in parentheses / brackets
  out = out.replace(/[（(【[]\s*\d+\s*[分秒mims分钟秒钟min]+[^)）】\]]*[)）】\]]/g, '');
  return out.trim();
}

function cleanTitle(line: string): string {
  let t = stripHeadingDecorations(line);
  if (t.length > 30) t = t.slice(0, 30).trim();
  return t || '未命名环节';
}

function extractDurationFromLine(line: string): number | null {
  const t = line.trim();
  if (!t) return null;
  // Strip surrounding parens/brackets first
  const core = t
    .replace(/[（(【[]\s*/g, ' ')
    .replace(/[)）】\]]\s*/g, ' ')
    .trim();
  // "1 分 30 秒" pattern
  const zhMixed = core.match(/(\d+)\s*(?:分|分钟|min(?:ute)?|m)\s*(\d+)\s*(?:秒|秒钟|second|sec|s)/i);
  if (zhMixed) return parseInt(zhMixed[1]) * 60 + parseInt(zhMixed[2]);
  const minMatch = core.match(/(\d+(?:\.\d+)?)\s*(?:分|分钟|min(?:ute)?|m)(?=$|[\s,，、;；)）】])/i);
  const secMatch = core.match(/(\d+(?:\.\d+)?)\s*(?:秒|秒钟|second|sec|s)(?=$|[\s,，、;；)）】])/i);
  if (minMatch || secMatch) {
    const d =
      (minMatch ? parseFloat(minMatch[1]) * 60 : 0) +
      (secMatch ? parseFloat(secMatch[1]) : 0);
    return Math.round(d);
  }
  return parseDuration(core);
}

function extractDurationFromSection(lines: string[]): number | null {
  // Check the heading line first (duration often in parens like "（5 分钟）")
  for (const line of lines.slice(0, 3)) {
    const d = extractDurationFromLine(line);
    if (d && d >= 5 && d <= 7200) return d;
  }
  return null;
}

export function parseDocument(text: string, templateName = '我的训练计划'): ParseResult {
  const warnings: ParseWarning[] = [];
  const rawLines = text.split(/\r?\n/);

  // Pass 1: Identify section boundaries
  const sections: {
    headingIndex: number;
    endIndex: number;
    heading: string;
    lines: string[];
  }[] = [];

  

  // First, find all heading indices
  const headingIndices: number[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i].trim();
    if (!line) continue;
    if (isSectionHeading(line)) {
      headingIndices.push(i);
    }
  }

  if (headingIndices.length === 0) {
    // No headings at all — treat whole text as one section
    const lines = rawLines.filter((l) => l.trim().length > 0);
    sections.push({
      headingIndex: 0,
      endIndex: rawLines.length,
      heading: '',
      lines,
    });
  } else {
    for (let k = 0; k < headingIndices.length; k++) {
      const start = headingIndices[k];
      const end = k + 1 < headingIndices.length ? headingIndices[k + 1] : rawLines.length;
      const headingLine = rawLines[start];
      const lines = rawLines
        .slice(start, end)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      sections.push({
        headingIndex: start,
        endIndex: end - 1,
        heading: headingLine,
        lines,
      });
    }
  }

  // Pass 2: For each section, derive drill
  const drills: Drill[] = [];
  for (const section of sections) {
    if (section.lines.length === 0) continue;
    const headingLine = section.lines[0];
    const bodyLines = section.lines.slice(1);
    const title = cleanTitle(headingLine);
    const duration = extractDurationFromSection(section.lines);

    // Collect cue texts from body lines (strip bullet markers)
    const cueTexts: string[] = [];
    for (const line of bodyLines) {
      const cleaned = stripHeadingDecorations(line).trim();
      if (!cleaned) continue;
      // Skip lines that are likely sub-headings inside section
      if (isSectionHeading(line) && DRILL_KEYWORDS.some((k) => cleaned.includes(k))) {
        // Treat as nested sub-section title - skip as cue
        continue;
      }
      cueTexts.push(cleaned);
    }

    const cues: Cue[] = cueTexts.map((t) => ({
      id: uid('cue'),
      text: t,
      trigger: 'start',
    }));
    const summary = cues[0]?.text ?? '';

    const effectiveDuration = duration ?? 300;
    if (duration === null) {
      warnings.push(`环节「${title}」未检测到明确时长，已默认设为 5 分钟`);
    }

    drills.push({
      id: uid('drill'),
      title,
      duration: effectiveDuration,
      summary,
      cues,
    });
  }

  if (drills.length === 0) {
    warnings.push('未识别到任何环节，请检查文档格式');
    drills.push({
      id: uid('drill'),
      title: '默认环节',
      duration: 300,
      summary: '请在模板管理中编辑',
      cues: [],
    });
  }

  const template: Template = {
    id: uid('tpl'),
    name: templateName,
    drills,
    createdAt: Date.now(),
  };

  return { template, warnings };
}

export function parseMarkdownDocument(text: string, templateName = '我的训练计划'): ParseResult {
  return parseDocument(text, templateName);
}
