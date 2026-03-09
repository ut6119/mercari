import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import express from 'express';
import { google } from 'googleapis';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = Number(process.env.PORT || 3000);
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '1MoRWqtUdZaLAgJtQKa_jyjpHkcYiDKFuJ6axK5RsnXU';
const SHEET_NAME = process.env.SHEET_NAME || 'メルカリ';
const DATA_START_ROW = 3;
const VISIBLE_COLUMN_COUNT = 8;
const META_ID_COLUMN = 9;
const META_STATUS_COLUMN = 10;
const DEFAULT_SHIPPING = 160;
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Tokyo';

const auth = new google.auth.GoogleAuth({
  credentials: resolveCredentials(),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

app.get('/api/dashboard', async (_req, res) => {
  try {
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/items', async (req, res) => {
  try {
    const item = sanitizePayload(req.body || {});
    const items = await readItems();
    const index = items.findIndex((existing) => existing.id === item.id);
    if (index >= 0) {
      items[index] = item;
    } else {
      items.push(item);
    }
    await writeSheetFromItems(items, SHEET_NAME);
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

app.delete('/api/items/:id', async (req, res) => {
  try {
    const itemId = String(req.params.id || '');
    const items = (await readItems()).filter((item) => item.id !== itemId);
    await writeSheetFromItems(items, SHEET_NAME);
    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

app.post('/api/archive', async (_req, res) => {
  try {
    const items = await readItems();
    const archiveName = getLastMonthLabel();
    const sheetNames = await getSheetNames();
    if (sheetNames.includes(archiveName)) {
      throw createBadRequest(`「${archiveName}」は既に存在します。`);
    }

    const soldOnly = items.filter((item) => item.status === 'sold');
    const unsoldOnly = items.filter((item) => item.status === 'unsold');

    await writeSheetFromItems(soldOnly, archiveName);
    await writeSheetFromItems(unsoldOnly, SHEET_NAME);

    const data = await getDashboardData();
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

app.listen(PORT, () => {
  console.log(`Mercari web app: http://localhost:${PORT}`);
});

function resolveCredentials() {
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
    try {
      return JSON.parse(raw);
    } catch {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_PATH) {
    return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON_PATH, 'utf8'));
  }
  throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON (raw or base64).');
}

async function getDashboardData() {
  await ensureSheetExists(SHEET_NAME);
  const items = await readItems();
  const soldItems = items.filter((item) => item.status === 'sold').map(enrichItem);
  const unsoldItems = items.filter((item) => item.status === 'unsold').map(enrichItem);
  const summary = buildSummary(soldItems, unsoldItems);

  return {
    summary,
    soldItems,
    unsoldItems,
    lastUpdated: formatDate(new Date())
  };
}

async function readItems() {
  await ensureSheetExists(SHEET_NAME);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A${DATA_START_ROW}:J`
  });
  const rows = response.data.values || [];
  const items = [];
  let separatorSeen = false;

  for (const rawRow of rows) {
    const row = normalizeRow(rawRow, META_STATUS_COLUMN);
    const visible = row.slice(0, VISIBLE_COLUMN_COUNT);
    const statusMeta = normalizeStatus(row[META_STATUS_COLUMN - 1]);
    const idMeta = String(row[META_ID_COLUMN - 1] || '').trim();

    if (isRowCompletelyEmpty(visible)) {
      if (items.length > 0) {
        separatorSeen = true;
      }
      continue;
    }
    if (statusMeta === 'summary') {
      continue;
    }

    const name = String(row[0] || '').trim();
    if (!name && !hasItemBody(row)) {
      continue;
    }
    if (isSummaryLabel(name) && !idMeta) {
      continue;
    }

    let status = statusMeta;
    if (!status) {
      const revenue = parseNumber(row[1]);
      const cost = parseNumber(row[4]);
      status = separatorSeen ? 'unsold' : (revenue > 0 ? 'sold' : (cost > 0 ? 'unsold' : 'sold'));
    }

    items.push({
      id: idMeta || crypto.randomUUID(),
      status,
      name,
      revenue: parseNumber(row[1]),
      shipping: parseOptionalNumber(row[3]),
      cost: parseNumber(row[4])
    });
  }

  return items.filter((item) => item.name || item.revenue || item.cost);
}

async function writeSheetFromItems(items, sheetName) {
  await ensureSheetExists(sheetName);

  const soldItems = items.filter((item) => item.status === 'sold').map(enrichItem);
  const unsoldItems = items.filter((item) => item.status === 'unsold').map(enrichItem);
  const summary = buildSummary(soldItems, unsoldItems);

  const rows = [];
  rows.push(['名前', '売上', '手数料', '送料', '原価', '利益', '利益率', '合計収支', '', '']);
  rows.push([
    '【販売済み合計】',
    summary.soldRevenue,
    summary.soldFee,
    summary.soldShipping,
    summary.soldCost,
    summary.soldProfit,
    summary.soldMargin,
    summary.soldProfit,
    'summary-sold',
    'summary'
  ]);

  for (const item of soldItems) {
    rows.push([
      item.name,
      item.revenue,
      item.fee,
      item.shipping,
      item.cost,
      item.profit,
      item.margin,
      '',
      item.id,
      'sold'
    ]);
  }

  rows.push(['', '', '', '', '', '', '', '', '', '']);
  rows.push([
    '【未販売在庫】',
    '',
    '',
    '',
    summary.unsoldCost,
    -summary.unsoldCost,
    '',
    summary.overallNet,
    'summary-unsold',
    'summary'
  ]);

  for (const item of unsoldItems) {
    rows.push([
      item.name,
      '',
      '',
      item.shipping || '',
      item.cost,
      -item.cost,
      '',
      '',
      item.id,
      'unsold'
    ]);
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A1:J${rows.length}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });

  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!A${rows.length + 1}:J5000`
  });
}

async function ensureSheetExists(sheetName) {
  const spreadsheet = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID
  });
  const existing = (spreadsheet.data.sheets || []).find((sheet) => sheet.properties?.title === sheetName);
  if (existing) {
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetName,
              gridProperties: {
                rowCount: 2000,
                columnCount: 10
              }
            }
          }
        }
      ]
    }
  });
}

