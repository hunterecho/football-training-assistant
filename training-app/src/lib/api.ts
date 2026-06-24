import { useAuthStore } from '@/store/authStore';

// 根据环境设置API地址
const API_BASE = import.meta.env.VITE_API_URL || '/api';

export type ApiResult<T> =
  | { data: T; error?: undefined }
  | { data?: undefined; error: string };

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<ApiResult<T>> {
  try {
    const token = useAuthStore.getState().token;
    const headers = new Headers(init.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (!headers.has('Content-Type') && init.body) {
      headers.set('Content-Type', 'application/json');
    }
    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      useAuthStore.getState().logout();
      return { error: '登录已过期，请重新登录' };
    }
    if (!res.ok) {
      return { error: (body as any)?.error || `请求失败 (${res.status})` };
    }
    return { data: body as T };
  } catch (err) {
    return { error: err instanceof Error ? err.message : '网络错误' };
  }
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
