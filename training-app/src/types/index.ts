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

export type PlanStatus = 'planned' | 'completed' | 'skipped';

export type TrainingPlan = {
  id: string;
  templateId: string;
  title: string;
  date: string;
  note?: string;
  status: PlanStatus;
  createdAt: number;
  completedAt?: number;
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