async function getSheetNames() {
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return (spreadsheet.data.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean);
}

function sanitizePayload(payload) {
  const source = payload || {};
  const status = normalizeStatus(source.status) || 'unsold';
  const revenue = parseNumber(source.revenue);
  const shippingInput = parseOptionalNumber(source.shipping);
  const cost = parseNumber(source.cost);
  const name = String(source.name || '').trim();

  if (!name) {
    throw createBadRequest('商品名は必須です。');
  }
  if (status === 'sold' && revenue <= 0) {
    throw createBadRequest('販売済みは売上を入力してください。');
  }
  if (revenue < 0 || cost < 0) {
    throw createBadRequest('金額は0以上で入力してください。');
  }

  return {
    id: String(source.id || crypto.randomUUID()),
    status,
    name,
    revenue: status === 'sold' ? revenue : 0,
    shipping: status === 'sold'
      ? (shippingInput === '' ? DEFAULT_SHIPPING : shippingInput)
      : (shippingInput === '' ? '' : shippingInput),
    cost
  };
}

function enrichItem(item) {
  const revenue = parseNumber(item.revenue);
  const shipping = item.shipping === '' ? DEFAULT_SHIPPING : parseOptionalNumber(item.shipping);
  const cost = parseNumber(item.cost);
  const fee = item.status === 'sold' ? Math.floor(revenue * 0.1) : 0;
  const profit = item.status === 'sold'
    ? revenue - fee - (shipping === '' ? DEFAULT_SHIPPING : shipping) - cost
    : -cost;
  const margin = item.status === 'sold' && revenue > 0 ? profit / revenue : null;
  return {
    id: item.id,
    status: item.status,
    name: item.name,
    revenue,
    shipping: shipping === '' ? '' : shipping,
    cost,
    fee,
    profit,
    margin
  };
}

function buildSummary(soldItems, unsoldItems) {
  const soldRevenue = sumBy(soldItems, 'revenue');
  const soldFee = sumBy(soldItems, 'fee');
  const soldShipping = sumBy(soldItems, 'shipping');
  const soldCost = sumBy(soldItems, 'cost');
  const soldProfit = sumBy(soldItems, 'profit');
  const unsoldCost = sumBy(unsoldItems, 'cost');

  return {
    soldRevenue,
    soldFee,
    soldShipping,
    soldCost,
    soldProfit,
    soldMargin: soldRevenue > 0 ? soldProfit / soldRevenue : 0,
    unsoldCost,
    overallNet: soldProfit - unsoldCost,
    soldCount: soldItems.length,
    unsoldCount: unsoldItems.length
  };
}

function normalizeStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'sold' || status === 'unsold' || status === 'summary') {
    return status;
  }
  return '';
}

function sumBy(items, key) {
  return items.reduce((total, item) => total + parseNumber(item[key]), 0);
}

function parseNumber(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return 0;
  }
  if (typeof value === 'number') {
    return value;
  }
  const cleaned = String(value)
    .replace(/[¥,\s]/g, '')
    .replace(/％/g, '%')
    .replace(/[^0-9.\-]/g, '');
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return '';
  }
  return parseNumber(value);
}

function normalizeRow(rawRow, length) {
  const row = Array.isArray(rawRow) ? [...rawRow] : [];
  while (row.length < length) {
    row.push('');
  }
  return row;
}

function isRowCompletelyEmpty(values) {
  return values.every((value) => value === '' || value === null || typeof value === 'undefined');
}

function hasItemBody(row) {
  return [1, 3, 4].some((index) => row[index] !== '' && row[index] !== null && typeof row[index] !== 'undefined');
}

function isSummaryLabel(value) {
  return /^【.+】$/.test(value);
}

function createBadRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function handleError(res, error) {
  const status = error?.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal server error' : String(error.message || 'Request failed')
  });
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date).replace(',', '');
}

function getLastMonthLabel() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(month).padStart(2, '0')}`;
}
