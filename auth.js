/* ==========================================================
   Weather Dashboard – shared auth + storage layer (auth.js)
   Front-end demo: data lives in the browser (localStorage).
   ========================================================== */
const WD = (() => {
  /* ---------- Safe storage (falls back to memory if blocked) ---------- */
  const mem = {};
  const store = {
    get(k, fb = null) {
      try { const v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); }
      catch (e) { return k in mem ? mem[k] : fb; }
    },
    set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { mem[k] = v; }
    },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} delete mem[k]; }
  };
  const sess = {
    get() { try { return JSON.parse(sessionStorage.getItem('wd_session')); } catch (e) { return null; } },
    set(v) { try { sessionStorage.setItem('wd_session', JSON.stringify(v)); } catch (e) {} },
    del() { try { sessionStorage.removeItem('wd_session'); } catch (e) {} }
  };

  /* ---------- SHA-256 (pure JS so it works on file:// and http://) ---------- */
  const PR = []; for (let n = 2; PR.length < 64; n++) if (PR.every(p => n % p)) PR.push(n);
  const frac = x => Math.floor((x - Math.floor(x)) * 4294967296);
  const K = PR.map(p => frac(Math.cbrt(p)));
  const H0 = PR.slice(0, 8).map(p => frac(Math.sqrt(p)));
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  function sha256(msg) {
    const s = unescape(encodeURIComponent(msg)), l = s.length, W = [];
    for (let i = 0; i < l; i++) W[i >> 2] |= s.charCodeAt(i) << (24 - (i % 4) * 8);
    W[l >> 2] |= 0x80 << (24 - (l % 4) * 8);
    const total = (((l + 8) >> 6) + 1) * 16;
    W[total - 1] = l * 8;
    const H = H0.slice();
    for (let i = 0; i < total; i += 16) {
      const w = new Array(64);
      for (let t = 0; t < 16; t++) w[t] = W[i + t] | 0;
      for (let t = 16; t < 64; t++) {
        const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
        const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let t = 0; t < 64; t++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[t] + w[t]) | 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      [a, b, c, d, e, f, g, h].forEach((v, j) => H[j] = (H[j] + v) | 0);
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  function hashPassword(pw, salt) {
    let h = sha256(salt + ':' + pw);
    for (let i = 0; i < 3000; i++) h = sha256(h + ':' + salt);
    return h;
  }
  const newSalt = () => Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join('');
  const uid = () => 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- The ONE admin account (unique, cannot be created via signup) ---------- */
  const ADMIN = {
    name: 'Administrator',
    email: 'admin@weatherdash.com',
    salt: 'wd7536cac6070dabc8d7c499ea',
    hash: 'a0d6393f800b46b0f0cf8c5f180ed746a0abff3c6c6113cf121b013d94e5518c'
  };
  const PAGES = { login: 'login.html', home: 'index.html', admin: 'admin.html' };

  /* ---------- Data helpers ---------- */
  const users = () => store.get('wd_users', []);
  const saveUsers = u => store.set('wd_users', u);
  const logs = () => store.get('wd_logs', []);
  const norm = e => String(e || '').trim().toLowerCase();

  function init() {
    const u = users();
    if (!u.some(x => x.role === 'admin')) {
      u.unshift({
        id: 'admin_root', name: ADMIN.name, email: ADMIN.email, salt: ADMIN.salt, hash: ADMIN.hash,
        role: 'admin', status: 'active', createdAt: Date.now(), lastLogin: null, loginCount: 0
      });
      saveUsers(u);
    }
  }

  function log(type, email, detail, extra) {
    const l = logs();
    l.push(Object.assign({ id: uid(), t: Date.now(), type, email: email || '', detail: detail || '' }, extra || {}));
    store.set('wd_logs', l.slice(-1000));
  }

  /* ---------- Session ---------- */
  function current() {
    let s = sess.get() || store.get('wd_session', null);
    if (!s) return null;
    const user = users().find(u => u.id === s.uid);
    if (!user || user.status !== 'active') { endSession(); return null; }
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
  function startSession(user, remember) {
    const s = { uid: user.id, t: Date.now() };
    if (remember) store.set('wd_session', s); else { store.del('wd_session'); }
    sess.set(s);
  }
  function endSession() { sess.del(); store.del('wd_session'); }
  const homeFor = u => (u.role === 'admin' ? PAGES.admin : PAGES.home);

  /** Call at the top of every protected page. */
  function guard(role) {
    init();
    const u = current();
    if (!u) { location.replace(PAGES.login); return null; }
    if (role === 'admin' && u.role !== 'admin') { location.replace(PAGES.home); return null; }
    return u;
  }
  /** Call on login/signup pages: send signed-in people onward. */
  function redirectIfSignedIn() {
    init();
    const u = current();
    if (u) location.replace(homeFor(u));
  }

  /* ---------- Sign up / log in / log out ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function signup({ name, email, password }) {
    init();
    name = String(name || '').trim().replace(/\s+/g, ' ');
    email = norm(email);
    if (name.length < 2) return { ok: false, field: 'name', error: 'Enter your full name (at least 2 letters).' };
    if (!EMAIL_RE.test(email)) return { ok: false, field: 'email', error: 'Enter a valid email address.' };
    if (passwordScore(password).score < 2) return { ok: false, field: 'password', error: 'Password needs 8+ characters with letters and numbers.' };
    const all = users();
    if (email === ADMIN.email || all.some(u => u.email === email))
      return { ok: false, field: 'email', error: 'An account with this email already exists. Try logging in.' };
    const salt = newSalt();
    const user = {
      id: uid(), name, email, salt, hash: hashPassword(password, salt),
      role: 'user',                      // signup can NEVER create an admin
      status: 'active', createdAt: Date.now(), lastLogin: Date.now(), loginCount: 1
    };
    all.push(user); saveUsers(all);
    log('signup', email, name + ' created an account');
    log('login', email, 'Signed in after signup');
    startSession(user, true);
    return { ok: true, user };
  }

  function login(email, password, remember) {
    init();
    email = norm(email);
    const locks = store.get('wd_lock', {});
    const lk = locks[email];
    if (lk && lk.until > Date.now()) {
      return { ok: false, error: `Too many attempts. Try again in ${Math.ceil((lk.until - Date.now()) / 1000)}s.` };
    }
    const all = users();
    const user = all.find(u => u.email === email);
    const good = user && hashPassword(password, user.salt) === user.hash;
    if (!good) {
      const n = ((lk && lk.n) || 0) + 1;
      locks[email] = n >= 5 ? { n: 0, until: Date.now() + 30000 } : { n, until: 0 };
      store.set('wd_lock', locks);
      log('login_failed', email, 'Wrong email or password');
      return { ok: false, error: n >= 5 ? 'Too many attempts. Locked for 30 seconds.' : 'Incorrect email or password.' };
    }
    if (user.status !== 'active') {
      log('login_failed', email, 'Blocked account tried to sign in');
      return { ok: false, error: 'This account has been blocked by the admin.' };
    }
    delete locks[email]; store.set('wd_lock', locks);
    user.lastLogin = Date.now(); user.loginCount = (user.loginCount || 0) + 1;
    saveUsers(all);
    log('login', email, user.role === 'admin' ? 'Admin signed in' : 'Signed in');
    startSession(user, remember);
    return { ok: true, user };
  }

  function logout() {
    const u = current();
    if (u) log('logout', u.email, 'Signed out');
    endSession();
    location.replace(PAGES.login);
  }

  /* ---------- Admin actions ---------- */
  function setStatus(id, status) {
    const all = users(); const u = all.find(x => x.id === id);
    if (!u || u.role === 'admin') return false;
    u.status = status; saveUsers(all);
    log('admin', current()?.email, `${status === 'blocked' ? 'Blocked' : 'Unblocked'} ${u.email}`);
    return true;
  }
  function deleteUser(id) {
    const all = users(); const u = all.find(x => x.id === id);
    if (!u || u.role === 'admin') return false;
    saveUsers(all.filter(x => x.id !== id));
    log('admin', current()?.email, `Deleted ${u.email}`);
    return true;
  }
  function changePassword(id, oldPw, newPw) {
    const all = users(); const u = all.find(x => x.id === id);
    if (!u) return { ok: false, error: 'Account not found.' };
    if (hashPassword(oldPw, u.salt) !== u.hash) return { ok: false, error: 'Current password is wrong.' };
    if (passwordScore(newPw).score < 3) return { ok: false, error: 'Use 8+ characters with upper, lower case, a number and a symbol.' };
    u.salt = newSalt(); u.hash = hashPassword(newPw, u.salt); saveUsers(all);
    log('admin', u.email, 'Changed password');
    return { ok: true };
  }
  function clearLogs() { store.set('wd_logs', []); }

  /* ---------- Password strength (0-4) ---------- */
  function passwordScore(p) {
    p = String(p || '');
    if (p.length < 8 || !/[a-zA-Z]/.test(p) || !/\d/.test(p)) return { score: p.length ? 1 : 0, label: p.length ? 'Too weak' : '' };
    let s = 2;
    if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
    if (/[^a-zA-Z0-9]/.test(p) && p.length >= 10) s++;
    return { score: s, label: ['', 'Too weak', 'Okay', 'Strong', 'Excellent'][s] };
  }

  /* ---------- Small UI helpers ---------- */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function toast(msg, type = 'ok') {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + type; t.textContent = msg; box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  }
  function confirmBox(title, text, okLabel = 'Confirm', danger = false) {
    return new Promise(res => {
      const m = document.createElement('div'); m.className = 'modal';
      m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><h3>${esc(title)}</h3><p>${esc(text)}</p>
        <div class="modal-actions"><button class="btn btn-ghost" data-r="0">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-r="1">${esc(okLabel)}</button></div></div>`;
      const done = v => { m.remove(); res(v); };
      m.addEventListener('click', e => { if (e.target === m) done(false); const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); });
      document.body.appendChild(m); m.querySelector('[data-r="1"]').focus();
    });
  }
  /** Wire up every .pw-toggle button to show/hide the input before it. */
  function wirePasswordToggles() {
    document.querySelectorAll('.pw-toggle').forEach(b => b.addEventListener('click', () => {
      const i = b.parentElement.querySelector('input'); const show = i.type === 'password';
      i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show';
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    }));
  }

  return { store, sha256, hashPassword, newSalt, uid, init, users, saveUsers, logs, log, current, guard, redirectIfSignedIn,
    signup, login, logout, setStatus, deleteUser, changePassword, clearLogs, passwordScore, esc, toast, confirmBox,
    wirePasswordToggles, homeFor, ADMIN, PAGES };
})();
