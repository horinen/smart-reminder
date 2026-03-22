#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 读取飞书日历日程（输出格式与 schedule.mjs 兼容）
 * 
 * 输入:
 *   --action fetch|sync|list
 *   fetch:
 *     --start (可选) 开始时间，默认今天
 *     --end (可选) 结束时间，默认7天后
 *     --calendar-id (可选) 日历 ID，默认 primary
 *   sync:
 *     全量覆盖本地缓存
 *   list:
 *     --format (可选) smart|raw|json
 * 
 * 输出:
 *   - stdout: 日程列表
 *   - 文件: ../data/schedules.json (sync 模式)
 * 
 * 输出格式 (与 schedule.mjs 兼容):
 *   {
 *     "id": "feishu-xxx",
 *     "title": "会议标题",
 *     "startTime": "2026-03-21T10:00:00",
 *     "endTime": "2026-03-21T11:00:00",
 *     "type": "important|routine|free",
 *     "raw": "",
 *     "feishuEventId": "原始事件ID",
 *     "syncedAt": "同步时间"
 *   }
 * 
 * 测试:
 *   - [x] fetch 获取日程
 *   - [x] sync 同步到 schedules.json
 *   - [x] list 列出日程
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const schedulesFile = path.join(dataDir, 'schedules.json');
const keysFile = path.join(dataDir, 'feishu-calendar.json');

const FEISHU_CALENDAR_LIST_URL = 'https://open.feishu.cn/open-apis/calendar/v4/calendars';
const FEISHU_CALENDAR_EVENTS_URL = 'https://open.feishu.cn/open-apis/calendar/v4/calendars/{calendar_id}/events/search';

