#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 飞书多维表格项目 CRUD 操作
 * 
 * 输入:
 *   --action: add | list | update | get
 *   --name: 项目名称（add/update 必填）
 *   --category: 分类 work|personal|learning（add 可选，默认 work）
 *   --desc: 描述（add 可选）
 *   --deadline: 截止日期 YYYY-MM-DD（add/update 可选）
 *   --status: 状态 active|paused|completed|archived（update 可选）
 *   --note: 备注（add/update 可选）
 *   --id: 记录 ID（update/get 必填）
 * 
 * 输出:
 *   stdout: 操作结果（Markdown 格式）
 * 
 * 表字段映射:
 *   名称 -> name (text)
 *   分类 -> category (singleSelect: work/personal/learning)
 *   描述 -> description (multiLineText)
 *   截止日期 -> deadline (date)
 *   状态 -> status (singleSelect: active/paused/completed/archived)
 *   备注 -> note (multiLineText)
 */

import { 
  listRecords, 
  createRecord, 
  updateRecord,
  parseFieldValue 
} from './lib/feishu-bitable.mjs';
import { loadConfig } from './lib/feishu-calendar-token.mjs';

const STATUS_MAP = {
  active: '🟢 活跃',
  paused: '🟡 暂停',
  completed: '✅ 完成',
  archived: '📦 已归档'
};

const CATEGORY_MAP = {
  work: '💼 工作',
  personal: '🏠 个人',
  learning: '📚 学习'
};

function getTableId() {
  const config = loadConfig();
  if (!config.bitableProjectTableId) {
    throw new Error('未配置项目表 ID，请在 feishu-calendar.json 中添加 bitableProjectTableId 字段');
  }
  return config.bitableProjectTableId;
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
  const categoryValue = parseFieldValue(fields['分类'], 'multiSelect');
  const statusValue = parseFieldValue(fields['状态'], 'multiSelect');
  return {
    id: record.record_id,
    name: parseFieldValue(fields['名称'], 'text') || fields['名称'],
    category: (Array.isArray(categoryValue) ? categoryValue[0] : categoryValue) || 'work',
    description: parseFieldValue(fields['描述'], 'multiLineText') || '',
    deadline: parseFieldValue(fields['截止日期'], 'date') || null,
    status: (Array.isArray(statusValue) ? statusValue[0] : statusValue) || 'active',
    note: parseFieldValue(fields['备注'], 'multiLineText') || '',
    createdAt: record.created_time ? new Date(record.created_time).toISOString() : null,
    updatedAt: record.last_modified_time ? new Date(record.last_modified_time).toISOString() : null
  };
}

function buildFields(params) {
  const fields = {};
  
  if (params.name !== undefined) {
    fields['名称'] = params.name;
  }
  
  if (params.category !== undefined) {
    const categoryMap = { work: 'work', personal: 'personal', learning: 'learning' };
    const categoryId = categoryMap[params.category] || 'work';
    fields['分类'] = [categoryId];
  }
  
  if (params.desc !== undefined) {
    fields['描述'] = params.desc;
  }
  
  if (params.deadline !== undefined) {
    if (params.deadline) {
      fields['截止日期'] = new Date(params.deadline).getTime();
    }
  }
  
  if (params.status !== undefined) {
    const statusMap = { active: 'active', paused: 'paused', completed: 'completed', archived: 'archived' };
    const statusId = statusMap[params.status] || 'active';
    fields['状态'] = [statusId];
  }
  
  if (params.note !== undefined) {
    fields['备注'] = params.note;
  }
  
  return fields;
}

