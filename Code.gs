const TARGET_SPREADSHEET_ID = '12z7V7um65_0Ut0Ix-Mdw-hI_InFKFBZdUR5C5xZAIAM';
const SHEET_NAME = 'メルカリ';
const HEADER_ROW = 1;
const SUMMARY_ROW = 2;
const DATA_START_ROW = 3;
const VISIBLE_COLUMN_COUNT = 8;
const META_ID_COLUMN = 9;
const META_STATUS_COLUMN = 10;
const DEFAULT_SHIPPING = 160;
const APP_TIMEZONE = 'Asia/Tokyo';

function doGet(e) {
  if (isApiRequest_(e)) {
    try {
      const payload = parseApiGetPayload_(e);
      const result = runApiAction_(payload);
      const callback = String((e && e.parameter && e.parameter.callback) || '').trim();
      return jsonOutput_(result, callback);
    } catch (error) {
      const callback = String((e && e.parameter && e.parameter.callback) || '').trim();
      return jsonOutput_({
        error: String(error && error.message ? error.message : error)
      }, callback);
    }
  }

  normalizeCurrentSheet();
  const template = HtmlService.createTemplateFromFile('Index');
  template.initialDataJson = JSON.stringify(getDashboardData_());

  return template
    .evaluate()
    .setTitle('メルカリ収支アプリ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  try {
    const payload = parseApiPayload_(e);
    const result = runApiAction_(payload);
    return jsonOutput_(result);
  } catch (error) {
    return jsonOutput_({
      error: String(error && error.message ? error.message : error)
    });
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('メルカリアプリ')
    .addItem('表示を整える', 'normalizeCurrentSheet')
    .addItem('前月をアーカイブ', 'archiveMonthlyData')
    .addToUi();
}

function moveTotalRowOnly() {
  normalizeCurrentSheet();
}

function normalizeCurrentSheet() {
  const items = readItems_();
  writeSheetFromItems_(items);
}

function getDashboardData() {
  return getDashboardData_();
}

function saveItem(payload) {
  const item = sanitizePayload_(payload);
  const items = readItems_();
  const index = items.findIndex(function(existing) {
    return existing.id === item.id;
  });

  if (index >= 0) {
    items[index] = item;
  } else {
    items.push(item);
  }

  writeSheetFromItems_(items);
  return getDashboardData_();
}

function deleteItem(itemId) {
  const items = readItems_().filter(function(item) {
    return item.id !== itemId;
  });

  writeSheetFromItems_(items);
  return getDashboardData_();
}

function archiveMonthlyData() {
  const ss = openSpreadsheet_();
  const mainSheet = ensureSheet_();
  const items = readItems_();
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const archiveName = Utilities.formatDate(lastMonth, APP_TIMEZONE, 'yyyy-MM');

  if (ss.getSheetByName(archiveName)) {
    throw new Error('「' + archiveName + '」は既に存在します。');
  }

  const archiveSheet = mainSheet.copyTo(ss);
  archiveSheet.setName(archiveName);

  const soldOnly = items.filter(function(item) {
    return item.status === 'sold';
  });
  writeSheetFromItems_(soldOnly, archiveSheet);

  const unsoldOnly = items.filter(function(item) {
    return item.status === 'unsold';
  });
  writeSheetFromItems_(unsoldOnly, mainSheet);

  return getDashboardData_();
}

function getDashboardData_() {
  ensureSheet_();
  const items = readItems_();
  const soldItems = items
    .filter(function(item) { return item.status === 'sold'; })
    .map(enrichItem_);
  const unsoldItems = items
    .filter(function(item) { return item.status === 'unsold'; })
    .map(enrichItem_);

  const summary = buildSummary_(soldItems, unsoldItems);

  return {
    summary: summary,
    soldItems: soldItems,
    unsoldItems: unsoldItems,
    lastUpdated: Utilities.formatDate(new Date(), APP_TIMEZONE, 'yyyy/MM/dd HH:mm:ss')
  };
}

function ensureSheet_() {
  const ss = openSpreadsheet_();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  if (sheet.getMaxColumns() < META_STATUS_COLUMN) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), META_STATUS_COLUMN - sheet.getMaxColumns());
  }

  if (sheet.getMaxRows() < 20) {
    sheet.insertRowsAfter(sheet.getMaxRows(), 20 - sheet.getMaxRows());
  }

  if (sheet.getLastRow() === 0) {
    writeSheetFromItems_([], sheet);
  }

  return sheet;
}

