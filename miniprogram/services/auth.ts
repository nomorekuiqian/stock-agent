import { request } from './api';
import { getToken, setToken, setOpenid, setAccountState, clearAll, AccountState } from '../utils/storage';

interface LoginResult {
  success: boolean;
  token?: string;
  user_id?: string;
  openid?: string;
  is_bound: boolean;
  account_state?: string;
  error?: string;
}

interface OtpSendResult {
  success: boolean;
  action?: string;   // "bind_existing" | "create_new"
  error?: string;
}

interface OtpVerifyResult {
  success: boolean;
  token?: string;
  account_state?: string;  // "email_only" | "bound"
  error?: string;
}

/**
 * WeChat login: exchange wx.login() code for openid and JWT via backend.
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
          if (result.success && result.openid) setOpenid(result.openid);
          if (result.token) setToken(result.token);
          if (result.account_state) setAccountState(result.account_state as AccountState);
          resolve(result);
        } catch (err) {
          resolve({ success: false, is_bound: false, error: String(err) });
        }
      },
      fail: (err) => resolve({ success: false, is_bound: false, error: err.errMsg }),
    });
  });
}

/**
 * Step 1: Send 6-digit OTP to email.
 * Requires a valid WeChat JWT (any type) stored via setToken().
 */
export async function sendOtp(email: string): Promise<OtpSendResult> {
  try {
    return await request<OtpSendResult>('/wechat/otp/send', {
      method: 'POST',
      data: { email },
      needAuth: true,
    });
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Step 2: Verify 6-digit OTP. Stores new JWT on success.
 */
export async function verifyOtp(email: string, code: string): Promise<OtpVerifyResult> {
  try {
    const result = await request<OtpVerifyResult>('/wechat/otp/verify', {
      method: 'POST',
      data: { email, code },
      needAuth: true,
    });
    if (result.success && result.token) {
      setToken(result.token);
      if (result.account_state) setAccountState(result.account_state as AccountState);
    }
    return result;
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Re-run wx.login() to refresh JWT after external state change.
 */
export async function refreshLogin(): Promise<LoginResult> {
  return wechatLogin();
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function logout(): void {
  clearAll();
}
