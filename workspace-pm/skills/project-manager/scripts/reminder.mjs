#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 提醒管理（添加/删除/列表）
 * 
 * 输入:
 *   - --action: add | delete | list（必需）
 *   - --time: 提醒时间 "YYYY-MM-DD HH:mm"（add 必需）
 *   - --content: 提醒内容（add 必需）
 *   - --id: 提醒ID（delete 必需）
 * 
 * 输出:
 *   - stdout: 操作结果
 *   - 文件: reminders.json
 * 
 * 测试:
 *   - [x] 添加提醒
 *   - [x] 删除提醒
 *   - [x] 列出提醒
 *   - [x] 缺少参数报错
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const remindersFile = path.join(dataDir, 'reminders.json');

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

function validateTimeFormat(time) {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time);
}

function readReminders() {
  if (!fs.existsSync(remindersFile)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(remindersFile, 'utf-8'));
}

function writeReminders(reminders) {
  fs.writeFileSync(remindersFile, JSON.stringify(reminders, null, 2));
}

function addReminder(params) {
  if (!params.time || !params.content) {
    console.error('用法: node reminder.mjs --action add --time "YYYY-MM-DD HH:mm" --content "提醒内容"');
    process.exit(1);
  }
  
  if (!validateTimeFormat(params.time)) {
    console.error('错误: 时间格式应为 "YYYY-MM-DD HH:mm"');
    process.exit(1);
  }
  
  const reminders = readReminders();
  
  const reminder = {
    id: params.id || generateId(),
    time: params.time,
    content: params.content,
    createdAt: new Date().toISOString()
  };
  
  reminders.push(reminder);
  reminders.sort((a, b) => new Date(a.time) - new Date(b.time));
  writeReminders(reminders);
  
  console.log(`✅ 已添加提醒`);
  console.log(`ID: ${reminder.id}`);
  console.log(`时间: ${reminder.time}`);
  console.log(`内容: ${reminder.content}`);
}

function deleteReminder(params) {
  if (!params.id) {
    console.error('用法: node reminder.mjs --action delete --id "rm-xxx"');
    process.exit(1);
  }
  
  const reminders = readReminders();
  const index = reminders.findIndex(r => r.id === params.id);
  
  if (index === -1) {
    console.error(`❌ 未找到提醒: ${params.id}`);
    process.exit(1);
  }
  
  const deleted = reminders.splice(index, 1)[0];
  writeReminders(reminders);
  
  console.log(`✅ 已删除提醒`);
  console.log(`ID: ${deleted.id}`);
  console.log(`内容: ${deleted.content}`);
}

function listReminders() {
  const reminders = readReminders();
  
  if (reminders.length === 0) {
    console.log('暂无提醒');
    return;
  }
  
  console.log(`## 待发送提醒 (${reminders.length} 条)\n`);
  
  for (const r of reminders) {
    const content = r.content.length > 40 ? r.content.substring(0, 40) + '...' : r.content;
    console.log(`- ${r.id} | ${r.time} | ${content}`);
  }
}

function main() {
  const params = parseArgs();
  
  if (!params.action) {
    console.error('用法: node reminder.mjs --action <add|delete|list> [参数]');
    console.error('');
    console.error('操作:');
    console.error('  add    添加提醒 (--time, --content)');
    console.error('  delete 删除提醒 (--id)');
    console.error('  list   列出提醒');
    process.exit(1);
  }
  
  switch (params.action) {
    case 'add':
      addReminder(params);
      break;
    case 'delete':
      deleteReminder(params);
      break;
    case 'list':
      listReminders();
      break;
    default:
      console.error(`未知操作: ${params.action}`);
      process.exit(1);
  }
}

main();
