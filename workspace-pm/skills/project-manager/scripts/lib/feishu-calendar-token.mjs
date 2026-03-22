/**
 * 飞书日历 Token 管理公共模块
 * 
 * 提供 user_access_token 的加载、保存、刷新功能
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../../data');
const keysFile = path.join(dataDir, 'feishu-calendar.json');

const FEISHU_REFRESH_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token';

function getConfigPath() {
  return keysFile;
}

function loadConfig() {
  if (!fs.existsSync(keysFile)) {
    throw new Error(`飞书日历配置文件不存在: ${keysFile}`);
  }
  return JSON.parse(fs.readFileSync(keysFile, 'utf-8'));
}

function loadCalendarToken() {
  const config = loadConfig();
  return config.calendarToken || null;
}

function saveCalendarToken(token) {
  const config = loadConfig();
  config.calendarToken = token;
  fs.writeFileSync(keysFile, JSON.stringify(config, null, 2));
}

function isTokenExpiringSoon(token, thresholdMs = 3600000) {
  if (!token || !token.expiresAt) {
    return true;
  }
  const expiresAt = new Date(token.expiresAt);
  const now = new Date();
  return (expiresAt - now) < thresholdMs;
}

async function getTenantAccessToken() {
  const config = loadConfig();
  
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret
    })
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(`获取 tenant_access_token 失败: ${data.msg}`);
  }
  
  return data.tenant_access_token;
}

async function refreshCalendarToken() {
  const token = loadCalendarToken();
  
  if (!token) {
    throw new Error('未找到授权信息，请先授权');
  }
  
  const tenantToken = await getTenantAccessToken();
  
  const response = await fetch(FEISHU_REFRESH_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tenantToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken
    })
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(data.msg);
  }
  
  const newToken = {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresIn: data.data.expires_in,
    tokenType: data.data.token_type,
    openId: data.data.open_id || token.openId,
    unionId: data.data.union_id || token.unionId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + data.data.expires_in * 1000).toISOString()
  };
  
  saveCalendarToken(newToken);
  
  return newToken;
}

async function ensureValidCalendarToken() {
  const token = loadCalendarToken();
  
  if (!token) {
    throw new Error('未找到飞书日历授权信息，请先运行: node feishu-calendar-auth.mjs --action start');
  }
  
  if (isTokenExpiringSoon(token)) {
    try {
      const newToken = await refreshCalendarToken();
      return newToken.accessToken;
    } catch (e) {
      throw new Error(`Token 刷新失败: ${e.message}，请运行: node feishu-calendar-auth.mjs --action start`);
    }
  }
  
  const expiresAt = new Date(token.expiresAt);
  if (new Date() >= expiresAt) {
    throw new Error('授权已过期，请运行: node feishu-calendar-auth.mjs --action refresh');
  }
  
  return token.accessToken;
}

export {
  getConfigPath,
  loadConfig,
  loadCalendarToken,
  saveCalendarToken,
  isTokenExpiringSoon,
  getTenantAccessToken,
  refreshCalendarToken,
  ensureValidCalendarToken
};
