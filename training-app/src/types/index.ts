export type CueTrigger = 'start' | 'end' | 'interval' | 'periodic';

export type Cue = {
  id: string;
  text: string;
  trigger: CueTrigger;
  seconds?: number;
};

export type Drill = {
  id: string;
  title: string;
  duration: number;
  summary?: string;
  cues: Cue[];
};

export type Template = {
  id: string;
  name: string;
  description?: string;
  drills: Drill[];
  createdAt: number;
};

export type RecordStatus = 'planned' | 'in_progress' | 'completed' | 'skipped';

export type TrainingRecord = {
  id: string;
  templateId: string;
  title: string;
  date?: string; // 计划日期（仅 planned 状态有）
  status: RecordStatus;
  startTime?: number; // 训练开始时间（in_progress/completed 状态有）
  endTime?: number; // 训练结束时间（completed 状态有）
  durationSeconds?: number; // 训练时长（in_progress/completed 状态有）
  completedDrills?: number; // 已完成环节数（in_progress/completed 状态有）
  totalDrills?: number; // 总环节数（in_progress/completed 状态有）
  note?: string;
  createdAt: number;
  completedAt?: number; // 计划完成时间（completed 状态有）
};

export type SessionStatus = 'idle' | 'running' | 'paused' | 'finished';

export type SessionState = {
  templateId: string | null;
  drillIndex: number;
  remaining: number;
  status: SessionStatus;
  startedAt: number | null;
  lastTickTs: number | null;
  drillStartedAt: number | null;
};

export type LLMProvider = 'none' | 'dashscope' | 'openai' | 'custom';

export type Settings = {
  speechRate: number;
  speechVolume: number;
  speechEnabled: boolean;
  soundEnabled: boolean;
  speechVoiceIndex: number;
  keepScreenAwake: boolean;
  llm: {
    provider: LLMProvider;
    endpoint?: string;
    apiKey?: string;
    model?: string;
  };
};

export type ImportWarnings = string[];

export type DrillInput = {
  drillName: string;
  durationSeconds: number;
  summary?: string;
  cues: string[];
};
