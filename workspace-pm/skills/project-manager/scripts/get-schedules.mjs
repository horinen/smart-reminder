#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const schedulesFile = path.join(dataDir, 'schedules.json');

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  return `${month}月${day}日 ${hour}:${minute}`;
}

function isToday(dateStr) {
  const date = new Date(dateStr);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function isTomorrow(dateStr) {
  const date = new Date(dateStr);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return date.toDateString() === tomorrow.toDateString();
}

function isThisWeek(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  return date >= now && date <= weekEnd;
}

function main() {
  if (!fs.existsSync(schedulesFile)) {
    console.log('## 近期日程\n\n暂无日程记录。');
    return;
  }
  
  const data = JSON.parse(fs.readFileSync(schedulesFile, 'utf-8'));
  const events = data.events || [];
  
  if (events.length === 0) {
    console.log('## 近期日程\n\n暂无日程记录。');
    return;
  }
  
  const now = new Date();
  const upcomingEvents = events.filter(e => new Date(e.startTime) >= now);
  const pastEvents = events.filter(e => new Date(e.startTime) < now).slice(-3);
  
  console.log('## 近期日程\n');
  
  if (upcomingEvents.length > 0) {
    const today = upcomingEvents.filter(e => isToday(e.startTime));
    const tomorrow = upcomingEvents.filter(e => isTomorrow(e.startTime));
    const thisWeek = upcomingEvents.filter(e => isThisWeek(e.startTime) && !isToday(e.startTime) && !isTomorrow(e.startTime));
    
    if (today.length > 0) {
      console.log('### 今天');
      for (const e of today) {
        const time = formatDate(e.startTime);
        const typeEmoji = e.type === 'important' ? '🔴' : e.type === 'free' ? '🟢' : '🔵';
        console.log(`- ${typeEmoji} ${time}：${e.title}${e.raw ? `（${e.raw}）` : ''}`);
      }
      console.log('');
    }
    
    if (tomorrow.length > 0) {
      console.log('### 明天');
      for (const e of tomorrow) {
        const time = formatDate(e.startTime);
        const typeEmoji = e.type === 'important' ? '🔴' : e.type === 'free' ? '🟢' : '🔵';
        console.log(`- ${typeEmoji} ${time}：${e.title}`);
      }
      console.log('');
    }
    
    if (thisWeek.length > 0) {
      console.log('### 本周内');
      for (const e of thisWeek) {
        const time = formatDate(e.startTime);
        const typeEmoji = e.type === 'important' ? '🔴' : e.type === 'free' ? '🟢' : '🔵';
        console.log(`- ${typeEmoji} ${time}：${e.title}`);
      }
      console.log('');
    }
  }
  
  const freeSlots = upcomingEvents.filter(e => e.type === 'free' && isThisWeek(e.startTime));
  if (freeSlots.length > 0) {
    console.log('---\n');
    console.log('**可用空闲时段**：');
    for (const e of freeSlots) {
      console.log(`- ${formatDate(e.startTime)} - ${formatDate(e.endTime)}`);
    }
  }
  
  console.log('\n---\n');
  console.log(`**统计**：共 ${events.length} 条日程，${upcomingEvents.length} 条待进行`);
}

main();
