// assets/js/charts.js
// Simple wrapper to create charts used across the site
export function createBarChart(ctx, labels, datasets, opts = {}) {
  return new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets },
    options: Object.assign({
      responsive: true,
      scales: { y: { beginAtZero: true } },
      plugins: { legend: { display: true } }
    }, opts)
  });
}

export function createDoughnut(ctx, data, opts = {}) {
  return new Chart(ctx, {
    type: 'doughnut',
    data: { labels: data.labels, datasets: [{ data: data.values, backgroundColor: data.colors }] },
    options: Object.assign({ cutout: '70%', plugins: { legend: { display: true } } }, opts)
  });
}
