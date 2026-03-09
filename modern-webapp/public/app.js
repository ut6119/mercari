let currentData = null;
let draftStatus = 'unsold';
let pending = false;
let toastTimer = null;
const AUTO_SAVE_DELAY_MS = 420;
const autoSaveState = {};
const LOCAL_API_ORIGIN = 'http://localhost:3000';
const GAS_API_ENDPOINT = (window.APP_CONFIG && window.APP_CONFIG.gasEndpoint)
  || 'https://script.google.com/macros/s/AKfycbyHvifPGHWhlETNRYE1nzrXJQvSP0TgbF1_J7Txt7qfsZSakE77lzPjNh09TTB_m9SP/exec';
const USE_LOCAL_API = window.location.origin === LOCAL_API_ORIGIN;
const FIREBASE_OPTIONS = (window.APP_CONFIG && window.APP_CONFIG.firebase) || {};
const FIREBASE_COLLECTION = FIREBASE_OPTIONS.collection || 'mercari_items';
const FIREBASE_ARCHIVE_COLLECTION = FIREBASE_OPTIONS.archiveCollection || 'mercari_archives';
const DEFAULT_SHIPPING = 160;
const APP_TIMEZONE = 'Asia/Tokyo';

let backendMode = 'gas';
let firebaseDb = null;
let firebaseItemsCollection = null;
let firebaseItemsCache = [];

const soldProfitValue = document.getElementById('soldProfitValue');
const soldProfitNote = document.getElementById('soldProfitNote');
const unsoldCostValue = document.getElementById('unsoldCostValue');
const unsoldCostNote = document.getElementById('unsoldCostNote');
const overallNetValue = document.getElementById('overallNetValue');
const soldRevenueValue = document.getElementById('soldRevenueValue');
const lastUpdatedValue = document.getElementById('lastUpdatedValue');
const soldCountLabel = document.getElementById('soldCountLabel');
const unsoldCountLabel = document.getElementById('unsoldCountLabel');
const soldPanel = document.getElementById('soldPanel');
const unsoldPanel = document.getElementById('unsoldPanel');
const soldSelectedCount = document.getElementById('soldSelectedCount');
const unsoldSelectedCount = document.getElementById('unsoldSelectedCount');
const soldTableBody = document.getElementById('soldTableBody');
const unsoldTableBody = document.getElementById('unsoldTableBody');
const soldToolbar = document.getElementById('soldToolbar');
const unsoldToolbar = document.getElementById('unsoldToolbar');
const quickAddForm = document.getElementById('quickAddForm');
const revenueInput = document.getElementById('revenueInput');
const shippingInput = document.getElementById('shippingInput');
const refreshButton = document.getElementById('refreshButton');
const archiveButton = document.getElementById('archiveButton');
const addButton = document.getElementById('addButton');
const toast = document.getElementById('toast');
const selectionMode = {
  sold: false,
  unsold: false
};

init().catch(function(error) {
  showToast(error.message || '初期化に失敗しました。');
});

async function init() {
  await initializeBackend();
  bindEvents();
  document.querySelector('[data-status-tab="unsold"]').click();
  await reloadData('最新状態を読み込みました。');
}

async function initializeBackend() {
  if (USE_LOCAL_API) {
    backendMode = 'local';
    return;
  }

  if (!FIREBASE_OPTIONS.enabled) {
    backendMode = 'gas';
    return;
  }

  if (!window.firebase || !window.firebase.firestore) {
    backendMode = 'gas';
    showToast('Firebase SDKが未読み込みのためGASモードで動作します。');
    return;
  }

  const config = FIREBASE_OPTIONS.config || {};
  if (!config.projectId || !config.apiKey || !config.appId) {
    backendMode = 'gas';
    showToast('Firebase設定が不完全のためGASモードで動作します。');
    return;
  }

  const app = window.firebase.apps && window.firebase.apps.length
    ? window.firebase.app()
    : window.firebase.initializeApp(config);
  firebaseDb = window.firebase.firestore(app);
  firebaseItemsCollection = firebaseDb.collection(FIREBASE_COLLECTION);
  backendMode = 'firebase';
}

