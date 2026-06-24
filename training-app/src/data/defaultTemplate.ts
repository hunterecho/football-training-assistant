import type { Template } from '@/types';

export const defaultTemplate: Template = {
  id: 'tpl_default_kids6',
  name: '6 岁小朋友 · 60 分钟',
  description: '适合暑期集训日常，6 岁左右小朋友，约 60 分钟',
  drills: [
    {
      id: 'drill_1',
      title: '热身 · 慢跑',
      duration: 300,
      summary: '绕场地慢跑 5 分钟，让身体出汗',
      cues: [
        { id: 'c_1_1', trigger: 'start', text: '小朋友们，我们先绕球场慢跑一圈，步伐轻松，呼吸均匀' },
        { id: 'c_1_2', trigger: 'interval', seconds: 120, text: '加油，保持节奏，不要说话哦' },
      ],
    },
    {
      id: 'drill_2',
      title: '热身 · 动态拉伸',
      duration: 180,
      summary: '高抬腿、后踢腿、侧滑步',
      cues: [
        { id: 'c_2_1', trigger: 'start', text: '现在做动态拉伸：高抬腿 30 秒，后踢腿 30 秒，侧滑步 30 秒' },
      ],
    },
    {
      id: 'drill_3',
      title: '球感 · 脚底踩球',
      duration: 240,
      summary: '左右脚交替踩球，熟悉球性',
      cues: [
        { id: 'c_3_1', trigger: 'start', text: '用脚底轻轻踩球，左右脚交替，眼睛看前方，不要低头' },
        { id: 'c_3_2', trigger: 'interval', seconds: 120, text: '抬起头来！身体放松，脚步轻快' },
      ],
    },
    {
      id: 'drill_4',
      title: '技术 · 短传配合',
      duration: 600,
      summary: '两人一组，5 米短传',
      cues: [
        { id: 'c_4_1', trigger: 'start', text: '两人一组，相距 5 米，用脚内侧传球，传完立刻原地转身准备接球' },
        { id: 'c_4_2', trigger: 'interval', seconds: 300, text: '传球用脚弓，不是脚尖！' },
      ],
    },
    {
      id: 'drill_5',
      title: '技术 · 射门练习',
      duration: 480,
      summary: '运球过标志碟后射门',
      cues: [
        { id: 'c_5_1', trigger: 'start', text: '运球绕过标志碟，到射门点用脚背射门，瞄向球门两个角' },
      ],
    },
    {
      id: 'drill_6',
      title: '小比赛 · 3v3',
      duration: 900,
      summary: '小型对抗比赛，鼓励盘带和传球',
      cues: [
        { id: 'c_6_1', trigger: 'start', text: '现在分成两队，踢小比赛。敢带敢射，丢球立刻反抢！' },
        { id: 'c_6_2', trigger: 'interval', seconds: 450, text: '注意传球，不要一个人带到底' },
      ],
    },
    {
      id: 'drill_7',
      title: '放松 · 静态拉伸',
      duration: 300,
      summary: '小腿、大腿前后侧、臀部',
      cues: [
        { id: 'c_7_1', trigger: 'start', text: '坐下来做静态拉伸，每个部位保持 20 秒，深呼吸' },
      ],
    },
    {
      id: 'drill_8',
      title: '总结与鼓励',
      duration: 180,
      summary: '回顾今天的训练，表扬每一个小朋友',
      cues: [
        { id: 'c_8_1', trigger: 'start', text: '今天大家都很棒！每人说一个自己今天学到的动作，然后我们列队下课' },
      ],
    },
  ],
  createdAt: Date.now(),
};

export const exampleMarkdownDoc = `# 7 月 15 日 足球训练计划（60 分钟）

## 一、热身（5 分钟）
- 慢跑 2 圈
- 高抬腿 x 30 秒
- 后踢腿 x 30 秒

## 二、球感练习（4 分钟）
用脚底踩球，左右脚交替，眼睛看前方。

## 三、短传配合（10 分钟）
两人一组，5 米距离，用脚内侧传球，传完立刻转身。

## 四、运球过桩（8 分钟）
绕 5 个标志碟运球，保持低重心。

## 五、射门练习（8 分钟）
运球到射门点，用脚背射门，瞄球门死角。

## 六、小比赛（15 分钟）
3v3 小场地对抗，鼓励传球配合。

## 七、放松拉伸（5 分钟）
静态拉伸大腿前后侧、小腿、臀部，每个动作 20 秒。

## 八、总结（5 分钟）
回顾今天的训练要点，给每位小朋友鼓励。
`;
