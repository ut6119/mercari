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
const FIREBASE_TRANSPORT_LEDGER_DOC = FIREBASE_OPTIONS.transportLedgerDoc || 'transport_ledger';
const FIREBASE_TRANSPORT_LEDGER_SUBCOLLECTION = FIREBASE_OPTIONS.transportLedgerSubcollection || 'items';
const FIREBASE_USER_MONTHS_SUBCOLLECTION = 'months';
const FIREBASE_USER_META_SUBCOLLECTION = 'meta';
const FIREBASE_USER_META_DOC = 'state';
const FIREBASE_USER_TRANSPORT_SUBCOLLECTION = FIREBASE_TRANSPORT_LEDGER_DOC + '_' + FIREBASE_TRANSPORT_LEDGER_SUBCOLLECTION;
const FIREBASE_LEGACY_OWNER_DOC = 'legacy_owner';
const FIREBASE_SDK_VERSION = '10.12.5';
const FIREBASE_APP_SDK_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-app-compat.js';
const FIREBASE_FIRESTORE_SDK_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-firestore-compat.js';
const FIREBASE_AUTH_SDK_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-auth-compat.js';
const FIREBASE_APPCHECK_SDK_URL = 'https://www.gstatic.com/firebasejs/' + FIREBASE_SDK_VERSION + '/firebase-app-check-compat.js';
const DEFAULT_SHIPPING = 160;
const APP_TIMEZONE = 'Asia/Tokyo';
const DASHBOARD_CACHE_KEY = 'mercari_dashboard_cache_v1';
const TRANSPORT_LEDGER_KEY = 'mercari_transport_ledger_v1';
const YEARLY_SUMMARY_YEAR = 2026;
const ENABLE_GIF_EFFECTS = false;
const ENABLE_CATEGORY_BURST_EFFECTS = true;
const ENABLE_ADD_BUTTON_PEEK = true;
const ADD_BUTTON_PEEK_MIN_MS = 1500;
const ADD_BUTTON_PEEK_MAX_MS = 6000;
const ADD_BUTTON_PEEK_ANIM_MIN_MS = 1300;
const ADD_BUTTON_PEEK_ANIM_MAX_MS = 2000;
const ARCHIVE_BUTTON_LABEL_ARCHIVE = '月別へアーカイブ';
const ARCHIVE_BUTTON_LABEL_CANCEL = 'アーカイブ取消';
const ARCHIVE_BUTTON_ACTION_ARCHIVE = 'archive';
const ARCHIVE_BUTTON_ACTION_CANCEL = 'cancel';
const FIREBASE_ARCHIVE_META_DOC = 'archive_meta';
const AUTH_REDIRECT_PENDING_KEY = 'mercari_auth_redirect_pending_v1';

let backendMode = 'gas';
let firebaseDb = null;
let firebaseItemsCollection = null;
let firebaseTransportLedgerCollection = null;
let firebaseArchiveMonthsCollection = null;
let firebaseArchiveMetaRef = null;
let firebaseActiveUserId = '';
let firebaseItemsCache = [];
let authFirebaseApp = null;
let firebaseAuth = null;
let signedInUser = null;
let signedInIdToken = '';
let authScopeSyncSeq = 0;
const legacyMigrationCheckedUserIds = new Set();
const monthlyState = {
  months: [],
  selectedMonth: '',
  loading: false
};
let monthlyLoadRequestId = 0;

const soldProfitValue = document.getElementById('soldProfitValue');
const soldTransportValue = document.getElementById('soldTransportValue');
const soldProfitNote = document.getElementById('soldProfitNote');
const unsoldCostValue = document.getElementById('unsoldCostValue');
const unsoldCostNote = document.getElementById('unsoldCostNote');
const overallNetValue = document.getElementById('overallNetValue');
const overallNetNote = document.getElementById('overallNetNote');
const yearlyOverallValue = document.getElementById('yearlyOverallValue');
const yearlyOverallNote = document.getElementById('yearlyOverallNote');
const soldCountLabel = document.getElementById('soldCountLabel');
const unsoldCountLabel = document.getElementById('unsoldCountLabel');
const soldPanel = document.getElementById('soldPanel');
const unsoldPanel = document.getElementById('unsoldPanel');
const transportLedgerPanel = document.getElementById('transportLedgerPanel');
const soldSelectedCount = document.getElementById('soldSelectedCount');
const unsoldSelectedCount = document.getElementById('unsoldSelectedCount');
const soldTableBody = document.getElementById('soldTableBody');
const unsoldTableBody = document.getElementById('unsoldTableBody');
const soldToolbar = document.getElementById('soldToolbar');
const unsoldToolbar = document.getElementById('unsoldToolbar');
const quickAddForm = document.getElementById('quickAddForm');
const quickAddModal = document.getElementById('quickAddModal');
const openQuickAddButton = document.getElementById('openQuickAddButton');
const closeQuickAddButton = document.getElementById('closeQuickAddButton');
const revenueInput = document.getElementById('revenueInput');
const shippingInput = document.getElementById('shippingInput');
const transportSwitch = document.getElementById('transportSwitch');
const transportInput = document.getElementById('transportInput');
const transportLedgerBody = document.getElementById('transportLedgerBody');
const transportCountLabel = document.getElementById('transportCountLabel');
const transportLedgerToolbar = document.getElementById('transportLedgerToolbar');
const transportSelectedCount = document.getElementById('transportSelectedCount');
const transportLedgerForm = document.getElementById('transportLedgerForm');
const transportPresetSwitch = document.getElementById('transportPresetSwitch');
const transportDateInput = document.getElementById('transportDateInput');
const transportAmountInput = document.getElementById('transportAmountInput');
const transportPlaceInput = document.getElementById('transportPlaceInput');
const transportAddButton = document.getElementById('transportAddButton');
const transportUndoButton = document.getElementById('transportUndoButton');
const transportRedoButton = document.getElementById('transportRedoButton');
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
const addPeekLayer = document.getElementById('addPeekLayer');
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
const TRANSPORT_PRESET_VALUES = {
  tennoji: 580,
  namba: 580,
  umeda: 680,
  other: null
};
const TRANSPORT_PRESET_LABELS = {
  tennoji: '天王寺',
  namba: '難波',
  umeda: '梅田',
  other: 'その他'
};
let selectedTransportPreset = '';
let selectedTransportLedgerPreset = '';
let transportLedger = loadTransportLedger_();
let transportSelectionMode = false;
const selectedTransportLedgerIds = new Set();
const transportHistoryPast = [];
const transportHistoryFuture = [];
const TRANSPORT_HISTORY_LIMIT = 40;
let transportLedgerSyncUnsubscribe = null;
let addButtonPeekTimer = null;
let addButtonPeekInitialized = false;
let archiveCancelEnabled = false;

init().catch(function(error) {
  showToast(error.message || '初期化に失敗しました。');
});

async function init() {
  setupHeroMascot_();
  const cachedDashboard = (FIREBASE_OPTIONS.enabled && REQUIRE_LOGIN) ? null : loadCachedDashboard_();
  if (cachedDashboard) {
    render(cachedDashboard, { skipHistory: true });
  }
  await ensureFirebaseSdk_();
  await initializeAuth_();
  await initializeBackend();
  bindEvents();
  setArchiveCancelState_(false);
  startAddButtonPeek_();
  setDefaultTransportDate_();
  applyTransportLedgerPreset_('');
  closeQuickAddModal_({ keepHomeView: true });
  activateView_('home');
  document.querySelector('[data-status-tab="unsold"]').click();
  if (backendMode === 'firebase') {
    await syncDataScopeForAuth_({ suppressToast: true });
  } else {
    await initializeTransportLedger_();
    renderTransportLedger_();
    if (cachedDashboard) {
      void refreshDashboardInBackground_();
    } else {
      await reloadData('最新状態を読み込みました。');
    }
    void loadMonthlyData_({ silent: true });
  }
}