function bindEvents() {
  document.querySelectorAll('[data-status-tab]').forEach(function(button) {
    button.addEventListener('click', function() {
      draftStatus = button.dataset.statusTab;
      document.querySelectorAll('[data-status-tab]').forEach(function(tab) {
        tab.classList.toggle('active', tab === button);
      });
      if (!shippingInput.value) {
        shippingInput.value = '160';
      }
    });
  });

  refreshButton.addEventListener('click', function() {
    reloadData('最新状態を読み込みました。');
  });

  archiveButton.addEventListener('click', async function() {
    if (!window.confirm('前月をアーカイブして、販売済みだけを別シートへ移します。未販売在庫はこのシートに残します。')) {
      return;
    }
    await runApi(async function() {
      const data = await request('/api/archive', { method: 'POST' });
      render(data);
      showToast('前月アーカイブが完了しました。');
    });
  });

  quickAddForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    const payload = {
      status: draftStatus,
      name: quickAddForm.name.value.trim(),
      revenue: revenueInput.value,
      shipping: shippingInput.value,
      cost: quickAddForm.cost.value
    };
    await runApi(async function() {
      const data = await request('/api/items', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      quickAddForm.reset();
      shippingInput.value = '160';
      document.querySelector('[data-status-tab="unsold"]').click();
      render(data);
      showToast('商品を追加しました。');
    });
  });

  soldToolbar.addEventListener('click', function(event) {
    void handleBulkAction('sold', event);
  });
  unsoldToolbar.addEventListener('click', function(event) {
    void handleBulkAction('unsold', event);
  });
  soldTableBody.addEventListener('change', function(event) {
    if (event.target.matches('[data-select-row]')) {
      updateSelectedCount('sold');
    }
  });
  soldTableBody.addEventListener('input', function(event) {
    if (event.target.matches('[data-field]')) {
      const row = event.target.closest('tr[data-id]');
      updateRowPreview(row, 'sold');
      recalcSummaryFromDom();
      scheduleAutoSave(row, 'sold');
    }
  });
  unsoldTableBody.addEventListener('change', function(event) {
    if (event.target.matches('[data-select-row]')) {
      updateSelectedCount('unsold');
    }
  });
  unsoldTableBody.addEventListener('input', function(event) {
    if (event.target.matches('[data-field]')) {
      const row = event.target.closest('tr[data-id]');
      updateRowPreview(row, 'unsold');
      recalcSummaryFromDom();
      scheduleAutoSave(row, 'unsold');
    }
  });
}

function readRowPayload(row, status) {
  const shippingRaw = row.querySelector('[data-field="shipping"]').value;
  return {
    id: row.dataset.id,
    status: status,
    name: row.querySelector('[data-field="name"]').value.trim(),
    revenue: row.querySelector('[data-field="revenue"]').value,
    shipping: shippingRaw === '' ? String(DEFAULT_SHIPPING) : shippingRaw,
    cost: row.querySelector('[data-field="cost"]').value
  };
}

async function handleBulkAction(status, event) {
  const button = event.target.closest('button[data-bulk-action]');
  if (!button) return;

  const action = button.dataset.bulkAction;
  if (action === 'toggle-selection') {
    setSelectionMode(status, !selectionMode[status]);
    return;
  }
  if (action === 'toggle-select-all') {
    if (!selectionMode[status]) {
      setSelectionMode(status, true);
    }
    const totalRows = Array.from(getBodyByStatus(status).querySelectorAll('tr[data-id]')).length;
    const selectedCount = getSelectedRows(status).length;
    const nextChecked = totalRows > 0 && selectedCount < totalRows;
    setRowsSelected(status, nextChecked);
    return;
  }

  if (!selectionMode[status]) {
    setSelectionMode(status, true);
    showToast('行を選択してください。');
    return;
  }

  const selectedRows = getSelectedRows(status);
  if (!selectedRows.length) {
    showToast('先に行を選択してください。');
    return;
  }

  if (action === 'delete') {
    if (!window.confirm('選択した商品を削除しますか？')) return;
  }

  await runApi(async function() {
    let latestData = null;

    await flushAutoSavesForRows(selectedRows, status);
    const selectedIds = selectedRows.map(function(row) { return row.dataset.id; }).filter(Boolean);

    if (!USE_LOCAL_API && (action === 'delete' || action === 'to-sold' || action === 'to-unsold')) {
      if (action === 'to-sold') {
        const invalidRow = selectedRows.find(function(row) {
          return sanitizeAmount_(row.querySelector('[data-field="revenue"]').value) <= 0;
        });
        if (invalidRow) {
          throw new Error('販売済みに移動する行は売上を入力してください。');
        }
      }
      latestData = await request('/api/items/bulk', {
        method: 'POST',
        body: JSON.stringify(
          action === 'delete'
            ? { action: 'deleteMany', itemIds: selectedIds }
            : {
              action: 'moveMany',
              itemIds: selectedIds,
              targetStatus: action === 'to-sold' ? 'sold' : 'unsold'
            }
        )
      });
    } else {
      for (const row of selectedRows) {
        const id = row.dataset.id;

        if (action === 'delete') {
          latestData = await request('/api/items/' + encodeURIComponent(id), { method: 'DELETE' });
          continue;
        }

        let targetStatus = status;
        if (action === 'to-sold') targetStatus = 'sold';
        if (action === 'to-unsold') targetStatus = 'unsold';
        const payload = readRowPayload(row, targetStatus);

        latestData = await request('/api/items', {
          method: 'POST',
          body: JSON.stringify(payload)
        });
      }
    }

    render(latestData || await request('/api/dashboard'));
    setRowsSelected('sold', false);
    setRowsSelected('unsold', false);
    setSelectionMode('sold', false);
    setSelectionMode('unsold', false);

    if (action === 'to-sold') showToast('選択行を販売済みに移動しました。');
    if (action === 'to-unsold') showToast('選択行を未販売在庫へ移動しました。');
    if (action === 'delete') showToast('選択行を削除しました。');
  });
}

