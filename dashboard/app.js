// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail panel with the model's own
// inputs and the protocol's farm plan, and the live-token view kept apart. No network: every
// byte it shows is in data.js.
//
// The farm plan and the implied value are recomputed here from the same derivation main.ts
// writes to board.json, so the page and the board agree: category, chains, TVL and age decide
// the action, the capital, the hold and every cost and time. No name is special-cased.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var WATCH = {};
  DATA.rows.forEach(function (r) { WATCH[r.slug] = true; });

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. implied = round(tvl x multiple x growth x maturity x reach).
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var reach = 1 + Math.min(Math.max((row.chains || []).length - 1, 0), model.reach_max_chains) * model.reach_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity * reach));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // --- The farm plan: the same derivation main.ts writes to board.json. ---
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return { cheap: '$3', pricey: '$12' };
    if (c === 'bitcoin' || c === 'tron' || c === 'solana') return { cheap: '$0.10', pricey: '$1' };
    return { cheap: '$0.20', pricey: '$2' };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Lend $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and leave the deposit earning.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Add $' + capital + ' of liquidity to ' + name + "'s deepest pool on " + chain + ' and leave it in range.';
    if (c.indexOf('bridge') >= 0) return 'Move $' + capital + ' of USDC onto ' + chain + ' through ' + name + ', then put the bridged funds to work in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and hold the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Fund a ' + name + ' margin account on ' + chain + ' with $' + capital + ' of USDC and open one small hedged trade.';
    if (c.indexOf('prediction') >= 0) return 'Fund a ' + name + ' account with $' + capital + ' and take one position in a market that settles soon.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and hold the vault shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it in the farming wallet.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' onto ' + name + "'s chain and use one of its native apps each week.";
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page for a points tab.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var secondChain = p.chains && p.chains.length > 1 ? p.chains[1] : null;
    return [
      { text: 'Set up a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'about ' + gas.cheap + ' of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and about ' + gas.pricey + ' of gas', time: '15 minutes to set up' },
      { text: secondChain === null
          ? 'Do one qualifying action each week, such as a deposit, a borrow, a swap or a vote on the protocol\'s own app.'
          : 'Repeat the position on ' + secondChain + ' too, so the farm covers two of the protocol\'s chains instead of one.',
        cost: 'about ' + gas.cheap + ' of gas a week', time: '10 minutes a week' },
      { text: 'Keep the position open for at least ' + hold + ' days, so the activity spans more than one snapshot of the protocol.', cost: 'the $' + capital + ' stays locked in the position', time: hold + ' days' },
      { text: "Check the protocol's own points or rewards page before you touch anything, and claim only from the link it publishes itself.", cost: 'free to check, and never pay a fee to claim', time: '10 minutes' },
      { text: 'Log the wallet, the dates and every transaction hash, so you can repeat the position or unwind it cleanly later.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  // --- State in the URL hash, so a board, a filter and a detail view each have an address. ---
  function readHash() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.tab = 'pre-token'; state.selected = null;
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  var table = document.getElementById('board-table');
  var tbody = document.getElementById('rows');
  var empty = document.getElementById('empty');
  var detail = document.getElementById('detail');

  function sortButton(key, label) {
    var btn = el('button', { type: 'button', 'data-sort': key }, label);
    if (state.sort === key) btn.appendChild(el('span', { class: 'arrow', 'aria-hidden': 'true', text: state.dir < 0 ? ' \u25bc' : ' \u25b2' }));
    btn.addEventListener('click', function () {
      if (state.sort === key) state.dir = -state.dir;
      else { state.sort = key; state.dir = -1; }
      render();
    });
    return btn;
  }
  function headCell(btn) { return el('th', { scope: 'col' }, btn); }

  function renderHead() {
    var thead = table.querySelector('thead');
    thead.textContent = '';
    if (state.tab === 'pre-token') {
      thead.appendChild(el('tr', null,
        headCell(sortButton('implied', 'Rank')),
        headCell(sortButton('name', 'Protocol')),
        headCell(sortButton('tvl', 'TVL')),
        headCell(sortButton('growth', '7d')),
        headCell(sortButton('age', 'Age')),
        headCell(sortButton('implied', 'Implied value')),
        el('th', { scope: 'col', text: 'Token' })));
    } else {
      thead.appendChild(el('tr', null,
        el('th', { scope: 'col', text: 'Status' }),
        el('th', { scope: 'col', text: 'Protocol' }),
        el('th', { scope: 'col', text: 'TVL' }),
        el('th', { scope: 'col', text: '7d' }),
        el('th', { scope: 'col', text: 'Market cap' }),
        el('th', { scope: 'col', text: 'Token' })));
    }
  }

  function rowCells(r, max) {
    var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
    var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
    return [
      el('td', { class: 'num', text: String(r.rank) }),
      el('td', null, el('div', { class: 'name' },
        el('b', { text: r.name }),
        el('span', { class: 'sub', text: (r.category || 'Uncategorized') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
      el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
      el('td', { class: 'num ' + growthClass, text: growth }),
      el('td', { class: 'num', text: fmtAge(r.age_days) }),
      el('td', null, el('div', { class: 'implied' },
        el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
        el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }))),
      el('td', null, el('span', { class: 'status', text: 'no token' }), WATCH[r.slug] ? el('span', { class: 'watch', text: ' WATCHLIST' }) : null)
    ];
  }

  function renderBoard() {
    var list = sortedRows(filteredRows());
    tbody.textContent = '';
    empty.hidden = true;
    table.style.display = '';
    if (list.length === 0) {
      table.style.display = 'none';
      empty.hidden = false;
      return;
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; })) || 1;
    list.forEach(function (r) {
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      });
      rowCells(r, max).forEach(function (c) { tr.appendChild(c); });
      tbody.appendChild(tr);
    });
  }

  function renderLive() {
    tbody.textContent = '';
    empty.hidden = true;
    table.style.display = '';
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Uncategorized') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
  }

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    writeHash();
    document.getElementById('detail-kicker').textContent = 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' \u00b7 watchlist' : '');
    document.getElementById('detail-title').textContent = row.name;
    document.getElementById('detail-sub').textContent = (row.category || 'Uncategorized') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain');
    var eq = document.getElementById('detail-equation');
    eq.textContent = '';
    [
      ['TVL', fmtUsd(row.tvl_usd)],
      ['Seven-day growth', fmtPct(row.change_7d)],
      ['Age with no token', fmtAge(row.age_days)],
      ['Category multiple (' + (row.category || 'Uncategorized') + ', ' + row.peers + ' peers)', row.multiple.toFixed(3)],
      ['Growth multiplier', String(row.growth_multiplier)],
      ['Maturity multiplier', String(row.maturity_multiplier)],
      ['Reach multiplier (' + (row.chains || []).length + ' chains)', String(row.reach_multiplier)],
      ['Implied value', fmtUsd(row.implied_value_usd)]
    ].forEach(function (pair) {
      eq.appendChild(el('div', null, el('span', { text: pair[0] }), el('b', { class: 'num', text: pair[1] })));
    });
    var recomputed = impliedOf(row, DATA.model);
    document.getElementById('detail-check').textContent = 'Model ' + DATA.model_version + ': the page recomputes this row as ' + fmtUsd(recomputed) +
      (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') +
      ' This is an estimate, not a price, and it does not predict a launch.';
    var steps = document.getElementById('detail-steps');
    steps.textContent = '';
    farmSteps(row).forEach(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      steps.appendChild(el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail })));
    });
    detail.hidden = false;
  }

  function closeDetail() {
    state.selected = null;
    writeHash();
    detail.hidden = true;
  }

  function render() {
    document.getElementById('q').value = state.q;
    document.getElementById('category').value = state.category;
    document.getElementById('chain').value = state.chain;
    renderHead();
    if (state.tab === 'pre-token') renderBoard(); else renderLive();
    document.getElementById('count').textContent = state.tab === 'pre-token'
      ? filteredRows().length + ' of ' + DATA.board_size + ' rows shown'
      : DATA.live.length + ' live-token protocols';
    document.getElementById('tab-pre').setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    document.getElementById('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
    document.getElementById('board').setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected); else detail.hidden = true;
  }

  // --- Static page furniture, filled once from the data. ---
  function init() {
    document.getElementById('meta-asof').textContent = 'Snapshot ' + DATA.as_of;
    document.getElementById('meta-model').textContent = DATA.model_version + ' model';
    document.getElementById('headline').textContent = DATA.watchlist_size + ' watchlist protocols, ranked by implied value';
    document.getElementById('lede-text').textContent = 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) +
      'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, ranked by the same model. ' +
      'Implied value is a model, not a promise.';
    var facts = document.getElementById('facts');
    [
      ['Watchlist covered', DATA.watchlist_size + ' / ' + DATA.watchlist_size, true],
      ['Pre-token rows scored', String(DATA.board_size), false],
      ['Early rows below the floor', String(DATA.early_size), false],
      ['Live-token protocols set aside', String(DATA.live_size), false]
    ].forEach(function (f) {
      facts.appendChild(el('div', { class: 'fact' }, el('span', { text: f[0] }), el('b', { class: f[2] ? 'hot' : '', text: f[1] })));
    });
    var m = DATA.model;
    document.getElementById('formula').textContent =
      'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ')' +
      ' x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ')' +
      ' x (1 + 0.02 x min(chains - 1, ' + m.reach_max_chains + ')) )';
    var chips = document.getElementById('multiples');
    Object.keys(DATA.multiples).forEach(function (cat) {
      var entry = DATA.multiples[cat];
      chips.appendChild(el('span', { class: 'chip' }, el('b', { text: cat + ' ' }), entry.multiple + 'x (' + entry.peers + ' peers)'));
    });
    document.getElementById('model-note').textContent =
      'Each category multiple is the median FDV/TVL of its token-bearing protocols, shrunk toward the global median ' + DATA.global_multiple +
      'x with a prior weight of ' + m.prior_weight + ' and clamped to [' + m.multiple_floor + ', ' + m.multiple_cap +
      ']. Age is the time since the protocol was first listed; an unlisted age uses ' + m.unknown_age_days +
      ' days. Bridges, exchanges and liquid-staking products are left out of the early radar even below the floor: each is a wrapped or staked product of a token that already trades. ' +
      'Live-token protocols are set aside with their market caps shown, never ranked against the pre-token board.';

    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var catSel = document.getElementById('category');
    catSel.appendChild(el('option', { value: 'all', text: 'All categories' }));
    categories.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSel = document.getElementById('chain');
    chainSel.appendChild(el('option', { value: 'all', text: 'All chains' }));
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });

    var q = document.getElementById('q');
    q.value = state.q;
    q.addEventListener('input', function () { state.q = q.value; writeHash(); render(); });
    catSel.value = state.category;
    catSel.addEventListener('change', function () { state.category = catSel.value; writeHash(); render(); });
    chainSel.value = state.chain;
    chainSel.addEventListener('change', function () { state.chain = chainSel.value; writeHash(); render(); });
    document.getElementById('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; writeHash(); render(); });
    document.getElementById('tab-live').addEventListener('click', function () { state.tab = 'live'; writeHash(); render(); });
    document.getElementById('clear-filters').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all';
      q.value = ''; catSel.value = 'all'; chainSel.value = 'all';
      writeHash(); render();
    });
    document.getElementById('detail-close').addEventListener('click', closeDetail);
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !detail.hidden) closeDetail(); });
  }

  readHash();
  init();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
})();
