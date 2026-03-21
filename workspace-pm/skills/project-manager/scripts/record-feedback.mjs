#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '../data');
const historyFile = path.join(dataDir, 'reminder-history.json');

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
  
  if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify({ 
      history: [], 
      stats: { totalSent: 0, totalResponded: 0, avgResponseTime: null, positiveCount: 0, negativeCount: 0 } 
    }, null, 2));
  }
  
  const data = JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
  
  if (params.action === 'list') {
    if (data.history.length === 0) {
      console.log('暂无提醒历史。');
    } else {
      console.log('## 提醒历史\n');
      for (const h of data.history.slice(-10).reverse()) {
        let status = '⏳';
        if (h.feedback) {
          if (h.feedback.type === 'positive') status = '👍';
          else if (h.feedback.type === 'negative') status = '👎';
          else if (h.feedback.type === 'ignored') status = '🙈';
          else status = '✅';
        }
        console.log(`- ${status} ${h.id}: ${h.content.substring(0, 40)}...`);
      }
    }
    return;
  }
  
  if (params.action === 'feedback') {
    if (!params.id || !params.type) {
      console.error('用法: node record-feedback.mjs --action feedback --id "reminder-id" --type positive|negative|neutral|ignored [--comment "评论"]');
      process.exit(1);
    }
    
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
    
    const responded = data.history.filter(h => h.feedback && h.feedback.responseTime);
    if (responded.length > 0) {
      data.stats.avgResponseTime = responded.reduce((sum, h) => sum + h.feedback.responseTime, 0) / responded.length;
    }
    
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
    
    console.log(`✅ 已记录反馈: ${params.type}`);
    return;
  }
  
  console.error('用法: node record-feedback.mjs --action feedback|list ...');
  process.exit(1);
}

main();