function getBodyByStatus(status) {
  return status === 'sold' ? soldTableBody : unsoldTableBody;
}

function getPanelByStatus(status) {
  return status === 'sold' ? soldPanel : unsoldPanel;
}

function getSelectedRows(status) {
  return Array.from(getBodyByStatus(status).querySelectorAll('tr[data-id]')).filter(function(row) {
    const checkbox = row.querySelector('[data-select-row]');
    return checkbox && checkbox.checked;
  });
}

function setRowsSelected(status, checked) {
  Array.from(getBodyByStatus(status).querySelectorAll('[data-select-row]')).forEach(function(checkbox) {
    checkbox.checked = checked;
  });
  updateSelectedCount(status);
  updateSelectAllButtonLabel(status);
}

function updateSelectedCount(status) {
  const count = getSelectedRows(status).length;
  const label = count + '件選択';
  if (status === 'sold' && soldSelectedCount) soldSelectedCount.textContent = label;
  if (status === 'unsold' && unsoldSelectedCount) unsoldSelectedCount.textContent = label;
}

function setSelectionMode(status, enabled) {
  selectionMode[status] = enabled;
  const panel = getPanelByStatus(status);
  if (panel) {
    panel.classList.toggle('selection-mode', enabled);
  }
  if (!enabled) {
    setRowsSelected(status, false);
  } else {
    updateSelectedCount(status);
    updateSelectAllButtonLabel(status);
  }
}

function updateSelectAllButtonLabel(status) {
  const panel = getPanelByStatus(status);
  if (!panel) return;
  const button = panel.querySelector('[data-bulk-action="toggle-select-all"]');
  if (!button) return;

  const totalRows = Array.from(getBodyByStatus(status).querySelectorAll('tr[data-id]')).length;
  const selectedCount = getSelectedRows(status).length;
  button.textContent = totalRows > 0 && selectedCount === totalRows ? '解除' : '全選択';
}

function scheduleAutoSave(row, status) {
  if (!row || !row.dataset.id) return;
  const rowId = row.dataset.id;
  const payload = readRowPayload(row, status);
  if (!autoSaveState[rowId]) {
    autoSaveState[rowId] = { timer: null, inFlight: false, queued: null };
  }
  const state = autoSaveState[rowId];
  state.queued = payload;
  if (state.timer) {
    clearTimeout(state.timer);
  }
  state.timer = setTimeout(function() {
    state.timer = null;
    void flushAutoSaveById(rowId);
  }, AUTO_SAVE_DELAY_MS);
}

async function flushAutoSavesForRows(rows, fallbackStatus) {
  for (const row of rows) {
    const rowId = row && row.dataset ? row.dataset.id : '';
    if (!rowId) continue;
    if (!autoSaveState[rowId]) {
      autoSaveState[rowId] = { timer: null, inFlight: false, queued: null };
    }
    const state = autoSaveState[rowId];
    state.queued = readRowPayload(row, fallbackStatus);
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    await flushAutoSaveById(rowId);
  }
}

