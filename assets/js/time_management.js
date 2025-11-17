// assets/js/time_management.js
import supabase from './supabaseClient.js';
import initNav from './navigation.js';
import { createDoughnut } from './charts.js';
import { fmtTimeMinutes } from './utils.js';

let doughnutChart = null;

async function loadSettingsAndUsage() {
  await initNav();
  const childId = localStorage.getItem('active_child_id');
  if (!childId) {
    document.getElementById('timeLimitDisplay').textContent = 'No child selected';
    return;
  }

  // load limit
  const { data: settings } = await supabase.from('child_settings').select('time_limit_minutes').eq('child_id', childId).single();
  const limitMinutes = settings?.time_limit_minutes ?? 120;
  document.getElementById('timeSlider').value = Math.round(limitMinutes / 60);
  document.getElementById('timeLimitDisplay').textContent = `${Math.round(limitMinutes/60)} hours`;

  // load usage grouped by site
  const { data: logs } = await supabase.from('activity_logs').select('site_or_app,duration_seconds').eq('child_id', childId);
  const usageMap = {};
  (logs || []).forEach(r => {
    usageMap[r.site_or_app] = (usageMap[r.site_or_app] || 0) + (r.duration_seconds || 0);
  });

  const labels = Object.keys(usageMap);
  const values = labels.map(l => Math.round(usageMap[l] / 60)); // minutes

  // render table
  const tbody = document.getElementById('perSiteTbody');
  tbody.innerHTML = labels.length ? labels.map((l,i) => `<tr><td>${l}</td><td>${values[i]} min</td></tr>`).join('') : '<tr><td colspan="2">No data</td></tr>';

  // render doughnut for total vs used
  const totalUsedSec = (logs || []).reduce((s,r) => s + (r.duration_seconds||0), 0);
  const usedMinutes = Math.round(totalUsedSec/60);
  const remainingMin = Math.max(0, limitMinutes - usedMinutes);

  const ctx = document.getElementById('timeDoughnut');
  if (doughnutChart) doughnutChart.destroy();
  doughnutChart = createDoughnut(ctx, {
    labels: ['Used (min)', 'Remaining (min)'],
    values: [usedMinutes, remainingMin],
    colors: ['#007BFF','#E8F0FF']
  });
  document.getElementById('totalUsed').textContent = `${usedMinutes} min`;
  document.getElementById('totalLimit').textContent = `${limitMinutes} min`;
}

async function saveLimit() {
  const valHours = parseInt(document.getElementById('timeSlider').value, 10);
  const minutes = valHours * 60;
  const childId = localStorage.getItem('active_child_id');
  if (!childId) return alert('Select a child in settings first.');
  const { error } = await supabase.from('child_settings').upsert({ child_id: childId, time_limit_minutes: minutes }, { onConflict: 'child_id' });
  if (error) return alert('Failed to save');
  alert('Limit updated');
  await loadSettingsAndUsage();
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('timeSlider').addEventListener('input', (e) => {
    document.getElementById('timeLimitDisplay').textContent = `${e.target.value} hours`;
  });
  document.getElementById('saveLimitBtn').addEventListener('click', saveLimit);
  loadSettingsAndUsage();
});
