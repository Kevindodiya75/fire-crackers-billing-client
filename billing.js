const BILLING_API_BASE = 'http://localhost:4000';

let billState = {
  lines: [],
  itemCode: '',
  qty: '',
  discount: 0,
  error: '',
  success: '',
  items: [],
  grandTotal: 0,
  finalTotal: 0,  
  billNo: null,
  focusedItem: null,
  lastSavedBillData: null
};

let gKeyTracker = {
  count: 0,
  lastPressTime: 0,
  timeWindow: 2000
};

function escapeHTML(s) {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

async function fetchActiveItems() {
  const headers = {};
  if (window.appState && window.appState.token) headers.Authorization = 'Bearer ' + window.appState.token;
  const res = await (typeof proxyFetch === 'function'
    ? proxyFetch('/api/items?filter=active', { method: 'GET', headers })
    : fetch(`${BILLING_API_BASE}/api/items?filter=active`, { method: 'GET', headers, credentials: 'include' }));
  if (res && res.status === 200) {
    const data = await (res.json ? res.json() : res.json());
    billState.items = Array.isArray(data) ? data : [];
  } else {
    billState.items = [];
  }
}

function findItemByCode(code) {
  if (!code) return null;
  const lowerCode = String(code).toLowerCase();
  const foundItem = billState.items.find(item => String(item.code || '').toLowerCase() === lowerCode);
  return foundItem || null;
}

function recalcTotals() {
  billState.grandTotal = billState.lines.reduce((sum, l) => sum + l.qty * l.price, 0);
  billState.finalTotal = billState.grandTotal - (billState.discount || 0);
  if (billState.finalTotal < 0) billState.finalTotal = 0;
}

function allowOnlyNumbers(e, allowEnter = false, onEnterCallback = null) {
  if ([8, 9, 27, 13, 37, 38, 39, 40, 46].indexOf(e.keyCode) !== -1 ||
      (e.keyCode === 65 && e.ctrlKey === true) ||
      (e.keyCode === 67 && e.ctrlKey === true) ||
      (e.keyCode === 86 && e.ctrlKey === true) ||
      (e.keyCode === 88 && e.ctrlKey === true)) {
    if (allowEnter && e.key === 'Enter' && onEnterCallback) {
      e.preventDefault();
      onEnterCallback();
    }
    return;
  }
  if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
    e.preventDefault();
  }
}

function loadPrintModule() {
  return new Promise((resolve, reject) => {
    if (window.printerTemplate && typeof window.printerTemplate.printBill === 'function') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'printerTemplate.js';
    script.onload = () => {
      console.log('printerTemplate.js loaded');
      resolve();
    };
    script.onerror = () => {
      console.error('Failed to load printerTemplate.js');
      reject(new Error('Failed to load print module'));
    };
    document.body.appendChild(script);
  });
}

async function printBill(billData) {
  try {
    await loadPrintModule();
    
    if (window.printerTemplate && typeof window.printerTemplate.printBill === 'function') {
      await window.printerTemplate.printBill(billData);
      billState.success = `Bill #${billData.bill_no} sent to printer!`;
      billState.lastSavedBillData = null;
    } else {
      console.warn('Print module not loaded');
      billState.success = `Print module not available`;
    }
  } catch (printErr) {
    console.error('Print error:', printErr);
    billState.error = `Print error: ${printErr.message}`;
  }
  renderBilling();
}

