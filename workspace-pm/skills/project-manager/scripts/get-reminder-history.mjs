#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const historyFile = path.join(dataDir, 'reminder-history.json');

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  return `${diffDays}天前`;
}

function formatResponseTime(seconds) {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  return `${Math.floor(seconds / 3600)}小时`;
}

function main() {
  if (!fs.existsSync(historyFile)) {
    console.log('## 提醒效果\n\n暂无提醒历史。');
    return;
  }
  
  const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  const history = data.history || [];
  const stats = data.stats || {};
  
  if (history.length === 0) {
    console.log('## 提醒效果\n\n暂无提醒历史。');
    return;
  }
  
  const recent7Days = history.filter(h => {
    const days = Math.floor((Date.now() - new Date(h.sentAt)) / (1000 * 60 * 60 * 24));
    return days <= 7;
  });
  
  console.log('## 提醒效果（近7天）\n');
  
  const responded = recent7Days.filter(h => h.feedback && h.feedback.respondedAt);
  const positive = recent7Days.filter(h => h.feedback && h.feedback.type === 'positive');
  const negative = recent7Days.filter(h => h.feedback && h.feedback.type === 'negative');
  const ignored = recent7Days.filter(h => !h.feedback || h.feedback.type === 'ignored');
  
  console.log(`- 发送 ${recent7Days.length} 条，响应 ${responded.length} 条`);
  
  if (responded.length > 0) {
    const avgTime = responded.reduce((sum, h) => sum + (h.feedback.responseTime || 0), 0) / responded.length;
    console.log(`- 平均响应时间：${formatResponseTime(avgTime)}`);
  }
  
  if (positive.length > 0 || negative.length > 0) {
    console.log(`- 正面反馈：${positive.length} 条，负面反馈：${negative.length} 条`);
  }
  
  if (ignored.length > 0) {
    console.log(`- 忽略：${ignored.length} 条`);
  }
  
  if (recent7Days.length > 0) {
    console.log('\n### 最近发送\n');
    for (const h of recent7Days.slice(-5).reverse()) {
      const time = formatTimeAgo(h.sentAt);
      let status = '⏳';
      if (h.feedback) {
        if (h.feedback.type === 'positive') status = '👍';
        else if (h.feedback.type === 'negative') status = '👎';
        else if (h.feedback.type === 'ignored') status = '🙈';
        else status = '✅';
      }
      console.log(`- ${status} ${time}：${h.content.substring(0, 50)}${h.content.length > 50 ? '...' : ''}`);
    }
  }
  
  console.log('\n---\n');
  console.log(`**累计统计**：共发送 ${stats.totalSent || history.length} 条`);
  if (stats.avgResponseTime) {
    console.log(`**历史平均响应**：${formatResponseTime(stats.avgResponseTime)}`);
  }
}

main();
