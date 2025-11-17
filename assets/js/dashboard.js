// dashboard.js
import supabase from './supabaseClient.js';
import initNav from './navigation.js';

// track nav init so we call it just once
var _navInitialized = false;

function getEl(id) {
  try { return document.getElementById(id); } catch (e) { return null; }
}

function safeTextSet(el, text) {
  try { if (!el) return; el.textContent = String(text); } catch (e) {}
}

async function loadOverview(activeChildId) {
  if (!_navInitialized) {
    try { await initNav(); } catch (e) { console.warn('initNav failed', e); }
    _navInitialized = true;
  }

  var vpnEl = getEl('vpnStatus');
  var timeMaxEl = getEl('timeUsedSummary');
  var timeNowEl = getEl('timeUsedNow');
  var blockedEl = getEl('blockedAttemptsToday');
  var errEl = getEl('overviewError');

  safeTextSet(vpnEl, 'Loading...');
  safeTextSet(timeMaxEl, '--');
  safeTextSet(timeNowEl, 'Loading...');
  safeTextSet(blockedEl, '--');
  if (errEl) safeTextSet(errEl, '');

  var childId = activeChildId;
  if (!childId) {
    try { childId = localStorage.getItem('active_child_id'); } catch (ignore) { childId = null; }
  }

  if (!childId) {
    safeTextSet(vpnEl, 'No child selected');
    safeTextSet(timeMaxEl, '--');
    safeTextSet(timeNowEl, '--');
    safeTextSet(blockedEl, '--');
    return;
  }

  try {
    // settings
    var settings = null;
    try {
      var rSettings = await supabase.from('child_settings').select('time_limit_minutes,vpn_enabled').eq('child_id', childId).single();
      settings = (rSettings && rSettings.data) ? rSettings.data : null;
    } catch (e) {
      console.warn('child_settings fetch failed', e);
      settings = null;
    }

    var limitMin = 120;
    var vpnOn = false;
    if (settings) {
      if (typeof settings.time_limit_minutes !== 'undefined' && settings.time_limit_minutes !== null) {
        var parsed = Number(settings.time_limit_minutes);
        if (!Number.isNaN(parsed)) limitMin = parsed;
      }
      vpnOn = !!settings.vpn_enabled;
    }

    safeTextSet(vpnEl, vpnOn ? 'ON' : 'OFF');
    if (timeMaxEl) {
      if (limitMin >= 60) {
        var h = limitMin / 60;
        var htxt = Number.isInteger(h) ? String(h) : h.toFixed(1);
        safeTextSet(timeMaxEl, htxt + 'h max');
      } else {
        safeTextSet(timeMaxEl, String(limitMin) + ' min max');
      }
    }

    // logs since midnight
    var since = new Date();
    since.setHours(0,0,0,0);
    var todayLogs = [];
    try {
      var rLogs = await supabase.from('activity_logs').select('site_or_app,action,duration_seconds,timestamp').eq('child_id', childId).gte('timestamp', since.toISOString());
      if (rLogs && rLogs.data && Array.isArray(rLogs.data)) {
        todayLogs = rLogs.data;
      } else if (Array.isArray(rLogs)) {
        todayLogs = rLogs;
      } else {
        todayLogs = [];
      }
    } catch (e) {
      console.warn('activity_logs fetch failed', e);
      todayLogs = [];
    }

    var totalSec = (todayLogs || []).reduce(function (acc, row) { return acc + (Number(row && row.duration_seconds ? row.duration_seconds : 0)); }, 0);
    var totalMin = Math.round(totalSec / 60);
    safeTextSet(timeNowEl, totalMin + ' min');

    var blockedCount = (todayLogs || []).filter(function (r) { return r && r.action === 'Blocked'; }).length;
    safeTextSet(blockedEl, String(blockedCount));

  } catch (err) {
    console.error('loadOverview failed', err);
    if (errEl) safeTextSet(errEl, 'Failed to load overview. See console.');
    safeTextSet(vpnEl, '--');
    safeTextSet(timeMaxEl, '--');
    safeTextSet(timeNowEl, '--');
    safeTextSet(blockedEl, '--');
  }
}

// DOM ready init
document.addEventListener('DOMContentLoaded', function () {
  loadOverview();

  // update when nav dispatches childChanged
  window.addEventListener('childChanged', function (e) {
    var newId = null;
    try { newId = e && e.detail && e.detail.id ? e.detail.id : localStorage.getItem('active_child_id'); } catch (ignore) { newId = null; }
    loadOverview(newId);
  });

  // sync across tabs
  window.addEventListener('storage', function (e) {
    if (e.key === 'active_child_id') {
      loadOverview(e.newValue);
    }
  });
});