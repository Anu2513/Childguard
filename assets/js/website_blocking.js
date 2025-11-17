// assets/js/website_blocking.js
// website_blocking.js (defensive, drop-in replacement)
// website_blocking.js - normalized blocked_sites + update child_settings
import supabase from './supabaseClient.js';
import initNav from './navigation.js';
import { safeText } from './utils.js';

const blockedTbodyId = 'blockedSitesTbody';
const addFormId = 'addSiteForm';
const siteInputId = 'newSiteInput';
const timeLimitInputId = 'timeLimitInput'; // number input for minutes
const vpnToggleId = 'vpnToggle'; // checkbox for VPN

function safeGetEl(id) { try { return document.getElementById(id); } catch (e) { return null; } }
function showMsg(msg) { try { alert(msg); } catch (e) { console.log(msg); } }

async function loadBlockedSites() {
  const tbody = safeGetEl(blockedTbodyId);
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="3">Loading…</td></tr>';

  let childId = null;
  try { childId = localStorage.getItem('active_child_id'); } catch (e) { childId = null; }
  if (!childId) {
    tbody.innerHTML = '<tr><td colspan="3">Select a child first.</td></tr>';
    return;
  }

  try {
    const res = await supabase
      .from('blocked_sites')
      .select('id,domain,created_at,status,added_by')
      .eq('child_id', childId)
      .eq('status', 'blocked')
      .order('created_at', { ascending: false });

    if (res && res.error) {
      console.error('loadBlockedSites error', res.error);
      tbody.innerHTML = '<tr><td colspan="3">Error loading blocked sites</td></tr>';
      return;
    }

    const rows = res && res.data ? res.data : (Array.isArray(res) ? res : []);
    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3">No blocked sites</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(r => {
      const domain = safeText(r.domain || '');
      const created = r.created_at ? (new Date(r.created_at)).toLocaleString() : '';
      const id = r.id || '';
      return '<tr>'
        + '<td>' + domain + '</td>'
        + '<td>' + created + '</td>'
        + '<td><button class="btn-small unblock" data-id="' + safeText(id) + '">Unblock</button></td>'
        + '</tr>';
    }).join('');

    tbody.querySelectorAll('.unblock').forEach(btn => {
      btn.removeEventListener('click', handleUnblock);
      btn.addEventListener('click', handleUnblock);
    });

  } catch (e) {
    console.error('Unexpected loadBlockedSites error', e);
    tbody.innerHTML = '<tr><td colspan="3">Error loading blocked sites</td></tr>';
  }
}

function handleUnblock(e) {
  const id = e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.id ? e.currentTarget.dataset.id : null;
  if (!id) return showMsg('Missing id to unblock');
  unblockSite(id);
}

async function unblockSite(id) {
  try {
    const res = await supabase.from('blocked_sites').update({ status: 'unblocked' }).eq('id', id);
    if (res && res.error) {
      console.error('unblock error', res.error);
      showMsg('Failed to unblock: ' + (res.error.message || JSON.stringify(res.error)));
      return;
    }
    await loadBlockedSites();
  } catch (e) {
    console.error('Unexpected unblock error', e);
    showMsg('Failed to unblock');
  }
}

async function addSite(domain) {
  try {
    if (!domain || !domain.trim()) { showMsg('Enter domain'); return; }
    domain = domain.trim().toLowerCase();

    let childId = null;
    try { childId = localStorage.getItem('active_child_id'); } catch (e) { childId = null; }
    if (!childId) { showMsg('Select a child first'); return; }

    // get current user (parent) and set added_by
    let uresp = null;
    try { uresp = await supabase.auth.getUser(); } catch (e) { uresp = null; }
    const user = (uresp && uresp.data && uresp.data.user) ? uresp.data.user : (uresp && uresp.user ? uresp.user : null);
    const addedBy = user && user.id ? user.id : null;

    const payload = { child_id: childId, domain: domain, added_by: addedBy, status: 'blocked' };
    const res = await supabase.from('blocked_sites').insert([payload]);

    const err = res && res.error ? res.error : (Array.isArray(res) && res[1] && res[1].error ? res[1].error : null);
    if (err) {
      console.error('addSite error', err);
      showMsg('Failed to add site: ' + (err.message || JSON.stringify(err)));
      return;
    }

    showMsg('Site added');
    await loadBlockedSites();
  } catch (e) {
    console.error('Unexpected addSite error', e);
    showMsg('Failed to add site');
  }
}

async function updateChildSettings(childId, updates) {
  if (!childId) return;
  const payload = { child_id: childId };
  if (typeof updates.time_limit_minutes !== 'undefined') payload.time_limit_minutes = Number(updates.time_limit_minutes);
  if (typeof updates.vpn_enabled !== 'undefined') payload.vpn_enabled = !!updates.vpn_enabled;

  try {
    const res = await supabase.from('child_settings').upsert([payload], { onConflict: 'child_id' });
    if (res && res.error) {
      console.error('updateChildSettings error', res.error);
      showMsg('Failed to update settings: ' + (res.error.message || JSON.stringify(res.error)));
      return;
    }
    showMsg('Settings updated');
  } catch (e) {
    console.error('Unexpected updateChildSettings error', e);
    showMsg('Failed to update settings');
  }
}

async function loadChildSettingsIntoUI(childId) {
  if (!childId) return;
  try {
    const res = await supabase.from('child_settings').select('time_limit_minutes,vpn_enabled').eq('child_id', childId).single();
    if (res && res.error) { console.error('loadChildSettings error', res.error); return; }
    const s = res && res.data ? res.data : null;
    if (!s) return;
    const timeEl = safeGetEl(timeLimitInputId);
    const vpnEl = safeGetEl(vpnToggleId);
    if (timeEl) timeEl.value = s.time_limit_minutes ?? 120;
    if (vpnEl) vpnEl.checked = !!s.vpn_enabled;
  } catch (e) {
    console.error('loadChildSettingsIntoUI error', e);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try { await initNav(); } catch (e) { console.warn('initNav failed', e); }

  // wire add form
  try {
    const form = safeGetEl(addFormId);
    if (form) {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const input = safeGetEl(siteInputId);
        const v = input ? (input.value || '').trim() : '';
        if (!v) { showMsg('Enter domain'); return; }
        await addSite(v);
        if (input) input.value = '';
      });
    }
  } catch (e) { console.warn('attach add form failed', e); }

  // wire settings controls (if present)
  try {
    const timeEl = safeGetEl(timeLimitInputId);
    const vpnEl = safeGetEl(vpnToggleId);
    function onSettingsChange() {
      const childId = localStorage.getItem('active_child_id');
      if (!childId) return;
      const updates = {};
      if (timeEl) updates.time_limit_minutes = Number(timeEl.value || 0);
      if (vpnEl) updates.vpn_enabled = !!vpnEl.checked;
      updateChildSettings(childId, updates);
    }
    if (timeEl) {
      timeEl.addEventListener('change', onSettingsChange);
    }
    if (vpnEl) {
      vpnEl.addEventListener('change', onSettingsChange);
    }
  } catch (e) { console.warn('attach settings controls failed', e); }

  // listen for child change
  window.addEventListener('childChanged', function (e) {
    const newId = e && e.detail && e.detail.id ? e.detail.id : localStorage.getItem('active_child_id');
    loadBlockedSites();
    loadChildSettingsIntoUI(newId);
  });

  // initial loads
  try { await loadBlockedSites(); } catch (e) { console.warn(e); }
  try {
    const active = localStorage.getItem('active_child_id');
    if (active) loadChildSettingsIntoUI(active);
  } catch (e) {}
});