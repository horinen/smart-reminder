#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 初始化飞书多维表格（创建多维表格和三张数据表）
 * 
 * 输入:
 *   --action: init
 *   --name: 多维表格名称（可选，默认"项目管理"）
 * 
 * 输出:
 *   - stdout: 创建结果和配置信息
 *   - 更新 feishu-calendar.json 中的 bitableAppToken 和各表 ID
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureValidCalendarToken, loadConfig, getConfigPath } from './lib/feishu-calendar-token.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

async function bitableRequest(method, path, body = null, appToken = null) {
  const token = await ensureValidCalendarToken();
  
  let url = `${BITABLE_API_BASE}${path}`;
  if (appToken && path.includes(':app_token')) {
    url = url.replace(':app_token', appToken);
  }
  
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (data.code !== 0) {
    throw new Error(`API 错误: ${data.msg} (code: ${data.code})`);
  }
  
  return data.data;
}

async function createBitable(name) {
  const result = await bitableRequest('POST', '/apps', { name });
  return result.app.app_token;
}

async function createTable(appToken, tableName, fields) {
  const result = await bitableRequest(
    'POST', 
    '/apps/:app_token/tables',
    {
      table: {
        name: tableName,
        fields: fields
      }
    },
    appToken
  );
  return result.table_id;
}

