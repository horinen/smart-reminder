#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const pendingFile = path.join(dataDir, 'pending-reminders.json');
const recurringFile = path.join(dataDir, 'recurring-reminders.json');
const historyFile = path.join(dataDir, 'reminder-history.json');

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

function main() {
  const params = parseArgs();
  
  if (!params.id) {
    console.error('用法: node mark-reminder-sent.mjs --id "reminder-id" [--recurring]');
    process.exit(1);
  }
  
  if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify({ 
      history: [], 
      stats: { totalSent: 0, totalResponded: 0, avgResponseTime: null, positiveCount: 0, negativeCount: 0 } 
    }, null, 2));
  }
  
  const history = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  const sourceFile = params.recurring ? recurringFile : pendingFile;
  
  if (!fs.existsSync(sourceFile)) {
    console.error(`❌ 提醒文件不存在`);
    process.exit(1);
  }
  
  const reminders = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));
  const index = reminders.findIndex(r => r.id === params.id);
  
  if (index === -1) {
    console.error(`❌ 未找到提醒: ${params.id}`);
    process.exit(1);
  }
  
  const reminder = reminders[index];
  
  history.history.push({
    id: reminder.id,
    content: reminder.content,
    scheduledTime: reminder.time,
    sentAt: new Date().toISOString(),
    feedback: null,
    recurring: params.recurring || false
  });
  
  history.stats.totalSent++;
  
  fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
  
  if (!params.recurring) {
    reminders.splice(index, 1);
    fs.writeFileSync(sourceFile, JSON.stringify(reminders, null, 2));
  }
  
  console.log(`✅ 已标记提醒已发送: ${reminder.id}`);
  console.log(`内容: ${reminder.content}`);
}

main();