function setupHeroMascot_() {
  if (!heroMascot) return;
  if (!ENABLE_GIF_EFFECTS) {
    heroMascot.style.display = 'none';
    return;
  }
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

function getFirebaseScopedUserId_() {
  const uid = signedInUser && signedInUser.uid ? String(signedInUser.uid).trim() : '';
  if (REQUIRE_LOGIN) {
    return uid;
  }
  return uid || 'public';
}

function hasFirebaseDataAccess_() {
  if (backendMode !== 'firebase') return true;
  return Boolean(firebaseItemsCollection && firebaseTransportLedgerCollection && firebaseArchiveMonthsCollection && firebaseArchiveMetaRef);
}

function getStorageScopeKey_() {
  if (FIREBASE_OPTIONS.enabled && REQUIRE_LOGIN) {
    const uid = signedInUser && signedInUser.uid ? String(signedInUser.uid).trim() : '';
    return 'firebase_' + (uid || 'signed_out');
  }
  return 'shared';
}

function getScopedStorageKey_(baseKey) {
  return baseKey + '_' + getStorageScopeKey_();
}

function resetMonthlyState_() {
  monthlyState.months = [];
  monthlyState.selectedMonth = '';
  monthlyState.loading = false;
  renderMonthlyViews_();
  applyYearlyOverallValue_();
}

function renderSignedOutState_() {
  historyPast.length = 0;
  historyFuture.length = 0;
  setArchiveCancelState_(false);
  currentData = buildDashboardDataFromItems_([], Date.now());
  render(currentData, { skipHistory: true });
  transportLedger = [];
  selectedTransportLedgerIds.clear();
  transportSelectionMode = false;
  renderTransportLedger_();
  resetMonthlyState_();
}

function refreshFirebaseCollectionsForCurrentUser_() {
  if (!firebaseDb) {
    firebaseItemsCollection = null;
    firebaseTransportLedgerCollection = null;
    firebaseArchiveMonthsCollection = null;
    firebaseArchiveMetaRef = null;
    firebaseActiveUserId = '';
    return;
  }
  const userId = getFirebaseScopedUserId_();
  if (!userId) {
    firebaseItemsCollection = null;
    firebaseTransportLedgerCollection = null;
    firebaseArchiveMonthsCollection = null;
    firebaseArchiveMetaRef = null;
    firebaseActiveUserId = '';
    return;
  }
  if (firebaseActiveUserId === userId && firebaseItemsCollection && firebaseArchiveMonthsCollection && firebaseTransportLedgerCollection && firebaseArchiveMetaRef) {
    return;
  }
  firebaseActiveUserId = userId;
  firebaseItemsCollection = firebaseDb
    .collection(FIREBASE_COLLECTION)
    .doc(userId)
    .collection('items');
  const userArchiveRoot = firebaseDb.collection(FIREBASE_ARCHIVE_COLLECTION).doc(userId);
  firebaseArchiveMonthsCollection = userArchiveRoot.collection(FIREBASE_USER_MONTHS_SUBCOLLECTION);
  firebaseArchiveMetaRef = userArchiveRoot
    .collection(FIREBASE_USER_META_SUBCOLLECTION)
    .doc(FIREBASE_USER_META_DOC);
  firebaseTransportLedgerCollection = userArchiveRoot.collection(FIREBASE_USER_TRANSPORT_SUBCOLLECTION);
}

async function runFirestoreMutations_(mutations) {
  const actions = Array.isArray(mutations) ? mutations : [];
  if (!actions.length || !firebaseDb) return;
  const MAX_BATCH = 400;
  let batch = firebaseDb.batch();
  let count = 0;

  for (const apply of actions) {
    if (typeof apply !== 'function') continue;
    apply(batch);
    count += 1;
    if (count >= MAX_BATCH) {
      await batch.commit();
      batch = firebaseDb.batch();
      count = 0;
    }
  }
  if (count > 0) {
    await batch.commit();
  }
}

function isLegacyItemDocData_(data) {
  if (!data || typeof data !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(data, 'status')
    || Object.prototype.hasOwnProperty.call(data, 'name')
    || Object.prototype.hasOwnProperty.call(data, 'revenue')
    || Object.prototype.hasOwnProperty.call(data, 'cost');
}

async function migrateLegacySharedDataIfNeeded_() {
  if (!firebaseDb || !firebaseItemsCollection || !firebaseArchiveMonthsCollection || !firebaseTransportLedgerCollection || !firebaseArchiveMetaRef) {
    return;
  }
  const userId = firebaseActiveUserId;
  if (!userId || userId === 'public') return;
  if (legacyMigrationCheckedUserIds.has(userId)) return;

  const alreadyHasUserData = await firebaseItemsCollection.limit(1).get();
  if (!alreadyHasUserData.empty) {
    legacyMigrationCheckedUserIds.add(userId);
    return;
  }

  const legacyOwnerRef = firebaseDb.collection(FIREBASE_ARCHIVE_COLLECTION).doc(FIREBASE_LEGACY_OWNER_DOC);
  const ownerId = await firebaseDb.runTransaction(async function(tx) {
    const snap = await tx.get(legacyOwnerRef);
    const currentOwner = snap.exists ? String((snap.data() || {}).ownerUid || '').trim() : '';
    if (currentOwner && currentOwner !== userId) {
      return currentOwner;
    }
    if (!currentOwner) {
      tx.set(legacyOwnerRef, {
        ownerUid: userId,
        updatedAtMs: Date.now()
      }, { merge: true });
    }
    return userId;
  });

  if (String(ownerId || '') !== userId) {
    legacyMigrationCheckedUserIds.add(userId);
    return;
  }

  let migrated = false;
  const legacyItemsSnapshot = await firebaseDb.collection(FIREBASE_COLLECTION).get();
  const legacyItemDocs = legacyItemsSnapshot.docs.filter(function(doc) {
    return isLegacyItemDocData_(doc.data());
  });
  if (legacyItemDocs.length > 0) {
    const itemMutations = [];
    legacyItemDocs.forEach(function(doc) {
      const data = doc.data() || {};
      itemMutations.push(function(batch) {
        batch.set(firebaseItemsCollection.doc(doc.id), data, { merge: true });
      });
      itemMutations.push(function(batch) {
        batch.delete(doc.ref);
      });
    });
    await runFirestoreMutations_(itemMutations);
    migrated = true;
  }

  const legacyTransportCollection = firebaseDb
    .collection(FIREBASE_ARCHIVE_COLLECTION)
    .doc(FIREBASE_TRANSPORT_LEDGER_DOC)
    .collection(FIREBASE_TRANSPORT_LEDGER_SUBCOLLECTION);
  const legacyTransportSnapshot = await legacyTransportCollection.get();
  if (!legacyTransportSnapshot.empty) {
    const transportMutations = [];
    legacyTransportSnapshot.docs.forEach(function(doc) {
      const data = doc.data() || {};
      transportMutations.push(function(batch) {
        batch.set(firebaseTransportLedgerCollection.doc(doc.id), data, { merge: true });
      });
      transportMutations.push(function(batch) {
        batch.delete(doc.ref);
      });
    });
    transportMutations.push(function(batch) {
      batch.delete(firebaseDb.collection(FIREBASE_ARCHIVE_COLLECTION).doc(FIREBASE_TRANSPORT_LEDGER_DOC));
    });
    await runFirestoreMutations_(transportMutations);
    migrated = true;
  }

  const legacyArchiveSnapshot = await firebaseDb.collection(FIREBASE_ARCHIVE_COLLECTION).get();
  const legacyMonthDocs = legacyArchiveSnapshot.docs.filter(function(doc) {
    return /^\d{4}-\d{2}$/.test(String(doc.id || '').trim());
  });
  for (const legacyMonthDoc of legacyMonthDocs) {
    const month = String(legacyMonthDoc.id || '').trim();
    const itemsSnapshot = await legacyMonthDoc.ref.collection('items').get();
    if (itemsSnapshot.empty) {
      continue;
    }
    const monthMutations = [];
    itemsSnapshot.docs.forEach(function(itemDoc) {
      const data = itemDoc.data() || {};
      monthMutations.push(function(batch) {
        batch.set(
          firebaseArchiveMonthsCollection.doc(month).collection('items').doc(itemDoc.id),
          data,
          { merge: true }
        );
      });
      monthMutations.push(function(batch) {
        batch.delete(itemDoc.ref);
      });
    });
    monthMutations.push(function(batch) {
      batch.delete(legacyMonthDoc.ref);
    });
    await runFirestoreMutations_(monthMutations);
    migrated = true;
  }

  const legacyArchiveMetaRef = firebaseDb.collection(FIREBASE_ARCHIVE_COLLECTION).doc(FIREBASE_ARCHIVE_META_DOC);
  const legacyArchiveMetaSnapshot = await legacyArchiveMetaRef.get();
  if (legacyArchiveMetaSnapshot.exists) {
    const metaData = legacyArchiveMetaSnapshot.data() || {};
    await runFirestoreMutations_([
      function(batch) {
        batch.set(firebaseArchiveMetaRef, metaData, { merge: true });
      },
      function(batch) {
        batch.delete(legacyArchiveMetaRef);
      }
    ]);
    migrated = true;
  }

  legacyMigrationCheckedUserIds.add(userId);
  if (migrated) {
    showToast('既存データをこのアカウントへ移行しました。');
  }
}

function stopTransportLedgerSync_() {
  if (!transportLedgerSyncUnsubscribe) return;
  transportLedgerSyncUnsubscribe();
  transportLedgerSyncUnsubscribe = null;
}

async function syncDataScopeForAuth_(options) {
  const opts = options || {};
  const seq = ++authScopeSyncSeq;
  if (backendMode !== 'firebase') return;

  stopTransportLedgerSync_();
  refreshFirebaseCollectionsForCurrentUser_();
  setArchiveCancelState_(false);
  transportLedger = loadTransportLedger_();
  selectedTransportLedgerIds.clear();
  transportSelectionMode = false;
  renderTransportLedger_();

  if (!hasFirebaseDataAccess_()) {
    renderSignedOutState_();
    return;
  }

  try {
    await migrateLegacySharedDataIfNeeded_();
    if (seq !== authScopeSyncSeq) return;
    await initializeTransportLedger_();
    if (seq !== authScopeSyncSeq) return;
    const data = await request('/api/dashboard');
    if (seq !== authScopeSyncSeq) return;
    historyPast.length = 0;
    historyFuture.length = 0;
    render(data, { skipHistory: true });
    await loadMonthlyData_({ silent: true });
  } catch (error) {
    if (seq !== authScopeSyncSeq) return;
    if (!opts.suppressToast) {
      showToast(error.message || 'データの読み込みに失敗しました。');
    }
  }
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
  backendMode = 'firebase';
  refreshFirebaseCollectionsForCurrentUser_();
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
  if (window.firebase && window.firebase.auth && window.firebase.auth.Auth && window.firebase.auth.Auth.Persistence) {
    try {
      await firebaseAuth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL);
    } catch (error) {
      console.warn('Auth persistence setup failed:', error);
    }
  }
  firebaseAuth.onAuthStateChanged(function(user) {
    void applyAuthUserState_(user, { syncScope: true });
  });

  const hadPendingRedirect = getAuthRedirectPending_();
  try {
    const redirectResult = await firebaseAuth.getRedirectResult();
    if (redirectResult && redirectResult.user) {
      clearAuthRedirectPending_();
      await applyAuthUserState_(redirectResult.user, { syncScope: true });
    } else if (hadPendingRedirect && !firebaseAuth.currentUser) {
      clearAuthRedirectPending_();
      showToast('ログイン結果を取得できませんでした。もう一度ログインしてください。');
    }
  } catch (error) {
    clearAuthRedirectPending_();
    const code = String(error && error.code ? error.code : '').trim();
    if (code !== 'auth/no-auth-event') {
      showToast(mapFirebaseAuthError_(error).message || 'ログインに失敗しました。');
    }
  }

  if (!signedInUser && firebaseAuth.currentUser) {
    clearAuthRedirectPending_();
    await applyAuthUserState_(firebaseAuth.currentUser, { syncScope: true });
  }

}

function setAuthRedirectPending_() {
  try {
    sessionStorage.setItem(AUTH_REDIRECT_PENDING_KEY, '1');
  } catch (_error) {}
}

function clearAuthRedirectPending_() {
  try {
    sessionStorage.removeItem(AUTH_REDIRECT_PENDING_KEY);
  } catch (_error) {}
}

function getAuthRedirectPending_() {
  try {
    return sessionStorage.getItem(AUTH_REDIRECT_PENDING_KEY) === '1';
  } catch (_error) {
    return false;
  }
}

function getAuthStatusLabel_(user) {
  const email = String(user && user.email ? user.email : '').trim();
  return email ? ('認証: ' + email) : '認証: ログイン済み';
}

async function applyAuthUserState_(user, options) {
  const opts = options || {};
  signedInUser = user || null;
  if (!user) {
    signedInIdToken = '';
    updateAuthUi_('認証: 未ログイン');
    if (opts.syncScope) {
      await syncDataScopeForAuth_({ suppressToast: true });
    }
    return;
  }

  const userUid = String(user.uid || '');
  updateAuthUi_(getAuthStatusLabel_(user));
  if (opts.syncScope) {
    await syncDataScopeForAuth_({ suppressToast: true });
  }

  try {
    const token = await user.getIdToken();
    if (!signedInUser || String(signedInUser.uid || '') !== userUid) return;
    signedInIdToken = String(token || '');
    updateAuthUi_(getAuthStatusLabel_(user));
  } catch (error) {
    if (!signedInUser || String(signedInUser.uid || '') !== userUid) return;
    signedInIdToken = '';
    console.warn('Failed to fetch auth token:', error);
    updateAuthUi_(getAuthStatusLabel_(user));
  }
}

async function signInWithGoogle_() {
  if (!firebaseAuth) {
    throw new Error('ログイン設定が未完了です。');
  }
  const provider = new window.firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const useRedirect = shouldUseRedirectLogin_();

  if (useRedirect) {
    showToast('ログイン画面へ移動します...');
    setAuthRedirectPending_();
    await firebaseAuth.signInWithRedirect(provider);
    return;
  }

  try {
    const result = await firebaseAuth.signInWithPopup(provider);
    if (result && result.user) {
      await applyAuthUserState_(result.user, { syncScope: true });
    }
  } catch (error) {
    const code = String(error && error.code ? error.code : '').trim();
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      showToast('ポップアップを開けないため、ログイン画面へ移動します...');
      setAuthRedirectPending_();
      await firebaseAuth.signInWithRedirect(provider);
      return;
    }
    throw mapFirebaseAuthError_(error);
  }
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
  const signedIn = Boolean(signedInUser);
  if (authLoginButton) {
    authLoginButton.style.display = REQUIRE_LOGIN && !signedIn ? 'inline-flex' : 'none';
  }
  if (authLogoutButton) {
    authLogoutButton.style.display = signedIn ? 'inline-flex' : 'none';
  }
}