function openSpreadsheet_() {
  return SpreadsheetApp.openById(TARGET_SPREADSHEET_ID);
}

function readItems_() {
  const sheet = ensureSheet_();
  const totalRows = Math.max(sheet.getMaxRows() - DATA_START_ROW + 1, 0);
  if (totalRows <= 0) {
    return [];
  }

  const values = sheet.getRange(DATA_START_ROW, 1, totalRows, META_STATUS_COLUMN).getValues();
  const items = [];
  let separatorSeen = false;

  values.forEach(function(row) {
    const visible = row.slice(0, VISIBLE_COLUMN_COUNT);
    const statusMeta = normalizeStatus_(row[META_STATUS_COLUMN - 1]);
    const idMeta = String(row[META_ID_COLUMN - 1] || '').trim();

    if (isRowCompletelyEmpty_(visible)) {
      if (items.length > 0) {
        separatorSeen = true;
      }
      return;
    }

    const name = String(row[0] || '').trim();
    const summaryLabel = isSummaryLabel_(name);
    const unsoldLabel = isUnsoldSectionLabel_(name);

    if (statusMeta === 'summary' && (summaryLabel || unsoldLabel)) {
      if (unsoldLabel) {
        separatorSeen = true;
      }
      return;
    }

    if (isUnsoldSectionLabel_(name) && !idMeta) {
      separatorSeen = true;
      return;
    }

    if (!name && !hasItemBody_(row)) {
      return;
    }

    if (summaryLabel && !idMeta) {
      return;
    }

    let status = statusMeta === 'summary' ? '' : statusMeta;
    if (!status) {
      const revenue = parseNumber_(row[1]);
      const cost = parseNumber_(row[4]);
      status = separatorSeen ? 'unsold' : (revenue > 0 ? 'sold' : (cost > 0 ? 'unsold' : 'sold'));
    }

    items.push({
      id: idMeta || Utilities.getUuid(),
      status: status,
      name: name,
      revenue: parseNumber_(row[1]),
      shipping: parseOptionalNumber_(row[3]),
      cost: parseNumber_(row[4])
    });
  });

  return items.filter(function(item) {
    return item.name || item.revenue || item.cost;
  });
}

function writeSheetFromItems_(items, targetSheet) {
  const sheet = targetSheet || ensureSheet_();
  const soldItems = items
    .filter(function(item) { return item.status === 'sold'; })
    .map(enrichItem_);
  const unsoldItems = items
    .filter(function(item) { return item.status === 'unsold'; })
    .map(enrichItem_);
  const summary = buildSummary_(soldItems, unsoldItems);
  const currentMaxRows = sheet.getMaxRows();
  const requiredRows = Math.max(20, DATA_START_ROW + soldItems.length + unsoldItems.length + 6);

  if (currentMaxRows < requiredRows) {
    sheet.insertRowsAfter(currentMaxRows, requiredRows - currentMaxRows);
  }

  if (sheet.getMaxColumns() < META_STATUS_COLUMN) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), META_STATUS_COLUMN - sheet.getMaxColumns());
  }

  // Avoid clearFormat on typed columns; it can throw in some Sheets setups.
  sheet.getRange(1, 1, sheet.getMaxRows(), META_STATUS_COLUMN).clearContent();
  sheet.setFrozenRows(1);
  sheet.setColumnWidths(1, 1, 210);
  sheet.setColumnWidths(2, 7, 110);
  sheet.hideColumns(META_ID_COLUMN, 2);

  sheet.getRange(HEADER_ROW, 1, 1, VISIBLE_COLUMN_COUNT).setValues([[
    '名前', '売上', '手数料', '送料', '原価', '利益', '利益率', '合計収支'
  ]]);

  let rowPointer = SUMMARY_ROW;
  sheet.getRange(rowPointer, 1, 1, META_STATUS_COLUMN).setValues([[
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
  ]]);
  styleSummaryRow_(sheet.getRange(rowPointer, 1, 1, VISIBLE_COLUMN_COUNT), '#dfe6ee');
  applyCurrencyFormat_(sheet.getRange(rowPointer, 2, 1, 5));
  applyPercentFormat_(sheet.getRange(rowPointer, 7, 1, 1));
  applyCurrencyFormat_(sheet.getRange(rowPointer, 8, 1, 1));
  rowPointer += 1;

  soldItems.forEach(function(item) {
    sheet.getRange(rowPointer, 1, 1, META_STATUS_COLUMN).setValues([[
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
    ]]);
    styleSoldRow_(sheet, rowPointer, item);
    rowPointer += 1;
  });

  rowPointer += 1;

  sheet.getRange(rowPointer, 1, 1, META_STATUS_COLUMN).setValues([[
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
  ]]);
  styleSummaryRow_(sheet.getRange(rowPointer, 1, 1, VISIBLE_COLUMN_COUNT), '#f8e4cc');
  applyCurrencyFormat_(sheet.getRange(rowPointer, 5, 1, 2));
  applyCurrencyFormat_(sheet.getRange(rowPointer, 8, 1, 1));
  rowPointer += 1;

  unsoldItems.forEach(function(item) {
    sheet.getRange(rowPointer, 1, 1, META_STATUS_COLUMN).setValues([[
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
    ]]);
    styleUnsoldRow_(sheet, rowPointer);
    rowPointer += 1;
  });

  if (rowPointer <= sheet.getMaxRows()) {
    sheet.getRange(rowPointer, 1, sheet.getMaxRows() - rowPointer + 1, META_STATUS_COLUMN).clearContent();
  }

  styleHeaderRow_(sheet.getRange(HEADER_ROW, 1, 1, VISIBLE_COLUMN_COUNT));
}