async function actionAdd(params) {
  if (!params.name) {
    console.error('用法: node feishu-bitable-project.mjs --action add --name "项目名" [--category work|personal|learning] [--desc "描述"] [--deadline YYYY-MM-DD] [--note "备注"]');
    process.exit(1);
  }
  
  const tableId = getTableId();
  const fields = buildFields({
    name: params.name,
    category: params.category || 'work',
    desc: params.desc,
    deadline: params.deadline,
    status: 'active',
    note: params.note
  });
  
  try {
    const result = await createRecord(tableId, fields);
    console.log(`✅ 已创建项目: ${params.name}`);
    console.log(`   ID: ${result.record.record_id}`);
    if (params.category) console.log(`   分类: ${CATEGORY_MAP[params.category] || params.category}`);
    if (params.deadline) console.log(`   截止日期: ${params.deadline}`);
  } catch (e) {
    console.error(`❌ 创建失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionList(params) {
  const tableId = getTableId();
  
  try {
    const result = await listRecords(tableId);
    
    if (!result.items || result.items.length === 0) {
      console.log('暂无项目记录。');
      return;
    }
    
    const projects = result.items.map(parseRecord);
    const filteredProjects = params.status 
      ? projects.filter(p => p.status === params.status)
      : projects.filter(p => p.status !== 'archived');
    
    if (filteredProjects.length === 0) {
      console.log(params.status ? `暂无 ${params.status} 状态的项目。` : '暂无项目记录。');
      return;
    }
    
    console.log('## 项目列表\n');
    
    for (const p of filteredProjects) {
      console.log(`- **${p.name}** (${p.id})`);
      console.log(`  - 分类: ${CATEGORY_MAP[p.category] || p.category}`);
      console.log(`  - 状态: ${STATUS_MAP[p.status] || p.status}`);
      if (p.description) console.log(`  - 描述: ${p.description}`);
      if (p.deadline) console.log(`  - 截止日期: ${p.deadline.slice(0, 10)}`);
      if (p.note) console.log(`  - 备注: ${p.note}`);
      console.log('');
    }
    
    const archivedCount = projects.filter(p => p.status === 'archived').length;
    if (archivedCount > 0 && !params.status) {
      console.log(`_💡 有 ${archivedCount} 个已归档项目，使用 --status archived 查看_`);
    }
  } catch (e) {
    console.error(`❌ 查询失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionUpdate(params) {
  if (!params.id && !params.name) {
    console.error('用法: node feishu-bitable-project.mjs --action update --id "记录ID" [--name "新名称"] [--status active|paused|completed|archived] [--note "备注"]');
    process.exit(1);
  }
  
  const tableId = getTableId();
  
  try {
    let recordId = params.id;
    
    if (!recordId) {
      const result = await listRecords(tableId);
      const projects = result.items.map(parseRecord);
      const project = projects.find(p => 
        p.name.toLowerCase() === params.name.toLowerCase()
      );
      
      if (!project) {
        console.error(`❌ 未找到项目: ${params.name}`);
        process.exit(1);
      }
      
      recordId = project.id;
    }
    
    const updateParams = {};
    if (params['new-name']) updateParams.name = params['new-name'];
    if (params.status) updateParams.status = params.status;
    if (params.note) updateParams.note = params.note;
    if (params.desc) updateParams.desc = params.desc;
    if (params.deadline) updateParams.deadline = params.deadline;
    if (params.category) updateParams.category = params.category;
    
    const fields = buildFields(updateParams);
    
    if (Object.keys(fields).length === 0) {
      console.error('❌ 请提供要更新的字段');
      process.exit(1);
    }
    
    await updateRecord(tableId, recordId, fields);
    console.log(`✅ 已更新项目: ${params.name || recordId}`);
    if (params.status) console.log(`   状态: ${STATUS_MAP[params.status]}`);
    if (params.note) console.log(`   备注: ${params.note}`);
  } catch (e) {
    console.error(`❌ 更新失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionGet(params) {
  if (!params.id && !params.name) {
    console.error('用法: node feishu-bitable-project.mjs --action get --id "记录ID" 或 --name "项目名"');
    process.exit(1);
  }
  
  const tableId = getTableId();
  
  try {
    const result = await listRecords(tableId);
    const projects = result.items.map(parseRecord);
    
    let project;
    if (params.id) {
      project = projects.find(p => p.id === params.id);
    } else {
      project = projects.find(p => 
        p.name.toLowerCase() === params.name.toLowerCase()
      );
    }
    
    if (!project) {
      console.error(`❌ 未找到项目: ${params.id || params.name}`);
      process.exit(1);
    }
    
    console.log('## 项目详情\n');
    console.log(`- **名称**: ${project.name}`);
    console.log(`- **ID**: ${project.id}`);
    console.log(`- **分类**: ${CATEGORY_MAP[project.category] || project.category}`);
    console.log(`- **状态**: ${STATUS_MAP[project.status] || project.status}`);
    if (project.description) console.log(`- **描述**: ${project.description}`);
    if (project.deadline) console.log(`- **截止日期**: ${project.deadline.slice(0, 10)}`);
    if (project.note) console.log(`- **备注**: ${project.note}`);
    if (project.createdAt) console.log(`- **创建时间**: ${project.createdAt.slice(0, 16).replace('T', ' ')}`);
    if (project.updatedAt) console.log(`- **更新时间**: ${project.updatedAt.slice(0, 16).replace('T', ' ')}`);
  } catch (e) {
    console.error(`❌ 查询失败: ${e.message}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log('用法: node feishu-bitable-project.mjs --action <命令> [参数]');
  console.log('\n命令:');
  console.log('  add     新增项目');
  console.log('    --name "项目名" [--category work|personal|learning] [--desc "描述"] [--deadline YYYY-MM-DD] [--note "备注"]');
  console.log('  list    列出项目');
  console.log('    [--status active|paused|completed|archived]');
  console.log('  update  更新项目');
  console.log('    --id "记录ID" 或 --name "项目名" [--new-name "新名称"] [--status 状态] [--note "备注"]');
  console.log('  get     获取项目详情');
  console.log('    --id "记录ID" 或 --name "项目名"');
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
    case 'update':
      await actionUpdate(params);
      break;
    case 'get':
      await actionGet(params);
      break;
    default:
      printUsage();
  }
}

main().catch(e => {
  console.error(`❌ 执行失败: ${e.message}`);
  process.exit(1);
});
