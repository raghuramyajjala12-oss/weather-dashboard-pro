/* ==========================================================
   Admin panel logic – admin.js (page is guarded in admin.html)
   ========================================================== */
const $ = id => document.getElementById(id);
const esc = WD.esc;
$('adminName').textContent = ME.name;
$('logoutBtn').onclick = () => WD.logout();
WD.wirePasswordToggles();

const DAY = 86400000;
const fmtDate = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTime = t => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = t => { if (!t) return 'Never'; const m = Math.floor((Date.now() - t) / 60000); if (m < 1) return 'Just now'; if (m < 60) return m + ' min ago'; const h = Math.floor(m / 60); if (h < 24) return h + ' h ago'; return Math.floor(h / 24) + ' d ago'; };
const empty = (icon, msg) => `<div class="empty-state"><div style="font-size:34px">${icon}</div>${msg}</div>`;

/* ---------- Tabs ---------- */
function showTab(t) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  document.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + t));
  if (location.hash !== '#' + t) history.replaceState(null, '', '#' + t);
}
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.t); });
if (['overview', 'users', 'activity', 'settings'].includes(location.hash.slice(1))) showTab(location.hash.slice(1));

/* ---------- Overview ---------- */
function drawOverview() {
  const users = WD.users(), logs = WD.logs();
  const members = users.filter(u => u.role !== 'admin');
  const logins = logs.filter(l => l.type === 'login'), searches = logs.filter(l => l.type === 'search');
  const startToday = new Date().setHours(0, 0, 0, 0);
  const kpi = [
    ['👥', members.length, 'Total users'], ['✅', members.filter(u => u.status === 'active').length, 'Active users'],
    ['⛔', members.filter(u => u.status === 'blocked').length, 'Blocked users'],
    ['🔑', logins.length, 'Total logins'], ['🔍', searches.length, 'City searches'],
    ['🆕', members.filter(u => u.createdAt >= startToday).length, 'New today']
  ];
  $('kpis').innerHTML = kpi.map(k => `<div class="card kpi"><div class="ico">${k[0]}</div><div><b>${k[1]}</b><span>${k[2]}</span></div></div>`).join('');

  // 7-day chart
  const days = Array.from({ length: 7 }, (_, i) => { const s = startToday - (6 - i) * DAY; return { s, e: s + DAY, l: 0, g: 0 }; });
  logs.forEach(l => { const d = days.find(x => l.t >= x.s && l.t < x.e); if (!d) return; if (l.type === 'login') d.l++; if (l.type === 'signup') d.g++; });
  const max = Math.max(1, ...days.map(d => Math.max(d.l, d.g)));
  $('chart').innerHTML = days.map(d => `<div class="col"><div class="bars">
      <i title="${d.l} logins" style="height:${(d.l / max) * 100}%"></i><i class="b2" title="${d.g} sign-ups" style="height:${(d.g / max) * 100}%"></i></div>
      <span>${new Date(d.s).toLocaleDateString('en-US', { weekday: 'short' })}</span></div>`).join('');

  // top cities
  const counts = {}; searches.forEach(l => { const c = l.city || l.detail; if (c) counts[c] = (counts[c] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6), topMax = top.length ? top[0][1] : 1;
  $('topCities').innerHTML = top.length ? top.map(([c, n]) => `<div class="hbar"><span>${esc(c)}</span><div class="tr"><i style="width:${(n / topMax) * 100}%"></i></div><span>${n}</span></div>`).join('')
    : empty('🌍', 'No searches yet. They will appear here as people look up cities.');

  $('latest').innerHTML = activityTable(logs.slice().reverse().slice(0, 8));
}

/* ---------- Activity ---------- */
const TYPE = {
  login: ['b-ok', 'Login'], signup: ['b-info', 'Sign-up'], search: ['b-demo', 'Search'],
  login_failed: ['b-bad', 'Failed login'], logout: ['b-user', 'Logout'], admin: ['b-warn', 'Admin']
};
function activityTable(rows) {
  if (!rows.length) return empty('📭', 'Nothing here yet.');
  return `<table><thead><tr><th>When</th><th>Event</th><th>User</th><th>Details</th></tr></thead><tbody>` +
    rows.map(l => { const t = TYPE[l.type] || ['b-user', l.type];
      return `<tr><td style="white-space:nowrap">${fmtTime(l.t)}</td><td><span class="badge ${t[0]}">${t[1]}</span></td><td>${esc(l.email) || '—'}</td><td>${esc(l.detail)}</td></tr>`; }).join('') + `</tbody></table>`;
}
function drawActivity() {
  const f = $('aFilter').value; let rows = WD.logs().slice().reverse();
  if (f !== 'all') rows = rows.filter(l => l.type === f);
  $('activityTable').innerHTML = activityTable(rows.slice(0, 200));
}
$('aFilter').onchange = drawActivity;
$('clearLogs').onclick = async () => {
  if (await WD.confirmBox('Clear activity log?', 'This removes all log entries. User accounts are not affected.', 'Clear log', true)) { WD.clearLogs(); refresh(); WD.toast('Activity log cleared'); }
};

/* ---------- Users ---------- */
function drawUsers() {
  const q = $('uSearch').value.trim().toLowerCase(), f = $('uFilter').value;
  const demoNote = u => u.demo ? ' <span class="badge b-demo">Demo</span>' : '';
  const rows = WD.users().filter(u => (f === 'all' || u.status === f) && (!q || u.name.toLowerCase().includes(q) || u.email.includes(q)));
  if (!rows.length) { $('usersTable').innerHTML = empty('🔎', 'No users match your search.'); return; }
  $('usersTable').innerHTML = `<table><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Last login</th><th>Logins</th><th></th></tr></thead><tbody>` +
    rows.map(u => {
      const isAdmin = u.role === 'admin';
      return `<tr><td><div class="nm">${esc(u.name)}${demoNote(u)}</div><div class="em">${esc(u.email)}</div></td>
        <td><span class="badge ${isAdmin ? 'b-admin' : 'b-user'}">${isAdmin ? 'Admin' : 'User'}</span></td>
        <td><span class="badge ${u.status === 'active' ? 'b-ok' : 'b-bad'}">${u.status === 'active' ? 'Active' : 'Blocked'}</span></td>
        <td>${fmtDate(u.createdAt)}</td><td>${ago(u.lastLogin)}</td><td>${u.loginCount || 0}</td>
        <td>${isAdmin ? '<div class="em" style="text-align:right">Protected</div>' : `<div class="acts">
          <button class="btn btn-ghost btn-sm" data-act="${u.status === 'active' ? 'block' : 'unblock'}" data-id="${esc(u.id)}">${u.status === 'active' ? 'Block' : 'Unblock'}</button>
          <button class="btn btn-danger btn-sm" data-act="delete" data-id="${esc(u.id)}">Delete</button></div>`}</td></tr>`;
    }).join('') + `</tbody></table>`;
}
$('usersTable').addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const u = WD.users().find(x => x.id === b.dataset.id); if (!u) return;
  if (b.dataset.act === 'delete') {
    if (!await WD.confirmBox('Delete this user?', `${u.name} (${u.email}) will be removed permanently.`, 'Delete user', true)) return;
    WD.deleteUser(u.id); WD.toast('User deleted');
  } else if (b.dataset.act === 'block') {
    if (!await WD.confirmBox('Block this user?', `${u.name} will be logged out and cannot sign in until you unblock them.`, 'Block user', true)) return;
    WD.setStatus(u.id, 'blocked'); WD.toast('User blocked');
  } else { WD.setStatus(u.id, 'active'); WD.toast('User unblocked'); }
  refresh();
});
$('uSearch').oninput = drawUsers; $('uFilter').onchange = drawUsers;
$('exportBtn').onclick = () => {
  const csv = [['Name', 'Email', 'Role', 'Status', 'Joined', 'Last login', 'Logins']].concat(WD.users().map(u =>
    [u.name, u.email, u.role, u.status, new Date(u.createdAt).toISOString(), u.lastLogin ? new Date(u.lastLogin).toISOString() : '', u.loginCount || 0]))
    .map(r => r.map(c => { c = String(c); if (/^[=+\-@]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"'; }).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'weather-dashboard-users.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/* ---------- Settings: password ---------- */
$('newPw').addEventListener('input', () => { const s = WD.passwordScore($('newPw').value); $('meter').dataset.s = s.score; $('meterLabel').textContent = s.label; });
$('pwForm').addEventListener('submit', e => {
  e.preventDefault(); const err = $('pwErr'); err.classList.remove('show');
  const r = WD.changePassword(ME.id, $('oldPw').value, $('newPw').value);
  if (!r.ok) { err.textContent = r.error; err.classList.add('show'); return; }
  $('pwForm').reset(); $('meter').dataset.s = 0; $('meterLabel').textContent = ''; WD.toast('Password updated');
});

/* ---------- Settings: demo data ---------- */
const DEMO_NAMES = ['Aarav Sharma', 'Priya Reddy', 'Rahul Verma', 'Ananya Iyer', 'Karthik Naidu', 'Sneha Patel', 'Vikram Singh', 'Meera Nair', 'Arjun Das', 'Divya Menon', 'Rohan Gupta', 'Lakshmi Rao'];
const DEMO_CITIES = ['Hyderabad', 'New Delhi', 'Mumbai', 'Chennai', 'Bengaluru', 'Vijayawada', 'Kolkata', 'London', 'Dubai', 'Tokyo'];
$('addDemo').onclick = () => {
  if (WD.users().some(u => u.demo)) { WD.toast('Demo data is already added', 'err'); return; }
  const now = Date.now(), rnd = n => Math.floor(Math.random() * n), users = WD.users(), logs = WD.logs();
  DEMO_NAMES.forEach((name, i) => {
    const created = now - rnd(7 * DAY), email = name.toLowerCase().replace(/ /g, '.') + '@demo.com', visits = 1 + rnd(5);
    users.push({ id: WD.uid(), name, email, salt: 'demo', hash: 'x', role: 'user', status: i === 7 ? 'blocked' : 'active', demo: true,
      createdAt: created, lastLogin: now - rnd(3 * DAY), loginCount: visits });
    logs.push({ id: WD.uid(), t: created, type: 'signup', email, detail: name + ' created an account', demo: true });
    for (let v = 0; v < visits; v++) {
      const t = created + rnd(Math.max(1, now - created));
      logs.push({ id: WD.uid(), t, type: 'login', email, detail: 'Signed in', demo: true });
      const c = DEMO_CITIES[rnd(DEMO_CITIES.length)]; logs.push({ id: WD.uid(), t: t + 60000, type: 'search', email, detail: c, city: c, demo: true });
    }
  });
  logs.sort((a, b) => a.t - b.t); WD.saveUsers(users); WD.store.set('wd_logs', logs);
  refresh(); WD.toast('Demo data added');
};
$('rmDemo').onclick = () => {
  WD.saveUsers(WD.users().filter(u => !u.demo)); WD.store.set('wd_logs', WD.logs().filter(l => !l.demo));
  refresh(); WD.toast('Demo data removed');
};

function refresh() { drawOverview(); drawUsers(); drawActivity(); }
refresh();