async function flushAutoSaveById(rowId) {
  const state = autoSaveState[rowId];
  if (!state || !state.queued) return;
  if (state.inFlight) return;

  const payload = state.queued;
  state.queued = null;
  state.inFlight = true;
  try {
    const data = await request('/api/items', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    currentData = data;
    if (data && data.summary) {
      applySummary(data.summary, data.lastUpdated);
    }
  } catch (error) {
    showToast(error.message || '自動保存に失敗しました。');
  } finally {
    state.inFlight = false;
    if (state.queued) {
      void flushAutoSaveById(rowId);
    }
  }
}

async function reloadData(message) {
  await runApi(async function() {
    const data = await request('/api/dashboard');
    render(data);
    if (message) showToast(message);
  });
}

async function request(url, options) {
  if (backendMode === 'firebase') {
    return firebaseRequest(url, options);
  }

  if (backendMode === 'local') {
    const response = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    const data = await response.json().catch(function() { return {}; });
    if (!response.ok) {
      throw new Error(data.error || '通信に失敗しました。');
    }
    return data;
  }

  const params = convertRequestToGasParams_(url, options);
  const connector = GAS_API_ENDPOINT.indexOf('?') >= 0 ? '&' : '?';
  const targetUrl = GAS_API_ENDPOINT + connector + params.toString();

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store'
    });
    const data = await response.json().catch(function() { return {}; });
    if (!response.ok) {
      throw new Error(data.error || '通信に失敗しました。');
    }
    if (data && data.error) {
      throw new Error(data.error);
    }
    if (!data || typeof data !== 'object' || !data.summary) {
      throw new Error('不正なレスポンスです。');
    }
    return data;
  } catch (_error) {
    return jsonpRequest(params);
  }
}

function convertRequestToGasParams_(url, options) {
  const method = String((options && options.method) || 'GET').toUpperCase();
  const params = new URLSearchParams();

  if (url === '/api/dashboard' && method === 'GET') {
    params.set('api', 'dashboard');
  } else if (url === '/api/archive' && method === 'POST') {
    params.set('api', 'archive');
  } else if (url === '/api/items' && method === 'POST') {
    const item = options && options.body ? JSON.parse(options.body) : {};
    params.set('api', 'save');
    params.set('item', JSON.stringify(item));
  } else if (url.indexOf('/api/items/') === 0 && method === 'DELETE') {
    const itemId = decodeURIComponent(url.split('/').pop() || '');
    params.set('api', 'delete');
    params.set('itemId', itemId);
  } else if (url === '/api/items/bulk' && method === 'POST') {
    const payload = options && options.body ? JSON.parse(options.body) : {};
    params.set('api', 'bulk');
    if (payload.action === 'deleteMany') {
      params.set('op', 'delete');
      params.set('ids', Array.isArray(payload.itemIds) ? payload.itemIds.join(',') : '');
    } else if (payload.action === 'moveMany') {
      params.set('op', 'move');
      params.set('ids', Array.isArray(payload.itemIds) ? payload.itemIds.join(',') : '');
      params.set('targetStatus', String(payload.targetStatus || '').trim().toLowerCase());
    } else {
      throw new Error('未対応の一括処理です。');
    }
  } else {
    throw new Error('未対応のAPI呼び出しです。');
  }

  params.set('_ts', String(Date.now()));
  return params;
}

async function firebaseRequest(url, options) {
  if (!firebaseItemsCollection) {
    throw new Error('Firebase初期化に失敗しました。');
  }

  const method = String((options && options.method) || 'GET').toUpperCase();
  const body = options && options.body ? JSON.parse(options.body) : {};

  if (url === '/api/dashboard' && method === 'GET') {
    return firebaseLoadDashboard_();
  }
  if (url === '/api/items' && method === 'POST') {
    return firebaseSaveItem_(body);
  }
  if (url.indexOf('/api/items/') === 0 && method === 'DELETE') {
    const itemId = decodeURIComponent(url.split('/').pop() || '');
    return firebaseDeleteItems_([itemId]);
  }
  if (url === '/api/items/bulk' && method === 'POST') {
    if (body.action === 'deleteMany') {
      return firebaseDeleteItems_(body.itemIds || []);
    }
    if (body.action === 'moveMany') {
      return firebaseMoveItems_(body.itemIds || [], body.targetStatus);
    }
    throw new Error('未対応の一括処理です。');
  }
  if (url === '/api/archive' && method === 'POST') {
    return firebaseArchive_();
  }

  throw new Error('未対応のAPI呼び出しです。');
}

async function firebaseLoadDashboard_() {
  const snapshot = await firebaseItemsCollection.get();
  firebaseItemsCache = snapshot.docs.map(function(doc) {
    const data = doc.data() || {};
    return {
      id: doc.id,
      status: normalizeStatusValue_(data.status) || 'unsold',
      name: String(data.name || '').trim(),
      revenue: sanitizeAmount_(data.revenue),
      shipping: sanitizeAmount_(data.shipping, DEFAULT_SHIPPING),
      cost: sanitizeAmount_(data.cost)
    };
  });
  return buildDashboardDataFromItems_(firebaseItemsCache);
}

