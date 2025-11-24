// assets/js/navigation.js
import supabase from './supabaseClient.js';
import { safeText } from './utils.js';

export default async function initNav() {
  if (typeof document === 'undefined') return;
  const navRoot = document.getElementById('navbar');
  if (!navRoot) {
    console.warn('initNav: #navbar element not found');
    return;
  }

  // try to get current user email defensively
  let email = '';
  try {
    const uresp = await supabase.auth.getUser();
    const user = (uresp && uresp.data && uresp.data.user) ? uresp.data.user : (uresp && uresp.user ? uresp.user : null);
    email = user && user.email ? user.email : '';
  } catch (err) {
    console.warn('initNav: supabase.auth.getUser() failed', err);
    email = '';
  }

  // render header (brand text only: "Child Guard")
  navRoot.innerHTML = `
    <header class="topbar" style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:transparent;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="brand">
          <span class="brand-title" style="font-size:18px;font-weight:700;color:#0056D2;">Child Guard</span>
        </div>

        <nav class="topnav" style="display:flex;gap:12px;align-items:center;">
          <a href="home.html">Home</a>
          <a href="website_blocking.html">Blocked Sites</a>
          <a href="time_management.html">Time Management</a>
          <a href="reports.html">Reports</a>
          <a href="#" id="navChildToggle" class="nav-child-link" aria-haspopup="true" aria-expanded="false" style="margin-left:8px;">Child: Loading…</a>
        </nav>
      </div>

      <div style="display:flex;align-items:center;gap:12px;">
        <div class="profile" style="display:flex;align-items:center;gap:8px;">
          <span class="profile-email" style="font-size:13px;color:#333">${safeText(email)}</span>
          <button id="logoutBtn" class="btn-link" style="background:none;border:none;color:#007bff;cursor:pointer;padding:6px">Logout</button>
        </div>
      </div>
    </header>
  `;

  // Logout handling
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try { await supabase.auth.signOut(); } catch (e) { console.warn('signOut error', e); }
      try { window.location.href = 'index.html'; } catch (ignore) {}
    });
  }

  // Create dropdown attached to body to avoid clipping
  const dropdown = document.createElement('div');
  dropdown.className = 'nav-child-dropdown';
  Object.assign(dropdown.style, {
    position: 'absolute',
    display: 'none',
    background: '#fff',
    border: '1px solid #e6e6e6',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
    padding: '8px',
    zIndex: 2147483647,
    minWidth: '220px',
    maxWidth: '360px',
    boxSizing: 'border-box'
  });
  document.body.appendChild(dropdown);

  const toggle = document.getElementById('navChildToggle');
  if (!toggle) {
    console.warn('initNav: navChildToggle not found');
    return;
  }

  // Positioning helper
  function positionDropdown() {
    try {
      const rect = toggle.getBoundingClientRect();
      const ddW = Math.min(Math.max(220, rect.width), 360);
      let left = rect.left;
      const winW = window.innerWidth || document.documentElement.clientWidth;
      if (left + ddW > winW - 8) left = winW - ddW - 8;
      dropdown.style.left = Math.max(8, left) + 'px';
      dropdown.style.top = (rect.bottom + 8) + 'px';
      dropdown.style.minWidth = ddW + 'px';
    } catch (e) { /* ignore positioning errors */ }
  }

  function showDropdown() {
    positionDropdown();
    dropdown.style.display = 'block';
    dropdown.setAttribute('aria-hidden', 'false');
    try { toggle.setAttribute('aria-expanded', 'true'); } catch (e) {}
  }
  function hideDropdown() {
    dropdown.style.display = 'none';
    dropdown.setAttribute('aria-hidden', 'true');
    try { toggle.setAttribute('aria-expanded', 'false'); } catch (e) {}
  }

  // toggle click
  toggle.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (dropdown.style.display === 'block') hideDropdown(); else showDropdown();
  });

  // close on outside click / escape
  document.addEventListener('click', (ev) => {
    if (!dropdown.contains(ev.target) && ev.target !== toggle) hideDropdown();
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') hideDropdown(); });
  window.addEventListener('resize', () => { if (dropdown.style.display === 'block') positionDropdown(); });

  // Fetch current user (defensive)
  let currentUser = null;
  try {
    const ru = await supabase.auth.getUser();
    currentUser = (ru && ru.data && ru.data.user) ? ru.data.user : (ru && ru.user ? ru.user : null);
  } catch (err) {
    console.warn('initNav: auth.getUser failed', err);
    currentUser = null;
  }

  if (!currentUser) {
    toggle.textContent = 'Child: —';
    dropdown.innerHTML = '<div style="padding:10px;color:#666">Not signed in</div>';
    return;
  }

  // fetch children rows
  let children = [];
  try {
    const q = await supabase.from('children').select('id,name').eq('parent_id', currentUser.id).order('name', { ascending: true });
    children = q && q.data ? q.data : (Array.isArray(q) ? q : []);
  } catch (err) {
    console.error('initNav: children query failed', err);
    children = [];
  }

  if (!children || children.length === 0) {
    toggle.textContent = 'Child: —';
    dropdown.innerHTML = '<div style="padding:10px;color:#666">No children</div>';
    return;
  }

  // determine active child (restore or first)
  let savedId = null;
  try { savedId = localStorage.getItem('active_child_id'); } catch (e) { savedId = null; }
  const foundSaved = savedId && children.some(c => String(c.id) === String(savedId));
  const activeId = foundSaved ? savedId : children[0].id;
  try { localStorage.setItem('active_child_id', activeId); } catch (e) {}

  // set toggle label
  function setToggleLabel(id) {
    const child = children.find(c => String(c.id) === String(id));
    const name = child ? child.name : 'Child';
    toggle.textContent = 'Child: ' + safeText(name);
  }
  setToggleLabel(activeId);

  // build dropdown UI
  function buildDropdown() {
    dropdown.innerHTML = '';

    const header = document.createElement('div');
    header.style.padding = '6px 8px';
    header.style.borderBottom = '1px solid #f0f0f0';
    header.style.fontWeight = '600';
    header.textContent = 'Select child';
    dropdown.appendChild(header);

    const grid = document.createElement('div');
    grid.style.display = 'flex';
    grid.style.flexWrap = 'wrap';
    grid.style.gap = '8px';
    grid.style.padding = '8px';

    children.forEach(child => {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.style.display = 'flex';
      tile.style.flexDirection = 'column';
      tile.style.alignItems = 'center';
      tile.style.justifyContent = 'center';
      tile.style.gap = '6px';
      tile.style.width = 'calc(50% - 8px)';
      tile.style.padding = '8px';
      tile.style.border = '1px solid transparent';
      tile.style.borderRadius = '8px';
      tile.style.background = 'transparent';
      tile.style.cursor = 'pointer';
      tile.setAttribute('data-id', child.id);
      tile.title = child.name || 'Child';

      const initials = (child.name || '').trim().split(/\s+/).map(s => s[0] || '').slice(0,2).join('').toUpperCase() || 'C';
      const circle = document.createElement('div');
      circle.textContent = initials;
      circle.style.width = '36px';
      circle.style.height = '36px';
      circle.style.borderRadius = '50%';
      circle.style.display = 'flex';
      circle.style.alignItems = 'center';
      circle.style.justifyContent = 'center';
      circle.style.background = '#f0f4f8';
      circle.style.fontWeight = '700';

      const label = document.createElement('div');
      label.textContent = child.name;
      label.style.fontSize = '13px';
      label.style.color = '#222';
      label.style.textAlign = 'center';
      label.style.whiteSpace = 'nowrap';
      label.style.overflow = 'hidden';
      label.style.textOverflow = 'ellipsis';
      label.style.width = '100%';

      if (String(child.id) === String(activeId)) {
        tile.style.background = '#f4fbff';
        tile.style.borderColor = '#d0e8ff';
      }

      tile.appendChild(circle);
      tile.appendChild(label);

      tile.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const id = child.id;
        try { localStorage.setItem('active_child_id', id); } catch (e) {}
        setToggleLabel(id);
        try { window.dispatchEvent(new CustomEvent('childChanged', { detail: { id: id, name: child.name } })); } catch (e) {}
        hideDropdown();
      });

      grid.appendChild(tile);
    });

    dropdown.appendChild(grid);
  }

  buildDropdown();

  console.log('initNav: child selector ready — active child id =', localStorage.getItem('active_child_id'));
}