function sanitizePayload_(payload) {
  const source = payload || {};
  const status = normalizeStatus_(source.status) || 'unsold';
  const revenue = parseNumber_(source.revenue);
  const shippingInput = parseOptionalNumber_(source.shipping);
  const cost = parseNumber_(source.cost);

  if (!String(source.name || '').trim()) {
    throw new Error('商品名は必須です。');
  }

  if (status === 'sold' && revenue <= 0) {
    throw new Error('販売済みは売上を入力してください。');
  }

  if (cost < 0 || revenue < 0) {
    throw new Error('金額は0以上で入力してください。');
  }

  return {
    id: String(source.id || Utilities.getUuid()),
    status: status,
    name: String(source.name || '').trim(),
    revenue: status === 'sold' ? revenue : 0,
    shipping: status === 'sold'
      ? (shippingInput === '' ? DEFAULT_SHIPPING : shippingInput)
      : (shippingInput === '' ? '' : shippingInput),
    cost: cost
  };
}

function enrichItem_(item) {
  const revenue = parseNumber_(item.revenue);
  const shipping = item.shipping === '' ? DEFAULT_SHIPPING : parseOptionalNumber_(item.shipping);
  const cost = parseNumber_(item.cost);
  const fee = item.status === 'sold' ? Math.floor(revenue * 0.1) : 0;
  const profit = item.status === 'sold'
    ? revenue - fee - (shipping === '' ? DEFAULT_SHIPPING : shipping) - cost
    : -cost;
  const margin = item.status === 'sold' && revenue > 0 ? profit / revenue : null;

  return {
    id: item.id,
    status: item.status,
    name: item.name,
    revenue: revenue,
    shipping: shipping === '' ? '' : shipping,
    cost: cost,
    fee: fee,
    profit: profit,
    margin: margin
  };
}

function buildSummary_(soldItems, unsoldItems) {
  const soldRevenue = sumBy_(soldItems, 'revenue');
  const soldFee = sumBy_(soldItems, 'fee');
  const soldShipping = sumBy_(soldItems, 'shipping');
  const soldCost = sumBy_(soldItems, 'cost');
  const soldProfit = sumBy_(soldItems, 'profit');
  const unsoldCost = sumBy_(unsoldItems, 'cost');

  return {
    soldRevenue: soldRevenue,
    soldFee: soldFee,
    soldShipping: soldShipping,
    soldCost: soldCost,
    soldProfit: soldProfit,
    soldMargin: soldRevenue > 0 ? soldProfit / soldRevenue : 0,
    unsoldCost: unsoldCost,
    overallNet: soldProfit - unsoldCost,
    soldCount: soldItems.length,
    unsoldCount: unsoldItems.length
  };
}

function styleHeaderRow_(range) {
  range
    .setBackground('#20252b')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
}

function styleSummaryRow_(range, color) {
  range
    .setBackground(color)
    .setFontWeight('bold');
}

