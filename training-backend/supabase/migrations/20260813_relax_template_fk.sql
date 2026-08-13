-- 放宽 template 外键约束：on delete restrict → on delete set null
-- 删除模板后，关联的计划和训练记录的 template_id 自动置空，不再阻止删除
-- 计划/记录本身存储了 drills 副本，不依赖模板存在

-- 1. plans.template_id: restrict → set null（已是 nullable）
alter table public.plans
  drop constraint if exists plans_template_id_fkey,
  add constraint plans_template_id_fkey
    foreign key (template_id) references public.templates(id)
    on delete set null;

-- 2. training_records.template_id: not null → nullable, restrict → set null
alter table public.training_records
  alter column template_id drop not null,
  drop constraint if exists training_records_template_id_fkey,
  add constraint training_records_template_id_fkey
    foreign key (template_id) references public.templates(id)
    on delete set null;
