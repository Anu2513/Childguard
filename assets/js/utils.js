// assets/js/utils.js
// Small reusable helpers

export function fmtTimeMinutes(minutes) {
  if (minutes == null) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function safeText(s) {
  if (!s) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function toISODate(ts) {
  return new Date(ts).toLocaleString();
}
