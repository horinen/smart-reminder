#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 飞书多维表格工作记录 CRUD 操作
 * 
 * 输入:
 *   --action: add | list | report
 * 
 * 各 action 参数:
 * 
 *   add:
 *     --content "工作内容"          必填
 *     --duration "时长"             可选，默认 60 分钟
 *         支持格式: "2小时"、"30分钟"、"1.5小时"、纯数字(分钟)
 *     --date YYYY-MM-DD             可选，默认今天
 *     --project "项目名|ID"         可选，按名称或 ID 关联项目
 *     --deliverable "成果物名|ID"   可选，按名称或 ID 关联成果物
 * 
 *   list:
 *     （无参数，显示最近 20 条，按日期倒序）
 * 
 *   report:
 *     --week last                   生成上周周报
 *     --month last                  生成上月月报
 *     （都不传则默认生成上周周报）
 * 
 * 输出:
 *   stdout: 操作结果（Markdown 格式）
 */

import { 
  listRecords, 
  createRecord,
  parseFieldValue,
  getWorklogTableId,
  getProjectTableId,
  getDeliverableTableId
} from './lib/feishu-bitable.mjs';

function getTableId() {
  return getWorklogTableId();
}

function getProjectTableIdInternal() {
  try {
    return getProjectTableId();
  } catch {
    return null;
  }
}

function getDeliverableTableIdInternal() {
  try {
    return getDeliverableTableId();
  } catch {
    return null;
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const nextArg = args[i + 1];
      if (nextArg !== undefined && !nextArg.startsWith('--')) {
        params[key] = nextArg;
        i++;
      } else {
        params[key] = true;
      }
    }
  }
  
  return params;
}

function parseRecord(record) {
  const fields = record.fields;
  return {
    id: record.record_id,
    date: parseFieldValue(fields['日期'], 'date') || null,
    projectIds: parseFieldValue(fields['项目'], 'link') || [],
    deliverableIds: parseFieldValue(fields['成果物'], 'link') || [],
    content: parseFieldValue(fields['内容'], 'multiLineText') || '',
    duration: parseFieldValue(fields['时长'], 'number') || 0,
    createdAt: record.created_time ? new Date(record.created_time).toISOString() : null
  };
}

async function findProjectId(projectNameOrId) {
  const projectTableId = getProjectTableIdInternal();
  if (!projectTableId) return null;
  
  const result = await listRecords(projectTableId);
  const projects = result.items.map(r => ({
    id: r.record_id,
    name: parseFieldValue(r.fields['名称'], 'text') || r.fields['名称']
  }));
  
  const project = projects.find(p => 
    p.id === projectNameOrId || 
    p.name.toLowerCase() === projectNameOrId.toLowerCase()
  );
  
  return project?.id || null;
}

async function findDeliverableId(deliverableNameOrId) {
  const deliverableTableId = getDeliverableTableIdInternal();
  if (!deliverableTableId) return null;
  
  const result = await listRecords(deliverableTableId);
  const deliverables = result.items.map(r => ({
    id: r.record_id,
    name: parseFieldValue(r.fields['名称'], 'text') || r.fields['名称']
  }));
  
  const deliverable = deliverables.find(d => 
    d.id === deliverableNameOrId || 
    d.name.toLowerCase() === deliverableNameOrId.toLowerCase()
  );
  
  return deliverable?.id || null;
}

function parseDuration(input) {
  if (typeof input === 'number') return input;
  
  const hoursMatch = input.match(/(\d+(?:\.\d+)?)\s*小时?/);
  if (hoursMatch) {
    return Math.round(parseFloat(hoursMatch[1]) * 60);
  }
  
  const minsMatch = input.match(/(\d+)\s*分钟?/);
  if (minsMatch) {
    return parseInt(minsMatch[1], 10);
  }
  
  const num = parseInt(input, 10);
  if (!isNaN(num)) return num;
  
  return 60;
}