function shouldUseRedirectLogin_() {
  return false;
}

function mapFirebaseAuthError_(error) {
  const code = String(error && error.code ? error.code : '').trim();
  if (code === 'auth/unauthorized-domain') {
    return new Error('このURLはFirebase Authで未許可です。Firebaseの承認済みドメインに追加してください。');
  }
  if (code === 'auth/configuration-not-found') {
    return new Error('Firebase AuthのGoogleログイン設定が未完了です。');
  }
  if (code === 'auth/popup-closed-by-user') {
    return new Error('ログイン画面が閉じられました。');
  }
  if (code === 'auth/cancelled-popup-request') {
    return new Error('ログイン処理がキャンセルされました。');
  }
  if (code === 'auth/network-request-failed') {
    return new Error('通信エラーでログインできませんでした。');
  }
  return error instanceof Error ? error : new Error('ログインに失敗しました。');
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
        void loadMonthlyData_({ silent: true });
      }
    });
  });

  if (openQuickAddButton) {
    openQuickAddButton.addEventListener('click', function() {
      openQuickAddModal_();
    });
  }
  if (closeQuickAddButton) {
    closeQuickAddButton.addEventListener('click', function() {
      closeQuickAddModal_();
    });
  }
  if (quickAddModal) {
    quickAddModal.addEventListener('click', function(event) {
      if (event.target === quickAddModal) {
        closeQuickAddModal_();
      }
    });
  }
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && quickAddModal && quickAddModal.classList.contains('open')) {
      closeQuickAddModal_();
    }
  });

  if (transportSwitch) {
    transportSwitch.addEventListener('click', function(event) {
      const button = event.target.closest('button[data-transport-preset]');
      if (!button) return;
      const preset = String(button.dataset.transportPreset || '').trim();
      const keepCustom = preset === 'other' && selectedTransportPreset === 'other';
      applyTransportPreset_(preset, { keepCustom: keepCustom });
      if (preset === 'other' && transportInput) {
        transportInput.focus();
      }
    });
  }
  if (transportPresetSwitch) {
    transportPresetSwitch.addEventListener('click', function(event) {
      const button = event.target.closest('button[data-transport-ledger-preset]');
      if (!button) return;
      const preset = String(button.dataset.transportLedgerPreset || '').trim();
      applyTransportLedgerPreset_(preset);
      if (preset === 'other' && transportAmountInput) {
        transportAmountInput.focus();
      }
    });
  }
  applyTransportPreset_(selectedTransportPreset);

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
    if (getArchiveButtonAction_() === ARCHIVE_BUTTON_ACTION_CANCEL && archiveCancelEnabled) {
      if (!window.confirm('直前の月別アーカイブを取り消して、販売済みデータをホームへ戻します。')) {
        return;
      }
      await runApi(async function() {
        const data = await request('/api/archive/cancel', { method: 'POST' });
        render(data);
        await loadMonthlyData_({ silent: true });
        setArchiveCancelState_(false);
        showToast('月別アーカイブを取り消しました。');
      });
      return;
    }

    if (!window.confirm('月別へアーカイブして、販売済みだけを今日時点の前月データとして別シートへ移します。未販売在庫はこのシートに残します。')) {
      return;
    }
    await runApi(async function() {
      const data = await request('/api/archive', { method: 'POST' });
      render(data);
      await loadMonthlyData_({ silent: true });
      setArchiveCancelState_(true);
      showToast('月別アーカイブが完了しました。');
    });
  });

  quickAddForm.addEventListener('submit', async function(event) {
    event.preventDefault();
    const payload = {
      status: draftStatus,
      name: quickAddForm.name.value.trim(),
      revenue: revenueInput.value,
      shipping: shippingInput.value,
      cost: quickAddForm.cost.value,
      transport: '0'
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
      setArchiveCancelState_(false);
      quickAddForm.reset();
      shippingInput.value = '160';
      document.querySelector('[data-status-tab="unsold"]').click();
      render(data);
      closeQuickAddModal_();
      const targetItemId = addedItemId || findBottomItemIdByStatus_(payload.status);
      setTimeout(function() {
        scrollToItemRowAndAnimate_(
          targetItemId,
          payload.status,
          10,
          openQuickAddButton || addButton,
          { burst: false, namePeek: true }
        );
      }, 80);
      showToast('商品を追加しました。');
    });
  });

  if (transportLedgerForm) {
    transportLedgerForm.addEventListener('submit', function(event) {
      event.preventDefault();
      void runApi(async function() {
        const amount = sanitizeAmount_(transportAmountInput ? transportAmountInput.value : 0);
        const place = transportPlaceInput ? String(transportPlaceInput.value || '').trim() : '';
        const date = transportDateInput && transportDateInput.value
          ? String(transportDateInput.value)
          : getTodayDateInput_();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          throw new Error('交通費の日付が不正です。');
        }
        if (amount <= 0) {
          throw new Error('交通費の金額を入力してください。');
        }
        if (!place) {
          throw new Error('交通費の場所を入力してください。');
        }
        pushTransportHistory_();
        transportLedger.push({
          id: createTransportLedgerId_(),
          date: date,
          amount: amount,
          place: place
        });
        transportHistoryFuture.length = 0;
        await persistTransportLedger_();
        renderTransportLedger_();
        transportLedgerForm.reset();
        applyTransportLedgerPreset_('');
        setDefaultTransportDate_();
        if (currentData && currentData.summary) {
          applySummary(currentData.summary, currentData.lastUpdated);
        }
        showToast('交通費を追加しました。');
      });
    });
  }
  if (transportLedgerToolbar) {
    transportLedgerToolbar.addEventListener('click', function(event) {
      const button = event.target.closest('button[data-transport-action]');
      if (!button) return;
      const action = String(button.dataset.transportAction || '').trim();
      void handleTransportLedgerAction_(action);
    });
  }
  if (transportLedgerBody) {
    transportLedgerBody.addEventListener('change', function(event) {
      const checkbox = event.target.closest('[data-select-transport]');
      if (!checkbox) return;
      const row = checkbox.closest('tr[data-id]');
      const id = row ? String(row.dataset.id || '').trim() : '';
      if (!id) return;
      if (checkbox.checked) {
        selectedTransportLedgerIds.add(id);
      } else {
        selectedTransportLedgerIds.delete(id);
      }
      updateTransportSelectedCount_();
    });
  }
  if (transportUndoButton) {
    transportUndoButton.addEventListener('click', function() {
      void handleTransportUndo_();
    });
  }
  if (transportRedoButton) {
    transportRedoButton.addEventListener('click', function() {
      void handleTransportRedo_();
    });
  }

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
  const transportRaw = row.dataset.transport || '0';
  return {
    id: row.dataset.id,
    status: status,
    name: row.querySelector('[data-field="name"]').value.trim(),
    revenue: row.querySelector('[data-field="revenue"]').value,
    shipping: shippingRaw === '' ? String(DEFAULT_SHIPPING) : shippingRaw,
    cost: row.querySelector('[data-field="cost"]').value,
    transport: transportRaw
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

function trimTransportHistory_(stack) {
  while (stack.length > TRANSPORT_HISTORY_LIMIT) {
    stack.shift();
  }
}

function createTransportLedgerSnapshot_() {
  return transportLedger.map(function(entry) {
    return {
      id: String(entry.id || ''),
      date: String(entry.date || ''),
      amount: sanitizeAmount_(entry.amount),
      place: String(entry.place || '')
    };
  });
}

function pushTransportHistory_() {
  transportHistoryPast.push(createTransportLedgerSnapshot_());
  trimTransportHistory_(transportHistoryPast);
}

function updateTransportCountLabel_() {
  if (!transportCountLabel) return;
  transportCountLabel.textContent = transportLedger.length + '件';
}

function updateTransportSelectedCount_() {
  if (!transportSelectedCount) return;
  transportSelectedCount.textContent = selectedTransportLedgerIds.size + '件選択';
}

function updateTransportHistoryButtons_() {
  if (transportUndoButton) {
    transportUndoButton.disabled = pending || transportHistoryPast.length === 0;
  }
  if (transportRedoButton) {
    transportRedoButton.disabled = pending || transportHistoryFuture.length === 0;
  }
}

function setTransportSelectionMode_(enabled) {
  transportSelectionMode = Boolean(enabled);
  if (!transportSelectionMode) {
    selectedTransportLedgerIds.clear();
  }
  if (transportLedgerPanel) {
    transportLedgerPanel.classList.toggle('selection-mode', transportSelectionMode);
  }
  if (transportLedgerToolbar) {
    const toggleButton = transportLedgerToolbar.querySelector('[data-transport-action="toggle-selection"]');
    if (toggleButton) {
      toggleButton.textContent = transportSelectionMode ? '解除' : '選択';
    }
  }
  renderTransportLedger_();
}

function setAllTransportRowsSelected_(checked) {
  if (!checked) {
    selectedTransportLedgerIds.clear();
    renderTransportLedger_();
    return;
  }
  selectedTransportLedgerIds.clear();
  transportLedger.forEach(function(entry) {
    selectedTransportLedgerIds.add(String(entry.id || '').trim());
  });
  renderTransportLedger_();
}

async function handleTransportLedgerAction_(action) {
  if (action === 'toggle-selection') {
    setTransportSelectionMode_(!transportSelectionMode);
    return;
  }

  if (action === 'toggle-select-all') {
    if (!transportSelectionMode) {
      setTransportSelectionMode_(true);
    }
    const shouldSelectAll = transportLedger.length > 0 && selectedTransportLedgerIds.size < transportLedger.length;
    setAllTransportRowsSelected_(shouldSelectAll);
    return;
  }

  if (action === 'delete') {
    if (!transportSelectionMode) {
      setTransportSelectionMode_(true);
      showToast('行を選択してください。');
      return;
    }
    const selectedIds = Array.from(selectedTransportLedgerIds);
    if (!selectedIds.length) {
      showToast('先に行を選択してください。');
      return;
    }
    if (!window.confirm('選択した交通費を削除しますか？')) return;

    await runApi(async function() {
      pushTransportHistory_();
      transportHistoryFuture.length = 0;
      const idSet = new Set(selectedIds);
      transportLedger = transportLedger.filter(function(entry) {
        return !idSet.has(String(entry.id || '').trim());
      });
      await persistTransportLedger_();
      setTransportSelectionMode_(false);
      if (currentData && currentData.summary) {
        applySummary(currentData.summary, currentData.lastUpdated);
      }
      showToast('交通費を削除しました。');
    });
  }
}

async function handleTransportUndo_() {
  if (!transportHistoryPast.length) {
    showToast('これ以上戻せません。');
    return;
  }
  await runApi(async function() {
    transportHistoryFuture.push(createTransportLedgerSnapshot_());
    trimTransportHistory_(transportHistoryFuture);
    const snapshot = transportHistoryPast.pop();
    transportLedger = (Array.isArray(snapshot) ? snapshot : [])
      .map(normalizeTransportLedgerEntry_)
      .filter(Boolean);
    await persistTransportLedger_();
    setTransportSelectionMode_(false);
    if (currentData && currentData.summary) {
      applySummary(currentData.summary, currentData.lastUpdated);
    }
    showToast('戻しました。');
  });
}

async function handleTransportRedo_() {
  if (!transportHistoryFuture.length) {
    showToast('これ以上進めません。');
    return;
  }
  await runApi(async function() {
    transportHistoryPast.push(createTransportLedgerSnapshot_());
    trimTransportHistory_(transportHistoryPast);
    const snapshot = transportHistoryFuture.pop();
    transportLedger = (Array.isArray(snapshot) ? snapshot : [])
      .map(normalizeTransportLedgerEntry_)
      .filter(Boolean);
    await persistTransportLedger_();
    setTransportSelectionMode_(false);
    if (currentData && currentData.summary) {
      applySummary(currentData.summary, currentData.lastUpdated);
    }
    showToast('進めました。');
  });
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
      (active.matches('[data-field]') || active.matches('#nameInput, #revenueInput, #costInput, #shippingInput, #transportInput'))
    );
    if (editingNow || pending) {
      return;
    }
    render(data, { skipHistory: true });
  } catch (_error) {
    // Keep showing cached data when background refresh fails.
  }
}

