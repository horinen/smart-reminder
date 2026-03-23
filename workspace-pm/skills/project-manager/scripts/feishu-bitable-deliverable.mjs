#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 飞书多维表格成果物 CRUD 操作
 * 
 * 输入:
 *   --action: add | list | update | get
 *   --name: 成果物名称（add 必填）
 *   --project: 项目 ID 或名称（add 可选）
 *   --status: 状态 pending|in_progress|done（add/update 可选）
 *   --desc: 描述（add 可选）
 *   --id: 记录 ID（update/get 必填）
 * 
 * 输出:
 *   stdout: 操作结果（Markdown 格式）
 * 
 * 表字段映射:
 *   名称 -> name (text)
 *   项目 -> project (link to Projects)
 *   状态 -> status (singleSelect: pending/in_progress/done)
 *   完成时间 -> completedAt (date)
 *   描述 -> description (multiLineText)
 */

import { 
  listRecords, 
  createRecord, 
  updateRecord,
  parseFieldValue,
  formatFieldValue
} from './lib/feishu-bitable.mjs';
import { loadConfig } from './lib/feishu-calendar-token.mjs';

const STATUS_MAP = {
  pending: '⏳ 待开始',
  in_progress: '🔄 进行中',
  done: '✅ 已完成'
};

function getTableId() {
  const config = loadConfig();
  if (!config.bitableDeliverableTableId) {
    throw new Error('未配置成果物表 ID，请在 feishu-calendar.json 中添加 bitableDeliverableTableId 字段');
  }
  return config.bitableDeliverableTableId;
}

function getProjectTableId() {
  const config = loadConfig();
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
  const statusValue = parseFieldValue(fields['状态'], 'multiSelect');
  return {
    id: record.record_id,
    name: parseFieldValue(fields['名称'], 'text') || fields['名称'],
    projectIds: parseFieldValue(fields['项目'], 'link') || [],
    status: (Array.isArray(statusValue) ? statusValue[0] : statusValue) || 'pending',
    completedAt: parseFieldValue(fields['完成时间'], 'date') || null,
    description: parseFieldValue(fields['描述'], 'multiLineText') || '',
    createdAt: record.created_time ? new Date(record.created_time).toISOString() : null,
    updatedAt: record.last_modified_time ? new Date(record.last_modified_time).toISOString() : null
  };
}

