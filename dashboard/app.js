// Token Launch Radar (radar-3) Frontend Application Logic

(function () {
  if (typeof window.RADAR === 'undefined') {
    document.body.innerHTML = '<div style="padding:40px;color:#f87171;font-family:monospace;">Error: ../data.js failed to load or window.RADAR is missing.</div>';
    return;
  }

  const radar = window.RADAR;
  const rows = radar.rows || [];
  const live = radar.live || [];
  const calibration = radar.calibration || { categories: [] };

  // State
  let currentTab = 'pre-token';
  let searchQuery = '';
  let selectedCategory = '';
  let selectedChain = '';
  let sortColumn = 'rank';
  let sortAsc = true;
  let activeDetailSlug = null;

  // DOM Elements
  const statRows = document.getElementById('statRows');
  const statWatchlist = document.getElementById('statWatchlist');
  const statAsOf = document.getElementById('statAsOf');
  const countPre = document.getElementById('countPre');
  const countLive = document.getElementById('countLive');
  const searchInput = document.getElementById('searchInput');
  const categorySelect = document.getElementById('categorySelect');
  const chainSelect = document.getElementById('chainSelect');
  const resetFiltersBtn = document.getElementById('resetFilters');
  const boardTbody = document.getElementById('boardTbody');
  const liveTbody = document.getElementById('liveTbody');
  const calibrationTbody = document.getElementById('calibrationTbody');
  const preTokenView = document.getElementById('preTokenView');
  const liveView = document.getElementById('liveView');
  const tabBtns = document.querySelectorAll('.tab-btn');
  const detailOverlay = document.getElementById('detailOverlay');
  const closeDrawerBtn = document.getElementById('closeDrawer');
  const toggleExplainerBtn = document.getElementById('toggleExplainer');
  const explainerBody = document.getElementById('explainerBody');

  // Initialize Header stats
  statRows.textContent = rows.length;
  statWatchlist.textContent = radar.watchlist_size || 40;
  statAsOf.textContent = radar.as_of;
  countPre.textContent = rows.length;
  countLive.textContent = live.length;

  // Populate Calibration Table
  function populateCalibration() {
    if (!calibrationTbody) return;
    calibrationTbody.innerHTML = '';
    calibration.categories.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${c.category}</td>
        <td class="mono">${c.n}</td>
        <td class="mono">${c.multiple.toFixed(4)}x</td>
        <td><span class="badge ${c.source === 'category' ? 'model-badge' : 'subtle-badge'}">${c.source}</span></td>
      `;
      calibrationTbody.appendChild(tr);
    });
    // Global Fallback Row
    const trGlobal = document.createElement('tr');
    trGlobal.style.borderTop = '2px solid var(--border-color)';
    trGlobal.innerHTML = `
      <td><strong>Global Median (Fallback)</strong></td>
      <td class="mono">${calibration.tokenized_count}</td>
      <td class="mono">${calibration.global_median.toFixed(4)}x</td>
      <td><span class="badge model-badge">global</span></td>
    `;
    calibrationTbody.appendChild(trGlobal);
  }
  populateCalibration();

  // Populate Categories & Chains filters
  const categories = new Set();
  const chains = new Set();
  rows.forEach(r => {
    if (r.category) categories.add(r.category);
    if (r.chains) r.chains.forEach(c => chains.add(c));
  });

  [...categories].sort().forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  [...chains].sort().forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    chainSelect.appendChild(opt);
  });

  // Helpers
  function formatUSD(n) {
    if (n === null || n === undefined) return 'N/A';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toLocaleString();
  }

  function formatPct(n) {
    if (n === null || n === undefined) return 'N/A';
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(1)}%`;
  }

  function parseHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.has('tab')) {
      currentTab = params.get('tab');
    }
    if (params.has('q')) {
      searchQuery = params.get('q');
      searchInput.value = searchQuery;
    }
    if (params.has('category')) {
      selectedCategory = params.get('category');
      categorySelect.value = selectedCategory;
    }
    if (params.has('chain')) {
      selectedChain = params.get('chain');
      chainSelect.value = selectedChain;
    }
    if (params.has('detail')) {
      activeDetailSlug = params.get('detail');
      openDetail(activeDetailSlug);
    } else {
      closeDetail(false);
    }
  }

  function updateHash() {
    const params = new URLSearchParams();
    if (currentTab !== 'pre-token') params.set('tab', currentTab);
    if (searchQuery) params.set('q', searchQuery);
    if (selectedCategory) params.set('category', selectedCategory);
    if (selectedChain) params.set('chain', selectedChain);
    if (activeDetailSlug) params.set('detail', activeDetailSlug);
    const newHash = params.toString();
    history.replaceState(null, '', newHash ? `#${newHash}` : window.location.pathname);
  }

  // Render Tables
  function render() {
    // Tab switching
    tabBtns.forEach(btn => {
      if (btn.dataset.tab === currentTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (currentTab === 'pre-token') {
      preTokenView.classList.add('active');
      liveView.classList.remove('active');
      renderBoard();
    } else {
      preTokenView.classList.remove('active');
      liveView.classList.add('active');
      renderLive();
    }
  }

  function renderBoard() {
    let filtered = rows.filter(r => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q);
        const matchesCat = (r.category || '').toLowerCase().includes(q);
        const matchesChain = r.chains.some(c => c.toLowerCase().includes(q));
        if (!matchesName && !matchesCat && !matchesChain) return false;
      }
      if (selectedCategory && r.category !== selectedCategory) return false;
      if (selectedChain && !r.chains.includes(selectedChain)) return false;
      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      let valA, valB;
      switch (sortColumn) {
        case 'name':
          valA = a.name.toLowerCase();
          valB = b.name.toLowerCase();
          return sortAsc ? (valA < valB ? -1 : valA > valB ? 1 : 0) : (valA > valB ? -1 : valA < valB ? 1 : 0);
        case 'tvl':
          valA = a.tvl_usd;
          valB = b.tvl_usd;
          break;
        case 'change':
          valA = a.change_7d ?? -9999;
          valB = b.change_7d ?? -9999;
          break;
        case 'age':
          valA = a.age_days ?? 0;
          valB = b.age_days ?? 0;
          break;
        case 'multiple':
          valA = a.category_multiple;
          valB = b.category_multiple;
          break;
        case 'implied':
          valA = a.implied_value_usd;
          valB = b.implied_value_usd;
          break;
        case 'rank':
        default:
          valA = a.rank;
          valB = b.rank;
          break;
      }
      return sortAsc ? valA - valB : valB - valA;
    });

    boardTbody.innerHTML = '';
    if (filtered.length === 0) {
      boardTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No protocols match current filters.</td></tr>';
      return;
    }

    const maxImplied = filtered[0]?.implied_value_usd || 1;

    filtered.forEach(r => {
      const tr = document.createElement('tr');
      tr.addEventListener('click', () => {
        activeDetailSlug = r.slug;
        updateHash();
        openDetail(r.slug);
      });

      const changeClass = r.change_7d === null ? '' : (r.change_7d >= 0 ? 'positive' : 'negative');
      const barWidth = Math.max(4, Math.min(100, Math.round((r.implied_value_usd / maxImplied) * 100)));
      
      const multText = r.multiple_source === 'category' 
        ? `${r.category_multiple.toFixed(2)}x · n=${r.comps_n}`
        : `${r.category_multiple.toFixed(2)}x · global (n=${calibration.tokenized_count}), only ${r.comps_n} ${r.category || 'General'} comps`;

      tr.innerHTML = `
        <td class="cell-rank">#${r.rank}</td>
        <td class="cell-name">
          <div class="protocol-name-wrap">
            <span>${r.name}</span>
            <div class="protocol-sub">
              <span class="category-pill">${r.category || 'General'}</span>
            </div>
          </div>
        </td>
        <td class="mono">${formatUSD(r.tvl_usd)}</td>
        <td class="mono ${changeClass}">${formatPct(r.change_7d)}</td>
        <td class="mono">${r.age_days !== null ? r.age_days + 'd' : 'Unknown'}</td>
        <td class="mono" style="font-size:11px;color:var(--text-muted);">${multText}</td>
        <td>
          <div class="implied-cell">
            <span>${formatUSD(r.implied_value_usd)}</span>
            <div class="mini-bar-track">
              <div class="mini-bar-fill" style="width: ${barWidth}%"></div>
            </div>
          </div>
        </td>
      `;
      boardTbody.appendChild(tr);
    });
  }

  function renderLive() {
    let filtered = live.filter(l => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesName = l.name.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q);
        const matchesCat = (l.category || '').toLowerCase().includes(q);
        const matchesChain = l.chains.some(c => c.toLowerCase().includes(q));
        if (!matchesName && !matchesCat && !matchesChain) return false;
      }
      if (selectedCategory && l.category !== selectedCategory) return false;
      if (selectedChain && !l.chains.includes(selectedChain)) return false;
      return true;
    });

    liveTbody.innerHTML = '';
    if (filtered.length === 0) {
      liveTbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted);">No live protocols match current filters.</td></tr>';
      return;
    }

    filtered.forEach(l => {
      const tr = document.createElement('tr');
      const changeClass = l.change_7d === null ? '' : (l.change_7d >= 0 ? 'positive' : 'negative');
      const chainTags = (l.chains || []).slice(0, 3).map(c => `<span class="chain-tag">${c}</span>`).join('');

      tr.innerHTML = `
        <td class="cell-name">${l.name}</td>
        <td><span class="category-pill">${l.category || 'General'}</span></td>
        <td><div class="chain-tags">${chainTags}</div></td>
        <td class="mono">${formatUSD(l.tvl_usd)}</td>
        <td class="mono" style="color:var(--accent-blue);">${formatUSD(l.mcap_usd)}</td>
        <td class="mono ${changeClass}">${formatPct(l.change_7d)}</td>
      `;
      liveTbody.appendChild(tr);
    });
  }

  // Detail Drawer
  function openDetail(slug) {
    const r = rows.find(x => x.slug === slug);
    if (!r) {
      closeDetail(false);
      return;
    }

    document.getElementById('drawerRank').textContent = `#${r.rank}`;
    document.getElementById('drawerName').textContent = r.name;
    document.getElementById('drawerCategory').textContent = r.category || 'General';

    const drawerBody = document.getElementById('drawerBody');
    const baseVal = r.tvl_usd * r.category_multiple;
    const growthMult = r.growth_multiplier || 1.0;
    const maturityMult = r.maturity_multiplier || 1.0;
    const breadthMult = r.breadth_multiplier || 1.0;

    const cat = r.category || 'General';
    const multInfo = r.multiple_source === 'category'
      ? `${cat} median of ${r.comps_n} live tokens`
      : `global median (n=${calibration.tokenized_count}), only ${r.comps_n} ${cat} comps`;

    const insight = `Ranked #${r.rank} among 198 pre-token candidates. Implied value of ${formatUSD(r.implied_value_usd)} is driven by a ${r.category_multiple.toFixed(4)}x multiple (from ${r.comps_n} ${cat} comps) applied to its ${formatUSD(r.tvl_usd)} TVL, then adjusted by growth and maturity multipliers.`;

    const chainTagsHtml = r.chains.map(c => `<span class="chain-tag">${c}</span>`).join('');
    
    // Find comps for this category
    const catData = calibration.categories.find(c => c.category === cat);
    const compsHtml = catData && catData.comps ? `
      <div style="margin-top: 8px;">
        <div class="section-title" style="font-size: 11px; color: var(--text-muted);">Key ${cat} Comps (mcap/tvl)</div>
        <div class="chain-tags" style="gap:4px;">
          ${catData.comps.slice(0, 8).map(c => `<span class="chain-tag" title="${c.name}">${c.name}: ${c.ratio.toFixed(2)}x</span>`).join('')}
        </div>
      </div>
    ` : '';

    const farmStepsHtml = (r.farm_steps || []).map((stepText, idx) => {
      let cost = 'Standard operational fee';
      let time = '10 mins';
      let cleanText = stepText;
      const costMatch = stepText.match(/Cost:\s*(.*?)\.\s*Time:/);
      const timeMatch = stepText.match(/Time:\s*(.*?)\./);
      if (costMatch) cost = costMatch[1];
      if (timeMatch) time = timeMatch[1];
      if (costMatch && timeMatch) {
        cleanText = stepText.split('Cost:')[0].trim();
      }

      return `
        <div class="farm-step-item">
          <div class="step-num">${idx + 1}</div>
          <div class="step-content">
            <div>${cleanText}</div>
            <div class="step-meta">
              <span class="step-cost">Cost: ${cost}</span>
              <span class="step-time">Time: ${time}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');

    drawerBody.innerHTML = `
      <div class="insight-box">“${insight}”</div>

      <div>
        <div class="section-title">Protocol Snapshot Facts</div>
        <div class="metrics-grid">
          <div class="metric-card">
            <span class="metric-label">TVL</span>
            <span class="metric-value">${formatUSD(r.tvl_usd)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">7d Growth</span>
            <span class="metric-value ${r.change_7d >= 0 ? 'positive' : 'negative'}">${formatPct(r.change_7d)}</span>
          </div>
          <div class="metric-card">
            <span class="metric-label">Protocol Age</span>
            <span class="metric-value">${r.age_days !== null ? r.age_days + ' days' : 'N/A'}</span>
          </div>
        </div>
      </div>

      <div>
        <div class="section-title">Active Chains (${r.chains.length})</div>
        <div class="chain-tags" style="gap:6px;">${chainTagsHtml}</div>
      </div>

      <div>
        <div class="section-title">Valuation Model Breakdown (radar-3)</div>
        <div class="breakdown-container">
          <div class="breakdown-row">
            <div class="breakdown-info">
              <span>Base Value (TVL x ${r.category_multiple.toFixed(4)} — ${multInfo})</span>
              <span class="mono">${formatUSD(baseVal)}</span>
            </div>
            <div class="breakdown-bar-bg"><div class="breakdown-bar-fill" style="width: 100%;"></div></div>
          </div>
          <div class="breakdown-row">
            <div class="breakdown-info">
              <span>Growth Multiplier (${growthMult.toFixed(2)}x)</span>
              <span class="mono">${formatUSD(baseVal * growthMult)}</span>
            </div>
            <div class="breakdown-bar-bg"><div class="breakdown-bar-fill" style="width: ${Math.min(100, Math.round(growthMult * 50))}%;"></div></div>
          </div>
          <div class="breakdown-row">
            <div class="breakdown-info">
              <span>Maturity Multiplier (${maturityMult.toFixed(2)}x)</span>
              <span class="mono">${formatUSD(baseVal * growthMult * maturityMult)}</span>
            </div>
            <div class="breakdown-bar-bg"><div class="breakdown-bar-fill" style="width: ${Math.min(100, Math.round(maturityMult * 80))}%;"></div></div>
          </div>
          <div class="breakdown-row">
            <div class="breakdown-info">
              <span>Breadth Multiplier (${breadthMult.toFixed(2)}x) → Implied Final</span>
              <span class="mono" style="color:var(--accent-emerald);">${formatUSD(r.implied_value_usd)}</span>
            </div>
            <div class="breakdown-bar-bg"><div class="breakdown-bar-fill" style="background:var(--accent-emerald); width: 100%;"></div></div>
          </div>
        </div>
        ${compsHtml}
      </div>

      <div>
        <div class="section-title">Protocol Farm Plan (7 Steps)</div>
        <div class="farm-steps-list">
          ${farmStepsHtml}
        </div>
      </div>
    `;

    detailOverlay.classList.add('open');
  }

  function closeDetail(updateUrl = true) {
    detailOverlay.classList.remove('open');
    activeDetailSlug = null;
    if (updateUrl) {
      updateHash();
    }
  }

  // Event Listeners
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      updateHash();
      render();
    });
  });

  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    updateHash();
    render();
  });

  categorySelect.addEventListener('change', (e) => {
    selectedCategory = e.target.value;
    updateHash();
    render();
  });

  chainSelect.addEventListener('change', (e) => {
    selectedChain = e.target.value;
    updateHash();
    render();
  });

  resetFiltersBtn.addEventListener('click', () => {
    searchQuery = '';
    selectedCategory = '';
    selectedChain = '';
    searchInput.value = '';
    categorySelect.value = '';
    chainSelect.value = '';
    updateHash();
    render();
  });

  // Table sorting
  document.querySelectorAll('#boardTable th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (sortColumn === col) {
        sortAsc = !sortAsc;
      } else {
        sortColumn = col;
        sortAsc = col === 'name' || col === 'rank';
      }
      renderBoard();
    });
  });

  closeDrawerBtn.addEventListener('click', () => closeDetail());
  detailOverlay.addEventListener('click', (e) => {
    if (e.target === detailOverlay) closeDetail();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetail();
  });

  toggleExplainerBtn.addEventListener('click', () => {
    explainerBody.classList.toggle('collapsed');
    toggleExplainerBtn.textContent = explainerBody.classList.contains('collapsed') ? 'Show details' : 'Hide details';
  });

  window.addEventListener('hashchange', () => {
    parseHash();
    render();
  });

  // Initial load from hash
  parseHash();
  render();
})();
