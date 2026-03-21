#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const pendingFile = path.join(dataDir, 'pending-reminders.json');
const recurringFile = path.join(dataDir, 'recurring-reminders.json');

function formatDateTime(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}

function formatTime(timeStr) {
  return timeStr;
}

function getDayNames(days) {
  if (!days || days.length === 7) return '每天';
  const dayMap = { mon: '一', tue: '二', wed: '三', thu: '四', fri: '五', sat: '六', sun: '日' };
  return '周' + days.map(d => dayMap[d] || d).join('、');
}

function main() {
  console.log('## 当前提醒\n');
  
  const pending = fs.existsSync(pendingFile) 
    ? JSON.parse(fs.readFileSync(pendingFile, 'utf-8')) 
    : [];
  const recurring = fs.existsSync(recurringFile) 
    ? JSON.parse(fs.readFileSync(recurringFile, 'utf-8')) 
    : [];
  
  if (pending.length === 0 && recurring.length === 0) {
    console.log('暂无提醒');
    return;
  }
  
  if (pending.length > 0) {
    console.log('### 待发送提醒（一次性）\n');
    const sorted = [...pending].sort((a, b) => new Date(a.time) - new Date(b.time));
    for (const r of sorted) {
      const time = formatDateTime(r.time);
      const content = r.content.length > 40 ? r.content.substring(0, 40) + '...' : r.content;
      console.log(`- ${r.id} | ${time} | ${content}`);
    }
    console.log('');
  }
  
  if (recurring.length > 0) {
    console.log('### 持久提醒\n');
    for (const r of recurring) {
      const time = formatTime(r.time);
      const days = getDayNames(r.days);
      const lastSent = r.lastSent ? ` | 上次: ${formatDateTime(r.lastSent)}` : '';
      const content = r.content.length > 40 ? r.content.substring(0, 40) + '...' : r.content;
      console.log(`- ${r.id} | ${days} ${time}${lastSent} | ${content}`);
    }
    console.log('');
  }
  
  console.log(`**统计**：待发送 ${pending.length} 条，持久 ${recurring.length} 条`);
}

main();