function saveConfig(config) {
  const configFile = getConfigPath();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
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

async function createTableSimple(appToken, tableName) {
  const result = await bitableRequest(
    'POST', 
    '/apps/:app_token/tables',
    { table: { name: tableName } },
    appToken
  );
  return result.table_id;
}

async function createField(appToken, tableId, field) {
  try {
    await bitableRequest(
      'POST',
      '/apps/:app_token/tables/:table_id/fields',
      { field },
      appToken
    );
    return true;
  } catch (e) {
    if (e.message.includes('already exists')) {
      return false;
    }
    throw e;
  }
}

async function actionCreateTables(params) {
  const config = loadConfig();
  const appToken = params['app-token'] || config.bitableAppToken;
  
  if (!appToken) {
    console.error('❌ 请提供 --app-token 或先配置 bitableAppToken');
    process.exit(1);
  }
  
  console.log(`## 在已有表格中创建数据表\n`);
  console.log(`App Token: ${appToken}\n`);
  
  try {
    console.log(`正在创建数据表...\n`);
    
    const projectTableId = await createTableSimple(appToken, '项目表');
    console.log(`✅ 项目表创建成功 (ID: ${projectTableId})`);
    
    for (const field of PROJECT_FIELDS) {
      try {
        await createField(appToken, projectTableId, field);
        console.log(`   - 字段 "${field.field_name}" 创建成功`);
      } catch (e) {
        console.log(`   - 字段 "${field.field_name}": ${e.message}`);
      }
    }
    
    const deliverableTableId = await createTableSimple(appToken, '成果物表');
    console.log(`\n✅ 成果物表创建成功 (ID: ${deliverableTableId})`);
    
    const deliverableFields = DELIVERABLE_FIELDS.map(f => {
      if (f.field_name === '项目') {
        return { ...f, property: { ...f.property, link_table_id: projectTableId } };
      }
      return f;
    });
    for (const field of deliverableFields) {
      try {
        await createField(appToken, deliverableTableId, field);
        console.log(`   - 字段 "${field.field_name}" 创建成功`);
      } catch (e) {
        console.log(`   - 字段 "${field.field_name}": ${e.message}`);
      }
    }
    
    const worklogTableId = await createTableSimple(appToken, '工作记录表');
    console.log(`\n✅ 工作记录表创建成功 (ID: ${worklogTableId})`);
    
    const worklogFields = WORKLOG_FIELDS.map(f => {
      if (f.field_name === '项目') {
        return { ...f, property: { ...f.property, link_table_id: projectTableId } };
      }
      if (f.field_name === '成果物') {
        return { ...f, property: { ...f.property, link_table_id: deliverableTableId } };
      }
      return f;
    });
    for (const field of worklogFields) {
      try {
        await createField(appToken, worklogTableId, field);
        console.log(`   - 字段 "${field.field_name}" 创建成功`);
      } catch (e) {
        console.log(`   - 字段 "${field.field_name}": ${e.message}`);
      }
    }
    
    config.bitableAppToken = appToken;
    config.bitableProjectTableId = projectTableId;
    config.bitableDeliverableTableId = deliverableTableId;
    config.bitableWorklogTableId = worklogTableId;
    saveConfig(config);
    
    console.log(`\n✅ 配置已保存到 feishu-calendar.json\n`);
    console.log(`---\n`);
    console.log(`**多维表格地址**: https://feishu.cn/base/${appToken}`);
    
  } catch (e) {
    console.error(`\n❌ 创建失败: ${e.message}`);
    process.exit(1);
  }
}

const PROJECT_FIELDS = [
  { field_name: '名称', type: 1 },
  { field_name: '分类', type: 3, property: { options: [
    { name: 'work', color: 0 },
    { name: 'personal', color: 1 },
    { name: 'learning', color: 2 }
  ]}},
  { field_name: '描述', type: 2 },
  { field_name: '截止日期', type: 4 },
  { field_name: '状态', type: 3, property: { options: [
    { name: 'active', color: 0 },
    { name: 'paused', color: 1 },
    { name: 'completed', color: 2 },
    { name: 'archived', color: 3 }
  ]}},
  { field_name: '备注', type: 2 }
];

const DELIVERABLE_FIELDS = [
  { field_name: '名称', type: 1 },
  { field_name: '项目', type: 11, property: { 
    link_table_id: '', 
    link_field_name: '成果物列表',
    bidirectional: true
  }},
  { field_name: '状态', type: 3, property: { options: [
    { name: 'pending', color: 0 },
    { name: 'in_progress', color: 1 },
    { name: 'done', color: 2 }
  ]}},
  { field_name: '完成时间', type: 4 },
  { field_name: '描述', type: 2 }
];

const WORKLOG_FIELDS = [
  { field_name: '日期', type: 4 },
  { field_name: '项目', type: 11, property: { 
    link_table_id: '', 
    link_field_name: '工作记录',
    bidirectional: true
  }},
  { field_name: '成果物', type: 11, property: { 
    link_table_id: '', 
    link_field_name: '相关工作',
    bidirectional: true
  }},
  { field_name: '内容', type: 2 },
  { field_name: '时长', type: 2 }
];

async function actionInit(params) {
  const bitableName = params.name || '项目管理';
  
  console.log(`## 初始化飞书多维表格\n`);
  console.log(`正在创建多维表格 "${bitableName}"...\n`);
  
  try {
    const appToken = await createBitable(bitableName);
    console.log(`✅ 多维表格创建成功`);
    console.log(`   App Token: ${appToken}\n`);
    
    console.log(`正在创建数据表...\n`);
    
    const projectTableId = await createTable(appToken, '项目表', PROJECT_FIELDS);
    console.log(`✅ 项目表创建成功 (ID: ${projectTableId})`);
    
    const deliverableFields = DELIVERABLE_FIELDS.map(f => {
      if (f.field_name === '项目') {
        return { ...f, property: { ...f.property, link_table_id: projectTableId } };
      }
      return f;
    });
    const deliverableTableId = await createTable(appToken, '成果物表', deliverableFields);
    console.log(`✅ 成果物表创建成功 (ID: ${deliverableTableId})`);
    
    const worklogFields = WORKLOG_FIELDS.map(f => {
      if (f.field_name === '项目') {
        return { ...f, property: { ...f.property, link_table_id: projectTableId } };
      }
      if (f.field_name === '成果物') {
        return { ...f, property: { ...f.property, link_table_id: deliverableTableId } };
      }
      return f;
    });
    const worklogTableId = await createTable(appToken, '工作记录表', worklogFields);
    console.log(`✅ 工作记录表创建成功 (ID: ${worklogTableId})`);
    
    const config = loadConfig();
    config.bitableAppToken = appToken;
    config.bitableProjectTableId = projectTableId;
    config.bitableDeliverableTableId = deliverableTableId;
    config.bitableWorklogTableId = worklogTableId;
    saveConfig(config);
    
    console.log(`\n✅ 配置已保存到 feishu-calendar.json\n`);
    console.log(`---\n`);
    console.log(`**多维表格地址**: https://feishu.cn/base/${appToken}`);
    
  } catch (e) {
    console.error(`\n❌ 创建失败: ${e.message}`);
    process.exit(1);
  }
}

function main() {
  const params = parseArgs();
  
  if (params.action === 'init') {
    actionInit(params);
  } else if (params.action === 'create-tables') {
    actionCreateTables(params);
  } else {
    console.log('用法:');
    console.log('  node feishu-bitable-init.mjs --action init [--name "表格名称"]');
    console.log('  node feishu-bitable-init.mjs --action create-tables [--app-token "xxx"]');
    console.log('\n命令说明:');
    console.log('  init          - 创建新的多维表格及数据表');
    console.log('  create-tables - 在已有表格中创建数据表');
  }
}

main();
