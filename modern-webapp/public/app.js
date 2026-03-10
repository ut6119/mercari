let currentData = null;
let draftStatus = 'unsold';
let pending = false;
let toastTimer = null;
const AUTO_SAVE_DELAY_MS = 420;
const autoSaveState = {};
const LOCAL_API_ORIGIN = 'http://localhost:3000';
const GAS_API_ENDPOINT = (window.APP_CONFIG && window.APP_CONFIG.gasEndpoint)
  || 'https://script.google.com/macros/s/AKfycbyHvifPGHWhlETNRYE1nzrXJQvSP0TgbF1_J7Txt7qfsZSakE77lzPjNh09TTB_m9SP/exec';
const API_WRITE_TOKEN = (window.APP_CONFIG && window.APP_CONFIG.apiWriteToken)
  ? String(window.APP_CONFIG.apiWriteToken).trim()
  : '';
const REQUIRE_LOGIN = Boolean(window.APP_CONFIG && window.APP_CONFIG.requireLogin);
const USE_LOCAL_API = window.location.origin === LOCAL_API_ORIGIN;
const FIREBASE_OPTIONS = (window.APP_CONFIG && window.APP_CONFIG.firebase) || {};
const FIREBASE_COLLECTION = FIREBASE_OPTIONS.collection || 'mercari_items';
const FIREBASE_ARCHIVE_COLLECTION = FIREBASE_OPTIONS.archiveCollection || 'mercari_archives';
const FIREBASE_SDK_VERSION = '10.12.5';
const FIREBASE_APP_SDK_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-app-compat.js';
const FIREBASE_FIRESTORE_SDK_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-firestore-compat.js';
const FIREBASE_AUTH_SDK_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-auth-compat.js';
const FIREBASE_APPCHECK_SDK_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-app-check-compat.js';
const DEFAULT_SHIPPING = 160;
const APP_TIMEZONE = 'Asia/Tokyo';
const DASHBOARD_CACHE_KEY = 'mercari_dashboard_cache_v1';

let backendMode = 'gas';
let firebaseDb = null;
let firebaseItemsCollection = null;
let firebaseItemsCache = [];
let authFirebaseApp = null;
let firebaseAuth = null;
let signedInUser = null;
let signedInIdToken = '';
const monthlyState = {
  months: [],
  selectedMonth: ''
};

const soldProfitValue = document.getElementById('soldProfitValue');
const soldProfitNote = document.getElementById('soldProfitNote');
const unsoldCostValue = document.getElementById('unsoldCostValue');
const unsoldCostNote = document.getElementById('unsoldCostNote');
const overallNetValue = document.getElementById('overallNetValue');
const overallNetNote = document.getElementById('overallNetNote');
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
const viewTabs = Array.from(document.querySelectorAll('[data-view-tab]'));
const homeView = document.getElementById('homeView');
const monthlyView = document.getElementById('monthlyView');
const chartView = document.getElementById('chartView');
const monthlySwitch = document.getElementById('monthlySwitch');
const monthlySummaryGrid = document.getElementById('monthlySummaryGrid');
const monthlySoldBody = document.getElementById('monthlySoldBody');
const monthlyUnsoldBody = document.getElementById('monthlyUnsoldBody');
const monthlyChart = document.getElementById('monthlyChart');
const soldUndoButton = document.getElementById('soldUndoButton');
const soldRedoButton = document.getElementById('soldRedoButton');
const unsoldUndoButton = document.getElementById('unsoldUndoButton');
const unsoldRedoButton = document.getElementById('unsoldRedoButton');
const archiveButton = document.getElementById('archiveButton');
const addButton = document.getElementById('addButton');
const toast = document.getElementById('toast');
const heroMascot = document.getElementById('heroMascot');
const burstLayer = document.getElementById('burstLayer');
const authStatus = document.getElementById('authStatus');
const authLoginButton = document.getElementById('authLoginButton');
const authLogoutButton = document.getElementById('authLogoutButton');
const selectionMode = {
  sold: false,
  unsold: false
};
const pendingBottomByStatus = {
  sold: [],
  unsold: []
};
const historyPast = [];
const historyFuture = [];
const HISTORY_LIMIT = 40;

init().catch(function(error) {
  showToast(error.message || '初期化に失敗しました。');
});

async function init() {
  setupHeroMascot_();
  const cachedDashboard = loadCachedDashboard_();
  if (cachedDashboard) {
    render(cachedDashboard, { skipHistory: true });
  }
  await ensureFirebaseSdk_();
  await initializeAuth_();
  await initializeBackend();
  bindEvents();
  activateView_('home');
  document.querySelector('[data-status-tab="unsold"]').click();
  if (cachedDashboard) {
    void refreshDashboardInBackground_();
  } else {
    await reloadData('最新状態を読み込みました。');
  }
}

function setupHeroMascot_() {
  if (!heroMascot) return;
  const configuredUrl = window.APP_CONFIG && window.APP_CONFIG.heroGifUrl
    ? String(window.APP_CONFIG.heroGifUrl).trim()
    : '';
  if (!configuredUrl) {
    heroMascot.style.display = 'none';
    return;
  }
  heroMascot.src = configuredUrl;
  heroMascot.onerror = function() {
    heroMascot.style.display = 'none';
  };
}

