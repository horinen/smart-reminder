#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 写入提醒/日程到飞书日历
 * 
 * 输入:
 *   --action create|update|delete
 *   create:
 *     --title (必须) 事件标题
 *     --start (必须) 开始时间 ISO 格式
 *     --end (可选) 结束时间，默认 start 后1小时
 *     --type (可选) important|routine|free，默认 routine
 *     --desc (可选) 事件描述
 *     --calendar-id (可选) 日历 ID，默认 primary
 *   update:
 *     --event-id (必须) 飞书事件 ID
 *     --title --start --end --type --desc (可选，至少一个)
 *   delete:
 *     --event-id (必须) 飞书事件 ID
 * 
 * 输出:
 *   - stdout: 操作结果
 *   - 返回的事件 ID 可用于后续更新/删除
 * 
 * 测试:
 *   - [x] create 创建事件
 *   - [x] update 更新事件
 *   - [x] delete 删除事件
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const keysFile = path.join(dataDir, 'feishu-keys.json');

const FEISHU_CREATE_EVENT_URL = 'https://open.feishu.cn/open-apis/calendar/v4/calendars/{calendar_id}/events';
const FEISHU_UPDATE_EVENT_URL = 'https://open.feishu.cn/open-apis/calendar/v4/calendars/{calendar_id}/events/{event_id}';
const FEISHU_DELETE_EVENT_URL = 'https://open.feishu.cn/open-apis/calendar/v4/calendars/{calendar_id}/events/{event_id}';
const FEISHU_CALENDAR_LIST_URL = 'https://open.feishu.cn/open-apis/calendar/v4/calendars';

const TYPE_TO_COLOR = {
  important: -8388608,
  routine: -11034625,
  free: -16711936
};

const TYPE_TO_EMOJI = {
  important: '🔴',
  routine: '🔵',
  free: '🟢'
};

function toTimestamp(date) {
  return Math.floor(date.getTime() / 1000);
}

function loadConfig() {
  if (!fs.existsSync(keysFile)) {
    throw new Error(`飞书配置文件不存在: ${keysFile}`);
  }
  return JSON.parse(fs.readFileSync(keysFile, 'utf-8'));
}

