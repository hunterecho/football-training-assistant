import { describe, it, expect } from 'vitest';
import {
  extractTextsFromDrills,
  getSystemTexts,
  SYSTEM_REST_DURATIONS,
} from './ttsService';

// formatDurationChinese 未导出，通过 getSystemTexts / extractTextsFromDrills 间接验证

describe('extractTextsFromDrills', () => {
  it('正常提取 title / 开始语 / 完成 / summary / cues', () => {
    const drills = [
      {
        title: '热身',
        duration: 60,
        summary: '慢跑拉伸',
        cues: [{ text: '注意呼吸' }, { text: '保持节奏' }],
      },
    ];
    const texts = extractTextsFromDrills(drills, 0);
    expect(texts).toContain('热身');
    expect(texts).toContain('现在开始 热身，时长 1 分钟');
    expect(texts).toContain('热身 完成');
    expect(texts).toContain('慢跑拉伸');
    expect(texts).toContain('注意呼吸');
    expect(texts).toContain('保持节奏');
  });

  it('空 drills 返回空数组', () => {
    expect(extractTextsFromDrills([], 0)).toEqual([]);
  });

  it('trim 空白字符', () => {
    const drills = [
      {
        title: '  热身  ',
        duration: 30,
        summary: '  慢跑  ',
        cues: [{ text: '  注意  ' }],
      },
    ];
    const texts = extractTextsFromDrills(drills, 0);
    expect(texts).toContain('热身');
    expect(texts).toContain('现在开始 热身，时长 30 秒');
    expect(texts).toContain('热身 完成');
    expect(texts).toContain('慢跑');
    expect(texts).toContain('注意');
  });

  it('跳过空字符串（summary 和 cues trim 后为空则跳过）', () => {
    const drills = [
      {
        title: '热身',
        duration: 30,
        summary: '   ',
        cues: [{ text: '  ' }, { text: '' }],
      },
    ];
    const texts = extractTextsFromDrills(drills, 0);
    // title 相关的 3 条都在
    expect(texts).toContain('热身');
    expect(texts).toContain('现在开始 热身，时长 30 秒');
    expect(texts).toContain('热身 完成');
    // 没有 summary（trim 后为空）和 cues（trim 后为空）
    expect(texts).not.toContain('');
    // 总共 3 条（title × 3，无 summary，无 cues）
    expect(texts).toHaveLength(3);
  });
});

describe('getSystemTexts', () => {
  it('包含基础文案', () => {
    const texts = getSystemTexts();
    expect(texts).toContain('训练完成，大家辛苦了！');
    expect(texts).toContain('还剩一分钟');
    expect(texts).toContain('休息结束');
    expect(texts).toContain('开始休息');
  });

  it('包含数字 1-10', () => {
    const texts = getSystemTexts();
    for (let i = 1; i <= 10; i++) {
      expect(texts).toContain(String(i));
    }
  });

  it('包含休息时长文案', () => {
    const texts = getSystemTexts();
    // SYSTEM_REST_DURATIONS = [15, 20, 25, 30, 45, 60, 90, 120, 180]
    expect(texts).toContain('休息 15 秒');
    expect(texts).toContain('休息 30 秒');
    expect(texts).toContain('休息 45 秒');
    expect(texts).toContain('休息 1 分钟'); // 60s
    expect(texts).toContain('休息 1 分 30 秒'); // 90s
    expect(texts).toContain('休息 2 分钟'); // 120s
    expect(texts).toContain('休息 3 分钟'); // 180s
  });

  it('休息文案数量与 SYSTEM_REST_DURATIONS 一致', () => {
    const texts = getSystemTexts();
    const restTexts = texts.filter((t) => t.startsWith('休息 '));
    expect(restTexts).toHaveLength(SYSTEM_REST_DURATIONS.length);
  });
});
