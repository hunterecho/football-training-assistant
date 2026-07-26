-- 添加 audio_manifest 字段到 templates 表，用于存储预生成的 TTS 音频清单
alter table if exists public.templates
  add column if not exists audio_manifest jsonb default '{}';

-- 添加 audio_manifest 字段到 plans 表，用于分享计划的预生成音频
alter table if exists public.plans
  add column if not exists audio_manifest jsonb default '{}';