async function firebaseSaveItem_(payload) {
  const item = sanitizePayloadForStore_(payload);
  const now = Date.now();
  const id = String(item.id || firebaseItemsCollection.doc().id);
  const existing = firebaseItemsCache.find(function(candidate) {
    return candidate.id === id;
  });
  const stored = {
    id: id,
    status: item.status,
    name: item.name,
    revenue: item.revenue,
    shipping: item.shipping,
    cost: item.cost
  };

  await firebaseItemsCollection.doc(id).set({
    status: stored.status,
    name: stored.name,
    revenue: stored.revenue,
    shipping: stored.shipping,
    cost: stored.cost,
    createdAtMs: existing && existing.createdAtMs ? existing.createdAtMs : now,
    updatedAtMs: now
  }, { merge: true });

  if (existing) {
    Object.assign(existing, stored, { updatedAtMs: now });
  } else {
    firebaseItemsCache.push(Object.assign({}, stored, { createdAtMs: now, updatedAtMs: now }));
  }

  return buildDashboardDataFromItems_(firebaseItemsCache, now);
}

async function firebaseDeleteItems_(itemIds) {
  const ids = normalizeIds_(itemIds);
  if (!ids.length) {
    throw new Error('削除対象がありません。');
  }

  const batch = firebaseDb.batch();
  ids.forEach(function(id) {
    batch.delete(firebaseItemsCollection.doc(id));
  });
  await batch.commit();

  const idSet = new Set(ids);
  firebaseItemsCache = firebaseItemsCache.filter(function(item) {
    return !idSet.has(item.id);
  });
  return buildDashboardDataFromItems_(firebaseItemsCache);
}

async function firebaseMoveItems_(itemIds, targetStatus) {
  const ids = normalizeIds_(itemIds);
  const normalizedStatus = normalizeStatusValue_(targetStatus);
  if (!ids.length) {
    throw new Error('移動対象がありません。');
  }
  if (normalizedStatus !== 'sold' && normalizedStatus !== 'unsold') {
    throw new Error('移動先ステータスが不正です。');
  }

  const now = Date.now();
  const idSet = new Set(ids);
  const moving = firebaseItemsCache.filter(function(item) {
    return idSet.has(item.id);
  });

  if (!moving.length) {
    throw new Error('対象の商品が見つかりません。');
  }
  if (normalizedStatus === 'sold') {
    const invalid = moving.find(function(item) {
      return sanitizeAmount_(item.revenue) <= 0;
    });
    if (invalid) {
      throw new Error('販売済みに移動する行は売上を入力してください。');
    }
  }

  const batch = firebaseDb.batch();
  moving.forEach(function(item) {
    batch.set(firebaseItemsCollection.doc(item.id), {
      status: normalizedStatus,
      updatedAtMs: now
    }, { merge: true });
  });
  await batch.commit();

  firebaseItemsCache.forEach(function(item) {
    if (idSet.has(item.id)) {
      item.status = normalizedStatus;
      item.updatedAtMs = now;
    }
  });
  return buildDashboardDataFromItems_(firebaseItemsCache, now);
}

async function firebaseArchive_() {
  const soldItems = firebaseItemsCache.filter(function(item) {
    return item.status === 'sold';
  });
  if (!soldItems.length) {
    return buildDashboardDataFromItems_(firebaseItemsCache);
  }

  const month = getLastMonthLabel_();
  const archivedAt = Date.now();
  const batch = firebaseDb.batch();

  soldItems.forEach(function(item) {
    const archiveRef = firebaseDb
      .collection(FIREBASE_ARCHIVE_COLLECTION)
      .doc(month)
      .collection('items')
      .doc(item.id);
    batch.set(archiveRef, {
      status: item.status,
      name: item.name,
      revenue: item.revenue,
      shipping: item.shipping,
      cost: item.cost,
      archivedAtMs: archivedAt
    }, { merge: true });
    batch.delete(firebaseItemsCollection.doc(item.id));
  });

  await batch.commit();
  firebaseItemsCache = firebaseItemsCache.filter(function(item) {
    return item.status !== 'sold';
  });
  return buildDashboardDataFromItems_(firebaseItemsCache, archivedAt);
}

function buildDashboardDataFromItems_(rawItems, updatedAtMs) {
  const items = Array.isArray(rawItems) ? rawItems : [];
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
    lastUpdated: formatDateTime_(updatedAtMs || Date.now())
  };
}

