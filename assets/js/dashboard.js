
import supabase from './supabaseClient.js';
import initNav from './navigation.js';

let navInitialized = false;

function getEl(id) {
  try {
    return document.getElementById(id);
  } catch (e) {
    return null;
  }
}

function safeTextSet(el, txt) {
  if (el) el.textContent = String(txt);
}

function normalizeDomain(host) {
  if (!host) return 'Unknown';
  let h = host.toLowerCase().trim();

  if (h.startsWith('http://')) h = h.slice(7);
  if (h.startsWith('https://')) h = h.slice(8);
  if (h.startsWith('www.')) h = h.slice(4);

  h = h.split('/')[0];
  h = h.split('?')[0];

  const parts = h.split('.');
  if (parts.length <= 2) return h;

  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2];

  // handle things like google.co.in
  if (secondLast.length <= 3 && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

async function loadOverview(activeChildId) {
  // init nav once
  if (!navInitialized) {
    try {
      await initNav();
    } catch (e) {
      console.warn('initNav failed', e);
    }
    navInitialized = true;
  }

  const timeMaxEl = getEl('timeUsedSummary');
  const timeNowEl = getEl('timeUsedNow');
  const blockedEl = getEl('blockedAttemptsToday');
  const blockedHistoryBody = getEl('blockedHistoryBody');

  safeTextSet(timeMaxEl, '—');
  safeTextSet(timeNowEl, '—');
  safeTextSet(blockedEl, '—');

  if (blockedHistoryBody) {
    // show loading message
    blockedHistoryBody.innerHTML =
      '<tr><td colspan="2">Loading…</td></tr>';

    // clear the "Time" header if exists
    try {
      const table = blockedHistoryBody.closest('table');
      if (table) {
        const ths = table.querySelectorAll('thead th');
        if (ths[1]) ths[1].textContent = '';
      }
    } catch (e) {
      console.warn('Could not clear Time header', e);
    }
  }

  // get active child id
  let childId = activeChildId || null;
  if (!childId) {
    try {
      childId = localStorage.getItem('active_child_id');
    } catch (e) {
      childId = null;
    }
  }

  if (!childId) {
    safeTextSet(timeMaxEl, 'Select a child');
    safeTextSet(timeNowEl, '—');
    safeTextSet(blockedEl, '—');
    if (blockedHistoryBody) {
      blockedHistoryBody.innerHTML =
        '<tr><td colspan="2">Select a child first</td></tr>';
    }
    return;
  }

  try {
    // default time limit 120 min
    let limitMin = 120;

    // child_settings table – if you use it
    try {
      const rSettings = await supabase
        .from('child_settings')
        .select('time_limit_minutes')
        .eq('child_id', childId)
        .single();

      if (
        rSettings &&
        rSettings.data &&
        rSettings.data.time_limit_minutes != null
      ) {
        const parsed = Number(rSettings.data.time_limit_minutes);
        if (!isNaN(parsed)) limitMin = parsed;
      }
    } catch (e) {
      console.warn('child_settings fetch failed', e);
    }

    // time_limits table – override if present
    try {
      const rLimit = await supabase
        .from('time_limits')
        .select('daily_limit_seconds')
        .eq('child_id', childId)
        .limit(1)
        .maybeSingle();

      if (rLimit && rLimit.data && rLimit.data.daily_limit_seconds != null) {
        const sec = Number(rLimit.data.daily_limit_seconds);
        if (!isNaN(sec) && sec > 0) {
          limitMin = Math.round(sec / 60);
        }
      }
    } catch (e) {
      console.warn('time_limits fetch failed', e);
    }

    // show max time
    safeTextSet(timeMaxEl, limitMin + ' min max');

    // today 00:00
    const since = new Date();
    since.setHours(0, 0, 0, 0);

    // fetch activity logs for today
    let logs = [];
    try {
      const rLogs = await supabase
        .from('activity_logs')
        .select('site_or_app,action,duration_seconds,timestamp')
        .eq('child_id', childId)
        .gte('timestamp', since.toISOString());

      if (rLogs && Array.isArray(rLogs.data)) {
        logs = rLogs.data;
      }
    } catch (e) {
      console.warn('activity_logs fetch failed', e);
    }

    // total screen time
    const totalSec = logs.reduce((sum, row) => {
      const d = row && row.duration_seconds ? Number(row.duration_seconds) : 0;
      return sum + (isNaN(d) ? 0 : d);
    }, 0);
    const totalMin = Math.round(totalSec / 60);
    safeTextSet(timeNowEl, totalMin + ' min');

    // blocked attempts rows
    const blockedRows = logs
      .filter(
        (r) =>
          r &&
          (r.action === 'Blocked' || r.action === 'TimeExceeded') &&
          r.site_or_app
      )
      .map((r) => ({
        site: normalizeDomain(r.site_or_app),
        timestamp: r.timestamp,
      }));

    // sort by timestamp
    blockedRows.sort((a, b) => {
      const ta = new Date(a.timestamp || 0).getTime();
      const tb = new Date(b.timestamp || 0).getTime();
      return ta - tb;
    });

    // cluster attempts in 1-minute windows per site
    const ONE_MIN = 60 * 1000;
    const lastTimeBySite = {};
    const attempts = [];

    for (let i = 0; i < blockedRows.length; i++) {
      const row = blockedRows[i];
      const site = row.site || 'Unknown';
      const t = new Date(row.timestamp || 0).getTime();

      if (isNaN(t)) {
        attempts.push({ site });
        continue;
      }

      const last = lastTimeBySite[site];
      if (last == null || t - last > ONE_MIN) {
        attempts.push({ site });
      }
      lastTimeBySite[site] = t;
    }

    // show count
    safeTextSet(blockedEl, attempts.length);

    // fill table
    if (blockedHistoryBody) {
      if (!attempts.length) {
        blockedHistoryBody.innerHTML =
          '<tr><td colspan="2">No blocked attempts today</td></tr>';
      } else {
        blockedHistoryBody.innerHTML = attempts
          .map((a) => {
            return '<tr><td>' + a.site + '</td><td></td></tr>';
          })
          .join('');
      }
    }
  } catch (err) {
    console.error('loadOverview error', err);
    safeTextSet(timeMaxEl, '—');
    safeTextSet(timeNowEl, '—');
    safeTextSet(blockedEl, '—');
    if (blockedHistoryBody) {
      blockedHistoryBody.innerHTML =
        '<tr><td colspan="2">Error loading data</td></tr>';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // initial load (uses localStorage active_child_id)
  loadOverview();

  // when other pages dispatch childChanged
  window.addEventListener('childChanged', (e) => {
    let id = null;
    if (e && e.detail && e.detail.id) {
      id = e.detail.id;
    } else {
      try {
        id = localStorage.getItem('active_child_id');
      } catch (err) {
        id = null;
      }
    }
    loadOverview(id);
  });

  // when active child changes in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'active_child_id') {
      loadOverview(e.newValue);
    }
  });
});
