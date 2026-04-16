const TOKEN_KEY = 'tmb_token';
const USER_KEY = 'tmb_user';
const OPENID_KEY = 'tmb_openid';
const ACCOUNT_STATE_KEY = 'tmb_account_state';
const EMAIL_KEY = 'tmb_email';

export type AccountState = 'unbound' | 'email_only' | 'bound';

export function getToken(): string {
  return wx.getStorageSync(TOKEN_KEY) || '';
}

export function setToken(token: string): void {
  wx.setStorageSync(TOKEN_KEY, token);
}

export function clearToken(): void {
  wx.removeStorageSync(TOKEN_KEY);
}

export function getOpenid(): string {
  return wx.getStorageSync(OPENID_KEY) || '';
}

export function setOpenid(openid: string): void {
  wx.setStorageSync(OPENID_KEY, openid);
}

export function getUserInfo(): { nickname: string; avatarUrl: string } | null {
  const data = wx.getStorageSync(USER_KEY);
  return data || null;
}

export function setUserInfo(info: { nickname: string; avatarUrl: string }): void {
  wx.setStorageSync(USER_KEY, info);
}

export function getAccountState(): AccountState {
  return wx.getStorageSync(ACCOUNT_STATE_KEY) || 'unbound';
}

export function setAccountState(state: AccountState): void {
  wx.setStorageSync(ACCOUNT_STATE_KEY, state);
}

export function getEmail(): string {
  return wx.getStorageSync(EMAIL_KEY) || '';
}

export function setEmail(email: string): void {
  wx.setStorageSync(EMAIL_KEY, email);
}

export function clearAll(): void {
  wx.removeStorageSync(TOKEN_KEY);
  wx.removeStorageSync(USER_KEY);
  wx.removeStorageSync(OPENID_KEY);
  wx.removeStorageSync(ACCOUNT_STATE_KEY);
  wx.removeStorageSync(EMAIL_KEY);
}
