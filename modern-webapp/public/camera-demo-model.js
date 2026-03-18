(function() {
  var config = window.APP_CONFIG || {};
  if (String(config.environment || '').trim().toLowerCase() !== 'model') {
    return;
  }

  var DAILY_LIMIT = 3;
  var TIMEZONE = 'Asia/Tokyo';
  var STORAGE_PREFIX = 'mercari_camera_demo_model_daily_v1';
  var STYLE_ID = 'modelPhotoAnalyzerStyle';
  var TESSERACT_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  var TESSERACT_SCRIPT_SELECTOR = 'script[data-model-photo-ocr="tesseract"]';

  var state = {
    root: null,
    input: null,
    remaining: null,
    cameraButton: null,
    galleryButton: null,
    previewImage: null,
    previewEmpty: null,
    result: null,
    currentPreviewUrl: '',
    tesseractLoadingPromise: null,
    lastKeyword: ''
  };

  var STOPWORDS = {
    // Japanese generic e-commerce words
    'メルカリ': true,
    'mercari': true,
    '売り切れ': true,
    '送料無料': true,
    '即購入': true,
    '購入': true,
    '商品': true,
    '新品': true,
    '中古': true,
    '送料無料込み': true,
    '送料込み': true,
    '限定': true,
    '公式': true,
    '未使用': true,
    // Common noise from OCR
    'the': true,
    'and': true,
    'with': true,
    'for': true,
    'from': true,
    'www': true,
    'http': true,
    'https': true,
    'com': true,
    'jp': true
  };

  function sanitizeCount(value, fallback) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return Number.isFinite(Number(fallback)) ? Number(fallback) : 0;
    }
    return Math.trunc(parsed);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  function normalizeWhitespace(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
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
    return user && user.uid ? String(user.uid).trim() : '';
  }

  function getLocalStorageKey(uid) {
    return STORAGE_PREFIX + '_' + (uid ? ('uid_' + uid) : 'guest');
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
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
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
      if (!snapshot.exists) return 0;
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
          return { allowed: false, usedCount: currentCount };
        }
        var nextCount = currentCount + 1;
        usageMap[dayKey] = nextCount;
        transaction.set(ref, {
          uid: uid,
          month: dayKey.slice(0, 7),
          cameraDailyCountByDate: usageMap,
          updatedAtMs: Date.now()
        }, { merge: true });
        return { allowed: true, usedCount: nextCount };
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
    return { allowed: true, usedCount: nextCount, remaining: Math.max(0, DAILY_LIMIT - nextCount) };
  }

  function setRemainingUi(remaining) {
    if (!state.remaining || !state.cameraButton || !state.galleryButton) return;
    var safeRemaining = Math.max(0, sanitizeCount(remaining, 0));
    state.remaining.textContent = '本日残り ' + safeRemaining + ' / ' + DAILY_LIMIT + ' 件';
    var disabled = safeRemaining <= 0;
    state.cameraButton.disabled = disabled;
    state.galleryButton.disabled = disabled;
  }

  async function refreshRemainingUi() {
    var usedCount = await getUsedCount();
    setRemainingUi(Math.max(0, DAILY_LIMIT - usedCount));
  }

  function setPreviewImage(url) {
    if (!state.previewImage || !state.previewEmpty) return;
    if (state.currentPreviewUrl && state.currentPreviewUrl !== url) {
      URL.revokeObjectURL(state.currentPreviewUrl);
    }
    state.currentPreviewUrl = url;
    state.previewImage.src = url;
    state.previewImage.hidden = false;
    state.previewEmpty.hidden = true;
  }

  function clearPreviewImage() {
    if (!state.previewImage || !state.previewEmpty) return;
    if (state.currentPreviewUrl) {
      URL.revokeObjectURL(state.currentPreviewUrl);
      state.currentPreviewUrl = '';
    }
    state.previewImage.removeAttribute('src');
    state.previewImage.hidden = true;
    state.previewEmpty.hidden = false;
  }

  function loadScriptOnce(url, selector) {
    return new Promise(function(resolve, reject) {
      var existing = document.querySelector(selector);
      if (existing) {
        if (existing.dataset && existing.dataset.loaded === 'true') {
          resolve();
          return;
        }
        existing.addEventListener('load', function() { resolve(); }, { once: true });
        existing.addEventListener('error', function() { reject(new Error('OCR SDK読み込み失敗')); }, { once: true });
        return;
      }
      var script = document.createElement('script');
      script.src = url;
      script.async = true;
      script.setAttribute('data-model-photo-ocr', 'tesseract');
      script.addEventListener('load', function() {
        if (script.dataset) script.dataset.loaded = 'true';
        resolve();
      }, { once: true });
      script.addEventListener('error', function() {
        reject(new Error('OCR SDK読み込み失敗'));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureTesseractLoaded() {
    if (window.Tesseract) return;
    if (!state.tesseractLoadingPromise) {
      state.tesseractLoadingPromise = loadScriptOnce(TESSERACT_SCRIPT_URL, TESSERACT_SCRIPT_SELECTOR);
    }
    await state.tesseractLoadingPromise;
    if (!window.Tesseract) {
      throw new Error('OCRライブラリが利用できません。');
    }
  }

  function normalizeKeywordToken(token) {
    var cleaned = String(token || '')
      .replace(/[\u3000\t\n\r]/g, ' ')
      .replace(/["'`´’“”]/g, '')
      .replace(/[\[\](){}<>]/g, ' ')
      .replace(/[!！?？,，.。:：;；\/\\|+=_*~^]/g, ' ')
      .trim();
    cleaned = normalizeWhitespace(cleaned);
    if (!cleaned) return '';
    cleaned = cleaned.replace(/^[-_]+|[-_]+$/g, '');
    if (!cleaned) return '';
    if (/^\d+$/.test(cleaned)) return '';
    if (cleaned.length < 2) return '';
    if (cleaned.length > 24) return '';
    if (STOPWORDS[cleaned.toLowerCase()]) return '';
    if (STOPWORDS[cleaned]) return '';
    return cleaned;
  }

  function addTokenScore(scoreMap, token, score) {
    var key = normalizeKeywordToken(token);
    if (!key) return;
    var existing = scoreMap[key] || 0;
    scoreMap[key] = existing + Number(score || 0);
  }

  function extractTokensFromRawText(rawText) {
    var text = String(rawText || '');
    var matches = text.match(/[一-龠々〆〤ぁ-んァ-ヴーA-Za-z0-9]{2,24}/g) || [];
    return matches;
  }

  function buildKeywordCandidatesFromOcr(ocrResult, fallbackFileName) {
    var rawText = normalizeWhitespace(
      ocrResult
        && ocrResult.data
        && typeof ocrResult.data.text === 'string'
        ? ocrResult.data.text
        : ''
    );

    var scoreMap = {};
    var words = Array.isArray(ocrResult && ocrResult.data && ocrResult.data.words)
      ? ocrResult.data.words
      : [];

    words.forEach(function(word, index) {
      var text = normalizeKeywordToken(word && word.text);
      if (!text) return;
      var confidence = Number(word && word.confidence);
      var confidenceScore = Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence / 100)) : 0.3;
      var lengthScore = Math.min(0.4, text.length * 0.05);
      var positionScore = Math.max(0, 0.24 - (index * 0.01));
      var japanScore = /[一-龠ぁ-んァ-ヴ]/.test(text) ? 0.18 : 0;
      addTokenScore(scoreMap, text, confidenceScore + lengthScore + positionScore + japanScore);
    });

    var rawTokens = extractTokensFromRawText(rawText);
    rawTokens.forEach(function(token, index) {
      var text = normalizeKeywordToken(token);
      if (!text) return;
      var base = Math.max(0.05, 0.26 - (index * 0.01));
      var japanScore = /[一-龠ぁ-んァ-ヴ]/.test(text) ? 0.12 : 0;
      addTokenScore(scoreMap, text, base + japanScore);
    });

    if (!Object.keys(scoreMap).length) {
      var baseName = String(fallbackFileName || '').replace(/\.[a-z0-9]+$/i, '');
      extractTokensFromRawText(baseName).forEach(function(token, index) {
        addTokenScore(scoreMap, token, Math.max(0.1, 0.28 - (index * 0.03)));
      });
    }

    var sorted = Object.keys(scoreMap)
      .map(function(token) {
        return { token: token, score: scoreMap[token] };
      })
      .sort(function(a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return b.token.length - a.token.length;
      });

    var candidates = sorted.slice(0, 6).map(function(entry) {
      return entry.token;
    });

    if (!candidates.length) {
      candidates = ['商品名不明'];
    }

    var queryParts = [];
    var totalLength = 0;
    for (var i = 0; i < candidates.length; i += 1) {
      var token = candidates[i];
      if (!token || token === '商品名不明') continue;
      var nextLen = totalLength + token.length + (queryParts.length ? 1 : 0);
      if (nextLen > 24) break;
      queryParts.push(token);
      totalLength = nextLen;
      if (queryParts.length >= 2) break;
    }

    var query = queryParts.length ? queryParts.join(' ') : candidates[0];

    return {
      query: query,
      candidates: candidates,
      rawText: rawText
    };
  }

  function buildMercariSearchUrl(keyword) {
    var query = normalizeWhitespace(keyword);
    return 'https://jp.mercari.com/search?keyword=' + encodeURIComponent(query);
  }

  function updateSearchLink(keyword) {
    if (!state.result) return;
    var link = state.result.querySelector('#modelPhotoAnalyzerLink');
    if (!link) return;
    var normalized = normalizeWhitespace(keyword);
    if (!normalized) {
      link.removeAttribute('href');
      link.classList.add('disabled');
      link.textContent = '検索リンクを準備中';
      return;
    }
    link.href = buildMercariSearchUrl(normalized);
    link.classList.remove('disabled');
    link.textContent = 'メルカリで検索（入力済み）';
  }

  function setResultLoading(message) {
    if (!state.result) return;
    state.result.innerHTML = '<p class="model-photo-analyzer-loading">' + escapeHtml(message || 'OCRで文字を抽出中...') + '</p>';
  }

  function renderOcrResult(ocrView, sourceName) {
    if (!state.result) return;
    var query = normalizeWhitespace(ocrView && ocrView.query);
    var candidates = Array.isArray(ocrView && ocrView.candidates) ? ocrView.candidates : [];
    var rawText = normalizeWhitespace(ocrView && ocrView.rawText);
    state.lastKeyword = query;

    var chipsHtml = candidates.map(function(token) {
      return '<button class="model-photo-analyzer-chip" type="button" data-candidate="' + escapeHtml(token) + '">' + escapeHtml(token) + '</button>';
    }).join('');

    state.result.innerHTML = ''
      + '<div class="model-photo-analyzer-actions">'
      + '  <label class="model-photo-analyzer-field-inline">'
      + '    <span>抽出キーワード</span>'
      + '    <input id="modelPhotoAnalyzerKeywordInput" type="text" value="' + escapeHtml(query) + '" placeholder="OCR結果が入ります">'
      + '  </label>'
      + '  <div class="model-photo-analyzer-button-row">'
      + '    <button class="button button-primary" type="button" id="modelPhotoAnalyzerSearchButton">メルカリ検索を開く</button>'
      + '    <button class="button button-secondary" type="button" id="modelPhotoAnalyzerCopyButton">キーワードコピー</button>'
      + '    <a class="button button-secondary model-photo-analyzer-link" id="modelPhotoAnalyzerLink" target="_blank" rel="noopener noreferrer">メルカリで検索（入力済み）</a>'
      + '  </div>'
      + '</div>'
      + '<div class="model-photo-analyzer-chips">' + chipsHtml + '</div>'
      + '<p class="model-photo-analyzer-caption">'
      + '画像: ' + escapeHtml(sourceName || 'camera.jpg') + ' / OCR結果をもとにメルカリ検索語を作成しました。'
      + '</p>'
      + '<details class="model-photo-analyzer-details">'
      + '  <summary>OCR抽出テキストを表示</summary>'
      + '  <pre>' + escapeHtml(rawText || '抽出テキストがありません。') + '</pre>'
      + '</details>';

    updateSearchLink(query);
    bindResultEvents();
  }

  function getKeywordInput() {
    if (!state.result) return null;
    return state.result.querySelector('#modelPhotoAnalyzerKeywordInput');
  }

  function getCurrentKeyword() {
    var input = getKeywordInput();
    if (!input) return '';
    return normalizeWhitespace(input.value);
  }

  function executeMercariSearch() {
    var keyword = getCurrentKeyword();
    if (!keyword) {
      notify('検索キーワードが空です。候補を選んでください。');
      return;
    }
    updateSearchLink(keyword);
    var url = buildMercariSearchUrl(keyword);
    var opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      notify('ポップアップがブロックされました。右の検索リンクから開いてください。');
    }
  }

  async function copyKeyword() {
    var keyword = getCurrentKeyword();
    if (!keyword) {
      notify('コピーするキーワードがありません。');
      return;
    }
    try {
      await navigator.clipboard.writeText(keyword);
      notify('キーワードをコピーしました。');
    } catch (_error) {
      notify('コピーに失敗しました。手動でコピーしてください。');
    }
  }

  function bindResultEvents() {
    if (!state.result) return;

    if (!state.result.dataset.delegateBound) {
      state.result.addEventListener('click', function(event) {
        var chip = event.target.closest('button[data-candidate]');
        if (!chip) return;
        var keyword = normalizeWhitespace(chip.dataset.candidate || '');
        var input = getKeywordInput();
        if (input) {
          input.value = keyword;
          updateSearchLink(keyword);
        }
      });
      state.result.dataset.delegateBound = 'true';
    }

    var keywordInput = state.result.querySelector('#modelPhotoAnalyzerKeywordInput');
    if (keywordInput) {
      keywordInput.addEventListener('input', function() {
        updateSearchLink(normalizeWhitespace(keywordInput.value));
      });
      keywordInput.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          executeMercariSearch();
        }
      });
    }

    var searchButton = state.result.querySelector('#modelPhotoAnalyzerSearchButton');
    if (searchButton) {
      searchButton.addEventListener('click', function() {
        executeMercariSearch();
      });
    }

    var copyButton = state.result.querySelector('#modelPhotoAnalyzerCopyButton');
    if (copyButton) {
      copyButton.addEventListener('click', function() {
        void copyKeyword();
      });
    }
  }

  async function runOcrOnFile(file) {
    await ensureTesseractLoaded();
    var lastProgressPercent = -1;
    return window.Tesseract.recognize(file, 'jpn+eng', {
      logger: function(log) {
        if (!log || log.status !== 'recognizing text') return;
        var progress = Number(log.progress);
        if (!Number.isFinite(progress)) return;
        var percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
        if (percent === lastProgressPercent) return;
        lastProgressPercent = percent;
        setResultLoading('OCRで文字を抽出中... ' + percent + '%');
      }
    });
  }

  async function handlePickedFile(file) {
    if (!file) return;
    var quota = await consumeQuota();
    if (!quota.allowed) {
      setRemainingUi(0);
      notify('写真判別の本日上限（' + DAILY_LIMIT + '件）に達しました。');
      return;
    }

    setRemainingUi(quota.remaining);
    setResultLoading('OCR初期化中...');

    var previewUrl = URL.createObjectURL(file);
    setPreviewImage(previewUrl);

    try {
      var ocrResult = await runOcrOnFile(file);
      var view = buildKeywordCandidatesFromOcr(ocrResult, file.name || 'camera.jpg');
      renderOcrResult(view, file.name || 'camera.jpg');
      notify('OCR完了。メルカリ検索キーワードを作成しました（本日残り ' + quota.remaining + '件）。');
    } catch (error) {
      console.error(error);
      setResultLoading('OCRに失敗しました。別の画像で再試行してください。');
      notify('OCRに失敗しました。');
    }
  }

  function openPicker(mode) {
    if (!state.input) return;
    state.input.value = '';
    if (String(mode || '').trim().toLowerCase() === 'camera') {
      state.input.setAttribute('capture', 'environment');
    } else {
      state.input.removeAttribute('capture');
    }
    state.input.click();
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = ''
      + '#monthlyChart.model-photo-analyzer-hidden{display:none !important;}'
      + '.model-photo-analyzer-root{display:grid;gap:14px;}'
      + '.model-photo-analyzer-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;}'
      + '.model-photo-analyzer-title{margin:0;font-size:18px;font-weight:800;color:#1f2f4d;}'
      + '.model-photo-analyzer-sub{margin:4px 0 0;color:#52617d;font-size:12px;line-height:1.45;}'
      + '.model-photo-analyzer-badge{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:700;border:1px solid #e5a9a9;background:#fff4f4;color:#9b2e2e;}'
      + '.model-photo-analyzer-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}'
      + '.model-photo-analyzer-remaining{font-size:11px;color:#35588f;background:#e7efff;border:1px solid #c7d7fb;border-radius:999px;padding:4px 8px;}'
      + '.model-photo-analyzer-body{display:grid;grid-template-columns:minmax(0,250px) minmax(0,1fr);gap:12px;}'
      + '.model-photo-analyzer-preview{border:1px dashed #c7d7fb;border-radius:14px;min-height:220px;display:flex;align-items:center;justify-content:center;background:#f8fbff;overflow:hidden;padding:8px;}'
      + '.model-photo-analyzer-preview img{max-width:100%;max-height:100%;display:block;border-radius:10px;object-fit:contain;}'
      + '.model-photo-analyzer-preview-empty{margin:0;color:#67748b;font-size:12px;text-align:center;line-height:1.45;}'
      + '.model-photo-analyzer-result{border:1px solid #dde5f2;border-radius:14px;background:#fff;padding:12px;display:grid;gap:10px;}'
      + '.model-photo-analyzer-actions{display:grid;gap:8px;}'
      + '.model-photo-analyzer-field-inline{display:grid;gap:6px;}'
      + '.model-photo-analyzer-field-inline span{font-size:12px;color:#445067;font-weight:700;}'
      + '.model-photo-analyzer-field-inline input{width:100%;border:1px solid #cfd8e6;border-radius:10px;padding:9px 10px;font-size:14px;}'
      + '.model-photo-analyzer-button-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}'
      + '.model-photo-analyzer-link{text-decoration:none;}'
      + '.model-photo-analyzer-link.disabled{opacity:0.55;pointer-events:none;}'
      + '.model-photo-analyzer-chips{display:flex;gap:8px;flex-wrap:wrap;}'
      + '.model-photo-analyzer-chip{border:1px solid #cbd8ef;background:#f6f9ff;color:#27446d;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;}'
      + '.model-photo-analyzer-chip:hover{background:#edf4ff;}'
      + '.model-photo-analyzer-caption{margin:0;font-size:11px;color:#5f6c83;line-height:1.45;}'
      + '.model-photo-analyzer-details{border:1px solid #e9eef8;border-radius:10px;padding:8px;background:#fbfdff;}'
      + '.model-photo-analyzer-details summary{cursor:pointer;font-size:12px;color:#334255;font-weight:700;}'
      + '.model-photo-analyzer-details pre{margin:8px 0 0;font-size:11px;line-height:1.45;white-space:pre-wrap;word-break:break-word;color:#4b586f;}'
      + '.model-photo-analyzer-loading{margin:4px 0;font-size:12px;color:#52617d;}'
      + '.model-photo-analyzer-note{margin:0;font-size:11px;color:#5f6c83;line-height:1.5;}'
      + '@media (max-width:900px){.model-photo-analyzer-body{grid-template-columns:minmax(0,1fr);} .model-photo-analyzer-preview{min-height:180px;} .model-photo-analyzer-button-row .button{width:100%;justify-content:center;}}';
    document.head.appendChild(style);
  }

  function buildUi() {
    var tabButton = document.querySelector('[data-view-tab="chart"]');
    if (tabButton) {
      tabButton.textContent = '写真判別';
    }

    var chartView = document.getElementById('chartView');
    if (!chartView) return false;
    var panel = chartView.querySelector('.panel');
    if (!panel) return false;

    var title = panel.querySelector('h2');
    if (title) {
      title.textContent = '写真判別欄（OCR）';
    }

    var monthlyChart = document.getElementById('monthlyChart');
    if (monthlyChart) {
      monthlyChart.classList.add('model-photo-analyzer-hidden');
    }

    var existing = document.getElementById('modelPhotoAnalyzerRoot');
    if (existing) {
      state.root = existing;
      state.input = document.getElementById('modelPhotoAnalyzerInput');
      state.remaining = document.getElementById('modelPhotoAnalyzerRemaining');
      state.cameraButton = document.getElementById('modelPhotoAnalyzerCameraButton');
      state.galleryButton = document.getElementById('modelPhotoAnalyzerGalleryButton');
      state.previewImage = document.getElementById('modelPhotoAnalyzerPreviewImage');
      state.previewEmpty = document.getElementById('modelPhotoAnalyzerPreviewEmpty');
      state.result = document.getElementById('modelPhotoAnalyzerResult');
      return Boolean(state.input && state.remaining && state.cameraButton && state.galleryButton && state.result);
    }

    var root = document.createElement('div');
    root.id = 'modelPhotoAnalyzerRoot';
    root.className = 'model-photo-analyzer-root';
    root.innerHTML = ''
      + '<div class="model-photo-analyzer-head">'
      + '  <div>'
      + '    <h3 class="model-photo-analyzer-title">OCRで画像文字を抽出してメルカリ検索</h3>'
      + '    <p class="model-photo-analyzer-sub">推定相場・推定利益は使わず、OCR結果から検索キーワードを作成します。</p>'
      + '  </div>'
      + '  <span class="model-photo-analyzer-badge">メルカリ接続: API未使用（検索URL連携）</span>'
      + '</div>'
      + '<div class="model-photo-analyzer-controls">'
      + '  <button class="button button-primary" type="button" id="modelPhotoAnalyzerCameraButton">写真を撮影</button>'
      + '  <button class="button button-secondary" type="button" id="modelPhotoAnalyzerGalleryButton">画像を選択</button>'
      + '  <input id="modelPhotoAnalyzerInput" type="file" accept="image/*" hidden>'
      + '  <span class="model-photo-analyzer-remaining" id="modelPhotoAnalyzerRemaining">本日残り - / ' + DAILY_LIMIT + ' 件</span>'
      + '</div>'
      + '<div class="model-photo-analyzer-body">'
      + '  <div class="model-photo-analyzer-preview">'
      + '    <img id="modelPhotoAnalyzerPreviewImage" alt="写真プレビュー" hidden>'
      + '    <p class="model-photo-analyzer-preview-empty" id="modelPhotoAnalyzerPreviewEmpty">写真を撮影すると、ここにプレビューを表示します。</p>'
      + '  </div>'
      + '  <div class="model-photo-analyzer-result" id="modelPhotoAnalyzerResult">'
      + '    <p class="model-photo-analyzer-preview-empty">写真撮影後にOCRでキーワードを作成し、メルカリ検索へつなげます。</p>'
      + '  </div>'
      + '</div>'
      + '<p class="model-photo-analyzer-note">OCRは端末ブラウザ上で実行されます。認識精度は画像品質に依存するため、抽出後にキーワードを調整してください。</p>';

    if (monthlyChart && monthlyChart.parentNode === panel) {
      panel.insertBefore(root, monthlyChart);
    } else {
      panel.appendChild(root);
    }

    state.root = root;
    state.input = document.getElementById('modelPhotoAnalyzerInput');
    state.remaining = document.getElementById('modelPhotoAnalyzerRemaining');
    state.cameraButton = document.getElementById('modelPhotoAnalyzerCameraButton');
    state.galleryButton = document.getElementById('modelPhotoAnalyzerGalleryButton');
    state.previewImage = document.getElementById('modelPhotoAnalyzerPreviewImage');
    state.previewEmpty = document.getElementById('modelPhotoAnalyzerPreviewEmpty');
    state.result = document.getElementById('modelPhotoAnalyzerResult');
    return Boolean(state.input && state.remaining && state.cameraButton && state.galleryButton && state.result);
  }

  function bindUi() {
    if (!state.input || !state.cameraButton || !state.galleryButton) return;

    state.cameraButton.addEventListener('click', function() {
      openPicker('camera');
    });
    state.galleryButton.addEventListener('click', function() {
      openPicker('gallery');
    });
    state.input.addEventListener('change', function() {
      var file = state.input.files && state.input.files[0] ? state.input.files[0] : null;
      state.input.value = '';
      void handlePickedFile(file);
    });

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
      var tryActivatePhotoView = function(attempt) {
        var chartView = document.getElementById('chartView');
        if (chartView && chartView.classList.contains('active')) {
          return;
        }
        var chartTab = document.querySelector('[data-view-tab="chart"]');
        if (chartTab) {
          chartTab.click();
        }
        if (attempt >= 20) {
          return;
        }
        setTimeout(function() {
          tryActivatePhotoView(attempt + 1);
        }, 180);
      };
      setTimeout(function() {
        tryActivatePhotoView(0);
      }, 120);
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

  window.addEventListener('beforeunload', function() {
    clearPreviewImage();
  });
})();