function sanitizePayloadForStore_(payload) {
  const source = payload || {};
  const status = normalizeStatusValue_(source.status) || 'unsold';
  const revenue = sanitizeAmount_(source.revenue);
  const shipping = sanitizeAmount_(source.shipping, DEFAULT_SHIPPING);
  const cost = sanitizeAmount_(source.cost);
  const name = String(source.name || '').trim();

  if (!name) {
    throw new Error('商品名は必須です。');
  }
  if (status === 'sold' && revenue <= 0) {
    throw new Error('販売済みは売上を入力してください。');
  }

  return {
    id: String(source.id || ''),
    status: status,
    name: name,
    revenue: revenue,
    shipping: shipping,
    cost: cost
  };
}

function enrichItem_(item) {
  const revenue = sanitizeAmount_(item.revenue);
  const shipping = sanitizeAmount_(item.shipping, DEFAULT_SHIPPING);
  const cost = sanitizeAmount_(item.cost);
  const hasRevenue = revenue > 0;
  const fee = hasRevenue ? Math.floor(revenue * 0.1) : 0;
  const profit = hasRevenue ? revenue - fee - shipping - cost : -cost;
  const margin = hasRevenue ? profit / revenue : null;

  return {
    id: String(item.id || ''),
    status: normalizeStatusValue_(item.status) || 'unsold',
    name: String(item.name || ''),
    revenue: revenue,
    shipping: shipping,
    cost: cost,
    fee: fee,
    profit: profit,
    margin: margin
  };
}

function buildSummary_(soldItems, unsoldItems) {
  const soldRevenue = soldItems.reduce(function(total, item) { return total + item.revenue; }, 0);
  const soldFee = soldItems.reduce(function(total, item) { return total + item.fee; }, 0);
  const soldShipping = soldItems.reduce(function(total, item) { return total + item.shipping; }, 0);
  const soldCost = soldItems.reduce(function(total, item) { return total + item.cost; }, 0);
  const soldProfit = soldItems.reduce(function(total, item) { return total + item.profit; }, 0);
  const unsoldCost = unsoldItems.reduce(function(total, item) { return total + item.cost; }, 0);

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

function normalizeStatusValue_(value) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'sold' || status === 'unsold') {
    return status;
  }
  return '';
}

function normalizeIds_(value) {
  if (Array.isArray(value)) {
    return value.map(function(v) { return String(v || '').trim(); }).filter(Boolean);
  }
  return String(value || '')
    .split(',')
    .map(function(v) { return String(v || '').trim(); })
    .filter(Boolean);
}

function formatDateTime_(ms) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(new Date(ms)).replace(',', '');
}

function getLastMonthLabel_() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth();
  return year + '-' + String(month).padStart(2, '0');
}

function jsonpRequest(params) {
  return new Promise(function(resolve, reject) {
    const callbackName = 'mercariCb' + Date.now() + Math.floor(Math.random() * 100000);
    const timeoutId = setTimeout(function() {
      cleanup();
      reject(new Error('通信がタイムアウトしました。'));
    }, 15000);
    const script = document.createElement('script');
    const url = new URL(GAS_API_ENDPOINT);

    params.forEach(function(value, key) {
      url.searchParams.set(key, value);
    });
    url.searchParams.set('cb', callbackName);

    function cleanup() {
      clearTimeout(timeoutId);
      if (script.parentNode) script.parentNode.removeChild(script);
      try {
        delete window[callbackName];
      } catch (_error) {
        window[callbackName] = undefined;
      }
    }

    window[callbackName] = function(data) {
      cleanup();
      if (!data || typeof data !== 'object') {
        reject(new Error('不正なレスポンスです。'));
        return;
      }
      if (data.error) {
        reject(new Error(data.error));
        return;
      }
      resolve(data);
    };

    script.onerror = function() {
      cleanup();
      reject(new Error('通信に失敗しました。'));
    };

    script.src = url.toString();
    document.head.appendChild(script);
  });
}

async function runApi(fn) {
  if (pending) return;
  pending = true;
  togglePending(true);
  try {
    await fn();
  } catch (error) {
    showToast(error.message || '処理に失敗しました。');
  } finally {
    pending = false;
    togglePending(false);
  }
}

function togglePending(isPending) {
  const bulkButtons = Array.from(document.querySelectorAll('[data-bulk-action]'));
  [refreshButton, archiveButton, addButton].concat(bulkButtons).forEach(function(button) {
    button.disabled = isPending;
  });
}

