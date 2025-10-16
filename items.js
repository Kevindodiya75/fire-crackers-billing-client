let itemsState = {
  items: [],
  editingItem: null,
  itemFilter: 'all',
  loading: false,
  error: ''
};

async function proxyFetch(path, opts = {}) {
  if (window.api && typeof window.api.fetch === 'function') {
    const res = await window.api.fetch(path, opts);
    return {
      status: res.status || 0,
      ok: (res.status && res.status >= 200 && res.status < 300) || false,
      json: async () => {
        try { return res.body ? JSON.parse(res.body) : null; } catch { return null; }
      },
      text: async () => (res.body || ''),
    };
  } else {
    const fetchOpts = {
      method: opts.method || 'GET',
      headers: opts.headers || {},
      body: opts.body,
      credentials: opts.credentials || 'include',
    };
    const res = await fetch((path.startsWith('http') ? path : API_BASE + path), fetchOpts);
    return res;
  }
}

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function fetchItems() {
  itemsState.loading = true;
  itemsState.error = '';
  try {
    const res = await proxyFetch('/api/Get-items', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + (window.appState?.token || '') }
    });
    const data = await res.json();
    if (res.ok) itemsState.items = data || [];
    else {
      itemsState.items = [];
      itemsState.error = data.error || 'Failed to fetch items';
    }
  } catch (err) {
    itemsState.error = err.message;
    itemsState.items = [];
  } finally {
    itemsState.loading = false;
  }
}

function getFilteredItems() {
  if (itemsState.itemFilter === 'all') return itemsState.items;
  return itemsState.items.filter(item => item.status === itemsState.itemFilter);
}

function renderItemForm() {
  const item = itemsState.editingItem;
  const isEdit = !!item;  
  return `
    <div class="item-form-card">
      <h3 class="item-form-title">${isEdit ? 'Edit Item' : 'Add New Item'}</h3>
      <form id="item-form" class="item-input-form">
        <label class="item-field-label">
          Code *
          <input class="item-text-input" name="code" placeholder="Item Code" value="${escapeHTML(item?.code || '')}" required />
        </label>
        <label class="item-field-label">
          Name *
          <input class="item-text-input" name="name" placeholder="Item Name" value="${escapeHTML(item?.name || '')}" required />
        </label>
        <label class="item-field-label">
          Price *
          <input class="item-text-input" name="price" type="number" step="0.01" placeholder="Price" value="${item?.price || ''}" required />
        </label>
        <label class="item-field-label">
          Unit
          <input class="item-text-input" name="unit" placeholder="Unit (e.g., kg, pcs)" value="${escapeHTML(item?.unit || '')}" />
        </label>
        <label class="item-field-label">
          Notes
          <textarea class="item-textarea-input" name="notes" placeholder="Additional notes (optional)" rows="3">${escapeHTML(item?.notes || '')}</textarea>
        </label>
        <div class="item-form-buttons">
          <button type="submit" class="item-submit-btn" id="item-btn">${isEdit ? 'Update Item' : 'Add Item'}</button>
          ${isEdit ? '<button type="button" id="cancel-edit-btn" class="item-cancel-btn">Cancel</button>' : ''}
          <span id="item-loading" class="item-loader-text" style="display:none">Processing...</span>
        </div>
        <div class="item-error-msg" id="item-error" aria-live="polite" style="display:none"></div>
      </form>
    </div>
  `;
}

