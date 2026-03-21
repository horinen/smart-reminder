#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const pendingFile = path.join(dataDir, 'pending-reminders.json');

function generateId() {
  return `rm-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
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

function main() {
  const params = parseArgs();
  
  if (!params.time || !params.content) {
    console.error('用法: node add-pending-reminder.mjs --time "YYYY-MM-DD HH:mm" --content "提醒内容"');
    process.exit(1);
  }
  
  if (!fs.existsSync(pendingFile)) {
    fs.writeFileSync(pendingFile, '[]');
  }
  
  const reminders = JSON.parse(fs.readFileSync(pendingFile, 'utf-8'));
  
  const reminder = {
    id: params.id || generateId(),
    time: params.time,
    content: params.content,
    createdAt: new Date().toISOString()
  };
  
  reminders.push(reminder);
  fs.writeFileSync(pendingFile, JSON.stringify(reminders, null, 2));
  
  console.log(`✅ 已添加一次性提醒`);
  console.log(`ID: ${reminder.id}`);
  console.log(`时间: ${reminder.time}`);
  console.log(`内容: ${reminder.content}`);
}

main();