async function saveBill() {
  if (!billState.lines.length) {
    billState.error = 'Add at least one item';
    renderBilling();
    return null;
  }
  
  const saveBtn = document.getElementById('save-bill');
  const originalText = saveBtn ? saveBtn.textContent : 'Save & Print Bill';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
  }
  
  const headers = { 'Content-Type': 'application/json' };
  if (window.appState && window.appState.token) headers.Authorization = 'Bearer ' + window.appState.token;
  
  try {
    const res = await (typeof proxyFetch === 'function'
      ? proxyFetch('/api/bills', { method: 'POST', headers, body: JSON.stringify({ 
          lines: billState.lines, 
          discount_pct: billState.grandTotal > 0 ? ((billState.discount / billState.grandTotal) * 100) : 0
        }) })
      : fetch(`${BILLING_API_BASE}/api/bills`, { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ 
          lines: billState.lines, 
          discount_pct: billState.grandTotal > 0 ? ((billState.discount / billState.grandTotal) * 100) : 0
        }) }));
    const data = await (res.json ? res.json() : res.json());
    if (!res.ok) throw new Error(data.error || 'Save failed');
    
    // Store bill data BEFORE clearing - make a deep copy of lines
    const billDataForPrint = {
      bill_no: data.bill_no,
      lines: JSON.parse(JSON.stringify(billState.lines)),
      grand_total: billState.grandTotal,
      discount_pct: billState.grandTotal > 0 ? ((billState.discount / billState.grandTotal) * 100) : 0,
      final_total: billState.finalTotal,
      created_at: new Date().toISOString()
    };
    
    billState.lastSavedBillData = billDataForPrint;
    billState.success = `Bill #${data.bill_no} saved!`;
    
    // Clear the form AFTER storing
    billState.lines = [];
    billState.discount = 0;
    billState.grandTotal = 0;
    billState.finalTotal = 0;
    
    return billDataForPrint;
  } catch (err) {
    billState.error = err.message || 'Save failed';
    renderBilling();
    return null;
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  }
}

async function saveAndPrintBill() {
  const billData = await saveBill();
  if (billData) {
    await printBill(billData);
  } else {
    billState.error = billState.error || 'Cannot print - save failed';
    renderBilling();
  }
}

