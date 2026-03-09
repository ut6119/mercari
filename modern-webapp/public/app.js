let currentData = null;
let draftStatus = 'unsold';
let pending = false;
let toastTimer = null;
const LOCAL_API_ORIGIN = 'http://localhost:3000';
const GAS_API_ENDPOINT = (window.APP_CONFIG && window.APP_CONFIG.gasEndpoint)
  || 'https://script.google.com/macros/s/AKfycbyHvifPGHWhlETNRYE1nzrXJQvSP0TgbF1_J7Txt7qfsZSakE77lzPjNh09TTB_m9SP/exec';
const USE_LOCAL_API = window.location.origin === LOCAL_API_ORIGIN;

const soldProfitValue = document.getElementById('soldProfitValue');
const soldProfitNote = document.getElementById('soldProfitNote');
const unsoldCostValue = document.getElementById('unsoldCostValue');
const unsoldCostNote = document.getElementById('unsoldCostNote');
const overallNetValue = document.getElementById('overallNetValue');
const soldRevenueValue = document.getElementById('soldRevenueValue');
const lastUpdatedValue = document.getElementById('lastUpdatedValue');
const soldCountLabel = document.getElementById('soldCountLabel');
const unsoldCountLabel = document.getElementById('unsoldCountLabel');
const soldTableBody = document.getElementById('soldTableBody');
const unsoldTableBody = document.getElementById('unsoldTableBody');
const quickAddForm = document.getElementById('quickAddForm');
const revenueInput = document.getElementById('revenueInput');
const shippingInput = document.getElementById('shippingInput');
const refreshButton = document.getElementById('refreshButton');
const archiveButton = document.getElementById('archiveButton');
const addButton = document.getElementById('addButton');
const toast = document.getElementById('toast');

init().catch(function(error) {
  showToast(error.message || '初期化に失敗しました。');
});

async function init() {
  bindEvents();
  document.querySelector('[data-status-tab="unsold"]').click();
  await reloadData('最新状態を読み込みました。');
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

  soldTableBody.addEventListener('click', function(event) {
    void handleSoldAction(event);
  });
  unsoldTableBody.addEventListener('click', function(event) {
    void handleUnsoldAction(event);
  });
}

async function handleSoldAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  const action = button.dataset.action;

  if (action === 'delete') {
    if (!window.confirm('この商品を削除しますか？')) return;
    await runApi(async function() {
      const data = await request('/api/items/' + encodeURIComponent(id), { method: 'DELETE' });
      render(data);
      showToast('商品を削除しました。');
    });
    return;
  }

  const payload = readRowPayload(row, action === 'unsold' ? 'unsold' : 'sold');

  await runApi(async function() {
    const data = await request('/api/items', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    render(data);
    showToast(action === 'unsold' ? '未販売在庫へ戻しました。' : '販売済み行を保存しました。');
  });
}

async function handleUnsoldAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = button.closest('tr');
  if (!row) return;
  const id = row.dataset.id;
  const action = button.dataset.action;

  if (action === 'delete') {
    if (!window.confirm('この商品を削除しますか？')) return;
    await runApi(async function() {
      const data = await request('/api/items/' + encodeURIComponent(id), { method: 'DELETE' });
      render(data);
      showToast('商品を削除しました。');
    });
    return;
  }

  const payload = readRowPayload(row, action === 'sell' ? 'sold' : 'unsold');

  await runApi(async function() {
    const data = await request('/api/items', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    render(data);
    showToast(action === 'sell' ? '販売済みに移動しました。' : '未販売行を保存しました。');
  });
}

function readRowPayload(row, status) {
  return {
    id: row.dataset.id,
    status: status,
    name: row.querySelector('[data-field="name"]').value.trim(),
    revenue: row.querySelector('[data-field="revenue"]').value,
    shipping: row.querySelector('[data-field="shipping"]').value,
    cost: row.querySelector('[data-field="cost"]').value
  };
}

async function reloadData(message) {
  await runApi(async function() {
    const data = await request('/api/dashboard');
    render(data);
    if (message) showToast(message);
  });
}