function render(data) {
  currentData = data;
  const summary = data.summary;
  applySummary(summary, data.lastUpdated);

  soldTableBody.innerHTML = data.soldItems.length
    ? data.soldItems.map(renderSoldRow).join('')
    : '<tr class="table-empty"><td colspan="7">販売済み商品はまだありません。</td></tr>';

  unsoldTableBody.innerHTML = data.unsoldItems.length
    ? data.unsoldItems.map(renderUnsoldRow).join('')
    : '<tr class="table-empty"><td colspan="7">未販売在庫はまだありません。</td></tr>';

  setSelectionMode('sold', selectionMode.sold);
  setSelectionMode('unsold', selectionMode.unsold);
}

function renderSoldRow(item) {
  const rowClass = item.profit < 0 || item.margin < 0 ? 'row-sold-bad' : (item.margin >= 0.2 ? 'row-sold-good' : '');
  const rateClass = item.margin < 0 ? 'bad' : (item.margin >= 0.2 ? 'good' : 'neutral');
  return `
    <tr class="${rowClass}" data-id="${escapeHtml(item.id)}">
      <td class="selection-cell"><input data-select-row type="checkbox" aria-label="選択"></td>
      <td><input data-field="name" value="${escapeHtml(item.name)}"></td>
      <td><input data-field="revenue" type="number" min="0" step="1" value="${escapeHtml(String(item.revenue || ''))}"></td>
      <td><input data-field="shipping" type="number" min="0" step="1" value="${escapeHtml(String(item.shipping || 0))}"></td>
      <td><input data-field="cost" type="number" min="0" step="1" value="${escapeHtml(String(item.cost || 0))}"></td>
      <td class="money profit-cell">${formatSignedYen(item.profit)}</td>
      <td class="rate"><span class="pill rate-pill ${rateClass}">${formatPercent(item.margin)}</span></td>
    </tr>
  `;
}

function renderUnsoldRow(item) {
  const hasMargin = item.margin !== null && typeof item.margin !== 'undefined';
  const rowClass = hasMargin
    ? (item.margin < 0 ? 'row-sold-bad' : (item.margin >= 0.2 ? 'row-sold-good' : 'row-unsold'))
    : 'row-unsold';
  const rateClass = hasMargin
    ? (item.margin < 0 ? 'bad' : (item.margin >= 0.2 ? 'good' : 'neutral'))
    : 'neutral';
  return `
    <tr class="${rowClass}" data-id="${escapeHtml(item.id)}">
      <td class="selection-cell"><input data-select-row type="checkbox" aria-label="選択"></td>
      <td><input data-field="name" value="${escapeHtml(item.name)}"></td>
      <td><input data-field="revenue" type="number" min="0" step="1" placeholder="0" value="${escapeHtml(String(item.revenue || ''))}"></td>
      <td><input data-field="shipping" type="number" min="0" step="1" value="${escapeHtml(String((item.shipping === '' || item.shipping === null || typeof item.shipping === 'undefined') ? 160 : item.shipping))}"></td>
      <td><input data-field="cost" type="number" min="0" step="1" value="${escapeHtml(String(item.cost || 0))}"></td>
      <td class="money profit-cell">${formatSignedYen(item.profit)}</td>
      <td class="rate"><span class="pill rate-pill ${rateClass}">${formatPercent(item.margin)}</span></td>
    </tr>
  `;
}

function applySummary(summary, lastUpdated) {
  soldProfitValue.textContent = formatYen(summary.soldProfit);
  soldProfitNote.textContent = summary.soldCount + '件 / 利益率 ' + formatPercent(summary.soldMargin);
  unsoldCostValue.textContent = formatYen(summary.unsoldCost);
  unsoldCostNote.textContent = summary.unsoldCount + '件 / 現在の投資額';
  overallNetValue.textContent = formatSignedYen(summary.overallNet);
  overallNetValue.style.color = summary.overallNet < 0 ? '#9f3f3f' : '#1f6a52';
  soldRevenueValue.textContent = formatYen(summary.soldRevenue);
  soldCountLabel.textContent = summary.soldCount + '件';
  unsoldCountLabel.textContent = summary.unsoldCount + '件';
  if (lastUpdated) {
    lastUpdatedValue.textContent = '最終更新 ' + lastUpdated;
  }
}

