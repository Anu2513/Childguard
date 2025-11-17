// assets/js/reports.js
import supabase from './supabaseClient.js';
import initNav from './navigation.js';
import { createBarChart } from './charts.js';

async function loadWeekly() {
  await initNav();
  const childId = localStorage.getItem('active_child_id');
  if (!childId) {
    document.getElementById('weeklyChartWrap').innerHTML = '<p>Select a child in settings.</p>';
    return;
  }

  const since = new Date();
  since.setDate(since.getDate() - 6);
  const { data } = await supabase.from('activity_logs').select('timestamp,duration_seconds').eq('child_id', childId).gte('timestamp', since.toISOString());
  const buckets = {};
  for (let i=0;i<7;i++) {
    const d = new Date(); d.setDate(d.getDate() - (6-i)); const key = d.toISOString().slice(0,10);
    buckets[key] = 0;
  }
  (data||[]).forEach(r => {
    const day = new Date(r.timestamp).toISOString().slice(0,10);
    buckets[day] = (buckets[day]||0) + (r.duration_seconds||0)/3600;
  });

  const labels = Object.keys(buckets);
  const values = labels.map(k => parseFloat((buckets[k]||0).toFixed(2)));
  const ctx = document.getElementById('weeklyChart').getContext('2d');
  createBarChart(ctx, labels, [{ label: 'Hours Used', data: values, backgroundColor: '#3DA9FC' }]);
}

document.addEventListener('DOMContentLoaded', loadWeekly);