function renderBilling() {
  recalcTotals();
  const app = document.getElementById('app');
  app.classList.add('billing');
  app.innerHTML = `
    <h2>New Bill</h2>

  <table class="entry-table" role="presentation">
  <colgroup>
    <col class="col-code">
    <col class="col-name">
    <col class="col-price">
    <col class="col-qty">
    <col class="col-total">
    <col class="col-action">
  </colgroup>
  <thead>
    <tr>
      <th>Code</th>
      <th>Item Name</th>
      <th>Price</th>
      <th>Qty</th>
      <th>Total</th>
      <th></th>
    </tr>
  </thead>
  <tbody>
    <tr class="entry-row">
      <td class="input-cell"><input id="item-code" class="input-code" inputmode="numeric" placeholder="Code" value="${escapeHTML(billState.itemCode)}" type="text" pattern="[0-9]*" /></td>
      <td class="input-cell"><input id="item-name" class="input-name readonly-input" placeholder="Item name" value="${escapeHTML(billState.focusedItem ? billState.focusedItem.name : '')}" readonly /></td>
      <td class="input-cell"><input id="item-price" class="input-price readonly-input" placeholder="Price" value="${billState.focusedItem ? Number(billState.focusedItem.price).toFixed(2) : ''}" readonly /></td>
      <td class="input-cell"><input id="qty" class="input-qty" type="text" inputmode="numeric" pattern="[0-9]*" min="1" step="1" placeholder="" value="${escapeHTML(billState.qty)}" /></td>
      <td class="input-cell total" id="entry-total">${billState.focusedItem && billState.qty ? (Number(billState.qty) * Number(billState.focusedItem.price)).toFixed(2) : ''}</td>
      <td class="input-cell"><button id="add-btn" class="add-btn">Add</button></td>
    </tr>
  </tbody>
</table>

    <div class="error" style="color:#b00;margin-top:8px">${escapeHTML(billState.error)}</div>
<table class="lines-table" role="table" aria-label="Added items">
  <colgroup>
    <col class="col-code">
    <col class="col-name">
    <col class="col-price">
    <col class="col-qty">
    <col class="col-total">
    <col class="col-action">
  </colgroup>
  <tbody id="lines-body">
    ${billState.lines.map((l, i) => `
      <tr>
        <td>${escapeHTML(l.item_code)}</td>
        <td>${escapeHTML(l.item_name)}</td>
        <td class="total">₹${Number(l.price).toFixed(2)}</td>
        <td style="text-align:center">${escapeHTML(l.qty)}</td>
        <td class="total">₹${(l.qty * l.price).toFixed(2)}</td>
        <td><button data-del="${i}" tabindex="-1">Del</button></td>
      </tr>
    `).join('')}
  </tbody>
</table>

    <div style="margin-top:10px;font-size:1.1em;">
      <div><b>Grand Total:</b> <span class="grand-total-value">₹${billState.grandTotal.toFixed(2)}</span></div>
      <div style="margin-top:4px;">
        <b>Discount %:</b> <input id="discount-percent" type="number" min="0" max="100" step="0.01" value="0" style="width:80px;border:1px solid #ccc;padding:2px 4px;font-size:1em;" />
        <span style="margin-left:10px;"><b>or ₹:</b></span> <input id="discount" type="number" min="0" step="0.01" value="${billState.discount}" style="width:100px;border:1px solid #ccc;padding:2px 4px;font-size:1em;" />
      </div>
      <div style="margin-top:4px;font-size:1.15em;">
        <b>Final Total:</b> <span class="final-total-value">₹${billState.finalTotal.toFixed(2)}</span>
      </div>
    </div>

    <button id="save-bill" style="margin-top:12px;width:100%;font-size:1.05em;">Save & Print Bill</button>
    <div class="success" style="color:green;margin-top:8px">${escapeHTML(billState.success)}</div>
    <button id="logout-btn" style="margin-top:8px;width:100%;">Logout</button>
  `;

  const codeEl = document.getElementById('item-code');
  const nameEl = document.getElementById('item-name');
  const priceEl = document.getElementById('item-price');
  const qtyEl = document.getElementById('qty');
  const addBtn = document.getElementById('add-btn');
  const entryTotalEl = document.getElementById('entry-total');

  setTimeout(() => {
    if (codeEl) {
      codeEl.focus();
      codeEl.select();
    }
  }, 0);

  function updatePreviewForCode(code) {
    billState.itemCode = code;
    const item = findItemByCode(code);
    billState.focusedItem = item;
    billState.error = '';
    nameEl.value = item ? item.name : '';
    priceEl.value = item ? Number(item.price).toFixed(2) : '';
    if (item && qtyEl.value === '') {
      entryTotalEl.textContent = '';
    } else if (item && qtyEl.value) {
      const total = Number(qtyEl.value || 0) * Number(item.price || 0);
      entryTotalEl.textContent = total ? Number(total).toFixed(2) : '';
    } else {
      entryTotalEl.textContent = '';
    }
  }

  codeEl.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
    updatePreviewForCode(e.target.value.trim());
  });
  
  codeEl.addEventListener('keydown', (e) => {
    allowOnlyNumbers(e);
    if (e.key === 'Tab') {
      e.preventDefault();
      if (qtyEl) {
        qtyEl.focus();
        qtyEl.select();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (qtyEl) qtyEl.focus();
    }
  });

  codeEl.addEventListener('blur', () => {
    updatePreviewForCode(codeEl.value.trim());
  });

  qtyEl.addEventListener('input', () => {
    qtyEl.value = qtyEl.value.replace(/[^0-9]/g, '');
    billState.qty = qtyEl.value;
    if (billState.focusedItem && billState.qty) {
      const total = Number(billState.qty || 0) * Number(billState.focusedItem.price || 0);
      entryTotalEl.textContent = total ? Number(total).toFixed(2) : '';
    } else {
      entryTotalEl.textContent = '';
    }
  });

  qtyEl.addEventListener('keydown', (e) => {
    allowOnlyNumbers(e, true, () => addBtn.click());
  });

  addBtn.onclick = () => {
    const code = (codeEl.value || '').trim();
    const qtyVal = (qtyEl.value || '').trim();
    const qty = Number(qtyVal) || 0;
    const item = findItemByCode(code);
    if (!item) {
      billState.error = 'Item not found or inactive';
      renderBilling();
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      billState.error = 'Enter a valid quantity';
      renderBilling();
      return;
    }
    billState.lines.push({
      item_code: item.code,
      item_name: item.name,
      qty,
      price: Number(item.price)
    });
    billState.itemCode = '';
    billState.qty = '';
    billState.focusedItem = null;
    billState.error = '';
    billState.success = '';
    renderBilling();
    setTimeout(() => {
      const el = document.getElementById('item-code');
      if (el) { el.focus(); el.select(); }
    }, 0);
  };

  document.querySelectorAll('button[data-del]').forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.getAttribute('data-del'));
      if (!Number.isNaN(idx)) {
        billState.lines.splice(idx, 1);
        renderBilling();
      }
    };
  });

  const discountEl = document.getElementById('discount');
  const discountPercentEl = document.getElementById('discount-percent');
  
  if (discountPercentEl) {
    discountPercentEl.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^0-9.]/g, '');
      let percent = Number(e.target.value) || 0;
      
      if (percent > 100) {
        percent = 100;
        e.target.value = '100';
      }
      
      billState.discount = (billState.grandTotal * percent) / 100;
      
      if (discountEl) {
        discountEl.value = billState.discount.toFixed(2);
      }
      
      recalcTotals();
      
      const finalTotalEl = document.querySelector('.final-total-value');
      if (finalTotalEl) finalTotalEl.textContent = `₹${billState.finalTotal.toFixed(2)}`;
    });
    
    discountPercentEl.addEventListener('keydown', (e) => {
      if ([8, 9, 27, 13, 37, 38, 39, 40, 46, 190, 110].indexOf(e.keyCode) !== -1 ||
          (e.keyCode === 65 && e.ctrlKey === true) ||
          (e.keyCode === 67 && e.ctrlKey === true) ||
          (e.keyCode === 86 && e.ctrlKey === true) ||
          (e.keyCode === 88 && e.ctrlKey === true)) {
        return;
      }
      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault();
      }
    });
  }
  
  if (discountEl) {
    discountEl.addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^0-9.]/g, '');
      billState.discount = Number(e.target.value) || 0;
      
      if (billState.discount > billState.grandTotal) {
        billState.discount = billState.grandTotal;
        e.target.value = billState.grandTotal.toFixed(2);
      }
      
      if (discountPercentEl && billState.grandTotal > 0) {
        const calculatedPercent = (billState.discount / billState.grandTotal) * 100;
        discountPercentEl.value = calculatedPercent.toFixed(2);
      }
      
      recalcTotals();
      
      const finalTotalEl = document.querySelector('.final-total-value');
      if (finalTotalEl) finalTotalEl.textContent = `₹${billState.finalTotal.toFixed(2)}`;
    });
    
    discountEl.addEventListener('keydown', (e) => {
      if ([8, 9, 27, 13, 37, 38, 39, 40, 46, 190, 110].indexOf(e.keyCode) !== -1 ||
          (e.keyCode === 65 && e.ctrlKey === true) ||
          (e.keyCode === 67 && e.ctrlKey === true) ||
          (e.keyCode === 86 && e.ctrlKey === true) ||
          (e.keyCode === 88 && e.ctrlKey === true)) {
        return;
      }
      if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault();
      }
    });
  }

  document.getElementById('save-bill').onclick = async () => {
    await saveAndPrintBill();
  };

  document.getElementById('logout-btn').onclick = async () => {
    try {
      if (typeof proxyFetch === 'function') {
        await proxyFetch('/api/logout', { method: 'POST' });
      } else {
        await fetch(`${BILLING_API_BASE}/api/logout`, { method: 'POST', credentials: 'include' });
      }
    } catch (_) {}
    window.location.reload();
  };
}

