#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 日程管理 - 新增/更新/删除/列出日程（已合并 get-schedules.mjs）
 * 
 * 输入:
 *   --action add|list|update|delete
 *   
 *   add:
 *     --title (必须) 日程标题
 *     --start (必须) 开始时间 ISO 格式
 *     --end (可选) 结束时间，默认等于 start
 *     --type (可选) important|routine|free，默认 routine
 *     --raw (可选) 原始自然语言表达
 *   
 *   update:
 *     --id (必须) 日程 ID
 *     --title --start --end --type --raw (可选，至少一个)
 *   
 *   delete:
 *     --id (必须) 日程 ID
 *   
 *   list:
 *     --format (可选) smart|raw，默认 smart
 *       - smart: 智能分组（今天/明天/本周）+ 统计
 *       - raw: 简单列表，显示 ID（用于删除操作）
 * 
 * 输出:
 *   - stdout: 操作结果消息
 *   - 文件: ../data/schedules.json
 * 
 * 测试:
 *   - [x] list 空数据
 *   - [x] list smart 格式
 *   - [x] list raw 格式
 *   - [x] add 最小参数
 *   - [x] add 全部参数
 *   - [x] add 缺少必填参数
 *   - [x] update 正常更新
 *   - [x] update 缺少 id
 *   - [x] update 不存在的 id
 *   - [x] update 无更新字段
 *   - [x] delete 正常
 *   - [x] delete 不存在的 id
 *   - [x] 无效 action
 * 
 * 问题:
 *   - 缺少 type 值验证，无效值会直接存储
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const schedulesFile = path.join(dataDir, 'schedules.json');

function generateId() {
  return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

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

function listSmart(events) {
  if (events.length === 0) {
    console.log('## 近期日程\n\n暂无日程记录。');
    return;
  }
  
  const now = new Date();
  const upcomingEvents = events.filter(e => new Date(e.startTime) >= now);
  
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

function listRaw(events) {
  if (events.length === 0) {
    console.log('暂无日程记录。');
    return;
  }
  
  console.log('## 日程列表\n');
  for (const e of events) {
    const typeMap = { important: '🔴 重要', routine: '🔵 常规', free: '🟢 空闲' };
    console.log(`- **${e.title}** (${e.id})`);
    console.log(`  - 类型: ${typeMap[e.type] || e.type}`);
    console.log(`  - 时间: ${e.startTime} ~ ${e.endTime}`);
    if (e.raw) console.log(`  - 原始: "${e.raw}"`);
    console.log('');
  }
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
    if (params.format === 'raw') {
      listRaw(data.events);
    } else {
      listSmart(data.events);
    }
    return;
  }
  
  if (params.action === 'add') {
    if (!params.title || !params.start) {
      console.error('用法: node schedule.mjs --action add --title "标题" --start "ISO时间" [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
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
      console.error('用法: node schedule.mjs --action delete --id "event-id"');
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
  
  if (params.action === 'update') {
    if (!params.id) {
      console.error('用法: node schedule.mjs --action update --id "event-id" [--title "标题"] [--start "ISO时间"] [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
      process.exit(1);
    }
    
    const event = data.events.find(e => e.id === params.id);
    if (!event) {
      console.error(`❌ 未找到日程: ${params.id}`);
      process.exit(1);
    }
    
    const hasUpdate = params.title || params.start || params.end || params.type || params.raw;
    if (!hasUpdate) {
      console.error('⚠️ 未指定更新字段');
      process.exit(1);
    }
    
    if (params.title) event.title = params.title;
    if (params.start) event.startTime = params.start;
    if (params.end) event.endTime = params.end;
    if (params.type) event.type = params.type;
    if (params.raw) event.raw = params.raw;
    event.updatedAt = new Date().toISOString();
    
    fs.writeFileSync(schedulesFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 已更新日程: ${event.title} (${event.id})`);
    return;
  }
  
  console.error('用法: node schedule.mjs --action add|list|update|delete ...');
  process.exit(1);
}

main();