async function findProjectId(projectNameOrId) {
  const projectTableId = getProjectTableId();
  if (!projectTableId) {
    throw new Error('未配置项目表 ID');
  }
  
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

function buildFields(params, projectId = null) {
  const fields = {};
  
  if (params.name !== undefined) {
    fields['名称'] = params.name;
  }
  
  if (projectId) {
    fields['项目'] = [projectId];
  }
  
  if (params.status !== undefined) {
    const statusMap = { pending: 'pending', in_progress: 'in_progress', done: 'done' };
    fields['状态'] = [statusMap[params.status] || params.status];
    
    if (params.status === 'done') {
      fields['完成时间'] = Date.now();
    }
  }
  
  if (params.desc !== undefined) {
    fields['描述'] = params.desc;
  }
  
  return fields;
}

async function actionAdd(params) {
  if (!params.name) {
    console.error('用法: node feishu-bitable-deliverable.mjs --action add --name "成果物名" [--project "项目名|ID"] [--status pending|in_progress|done] [--desc "描述"]');
    process.exit(1);
  }
  
  const tableId = getTableId();
  
  let projectId = null;
  if (params.project) {
    try {
      projectId = await findProjectId(params.project);
      if (!projectId) {
        console.error(`❌ 未找到项目: ${params.project}`);
        process.exit(1);
      }
    } catch (e) {
      console.error(`❌ 查找项目失败: ${e.message}`);
      process.exit(1);
    }
  }
  
  const fields = buildFields({
    name: params.name,
    status: params.status || 'pending',
    desc: params.desc
  }, projectId);
  
  try {
    const result = await createRecord(tableId, fields);
    console.log(`✅ 已创建成果物: ${params.name}`);
    console.log(`   ID: ${result.record.record_id}`);
    console.log(`   状态: ${STATUS_MAP[params.status || 'pending']}`);
    if (params.project) console.log(`   项目: ${params.project}`);
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
      console.log('暂无成果物记录。');
      return;
    }
    
    const deliverables = result.items.map(parseRecord);
    const filtered = params.status 
      ? deliverables.filter(d => d.status === params.status)
      : deliverables;
    
    if (filtered.length === 0) {
      console.log(params.status ? `暂无 ${params.status} 状态的成果物。` : '暂无成果物记录。');
      return;
    }
    
    console.log('## 成果物列表\n');
    
    for (const d of filtered) {
      console.log(`- **${d.name}** (${d.id})`);
      console.log(`  - 状态: ${STATUS_MAP[d.status] || d.status}`);
      if (d.description) console.log(`  - 描述: ${d.description}`);
      if (d.completedAt) console.log(`  - 完成时间: ${d.completedAt.slice(0, 10)}`);
      console.log('');
    }
    
    const doneCount = deliverables.filter(d => d.status === 'done').length;
    const totalCount = deliverables.length;
    console.log(`---\n**统计**: 共 ${totalCount} 个成果物，${doneCount} 个已完成`);
  } catch (e) {
    console.error(`❌ 查询失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionUpdate(params) {
  if (!params.id && !params.name) {
    console.error('用法: node feishu-bitable-deliverable.mjs --action update --id "记录ID" [--status pending|in_progress|done] [--desc "描述"]');
    process.exit(1);
  }
  
  const tableId = getTableId();
  
  try {
    let recordId = params.id;
    
    if (!recordId) {
      const result = await listRecords(tableId);
      const deliverables = result.items.map(parseRecord);
      const deliverable = deliverables.find(d => 
        d.name.toLowerCase() === params.name.toLowerCase()
      );
      
      if (!deliverable) {
        console.error(`❌ 未找到成果物: ${params.name}`);
        process.exit(1);
      }
      
      recordId = deliverable.id;
    }
    
    const updateParams = {};
    if (params['new-name']) updateParams.name = params['new-name'];
    if (params.status) updateParams.status = params.status;
    if (params.desc) updateParams.desc = params.desc;
    
    const fields = buildFields(updateParams);
    
    if (Object.keys(fields).length === 0) {
      console.error('❌ 请提供要更新的字段');
      process.exit(1);
    }
    
    await updateRecord(tableId, recordId, fields);
    console.log(`✅ 已更新成果物: ${params.name || recordId}`);
    if (params.status) console.log(`   状态: ${STATUS_MAP[params.status]}`);
  } catch (e) {
    console.error(`❌ 更新失败: ${e.message}`);
    process.exit(1);
  }
}

async function actionGet(params) {
  if (!params.id && !params.name) {
    console.error('用法: node feishu-bitable-deliverable.mjs --action get --id "记录ID" 或 --name "成果物名"');
    process.exit(1);
  }
  
  const tableId = getTableId();
  
  try {
    const result = await listRecords(tableId);
    const deliverables = result.items.map(parseRecord);
    
    let deliverable;
    if (params.id) {
      deliverable = deliverables.find(d => d.id === params.id);
    } else {
      deliverable = deliverables.find(d => 
        d.name.toLowerCase() === params.name.toLowerCase()
      );
    }
    
    if (!deliverable) {
      console.error(`❌ 未找到成果物: ${params.id || params.name}`);
      process.exit(1);
    }
    
    console.log('## 成果物详情\n');
    console.log(`- **名称**: ${deliverable.name}`);
    console.log(`- **ID**: ${deliverable.id}`);
    console.log(`- **状态**: ${STATUS_MAP[deliverable.status] || deliverable.status}`);
    if (deliverable.description) console.log(`- **描述**: ${deliverable.description}`);
    if (deliverable.completedAt) console.log(`- **完成时间**: ${deliverable.completedAt.slice(0, 10)}`);
    if (deliverable.projectIds.length > 0) console.log(`- **关联项目**: ${deliverable.projectIds.join(', ')}`);
    if (deliverable.createdAt) console.log(`- **创建时间**: ${deliverable.createdAt.slice(0, 16).replace('T', ' ')}`);
  } catch (e) {
    console.error(`❌ 查询失败: ${e.message}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log('用法: node feishu-bitable-deliverable.mjs --action <命令> [参数]');
  console.log('\n命令:');
  console.log('  add     新增成果物');
  console.log('    --name "成果物名" [--project "项目名|ID"] [--status pending|in_progress|done] [--desc "描述"]');
  console.log('  list    列出成果物');
  console.log('    [--status pending|in_progress|done]');
  console.log('  update  更新成果物');
  console.log('    --id "记录ID" 或 --name "成果物名" [--status 状态] [--desc "描述"]');
  console.log('  get     获取成果物详情');
  console.log('    --id "记录ID" 或 --name "成果物名"');
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
