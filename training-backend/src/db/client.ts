import { createClient, SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { config, isSupabaseConfigured } from '../config/index';

export type UserRow = {
  id: string;
  openid?: string;
  nickname?: string;
  avatar?: string;
  role?: string;
  settings?: unknown;
  created_at?: string;
};

export type TemplateRow = {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  drills: unknown;
  is_public?: boolean;
  price?: number;
  created_at?: string;
};

export type PlanRow = {
  id: string;
  user_id: string;
  template_id: string;
  title: string;
  date: string;
  note?: string;
  status?: string;
  created_at?: string;
  completed_at?: string | null;
};

export type TableName = 'users' | 'templates' | 'plans' | 'training_records' | 'system_settings';

let client: SupabaseClient | null = null;
let adminClient: SupabaseClient | null = null;

export function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: ws as unknown as any,
      },
    });
  }
  return client;
}

export function getAdminSupabase() {
  if (!isSupabaseConfigured() || !config.supabaseServiceKey) return null;
  if (!adminClient) {
    adminClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      realtime: {
        transport: ws as unknown as any,
      },
    });
  }
  return adminClient;
}

function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

const memUsers = new Map<string, UserRow>();
const memTemplates = new Map<string, TemplateRow[]>();
const memPlans = new Map<string, PlanRow[]>();
const memRecords = new Map<string, any[]>();
const memSystemSettings = new Map<string, { key: string; value: unknown; description?: string }>();

function getBucket(table: TableName): Map<string, unknown[]> {
  if (table === 'templates') return memTemplates as Map<string, unknown[]>;
  if (table === 'plans') return memPlans as Map<string, unknown[]>;
  if (table === 'training_records') return memRecords as Map<string, unknown[]>;
  return new Map();
}

export async function dbGetSystemSettings(key: string): Promise<unknown | null> {
  const sb = getSupabase();
  if (sb) {
    const res = await sb.from('system_settings').select('value').eq('key', key).maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return res.data?.value ?? null;
  }
  const setting = memSystemSettings.get(key);
  return setting?.value ?? null;
}

export async function dbSetSystemSettings(key: string, value: unknown, description?: string): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const res = await sb
      .from('system_settings')
      .upsert({ key, value, description, updated_at: new Date().toISOString() } as any, { onConflict: 'key' } as any);
    if (res.error) throw new Error(res.error.message);
    return;
  }
  memSystemSettings.set(key, { key, value, description });
}

function castRow<T>(r: unknown): T {
  return r as unknown as T;
}