function recalcSummaryFromDom() {
  const soldRows = Array.from(soldTableBody.querySelectorAll('tr[data-id]'));
  const unsoldRows = Array.from(unsoldTableBody.querySelectorAll('tr[data-id]'));
  let soldRevenue = 0;
  let soldFee = 0;
  let soldShipping = 0;
  let soldCost = 0;
  let soldProfit = 0;
  let unsoldCost = 0;

  soldRows.forEach(function(row) {
    const revenue = sanitizeAmount_(row.querySelector('[data-field="revenue"]').value);
    const shipping = sanitizeAmount_(row.querySelector('[data-field="shipping"]').value, 160);
    const cost = sanitizeAmount_(row.querySelector('[data-field="cost"]').value);
    const fee = Math.floor(revenue * 0.1);
    const profit = revenue - fee - shipping - cost;
    soldRevenue += revenue;
    soldFee += fee;
    soldShipping += shipping;
    soldCost += cost;
    soldProfit += profit;
  });

  unsoldRows.forEach(function(row) {
    const cost = sanitizeAmount_(row.querySelector('[data-field="cost"]').value);
    unsoldCost += cost;
  });

  applySummary({
    soldRevenue: soldRevenue,
    soldFee: soldFee,
    soldShipping: soldShipping,
    soldCost: soldCost,
    soldProfit: soldProfit,
    soldMargin: soldRevenue > 0 ? soldProfit / soldRevenue : 0,
    unsoldCost: unsoldCost,
    overallNet: soldProfit - unsoldCost,
    soldCount: soldRows.length,
    unsoldCount: unsoldRows.length
  });
}

function updateRowPreview(row, status) {
  if (!row) return;

  if (status === 'sold') {
    const revenue = sanitizeAmount_(row.querySelector('[data-field="revenue"]').value);
    const shipping = sanitizeAmount_(row.querySelector('[data-field="shipping"]').value, 160);
    const cost = sanitizeAmount_(row.querySelector('[data-field="cost"]').value);
    const fee = Math.floor(revenue * 0.1);
    const profit = revenue - fee - shipping - cost;
    const margin = revenue > 0 ? profit / revenue : null;
    const rateClass = margin !== null && margin >= 0.2 ? 'good' : (margin !== null && margin < 0 ? 'bad' : 'neutral');

    const profitCell = row.querySelector('.profit-cell');
    const ratePill = row.querySelector('.rate-pill');
    if (profitCell) profitCell.textContent = formatSignedYen(profit);
    if (ratePill) {
      ratePill.textContent = formatPercent(margin);
      ratePill.className = 'pill rate-pill ' + rateClass;
    }
    row.classList.remove('row-sold-good', 'row-sold-bad');
    if (margin !== null && margin >= 0.2) row.classList.add('row-sold-good');
    else if (profit < 0 || (margin !== null && margin < 0)) row.classList.add('row-sold-bad');
    return;
  }

  const cost = sanitizeAmount_(row.querySelector('[data-field="cost"]').value);
  const revenue = sanitizeAmount_(row.querySelector('[data-field="revenue"]').value);
  const shipping = sanitizeAmount_(row.querySelector('[data-field="shipping"]').value, 160);
  const hasRevenue = revenue > 0;
  const fee = hasRevenue ? Math.floor(revenue * 0.1) : 0;
  const profit = hasRevenue ? (revenue - fee - shipping - cost) : -cost;
  const margin = hasRevenue ? (profit / revenue) : null;
  const profitCell = row.querySelector('.profit-cell');
  const ratePill = row.querySelector('.rate-pill');
  if (profitCell) profitCell.textContent = formatSignedYen(profit);
  if (ratePill) {
    const rateClass = margin !== null && margin >= 0.2 ? 'good' : (margin !== null && margin < 0 ? 'bad' : 'neutral');
    ratePill.textContent = formatPercent(margin);
    ratePill.className = 'pill rate-pill ' + rateClass;
  }
  row.classList.remove('row-sold-good', 'row-sold-bad', 'row-unsold');
  if (margin !== null && margin >= 0.2) row.classList.add('row-sold-good');
  else if (margin !== null && margin < 0) row.classList.add('row-sold-bad');
  else row.classList.add('row-unsold');
}

function sanitizeAmount_(value, emptyDefault) {
  if (value === '' || value === null || typeof value === 'undefined') {
    return Number(emptyDefault || 0);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return Number(emptyDefault || 0);
  return n < 0 ? 0 : n;
}

function formatYen(value) {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0
  }).format(value || 0);
}

function formatSignedYen(value) {
  const number = Number(value || 0);
  return number < 0 ? '-' + formatYen(Math.abs(number)) : formatYen(number);
}

function formatPercent(value) {
  if (value === null || typeof value === 'undefined') return '--';
  return (Number(value) * 100).toFixed(1) + '%';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() {
    toast.classList.remove('show');
  }, 2600);
}