async function request(url, options) {
  if (USE_LOCAL_API) {
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
  } else {
    throw new Error('未対応のAPI呼び出しです。');
  }

  const connector = GAS_API_ENDPOINT.indexOf('?') >= 0 ? '&' : '?';
  const targetUrl = GAS_API_ENDPOINT + connector + params.toString();
  const response = await fetch(targetUrl, { method: 'GET' });
  const data = await response.json().catch(function() { return {}; });
  if (!response.ok) {
    throw new Error(data.error || '通信に失敗しました。');
  }
  if (data && data.error) {
    throw new Error(data.error);
  }
  return data;
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
  [refreshButton, archiveButton, addButton].forEach(function(button) {
    button.disabled = isPending;
  });
}

function render(data) {
  currentData = data;
  const summary = data.summary;

  soldProfitValue.textContent = formatYen(summary.soldProfit);
  soldProfitNote.textContent = summary.soldCount + '件 / 利益率 ' + formatPercent(summary.soldMargin);
  unsoldCostValue.textContent = formatYen(summary.unsoldCost);
  unsoldCostNote.textContent = summary.unsoldCount + '件 / 現在の投資額';
  overallNetValue.textContent = formatSignedYen(summary.overallNet);
  overallNetValue.style.color = summary.overallNet < 0 ? '#9f3f3f' : '#1f6a52';
  soldRevenueValue.textContent = formatYen(summary.soldRevenue);
  lastUpdatedValue.textContent = '最終更新 ' + data.lastUpdated;
  soldCountLabel.textContent = summary.soldCount + '件';
  unsoldCountLabel.textContent = summary.unsoldCount + '件';

  soldTableBody.innerHTML = data.soldItems.length
    ? data.soldItems.map(renderSoldRow).join('')
    : '<tr class="table-empty"><td colspan="7">販売済み商品はまだありません。</td></tr>';

  unsoldTableBody.innerHTML = data.unsoldItems.length
    ? data.unsoldItems.map(renderUnsoldRow).join('')
    : '<tr class="table-empty"><td colspan="7">未販売在庫はまだありません。</td></tr>';
}

function renderSoldRow(item) {
  const rowClass = item.profit < 0 || item.margin < 0 ? 'row-sold-bad' : (item.margin >= 0.2 ? 'row-sold-good' : '');
  const rateClass = item.margin < 0 ? 'bad' : (item.margin >= 0.2 ? 'good' : 'neutral');
  return `
    <tr class="${rowClass}" data-id="${escapeHtml(item.id)}">
      <td><input data-field="name" value="${escapeHtml(item.name)}"></td>
      <td><input data-field="revenue" type="number" min="0" step="1" value="${escapeHtml(String(item.revenue || ''))}"></td>
      <td><input data-field="shipping" type="number" min="0" step="1" value="${escapeHtml(String(item.shipping || 0))}"></td>
      <td><input data-field="cost" type="number" min="0" step="1" value="${escapeHtml(String(item.cost || 0))}"></td>
      <td class="money">${formatSignedYen(item.profit)}</td>
      <td class="rate"><span class="pill ${rateClass}">${formatPercent(item.margin)}</span></td>
      <td class="actions">
        <div class="inline-actions">
          <button class="button button-primary mini" type="button" data-action="save">保存</button>
          <button class="button button-secondary mini" type="button" data-action="unsold">未販へ</button>
          <button class="button button-danger mini" type="button" data-action="delete">削除</button>
        </div>
      </td>
    </tr>
  `;
}

function renderUnsoldRow(item) {
  return `
    <tr class="row-unsold" data-id="${escapeHtml(item.id)}">
      <td><input data-field="name" value="${escapeHtml(item.name)}"></td>
      <td><input data-field="revenue" type="number" min="0" step="1" placeholder="0" value="${escapeHtml(String(item.revenue || ''))}"></td>
      <td><input data-field="shipping" type="number" min="0" step="1" value="${escapeHtml(String((item.shipping === '' || item.shipping === null || typeof item.shipping === 'undefined') ? 160 : item.shipping))}"></td>
      <td><input data-field="cost" type="number" min="0" step="1" value="${escapeHtml(String(item.cost || 0))}"></td>
      <td class="money">${formatSignedYen(item.profit)}</td>
      <td class="rate"><span class="pill neutral">--</span></td>
      <td class="actions">
        <div class="inline-actions">
          <button class="button button-secondary mini" type="button" data-action="save">保存</button>
          <button class="button button-primary mini" type="button" data-action="sell">販売済へ</button>
          <button class="button button-danger mini" type="button" data-action="delete">削除</button>
        </div>
      </td>
    </tr>
  `;
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