function renderItemsList() {
  const filteredItems = getFilteredItems();

  let rows = filteredItems.map(item => `
    <tr class="item-table-row">
      <td class="item-col-code">${escapeHTML(item.code)}</td>
      <td class="item-col-name">${escapeHTML(item.name)}</td>
      <td class="item-col-price">${Number(item.price).toFixed(2)}</td>
      <td class="item-col-unit">${escapeHTML(item.unit || '-')}</td>
      <td class="item-col-status"><span class="item-status-pill item-status-${item.status}">${escapeHTML(item.status)}</span></td>
      <td class="item-col-notes">${escapeHTML(item.notes || '-')}</td>
      <td class="item-col-actions">
        <button class="item-action-btn item-btn-edit" onclick="editItem(${item.id})">Edit</button>
        <button class="item-action-btn item-btn-toggle" onclick="toggleItemStatus(${item.id}, '${item.status}')">
          ${item.status === 'active' ? 'Pause' : 'Active'}
        </button>
        ${item.status !== 'deleted' ? `<button class="item-action-btn item-btn-delete" onclick="deleteItem(${item.id})">Del</button>` : ''}
      </td>
    </tr>
  `).join('');
  
  if (!rows) rows = '<tr><td colspan="7" class="item-empty-message">No items found</td></tr>';
  
  return `
    <div class="item-list-section">
      <div class="item-header-bar">
        <h3 class="item-list-title">All Items (${filteredItems.length})</h3>
        <div class="item-filter-group">
          <button onclick="filterItems('all')" class="item-filter-tab item-filter-all ${itemsState.itemFilter === 'all' ? 'item-filter-active' : ''}">All</button>
          <button onclick="filterItems('active')" class="item-filter-tab item-filter-active-type ${itemsState.itemFilter === 'active' ? 'item-filter-active' : ''}">Active</button>
          <button onclick="filterItems('paused')" class="item-filter-tab item-filter-paused-type ${itemsState.itemFilter === 'paused' ? 'item-filter-active' : ''}">Paused</button>
          <button onclick="filterItems('deleted')" class="item-filter-tab item-filter-deleted-type ${itemsState.itemFilter === 'deleted' ? 'item-filter-active' : ''}">Deleted</button>
        </div>
      </div>
      <table class="item-data-table">
        <thead class="item-table-head">
          <tr>
            <th class="item-col-code">Code</th>
            <th class="item-col-name">Name</th>
            <th class="item-col-price">Price</th>
            <th class="item-col-unit">Unit</th>
            <th class="item-col-status">Status</th>
            <th class="item-col-notes">Notes</th>
            <th class="item-col-actions">Actions</th>
          </tr>
        </thead>
        <tbody class="item-table-body">${rows}</tbody>
      </table>
    </div>
  `;
}

function setupItemForm() {
  const form = document.getElementById('item-form');
  const itemBtn = document.getElementById('item-btn');
  const itemLoading = document.getElementById('item-loading');
  const itemError = document.getElementById('item-error');
  const cancelBtn = document.getElementById('cancel-edit-btn');
  
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      itemsState.editingItem = null;
      renderItems();
    };
  }
  
  form.onsubmit = async e => {
    e.preventDefault();
    itemBtn.disabled = true;
    itemLoading.style.display = 'inline';
    itemError.style.display = 'none';
    itemError.textContent = '';
    
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    
    try {
      const isEdit = !!itemsState.editingItem;
      const url = isEdit ? `/api/items/${itemsState.editingItem.id}` : '/api/items';
      const method = isEdit ? 'PUT' : 'POST';
      
      const res = await proxyFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.appState?.token || '') },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Operation failed');
      
      itemsState.editingItem = null;
      await fetchItems();
      renderItems();
    } catch (err) {
      itemError.textContent = err.message;
      itemError.style.display = 'block';
    } finally {
      itemBtn.disabled = false;
      itemLoading.style.display = 'none';
    }
  };
}

function renderItems() {
  const container = document.getElementById('items-container');
  if (!container) return;
  
  container.innerHTML = `
    ${renderItemForm()}
    ${itemsState.loading ? '<div class="item-loader-text">Loading items...</div>' : renderItemsList()}
    ${itemsState.error ? `<div class="item-error-msg" style="display:block">${escapeHTML(itemsState.error)}</div>` : ''}
  `;
  
  setupItemForm();
}

window.filterItems = (filter) => {
  itemsState.itemFilter = filter;
  renderItems();
};

window.editItem = (id) => {
  itemsState.editingItem = itemsState.items.find(item => item.id === id);
  renderItems();
};

window.toggleItemStatus = async (id, currentStatus) => {
  const newStatus = currentStatus === 'active' ? 'paused' : 'active';
  
  try {
    const res = await proxyFetch(`/api/items/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.appState?.token || '') },
      body: JSON.stringify({ status: newStatus })
    });
    if (!res.ok) throw new Error('Status update failed');
    
    await fetchItems();
    renderItems();
  } catch (err) {
    alert('Error updating status: ' + err.message);
  }
};

window.deleteItem = async (id) => {
  if (!confirm('Are you sure you want to mark this item as deleted?')) return;
  
  try {
    const res = await proxyFetch(`/api/items/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.appState?.token || '') },
      body: JSON.stringify({ status: 'deleted' })
    });
    if (!res.ok) throw new Error('Delete failed');
    
    await fetchItems();
    renderItems();
  } catch (err) {
    alert('Error deleting item: ' + err.message);
  }
};

window.initItemsManagement = async () => {
  await fetchItems();
  renderItems();
};