function loadConfig() {
  if (!fs.existsSync(keysFile)) {
    throw new Error(`飞书日历配置文件不存在: ${keysFile}\n请复制 feishu-calendar.example.json 为 feishu-calendar.json 并填写配置`);
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

function loadSchedules() {
  if (!fs.existsSync(schedulesFile)) {
    return { events: [] };
  }
  return JSON.parse(fs.readFileSync(schedulesFile, 'utf-8'));
}

function saveSchedules(data) {
  fs.writeFileSync(schedulesFile, JSON.stringify(data, null, 2));
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

function inferTypeFromColor(event) {
  const color = event.color;
  
  // 数字颜色值
  const COLOR_IMPORTANT = -8388608;    // 深红色 0xFF800000
  const COLOR_ROUTINE = -11034625;     // 蓝色 0xFF57B7E3
  const COLOR_FREE = -16711936;        // 绿色 0xFF00FF00
  
  if (typeof color === 'number') {
    if (color === COLOR_IMPORTANT) return 'important';
    if (color === COLOR_FREE) return 'free';
    return 'routine';
  }
  
  // 字符串颜色值（兼容旧逻辑）
  if (color === 'red' || color === '#FF4D4F' || (typeof color === 'string' && color.includes('red'))) {
    return 'important';
  }
  if (color === 'green' || color === '#52C41A' || (typeof color === 'string' && color.includes('green'))) {
    return 'free';
  }
  return 'routine';
}

function mapEventToSchedule(event) {
  const startTimeTs = event.start_time?.timestamp || event.start?.timestamp;
  const endTimeTs = event.end_time?.timestamp || event.end?.timestamp;
  
  const startTs = typeof startTimeTs === 'number' ? startTimeTs * 1000 : parseInt(startTimeTs) * 1000;
  const endTs = typeof endTimeTs === 'number' ? endTimeTs * 1000 : parseInt(endTimeTs) * 1000;
  
  return {
    id: `feishu-${event.event_id || event.id}`,
    title: event.summary || '无标题',
    startTime: new Date(startTs).toISOString().replace(/\.\d{3}Z$/, '+08:00'),
    endTime: new Date(endTs).toISOString().replace(/\.\d{3}Z$/, '+08:00'),
    type: inferTypeFromColor(event),
    raw: event.description || '',
    feishuEventId: event.event_id || event.id,
    syncedAt: new Date().toISOString()
  };
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
  const response = await fetch(FEISHU_CALENDAR_LIST_URL, {
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

async function fetchCalendarEvents(accessToken, calendarId, startTime, endTime) {
  const url = FEISHU_CALENDAR_EVENTS_URL.replace('{calendar_id}', calendarId);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: '',
      start_time: Math.floor(startTime.getTime() / 1000),
      end_time: Math.floor(endTime.getTime() / 1000),
      page_size: 100
    })
  });
  
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(`获取日历事件失败: ${data.msg}`);
  }
  
  return (data.data?.items || []).map(mapEventToSchedule);
}

async function actionFetch(params) {
  const token = loadToken();
  const userAccessToken = ensureValidToken(token);
  
  const startTime = params.start ? new Date(params.start) : new Date();
  const endTime = params.end ? new Date(params.end) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  let calendarId = params['calendar-id'];
  if (!calendarId) {
    calendarId = await getPrimaryCalendar(userAccessToken);
    if (!calendarId) {
      throw new Error('未找到可用日历');
    }
  }
  
  console.log('## 获取飞书日历日程\n');
  console.log(`- 日历: ${calendarId}`);
  console.log(`- 时间范围: ${startTime.toLocaleDateString('zh-CN')} ~ ${endTime.toLocaleDateString('zh-CN')}\n`);
  
  try {
    const events = await fetchCalendarEvents(userAccessToken, calendarId, startTime, endTime);
    
    console.log(`**共 ${events.length} 条日程**\n`);
    
    for (const event of events) {
      const typeEmoji = event.type === 'important' ? '🔴' : event.type === 'free' ? '🟢' : '🔵';
      console.log(`- ${typeEmoji} ${event.startTime.slice(0, 16)}: ${event.title}`);
    }
    
    console.log('\n---\n');
    console.log('JSON 输出:');
    console.log(JSON.stringify(events, null, 2));
  } catch (e) {
    console.error(`❌ 获取失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionSync(params) {
  const token = loadToken();
  const userAccessToken = ensureValidToken(token);
  
  const startTime = new Date();
  const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  
  const calendarId = await getPrimaryCalendar(userAccessToken);
  if (!calendarId) {
    throw new Error('未找到可用日历');
  }
  
  console.log('## 同步飞书日历到本地\n');
  
  try {
    const feishuEvents = await fetchCalendarEvents(userAccessToken, calendarId, startTime, endTime);
    
    const schedules = { events: feishuEvents };
    saveSchedules(schedules);
    
    console.log(`✅ 同步完成\n`);
    console.log(`- 共 ${feishuEvents.length} 条日程`);
  } catch (e) {
    console.error(`❌ 同步失败: ${e.message}`);
    process.exit(1);
  }
}

function actionList(params) {
  const schedules = loadSchedules();
  const events = schedules.events;
  
  if (events.length === 0) {
    console.log('暂无飞书日历日程。');
    console.log('\n运行 node feishu-calendar-read.mjs --action sync 同步日程');
    return;
  }
  
  const format = params.format || 'smart';
  
  if (format === 'json') {
    console.log(JSON.stringify(events, null, 2));
    return;
  }
  
  console.log('## 飞书日历日程\n');
  
  for (const event of events) {
    const typeEmoji = event.type === 'important' ? '🔴' : event.type === 'free' ? '🟢' : '🔵';
    
    if (format === 'raw') {
      console.log(`- **${event.title}** (${event.id})`);
      console.log(`  - 类型: ${typeEmoji} ${event.type}`);
      console.log(`  - 时间: ${event.startTime} ~ ${event.endTime}`);
      console.log('');
    } else {
      console.log(`- ${typeEmoji} ${event.startTime.slice(0, 16)}: ${event.title}`);
    }
  }
  
  if (format === 'smart') {
    console.log('\n---\n');
    console.log(`**统计**: 共 ${events.length} 条日程`);
  }
}

async function main() {
  const params = parseArgs();
  
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  switch (params.action) {
    case 'fetch':
      await actionFetch(params);
      break;
    case 'sync':
      await actionSync(params);
      break;
    case 'list':
      actionList(params);
      break;
    default:
      console.log('用法: node feishu-calendar-read.mjs --action fetch|sync|list');
      console.log('\n动作说明:');
      console.log('  fetch  - 从飞书获取日程（不写入文件）');
      console.log('  sync   - 同步飞书日程到 schedules.json（全量覆盖）');
      console.log('  list   - 列出已同步的日程');
      console.log('\n参数:');
      console.log('  --start       开始时间 (fetch)');
      console.log('  --end         结束时间 (fetch)');
      console.log('  --calendar-id 日历 ID (fetch)');
      console.log('  --format      输出格式 smart|raw|json (list)');
  }
}

main();
