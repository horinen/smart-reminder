#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 发送提醒到飞书（核心脚本，由 cron 定时调用）
 * 
 * 输入:
 *   - 无参数（自动检查 reminders.json）
 * 
 * 输出:
 *   - stdout: 发送日志
 *   - 飞书消息: 发送提醒内容
 * 
 * 数据流:
 *   - 读取 reminders.json → 检查到期提醒 → 发送飞书 → 写入 history → 删除已发送
 * 
 * 静默时段:
 *   - 22:00-08:00 不发送
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureValidCalendarToken } from './lib/feishu-calendar-token.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const remindersFile = path.join(dataDir, 'reminders.json');
const historyFile = path.join(dataDir, 'reminder-history.json');
const logFile = path.join(dataDir, 'send-log.json');
const keysFile = path.join(dataDir, 'feishu-keys.json');

let FEISHU_CONFIG = null;
function loadFeishuConfig() {
  if (!FEISHU_CONFIG) {
    if (!fs.existsSync(keysFile)) {
      throw new Error(`飞书配置文件不存在: ${keysFile}`);
    }
    FEISHU_CONFIG = JSON.parse(fs.readFileSync(keysFile, 'utf-8'));
  }
  return FEISHU_CONFIG;
}

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
        app_id: loadFeishuConfig().appId,
        app_secret: loadFeishuConfig().appSecret
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
        receive_id: loadFeishuConfig().recipient,
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

function markAsSent(reminderId) {
  const reminders = readJsonFile(remindersFile, []);
  
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
    feedback: null
  });
  
  history.stats.totalSent++;
  writeJsonFile(historyFile, history);
  
  reminders.splice(index, 1);
  writeJsonFile(remindersFile, reminders);
  
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
  
  try {
    const calendarPath = path.join(dataDir, 'feishu-calendar.json');
    if (fs.existsSync(calendarPath)) {
      await ensureValidCalendarToken();
      log('日历 token 刷新成功');
    }
  } catch (e) {
    log(`WARN: 日历 token 刷新失败（不影响提醒发送）: ${e.message}`);
  }
  
  if (isInQuietHours(now)) {
    log('静默时段 (22:00-08:00)，跳过发送');
    return;
  }
  
  const reminders = readJsonFile(remindersFile, []);
  
  const toSend = [];
  
  for (const reminder of reminders) {
    const reminderTime = new Date(reminder.time);
    if (reminderTime <= now) {
      toSend.push(reminder);
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
      markAsSent(reminder.id);
      
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
    totalChecked: reminders.length,
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