async function actionAdd(params) {
  if (!params.content) {
    console.error('用法: node feishu-bitable-worklog.mjs --action add --content "工作内容" --duration "时长" [--date YYYY-MM-DD] [--project "项目"] [--deliverable "成果物"]');
    process.exit(1);
  }
  
  const tableId = getTableId();
  
  let projectId = null;
  let deliverableId = null;
  
  if (params.project) {
    try {
      projectId = await findProjectId(params.project);
    } catch (e) {
      console.error(`⚠️ 查找项目失败: ${e.message}`);
    }
  }
  
  if (params.deliverable) {
    try {
      deliverableId = await findDeliverableId(params.deliverable);
    } catch (e) {
      console.error(`⚠️ 查找成果物失败: ${e.message}`);
    }
  }
  
  const dateStr = params.date || new Date().toISOString().slice(0, 10);
  const duration = parseDuration(params.duration || '60');
  
  const fields = {
    '日期': new Date(dateStr).getTime(),
    '内容': params.content,
    '时长': duration
  };
  
  if (projectId) {
    fields['项目'] = [projectId];
  }
  
  if (deliverableId) {
    fields['成果物'] = [deliverableId];
  }
  
  try {
    const result = await createRecord(tableId, fields);
    console.log(`✅ 已记录工作`);
    console.log(`   日期: ${dateStr}`);
    console.log(`   内容: ${params.content}`);
    console.log(`   时长: ${duration} 分钟`);
    if (params.project) console.log(`   项目: ${params.project}`);
    if (params.deliverable) console.log(`   成果物: ${params.deliverable}`);
  } catch (e) {
    console.error(`❌ 记录失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionList(params) {
  const tableId = getTableId();
  
  try {
    const result = await listRecords(tableId);
    
    if (!result.items || result.items.length === 0) {
      console.log('暂无工作记录。');
      return;
    }
    
    const worklogs = result.items.map(parseRecord);
    
    const sorted = [...worklogs].sort((a, b) => 
      new Date(b.date) - new Date(a.date)
    );
    
    const recent = sorted.slice(0, 20);
    
    console.log('## 最近工作记录\n');
    
    for (const w of recent) {
      const dateStr = w.date ? w.date.slice(0, 10) : '未知日期';
      const hours = Math.floor(w.duration / 60);
      const mins = w.duration % 60;
      const durationStr = hours > 0 ? `${hours}h${mins > 0 ? mins + 'm' : ''}` : `${mins}m`;
      
      console.log(`- **${dateStr}** (${durationStr})`);
      console.log(`  ${w.content}`);
      console.log('');
    }
    
    const totalMinutes = worklogs.reduce((sum, w) => sum + (w.duration || 0), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);
    console.log(`---\n**统计**: 共 ${worklogs.length} 条记录，总计 ${totalHours} 小时`);
  } catch (e) {
    console.error(`❌ 查询失败: ${e.message}`);
    process.exit(1);
  }
}

function getWeekRange(weekParam) {
  if (weekParam === 'last') {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToSubtract = dayOfWeek === 0 ? 7 : dayOfWeek;
    const endOfLastWeek = new Date(now);
    endOfLastWeek.setDate(now.getDate() - daysToSubtract);
    const startOfLastWeek = new Date(endOfLastWeek);
    startOfLastWeek.setDate(endOfLastWeek.getDate() - 6);
    
    return {
      start: startOfLastWeek.toISOString().slice(0, 10),
      end: endOfLastWeek.toISOString().slice(0, 10)
    };
  }
  
  return null;
}

function getMonthRange(monthParam) {
  if (monthParam === 'last') {
    const now = new Date();
    const firstDayOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    
    return {
      start: firstDayOfLastMonth.toISOString().slice(0, 10),
      end: lastDayOfLastMonth.toISOString().slice(0, 10)
    };
  }
  
  return null;
}

async function actionReport(params) {
  const tableId = getTableId();
  
  let dateRange = null;
  let reportTitle = '';
  
  if (params.week) {
    dateRange = getWeekRange(params.week);
    reportTitle = params.week === 'last' ? '上周工作总结' : `第 ${params.week} 周工作总结`;
  } else if (params.month) {
    dateRange = getMonthRange(params.month);
    reportTitle = params.month === 'last' ? '上月工作总结' : `${params.month} 工作总结`;
  } else {
    dateRange = getWeekRange('last');
    reportTitle = '上周工作总结';
  }
  
  if (!dateRange) {
    console.error('❌ 无效的时间范围参数');
    process.exit(1);
  }
  
  try {
    const result = await listRecords(tableId);
    
    if (!result.items || result.items.length === 0) {
      console.log(`## ${reportTitle}\n\n暂无工作记录。`);
      return;
    }
    
    const worklogs = result.items.map(parseRecord);
    
    const filtered = worklogs.filter(w => {
      if (!w.date) return false;
      const dateStr = w.date.slice(0, 10);
      return dateStr >= dateRange.start && dateStr <= dateRange.end;
    });
    
    if (filtered.length === 0) {
      console.log(`## ${reportTitle}\n\n时间范围: ${dateRange.start} ~ ${dateRange.end}\n\n暂无工作记录。`);
      return;
    }
    
    const projectGroups = {};
    let totalMinutes = 0;
    
    for (const w of filtered) {
      totalMinutes += w.duration || 0;
      
      const projectKey = w.projectIds[0] || 'other';
      if (!projectGroups[projectKey]) {
        projectGroups[projectKey] = {
          duration: 0,
          items: []
        };
      }
      projectGroups[projectKey].duration += w.duration || 0;
      projectGroups[projectKey].items.push(w);
    }
    
    console.log(`## ${reportTitle}\n`);
    console.log(`时间范围: ${dateRange.start} ~ ${dateRange.end}\n`);
    
    console.log('### 项目进展\n');
    for (const [projectKey, data] of Object.entries(projectGroups)) {
      const hours = (data.duration / 60).toFixed(1);
      console.log(`- **${projectKey === 'other' ? '其他' : projectKey}**: ${hours} 小时`);
      for (const item of data.items.slice(0, 3)) {
        const dateStr = item.date ? item.date.slice(0, 10) : '';
        console.log(`  - ${dateStr}: ${item.content.slice(0, 50)}${item.content.length > 50 ? '...' : ''}`);
      }
      if (data.items.length > 3) {
        console.log(`  - _...共 ${data.items.length} 条记录_`);
      }
      console.log('');
    }
    
    console.log('### 时间分布\n');
    const totalHours = totalMinutes / 60;
    for (const [projectKey, data] of Object.entries(projectGroups)) {
      const percent = ((data.duration / totalMinutes) * 100).toFixed(1);
      const hours = (data.duration / 60).toFixed(1);
      console.log(`- ${projectKey === 'other' ? '其他' : projectKey}: ${hours}h (${percent}%)`);
    }
    
    console.log(`\n---\n**总计**: ${filtered.length} 条记录，${totalHours.toFixed(1)} 小时`);
  } catch (e) {
    console.error(`❌ 生成报告失败: ${e.message}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log('用法: node feishu-bitable-worklog.mjs --action <命令> [参数]');
  console.log('\n命令:');
  console.log('  add     记录工作');
  console.log('    --content "工作内容" --duration "时长" [--date YYYY-MM-DD] [--project "项目"] [--deliverable "成果物"]');
  console.log('  list    列出工作记录');
  console.log('  report  生成周报/月报');
  console.log('    [--week last] [--month last]');
}

async function main() {
  const params = parseArgs();
  
  switch (params.action) {
    case 'add':
      await actionAdd(params);
      break;
    case 'list':
      await actionList(params);
      break;
    case 'report':
      await actionReport(params);
      break;
    default:
      printUsage();
  }
}

main().catch(e => {
  console.error(`❌ 执行失败: ${e.message}`);
  process.exit(1);
});
