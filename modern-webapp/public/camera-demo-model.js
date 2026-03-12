(function() {
  var config = window.APP_CONFIG || {};
  if (String(config.environment || '').trim().toLowerCase() !== 'model') {
    return;
  }

  var DAILY_LIMIT = 3;
  var TIMEZONE = 'Asia/Tokyo';
  var STORAGE_PREFIX = 'mercari_camera_demo_model_daily_v1';
  var STYLE_ID = 'modelCameraDemoStyle';

  var ui = {
    box: null,
    remaining: null,
    input: null,
    button: null
  };

  function sanitizeCount(value, fallback) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
    }
    return Math.trunc(parsed);
  }

  function formatTodayKey() {
    var parts = new Intl.DateTimeFormat('ja-JP', {
      timeZone: TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(new Date());
    var year = '';
    var month = '';
    var day = '';
    parts.forEach(function(part) {
      if (part.type === 'year') year = String(part.value || '');
      if (part.type === 'month') month = String(part.value || '').padStart(2, '0');
      if (part.type === 'day') day = String(part.value || '').padStart(2, '0');
    });
    if (!year || !month || !day) {
      return '';
    }
    return year + '-' + month + '-' + day;
  }

  function notify(message) {
    if (typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }
    console.log(message);
  }

  function getFirebaseAuth() {
    if (!window.firebase || typeof window.firebase.auth !== 'function') {
      return null;
    }
    try {
      return window.firebase.auth();
    } catch (_error) {
      return null;
    }
  }

  function getFirebaseDb() {
    if (!window.firebase || typeof window.firebase.firestore !== 'function') {
      return null;
    }
    try {
      return window.firebase.firestore();
    } catch (_error) {
      return null;
    }
  }

  function getSignedInUid() {
    var auth = getFirebaseAuth();
    var user = auth && auth.currentUser ? auth.currentUser : null;
    var uid = user && user.uid ? String(user.uid).trim() : '';
    return uid;
  }

  function getLocalStorageKey(uid) {
    var scope = uid ? ('uid_' + uid) : 'guest';
    return STORAGE_PREFIX + '_' + scope;
  }

  function loadLocalUsage(uid, dayKey) {
    var todayKey = String(dayKey || '').trim();
    try {
      var raw = localStorage.getItem(getLocalStorageKey(uid));
      if (!raw) {
        return { date: todayKey, usedCount: 0 };
      }
      var parsed = JSON.parse(raw);
      var date = String(parsed && parsed.date ? parsed.date : '').trim();
      if (date !== todayKey) {
        return { date: todayKey, usedCount: 0 };
      }
      return {
        date: todayKey,
        usedCount: sanitizeCount(parsed && parsed.usedCount, 0)
      };
    } catch (_error) {
      return { date: todayKey, usedCount: 0 };
    }
  }

  function saveLocalUsage(uid, dayKey, usedCount) {
    var payload = {
      date: String(dayKey || '').trim(),
      usedCount: sanitizeCount(usedCount, 0)
    };
    try {
      localStorage.setItem(getLocalStorageKey(uid), JSON.stringify(payload));
    } catch (_error) {}
  }

  function normalizeDailyMap(value) {
    var map = {};
    if (!value || typeof value !== 'object') {
      return map;
    }
    Object.keys(value).forEach(function(key) {
      var day = String(key || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        return;
      }
      map[day] = sanitizeCount(value[key], 0);
    });
    return map;
  }

  function getUsageCollectionName() {
    var firebaseConfig = config.firebase || {};
    var name = String(firebaseConfig.usageCollection || '').trim();
    return name || 'mercari_usage_model';
  }

  function getUsageMonthRef(uid, dayKey) {
    if (!uid) return null;
    var db = getFirebaseDb();
    if (!db) return null;
    var day = String(dayKey || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
    var month = day.slice(0, 7);
    return db.collection(getUsageCollectionName()).doc(uid).collection('months').doc(month);
  }

  async function getCloudUsedCount(uid, dayKey) {
    var ref = getUsageMonthRef(uid, dayKey);
    if (!ref) return null;
    try {
      var snapshot = await ref.get();
      if (!snapshot.exists) {
        return 0;
      }
      var data = snapshot.data() || {};
      var usageMap = normalizeDailyMap(data.cameraDailyCountByDate);
      return sanitizeCount(usageMap[dayKey], 0);
    } catch (_error) {
      return null;
    }
  }

  async function consumeCloudQuota(uid, dayKey) {
    var ref = getUsageMonthRef(uid, dayKey);
    var db = getFirebaseDb();
    if (!uid || !ref || !db) {
      return null;
    }
    try {
      return await db.runTransaction(async function(transaction) {
        var snapshot = await transaction.get(ref);
        var data = snapshot.exists ? (snapshot.data() || {}) : {};
        var usageMap = normalizeDailyMap(data.cameraDailyCountByDate);
        var currentCount = sanitizeCount(usageMap[dayKey], 0);
        if (currentCount >= DAILY_LIMIT) {
          return {
            allowed: false,
            usedCount: currentCount
          };
        }
        var nextCount = currentCount + 1;
        usageMap[dayKey] = nextCount;
        transaction.set(ref, {
          uid: uid,
          month: dayKey.slice(0, 7),
          cameraDailyCountByDate: usageMap,
          updatedAtMs: Date.now()
        }, { merge: true });
        return {
          allowed: true,
          usedCount: nextCount
        };
      });
    } catch (_error) {
      return null;
    }
  }

  async function getUsedCount() {
    var dayKey = formatTodayKey();
    var uid = getSignedInUid();
    if (uid) {
      var cloudCount = await getCloudUsedCount(uid, dayKey);
      if (cloudCount != null) {
        return sanitizeCount(cloudCount, 0);
      }
    }
    var local = loadLocalUsage(uid, dayKey);
    return sanitizeCount(local.usedCount, 0);
  }

  async function consumeQuota() {
    var dayKey = formatTodayKey();
    var uid = getSignedInUid();
    if (uid) {
      var cloudResult = await consumeCloudQuota(uid, dayKey);
      if (cloudResult && typeof cloudResult.allowed === 'boolean') {
        var cloudRemaining = Math.max(0, DAILY_LIMIT - sanitizeCount(cloudResult.usedCount, 0));
        return {
          allowed: cloudResult.allowed,
          usedCount: sanitizeCount(cloudResult.usedCount, 0),
          remaining: cloudRemaining
        };
      }
    }
    var local = loadLocalUsage(uid, dayKey);
    var usedCount = sanitizeCount(local.usedCount, 0);
    if (usedCount >= DAILY_LIMIT) {
      return { allowed: false, usedCount: usedCount, remaining: 0 };
    }
    var nextCount = usedCount + 1;
    saveLocalUsage(uid, dayKey, nextCount);
    return {
      allowed: true,
      usedCount: nextCount,
      remaining: Math.max(0, DAILY_LIMIT - nextCount)
    };
  }

  function setRemainingUi(remaining) {
    if (!ui.remaining || !ui.button || !ui.box) return;
    var safeRemaining = Math.max(0, sanitizeCount(remaining, 0));
    ui.box.hidden = false;
    ui.remaining.textContent = '本日残り ' + safeRemaining + ' / ' + DAILY_LIMIT + ' 件';
    ui.button.disabled = safeRemaining <= 0;
  }

  async function refreshRemainingUi() {
    if (!ui.box) return;
    var usedCount = await getUsedCount();
    setRemainingUi(Math.max(0, DAILY_LIMIT - usedCount));
  }

  function hashText(source) {
    var text = String(source || '');
    var hash = 0;
    for (var i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  function buildSuggestion(file) {
    var presets = [
      { name: '古着トップス', revenue: 1800, cost: 700 },
      { name: 'スニーカー', revenue: 4200, cost: 1900 },
      { name: 'ホビーグッズ', revenue: 2400, cost: 900 },
      { name: '小型家電', revenue: 3800, cost: 1600 },
      { name: '雑貨セット', revenue: 1500, cost: 550 }
    ];
    var key = String(file && file.name ? file.name : '')
      + ':' + String(file && file.type ? file.type : '')
      + ':' + String(file && file.size ? file.size : 0);
    var base = presets[hashText(key) % presets.length];
    var sizeSteps = Math.min(6, Math.floor(sanitizeCount(file && file.size, 0) / (220 * 1024)));
    return {
      name: base.name + '（AI候補）',
      revenue: Math.max(300, base.revenue + (sizeSteps * 120)),
      cost: Math.max(50, base.cost + (sizeSteps * 45)),
      shipping: 160
    };
  }

  function applySuggestion(suggestion) {
    var nameInput = document.getElementById('nameInput');
    var revenueInput = document.getElementById('revenueInput');
    var costInput = document.getElementById('costInput');
    var shippingInput = document.getElementById('shippingInput');
    if (nameInput) nameInput.value = String(suggestion.name || '').trim();
    if (revenueInput) revenueInput.value = String(sanitizeCount(suggestion.revenue, 0));
    if (costInput) costInput.value = String(sanitizeCount(suggestion.cost, 0));
    if (shippingInput) shippingInput.value = String(sanitizeCount(suggestion.shipping, 160));
  }

  async function handleFilePicked() {
    if (!ui.input) return;
    var file = ui.input.files && ui.input.files[0] ? ui.input.files[0] : null;
    ui.input.value = '';
    if (!file) return;

    var quota = await consumeQuota();
    if (!quota.allowed) {
      setRemainingUi(0);
      notify('カメラ判定の本日上限（' + DAILY_LIMIT + '件）に達しました。手動入力をご利用ください。');
      return;
    }

    applySuggestion(buildSuggestion(file));
    setRemainingUi(quota.remaining);
    notify('AI候補を入力しました（本日残り ' + quota.remaining + '件）。');
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = ''
      + '.model-camera-demo-box {'
      + '  border: 1px solid #d8dfeb;'
      + '  border-radius: 12px;'
      + '  background: #f6f9ff;'
      + '  padding: 10px;'
      + '  display: grid;'
      + '  gap: 8px;'
      + '}'
      + '.model-camera-demo-head {'
      + '  display: flex;'
      + '  justify-content: space-between;'
      + '  align-items: center;'
      + '  gap: 8px;'
      + '}'
      + '.model-camera-demo-title {'
      + '  font-size: 12px;'
      + '  font-weight: 800;'
      + '  color: #1f3f78;'
      + '}'
      + '.model-camera-demo-remaining {'
      + '  font-size: 11px;'
      + '  color: #35588f;'
      + '  background: #e7efff;'
      + '  border: 1px solid #c7d7fb;'
      + '  border-radius: 999px;'
      + '  padding: 3px 8px;'
      + '}'
      + '.model-camera-demo-button {'
      + '  justify-self: start;'
      + '  padding: 8px 12px;'
      + '  font-size: 12px;'
      + '}'
      + '.model-camera-demo-note {'
      + '  margin: 0;'
      + '  font-size: 11px;'
      + '  line-height: 1.45;'
      + '  color: #53617a;'
      + '}';
    document.head.appendChild(style);
  }

  function buildUi() {
    var form = document.getElementById('quickAddForm');
    if (!form) return false;
    if (document.getElementById('modelCameraDemoBox')) {
      ui.box = document.getElementById('modelCameraDemoBox');
      ui.remaining = document.getElementById('modelCameraDemoRemaining');
      ui.input = document.getElementById('modelCameraDemoInput');
      ui.button = document.getElementById('modelCameraDemoButton');
      return Boolean(ui.box && ui.remaining && ui.input && ui.button);
    }

    var box = document.createElement('div');
    box.id = 'modelCameraDemoBox';
    box.className = 'model-camera-demo-box';

    var head = document.createElement('div');
    head.className = 'model-camera-demo-head';

    var title = document.createElement('div');
    title.className = 'model-camera-demo-title';
    title.textContent = 'カメラ判定（デモ）';

    var remaining = document.createElement('div');
    remaining.id = 'modelCameraDemoRemaining';
    remaining.className = 'model-camera-demo-remaining';
    remaining.textContent = '本日残り - 件';

    head.appendChild(title);
    head.appendChild(remaining);

    var input = document.createElement('input');
    input.id = 'modelCameraDemoInput';
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.hidden = true;

    var button = document.createElement('button');
    button.id = 'modelCameraDemoButton';
    button.type = 'button';
    button.className = 'button button-secondary model-camera-demo-button';
    button.textContent = '撮影してAI候補を入力';

    var note = document.createElement('p');
    note.className = 'model-camera-demo-note';
    note.textContent = 'デモ上限: 1日3件/ユーザー。画像は保存せず、候補入力後に手動修正できます。';

    box.appendChild(head);
    box.appendChild(input);
    box.appendChild(button);
    box.appendChild(note);

    var nameInput = document.getElementById('nameInput');
    var anchor = nameInput ? nameInput.closest('.field') : null;
    form.insertBefore(box, anchor || form.firstChild);

    ui.box = box;
    ui.remaining = remaining;
    ui.input = input;
    ui.button = button;
    return true;
  }

  function bindUi() {
    if (!ui.button || !ui.input) return;
    ui.button.addEventListener('click', function() {
      ui.input.value = '';
      ui.input.click();
    });
    ui.input.addEventListener('change', function() {
      void handleFilePicked();
    });

    var openQuickAddButton = document.getElementById('openQuickAddButton');
    if (openQuickAddButton) {
      openQuickAddButton.addEventListener('click', function() {
        setTimeout(function() {
          void refreshRemainingUi();
        }, 120);
      });
    }

    document.addEventListener('visibilitychange', function() {
      if (document.hidden) return;
      void refreshRemainingUi();
    });

    var auth = getFirebaseAuth();
    if (auth && typeof auth.onAuthStateChanged === 'function') {
      auth.onAuthStateChanged(function() {
        void refreshRemainingUi();
      });
    }
  }

  function applyDemoQueryBootstrap() {
    try {
      var query = new URLSearchParams(window.location.search || '');
      var demo = String(query.get('demo') || '').trim().toLowerCase();
      if (demo !== 'camera') return;
      var openQuickAddButton = document.getElementById('openQuickAddButton');
      if (openQuickAddButton) {
        setTimeout(function() {
          openQuickAddButton.click();
        }, 140);
      }
    } catch (_error) {}
  }

  function init() {
    injectStyle();
    if (!buildUi()) return;
    bindUi();
    applyDemoQueryBootstrap();
    void refreshRemainingUi();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
