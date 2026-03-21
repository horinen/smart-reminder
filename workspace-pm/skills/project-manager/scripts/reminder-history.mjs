#!/usr/bin/env node

/**
 * === Script Review ===
 * 
 * 功能: 管理提醒历史 - 查看/记录反馈
 * 
 * 输入:
 *   - --action list (默认): 查看提醒历史和统计
 *   - --action feedback: 记录用户反馈
 *   - --id: 提醒ID (feedback必需)
 *   - --type: positive|negative|neutral|ignored (feedback必需)
 *   - --comment: 用户评论 (可选)
 * 
 * 输出:
 *   - stdout: 统计信息或操作结果
 *   - 文件: 更新 reminder-history.json (feedback时)
 * 
 * 测试:
 *   - [ ] 无参数运行 (应显示统计)
 *   - [ ] --action list (应显示统计)
 *   - [ ] --action feedback --id "xxx" --type positive
 *   - [ ] --action feedback --id "xxx" --type positive --comment "测试"
 *   - [ ] 缺少 --id
 *   - [ ] 缺少 --type
 *   - [ ] 不存在的 ID
 *   - [ ] 无效的 type 值
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const historyFile = path.join(dataDir, 'reminder-history.json');

const VALID_TYPES = ['positive', 'negative', 'neutral', 'ignored'];

function parseArgs() {
  const args = process.argv.slice(2);
  const params = { action: 'list' };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      params[key] = value;
      if (value !== true) i++;
    }
  }
  
  return params;
}

function formatTimeAgo(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  
  const dateLocal = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const nowLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((nowLocal - dateLocal) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  return `${diffDays}天前`;
}

function formatResponseTime(seconds) {
  if (seconds == null) return '未知';
  if (seconds < 60) return `${Math.floor(seconds)}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟`;
  return `${Math.floor(seconds / 3600)}小时`;
}

function getStatusIcon(feedback) {
  if (!feedback) return '⏳';
  if (feedback.type === 'positive') return '👍';
  if (feedback.type === 'negative') return '👎';
  if (feedback.type === 'ignored') return '🙈';
  return '✅';
}

function ensureHistoryFile() {
  if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify({ 
      history: [], 
      stats: { totalSent: 0, totalResponded: 0, avgResponseTime: null, positiveCount: 0, negativeCount: 0 } 
    }, null, 2));
  }
}

function actionList() {
  ensureHistoryFile();
  
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
      const status = getStatusIcon(h.feedback);
      const content = h.content.length > 50 ? h.content.substring(0, 50) + '...' : h.content;
      console.log(`- ${status} ${time}：${content}`);
    }
  }
  
  console.log('\n---\n');
  console.log(`**累计统计**：共发送 ${stats.totalSent || history.length} 条`);
  if (stats.avgResponseTime) {
    console.log(`**历史平均响应**：${formatResponseTime(stats.avgResponseTime)}`);
  }
}

function actionFeedback(params) {
  if (!params.id || !params.type) {
    console.error('用法: node reminder-history.mjs --action feedback --id "reminder-id" --type positive|negative|neutral|ignored [--comment "评论"]');
    process.exit(1);
  }
  
  if (!VALID_TYPES.includes(params.type)) {
    console.error(`❌ 无效的反馈类型: ${params.type}，有效值: ${VALID_TYPES.join(', ')}`);
    process.exit(1);
  }
  
  ensureHistoryFile();
  
  const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  
  const history = data.history.find(h => h.id === params.id);
  if (!history) {
    console.error(`❌ 未找到提醒: ${params.id}`);
    process.exit(1);
  }
  
  const now = new Date().toISOString();
  const responseTime = history.sentAt ? Math.floor((Date.now() - new Date(history.sentAt).getTime()) / 1000) : null;
  
  history.feedback = {
    type: params.type,
    respondedAt: now,
    responseTime: responseTime,
    comment: params.comment || ''
  };
  
  data.stats.totalResponded++;
  if (params.type === 'positive') data.stats.positiveCount++;
  if (params.type === 'negative') data.stats.negativeCount++;
  
  const respondedList = data.history.filter(h => h.feedback && h.feedback.responseTime != null);
  if (respondedList.length > 0) {
    data.stats.avgResponseTime = respondedList.reduce((sum, h) => sum + h.feedback.responseTime, 0) / respondedList.length;
  }
  
  fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
  
  console.log(`✅ 已记录反馈: ${params.type}`);
}

function main() {
  const params = parseArgs();
  
  if (params.action === 'list') {
    actionList();
  } else if (params.action === 'feedback') {
    actionFeedback(params);
  } else {
    console.error('用法: node reminder-history.mjs [--action list|feedback] ...');
    process.exit(1);
  }
}

main();