async function ensureFirebaseSdk_() {
  const needsAuth = REQUIRE_LOGIN;
  const needsFirestore = Boolean(FIREBASE_OPTIONS.enabled);
  const needsAppCheck = Boolean(needsFirestore && FIREBASE_OPTIONS.appCheck && FIREBASE_OPTIONS.appCheck.enabled);
  if (!needsAuth && !needsFirestore && !needsAppCheck) {
    return;
  }
  if (window.firebase) {
    return;
  }
  await loadScriptOnce_(FIREBASE_APP_SDK_URL);
  if (needsFirestore) {
    await loadScriptOnce_(FIREBASE_FIRESTORE_SDK_URL);
  }
  if (needsAuth) {
    await loadScriptOnce_(FIREBASE_AUTH_SDK_URL);
  }
  if (needsAppCheck) {
    await loadScriptOnce_(FIREBASE_APPCHECK_SDK_URL);
  }
}

function loadScriptOnce_(src) {
  return new Promise(function(resolve, reject) {
    const existing = document.querySelector('script[src="' + src + '"]');
    if (existing) {
      if (existing.dataset && existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', function() { resolve(); }, { once: true });
      existing.addEventListener('error', function() { reject(new Error('SDK読み込み失敗: ' + src)); }, { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', function() {
      if (script.dataset) script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', function() {
      reject(new Error('SDK読み込み失敗: ' + src));
    }, { once: true });
    document.head.appendChild(script);
  });
}

function activateView_(viewName) {
  const target = String(viewName || '').trim().toLowerCase() || 'home';
  viewTabs.forEach(function(button) {
    button.classList.toggle('active', button.dataset.viewTab === target);
  });
  if (homeView) homeView.classList.toggle('active', target === 'home');
  if (monthlyView) monthlyView.classList.toggle('active', target === 'monthly');
  if (chartView) chartView.classList.toggle('active', target === 'chart');
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
    backendMode = 'firebase-required';
    showToast('Firebase SDKが未読み込みです。');
    return;
  }

  const config = FIREBASE_OPTIONS.config || {};
  if (!config.projectId || !config.apiKey || !config.appId || isPlaceholderValue_(config.apiKey)) {
    backendMode = 'firebase-required';
    showToast('Firebase設定が不完全です。');
    return;
  }

  const app = getOrCreateFirebaseApp_(config);
  if (!activateFirebaseAppCheck_(app, FIREBASE_OPTIONS.appCheck || {})) {
    backendMode = 'firebase-required';
    return;
  }
  firebaseDb = window.firebase.firestore(app);
  void enableFirestorePersistence_(firebaseDb);
  firebaseItemsCollection = firebaseDb.collection(FIREBASE_COLLECTION);
  backendMode = 'firebase';
}

async function enableFirestorePersistence_(db) {
  if (!db || typeof db.enablePersistence !== 'function') {
    return;
  }
  try {
    await db.enablePersistence({ synchronizeTabs: true });
  } catch (error) {
    // Persistence can fail on private browsing or when multiple tabs race.
    const code = error && error.code ? String(error.code) : '';
    if (code !== 'failed-precondition' && code !== 'unimplemented') {
      console.warn('Firestore persistence unavailable:', error);
    }
  }
}

function getOrCreateFirebaseApp_(config) {
  if (authFirebaseApp) return authFirebaseApp;
  authFirebaseApp = window.firebase.apps && window.firebase.apps.length
    ? window.firebase.app()
    : window.firebase.initializeApp(config);
  return authFirebaseApp;
}

async function initializeAuth_() {
  updateAuthUi_('認証: 未設定');
  if (!REQUIRE_LOGIN) {
    updateAuthUi_('認証: 任意');
    return;
  }
  if (!window.firebase || !window.firebase.auth) {
    updateAuthUi_('認証: 利用不可');
    return;
  }

  const config = FIREBASE_OPTIONS.config || {};
  if (!config.projectId || !config.apiKey || !config.appId || isPlaceholderValue_(config.apiKey)) {
    updateAuthUi_('認証: 未設定');
    return;
  }

  const app = getOrCreateFirebaseApp_(config);
  firebaseAuth = window.firebase.auth(app);
  firebaseAuth.onAuthStateChanged(function(user) {
    signedInUser = user || null;
    if (!user) {
      signedInIdToken = '';
      updateAuthUi_('認証: 未ログイン');
      return;
    }
    void user.getIdToken().then(function(token) {
      signedInIdToken = String(token || '');
      const email = String(user.email || '').trim();
      updateAuthUi_(email ? ('認証: ' + email) : '認証: ログイン済み');
    }).catch(function() {
      signedInIdToken = '';
      updateAuthUi_('認証: トークン失敗');
    });
  });
}

async function signInWithGoogle_() {
  if (!firebaseAuth) {
    throw new Error('ログイン設定が未完了です。');
  }
  const provider = new window.firebase.auth.GoogleAuthProvider();
  await firebaseAuth.signInWithPopup(provider);
}

async function signOut_() {
  if (!firebaseAuth) return;
  await firebaseAuth.signOut();
}

function updateAuthUi_(statusText) {
  if (!REQUIRE_LOGIN) {
    if (authStatus && authStatus.parentElement) {
      authStatus.parentElement.style.display = 'none';
    }
    return;
  }
  if (authStatus) {
    authStatus.textContent = statusText;
  }
  const signedIn = Boolean(signedInUser && signedInIdToken);
  if (authLoginButton) {
    authLoginButton.style.display = REQUIRE_LOGIN && !signedIn ? 'inline-flex' : 'none';
  }
  if (authLogoutButton) {
    authLogoutButton.style.display = signedIn ? 'inline-flex' : 'none';
  }
}

function isPlaceholderValue_(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return text.includes('replace_with') || text.includes('your_') || text.includes('xxxxx');
}

function activateFirebaseAppCheck_(app, options) {
  if (!options || options.enabled !== true) {
    return true;
  }
  if (!window.firebase || !window.firebase.appCheck) {
    showToast('Firebase App Check SDKが未読み込みです。');
    return false;
  }

  const siteKey = String(options.siteKey || '').trim();
  if (!siteKey || isPlaceholderValue_(siteKey)) {
    showToast('Firebase App CheckのsiteKey未設定です。');
    return false;
  }

  try {
    const debugToken = String(options.debugToken || '').trim();
    if (debugToken && window.location.hostname === 'localhost') {
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken === 'true' ? true : debugToken;
    }
    const appCheck = window.firebase.appCheck(app);
    appCheck.activate(siteKey, true);
    return true;
  } catch (error) {
    console.error(error);
    showToast('Firebase App Check初期化に失敗しました。');
    return false;
  }
}

function bindEvents() {
  if (authLoginButton) {
    authLoginButton.addEventListener('click', function() {
      void runApi(async function() {
        await signInWithGoogle_();
      });
    });
  }
  if (authLogoutButton) {
    authLogoutButton.addEventListener('click', function() {
      void runApi(async function() {
        await signOut_();
      });
    });
  }

  viewTabs.forEach(function(button) {
    button.addEventListener('click', function() {
      const target = String(button.dataset.viewTab || '').trim();
      if (!target) return;
      activateView_(target);
      if ((target === 'monthly' || target === 'chart') && monthlyState.months.length === 0) {
        void loadMonthlyData_();
      }
    });
  });

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

  [soldUndoButton, unsoldUndoButton].forEach(function(button) {
    if (!button) return;
    button.addEventListener('click', function() {
      void handleUndo();
    });
  });

  [soldRedoButton, unsoldRedoButton].forEach(function(button) {
    if (!button) return;
    button.addEventListener('click', function() {
      void handleRedo();
    });
  });

  archiveButton.addEventListener('click', async function() {
    if (!window.confirm('前月をアーカイブして、販売済みだけを別シートへ移します。未販売在庫はこのシートに残します。')) {
      return;
    }
    await runApi(async function() {
      const data = await request('/api/archive', { method: 'POST' });
      render(data);
      await loadMonthlyData_({ silent: true });
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
      const addedItemId = findAddedItemId_(currentData, data, payload.status, payload.name);
      if (addedItemId) {
        markItemsToBottom_(payload.status, [addedItemId]);
      }
      quickAddForm.reset();
      shippingInput.value = '160';
      document.querySelector('[data-status-tab="unsold"]').click();
      render(data);
      scrollToItemRowAndAnimate_(addedItemId, payload.status, 10, addButton);
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

  if (monthlySwitch) {
    monthlySwitch.addEventListener('click', function(event) {
      const button = event.target.closest('button[data-month]');
      if (!button) return;
      const month = String(button.dataset.month || '').trim();
      if (!month) return;
      monthlyState.selectedMonth = month;
      renderMonthlyViews_();
    });
  }
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

    if (action === 'to-sold') {
      markItemsToBottom_('sold', selectedIds);
    } else if (action === 'to-unsold') {
      markItemsToBottom_('unsold', selectedIds);
    }

    render(latestData || await request('/api/dashboard'));
    setRowsSelected('sold', false);
    setRowsSelected('unsold', false);
    setSelectionMode('sold', false);
    setSelectionMode('unsold', false);

    if (action === 'to-sold') {
      scrollToMovedRowsAndAnimate_(
        selectedIds,
        'sold',
        Math.min(18, Math.max(8, selectedIds.length + 4)),
        soldPanel
      );
      showToast('選択行を販売済みに移動しました。');
    }
    if (action === 'to-unsold') {
      scrollToMovedRowsAndAnimate_(
        selectedIds,
        'unsold',
        Math.min(18, Math.max(8, selectedIds.length + 4)),
        unsoldPanel
      );
      showToast('選択行を未販売在庫へ移動しました。');
    }
    if (action === 'delete') showToast('選択行を削除しました。');
  });
}

async function handleUndo() {
  if (!historyPast.length) {
    showToast('これ以上戻せません。');
    return;
  }

  await runApi(async function() {
    const snapshot = historyPast.pop();
    if (currentData) {
      historyFuture.push(createSnapshot_(currentData));
      trimHistory_(historyFuture);
    }
    await applySnapshot_(snapshot);
    showToast('戻しました。');
  });
}

async function handleRedo() {
  if (!historyFuture.length) {
    showToast('これ以上進めません。');
    return;
  }

  await runApi(async function() {
    const snapshot = historyFuture.pop();
    if (currentData) {
      historyPast.push(createSnapshot_(currentData));
      trimHistory_(historyPast);
    }
    await applySnapshot_(snapshot);
    showToast('進めました。');
  });
}

async function applySnapshot_(snapshot) {
  const targetItems = normalizeSnapshotItems_(snapshot && snapshot.items ? snapshot.items : []);
  const currentItems = extractItemsFromData_(currentData || { soldItems: [], unsoldItems: [] });
  const targetIds = new Set(targetItems.map(function(item) { return item.id; }));
  const deleteIds = currentItems
    .map(function(item) { return item.id; })
    .filter(function(id) { return !targetIds.has(id); });

  if (deleteIds.length > 0) {
    try {
      await request('/api/items/bulk', {
        method: 'POST',
        body: JSON.stringify({ action: 'deleteMany', itemIds: deleteIds })
      });
    } catch (_error) {
      for (const id of deleteIds) {
        await request('/api/items/' + encodeURIComponent(id), { method: 'DELETE' });
      }
    }
  }

  let latestData = null;
  for (const item of targetItems) {
    latestData = await request('/api/items', {
      method: 'POST',
      body: JSON.stringify(item)
    });
  }
  if (!latestData) {
    latestData = await request('/api/dashboard');
  }
  render(latestData, { skipHistory: true });
}

function createSnapshot_(data) {
  return {
    items: extractItemsFromData_(data)
  };
}

function extractItemsFromData_(data) {
  const soldItems = (data && data.soldItems ? data.soldItems : []).map(function(item) {
    return {
      id: item.id,
      status: 'sold',
      name: item.name || '',
      revenue: sanitizeAmount_(item.revenue),
      shipping: sanitizeAmount_(item.shipping, DEFAULT_SHIPPING),
      cost: sanitizeAmount_(item.cost)
    };
  });
  const unsoldItems = (data && data.unsoldItems ? data.unsoldItems : []).map(function(item) {
    return {
      id: item.id,
      status: 'unsold',
      name: item.name || '',
      revenue: sanitizeAmount_(item.revenue),
      shipping: sanitizeAmount_(item.shipping, DEFAULT_SHIPPING),
      cost: sanitizeAmount_(item.cost)
    };
  });
  return soldItems.concat(unsoldItems);
}

function normalizeSnapshotItems_(items) {
  return (Array.isArray(items) ? items : [])
    .map(function(item) {
      return {
        id: String(item.id || '').trim(),
        status: normalizeStatusValue_(item.status) || 'unsold',
        name: String(item.name || '').trim(),
        revenue: sanitizeAmount_(item.revenue),
        shipping: sanitizeAmount_(item.shipping, DEFAULT_SHIPPING),
        cost: sanitizeAmount_(item.cost)
      };
    })
    .filter(function(item) {
      return Boolean(item.id) && Boolean(item.name);
    });
}

function trimHistory_(stack) {
  while (stack.length > HISTORY_LIMIT) {
    stack.shift();
  }
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
    const toggleButton = panel.querySelector('[data-bulk-action="toggle-selection"]');
    if (toggleButton) {
      toggleButton.textContent = enabled ? '解除' : '選択';
    }
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
  button.textContent = '全選択';
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

async function refreshDashboardInBackground_() {
  try {
    const data = await request('/api/dashboard');
    const active = document.activeElement;
    const editingNow = Boolean(
      active &&
      (active.matches('[data-field]') || active.matches('#nameInput, #revenueInput, #costInput, #shippingInput'))
    );
    if (editingNow || pending) {
      return;
    }
    render(data, { skipHistory: true });
  } catch (_error) {
    // Keep showing cached data when background refresh fails.
  }
}

async function request(url, options) {
  const method = String((options && options.method) || 'GET').toUpperCase();
  if (backendMode === 'firebase-required') {
    throw new Error('Firebase接続に失敗しました。設定を確認してください。');
  }
  if (method !== 'GET' && REQUIRE_LOGIN && !signedInIdToken && backendMode !== 'local') {
    throw new Error('編集にはGoogleログインが必要です。');
  }

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

  if (method !== 'GET') {
    if (!REQUIRE_LOGIN && !API_WRITE_TOKEN && !signedInIdToken) {
      throw new Error('書き込みは停止中です。管理者がAPIトークンを設定してください。');
    }
  }

  const params = convertRequestToGasParams_(url, options);
  return requestFromGasParams_(params, { requireSummary: true });
}

async function loadMonthlyData_(options) {
  const opts = options || {};
  try {
    const data = backendMode === 'firebase'
      ? await firebaseLoadMonthly_()
      : await (async function() {
        const params = new URLSearchParams();
        params.set('api', 'monthly');
        params.set('_ts', String(Date.now()));
        return requestFromGasParams_(params, { requireSummary: false });
      })();
    const months = Array.isArray(data && data.months) ? data.months : [];
    monthlyState.months = months;
    if (!months.length) {
      monthlyState.selectedMonth = '';
    } else if (!months.some(function(entry) { return entry.month === monthlyState.selectedMonth; })) {
      monthlyState.selectedMonth = months[months.length - 1].month;
    }
    renderMonthlyViews_();
  } catch (error) {
    monthlyState.months = [];
    monthlyState.selectedMonth = '';
    renderMonthlyViews_();
    if (!opts.silent) {
      showToast(error.message || '月別データの取得に失敗しました。');
    }
  }
}

async function requestFromGasParams_(params, options) {
  const opts = options || {};
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
    if (!data || typeof data !== 'object') {
      throw new Error('不正なレスポンスです。');
    }
    if (opts.requireSummary && !data.summary) {
      throw new Error('不正なレスポンスです。');
    }
    return data;
  } catch (_error) {
    const data = await jsonpRequest(params);
    if (opts.requireSummary && (!data || !data.summary)) {
      throw new Error('不正なレスポンスです。');
    }
    return data;
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

  if (method !== 'GET' && API_WRITE_TOKEN) {
    params.set('token', API_WRITE_TOKEN);
  }
  if (method !== 'GET' && signedInIdToken) {
    params.set('idToken', signedInIdToken);
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

async function firebaseLoadMonthly_() {
  await firebaseLoadDashboard_();

  const monthMap = new Map();
  const archiveSnapshot = await firebaseDb.collection(FIREBASE_ARCHIVE_COLLECTION).get();
  for (const doc of archiveSnapshot.docs) {
    const month = String(doc.id || '').trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      continue;
    }
    const itemsSnapshot = await doc.ref.collection('items').get();
    const archiveItems = itemsSnapshot.docs.map(function(itemDoc) {
      const data = itemDoc.data() || {};
      return {
        id: itemDoc.id,
        status: normalizeStatusValue_(data.status) || 'sold',
        name: String(data.name || '').trim(),
        revenue: sanitizeAmount_(data.revenue),
        shipping: sanitizeAmount_(data.shipping, DEFAULT_SHIPPING),
        cost: sanitizeAmount_(data.cost)
      };
    });
    const soldItems = archiveItems
      .filter(function(item) { return item.status === 'sold'; })
      .map(enrichItem_);
    const unsoldItems = archiveItems
      .filter(function(item) { return item.status === 'unsold'; })
      .map(enrichItem_);
    monthMap.set(month, {
      month: month,
      summary: buildSummary_(soldItems, unsoldItems),
      soldItems: soldItems,
      unsoldItems: unsoldItems
    });
  }

  const currentMonth = getCurrentMonthLabel_();
  const currentSoldItems = firebaseItemsCache
    .filter(function(item) { return item.status === 'sold'; })
    .map(enrichItem_);
  const currentUnsoldItems = firebaseItemsCache
    .filter(function(item) { return item.status === 'unsold'; })
    .map(enrichItem_);
  const currentEntry = monthMap.get(currentMonth);
  if (currentEntry) {
    const mergedSold = currentEntry.soldItems.concat(currentSoldItems);
    const mergedUnsold = currentEntry.unsoldItems.concat(currentUnsoldItems);
    monthMap.set(currentMonth, {
      month: currentMonth,
      summary: buildSummary_(mergedSold, mergedUnsold),
      soldItems: mergedSold,
      unsoldItems: mergedUnsold
    });
  } else {
    monthMap.set(currentMonth, {
      month: currentMonth,
      summary: buildSummary_(currentSoldItems, currentUnsoldItems),
      soldItems: currentSoldItems,
      unsoldItems: currentUnsoldItems
    });
  }

  return {
    months: Array.from(monthMap.values()).sort(function(a, b) {
      return String(a.month || '').localeCompare(String(b.month || ''));
    }),
    generatedAt: formatDateTime_(Date.now())
  };
}

function getCurrentMonthLabel_() {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find(function(part) { return part.type === 'year'; });
  const month = parts.find(function(part) { return part.type === 'month'; });
  const y = year ? String(year.value) : '';
  const m = month ? String(month.value).padStart(2, '0') : '';
  if (!y || !m) {
    return getLastMonthLabel_();
  }
  return y + '-' + m;
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
  const unsoldRevenue = unsoldItems.reduce(function(total, item) { return total + item.revenue; }, 0);
  const unsoldProfit = unsoldItems.reduce(function(total, item) { return total + item.profit; }, 0);
  const unsoldCost = unsoldItems.reduce(function(total, item) { return total + item.cost; }, 0);
  const overallRevenue = soldRevenue + unsoldRevenue;

  return {
    soldRevenue: soldRevenue,
    soldFee: soldFee,
    soldShipping: soldShipping,
    soldCost: soldCost,
    soldProfit: soldProfit,
    soldMargin: soldRevenue > 0 ? soldProfit / soldRevenue : 0,
    unsoldRevenue: unsoldRevenue,
    unsoldProfit: unsoldProfit,
    unsoldMargin: unsoldRevenue > 0 ? unsoldProfit / unsoldRevenue : 0,
    unsoldCost: unsoldCost,
    overallNet: soldProfit + unsoldProfit,
    overallMargin: overallRevenue > 0 ? (soldProfit + unsoldProfit) / overallRevenue : 0,
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
  const monthButtons = Array.from(document.querySelectorAll('[data-month]'));
  [soldUndoButton, soldRedoButton, unsoldUndoButton, unsoldRedoButton, archiveButton, addButton]
    .concat(viewTabs, bulkButtons, monthButtons)
    .forEach(function(button) {
    if (!button) return;
    button.disabled = isPending;
  });
  if (!isPending) {
    updateHistoryButtons_();
  }
}

function updateHistoryButtons_() {
  [soldUndoButton, unsoldUndoButton].forEach(function(button) {
    if (button) button.disabled = pending || historyPast.length === 0;
  });
  [soldRedoButton, unsoldRedoButton].forEach(function(button) {
    if (button) button.disabled = pending || historyFuture.length === 0;
  });
}

function render(data, options) {
  const renderOptions = options || {};
  if (!renderOptions.skipHistory && currentData) {
    historyPast.push(createSnapshot_(currentData));
    trimHistory_(historyPast);
    historyFuture.length = 0;
  }

  currentData = data;
  const soldItems = reorderItemsForBottom_((data && data.soldItems) || [], 'sold');
  const unsoldItems = reorderItemsForBottom_((data && data.unsoldItems) || [], 'unsold');
  currentData.soldItems = soldItems;
  currentData.unsoldItems = unsoldItems;
  saveDashboardCache_(currentData);
  const summary = data.summary;
  applySummary(summary, data.lastUpdated);

  soldTableBody.innerHTML = soldItems.length
    ? soldItems.map(renderSoldRow).join('')
    : '<tr class="table-empty"><td colspan="7">販売済み商品はまだありません。</td></tr>';

  unsoldTableBody.innerHTML = unsoldItems.length
    ? unsoldItems.map(renderUnsoldRow).join('')
    : '<tr class="table-empty"><td colspan="7">未販売在庫はまだありません。</td></tr>';

  setSelectionMode('sold', selectionMode.sold);
  setSelectionMode('unsold', selectionMode.unsold);
  updateHistoryButtons_();
}

function loadCachedDashboard_() {
  try {
    const raw = localStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.summary) return null;
    if (!Array.isArray(parsed.soldItems) || !Array.isArray(parsed.unsoldItems)) return null;
    return parsed;
  } catch (_error) {
    return null;
  }
}

function saveDashboardCache_(data) {
  try {
    if (!data || typeof data !== 'object' || !data.summary) return;
    localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  } catch (_error) {
    // Ignore storage errors.
  }
}

function renderMonthlyViews_() {
  if (!monthlySwitch || !monthlySummaryGrid || !monthlySoldBody || !monthlyUnsoldBody || !monthlyChart) {
    return;
  }

  const months = monthlyState.months;
  if (!months.length) {
    monthlySwitch.innerHTML = '<span class="monthly-empty">月別シートがありません。</span>';
    monthlySummaryGrid.innerHTML = '';
    monthlySoldBody.innerHTML = '<tr class="table-empty"><td colspan="6">データがありません。</td></tr>';
    monthlyUnsoldBody.innerHTML = '<tr class="table-empty"><td colspan="6">データがありません。</td></tr>';
    monthlyChart.innerHTML = '<p class="monthly-empty">データがありません。</p>';
    return;
  }

  monthlySwitch.innerHTML = months.map(function(entry) {
    const month = String(entry.month || '');
    const active = month === monthlyState.selectedMonth;
    return '<button class="monthly-button' + (active ? ' active' : '') + '" type="button" data-month="' + escapeHtml(month) + '">' + escapeHtml(month) + '</button>';
  }).join('');

  const selected = months.find(function(entry) {
    return entry.month === monthlyState.selectedMonth;
  }) || months[0];

  const summary = selected.summary || {};
  monthlySummaryGrid.innerHTML = [
    ['販売済み利益', formatSignedYen(summary.soldProfit)],
    ['未販利益', formatSignedYen(summary.unsoldProfit)],
    ['合計収支', formatSignedYen(summary.overallNet)],
    ['売上合計', formatYen(summary.soldRevenue)]
  ].map(function(metric) {
    return '<div class="monthly-metric"><div class="monthly-metric-label">' + metric[0] + '</div><div class="monthly-metric-value">' + metric[1] + '</div></div>';
  }).join('');

  const soldItems = Array.isArray(selected.soldItems) ? selected.soldItems : [];
  const unsoldItems = Array.isArray(selected.unsoldItems) ? selected.unsoldItems : [];
  monthlySoldBody.innerHTML = soldItems.length
    ? soldItems.map(renderMonthlyRow_).join('')
    : '<tr class="table-empty"><td colspan="6">販売済みデータはありません。</td></tr>';
  monthlyUnsoldBody.innerHTML = unsoldItems.length
    ? unsoldItems.map(renderMonthlyRow_).join('')
    : '<tr class="table-empty"><td colspan="6">未販売在庫データはありません。</td></tr>';

  renderMonthlyChart_();
}

function renderMonthlyChart_() {
  if (!monthlyChart) return;
  const months = monthlyState.months;
  if (!months.length) {
    monthlyChart.innerHTML = '<p class="monthly-empty">データがありません。</p>';
    return;
  }

  const maxValue = months.reduce(function(max, entry) {
    const summary = entry.summary || {};
    return Math.max(max, sanitizeAmount_(summary.soldRevenue), Math.abs(Number(summary.soldProfit || 0)));
  }, 1);

  monthlyChart.innerHTML = months.map(function(entry) {
    const summary = entry.summary || {};
    const soldRevenue = sanitizeAmount_(summary.soldRevenue);
    const soldProfit = Number(summary.soldProfit || 0);
    const revenueWidth = Math.max(4, Math.round((soldRevenue / maxValue) * 100));
    const profitWidth = Math.max(4, Math.round((Math.abs(soldProfit) / maxValue) * 100));
    const profitClass = soldProfit < 0 ? 'chart-bar profit negative' : 'chart-bar profit';
    return ''
      + '<div class="chart-row">'
      + '  <div class="chart-label">' + escapeHtml(entry.month || '-') + '</div>'
      + '  <div class="chart-bars">'
      + '    <div class="chart-bar-track"><div class="chart-bar revenue" style="width:' + revenueWidth + '%;"></div></div>'
      + '    <div class="chart-bar-track"><div class="' + profitClass + '" style="width:' + profitWidth + '%;"></div></div>'
      + '  </div>'
      + '  <div class="chart-values">売上 ' + formatYen(soldRevenue) + ' / 利益 ' + formatSignedYen(soldProfit) + '</div>'
      + '</div>';
  }).join('');
}

function renderMonthlyRow_(item) {
  const margin = (item && typeof item.margin !== 'undefined') ? item.margin : null;
  const rateClass = margin < 0 ? 'bad' : (margin >= 0.2 ? 'good' : 'neutral');
  const revenue = sanitizeAmount_(item.revenue);
  const shipping = sanitizeAmount_(item.shipping, DEFAULT_SHIPPING);
  const cost = sanitizeAmount_(item.cost);
  const profit = Number(item.profit || 0);
  return ''
    + '<tr>'
    + '  <td>' + escapeHtml(item.name || '') + '</td>'
    + '  <td class="money">' + formatYen(revenue) + '</td>'
    + '  <td class="money">' + formatYen(shipping) + '</td>'
    + '  <td class="money">' + formatYen(cost) + '</td>'
    + '  <td class="money">' + formatSignedYen(profit) + '</td>'
    + '  <td class="rate"><span class="pill ' + rateClass + '">' + formatPercent(margin) + '</span></td>'
    + '</tr>';
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
  unsoldCostValue.textContent = formatYen(summary.unsoldProfit);
  unsoldCostNote.textContent = summary.unsoldCount + '件 / 利益率 ' + formatPercent(summary.unsoldMargin);
  overallNetValue.textContent = formatSignedYen(summary.overallNet);
  overallNetValue.style.color = summary.overallNet < 0 ? '#9f3f3f' : '#1f6a52';
  if (overallNetNote) {
    overallNetNote.textContent = '合計利益率 ' + formatPercent(summary.overallMargin);
  }
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
  let unsoldRevenue = 0;
  let unsoldProfit = 0;
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
    const revenue = sanitizeAmount_(row.querySelector('[data-field="revenue"]').value);
    const shipping = sanitizeAmount_(row.querySelector('[data-field="shipping"]').value, 160);
    const cost = sanitizeAmount_(row.querySelector('[data-field="cost"]').value);
    const hasRevenue = revenue > 0;
    const fee = hasRevenue ? Math.floor(revenue * 0.1) : 0;
    const profit = hasRevenue ? (revenue - fee - shipping - cost) : -cost;
    unsoldRevenue += revenue;
    unsoldProfit += profit;
    unsoldCost += cost;
  });
  const overallRevenue = soldRevenue + unsoldRevenue;

  applySummary({
    soldRevenue: soldRevenue,
    soldFee: soldFee,
    soldShipping: soldShipping,
    soldCost: soldCost,
    soldProfit: soldProfit,
    soldMargin: soldRevenue > 0 ? soldProfit / soldRevenue : 0,
    unsoldRevenue: unsoldRevenue,
    unsoldProfit: unsoldProfit,
    unsoldMargin: unsoldRevenue > 0 ? unsoldProfit / unsoldRevenue : 0,
    unsoldCost: unsoldCost,
    overallNet: soldProfit + unsoldProfit,
    overallMargin: overallRevenue > 0 ? (soldProfit + unsoldProfit) / overallRevenue : 0,
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

function playCategoryBurst_(status, intensity, anchorEl) {
  if (!burstLayer) return;
  if (burstLayer.childElementCount > 14) return;
  const gifUrl = resolveBurstGifUrl_();
  if (!gifUrl) return;

  const targetPanel = status === 'sold' ? soldPanel : unsoldPanel;
  const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;
  const rect = targetPanel ? targetPanel.getBoundingClientRect() : null;
  const anchorVisible = isRectVisibleInViewport_(anchorRect);
  const panelVisible = isRectVisibleInViewport_(rect);
  let centerX = window.innerWidth * 0.5;
  let centerY = Math.min(window.innerHeight * 0.34, 220);
  if (anchorVisible) {
    centerX = anchorRect.left + anchorRect.width * 0.5;
    centerY = anchorRect.top + anchorRect.height * 0.5;
  } else if (panelVisible) {
    centerX = rect.left + rect.width * 0.5;
    centerY = rect.top + Math.min(82, Math.max(42, rect.height * 0.2));
  }
  const count = Math.max(4, Math.min(10, Number(intensity) || 8));

  for (let i = 0; i < count; i += 1) {
    const angle = ((Math.PI * 2) / count) * i + ((Math.random() - 0.5) * 0.5);
    const distance = 72 + Math.random() * 120;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance + ((Math.random() - 0.5) * 26);
    const size = Math.round(18 + Math.random() * 52);
    const fromScale = (0.45 + Math.random() * 0.7).toFixed(2);
    const toScale = (0.12 + Math.random() * 0.34).toFixed(2);
    const fromRotate = Math.round((Math.random() * 90) - 45);
    const rotateDir = Math.random() < 0.5 ? -1 : 1;
    const toRotate = fromRotate + rotateDir * Math.round(120 + Math.random() * 220);

    const sprite = document.createElement('img');
    sprite.className = 'burst-gif';
    sprite.src = gifUrl;
    sprite.alt = '';
    sprite.decoding = 'async';
    sprite.loading = 'eager';
    sprite.style.left = centerX.toFixed(1) + 'px';
    sprite.style.top = centerY.toFixed(1) + 'px';
    sprite.style.setProperty('--size', size + 'px');
    sprite.style.setProperty('--dx', dx.toFixed(1) + 'px');
    sprite.style.setProperty('--dy', dy.toFixed(1) + 'px');
    sprite.style.setProperty('--from-scale', fromScale);
    sprite.style.setProperty('--to-scale', toScale);
    sprite.style.setProperty('--from-rotate', fromRotate + 'deg');
    sprite.style.setProperty('--to-rotate', toRotate + 'deg');
    sprite.style.animationDuration = Math.round(1150 + Math.random() * 520) + 'ms';
    sprite.style.animationDelay = Math.round(Math.random() * 120) + 'ms';
    sprite.addEventListener('animationend', function() {
      sprite.remove();
    }, { once: true });
    burstLayer.appendChild(sprite);
  }
}

function findAddedItemId_(beforeData, afterData, status, name) {
  const normalizedStatus = normalizeStatusValue_(status) || 'unsold';
  const beforeItems = getStatusItems_(beforeData, normalizedStatus);
  const afterItems = getStatusItems_(afterData, normalizedStatus);
  const beforeIds = new Set(beforeItems.map(function(item) { return String(item.id || ''); }));
  const added = afterItems.find(function(item) {
    const id = String(item && item.id || '');
    return id && !beforeIds.has(id);
  });
  if (added && added.id) {
    return String(added.id);
  }
  const normalizedName = String(name || '').trim();
  if (!normalizedName) return '';
  const sameName = afterItems.find(function(item) {
    return String(item && item.name || '').trim() === normalizedName;
  });
  return sameName && sameName.id ? String(sameName.id) : '';
}

function getStatusItems_(data, status) {
  if (!data || typeof data !== 'object') return [];
  if (status === 'sold') return Array.isArray(data.soldItems) ? data.soldItems : [];
  return Array.isArray(data.unsoldItems) ? data.unsoldItems : [];
}

function scrollToItemRowAndAnimate_(itemId, status, intensity, fallbackAnchorEl) {
  if (!itemId) {
    playCategoryBurst_(status, intensity, fallbackAnchorEl);
    return;
  }
  const row = findItemRowById_(itemId, status);
  if (!row) {
    playCategoryBurst_(status, intensity, fallbackAnchorEl);
    return;
  }

  row.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });

  row.classList.remove('row-focus-flash');
  void row.offsetWidth;
  row.classList.add('row-focus-flash');

  setTimeout(function() {
    playCategoryBurst_(status, intensity, row);
  }, 650);
}

function scrollToMovedRowsAndAnimate_(itemIds, status, intensity, fallbackAnchorEl) {
  const ids = Array.isArray(itemIds)
    ? itemIds.map(function(id) { return String(id || '').trim(); }).filter(Boolean)
    : [];
  if (!ids.length) {
    playCategoryBurst_(status, intensity, fallbackAnchorEl);
    return;
  }

  const targetRow = ids
    .map(function(id) { return findItemRowById_(id, status); })
    .find(Boolean);
  if (!targetRow) {
    playCategoryBurst_(status, intensity, fallbackAnchorEl);
    return;
  }

  targetRow.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
    inline: 'nearest'
  });

  targetRow.classList.remove('row-focus-flash');
  void targetRow.offsetWidth;
  targetRow.classList.add('row-focus-flash');

  setTimeout(function() {
    playCategoryBurst_(status, intensity, targetRow);
  }, 650);
}

function markItemsToBottom_(status, itemIds) {
  const normalizedStatus = normalizeStatusValue_(status);
  if (!normalizedStatus) return;
  const ids = Array.isArray(itemIds)
    ? itemIds.map(function(id) { return String(id || '').trim(); }).filter(Boolean)
    : [];
  if (!ids.length) return;
  const existing = pendingBottomByStatus[normalizedStatus] || [];
  const merged = existing.concat(ids);
  pendingBottomByStatus[normalizedStatus] = Array.from(new Set(merged));
}

function reorderItemsForBottom_(items, status) {
  const normalizedStatus = normalizeStatusValue_(status);
  const list = Array.isArray(items) ? items.slice() : [];
  if (!normalizedStatus) return list;
  const pendingIds = pendingBottomByStatus[normalizedStatus] || [];
  if (!pendingIds.length) return list;

  const pendingSet = new Set(pendingIds);
  const normal = [];
  const bottom = [];
  list.forEach(function(item) {
    const id = String(item && item.id || '').trim();
    if (id && pendingSet.has(id)) {
      bottom.push(item);
    } else {
      normal.push(item);
    }
  });
  pendingBottomByStatus[normalizedStatus] = [];
  return normal.concat(bottom);
}

function findItemRowById_(itemId, status) {
  const safeId = String(itemId || '').trim();
  if (!safeId) return null;
  const tbody = status === 'sold' ? soldTableBody : unsoldTableBody;
  if (!tbody) return null;
  return tbody.querySelector('tr[data-id="' + cssEscape_(safeId) + '"]');
}

function cssEscape_(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

function isRectVisibleInViewport_(rect) {
  if (!rect) return false;
  return rect.width > 0
    && rect.height > 0
    && rect.bottom > 0
    && rect.top < window.innerHeight
    && rect.right > 0
    && rect.left < window.innerWidth;
}

function resolveBurstGifUrl_() {
  const mascotSrc = heroMascot
    ? String(heroMascot.currentSrc || heroMascot.src || '').trim()
    : '';
  if (mascotSrc && heroMascot.style.display !== 'none') {
    return mascotSrc;
  }
  const configuredUrl = window.APP_CONFIG && window.APP_CONFIG.heroGifUrl
    ? String(window.APP_CONFIG.heroGifUrl).trim()
    : '';
  return configuredUrl || '';
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