export async function dbInsert<T>(
  table: TableName,
  row: Record<string, unknown>,
  userId?: string | null
): Promise<T> {
  const sb = getSupabase();
  if (sb) {
    const { id: _, ...rowWithoutId } = row;
    const enrichedRow =
      table !== 'users' && userId && !rowWithoutId.user_id
        ? { ...rowWithoutId, user_id: userId }
        : rowWithoutId;
    const finalRow = {
      ...enrichedRow,
      id: `${table}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    };
    const res = await sb.from(table).insert(finalRow as any).select().maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return castRow<T>(res.data);
  }
  const inserted = {
    ...row,
    id: uid(table),
    created_at: new Date().toISOString(),
  };
  if (table === 'users') {
    memUsers.set(inserted.id as string, inserted as UserRow);
  } else {
    const uidVal = (row.user_id as string) ?? userId ?? 'anon';
    const bucket = getBucket(table);
    const list = bucket.get(uidVal) ?? [];
    list.push(inserted);
    bucket.set(uidVal, list);
  }
  return castRow<T>(inserted);
}

export async function dbSelect<T>(
  table: TableName,
  column: string,
  value: string,
  _userId?: string | null,
  limit?: number,
  offset?: number
): Promise<T[]> {
  const sb = getSupabase();
  if (sb) {
    let query = sb.from(table).select('*').eq(column, value);
    if (limit) query = query.limit(limit);
    if (offset) (query as any).offset(offset);
    const res = await query.throwOnError();
    return (res.data ?? []) as T[];
  }
  if (table === 'users') {
    if (column === 'id') {
      const u = memUsers.get(value);
      return (u ? [u] : []) as T[];
    }
    if (column === 'user_id') {
      if (value === '__ALL__') return Array.from(memUsers.values()) as T[];
      const u = Array.from(memUsers.values()).find((x: any) => (x as any).user_id === value || (x as any).id === value);
      return (u ? [u] : []) as T[];
    }
    return Array.from(memUsers.values()) as T[];
  }
  const bucket = getBucket(table);
  let allRows: any[] = [];
  if (column === 'user_id') {
    allRows = bucket.get(value) ?? [];
  } else {
    for (const list of bucket.values()) {
      allRows.push(...list);
    }
    allRows = allRows.filter((row: any) => row[column] === value);
  }
  if (offset) allRows = allRows.slice(offset);
  if (limit) allRows = allRows.slice(0, limit);
  return allRows as T[];
}

export async function dbCount(
  table: TableName,
  column: string,
  value: string
): Promise<number> {
  const sb = getSupabase();
  if (sb) {
    const res = await sb.from(table).select('id', { count: 'exact', head: true }).eq(column, value);
    return res.count ?? 0;
  }
  if (table === 'users') {
    if (column === 'id') {
      return memUsers.has(value) ? 1 : 0;
    }
    if (column === 'user_id') {
      if (value === '__ALL__') return memUsers.size;
      return Array.from(memUsers.values()).some((x: any) => (x as any).user_id === value || (x as any).id === value) ? 1 : 0;
    }
    return memUsers.size;
  }
  const bucket = getBucket(table);
  if (column === 'user_id') {
    return (bucket.get(value) ?? []).length;
  }
  let count = 0;
  for (const list of bucket.values()) {
    count += (list as any[]).filter((row: any) => row[column] === value).length;
  }
  return count;
}

export async function dbUpdate<T>(
  table: TableName,
  id: string,
  patch: Record<string, unknown>,
  userId?: string | null
): Promise<T> {
  const sb = getSupabase();
  if (sb) {
    const query: any = sb.from(table).update(patch as any).eq('id', id);
    if (userId) {
      query.eq('user_id', userId);
    }
    const res = await query.select().maybeSingle();
    if (res.error) throw new Error(res.error.message);
    if (!res.data) throw new Error('Not found or no permission');
    return castRow<T>(res.data);
  }
  const bucket = getBucket(table);
  for (const [uidKey, list] of bucket.entries()) {
    const idx = list.findIndex((r: any) => r.id === id);
    if (idx >= 0) {
      if (userId && uidKey !== userId) {
        throw new Error('Not found or no permission');
      }
      const updated = { ...(list[idx] as object), ...patch };
      list[idx] = updated as unknown;
      bucket.set(uidKey, list);
      return castRow<T>(updated);
    }
  }
  throw new Error('Not found');
}

export async function dbDelete(
  table: TableName,
  id: string,
  userId?: string | null
): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    const query: any = sb.from(table).delete().eq('id', id);
    if (userId) {
      query.eq('user_id', userId);
    }
    const res = await query;
    if (res.error) throw new Error(res.error.message);
    if (res.count === 0 && userId) {
      throw new Error('Not found or no permission');
    }
    return;
  }
  const bucket = getBucket(table);
  for (const [uidKey, list] of bucket.entries()) {
    const hasItem = (list as any[]).some((r: any) => r.id === id);
    if (hasItem) {
      if (userId && uidKey !== userId) {
        throw new Error('Not found or no permission');
      }
      const filtered = (list as any[]).filter((r: any) => r.id !== id);
      bucket.set(uidKey, filtered as unknown[]);
      return;
    }
  }
  throw new Error('Not found');
}

export async function dbUpsertUser(row: UserRow): Promise<UserRow> {
  const sb = getSupabase();
  if (sb) {
    const finalRow = {
      ...row,
      id: row.id || `user_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    };
    const res = await sb
      .from('users')
      .upsert(finalRow as any, { onConflict: 'id' } as any)
      .select()
      .maybeSingle();
    if (res.error) throw new Error(res.error.message);
    return castRow<UserRow>(res.data);
  }
  const existing = memUsers.get(row.id);
  if (existing) return existing;
  memUsers.set(row.id, { ...row, created_at: row.created_at ?? new Date().toISOString() });
  return memUsers.get(row.id)!;
}

export function resetMemoryStore() {
  memUsers.clear();
  memTemplates.clear();
  memPlans.clear();
  memRecords.clear();
}
