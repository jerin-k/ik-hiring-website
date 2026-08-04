export function initTableSorting() {
  document.addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    const table = th.closest('table');
    if (!table) return;
    const thead = th.closest('thead');
    if (!thead) return;
    if (th.getAttribute('colspan')) return;

    const headerRow = th.closest('tr');
    const cols = headerRow.querySelectorAll('th');
    const colIdx = Array.prototype.indexOf.call(cols, th);
    if (colIdx < 0) return;

    const tbody = table.querySelector('tbody');
    if (!tbody) return;
    const dataRows = Array.from(tbody.querySelectorAll('tr:not(.totals-row)'));
    if (dataRows.length === 0) return;

    const asc = th.dataset.sort !== 'asc';
    thead.querySelectorAll('th').forEach(h => { delete h.dataset.sort; });
    th.dataset.sort = asc ? 'asc' : 'desc';

    dataRows.sort((a, b) => {
      const aCell = a.cells[colIdx];
      const bCell = b.cells[colIdx];
      if (!aCell || !bCell) return 0;
      const aVal = aCell.textContent.replace(/[,%—]/g, '').trim();
      const bVal = bCell.textContent.replace(/[,%—]/g, '').trim();
      const aNum = parseFloat(aVal);
      const bNum = parseFloat(bVal);
      if (!isNaN(aNum) && !isNaN(bNum)) return asc ? aNum - bNum : bNum - aNum;
      return asc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

    dataRows.forEach(r => tbody.appendChild(r));
    const totalsRow = tbody.querySelector('.totals-row');
    if (totalsRow) tbody.appendChild(totalsRow);
  });
}
