const API_BASE = 'http://localhost:4000';
const app = document.getElementById('app');

let state = {
  token: null,
  role: null,
  error: '',
  users: [],
};

function setAppStateToken(token) {
  window.appState = window.appState || {};
  window.appState.token = token;
}

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

function renderLogin() {
  console.log('origin =', window.location.origin);
  app.innerHTML = `
    <section>
      <h3>Login</h3>
      <form id="login-form">
        <label>Username<input name="username" placeholder="Username" autocomplete="username" required autofocus /></label>
        <label>Password<input name="password" type="password" placeholder="Password" autocomplete="current-password" required /></label>
        <div style="margin-top:8px">
          <button type="submit" id="login-btn">Login</button>
          <span id="login-loading" style="display:none;margin-left:8px">Loading...</span>
        </div>
        <div class="error" id="login-error" aria-live="polite" style="color:#b00;margin-top:8px">${escapeHTML(state.error)}</div>
      </form>
    </section>
  `;
  const form = document.getElementById('login-form');
  const btn = document.getElementById('login-btn');
  const loading = document.getElementById('login-loading');
  form.onsubmit = async e => {
    e.preventDefault();
    btn.disabled = true;
    loading.style.display = 'inline';
    state.error = '';
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    try {
      const res = await proxyFetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await (res.json ? res.json() : res.json());
      if (!res.ok) throw new Error(data.error || 'Login failed');
      state.token = data.token;
      state.role = data.role;
      state.error = '';
      setAppStateToken(state.token);
      if (state.role === 'admin') await fetchUsers();
      render();
    } catch (err) {
      state.error = err.message;
      render();
    } finally {
      btn.disabled = false;
      loading.style.display = 'none';
    }
  };
}

async function fetchUsers() {
  try {
    const res = await proxyFetch('/api/users', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + (state.token || '') }
    });
    const data = await (res.json ? res.json() : res.json());
    if (res.ok) state.users = data || [];
    else state.users = [];
  } catch (err) {
    state.error = err.message;
    state.users = [];
  }
}

function renderUserList() {
  let rows = state.users.map(u => `
    <tr>
      <td>${escapeHTML(u.username)}</td>
      <td>${escapeHTML(u.role)}</td>
      <td>${u.active ? 'Yes' : 'No'}</td>
      <td>${u.created_at ? escapeHTML(u.created_at.slice(0, 10)) : ''}</td>
      <td>${u.last_login ? escapeHTML(u.last_login.slice(0, 19).replace('T', ' ')) : ''}</td>
    </tr>
  `).join('');
  if (!rows) rows = '<tr><td colspan="5">No users</td></tr>';
  return `
    <div class="user-list">
      <h3>Users</h3>
      <table>
        <tr><th>Username</th><th>Role</th><th>Active</th><th>Created</th><th>Last Login</th></tr>
        ${rows}
      </table>
    </div>
  `;
}

function renderCreateUser() {
  return `
    <h3>Create User</h3>
    <form id="create-user-form">
      <label>Username<input name="username" placeholder="Username" required /></label>
      <label>Password<input name="password" type="password" placeholder="Password" required /></label>
      <label>Role
        <select name="role">
          <option value="biller">Biller</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <div style="margin-top:8px">
        <button type="submit" id="create-btn">Create</button>
        <span id="create-loading" style="display:none;margin-left:8px">Creating...</span>
      </div>
      <div class="error" id="create-error" aria-live="polite" style="color:#b00;margin-top:8px">${escapeHTML(state.error)}</div>
    </form>
  `;
}

function renderAdmin() {
  app.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <div><strong>Admin Console</strong></div>
      <div><button id="logout-btn">Logout</button></div>
    </div>
    ${renderCreateUser()}
    ${renderUserList()}
    ${state.loading ? '<div style="margin-top:8px">Loading users...</div>' : ''}
  `;
  document.getElementById('logout-btn').onclick = async () => {
    try {
      await proxyFetch('/api/logout', { method: 'POST' });
    } catch (_) {}
    state = { token: null, role: null, error: '', users: [] };
    setAppStateToken(null);
    render();
  };
  const form = document.getElementById('create-user-form');
  const createBtn = document.getElementById('create-btn');
  const createLoading = document.getElementById('create-loading');
  form.onsubmit = async e => {
    e.preventDefault();
    createBtn.disabled = true;
    createLoading.style.display = 'inline';
    state.error = '';
    const fd = new FormData(form);
    const body = Object.fromEntries(fd.entries());
    try {
      const res = await proxyFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (state.token || '') },
        body: JSON.stringify(body)
      });
      const data = await (res.json ? res.json() : res.json());
      if (!res.ok) throw new Error(data.error || 'Create failed');
      state.error = '';
      await fetchUsers();
      render();
    } catch (err) {
      state.error = err.message;
      render();
    } finally {
      createBtn.disabled = false;
      createLoading.style.display = 'none';
    }
  };
}

function renderBiller() {
  if (!window.startBillingUI) {
    const script = document.createElement('script');
    script.src = 'billing.js';
    script.onload = () => window.startBillingUI && window.startBillingUI();
    document.body.appendChild(script);
  } else {
    window.startBillingUI();
  }
}


function render() {
  if (!state.token) renderLogin();
  else if (state.role === 'admin') renderAdmin();
  else renderBiller();
}

render();