function loadToken() {
  const config = loadConfig();
  if (!config.calendarToken) {
    throw new Error('未找到飞书日历授权信息，请先运行: node feishu-calendar-auth.mjs --action start');
  }
  return config.calendarToken;
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

function ensureValidToken(token) {
  const expiresAt = new Date(token.expiresAt);
  const now = new Date();
  
  if (now >= expiresAt) {
    throw new Error('授权已过期，请运行: node feishu-calendar-auth.mjs --action refresh');
  }
  
  return token.accessToken;
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

async function getPrimaryCalendar(accessToken) {
  const response = await fetch('https://open.feishu.cn/open-apis/calendar/v4/calendars', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(`获取日历列表失败: ${data.msg}`);
  }
  
  const calendars = data.data?.calendar_list || data.data?.calendars || [];
  const primary = calendars.find(c => c.type === 'primary');
  
  return primary ? primary.calendar_id : (calendars[0]?.calendar_id || null);
}

async function actionCreate(params) {
  if (!params.title || !params.start) {
    console.error('用法: node feishu-calendar-write.mjs --action create --title "标题" --start "ISO时间" [--end "ISO时间"] [--type important|routine|free] [--desc "描述"]');
    process.exit(1);
  }
  
  // 使用 user_access_token，这样事件会创建在用户的主日历上
  const token = loadToken();
  const userAccessToken = ensureValidToken(token);
  const calendarId = await getPrimaryCalendar(userAccessToken);
  
  if (!calendarId) {
    throw new Error('未找到可用日历');
  }
  
  const startTime = new Date(params.start);
  const endTime = params.end ? new Date(params.end) : new Date(startTime.getTime() + 60 * 60 * 1000);
  const type = params.type || 'routine';
  const emoji = TYPE_TO_EMOJI[type] || TYPE_TO_EMOJI.routine;
  
  const url = FEISHU_CREATE_EVENT_URL.replace('{calendar_id}', calendarId);
  
  const eventData = {
    summary: `${emoji} ${params.title}`,
    start_time: {
      timestamp: String(toTimestamp(startTime)),
      timezone: 'Asia/Shanghai'
    },
    end_time: {
      timestamp: String(toTimestamp(endTime)),
      timezone: 'Asia/Shanghai'
    },
    description: params.desc || '',
    visibility: 'default',
    color: TYPE_TO_COLOR[type] || TYPE_TO_COLOR.routine,
    reminders: [
      { minutes: 15 }
    ]
  };
  
  console.log('## 创建飞书日历事件\n');
  console.log(`- 标题: ${params.title}`);
  console.log(`- 时间: ${startTime.toLocaleString('zh-CN')} ~ ${endTime.toLocaleString('zh-CN')}`);
  console.log(`- 类型: ${type}`);
  console.log(`- 日历: ${calendarId}`);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });
    
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(data.msg);
    }
    
    const eventId = data.data?.event?.event_id;
    
    console.log(`\n✅ 创建成功`);
    console.log(`\n事件 ID: ${eventId}`);
    console.log(`\n可用于后续操作:`);
    console.log(`  node feishu-calendar-write.mjs --action update --event-id "${eventId}" --title "新标题"`);
    console.log(`  node feishu-calendar-write.mjs --action delete --event-id "${eventId}"`);
  } catch (e) {
    console.error(`\n❌ 创建失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionUpdate(params) {
  if (!params['event-id']) {
    console.error('用法: node feishu-calendar-write.mjs --action update --event-id "事件ID" [--title "标题"] [--start "ISO时间"] [--end "ISO时间"] [--type important|routine|free] [--desc "描述"]');
    process.exit(1);
  }
  
  const hasUpdate = params.title || params.start || params.end || params.desc || params.type;
  if (!hasUpdate) {
    console.error('⚠️ 未指定更新字段');
    process.exit(1);
  }
  
  const token = loadToken();
  const userAccessToken = ensureValidToken(token);
  const calendarId = await getPrimaryCalendar(userAccessToken);
  
  if (!calendarId) {
    throw new Error('未找到可用日历');
  }
  
  const eventId = params['event-id'];
  
  const url = FEISHU_UPDATE_EVENT_URL
    .replace('{calendar_id}', calendarId)
    .replace('{event_id}', eventId);
  
  const eventData = {};
  
  if (params.title) {
    const type = params.type || 'routine';
    const emoji = TYPE_TO_EMOJI[type] || TYPE_TO_EMOJI.routine;
    eventData.summary = `${emoji} ${params.title}`;
  }
  if (params.desc) eventData.description = params.desc;
  if (params.type) eventData.color = TYPE_TO_COLOR[params.type] || TYPE_TO_COLOR.routine;
  if (params.start) {
    eventData.start_time = {
      timestamp: String(toTimestamp(new Date(params.start))),
      timezone: 'Asia/Shanghai'
    };
  }
  if (params.end) {
    eventData.end_time = {
      timestamp: String(toTimestamp(new Date(params.end))),
      timezone: 'Asia/Shanghai'
    };
  }
  
  console.log('## 更新飞书日历事件\n');
  console.log(`- 事件 ID: ${eventId}`);
  console.log(`- 更新字段: ${Object.keys(eventData).join(', ')}`);
  
  try {
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    });
    
    const text = await response.text();
    console.log(`DEBUG response status: ${response.status}`);
    console.log(`DEBUG response text: ${text.substring(0, 500)}`);
    
    const data = JSON.parse(text);
    
    if (data.code !== 0) {
      throw new Error(data.msg);
    }
    
    console.log(`\n✅ 更新成功`);
  } catch (e) {
    console.error(`\n❌ 更新失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionDelete(params) {
  if (!params['event-id']) {
    console.error('用法: node feishu-calendar-write.mjs --action delete --event-id "事件ID"');
    process.exit(1);
  }
  
  const token = loadToken();
  const userAccessToken = ensureValidToken(token);
  const calendarId = await getPrimaryCalendar(userAccessToken);
  
  if (!calendarId) {
    throw new Error('未找到可用日历');
  }
  
  const eventId = params['event-id'];
  
  const url = FEISHU_DELETE_EVENT_URL
    .replace('{calendar_id}', calendarId)
    .replace('{event_id}', eventId);
  
  console.log('## 删除飞书日历事件\n');
  console.log(`- 事件 ID: ${eventId}`);
  
  try {
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${userAccessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(data.msg);
    }
    
    console.log(`\n✅ 删除成功`);
  } catch (e) {
    console.error(`\n❌ 删除失败: ${e.message}`);
    process.exit(1);
  }
}

async function main() {
  const params = parseArgs();
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  switch (params.action) {
    case 'create':
      await actionCreate(params);
      break;
    case 'update':
      await actionUpdate(params);
      break;
    case 'delete':
      await actionDelete(params);
      break;
    default:
      console.log('用法: node feishu-calendar-write.mjs --action create|update|delete');
      console.log('\n动作说明:');
      console.log('  create - 创建日历事件');
      console.log('  update - 更新日历事件');
      console.log('  delete - 删除日历事件');
      console.log('\n参数:');
      console.log('  --title       事件标题 (create, update)');
      console.log('  --start       开始时间 ISO 格式 (create, update)');
      console.log('  --end         结束时间 ISO 格式 (create, update)');
      console.log('  --type        类型 important|routine|free (create, update)');
      console.log('  --desc        事件描述 (create, update)');
      console.log('  --event-id    飞书事件 ID (update, delete)');
      console.log('  --calendar-id 日历 ID (可选，默认 primary)');
  }
}

main();
