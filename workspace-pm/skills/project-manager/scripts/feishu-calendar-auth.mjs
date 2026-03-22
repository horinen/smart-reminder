#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 飞书日历 OAuth 授权流程
 * 
 * 输入:
 *   --action start|callback|status|refresh
 *   start:
 *     --redirect-uri (可选) 回调地址，默认 http://localhost:3000/callback
 *   callback:
 *     --url 跳转后的完整回调 URL (推荐)
 *     --code 授权码 (备选)
 *   refresh:
 *     无额外参数
 * 
 * 输出:
 *   - stdout: 授权状态和凭证信息
 *   - 文件: ../data/feishu-calendar.json (calendarToken 字段)
 * 
 * 所需权限:
 *   - calendar:calendar:readonly
 *   - calendar:calendar
 * 
 * 测试:
 *   - [x] start 生成授权链接
 *   - [x] callback 获取 token (--url 方式)
 *   - [x] status 查看授权状态
 *   - [x] refresh 刷新 token
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { URL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const keysFile = path.join(dataDir, 'feishu-calendar.json');

const FEISHU_AUTH_URL = 'https://open.feishu.cn/open-apis/authen/v1/authorize';
const FEISHU_TOKEN_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/access_token';
const FEISHU_REFRESH_URL = 'https://open.feishu.cn/open-apis/authen/v1/oidc/refresh_access_token';

const SCOPES = ['calendar:calendar:readonly', 'calendar:calendar'];

function loadConfig() {
  if (!fs.existsSync(keysFile)) {
    throw new Error(`飞书日历配置文件不存在: ${keysFile}\n请复制 feishu-calendar.example.json 为 feishu-calendar.json 并填写配置`);
  }
  return JSON.parse(fs.readFileSync(keysFile, 'utf-8'));
}

function loadToken() {
  const config = loadConfig();
  return config.calendarToken || null;
}

function saveToken(token) {
  const config = loadConfig();
  config.calendarToken = token;
  fs.writeFileSync(keysFile, JSON.stringify(config, null, 2));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      params[key] = value;
      i++;
    }
  }
  
  return params;
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

function actionStart(params) {
  const config = loadConfig();
  const redirectUri = params['redirect-uri'] || 'http://localhost:3000/callback';
  
  const authUrl = new URL(FEISHU_AUTH_URL);
  authUrl.searchParams.set('app_id', config.appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', Date.now().toString());
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  
  console.log('## 飞书日历授权\n');
  console.log('### 步骤 1: 访问授权链接\n');
  console.log(authUrl.toString());
  console.log('\n### 步骤 2: 授权后浏览器会跳转\n');
  console.log(`回调地址: ${redirectUri}`);
  console.log('\n### 步骤 3: 把跳转后的完整 URL 发回来\n');
  console.log('node feishu-calendar-auth.mjs --action callback --url "跳转后的完整URL"');
}

async function actionCallback(params) {
  let code = params.code;
  
  if (!code && params.url) {
    try {
      const url = new URL(params.url);
      code = url.searchParams.get('code');
    } catch (e) {
      console.error('❌ URL 解析失败，请检查格式');
      process.exit(1);
    }
  }
  
  if (!code) {
    console.error('用法: node feishu-calendar-auth.mjs --action callback --url "跳转后的完整URL"');
    console.error('  或: node feishu-calendar-auth.mjs --action callback --code "授权码"');
    process.exit(1);
  }
  
  try {
    const tenantToken = await getTenantAccessToken();
    
    const response = await fetch(FEISHU_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tenantToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code: code
      })
    });
    
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(data.msg);
    }
    
    const tokenData = {
      accessToken: data.data.access_token,
      refreshToken: data.data.refresh_token,
      expiresIn: data.data.expires_in,
      tokenType: data.data.token_type,
      openId: data.data.open_id,
      unionId: data.data.union_id,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + data.data.expires_in * 1000).toISOString()
    };
    
    saveToken(tokenData);
    
    console.log('✅ 授权成功！\n');
    console.log(`- Open ID: ${tokenData.openId}`);
    console.log(`- 过期时间: ${tokenData.expiresAt}`);
    console.log(`\n凭证已保存到: ${keysFile}`);
  } catch (e) {
    console.error(`❌ 授权失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionStatus() {
  const token = loadToken();
  
  if (!token) {
    console.log('## 授权状态\n\n❌ 未授权\n\n请运行: node feishu-calendar-auth.mjs --action start');
    return;
  }
  
  const now = new Date();
  const expiresAt = new Date(token.expiresAt);
  const isExpired = now >= expiresAt;
  const remainingMs = expiresAt - now;
  const remainingHours = Math.floor(remainingMs / (1000 * 60 * 60));
  
  console.log('## 授权状态\n');
  console.log(`- Open ID: ${token.openId}`);
  console.log(`- 创建时间: ${token.createdAt}`);
  console.log(`- 过期时间: ${token.expiresAt}`);
  console.log(`- 状态: ${isExpired ? '❌ 已过期' : `✅ 有效 (剩余 ${remainingHours} 小时)`}`);
  
  if (isExpired) {
    console.log('\n请运行: node feishu-calendar-auth.mjs --action refresh');
  }
}

async function actionRefresh() {
  const token = loadToken();
  
  if (!token) {
    console.error('❌ 未找到授权信息，请先授权');
    process.exit(1);
  }
  
  try {
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
    
    saveToken(newToken);
    
    console.log('✅ Token 刷新成功！\n');
    console.log(`- 新过期时间: ${newToken.expiresAt}`);
  } catch (e) {
    console.error(`❌ 刷新失败: ${e.message}`);
    console.log('\n请重新授权: node feishu-calendar-auth.mjs --action start');
    process.exit(1);
  }
}

function main() {
  const params = parseArgs();
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  switch (params.action) {
    case 'start':
      actionStart(params);
      break;
    case 'callback':
      actionCallback(params);
      break;
    case 'status':
      actionStatus();
      break;
    case 'refresh':
      actionRefresh();
      break;
    default:
      console.log('用法: node feishu-calendar-auth.mjs --action start|callback|status|refresh');
      console.log('\n动作说明:');
      console.log('  start    - 生成授权链接，启动授权流程');
      console.log('  callback - 使用回调 URL 或授权码完成授权 (--url 或 --code)');
      console.log('  status   - 查看当前授权状态');
      console.log('  refresh  - 刷新 access_token');
  }
}

main();
