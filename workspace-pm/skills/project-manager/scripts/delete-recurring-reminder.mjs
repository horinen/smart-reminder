#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const recurringFile = path.join(dataDir, 'recurring-reminders.json');

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
    console.error('用法: node delete-recurring-reminder.mjs --id "reminder-id"');
    process.exit(1);
  }
  
  if (!fs.existsSync(recurringFile)) {
    console.error('❌ 持久提醒文件不存在');
    process.exit(1);
  }
  
  const reminders = JSON.parse(fs.readFileSync(recurringFile, 'utf-8'));
  const index = reminders.findIndex(r => r.id === params.id);
  
  if (index === -1) {
    console.error(`❌ 未找到 ID 为 ${params.id} 的持久提醒`);
    process.exit(1);
  }
  
  const deleted = reminders.splice(index, 1)[0];
  fs.writeFileSync(recurringFile, JSON.stringify(reminders, null, 2));
  
  console.log(`✅ 已删除持久提醒`);
  console.log(`ID: ${deleted.id}`);
  console.log(`内容: ${deleted.content}`);
}

main();
