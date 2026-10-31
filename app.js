(() => {
'use strict';

/* ---------- storage ---------- */
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let tasks = load('tf_tasks', []);
let notes = load('tf_notes', []);
let editingTask = null, editingNote = null, taskFilter = 'all', range = 7, noteColor = 0;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const due = t => new Date(`${t.date}T${t.time}`);
const fmtDate = k => new Date(k + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = t => new Date(`2000-01-01T${t}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const persist = () => { save('tf_tasks', tasks); save('tf_notes', notes); };

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 5000);
}

/* ---------- navigation ---------- */
const views = {
  tasks: ['Tasks', 'Plan your day and never miss a deadline', '+ New task'],
  notes: ['Notes', 'Capture ideas and quick thoughts', '+ New note'],
  history: ['History', 'Everything you have completed', null],
  analytics: ['Analytics', 'See how productive you have been', null],
};
let current = 'tasks';
function show(v) {
  current = v;
  $$('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  const [t, s, a] = views[v];
  $('#view-title').textContent = t; $('#view-sub').textContent = s;
  const btn = $('#primary-action');
  btn.classList.toggle('hidden', !a); if (a) btn.textContent = a;
  render();
}
$$('.nav-btn').forEach(b => b.onclick = () => show(b.dataset.view));
$('#primary-action').onclick = () => {
  const f = current === 'tasks' ? $('#t-title') : $('#n-title');
  f.scrollIntoView({ behavior: 'smooth', block: 'center' }); f.focus();
};

/* ---------- theme ---------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t; localStorage.setItem('tf_theme', t);
  $('#theme-btn').textContent = t === 'dark' ? '☀️ Light mode' : '🌙 Dark mode';
}
$('#theme-btn').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
setTheme(localStorage.getItem('tf_theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

/* ---------- tasks ---------- */
function resetTaskForm() {
  editingTask = null;
  $('#task-form').reset();
  const now = new Date(Date.now() + 3600000);
  $('#t-date').value = dayKey(now);
  $('#t-time').value = `${pad(now.getHours())}:00`;
  $('#t-submit').textContent = 'Add task';
  $('#t-cancel').classList.add('hidden');
}
$('#t-cancel').onclick = resetTaskForm;

$('#task-form').onsubmit = e => {
  e.preventDefault();
  const data = {
    title: $('#t-title').value.trim(), desc: $('#t-desc').value.trim(),
    date: $('#t-date').value, time: $('#t-time').value,
    priority: $('#t-priority').value, remind: +$('#t-remind').value,
  };
  if (!data.title) return;
  if (editingTask) {
    Object.assign(tasks.find(t => t.id === editingTask), data, { notified: false });
    toast('Task updated');
  } else {
    tasks.push({ id: uid(), ...data, done: false, completedAt: null, notified: false, createdAt: Date.now() });
    toast('Task added');
  }
  persist(); resetTaskForm(); render(); checkReminders();
};

function editTask(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  editingTask = id;
  $('#t-title').value = t.title; $('#t-desc').value = t.desc || '';
  $('#t-date').value = t.date; $('#t-time').value = t.time;
  $('#t-priority').value = t.priority; $('#t-remind').value = t.remind;
  $('#t-submit').textContent = 'Save changes';
  $('#t-cancel').classList.remove('hidden');
  $('#task-form').scrollIntoView({ behavior: 'smooth' }); $('#t-title').focus();
}

function toggleTask(id) {
  const t = tasks.find(x => x.id === id); if (!t) return;
  t.done = !t.done; t.completedAt = t.done ? Date.now() : null;
  persist(); render();
  if (t.done) toast('✅ Completed: ' + t.title);
}
function deleteTask(id) { tasks = tasks.filter(t => t.id !== id); persist(); render(); }

$$('#task-filters .chip').forEach(c => c.onclick = () => {
  taskFilter = c.dataset.f;
  $$('#task-filters .chip').forEach(x => x.classList.toggle('active', x === c));
  renderTasks();
});
$('#task-search').oninput = renderTasks;

function renderTasks() {
  const q = $('#task-search').value.toLowerCase(), today = dayKey(new Date()), now = new Date();
  const list = tasks.filter(t => !t.done)
    .filter(t => (t.title + ' ' + (t.desc || '')).toLowerCase().includes(q))
    .filter(t => taskFilter === 'all' || (taskFilter === 'today' && t.date === today) ||
      (taskFilter === 'upcoming' && t.date > today) || (taskFilter === 'overdue' && due(t) < now))
    .sort((a, b) => due(a) - due(b));
  $('#task-list').innerHTML = list.length ? list.map(t => {
    const over = due(t) < now;
    const dateLabel = t.date === today ? 'Today' : fmtDate(t.date);
    return `<li class="task ${t.priority}" data-id="${t.id}">
      <button class="check" data-act="toggle" title="Mark complete">✓</button>
      <div class="task-body">
        <div class="task-title">${esc(t.title)}</div>
        ${t.desc ? `<div class="muted">${esc(t.desc)}</div>` : ''}
        <div class="task-meta"><span>📅 ${dateLabel}</span><span>⏰ ${fmtTime(t.time)}</span>
          <span class="tag">${t.priority}</span>${over ? '<span class="tag overdue">Overdue</span>' : ''}
          ${t.remind ? `<span>🔔 ${t.remind >= 60 ? t.remind / 60 + 'h' : t.remind + 'm'} before</span>` : ''}</div>
      </div>
      <button class="icon-btn" data-act="edit" title="Edit">✏️</button>
      <button class="icon-btn" data-act="del" title="Delete">🗑️</button></li>`;
  }).join('') : `<div class="empty"><big>🎉</big>No pending tasks here. Add one above!</div>`;
}
$('#task-list').onclick = e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('.task').dataset.id;
  ({ toggle: toggleTask, edit: editTask, del: deleteTask })[b.dataset.act](id);
};

/* ---------- notes ---------- */
const NOTE_COLORS = ['#fde68a', '#bbf7d0', '#bae6fd', '#fbcfe8', '#ddd6fe', '#fed7aa'];
$('#n-colors').innerHTML = NOTE_COLORS.map((c, i) => `<button type="button" class="sw ${i === 0 ? 'sel' : ''}" data-i="${i}" style="background:${c}" aria-label="Color ${i + 1}"></button>`).join('');
$('#n-colors').onclick = e => {
  const b = e.target.closest('.sw'); if (!b) return;
  noteColor = +b.dataset.i;
  $$('#n-colors .sw').forEach(s => s.classList.toggle('sel', s === b));
};
function resetNoteForm() {
  editingNote = null; $('#note-form').reset(); noteColor = 0;
  $$('#n-colors .sw').forEach((s, i) => s.classList.toggle('sel', i === 0));
  $('#n-submit').textContent = 'Save note'; $('#n-cancel').classList.add('hidden');
}
$('#n-cancel').onclick = resetNoteForm;
$('#note-form').onsubmit = e => {
  e.preventDefault();
  const title = $('#n-title').value.trim(), body = $('#n-body').value.trim();
  if (!title && !body) return;
  if (editingNote) Object.assign(notes.find(n => n.id === editingNote), { title, body, color: noteColor, updated: Date.now() });
  else notes.unshift({ id: uid(), title, body, color: noteColor, updated: Date.now() });
  persist(); resetNoteForm(); renderNotes(); toast('Note saved');
};
$('#note-search').oninput = renderNotes;
function renderNotes() {
  const q = $('#note-search').value.toLowerCase();
  const list = notes.filter(n => (n.title + ' ' + n.body).toLowerCase().includes(q));
  $('#note-grid').innerHTML = list.length ? list.map(n => `
    <article class="note" data-id="${n.id}" style="background:${NOTE_COLORS[n.color] || NOTE_COLORS[0]}">
      <h4>${esc(n.title) || 'Untitled'}</h4><p>${esc(n.body)}</p>
      <footer><span>${new Date(n.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
        <span><button class="icon-btn" data-act="edit">✏️</button><button class="icon-btn" data-act="del">🗑️</button></span></footer>
    </article>`).join('') : `<div class="empty" style="grid-column:1/-1"><big>📝</big>No notes yet. Write your first one!</div>`;
}
$('#note-grid').onclick = e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('.note').dataset.id;
  if (b.dataset.act === 'del') { notes = notes.filter(n => n.id !== id); persist(); renderNotes(); }
  else {
    const n = notes.find(x => x.id === id); editingNote = id; noteColor = n.color;
    $('#n-title').value = n.title; $('#n-body').value = n.body;
    $$('#n-colors .sw').forEach((s, i) => s.classList.toggle('sel', i === n.color));
    $('#n-submit').textContent = 'Update note'; $('#n-cancel').classList.remove('hidden');
    $('#note-form').scrollIntoView({ behavior: 'smooth' }); $('#n-body').focus();
  }
};

/* ---------- history ---------- */
$('#hist-search').oninput = renderHistory;
$('#hist-clear').onclick = () => {
  if (!tasks.some(t => t.done)) return;
  if (confirm('Delete all completed tasks? This also resets your analytics.')) { tasks = tasks.filter(t => !t.done); persist(); render(); }
};
function renderHistory() {
  const q = $('#hist-search').value.toLowerCase();
  const done = tasks.filter(t => t.done && t.title.toLowerCase().includes(q)).sort((a, b) => b.completedAt - a.completedAt);
  if (!done.length) { $('#history-list').innerHTML = `<div class="empty"><big>🕘</big>No completed tasks yet.</div>`; return; }
  const groups = {};
  done.forEach(t => (groups[dayKey(new Date(t.completedAt))] ||= []).push(t));
  const today = dayKey(new Date()), yest = dayKey(new Date(Date.now() - 864e5));
  $('#history-list').innerHTML = Object.entries(groups).map(([k, items]) => `
    <div class="day-head">${k === today ? 'Today' : k === yest ? 'Yesterday' : fmtDate(k)} · ${items.length}</div>
    <ul class="list">${items.map(t => `
      <li class="task done ${t.priority}" data-id="${t.id}">
        <span class="check">✓</span>
        <div class="task-body"><div class="task-title">${esc(t.title)}</div>
          <div class="task-meta"><span>Done at ${new Date(t.completedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          <span>Due ${fmtDate(t.date)}</span><span class="tag">${t.priority}</span></div></div>
        <button class="icon-btn" data-act="toggle" title="Restore to tasks">↩️</button>
        <button class="icon-btn" data-act="del" title="Delete">🗑️</button></li>`).join('')}</ul>`).join('');
}
$('#history-list').onclick = e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.closest('.task').dataset.id;
  (b.dataset.act === 'del' ? deleteTask : toggleTask)(id);
};

/* ---------- analytics ---------- */
$$('#range-chips .chip').forEach(c => c.onclick = () => {
  range = +c.dataset.r;
  $$('#range-chips .chip').forEach(x => x.classList.toggle('active', x === c));
  renderAnalytics();
});
function renderAnalytics() {
  const days = [];
  for (let i = range - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push({ key: dayKey(d), d, n: 0 }); }
  const map = Object.fromEntries(days.map(x => [x.key, x]));
  const done = tasks.filter(t => t.done);
  done.forEach(t => { const x = map[dayKey(new Date(t.completedAt))]; if (x) x.n++; });
  const total = days.reduce((s, x) => s + x.n, 0);
  const best = days.reduce((a, b) => b.n > a.n ? b : a, days[0]);
  const dueInRange = tasks.filter(t => map[t.date]).length;
  const rate = dueInRange ? Math.round(tasks.filter(t => map[t.date] && t.done).length / dueInRange * 100) : 0;
  const completedKeys = new Set(done.map(t => dayKey(new Date(t.completedAt))));
  let streak = 0; const c = new Date(); if (!completedKeys.has(dayKey(c))) c.setDate(c.getDate() - 1);
  while (completedKeys.has(dayKey(c))) { streak++; c.setDate(c.getDate() - 1); }

  $('#stats').innerHTML = [
    ['Completed', total], ['Daily average', (total / range).toFixed(1)],
    ['Completion rate', rate + '%'], ['Day streak 🔥', streak],
  ].map(([l, v]) => `<div class="stat"><small>${l}</small><strong>${v}</strong></div>`).join('');

  // SVG bar chart
  const W = 700, H = 240, L = 30, B = 30, T = 14;
  const max = Math.max(4, ...days.map(x => x.n));
  const step = (W - L) / days.length, bw = Math.min(40, step * .6);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tasks completed per day"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset="1" stop-color="#6366f1"/></linearGradient></defs>`;
  const ticks = Math.min(max, 4);
  for (let i = 0; i <= ticks; i++) {
    const v = Math.round(max / ticks * i), y = H - B - (H - B - T) * v / max;
    svg += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--border)"/><text x="${L - 6}" y="${y + 4}" text-anchor="end">${v}</text>`;
  }
  days.forEach((x, i) => {
    const h = (H - B - T) * x.n / max, cx = L + step * i + step / 2;
    svg += `<rect class="bar" x="${cx - bw / 2}" y="${H - B - h}" width="${bw}" height="${h}" rx="6"><title>${fmtDate(x.key)}: ${x.n} completed</title></rect>`;
    if (x.n) svg += `<text x="${cx}" y="${H - B - h - 5}" text-anchor="middle" style="fill:var(--text);font-weight:700">${x.n}</text>`;
    if (range <= 14 || i % 3 === 0) svg += `<text x="${cx}" y="${H - 10}" text-anchor="middle">${range <= 7 ? x.d.toLocaleDateString(undefined, { weekday: 'short' }) : x.d.getDate() + '/' + (x.d.getMonth() + 1)}</text>`;
  });
  $('#chart').innerHTML = svg + '</svg>';

  const colors = { high: 'var(--danger)', medium: 'var(--warn)', low: 'var(--success)' };
  const inRange = done.filter(t => map[dayKey(new Date(t.completedAt))]);
  $('#prio-bars').innerHTML = ['high', 'medium', 'low'].map(p => {
    const n = inRange.filter(t => t.priority === p).length;
    return `<div class="pbar"><span>${p}</span><div class="track"><div style="width:${inRange.length ? n / inRange.length * 100 : 0}%;background:${colors[p]}"></div></div><span>${n}</span></div>`;
  }).join('') + (total ? `<p class="muted">Your best day: <b>${fmtDate(best.key)}</b> with ${best.n} task${best.n === 1 ? '' : 's'}.</p>` : '<p class="muted">Complete some tasks to see your stats.</p>');
}

/* ---------- notifications ---------- */
const canNotify = 'Notification' in window;
function updateNotifBtn() {
  const b = $('#notif-btn');
  if (!canNotify) { b.textContent = '🔕 Not supported'; b.disabled = true; return; }
  const on = Notification.permission === 'granted';
  b.classList.toggle('on', on);
  b.textContent = on ? '🔔 Notifications on' : Notification.permission === 'denied' ? '🔕 Blocked in browser' : '🔔 Enable notifications';
}
$('#notif-btn').onclick = async () => {
  if (!canNotify) return;
  if (Notification.permission === 'denied') { toast('Notifications are blocked. Allow them in your browser site settings.'); return; }
  await Notification.requestPermission(); updateNotifBtn();
  if (Notification.permission === 'granted') notify('Notifications enabled', 'You will be alerted when tasks are due.');
};
async function notify(title, body) {
  if (canNotify && Notification.permission === 'granted') {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) await reg.showNotification(title, { body, tag: title + body, requireInteraction: true });
      else new Notification(title, { body });
    } catch { try { new Notification(title, { body }); } catch { /* ignore */ } }
  }
  beep();
}
function beep() {
  try {
    const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
    o.connect(g); g.connect(a.destination); o.frequency.value = 880; g.gain.value = .15;
    o.start(); o.stop(a.currentTime + .25);
  } catch { /* audio blocked */ }
}
function checkReminders() {
  const now = Date.now(); let changed = false;
  tasks.forEach(t => {
    if (t.done || t.notified) return;
    const at = due(t).getTime() - t.remind * 60000;
    if (at <= now) {
      t.notified = true; changed = true;
      if (now - at < 864e5) {
        const mins = Math.round((due(t) - now) / 60000);
        const when = mins > 0 ? `Due in ${mins} min` : 'Due now';
        notify('⏰ ' + t.title, `${when} · ${fmtTime(t.time)}`); toast(`⏰ ${t.title} — ${when}`);
      }
    }
  });
  if (changed) { persist(); renderTasks(); updateBadge(); }
}
setInterval(checkReminders, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); renderTasks(); } });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});

/* ---------- render ---------- */
function updateBadge() { const n = tasks.filter(t => !t.done).length; $('#badge-tasks').textContent = n || ''; }
function render() {
  updateBadge();
  if (current === 'tasks') renderTasks();
  else if (current === 'notes') renderNotes();
  else if (current === 'history') renderHistory();
  else renderAnalytics();
}

resetTaskForm(); updateNotifBtn(); show('tasks'); checkReminders();
})();
