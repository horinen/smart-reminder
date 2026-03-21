#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const projectsFile = path.join(dataDir, 'projects.json');

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

function main() {
  if (!fs.existsSync(projectsFile)) {
    console.log('## 项目状态\n\n暂无项目记录。');
    return;
  }
  
  const data = JSON.parse(fs.readFileSync(projectsFile, 'utf-8'));
  const projects = data.projects || [];
  
  if (projects.length === 0) {
    console.log('## 项目状态\n\n暂无项目记录。');
    return;
  }
  
  console.log('## 项目状态\n');
  
  const statusEmoji = {
    active: '🟢',
    paused: '🟡',
    completed: '✅'
  };
  
  const sortedProjects = [...projects].sort((a, b) => {
    const order = { active: 0, paused: 1, completed: 2 };
    return (order[a.status] || 2) - (order[b.status] || 2);
  });
  
  for (const p of sortedProjects) {
    const emoji = statusEmoji[p.status] || '⚪';
    const timeAgo = formatTimeAgo(p.updatedAt);
    const daysSinceUpdate = Math.floor((Date.now() - new Date(p.updatedAt)) / (1000 * 60 * 60 * 24));
    
    let line = `- ${emoji} **${p.name}**：${p.status === 'active' ? '活跃' : p.status === 'paused' ? '暂停' : '完成'}，${timeAgo}更新`;
    
    if (p.status === 'active' && daysSinceUpdate >= 3) {
      line += ` ⚠️ 超过${daysSinceUpdate}天未更新`;
    }
    
    if (p.note) {
      line += `\n  - 备注：${p.note}`;
    }
    
    console.log(line);
  }
  
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

main();
