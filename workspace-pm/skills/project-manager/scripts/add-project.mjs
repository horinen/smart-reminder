#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const projectsFile = path.join(dataDir, 'projects.json');

function generateId() {
  return `proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
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
  
  if (!fs.existsSync(projectsFile)) {
    fs.writeFileSync(projectsFile, JSON.stringify({ projects: [] }, null, 2));
  }
  
  const data = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
  
  if (params.action === 'list') {
    if (data.projects.length === 0) {
      console.log('暂无项目记录。');
    } else {
      console.log('## 项目列表\n');
      for (const p of data.projects) {
        const statusMap = { active: '🟢 活跃', paused: '🟡 暂停', completed: '✅ 完成' };
        console.log(`- **${p.name}** (${p.id})`);
        console.log(`  - 状态: ${statusMap[p.status] || p.status}`);
        if (p.description) console.log(`  - 描述: ${p.description}`);
        if (p.note) console.log(`  - 备注: ${p.note}`);
        console.log('');
      }
    }
    return;
  }
  
  if (params.action === 'add') {
    if (!params.name) {
      console.error('用法: node add-project.mjs --action add --name "项目名" [--desc "描述"]');
      process.exit(1);
    }
    
    const project = {
      id: generateId(),
      name: params.name,
      description: params.desc || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      note: ''
    };
    
    data.projects.push(project);
    fs.writeFileSync(projectsFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 已新增项目: ${project.name} (${project.id})`);
    return;
  }
  
  if (params.action === 'update') {
    if (!params.name) {
      console.error('用法: node add-project.mjs --action update --name "项目名" [--status active|paused|completed] [--note "备注"]');
      process.exit(1);
    }
    
    const project = data.projects.find(p => 
      p.name.toLowerCase().includes(params.name.toLowerCase()) || p.id === params.name
    );
    
    if (!project) {
      console.error(`❌ 未找到项目: ${params.name}`);
      process.exit(1);
    }
    
    if (params.status) {
      if (!['active', 'paused', 'completed'].includes(params.status)) {
        console.error('❌ 状态必须是 active, paused 或 completed');
        process.exit(1);
      }
      project.status = params.status;
    }
    
    if (params.note) {
      project.note = params.note;
    }
    
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(projectsFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 已更新项目: ${project.name}`);
    if (params.status) console.log(`   状态: ${project.status}`);
    if (params.note) console.log(`   备注: ${project.note}`);
    return;
  }
  
  console.error('用法: node add-project.mjs --action add|update|list ...');
  process.exit(1);
}

main();
