import supabase from './supabaseClient.js';
import initNav from './navigation.js';
import { createDoughnut } from './charts.js';

let doughnutChart = null;


function toDisplayDomain(host) {
  if (!host) return 'Unknown';

  var parts = host.split('.');
  if (parts.length <= 2) return host;

  var last = parts[parts.length - 1];
  var secondLast = parts[parts.length - 2];

  var ccTlds = ['in', 'uk', 'us', 'au', 'nz', 'za'];
  if (ccTlds.indexOf(last) !== -1 && parts.length >= 3) {
    return parts.slice(parts.length - 3).join('.');
  }

  return secondLast + '.' + last;
}


var IGNORE_SUFFIXES = [
  'supabase.co',
  'googleapis.com',
  'gstatic.com',
  'gvt2.com',
  'googleusercontent.com',
  'fbcdn.net',
  'doubleclick.net',
  'cloudflare.com'
];

function shouldIgnoreDomain(domain) {
  for (var i = 0; i < IGNORE_SUFFIXES.length; i++) {
    var suffix = IGNORE_SUFFIXES[i];
    if (domain === suffix || domain.endsWith('.' + suffix)) {
      return true;
    }
  }
  return false;
}

async function loadSettingsAndUsage() {
  await initNav();

  var childId = null;
  try {
    childId = localStorage.getItem('active_child_id');
  } catch (e) {
    childId = null;
  }

  if (!childId) {
    document.getElementById('timeLimitDisplay').textContent = 'No child selected';
    document.getElementById('totalUsed').textContent = '—';
    document.getElementById('totalLimit').textContent = '—';
    document.getElementById('perSiteTbody').innerHTML =
      '<tr><td colspan="2">No child selected</td></tr>';
    return;
  }

  
  var limitSeconds = 2 * 60 * 60;

  var limitRes = await supabase
    .from('time_limits')
    .select('daily_limit_seconds')
    .eq('child_id', childId)
    .single();

  if (!limitRes.error &&
      limitRes.data &&
      typeof limitRes.data.daily_limit_seconds === 'number') {
    limitSeconds = limitRes.data.daily_limit_seconds;
  }

  var limitMinutes = Math.round(limitSeconds / 60);
  var limitHours = Math.round(limitMinutes / 60);

  var slider = document.getElementById('timeSlider');
  slider.value = String(limitHours);
  document.getElementById('timeLimitDisplay').textContent =
    limitHours + ' hours';

  
  var logsRes = await supabase
    .from('activity_logs')
    .select('site_or_app,duration_seconds,action')
    .eq('child_id', childId)
    .eq('action', 'Allowed');          
  if (logsRes.error) {
    console.error('Error loading logs', logsRes.error);
  }

  var logs = logsRes.data || [];

  
  var rawUsage = {};
  logs.forEach(function (r) {
    var site = r.site_or_app || 'Unknown';
    var dur = r.duration_seconds || 0;
    rawUsage[site] = (rawUsage[site] || 0) + dur;
  });

  
  var usageMap = {};
  Object.keys(rawUsage).forEach(function (host) {
    var main = toDisplayDomain(host);
    usageMap[main] = (usageMap[main] || 0) + rawUsage[host];
  });

 
  var rows = Object.keys(usageMap).map(function (site) {
    return { site: site, seconds: usageMap[site] };
  });

  
  rows = rows.filter(function (r) {
    return !shouldIgnoreDomain(r.site) && r.seconds >= 5;
  });

  
  rows.sort(function (a, b) {
    return b.seconds - a.seconds;
  });

  
  var tbody = document.getElementById('perSiteTbody');
  if (rows.length) {
    tbody.innerHTML = rows
      .map(function (row) {
        var mins = Math.ceil(row.seconds / 60); 
        return (
          '<tr><td>' +
          row.site +
          '</td><td>' +
          mins +
          ' min</td></tr>'
        );
      })
      .join('');
  } else {
    tbody.innerHTML = '<tr><td colspan="2">No data</td></tr>';
  }

  
  var totalUsedSec = logs.reduce(function (s, r) {
    return s + (r.duration_seconds || 0);
  }, 0);

  var usedMinutes = Math.round(totalUsedSec / 60);
  var remainingMin = Math.max(0, limitMinutes - usedMinutes);

  var ctx = document.getElementById('timeDoughnut');
  if (doughnutChart) {
    doughnutChart.destroy();
  }
  doughnutChart = createDoughnut(ctx, {
    labels: ['Used (min)', 'Remaining (min)'],
    values: [usedMinutes, remainingMin],
    colors: ['#007BFF', '#E8F0FF']
  });

  document.getElementById('totalUsed').textContent =
    usedMinutes + ' min';
  document.getElementById('totalLimit').textContent =
    limitMinutes + ' min';
}


async function saveLimit() {
  var slider = document.getElementById('timeSlider');
  var valHours = parseInt(slider.value, 10);
  var seconds = valHours * 60 * 60;

  var childId = null;
  try {
    childId = localStorage.getItem('active_child_id');
  } catch (e) {
    childId = null;
  }
  if (!childId) {
    alert('Select a child in settings first.');
    return;
  }

  var res = await supabase
    .from('time_limits')
    .upsert(
      { child_id: childId, daily_limit_seconds: seconds },
      { onConflict: 'child_id' }
    );

  if (res.error) {
    console.error('Failed to save limit', res.error);
    alert('Failed to save');
    return;
  }

  alert('Limit updated');
  await loadSettingsAndUsage();
}

document.addEventListener('DOMContentLoaded', function () {
  var slider = document.getElementById('timeSlider');
  slider.addEventListener('input', function (e) {
    document.getElementById('timeLimitDisplay').textContent =
      e.target.value + ' hours';
  });

  document
    .getElementById('saveLimitBtn')
    .addEventListener('click', saveLimit);

  loadSettingsAndUsage();
});