function applyTransportPreset_(preset, options) {
  const opts = options || {};
  const candidate = String(preset || '').trim().toLowerCase();
  const normalizedPreset = Object.prototype.hasOwnProperty.call(TRANSPORT_PRESET_VALUES, candidate)
    ? candidate
    : '';
  selectedTransportPreset = normalizedPreset;

  document.querySelectorAll('[data-transport-preset]').forEach(function(button) {
    button.classList.toggle('active', button.dataset.transportPreset === normalizedPreset);
  });

  if (!transportInput) return;
  if (!normalizedPreset) {
    transportInput.readOnly = true;
    transportInput.placeholder = 'ボタン選択で入力';
    transportInput.value = '';
    return;
  }
  if (normalizedPreset === 'other') {
    transportInput.readOnly = false;
    transportInput.placeholder = '0';
    if (!opts.keepCustom) {
      transportInput.value = '';
    }
    return;
  }

  transportInput.readOnly = true;
  transportInput.placeholder = '';
  transportInput.value = String(TRANSPORT_PRESET_VALUES[normalizedPreset] || 0);
}

function applyTransportLedgerPreset_(preset) {
  const candidate = String(preset || '').trim().toLowerCase();
  const normalizedPreset = Object.prototype.hasOwnProperty.call(TRANSPORT_PRESET_VALUES, candidate)
    ? candidate
    : '';
  selectedTransportLedgerPreset = normalizedPreset;

  document.querySelectorAll('[data-transport-ledger-preset]').forEach(function(button) {
    button.classList.toggle('active', button.dataset.transportLedgerPreset === normalizedPreset);
  });

  if (!transportAmountInput || !transportPlaceInput) return;

  if (!normalizedPreset) {
    transportAmountInput.readOnly = true;
    transportAmountInput.placeholder = 'ボタン選択で入力';
    transportAmountInput.value = '';
    transportPlaceInput.readOnly = true;
    transportPlaceInput.placeholder = 'ボタン選択で入力';
    transportPlaceInput.value = '';
    return;
  }

  if (normalizedPreset === 'other') {
    transportAmountInput.readOnly = false;
    transportAmountInput.placeholder = '0';
    transportAmountInput.value = '';
    transportPlaceInput.readOnly = false;
    transportPlaceInput.placeholder = '場所を入力';
    transportPlaceInput.value = '';
    return;
  }

  transportAmountInput.readOnly = true;
  transportAmountInput.placeholder = '';
  transportAmountInput.value = String(TRANSPORT_PRESET_VALUES[normalizedPreset] || 0);
  transportPlaceInput.readOnly = true;
  transportPlaceInput.placeholder = '';
  transportPlaceInput.value = TRANSPORT_PRESET_LABELS[normalizedPreset] || '';
}

function getQuickAddTransportAmount_() {
  if (!transportInput) return 0;
  return sanitizeAmount_(transportInput.value);
}

function openQuickAddModal_() {
  if (!quickAddModal) return;
  activateView_('home');
  quickAddModal.classList.add('open');
  quickAddModal.setAttribute('aria-hidden', 'false');
  if (quickAddForm && quickAddForm.name) {
    quickAddForm.name.focus();
  }
}

function closeQuickAddModal_(options) {
  if (!quickAddModal) return;
  const opts = options || {};
  quickAddModal.classList.remove('open');
  quickAddModal.setAttribute('aria-hidden', 'true');
  if (!opts.keepHomeView) {
    activateView_('home');
  }
}

