/**
 * 飞书多维表格 API 公共模块
 * 
 * 复用现有的 user_access_token 认证机制
 */

import { ensureValidCalendarToken, loadConfig } from './feishu-calendar-token.mjs';

const BITABLE_API_BASE = 'https://open.feishu.cn/open-apis/bitable/v1';

async function getBitableToken() {
  return ensureValidCalendarToken();
}

function getAppToken() {
  const config = loadConfig();
  if (!config.bitableAppToken) {
    throw new Error('未配置多维表格 app_token，请在 feishu-calendar.json 中添加 bitableAppToken 字段');
  }
  return config.bitableAppToken;
}

async function bitableRequest(method, path, body = null) {
  const token = await getBitableToken();
  const appToken = getAppToken();
  
  const url = `${BITABLE_API_BASE}${path.replace(':app_token', appToken)}`;
  
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
  const text = await response.text();
  
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON解析失败: ${text.substring(0, 200)}`);
  }
  
  if (data.code !== 0) {
    throw new Error(`飞书多维表格 API 错误: ${data.msg} (code: ${data.code})`);
  }
  
  return data.data;
}

async function listRecords(tableId, options = {}) {
  const params = new URLSearchParams();
  if (options.viewId) params.set('view_id', options.viewId);
  if (options.fieldNames) params.set('field_names', JSON.stringify(options.fieldNames));
  if (options.filter) params.set('filter', JSON.stringify(options.filter));
  if (options.sort) params.set('sort', JSON.stringify(options.sort));
  if (options.pageToken) params.set('page_token', options.pageToken);
  if (options.pageSize) params.set('page_size', options.pageSize);
  params.set('automatic_fields', options.automaticFields || 'true');
  
  const queryString = params.toString();
  const path = `/apps/:app_token/tables/${tableId}/records${queryString ? '?' + queryString : ''}`;
  
  return bitableRequest('GET', path);
}

async function createRecord(tableId, fields) {
  const path = `/apps/:app_token/tables/${tableId}/records`;
  return bitableRequest('POST', path, { fields });
}

async function updateRecord(tableId, recordId, fields) {
  const path = `/apps/:app_token/tables/${tableId}/records/${recordId}`;
  return bitableRequest('PUT', path, { fields });
}

async function deleteRecord(tableId, recordId) {
  const path = `/apps/:app_token/tables/${tableId}/records/${recordId}`;
  return bitableRequest('DELETE', path);
}

async function batchCreateRecords(tableId, records) {
  const path = `/apps/:app_token/tables/${tableId}/records/batch_create`;
  return bitableRequest('POST', path, { records });
}

async function getTableMeta(tableId) {
  const path = `/apps/:app_token/tables/${tableId}`;
  return bitableRequest('GET', path);
}

async function listTables() {
  const path = `/apps/:app_token/tables`;
  return bitableRequest('GET', path);
}

function formatFieldValue(value, fieldType) {
  if (value === null || value === undefined) return null;
  
  switch (fieldType) {
    case 'text':
    case 'multiLineText':
      return typeof value === 'string' ? value : String(value);
    
    case 'number':
      const num = Number(value);
      return isNaN(num) ? null : num;
    
    case 'singleSelect':
      return { id: value };
    
    case 'multiSelect':
      if (Array.isArray(value)) {
        return value.map(v => ({ id: v }));
      }
      return [{ id: value }];
    
    case 'date':
      if (value instanceof Date) {
        return Math.floor(value.getTime() / 1000);
      }
      if (typeof value === 'string') {
        return new Date(value).getTime();
      }
      return value;
    
    case 'link':
      if (Array.isArray(value)) {
        return { link_record_ids: value };
      }
      return { link_record_ids: [value] };
    
    default:
      return value;
  }
}

function parseFieldValue(value, fieldType) {
  if (value === null || value === undefined) return null;
  
  switch (fieldType) {
    case 'singleSelect':
      return value?.id || value?.name || value;
    
    case 'multiSelect':
      if (Array.isArray(value)) {
        return value.map(v => v.id || v.name || v);
      }
      return [];
    
    case 'date':
      if (typeof value === 'number') {
        return new Date(value).toISOString();
      }
      return value;
    
    case 'link':
      return value?.link_record_ids || [];
    
    case 'number':
      return typeof value === 'number' ? value : Number(value);
    
    default:
      return value;
  }
}

export {
  getBitableToken,
  getAppToken,
  bitableRequest,
  listRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  batchCreateRecords,
  getTableMeta,
  listTables,
  formatFieldValue,
  parseFieldValue
};
