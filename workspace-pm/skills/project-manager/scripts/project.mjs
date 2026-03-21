#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 项目 CRUD 操作
 * 
 * 输入:
 *   - --action: add | update | list | archive | status
 *   - --name: 项目名称（add/update/archive 必填，支持 ID 或名称）
 *   - --desc: 项目描述（add 可选）
 *   - --note: 备注，覆盖原有（add/update 可选）
 *   - --append-note: 追加备注（update 可选，格式：原有；新增（日期））
 *   - --status: 状态 active|paused|completed|archived（update/list 可选）
 *   - --all: 显示全部项目包括已归档（list/status 可选）
 *   - --warn: 只显示需关注的项目（status 可选）
 * 
 * 输出:
 *   - stdout: 操作结果（Markdown 格式）
 *   - 文件: ../data/projects.json
 * 
 * 状态说明:
 *   - active: 🟢 活跃
 *   - paused: 🟡 暂停
 *   - completed: ✅ 完成
 *   - archived: 📦 已归档（list/status 默认隐藏）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const projectsFile = path.join(dataDir, 'projects.json');

function generateId() {
  return `proj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffDays === 0) {
    if (diffHours === 0) return '刚刚';
    return `${diffHours}小时前`;
  } else if (diffDays === 1) {
    return '1天前';
  } else {
    return `${diffDays}天前`;
  }
}

function appendNote(existingNote, newContent) {
  const today = new Date().toISOString().slice(0, 10);
  const newEntry = `${newContent}（${today}）`;
  if (!existingNote || existingNote === true) {
    return newEntry;
  }
  return `${existingNote}；${newEntry}`;
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

function main() {
  const params = parseArgs();
  
  if (!fs.existsSync(projectsFile)) {
    fs.writeFileSync(projectsFile, JSON.stringify({ projects: [] }, null, 2));
  }
  
  const data = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
  
  if (params.action === 'list') {
    const statusMap = { active: '🟢 活跃', paused: '🟡 暂停', completed: '✅ 完成', archived: '📦 已归档' };
    
    let projects = data.projects;
    
    if (!params.all && !params.status) {
      projects = projects.filter(p => p.status !== 'archived');
    }
    if (params.status) {
      projects = projects.filter(p => p.status === params.status);
    }
    
    if (projects.length === 0) {
      console.log(params.status ? `暂无 ${params.status} 状态的项目。` : '暂无项目记录。');
    } else {
      console.log('## 项目列表\n');
      for (const p of projects) {
        console.log(`- **${p.name}** (${p.id})`);
        console.log(`  - 状态: ${statusMap[p.status] || p.status}`);
        if (p.description) console.log(`  - 描述: ${p.description}`);
        console.log(`  - 备注: ${p.note || '无'}`);
        console.log('');
      }
      if (!params.all && !params.status) {
        const archivedCount = data.projects.filter(p => p.status === 'archived').length;
        if (archivedCount > 0) {
          console.log(`_💡 有 ${archivedCount} 个已归档项目，使用 --all 或 --status archived 查看_`);
        }
      }
    }
    return;
  }
  
  if (params.action === 'add') {
    if (!params.name) {
      console.error('用法: node project.mjs --action add --name "项目名" [--desc "描述"] [--note "备注"]');
      process.exit(1);
    }
    
    const project = {
      id: generateId(),
      name: params.name,
      description: params.desc || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      note: params.note || ''
    };
    
    data.projects.push(project);
    fs.writeFileSync(projectsFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 已新增项目: ${project.name} (${project.id})`);
    return;
  }
  
  if (params.action === 'update') {
    if (!params.name) {
      console.error('用法: node project.mjs --action update --name "项目名|ID" [--status active|paused|completed|archived] [--note "备注"] [--append-note "追加内容"]');
      process.exit(1);
    }
    
    const project = data.projects.find(p => 
      p.id === params.name || p.name.toLowerCase() === params.name.toLowerCase()
    );
    
    if (!project) {
      console.error(`❌ 未找到项目: ${params.name}`);
      process.exit(1);
    }
    
    if (params.status) {
      if (!['active', 'paused', 'completed', 'archived'].includes(params.status)) {
        console.error('❌ 状态必须是 active, paused, completed 或 archived');
        process.exit(1);
      }
      project.status = params.status;
    }
    
    if (params.note !== undefined) {
      project.note = params.note === true ? '' : params.note;
    }
    
    if (params['append-note'] !== undefined) {
      const appendContent = params['append-note'] === true ? '' : params['append-note'];
      project.note = appendNote(project.note, appendContent);
    }
    
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(projectsFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 已更新项目: ${project.name}`);
    if (params.status) console.log(`   状态: ${project.status}`);
    if (params.note !== undefined) console.log(`   备注: ${project.note || '无'}`);
    if (params['append-note'] !== undefined) console.log(`   备注: ${project.note}`);
    return;
  }
  
  if (params.action === 'archive') {
    if (!params.name) {
      console.error('用法: node project.mjs --action archive --name "项目名|ID"');
      process.exit(1);
    }
    
    const project = data.projects.find(p => 
      p.id === params.name || p.name.toLowerCase() === params.name.toLowerCase()
    );
    
    if (!project) {
      console.error(`❌ 未找到项目: ${params.name}`);
      process.exit(1);
    }
    
    if (project.status === 'archived') {
      console.log(`⚠️ 项目 ${project.name} 已经是归档状态`);
      return;
    }
    
    project.status = 'archived';
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(projectsFile, JSON.stringify(data, null, 2));
    
    console.log(`📦 已归档项目: ${project.name}`);
    return;
  }
  
  if (params.action === 'status') {
    const statusEmoji = { active: '🟢', paused: '🟡', completed: '✅', archived: '📦' };
    const statusText = { active: '活跃', paused: '暂停', completed: '完成', archived: '已归档' };
    
    let projects = data.projects;
    
    if (params.status) {
      projects = projects.filter(p => p.status === params.status);
    } else if (!params.all) {
      projects = projects.filter(p => p.status !== 'archived');
    }
    
    if (projects.length === 0) {
      console.log('## 项目状态\n\n暂无项目记录。');
      return;
    }
    
    const statusOrder = { active: 0, paused: 1, completed: 2, archived: 3 };
    const sortedProjects = [...projects].sort((a, b) => {
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    });
    
    console.log('## 项目状态\n');
    
    const lines = [];
    for (const p of sortedProjects) {
      const emoji = statusEmoji[p.status] || '⚪';
      const timeAgo = formatTimeAgo(p.updatedAt);
      const daysSinceUpdate = Math.floor((Date.now() - new Date(p.updatedAt)) / (1000 * 60 * 60 * 24));
      
      let line = `- ${emoji} **${p.name}**：${statusText[p.status] || p.status}，${timeAgo}更新`;
      
      if (p.status === 'active' && daysSinceUpdate >= 3) {
        line += ` ⚠️ 超过${daysSinceUpdate}天未更新`;
      }
      
      if (p.note) {
        line += `\n  - 备注：${p.note}`;
      }
      
      lines.push({ line, showWarning: p.status === 'active' && daysSinceUpdate >= 3 });
    }
    
    if (params.warn) {
      const warnLines = lines.filter(l => l.showWarning);
      if (warnLines.length === 0) {
        console.log('✅ 所有活跃项目都在正常更新中。');
        return;
      }
      for (const l of warnLines) {
        console.log(l.line);
      }
    } else {
      for (const l of lines) {
        console.log(l.line);
      }
    }
    
    if (!params.warn) {
      const activeProjects = projects.filter(p => p.status === 'active');
      const staleProjects = activeProjects.filter(p => {
        const days = Math.floor((Date.now() - new Date(p.updatedAt)) / (1000 * 60 * 60 * 24));
        return days >= 3;
      });
      
      console.log('\n---\n');
      console.log(`**统计**：共 ${projects.length} 个项目，${activeProjects.length} 个活跃`);
      if (staleProjects.length > 0) {
        console.log(`**需关注**：${staleProjects.length} 个活跃项目超过3天未更新`);
      }
    }
    return;
  }
  
  console.error('用法: node project.mjs --action add|update|list|archive|status ...');
  process.exit(1);
}

main();
