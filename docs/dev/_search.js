// podex Docs — Client-side search
(function() {
  const input = document.querySelector('.docs-search-input');
  if (!input) return;

  const links = Array.from(document.querySelectorAll('.docs-nav-link'));
  const sections = Array.from(document.querySelectorAll('.docs-nav-section'));
  const tableRows = Array.from(document.querySelectorAll('table.searchable tbody tr'));

  let debounceTimer;
  input.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(filter, 150);
  });

  function filter() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      links.forEach(l => l.style.display = '');
      sections.forEach(s => s.style.display = '');
      tableRows.forEach(r => r.style.display = '');
      return;
    }
    links.forEach(l => {
      l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
    sections.forEach(s => {
      const visibleLinks = Array.from(s.querySelectorAll('.docs-nav-link')).filter(l => l.style.display !== 'none');
      s.style.display = visibleLinks.length > 0 ? '' : 'none';
    });
    tableRows.forEach(r => {
      r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  }
})();
