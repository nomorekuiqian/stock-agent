import { request } from './api';
import { getToken, setToken, setOpenid, getOpenid, clearAll } from '../utils/storage';

interface LoginResult {
  success: boolean;
  token?: string;
  user_id?: string;
  openid?: string;
  is_bound: boolean;
  error?: string;
}

interface BindResult {
  success: boolean;
  token?: string;
  user_id?: string;
  error?: string;
}

/**
 * WeChat login: get code from wx.login, exchange for openid via backend.
 */
export async function wechatLogin(): Promise<LoginResult> {
  return new Promise((resolve) => {
    wx.login({
      success: async (loginRes) => {
        if (!loginRes.code) {
          resolve({ success: false, is_bound: false, error: 'wx.login failed' });
          return;
        }
        try {
          const result = await request<LoginResult>('/wechat/login', {
            method: 'POST',
            data: { code: loginRes.code },
          });

          if (result.success && result.openid) {
            setOpenid(result.openid);
          }
          if (result.token) {
            setToken(result.token);
          }

          resolve(result);
        } catch (err) {
          resolve({ success: false, is_bound: false, error: String(err) });
        }
      },
      fail: (err) => {
        resolve({ success: false, is_bound: false, error: err.errMsg });
      },
    });
  });
}

/**
 * Bind WeChat account to existing email account.
 */
export async function bindAccount(email: string, password: string): Promise<BindResult> {
  const openid = getOpenid();
  if (!openid) {
    return { success: false, error: 'No openid found. Please login with WeChat first.' };
  }

  try {
    const result = await request<BindResult>('/wechat/bind', {
      method: 'POST',
      data: { openid, email, password },
    });

    if (result.success && result.token) {
      setToken(result.token);
    }

    return result;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Check if user is logged in (has valid token).
 */
export function isLoggedIn(): boolean {
  return !!getToken();
}

/**
 * Logout: clear all stored auth data.
 */
export function logout(): void {
  clearAll();
}

interface RegisterRequestResult {
  success: boolean;
  action?: string;  // "create_new" | "bind_existing"
  error?: string;
}

/**
 * Step 1 of OTP registration: POST email to backend, triggers verification email.
 * Requires a valid WeChat JWT (any type) to be stored via setToken().
 */
export async function registerRequest(email: string): Promise<RegisterRequestResult> {
  try {
    return await request<RegisterRequestResult>('/wechat/register/request', {
      method: 'POST',
      data: { email },
      needAuth: true,
    });
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Re-run wx.login() to exchange a fresh code for an updated JWT.
 * Call after user confirms email verification to upgrade unbound → email_only/bound.
 */
export async function refreshLogin(): Promise<LoginResult> {
  return wechatLogin();
}
