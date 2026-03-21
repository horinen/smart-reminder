#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const pendingFile = path.join(dataDir, 'pending-reminders.json');
const recurringFile = path.join(dataDir, 'recurring-reminders.json');
const historyFile = path.join(dataDir, 'reminder-history.json');
const logFile = path.join(dataDir, 'send-log.json');

const FEISHU_APP_ID = 'cli_a931499b31e11cd4';
const FEISHU_APP_SECRET = 'b2gfqcAjmlDgmTcpOAhEkda1KgN1TYkW';
const FEISHU_RECIPIENT = 'ou_60ea9516980e06b683fc1b8d3ae10ab2';

let feishuAccessToken = null;

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

function readJsonFile(filePath, defaultValue = null) {
  if (!fs.existsSync(filePath)) {
    return defaultValue;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    log(`ERROR: 读取文件失败 ${filePath}: ${e.message}`);
    return defaultValue;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function isInQuietHours(now) {
  const shanghaiHour = (now.getUTCHours() + 8) % 24;
  return shanghaiHour >= 22 || shanghaiHour < 8;
}

function isTimeToSend(recurring, now) {
  const [hour, minute] = recurring.time.split(':').map(Number);
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  
  if (nowHour !== hour || nowMinute < minute || nowMinute >= minute + 15) {
    return false;
  }
  
  const days = recurring.days || ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const today = dayNames[now.getDay()];
  
  if (!days.includes(today)) {
    return false;
  }
  
  if (recurring.lastSent) {
    const lastSentDate = new Date(recurring.lastSent).toDateString();
    const todayDate = now.toDateString();
    if (lastSentDate === todayDate) {
      return false;
    }
  }
  
  return true;
}

async function getFeishuAccessToken() {
  if (feishuAccessToken) {
    return feishuAccessToken;
  }
  
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: FEISHU_APP_ID,
        app_secret: FEISHU_APP_SECRET
      })
    });
    
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`获取 token 失败: ${data.msg}`);
    }
    
    feishuAccessToken = data.tenant_access_token;
    return feishuAccessToken;
  } catch (e) {
    log(`ERROR: 获取飞书 access token 失败: ${e.message}`);
    throw e;
  }
}

async function sendFeishuMessage(content) {
  const token = await getFeishuAccessToken();
  
  try {
    const response = await fetch('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        receive_id: FEISHU_RECIPIENT,
        msg_type: 'text',
        content: JSON.stringify({ text: content })
      })
    });
    
    const data = await response.json();
    
    if (data.code !== 0) {
      throw new Error(`发送消息失败: ${data.msg}`);
    }
    
    return data.data;
  } catch (e) {
    log(`ERROR: 发送飞书消息失败: ${e.message}`);
    throw e;
  }
}

function markAsSent(reminderId, isRecurring) {
  const sourceFile = isRecurring ? recurringFile : pendingFile;
  const reminders = readJsonFile(sourceFile, []);
  
  const index = reminders.findIndex(r => r.id === reminderId);
  if (index === -1) {
    log(`WARN: 未找到提醒 ${reminderId}`);
    return false;
  }
  
  const reminder = reminders[index];
  
  const history = readJsonFile(historyFile, { 
    history: [], 
    stats: { totalSent: 0, totalResponded: 0, avgResponseTime: null, positiveCount: 0, negativeCount: 0 } 
  });
  
  history.history.push({
    id: reminder.id,
    content: reminder.content,
    scheduledTime: reminder.time,
    sentAt: new Date().toISOString(),
    feedback: null,
    recurring: isRecurring
  });
  
  history.stats.totalSent++;
  writeJsonFile(historyFile, history);
  
  if (isRecurring) {
    reminders[index].lastSent = new Date().toISOString();
    writeJsonFile(sourceFile, reminders);
  } else {
    reminders.splice(index, 1);
    writeJsonFile(sourceFile, reminders);
  }
  
  return true;
}

function appendToLog(entry) {
  const logs = readJsonFile(logFile, []);
  logs.push(entry);
  if (logs.length > 1000) {
    logs.splice(0, logs.length - 1000);
  }
  writeJsonFile(logFile, logs);
}

async function main() {
  const now = new Date();
  const startTime = now.toISOString();
  
  log('开始检查提醒...');
  
  if (isInQuietHours(now)) {
    log('静默时段 (22:00-08:00)，跳过发送');
    return;
  }
  
  const pending = readJsonFile(pendingFile, []);
  const recurring = readJsonFile(recurringFile, []);
  
  const toSend = [];
  
  for (const reminder of pending) {
    const reminderTime = new Date(reminder.time);
    if (reminderTime <= now) {
      toSend.push({ ...reminder, isRecurring: false });
    }
  }
  
  for (const reminder of recurring) {
    if (isTimeToSend(reminder, now)) {
      toSend.push({ ...reminder, isRecurring: true });
    }
  }
  
  if (toSend.length === 0) {
    log('没有需要发送的提醒');
    return;
  }
  
  log(`发现 ${toSend.length} 条待发送提醒`);
  
  const results = [];
  
  for (const reminder of toSend) {
    try {
      log(`发送提醒: ${reminder.id} - ${reminder.content.substring(0, 30)}...`);
      await sendFeishuMessage(reminder.content);
      markAsSent(reminder.id, reminder.isRecurring);
      
      results.push({
        id: reminder.id,
        success: true,
        sentAt: new Date().toISOString()
      });
      
      log(`✅ 发送成功: ${reminder.id}`);
    } catch (e) {
      results.push({
        id: reminder.id,
        success: false,
        error: e.message,
        sentAt: new Date().toISOString()
      });
      
      log(`❌ 发送失败: ${reminder.id} - ${e.message}`);
    }
  }
  
  appendToLog({
    startTime,
    endTime: new Date().toISOString(),
    totalChecked: pending.length + recurring.length,
    toSendCount: toSend.length,
    results
  });
  
  const successCount = results.filter(r => r.success).length;
  log(`完成: ${successCount}/${toSend.length} 条发送成功`);
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