async function startBillingUI() {
  await fetchActiveItems();
  renderBilling();
  
  document.addEventListener('keydown', async (e) => {
    if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const discountEl = document.getElementById('discount');
      if (discountEl) {
        discountEl.focus();
        discountEl.select();
      }
      return;
    }
    
    if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      
      if (now - gKeyTracker.lastPressTime > gKeyTracker.timeWindow) {
        gKeyTracker.count = 0;
      }
      
      gKeyTracker.count++;
      gKeyTracker.lastPressTime = now;
      
      if (gKeyTracker.count === 1) {
        const billData = await saveBill();
        if (billData) {
          renderBilling();
        }
      } else if (gKeyTracker.count === 2) {
        gKeyTracker.count = 0;
        // If there are items in the current bill, save and print the current bill
        if (billState.lines.length > 0) {
          const billData = await saveBill();
          if (billData) {
            await printBill(billData);
          } else {
            billState.error = billState.error || 'Cannot print - save failed';
            renderBilling();
          }
        } else if (billState.lastSavedBillData) {
          // Only print old bill if there are no new items
          const billToPrint = billState.lastSavedBillData;
          await printBill(billToPrint);
        } else {
          billState.error = 'No bill to save and print. Add items first.';
          renderBilling();
        }
      }
    }
  }, true);   
}

window.startBillingUI = startBillingUI;