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
  unsoldTableBody.addEventListener('change', function(event) {
    if (event.target.matches('[data-select-row]')) {
      updateSelectedCount('unsold');
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
    shipping: shippingRaw === '' ? '160' : shippingRaw,
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
  if (action === 'select-all') {
    setRowsSelected(status, true);
    return;
  }
  if (action === 'clear-selection') {
    setRowsSelected(status, false);
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

    render(latestData || await request('/api/dashboard'));
    setRowsSelected('sold', false);
    setRowsSelected('unsold', false);

    if (action === 'save') showToast('選択行を保存しました。');
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
      toggleButton.textContent = enabled ? '選択終了' : '選択';
    }
  }
  if (!enabled) {
    setRowsSelected(status, false);
  } else {
    updateSelectedCount(status);
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
  const bulkButtons = Array.from(document.querySelectorAll('[data-bulk-action]'));
  [refreshButton, archiveButton, addButton].concat(bulkButtons).forEach(function(button) {
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
      <td class="money">${formatSignedYen(item.profit)}</td>
      <td class="rate"><span class="pill ${rateClass}">${formatPercent(item.margin)}</span></td>
    </tr>
  `;
}

function renderUnsoldRow(item) {
  return `
    <tr class="row-unsold" data-id="${escapeHtml(item.id)}">
      <td class="selection-cell"><input data-select-row type="checkbox" aria-label="選択"></td>
      <td><input data-field="name" value="${escapeHtml(item.name)}"></td>
      <td><input data-field="revenue" type="number" min="0" step="1" placeholder="0" value="${escapeHtml(String(item.revenue || ''))}"></td>
      <td><input data-field="shipping" type="number" min="0" step="1" value="${escapeHtml(String((item.shipping === '' || item.shipping === null || typeof item.shipping === 'undefined') ? 160 : item.shipping))}"></td>
      <td><input data-field="cost" type="number" min="0" step="1" value="${escapeHtml(String(item.cost || 0))}"></td>
      <td class="money">${formatSignedYen(item.profit)}</td>
      <td class="rate"><span class="pill neutral">${formatPercent(item.margin)}</span></td>
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
