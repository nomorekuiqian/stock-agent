import { getToken } from '../utils/storage';

// Change this to your backend URL
// Development: use local IP or ngrok
// Production: use your deployed backend URL
const BASE_URL = 'http://localhost:8000/api';

// Change this to your frontend URL for WebView
// const WEB_BASE_URL = 'http://localhost:3000';
const WEB_BASE_URL = 'https://themarketbrew.com';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  needAuth?: boolean;
}

export function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', data, needAuth = false } = options;

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (needAuth) {
    const token = getToken();
    if (token) {
      header['Authorization'] = `Bearer ${token}`;
    }
  }

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${path}`,
      method,
      data,
      header,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T);
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(res.data)}`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg));
      },
    });
  });
}

/**
 * Build a full WebView URL with token injection.
 */
export function buildWebViewUrl(path: string): string {
  const token = getToken();
  const separator = path.includes('?') ? '&' : '?';
  const tokenParam = token ? `${separator}from=wechat&token=${encodeURIComponent(token)}` : `${separator}from=wechat`;
  return `${WEB_BASE_URL}${path}${tokenParam}`;
}
