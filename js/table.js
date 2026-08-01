/* ============================================
   Table — tri accessible (aria-sort), pagination
   avec sélecteur de taille, export CSV filtré
   ============================================ */

const DataTable = (() => {
  const { fmtNum, fmtHa, escapeHtml, couleurZone } = CONFIG;

  let currentData = [];
  let sortKey = 'contenance';
  let sortDir = 'desc';
  let currentPage = 1;
  let pageSize = 25;
  let onSelect = () => {};

  function init(selectionCallback) {
    onSelect = selectionCallback;
    bindEvents();
    updateSortUI();
  }

  function bindEvents() {
    document.querySelectorAll('#data-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          // premier clic : ordre le plus utile selon la colonne
          sortDir = (key === 'contenance' || key === 'nbBatiments') ? 'desc' : 'asc';
        }
        updateSortUI();
        render();
      });
    });

    document.getElementById('page-size').addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value, 10);
      currentPage = 1;
      render();
    });

    document.getElementById('btn-export').addEventListener('click', exportCSV);
  }

  function update(data) {
    currentData = data;
    currentPage = 1;
    render();
  }

  function render() {
    const sorted = sortData(currentData);
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * pageSize;
    const pageData = sorted.slice(start, start + pageSize);

    document.getElementById('table-count').innerHTML =
      `<strong>${total.toLocaleString('fr-FR')}</strong> parcelle${total > 1 ? 's' : ''}`;
    document.getElementById('table-range').textContent = total === 0 ? '' :
      `${(start + 1).toLocaleString('fr-FR')}–${Math.min(start + pageSize, total).toLocaleString('fr-FR')} sur ${total.toLocaleString('fr-FR')}`;
    document.getElementById('table-empty').hidden = total > 0;

    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    pageData.forEach(p => {
      const tr = document.createElement('tr');
      tr.dataset.id = p.id;
      tr.title = 'Cliquer pour localiser sur la carte';
      tr.innerHTML = `
        <td>${escapeHtml(p.id)}</td>
        <td>${escapeHtml(p.section)}</td>
        <td class="col-num">${escapeHtml(p.numero)}</td>
        <td class="col-num">${fmtHa(p.contenance)}</td>
        <td class="col-num">${fmtNum(p.nbBatiments)}</td>
        <td>${p.zonePLU ? `<span class="type-cell">
              <span class="type-dot square" style="background:${couleurZone(p.typeZone)}"></span>
              <span class="type-name" title="${escapeHtml(p.zoneLibLong || '')}">${escapeHtml(p.zonePLU)}</span>
            </span>` : '—'}</td>
        <td class="col-num">${p.distInjecteur == null ? '—' : fmtNum(p.distInjecteur, 1)}</td>
        <td title="${escapeHtml(p.nomInjecteur || '')}">${escapeHtml(p.nomInjecteur || '—')}</td>`;

      tr.addEventListener('click', () => {
        highlight(p.id);
        onSelect(p.id);
      });
      tbody.appendChild(tr);
    });

    renderPagination(totalPages);
  }

  function highlight(id) {
    document.querySelectorAll('#data-table tbody tr').forEach(r =>
      r.classList.toggle('highlighted', r.dataset.id === id));
  }

  function sortData(data) {
    return [...data].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      // les valeurs manquantes finissent toujours en queue de tri
      if (va == null) va = typeof vb === 'number' ? -Infinity : '';
      if (vb == null) vb = typeof va === 'number' ? -Infinity : '';
      const cmp = (typeof va === 'number' && typeof vb === 'number')
        ? va - vb
        : String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base', numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  function updateSortUI() {
    document.querySelectorAll('#data-table th[data-sort]').forEach(th => {
      th.setAttribute('aria-sort', th.dataset.sort === sortKey
        ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    });
  }

  function renderPagination(totalPages) {
    const container = document.getElementById('pagination');
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const mk = (label, page, opts = {}) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      if (opts.disabled) btn.disabled = true;
      if (opts.current) btn.setAttribute('aria-current', 'page');
      if (opts.aria) btn.setAttribute('aria-label', opts.aria);
      if (page != null && !opts.disabled && !opts.current) {
        btn.addEventListener('click', () => { currentPage = page; render(); });
      }
      container.appendChild(btn);
    };

    mk('‹', currentPage - 1, { disabled: currentPage === 1, aria: 'Page précédente' });

    const maxVisible = 7;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    const endPage = Math.min(totalPages, startPage + maxVisible - 1);
    startPage = Math.max(1, endPage - maxVisible + 1);

    if (startPage > 1) {
      mk('1', 1, { current: currentPage === 1 });
      if (startPage > 2) mk('…', null, { disabled: true });
    }
    for (let i = startPage; i <= endPage; i++) mk(String(i), i, { current: i === currentPage });
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) mk('…', null, { disabled: true });
      mk(String(totalPages), totalPages, { current: currentPage === totalPages });
    }

    mk('›', currentPage + 1, { disabled: currentPage === totalPages, aria: 'Page suivante' });
  }

  function exportCSV() {
    if (currentData.length === 0) return;

    const headers = ['Parcelle', 'Commune INSEE', 'Préfixe', 'Section', 'Numéro',
      'Contenance (m²)', 'Contenance (ha)', 'Bâtiments cadastrés',
      'Zone PLU', 'Type de zone', 'Libellé long de zone',
      'Distance injecteur (km)', 'Injecteur le plus proche',
      'Latitude', 'Longitude', 'MAJ cadastre', 'Lien Google Maps'];

    const dec = v => (v == null ? '' : String(v).replace('.', ','));

    const rows = currentData.map(p => [
      p.id, p.commune, p.prefixe, p.section, p.numero,
      p.contenance, dec((p.contenance / 10000).toFixed(4)),
      p.nbBatiments,
      p.zonePLU || '', p.typeZone || '', p.zoneLibLong || '',
      p.distInjecteur == null ? '' : dec(p.distInjecteur.toFixed(2)),
      p.nomInjecteur || '',
      dec(p.centre[1].toFixed(6)), dec(p.centre[0].toFixed(6)),
      p.updated || '',
      CONFIG.LIENS.googleMaps(p.centre[0].toFixed(6), p.centre[1].toFixed(6)),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell == null ? '' : cell).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

    const BOM = '﻿'; // BOM UTF-8 pour Excel
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cadastre-${Filters.etat.insee || 'export'}-parcelles.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init, update, highlight };
})();