function styleSoldRow_(sheet, row, item) {
  const rowRange = sheet.getRange(row, 1, 1, VISIBLE_COLUMN_COUNT);
  rowRange.setFontWeight('normal');
  sheet.getRange(row, 3).setBackground('#ececec');
  applyCurrencyFormat_(sheet.getRange(row, 2, 1, 5));
  applyPercentFormat_(sheet.getRange(row, 7, 1, 1));

  if (item.margin !== null && item.margin >= 0.2) {
    rowRange.setBackground('#d9ead3');
    sheet.getRange(row, 3).setBackground('#cfd8cb');
  } else if (item.profit < 0 || (item.margin !== null && item.margin < 0)) {
    rowRange.setBackground('#f4cccc');
    sheet.getRange(row, 3).setBackground('#eab7b7');
  } else {
    rowRange.setBackground(null);
    sheet.getRange(row, 3).setBackground('#ececec');
  }
}

function styleUnsoldRow_(sheet, row) {
  const rowRange = sheet.getRange(row, 1, 1, VISIBLE_COLUMN_COUNT);
  rowRange
    .setBackground('#fff7e8')
    .setFontWeight('normal');
  applyCurrencyFormat_(sheet.getRange(row, 4, 1, 3));
}

function applyCurrencyFormat_(range) {
  // Skip sheet-side number formatting to avoid typed-column exceptions.
  return range;
}

function applyPercentFormat_(range) {
  // Skip sheet-side number formatting to avoid typed-column exceptions.
  return range;
}

function safeSetNumberFormat_(range, format) {
  try {
    range.setNumberFormat(format);
  } catch (error) {
    if (!/数値形式|number format/i.test(String(error))) {
      throw error;
    }
  }
}

function sumBy_(items, key) {
  return items.reduce(function(total, item) {
    return total + parseNumber_(item[key]);
  }, 0);
}

function normalizeStatus_(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'sold' || status === 'unsold' || status === 'summary') {
    return status;
  }
  return '';
}

function parseNumber_(value) {
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
  return isNaN(parsed) ? 0 : parsed;
}

function parseOptionalNumber_(value) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return '';
  }
  return parseNumber_(value);
}

function isRowCompletelyEmpty_(values) {
  return values.every(function(value) {
    return value === '' || value === null;
  });
}

function hasItemBody_(row) {
  return [1, 3, 4].some(function(index) {
    return row[index] !== '' && row[index] !== null;
  });
}

function isSummaryLabel_(value) {
  return /^【.+】$/.test(value);
}

function isUnsoldSectionLabel_(value) {
  return /未販売在庫/.test(String(value || ''));
}

function isApiDashboardRequest_(e) {
  return isApiRequest_(e);
}

function isApiRequest_(e) {
  if (!e || !e.parameter) {
    return false;
  }
  const api = String(e.parameter.api || '').trim().toLowerCase();
  const action = String(e.parameter.action || '').trim().toLowerCase();
  return Boolean(api || action);
}

function parseApiGetPayload_(e) {
  const p = (e && e.parameter) ? e.parameter : {};
  const action = String(p.action || p.api || 'dashboard').trim().toLowerCase();

  if (action === 'save') {
    let item = {};
    if (p.item) {
      try {
        item = JSON.parse(String(p.item));
      } catch (error) {
        throw new Error('Invalid item payload.');
      }
    } else {
      item = {
        id: p.id || '',
        status: p.status || '',
        name: p.name || '',
        revenue: p.revenue || '',
        shipping: p.shipping || '',
        cost: p.cost || ''
      };
    }
    return {
      action: 'save',
      item: item
    };
  }

  if (action === 'delete') {
    return {
      action: 'delete',
      itemId: String(p.itemId || p.id || '').trim()
    };
  }

  if (action === 'archive') {
    return { action: 'archive' };
  }

  if (action === 'dashboard') {
    return { action: 'dashboard' };
  }

  throw new Error('Unknown action: ' + action);
}

function parseApiPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  const raw = String(e.postData.contents || '');
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('Invalid JSON payload.');
  }
}

function jsonOutput_(data) {
  const callback = String(arguments[1] || '').trim();
  if (callback) {
    if (!/^[A-Za-z_$][0-9A-Za-z_$]{0,63}$/.test(callback)) {
      throw new Error('Invalid callback.');
    }
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(data) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function runApiAction_(payload) {
  const action = String(payload.action || '').trim().toLowerCase();

  if (action === 'dashboard') {
    return getDashboardData_();
  }

  if (action === 'save') {
    return saveItem(payload.item || payload.payload || payload);
  }

  if (action === 'delete') {
    const itemId = String(payload.itemId || payload.id || '').trim();
    if (!itemId) {
      throw new Error('itemId is required.');
    }
    return deleteItem(itemId);
  }

  if (action === 'archive') {
    return archiveMonthlyData();
  }

  throw new Error('Unknown action: ' + action);
}
