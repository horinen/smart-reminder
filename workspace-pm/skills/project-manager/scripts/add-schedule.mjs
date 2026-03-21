#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const schedulesFile = path.join(dataDir, 'schedules.json');

function generateId() {
  return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
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
  
  if (!fs.existsSync(schedulesFile)) {
    fs.writeFileSync(schedulesFile, JSON.stringify({ events: [] }, null, 2));
  }
  
  const data = JSON.parse(fs.readFileSync(schedulesFile, 'utf-8'));
  
  if (params.action === 'list') {
    if (data.events.length === 0) {
      console.log('暂无日程记录。');
    } else {
      console.log('## 日程列表\n');
      for (const e of data.events) {
        const typeMap = { important: '🔴 重要', routine: '🔵 常规', free: '🟢 空闲' };
        console.log(`- **${e.title}** (${e.id})`);
        console.log(`  - 类型: ${typeMap[e.type] || e.type}`);
        console.log(`  - 时间: ${e.startTime} ~ ${e.endTime}`);
        if (e.raw) console.log(`  - 原始: "${e.raw}"`);
        console.log('');
      }
    }
    return;
  }
  
  if (params.action === 'add') {
    if (!params.title || !params.start) {
      console.error('用法: node add-schedule.mjs --action add --title "标题" --start "ISO时间" [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
      process.exit(1);
    }
    
    const event = {
      id: generateId(),
      title: params.title,
      startTime: params.start,
      endTime: params.end || params.start,
      type: params.type || 'routine',
      raw: params.raw || '',
      createdAt: new Date().toISOString()
    };
    
    data.events.push(event);
    fs.writeFileSync(schedulesFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 已新增日程: ${event.title} (${event.id})`);
    return;
  }
  
  if (params.action === 'delete') {
    if (!params.id) {
      console.error('用法: node add-schedule.mjs --action delete --id "event-id"');
      process.exit(1);
    }
    
    const index = data.events.findIndex(e => e.id === params.id);
    if (index === -1) {
      console.error(`❌ 未找到日程: ${params.id}`);
      process.exit(1);
    }
    
    const deleted = data.events.splice(index, 1)[0];
    fs.writeFileSync(schedulesFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 已删除日程: ${deleted.title}`);
    return;
  }
  
  console.error('用法: node add-schedule.mjs --action add|list|delete ...');
  process.exit(1);
}

main();
