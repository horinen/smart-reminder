#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 日程管理 - 新增/更新/删除/列出日程（飞书日历作为主存储）
 * 
 * 输入:
 *   --action add|list|update|delete
 *   
 *   add:
 *     --title (必须) 日程标题
 *     --start (必须) 开始时间 ISO 格式
 *     --end (可选) 结束时间，默认 start 后1小时
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
 *   - 文件: ../data/schedules.json（只读缓存，由 feishu-calendar-read sync 更新）
 * 
 * 数据格式:
 *   {
 *     "id": "feishu-xxx",
 *     "title": "日程标题",
 *     "startTime": "2026-03-21T10:00:00",
 *     "endTime": "2026-03-21T11:00:00",
 *     "type": "important|routine|free",
 *     "raw": "原始表达",
 *     "feishuEventId": "原始飞书事件ID",
 *     "syncedAt": "同步时间"
 *   }
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
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

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

function loadSchedules() {
  if (!fs.existsSync(schedulesFile)) {
    return { events: [] };
  }
  return JSON.parse(fs.readFileSync(schedulesFile, 'utf-8'));
}

function callFeishuWrite(action, params) {
  const args = Object.entries(params)
    .filter(([k, v]) => v !== undefined)
    .map(([k, v]) => `--${k} "${v}"`)
    .join(' ');
  const script = path.join(__dirname, 'feishu-calendar-write.mjs');
  execSync(`node "${script}" --action ${action} ${args}`, { encoding: 'utf-8' });
}

function syncFromFeishu() {
  const script = path.join(__dirname, 'feishu-calendar-read.mjs');
  execSync(`node "${script}" --action sync`, { encoding: 'utf-8' });
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
    
    try {
      callFeishuWrite('create', {
        title: params.title,
        start: params.start,
        end: params.end,
        type: params.type,
        desc: params.raw
      });
      
      syncFromFeishu();
      
      console.log(`✅ 已新增日程到飞书日历: ${params.title}`);
    } catch (e) {
      console.error(`❌ 新增日程失败: ${e.message}`);
      process.exit(1);
    }
    return;
  }
  
  if (params.action === 'delete') {
    if (!params.id) {
      console.error('用法: node schedule.mjs --action delete --id "evt-xxx"');
      process.exit(1);
    }
    
    const schedules = loadSchedules();
    const event = schedules.events.find(e => e.id === params.id);
    if (!event) {
      console.error(`❌ 未找到日程: ${params.id}`);
      process.exit(1);
    }
    
    try {
      callFeishuWrite('delete', {
        'event-id': event.feishuEventId
      });
      
      syncFromFeishu();
      
      console.log(`✅ 已删除飞书日历日程: ${event.title}`);
    } catch (e) {
      console.error(`❌ 删除日程失败: ${e.message}`);
      process.exit(1);
    }
    return;
  }
  
  if (params.action === 'update') {
    if (!params.id) {
      console.error('用法: node schedule.mjs --action update --id "evt-xxx" [--title "标题"] [--start "ISO时间"] [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
      process.exit(1);
    }
    
    const schedules = loadSchedules();
    const event = schedules.events.find(e => e.id === params.id);
    if (!event) {
      console.error(`❌ 未找到日程: ${params.id}`);
      process.exit(1);
    }
    
    const hasUpdate = params.title || params.start || params.end || params.type || params.raw;
    if (!hasUpdate) {
      console.error('⚠️ 未指定更新字段');
      process.exit(1);
    }
    
    try {
      callFeishuWrite('update', {
        'event-id': event.feishuEventId,
        title: params.title,
        start: params.start,
        end: params.end,
        type: params.type,
        desc: params.raw
      });
      
      syncFromFeishu();
      
      console.log(`✅ 已更新飞书日历日程: ${params.title || event.title}`);
    } catch (e) {
      console.error(`❌ 更新日程失败: ${e.message}`);
      process.exit(1);
    }
    return;
  }
  
  console.error('用法: node schedule.mjs --action add|list|update|delete ...');
  console.error('');
  console.error('add:    --title "标题" --start "ISO时间" [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
  console.error('list:   [--format smart|raw]');
  console.error('update: --id "evt-xxx" [--title "标题"] [--start "ISO时间"] [--end "ISO时间"] [--type important|routine|free] [--raw "原始表达"]');
  console.error('delete: --id "evt-xxx"');
  process.exit(1);
}

main();