function getArchiveButtonAction_() {
  if (!archiveButton) return ARCHIVE_BUTTON_ACTION_ARCHIVE;
  const action = String(archiveButton.dataset.archiveAction || '').trim().toLowerCase();
  return action === ARCHIVE_BUTTON_ACTION_CANCEL
    ? ARCHIVE_BUTTON_ACTION_CANCEL
    : ARCHIVE_BUTTON_ACTION_ARCHIVE;
}

function setArchiveCancelState_(enabled) {
  archiveCancelEnabled = Boolean(enabled);
  if (!archiveButton) return;
  archiveButton.dataset.archiveAction = archiveCancelEnabled
    ? ARCHIVE_BUTTON_ACTION_CANCEL
    : ARCHIVE_BUTTON_ACTION_ARCHIVE;
  archiveButton.textContent = archiveCancelEnabled
    ? ARCHIVE_BUTTON_LABEL_CANCEL
    : ARCHIVE_BUTTON_LABEL_ARCHIVE;
}

function loadTransportLedger_() {
  try {
    const raw = localStorage.getItem(getScopedStorageKey_(TRANSPORT_LEDGER_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeTransportLedgerEntry_)
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function saveTransportLedger_() {
  try {
    localStorage.setItem(getScopedStorageKey_(TRANSPORT_LEDGER_KEY), JSON.stringify(transportLedger));
  } catch (_error) {
    // Ignore storage errors.
  }
}

async function initializeTransportLedger_() {
  if (backendMode !== 'firebase' || !firebaseTransportLedgerCollection) {
    return;
  }
  try {
    const localEntries = transportLedger
      .map(normalizeTransportLedgerEntry_)
      .filter(Boolean);
    const snapshot = await firebaseTransportLedgerCollection.get();
    const remoteEntries = snapshot.docs
      .map(function(doc) {
        return normalizeTransportLedgerEntry_(Object.assign({}, doc.data() || {}, { id: doc.id }));
      })
      .filter(Boolean);
    const mergedEntries = mergeTransportLedgers_(remoteEntries, localEntries);
    transportLedger = mergedEntries;
    saveTransportLedger_();
    if (mergedEntries.length !== remoteEntries.length) {
      await replaceFirebaseTransportLedger_();
    }
  } catch (error) {
    console.warn('transport ledger init fallback to local cache:', error);
  }
  startTransportLedgerSync_();
}

function startTransportLedgerSync_() {
  if (backendMode !== 'firebase' || !firebaseTransportLedgerCollection) return;
  if (transportLedgerSyncUnsubscribe) return;

  transportLedgerSyncUnsubscribe = firebaseTransportLedgerCollection.onSnapshot(function(snapshot) {
    transportLedger = snapshot.docs
      .map(function(doc) {
        return normalizeTransportLedgerEntry_(Object.assign({}, doc.data() || {}, { id: doc.id }));
      })
      .filter(Boolean);
    saveTransportLedger_();
    renderTransportLedger_();
    if (currentData && currentData.summary) {
      applySummary(currentData.summary, currentData.lastUpdated);
    }
  }, function(error) {
    console.warn('transport ledger sync error:', error);
  });
}

async function persistTransportLedger_() {
  saveTransportLedger_();
  if (backendMode !== 'firebase' || !firebaseTransportLedgerCollection || !firebaseDb) {
    return;
  }
  await replaceFirebaseTransportLedger_();
}

async function replaceFirebaseTransportLedger_() {
  const snapshot = await firebaseTransportLedgerCollection.get();
  const nextEntries = transportLedger
    .map(normalizeTransportLedgerEntry_)
    .filter(Boolean);
  transportLedger = nextEntries;
  const nextIdSet = new Set();
  const batch = firebaseDb.batch();
  const now = Date.now();

  nextEntries.forEach(function(entry) {
    const id = String(entry.id || '').trim() || createTransportLedgerId_();
    nextIdSet.add(id);
    batch.set(firebaseTransportLedgerCollection.doc(id), {
      date: entry.date,
      amount: sanitizeAmount_(entry.amount),
      place: String(entry.place || '').trim(),
      updatedAtMs: now
    }, { merge: true });
  });

  snapshot.docs.forEach(function(doc) {
    if (!nextIdSet.has(doc.id)) {
      batch.delete(doc.ref);
    }
  });

  if (nextEntries.length === 0 && snapshot.empty) {
    return;
  }
  await batch.commit();
}

function mergeTransportLedgers_(remoteEntries, localEntries) {
  const merged = new Map();
  const order = []
    .concat(Array.isArray(remoteEntries) ? remoteEntries : [])
    .concat(Array.isArray(localEntries) ? localEntries : []);

  order.forEach(function(entry) {
    const normalized = normalizeTransportLedgerEntry_(entry);
    if (!normalized) return;
    const id = String(normalized.id || '').trim();
    if (!id) return;
    if (!merged.has(id)) {
      merged.set(id, normalized);
      return;
    }
    merged.set(id, normalized);
  });

  return Array.from(merged.values());
}

function normalizeTransportLedgerEntry_(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const date = String(entry.date || '').trim();
  const place = String(entry.place || '').trim();
  const amount = sanitizeAmount_(entry.amount);
  const id = String(entry.id || '').trim() || createTransportLedgerId_();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!place) return null;
  if (amount <= 0) return null;
  return {
    id: id,
    date: date,
    amount: amount,
    place: place
  };
}

function renderTransportLedger_() {
  if (!transportLedgerBody) return;
  if (transportLedgerPanel) {
    transportLedgerPanel.classList.toggle('selection-mode', transportSelectionMode);
  }
  const rows = transportLedger
    .slice()
    .sort(function(a, b) {
      const dateCompare = String(b.date || '').localeCompare(String(a.date || ''));
      if (dateCompare !== 0) return dateCompare;
      return String(b.id || '').localeCompare(String(a.id || ''));
    });
  const validIdSet = new Set(rows.map(function(entry) { return String(entry.id || '').trim(); }));
  Array.from(selectedTransportLedgerIds).forEach(function(id) {
    if (!validIdSet.has(String(id || '').trim())) {
      selectedTransportLedgerIds.delete(id);
    }
  });
  if (!transportSelectionMode) {
    selectedTransportLedgerIds.clear();
  }
  if (!rows.length) {
    transportLedgerBody.innerHTML = '<tr class="table-empty"><td colspan="4">交通費はまだありません。</td></tr>';
    updateTransportCountLabel_();
    updateTransportSelectedCount_();
    updateTransportHistoryButtons_();
    return;
  }
  transportLedgerBody.innerHTML = rows.map(function(entry) {
    const id = String(entry.id || '').trim();
    const checkedAttr = selectedTransportLedgerIds.has(id) ? ' checked' : '';
    return ''
      + '<tr data-id="' + escapeHtml(id) + '">'
      + '  <td class="selection-cell"><input data-select-transport type="checkbox" aria-label="選択"' + checkedAttr + '></td>'
      + '  <td>' + escapeHtml(entry.date) + '</td>'
      + '  <td class="money">' + formatYen(entry.amount) + '</td>'
      + '  <td>' + escapeHtml(entry.place) + '</td>'
      + '</tr>';
  }).join('');
  updateTransportCountLabel_();
  updateTransportSelectedCount_();
  updateTransportHistoryButtons_();
}

function getTransportLedgerTotal_() {
  return transportLedger.reduce(function(total, entry) {
    return total + sanitizeAmount_(entry.amount);
  }, 0);
}

function getTransportLedgerYearTotal_(year) {
  const prefix = String(year) + '-';
  return transportLedger.reduce(function(total, entry) {
    const date = String(entry && entry.date ? entry.date : '').trim();
    if (!date.startsWith(prefix)) return total;
    return total + sanitizeAmount_(entry.amount);
  }, 0);
}

function createTransportLedgerId_() {
  return 'tr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}

function getTodayDateInput_() {
  const parts = new Intl.DateTimeFormat('ja-JP', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find(function(part) { return part.type === 'year'; });
  const month = parts.find(function(part) { return part.type === 'month'; });
  const day = parts.find(function(part) { return part.type === 'day'; });
  const y = year ? String(year.value) : '';
  const m = month ? String(month.value).padStart(2, '0') : '';
  const d = day ? String(day.value).padStart(2, '0') : '';
  return y && m && d ? (y + '-' + m + '-' + d) : '';
}

function setDefaultTransportDate_() {
  if (!transportDateInput) return;
  transportDateInput.value = getTodayDateInput_();
}

async function request(url, options) {
  const method = String((options && options.method) || 'GET').toUpperCase();
  if (backendMode === 'firebase-required') {
    throw new Error('Firebase接続に失敗しました。設定を確認してください。');
  }
  if (backendMode === 'firebase' && REQUIRE_LOGIN && !signedInUser) {
    throw new Error('データ表示にはGoogleログインが必要です。');
  }
  if (method !== 'GET' && REQUIRE_LOGIN && backendMode !== 'local') {
    if (backendMode === 'firebase' && !signedInUser) {
      throw new Error('編集にはGoogleログインが必要です。');
    }
    if (backendMode !== 'firebase' && !signedInIdToken) {
      throw new Error('編集にはGoogleログインが必要です。');
    }
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
  const requestId = ++monthlyLoadRequestId;
  monthlyState.loading = true;
  renderMonthlyViews_();
  applyYearlyOverallValue_();
  try {
    const currentMonth = getCurrentMonthLabel_();
    let data = null;
    if (backendMode === 'firebase' && !opts.forceGas) {
      if (REQUIRE_LOGIN && !signedInUser) {
        if (requestId !== monthlyLoadRequestId) return;
        resetMonthlyState_();
        return;
      }
      data = await firebaseLoadMonthly_();
      let firebaseMonths = normalizeMonthlyEntriesWithoutCurrent_(data && data.months, currentMonth);
      if (!firebaseMonths.length) {
        try {
          const gasData = await loadMonthlyDataFromGas_();
          const gasMonths = normalizeMonthlyEntriesWithoutCurrent_(gasData && gasData.months, currentMonth);
          if (gasMonths.length) {
            data = {
              months: gasMonths,
              generatedAt: gasData && gasData.generatedAt ? gasData.generatedAt : formatDateTime_(Date.now())
            };
          } else {
            data = {
              months: firebaseMonths,
              generatedAt: data && data.generatedAt ? data.generatedAt : formatDateTime_(Date.now())
            };
          }
        } catch (fallbackError) {
          console.warn('monthly gas fallback skipped:', fallbackError);
          data = {
            months: firebaseMonths,
            generatedAt: data && data.generatedAt ? data.generatedAt : formatDateTime_(Date.now())
          };
        }
      } else {
        data = {
          months: firebaseMonths,
          generatedAt: data && data.generatedAt ? data.generatedAt : formatDateTime_(Date.now())
        };
      }
    } else {
      data = await loadMonthlyDataFromGas_();
      data = {
        months: normalizeMonthlyEntriesWithoutCurrent_(data && data.months, currentMonth),
        generatedAt: data && data.generatedAt ? data.generatedAt : formatDateTime_(Date.now())
      };
    }
    let months = Array.isArray(data && data.months) ? data.months : [];
    if (requestId !== monthlyLoadRequestId) return;
    monthlyState.months = months;
    if (!months.length) {
      monthlyState.selectedMonth = '';
    } else if (!months.some(function(entry) { return entry.month === monthlyState.selectedMonth; })) {
      monthlyState.selectedMonth = months[months.length - 1].month;
    }
    monthlyState.loading = false;
    applyYearlyOverallValue_();
    renderMonthlyViews_();
  } catch (error) {
    if (requestId !== monthlyLoadRequestId) return;
    monthlyState.months = [];
    monthlyState.selectedMonth = '';
    monthlyState.loading = false;
    applyYearlyOverallValue_();
    renderMonthlyViews_();
    if (!opts.silent) {
      showToast(error.message || '月別データの取得に失敗しました。');
    }
  }
}

function normalizeMonthlyEntriesWithoutCurrent_(entries, currentMonth) {
  const monthLabel = String(currentMonth || '').trim();
  return (Array.isArray(entries) ? entries : [])
    .filter(function(entry) {
      if (!entry) return false;
      return String(entry.month || '').trim() !== monthLabel;
    })
    .sort(function(a, b) {
      return String((a && a.month) || '').localeCompare(String((b && b.month) || ''));
    });
}

async function loadMonthlyDataFromGas_() {
  const params = new URLSearchParams();
  params.set('api', 'monthly');
  params.set('_ts', String(Date.now()));
  const data = await jsonpRequest(params);
  if (!data || typeof data !== 'object') {
    throw new Error('不正なレスポンスです。');
  }
  return data;
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
  } else if (url === '/api/archive/cancel' && method === 'POST') {
    params.set('api', 'archive-cancel');
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
  refreshFirebaseCollectionsForCurrentUser_();
  if (!hasFirebaseDataAccess_()) {
    throw new Error('Googleログイン後にデータを表示できます。');
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
  if (url === '/api/archive/cancel' && method === 'POST') {
    return firebaseArchiveCancel_();
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
      cost: sanitizeAmount_(data.cost),
      transport: sanitizeAmount_(data.transport),
      createdAtMs: toTimestampMs_(data.createdAtMs),
      updatedAtMs: toTimestampMs_(data.updatedAtMs)
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
    cost: item.cost,
    transport: item.transport
  };

  await firebaseItemsCollection.doc(id).set({
    status: stored.status,
    name: stored.name,
    revenue: stored.revenue,
    shipping: stored.shipping,
    cost: stored.cost,
    transport: stored.transport,
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
  const month = getLastMonthLabel_();
  const archivedAt = Date.now();
  const archiveToken = 'arc_' + archivedAt.toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  if (!soldItems.length) {
    await firebaseArchiveMetaRef.set({
      lastArchive: {
        month: month,
        archivedAtMs: archivedAt,
        archiveToken: archiveToken,
        itemIds: []
      },
      updatedAtMs: archivedAt
    }, { merge: true });
    return buildDashboardDataFromItems_(firebaseItemsCache, archivedAt);
  }

  const batch = firebaseDb.batch();
  const itemIds = soldItems.map(function(item) {
    return String(item.id || '').trim();
  }).filter(Boolean);

  soldItems.forEach(function(item) {
    const archiveRef = firebaseArchiveMonthsCollection
      .doc(month)
      .collection('items')
      .doc(item.id);
    batch.set(archiveRef, {
      status: item.status,
      name: item.name,
      revenue: item.revenue,
      shipping: item.shipping,
      cost: item.cost,
      transport: item.transport,
      archivedAtMs: archivedAt,
      archiveToken: archiveToken
    }, { merge: true });
    batch.delete(firebaseItemsCollection.doc(item.id));
  });
  batch.set(firebaseArchiveMetaRef, {
    lastArchive: {
      month: month,
      archivedAtMs: archivedAt,
      archiveToken: archiveToken,
      itemIds: itemIds
    },
    updatedAtMs: archivedAt
  }, { merge: true });

  await batch.commit();
  firebaseItemsCache = firebaseItemsCache.filter(function(item) {
    return item.status !== 'sold';
  });
  return buildDashboardDataFromItems_(firebaseItemsCache, archivedAt);
}

async function firebaseArchiveCancel_() {
  const metaRef = firebaseArchiveMetaRef;
  const metaSnapshot = await metaRef.get();
  const meta = metaSnapshot.exists ? (metaSnapshot.data() || {}) : {};
  const lastArchive = meta.lastArchive || null;
  const month = String(lastArchive && lastArchive.month ? lastArchive.month : '').trim();
  const archiveToken = String(lastArchive && lastArchive.archiveToken ? lastArchive.archiveToken : '').trim();
  const itemIds = Array.isArray(lastArchive && lastArchive.itemIds)
    ? lastArchive.itemIds.map(function(id) { return String(id || '').trim(); }).filter(Boolean)
    : [];

  if (!/^\d{4}-\d{2}$/.test(month) || !archiveToken) {
    throw new Error('取り消せる月別アーカイブがありません。');
  }
  if (!itemIds.length) {
    await metaRef.delete();
    return firebaseLoadDashboard_();
  }

  const itemSnapshots = await Promise.all(itemIds.map(function(id) {
    return firebaseArchiveMonthsCollection
      .doc(month)
      .collection('items')
      .doc(id)
      .get();
  }));
  const restorable = itemSnapshots.filter(function(doc) {
    if (!doc || !doc.exists) return false;
    const data = doc.data() || {};
    return String(data.archiveToken || '').trim() === archiveToken;
  });

  if (!restorable.length) {
    throw new Error('取り消せる月別アーカイブがありません。');
  }

  const now = Date.now();
  const batch = firebaseDb.batch();
  restorable.forEach(function(doc) {
    const data = doc.data() || {};
    batch.set(firebaseItemsCollection.doc(doc.id), {
      status: normalizeStatusValue_(data.status) || 'sold',
      name: String(data.name || '').trim(),
      revenue: sanitizeAmount_(data.revenue),
      shipping: sanitizeAmount_(data.shipping, DEFAULT_SHIPPING),
      cost: sanitizeAmount_(data.cost),
      transport: sanitizeAmount_(data.transport),
      createdAtMs: toTimestampMs_(data.createdAtMs, now) || now,
      updatedAtMs: now
    }, { merge: true });
    batch.delete(doc.ref);
  });
  batch.delete(metaRef);
  await batch.commit();
  return firebaseLoadDashboard_();
}

async function firebaseLoadMonthly_() {
  const monthMap = new Map();
  const archiveSnapshot = await firebaseArchiveMonthsCollection.get();
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
        cost: sanitizeAmount_(data.cost),
        transport: sanitizeAmount_(data.transport)
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
  const soldItems = sortItemsByCreatedOrder_(items
    .filter(function(item) { return item.status === 'sold'; })
    .map(enrichItem_));
  const unsoldItems = sortItemsByCreatedOrder_(items
    .filter(function(item) { return item.status === 'unsold'; })
    .map(enrichItem_));
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
  const transport = sanitizeAmount_(source.transport);
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
    cost: cost,
    transport: transport
  };
}

function enrichItem_(item) {
  const revenue = sanitizeAmount_(item.revenue);
  const shipping = sanitizeAmount_(item.shipping, DEFAULT_SHIPPING);
  const cost = sanitizeAmount_(item.cost);
  const transport = sanitizeAmount_(item.transport);
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
    transport: transport,
    createdAtMs: toTimestampMs_(item.createdAtMs),
    updatedAtMs: toTimestampMs_(item.updatedAtMs),
    fee: fee,
    profit: profit,
    margin: margin
  };
}

function toTimestampMs_(value, fallback) {
  const fallbackMs = Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallbackMs;
  }
  return Math.trunc(parsed);
}

function sortItemsByCreatedOrder_(items) {
  return (Array.isArray(items) ? items.slice() : [])
    .sort(function(a, b) {
      const createdDiff = toTimestampMs_(a && a.createdAtMs) - toTimestampMs_(b && b.createdAtMs);
      if (createdDiff !== 0) return createdDiff;
      const updatedDiff = toTimestampMs_(a && a.updatedAtMs) - toTimestampMs_(b && b.updatedAtMs);
      if (updatedDiff !== 0) return updatedDiff;
      return String((a && a.id) || '').localeCompare(String((b && b.id) || ''));
    });
}

function buildSummary_(soldItems, unsoldItems) {
  const soldRevenue = soldItems.reduce(function(total, item) { return total + item.revenue; }, 0);
  const soldFee = soldItems.reduce(function(total, item) { return total + item.fee; }, 0);
  const soldShipping = soldItems.reduce(function(total, item) { return total + item.shipping; }, 0);
  const soldCost = soldItems.reduce(function(total, item) { return total + item.cost; }, 0);
  const soldProfitGross = soldItems.reduce(function(total, item) { return total + item.profit; }, 0);
  const soldTransport = soldItems.reduce(function(total, item) { return total + sanitizeAmount_(item.transport); }, 0);
  const soldProfit = soldProfitGross - soldTransport;
  const unsoldRevenue = unsoldItems.reduce(function(total, item) { return total + item.revenue; }, 0);
  const unsoldProfit = unsoldItems.reduce(function(total, item) { return total + item.profit; }, 0);
  const unsoldCost = unsoldItems.reduce(function(total, item) { return total + item.cost; }, 0);
  const overallRevenue = soldRevenue + unsoldRevenue;

  return {
    soldRevenue: soldRevenue,
    soldFee: soldFee,
    soldShipping: soldShipping,
    soldCost: soldCost,
    soldProfitGross: soldProfitGross,
    soldTransport: soldTransport,
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
  const transportButtons = Array.from(document.querySelectorAll('[data-transport-action]'));
  const monthButtons = Array.from(document.querySelectorAll('[data-month]'));
  [soldUndoButton, soldRedoButton, unsoldUndoButton, unsoldRedoButton, archiveButton, addButton, transportAddButton, openQuickAddButton, closeQuickAddButton]
    .concat(viewTabs, bulkButtons, transportButtons, monthButtons)
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
  updateTransportHistoryButtons_();
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
    const raw = localStorage.getItem(getScopedStorageKey_(DASHBOARD_CACHE_KEY));
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
    localStorage.setItem(getScopedStorageKey_(DASHBOARD_CACHE_KEY), JSON.stringify(data));
  } catch (_error) {
    // Ignore storage errors.
  }
}

function renderMonthlyViews_() {
  if (!monthlySwitch || !monthlySummaryGrid || !monthlySoldBody || !monthlyUnsoldBody || !monthlyChart) {
    return;
  }
  if (monthlyState.loading) {
    monthlySwitch.innerHTML = '<span class="monthly-empty">取得中・・・</span>';
    monthlySummaryGrid.innerHTML = '';
    monthlySoldBody.innerHTML = '<tr class="table-empty"><td colspan="6">取得中・・・</td></tr>';
    monthlyUnsoldBody.innerHTML = '<tr class="table-empty"><td colspan="6">取得中・・・</td></tr>';
    monthlyChart.innerHTML = '<p class="monthly-empty">取得中・・・</p>';
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
  const soldCount = sanitizeAmount_(summary.soldCount);
  const unsoldCount = sanitizeAmount_(summary.unsoldCount);
  const totalCount = soldCount + unsoldCount;
  const selectedIndex = months.findIndex(function(entry) {
    return String(entry.month || '') === String(selected.month || '');
  });
  const previousSummary = selectedIndex > 0
    ? (months[selectedIndex - 1] && months[selectedIndex - 1].summary) || null
    : null;
  const monthOverMonth = getMonthOverMonth_(summary, previousSummary);

  monthlySummaryGrid.innerHTML = ''
    + '<div class="monthly-metric monthly-metric-split">'
    + '  <div class="monthly-metric-main">'
    + '    <div class="monthly-metric-label">合計収支</div>'
    + '    <div class="monthly-metric-value">' + formatSignedYen(summary.overallNet) + '</div>'
    + '    <div class="monthly-metric-note">' + totalCount + '件 / 利益率 ' + formatPercent(summary.overallMargin) + '</div>'
    + '  </div>'
    + '  <div class="monthly-metric-side">'
    + '    <div class="monthly-metric-label">前月比</div>'
    + '    <div class="monthly-metric-delta ' + monthOverMonth.className + '">' + monthOverMonth.arrow + ' ' + monthOverMonth.rateText + '</div>'
    + '    <div class="monthly-metric-note">' + monthOverMonth.amountText + '</div>'
    + '  </div>'
    + '</div>';

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

  const maxProfit = months.reduce(function(max, entry) {
    const summary = entry.summary || {};
    return Math.max(max, Math.abs(Number(summary.soldProfit || 0)));
  }, 1);
  const maxMargin = months.reduce(function(max, entry) {
    const summary = entry.summary || {};
    return Math.max(max, Math.abs(Number(summary.soldMargin || 0)));
  }, 1);

  monthlyChart.innerHTML = months.map(function(entry) {
    const summary = entry.summary || {};
    const soldProfit = Number(summary.soldProfit || 0);
    const soldMargin = Number(summary.soldMargin || 0);
    const profitWidth = calcBarWidth_(Math.abs(soldProfit), maxProfit);
    const marginWidth = calcBarWidth_(Math.abs(soldMargin), maxMargin);
    const marginClass = soldMargin < 0 ? 'chart-bar profit negative' : 'chart-bar profit';
    return ''
      + '<div class="chart-row">'
      + '  <div class="chart-label">' + escapeHtml(entry.month || '-') + '</div>'
      + '  <div class="chart-bars">'
      + '    <div class="chart-bar-track"><div class="chart-bar revenue" style="width:' + profitWidth + '%;"></div></div>'
      + '    <div class="chart-bar-track"><div class="' + marginClass + '" style="width:' + marginWidth + '%;"></div></div>'
      + '  </div>'
      + '  <div class="chart-values">利益 ' + formatSignedYen(soldProfit) + ' / 利益率 ' + formatPercent(summary.soldMargin) + '</div>'
      + '</div>';
  }).join('');
}

function calcBarWidth_(value, maxValue) {
  const amount = Number(value || 0);
  const max = Number(maxValue || 0);
  if (!Number.isFinite(amount) || !Number.isFinite(max) || amount <= 0 || max <= 0) {
    return 0;
  }
  const percent = Math.round((amount / max) * 100);
  return Math.min(100, Math.max(4, percent));
}

function getMonthOverMonth_(currentSummary, previousSummary) {
  if (!previousSummary) {
    return {
      className: 'neutral',
      arrow: '→',
      rateText: '--',
      amountText: '比較月なし'
    };
  }

  const currentNet = Number((currentSummary && currentSummary.overallNet) || 0);
  const previousNet = Number((previousSummary && previousSummary.overallNet) || 0);
  const delta = currentNet - previousNet;
  const className = delta > 0 ? 'positive' : (delta < 0 ? 'negative' : 'neutral');
  const arrow = delta > 0 ? '▲' : (delta < 0 ? '▼' : '→');
  let ratio = null;
  if (previousNet !== 0) {
    ratio = delta / Math.abs(previousNet);
  } else if (delta === 0) {
    ratio = 0;
  }

  return {
    className: className,
    arrow: arrow,
    rateText: formatSignedPercent_(ratio),
    amountText: formatSignedYen(delta)
  };
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
    <tr class="${rowClass}" data-id="${escapeHtml(item.id)}" data-transport="${escapeHtml(String(item.transport || 0))}">
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
    <tr class="${rowClass}" data-id="${escapeHtml(item.id)}" data-transport="${escapeHtml(String(item.transport || 0))}">
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
  const listedTransport = getTransportLedgerTotal_();
  const baseSoldTransport = sanitizeAmount_(summary.soldTransport);
  const soldTransport = baseSoldTransport + listedTransport;
  const soldRevenue = sanitizeAmount_(summary.soldRevenue);
  const unsoldRevenue = sanitizeAmount_(summary.unsoldRevenue);
  const soldProfit = Number(summary.soldProfit || 0) - listedTransport;
  const overallNet = Number(summary.overallNet || 0) - listedTransport;
  const soldMargin = soldRevenue > 0 ? soldProfit / soldRevenue : 0;
  const overallMargin = (soldRevenue + unsoldRevenue) > 0
    ? overallNet / (soldRevenue + unsoldRevenue)
    : 0;
  soldProfitValue.textContent = formatYen(soldProfit);
  if (soldTransportValue) {
    soldTransportValue.textContent = formatYen(soldTransport);
  }
  soldProfitNote.textContent = summary.soldCount + '件 / 利益率 ' + formatPercent(soldMargin);
  unsoldCostValue.textContent = formatYen(summary.unsoldProfit);
  unsoldCostNote.textContent = summary.unsoldCount + '件 / 利益率 ' + formatPercent(summary.unsoldMargin);
  overallNetValue.textContent = formatSignedYen(overallNet);
  overallNetValue.style.color = overallNet < 0 ? '#9f3f3f' : '#1f6a52';
  if (overallNetNote) {
    overallNetNote.textContent = '合計利益率 ' + formatPercent(overallMargin);
  }
  soldCountLabel.textContent = summary.soldCount + '件';
  unsoldCountLabel.textContent = summary.unsoldCount + '件';
  applyYearlyOverallValue_(summary);
}

function applyYearlyOverallValue_(currentSummary) {
  if (!yearlyOverallValue) return;
  if (monthlyState.loading) {
    yearlyOverallValue.textContent = '取得中・・・';
    yearlyOverallValue.style.color = '#5f6980';
    if (yearlyOverallNote) {
      yearlyOverallNote.textContent = '月別データ取得中・・・';
    }
    return;
  }
  const prefix = String(YEARLY_SUMMARY_YEAR) + '-';
  const aggregate = monthlyState.months.reduce(function(acc, entry) {
    const month = String(entry && entry.month ? entry.month : '').trim();
    if (!month.startsWith(prefix)) return acc;
    const summary = entry && entry.summary ? entry.summary : {};
    acc.net += Number(summary.overallNet || 0);
    acc.revenue += sanitizeAmount_(summary.soldRevenue) + sanitizeAmount_(summary.unsoldRevenue);
    acc.count += sanitizeAmount_(summary.soldCount) + sanitizeAmount_(summary.unsoldCount);
    return acc;
  }, { net: 0, revenue: 0, count: 0 });
  const currentMonth = getCurrentMonthLabel_();
  const isTargetYearCurrentMonth = currentMonth.startsWith(prefix);
  const hasCurrentMonthEntry = monthlyState.months.some(function(entry) {
    return String(entry && entry.month ? entry.month : '').trim() === currentMonth;
  });
  if (isTargetYearCurrentMonth && !hasCurrentMonthEntry) {
    const summary = (currentSummary && typeof currentSummary === 'object')
      ? currentSummary
      : (currentData && currentData.summary ? currentData.summary : {});
    aggregate.net += Number(summary.overallNet || 0);
    aggregate.revenue += sanitizeAmount_(summary.soldRevenue) + sanitizeAmount_(summary.unsoldRevenue);
    aggregate.count += sanitizeAmount_(summary.soldCount) + sanitizeAmount_(summary.unsoldCount);
  }
  aggregate.net -= getTransportLedgerYearTotal_(YEARLY_SUMMARY_YEAR);
  yearlyOverallValue.textContent = formatSignedYen(aggregate.net);
  yearlyOverallValue.style.color = aggregate.net < 0 ? '#9f3f3f' : '#1f6a52';
  if (yearlyOverallNote) {
    const margin = aggregate.revenue > 0 ? aggregate.net / aggregate.revenue : 0;
    yearlyOverallNote.textContent = aggregate.count + '件 / 利益率 ' + formatPercent(margin);
  }
}

function recalcSummaryFromDom() {
  const soldRows = Array.from(soldTableBody.querySelectorAll('tr[data-id]'));
  const unsoldRows = Array.from(unsoldTableBody.querySelectorAll('tr[data-id]'));
  let soldRevenue = 0;
  let soldFee = 0;
  let soldShipping = 0;
  let soldCost = 0;
  let soldProfitGross = 0;
  let soldTransport = 0;
  let unsoldRevenue = 0;
  let unsoldProfit = 0;
  let unsoldCost = 0;

  soldRows.forEach(function(row) {
    const revenue = sanitizeAmount_(row.querySelector('[data-field="revenue"]').value);
    const shipping = sanitizeAmount_(row.querySelector('[data-field="shipping"]').value, 160);
    const cost = sanitizeAmount_(row.querySelector('[data-field="cost"]').value);
    const transport = sanitizeAmount_(row.dataset.transport);
    const fee = Math.floor(revenue * 0.1);
    const profit = revenue - fee - shipping - cost;
    soldRevenue += revenue;
    soldFee += fee;
    soldShipping += shipping;
    soldCost += cost;
    soldTransport += transport;
    soldProfitGross += profit;
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
  const soldProfit = soldProfitGross - soldTransport;

  applySummary({
    soldRevenue: soldRevenue,
    soldFee: soldFee,
    soldShipping: soldShipping,
    soldCost: soldCost,
    soldProfitGross: soldProfitGross,
    soldTransport: soldTransport,
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
  if (!ENABLE_CATEGORY_BURST_EFFECTS) return;
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
  const rawIntensity = Number(intensity) || 8;
  const count = Math.max(2, Math.min(6, Math.round(rawIntensity * 0.5)));

  for (let i = 0; i < count; i += 1) {
    const angle = ((Math.PI * 2) / count) * i;
    const distance = 180 + Math.random() * 220;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
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
    sprite.style.animationDuration = '3000ms';
    sprite.style.animationDelay = Math.round(Math.random() * 60) + 'ms';
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

function scrollToItemRowAndAnimate_(itemId, status, intensity, fallbackAnchorEl, options) {
  const opts = options || {};
  const shouldBurst = opts.burst !== false;
  const shouldNamePeek = Boolean(opts.namePeek);

  if (!itemId) {
    if (shouldBurst) {
      playCategoryBurst_(status, intensity, fallbackAnchorEl);
    }
    return;
  }
  const row = findItemRowById_(itemId, status);
  if (!row) {
    if (shouldBurst) {
      playCategoryBurst_(status, intensity, fallbackAnchorEl);
    }
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
    if (shouldNamePeek) {
      playRowNamePeek_(row);
    }
    if (shouldBurst) {
      playCategoryBurst_(status, intensity, row);
    }
  }, shouldNamePeek ? 1500 : 650);
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

function playRowNamePeek_(row) {
  if (!row || !burstLayer) return;
  if (burstLayer.childElementCount > 10) return;
  const gifUrl = resolveBurstGifUrl_();
  if (!gifUrl) return;

  const anchor = row.querySelector('[data-field="name"]') || row.querySelector('td');
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  if (!isRectVisibleInViewport_(rect)) return;

  const size = Math.round(52 + Math.random() * 14);
  const x = rect.left + Math.min(18, Math.max(8, rect.width * 0.12));
  const y = rect.top + Math.min(12, Math.max(4, rect.height * 0.18));
  const animMin = Math.max(200, ADD_BUTTON_PEEK_ANIM_MIN_MS);
  const animMax = Math.max(animMin, ADD_BUTTON_PEEK_ANIM_MAX_MS);
  const animDuration = animMin + Math.floor(Math.random() * (animMax - animMin + 1));

  const sprite = document.createElement('img');
  sprite.className = 'add-peek-gif';
  sprite.src = gifUrl;
  sprite.alt = '';
  sprite.decoding = 'async';
  sprite.loading = 'eager';
  sprite.style.left = x.toFixed(1) + 'px';
  sprite.style.top = y.toFixed(1) + 'px';
  sprite.style.setProperty('--size', size + 'px');
  sprite.style.animationDuration = animDuration + 'ms';
  sprite.addEventListener('animationend', function() {
    sprite.remove();
  }, { once: true });
  burstLayer.appendChild(sprite);
}

function findBottomItemIdByStatus_(status) {
  const tbody = status === 'sold' ? soldTableBody : unsoldTableBody;
  if (!tbody) return '';
  const rows = tbody.querySelectorAll('tr[data-id]');
  if (!rows || rows.length === 0) return '';
  const lastRow = rows[rows.length - 1];
  return String(lastRow.dataset.id || '').trim();
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

function startAddButtonPeek_() {
  if (addButtonPeekInitialized) return;
  addButtonPeekInitialized = true;
  if (!ENABLE_ADD_BUTTON_PEEK || !openQuickAddButton || !addPeekLayer) return;

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      clearAddButtonPeekTimer_();
      return;
    }
    scheduleAddButtonPeek_();
  });
  scheduleAddButtonPeek_();
}

function clearAddButtonPeekTimer_() {
  if (!addButtonPeekTimer) return;
  clearTimeout(addButtonPeekTimer);
  addButtonPeekTimer = null;
}

function scheduleAddButtonPeek_() {
  if (!ENABLE_ADD_BUTTON_PEEK || !openQuickAddButton || !addPeekLayer) return;
  if (document.hidden) return;
  clearAddButtonPeekTimer_();
  const min = Math.max(1000, ADD_BUTTON_PEEK_MIN_MS);
  const max = Math.max(min, ADD_BUTTON_PEEK_MAX_MS);
  const delay = min + Math.floor(Math.random() * (max - min + 1));
  addButtonPeekTimer = setTimeout(function() {
    playAddButtonPeek_();
    scheduleAddButtonPeek_();
  }, delay);
}

function playAddButtonPeek_() {
  if (!ENABLE_ADD_BUTTON_PEEK || !openQuickAddButton || !addPeekLayer) return;
  if (quickAddModal && quickAddModal.classList.contains('open')) return;
  if (addPeekLayer.childElementCount > 1) return;

  const gifUrl = resolveBurstGifUrl_();
  if (!gifUrl) return;

  const buttonRect = openQuickAddButton.getBoundingClientRect();
  const layerRect = addPeekLayer.getBoundingClientRect();
  if (!isRectVisibleInViewport_(buttonRect) || buttonRect.width <= 0 || buttonRect.height <= 0) return;

  const size = Math.round(54 + Math.random() * 18);
  const x = buttonRect.left - layerRect.left + (buttonRect.width * (0.44 + Math.random() * 0.12));
  const y = buttonRect.top - layerRect.top + (buttonRect.height * (0.2 + Math.random() * 0.08));

  const sprite = document.createElement('img');
  sprite.className = 'add-peek-gif';
  sprite.src = gifUrl;
  sprite.alt = '';
  sprite.decoding = 'async';
  sprite.loading = 'eager';
  sprite.style.left = x.toFixed(1) + 'px';
  sprite.style.top = y.toFixed(1) + 'px';
  sprite.style.setProperty('--size', size + 'px');
  const animMin = Math.max(200, ADD_BUTTON_PEEK_ANIM_MIN_MS);
  const animMax = Math.max(animMin, ADD_BUTTON_PEEK_ANIM_MAX_MS);
  const animDuration = animMin + Math.floor(Math.random() * (animMax - animMin + 1));
  sprite.style.animationDuration = animDuration + 'ms';
  sprite.addEventListener('animationend', function() {
    sprite.remove();
  }, { once: true });
  addPeekLayer.appendChild(sprite);
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

function formatSignedPercent_(value) {
  if (value === null || typeof value === 'undefined') return '--';
  const number = Number(value);
  if (!Number.isFinite(number)) return '--';
  if (Math.abs(number) < 0.0000001) {
    return '0.0%';
  }
  const abs = (Math.abs(number) * 100).toFixed(1) + '%';
  return (number > 0 ? '+' : '-') + abs;
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
