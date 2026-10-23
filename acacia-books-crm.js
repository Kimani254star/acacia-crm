/* acacia-books-crm.js — brings the rest of Books' sales data into the CRM (customers are handled by acacia-bridge.js).
 * Needs acacia_crm_books_sync.sql run once in Supabase.
 *  1 Customers ............ (acacia-bridge.js) + Books customer ID kept on each contact
 *  2 Products & services .. imported into Products (SKU, description, price, VAT rate); used by quotations
 *  3 Invoices ............. shown on the customer profile + "Invoices & Payments" page
 *  4 Payments received .... amount, date, method, reference
 *  5 Outstanding balances . unpaid / overdue invoices, "Overdue follow-up" page, dashboard summary
 *  6 Credit notes ......... issued / applied / unapplied
 *  7 Quotes & sales orders  Books quotations are imported into Quotations; Books sales orders are listed per customer
 *  8 Company & branches ... branch of each customer (from where its invoices were issued)
 *  9 Sales reps ........... the Books sales person becomes the contact's rep (and owner when a CRM user has the same name)
 * Books remains the source of truth: these records refresh from Books. */
(function (w) {
  'use strict';
  var KEYS = ['customers', 'invoices', 'inventory', 'services', 'products', 'receipts', 'customerPayments', 'creditNotes', 'creditNoteApplications', 'quotes', 'orders', 'branches', 'warehouses', 'orgInfo', 'acaciaOrgProfile'];
  var low = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  var num = function (v) { var n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  var r2 = function (n) { return Math.round((Number(n) || 0) * 100) / 100; };
  var iso = function (v) { return String(v || '').slice(0, 10); };
  var today = function () { return new Date().toISOString().slice(0, 10); };
  var E = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var M = function (n) { return 'KSh ' + Math.round(Number(n) || 0).toLocaleString('en-KE'); };
  function addDays(d, n) { if (!d) return ''; var x = new Date(iso(d) + 'T00:00:00'); if (isNaN(x)) return ''; x.setDate(x.getDate() + (Number(n) || 0)); return x.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
  function hx(s) { var o = '', k; for (k = 1; k <= 4; k++) { var x = 5381 * k, i; for (i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i) * k) | 0; o += ('00000000' + (x >>> 0).toString(16)).slice(-8); } return o; }
  function canon(v) { if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + canon(v[k]); }).join(',') + '}'; return JSON.stringify(v); }
  function h(o) { var s = canon(o), x = 5381, i; for (i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return String(x >>> 0); }
  var isBooksCo = function (id) { return /^(ACC-\d+|company_[A-Za-z0-9_]+)$/i.test(String(id || '')); };
  function user() { try { return CURRENT_USER; } catch (e) { return null; } }
  function db() { try { return DB; } catch (e) { return null; } }
  function cname(ct) { return ct.companyName || [ct.salutation, ct.first, ct.last].filter(Boolean).join(' '); }

  var RAW = {}, KNOWN = {}, BK = null, busy = false, selfSave = false, timer = 0;
  var ST = { state: 'wait', msg: 'Waiting for login…', at: null };
  var L = { tab: 'invoices', q: '', branch: '', rep: '', status: '' };

  /* ---------- reading rows ---------- */
  function parseRow(k) { var r = RAW[k]; if (!r) return null; try { var v = JSON.parse(r.value); if (typeof v === 'string') v = JSON.parse(v); return v; } catch (e) { return null; } }
  function arr(k) { var v = parseRow(k); return Array.isArray(v) ? v.filter(function (x) { return x && typeof x === 'object'; }) : []; }
  function cacheKey() { var u = user(); return 'acx_crm_books_' + (u ? u.companyId : ''); }
  function readCache() { try { var c = JSON.parse(localStorage.getItem(cacheKey()) || 'null'); if (c && c.rows) { RAW = c.rows; Object.keys(RAW).forEach(function (k) { KNOWN[k] = RAW[k].updated_at; }); return true; } } catch (e) {} return false; }
  function writeCache() { try { var s = JSON.stringify({ rows: RAW }); if (s.length < 1800000) localStorage.setItem(cacheKey(), s); else localStorage.removeItem(cacheKey()); } catch (e) {} }

  /* ---------- normalise Books data ---------- */
  function taxOf(v) { if (v == null || v === '') return null; var s = String(v); if (/exempt/i.test(s)) return { rate: 0, label: 'Exempt' }; if (/zero/i.test(s)) return { rate: 0, label: 'Zero rated' }; var m = s.match(/\d+(\.\d+)?/); return m ? { rate: Number(m[0]), label: 'VAT ' + Number(m[0]) + '%' } : null; }
  function itemsOf(list) { return (list || []).map(function (i) { return { d: i.desc || i.description || i.product || i.name || i.item || '', q: num(i.qty != null ? i.qty : i.quantity), p: num(i.price != null ? i.price : (i.rate != null ? i.rate : i.unitPrice)), t: num(i.totalWithVat != null ? i.totalWithVat : (i.total != null ? i.total : i.subtotal)), wh: i.warehouse || '' }; }); }

  function build() {
    var d = db(); if (!d) return null;
    var custs = arr('customers'), invsRaw = arr('invoices'), warehouses = arr('warehouses'), branchesRaw = parseRow('branches');
    var byBid = {}, byName = {}, bName = {}, phones = {};
    (d.contacts || []).forEach(function (ct) { if (ct._bk && ct._bk.id != null) byBid[String(ct._bk.id)] = ct; var n = low(cname(ct)); if (n && !byName[n]) byName[n] = ct; });
    custs.forEach(function (c) { if (c.id != null) bName[String(c.id)] = c.name; if (c.name) phones[low(c.name)] = { phone: c.phone || '', email: c.primaryEmail || '' }; });
    function find(id, name) { var ct = id != null && id !== '' ? byBid[String(id)] : null; if (ct) return ct; var n = low(name || (id != null ? bName[String(id)] : '')); return n ? (byName[n] || null) : null; }
    var whBranch = {}; warehouses.forEach(function (x) { if (x.name) whBranch[low(x.name)] = x.branch || x.branchName || ''; });
    var branches = []; (Array.isArray(branchesRaw) ? branchesRaw : []).forEach(function (b) { var n = typeof b === 'string' ? b : (b && (b.name || b.branchName)); if (n && branches.indexOf(String(n)) < 0) branches.push(String(n)); });
    warehouses.forEach(function (x) { var b = x.branch || x.branchName; if (b && branches.indexOf(String(b)) < 0) branches.push(String(b)); });

    var invById = {}, tdy = today();
    var invoices = invsRaw.map(function (b) {
      var st = low(b.status), totDoc = num(b.total), tot = num(b.totalKES != null && b.totalKES !== '' ? b.totalKES : b.total);
      var f = totDoc > 0 && num(b.totalKES) > 0 ? num(b.totalKES) / totDoc : 1;
      var notRec = /draft|pending|void|cancel|reject/.test(st);
      var paid = num(b.amountPaid); if (st === 'paid' && !paid) paid = totDoc;
      var bal = b.balance != null && b.balance !== '' ? num(b.balance) : Math.max(totDoc - paid, 0); if (st === 'paid') bal = 0;
      paid = r2(paid * f); bal = r2(bal * f);
      var date = iso(b.date), due = iso(b.dueDate) || addDays(date, num(b.netDays));
      var open = !notRec && bal > 0.005, od = open && due && due < tdy;
      var label = /void|cancel|reject/.test(st) ? 'Void' : /pending/.test(st) ? 'Pending approval' : /draft/.test(st) ? 'Draft' : (bal <= 0.005 ? 'Paid' : (paid > 0.005 ? 'Partially paid' : 'Unpaid'));
      var items = itemsOf(b.items), br = b.branch || ''; if (!br) items.some(function (i) { var x = whBranch[low(i.wh)]; if (x) { br = x; return true; } return false; });
      var ct = find(b.customerId, b.customer || b.customerName);
      var rec = { id: String(b.id), no: b.invoiceNumber || b.id, date: date, due: due, customer: b.customer || b.customerName || (ct ? cname(ct) : ''), ctId: ct ? ct.id : '', total: r2(tot), paid: paid, bal: notRec ? 0 : bal, status: label, open: open, overdue: !!od, days: od ? daysBetween(due, tdy) : 0, rep: b.salesPerson || '', branch: br, cur: b.currency || 'KES', lpo: b.lpo || '', items: items };
      invById[rec.id] = rec; return rec;
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var payments = [], seen = {};
    arr('customerPayments').forEach(function (p) { if (p.receiptId != null) seen[String(p.receiptId)] = 1; });
    function addPay(p, id) { var inv = p.invoiceId != null ? invById[String(p.invoiceId)] : null, ct = find(p.customerId, p.customer); if (!ct && inv && inv.ctId) ct = { id: inv.ctId }; payments.push({ id: String(id), date: iso(p.date), customer: p.customer || (inv && inv.customer) || '', ctId: ct ? ct.id : '', amount: r2(num(p.amount)), method: p.method || p.paymentMethod || '', ref: p.reference || p.ref || '', bank: p.bank || '', inv: inv ? inv.no : (p.openingBalance ? 'Opening balance' : (p.invoiceNumber || '')), rep: inv ? inv.rep : '', branch: inv ? inv.branch : '' }); }
    arr('customerPayments').forEach(function (p) { addPay(p, p.id); });
    arr('receipts').forEach(function (r) { if (!seen[String(r.id)]) addPay(r, r.receiptNumber || r.id); });
    payments.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var appBy = {}; arr('creditNoteApplications').forEach(function (a) { var k = low(a.creditNoteNumber || a.creditNumber || a.creditNoteId); appBy[k] = (appBy[k] || 0) + num(a.amount); });
    var credits = arr('creditNotes').map(function (c) {
      var no = c.creditNumber || c.number || c.creditNoteNumber || c.id, tot = r2(num(c.totalKES != null && c.totalKES !== '' ? c.totalKES : c.total)), applied = r2(appBy[low(no)] || 0), ref = 0;
      if (c.refundAmount != null && c.refundAmount !== '') ref = num(c.refundAmount); else if (typeof c.refunded === 'number') ref = c.refunded; else if (c.refunded === true || /refund/i.test(c.status || '')) ref = Math.max(tot - applied, 0);
      var un = Math.max(r2(tot - applied - ref), 0), ct = find(c.customerId, c.customer);
      return { id: String(c.id), no: no, date: iso(c.date), customer: c.customer || (ct ? cname(ct) : ''), ctId: ct ? ct.id : '', inv: c.invoiceNumber || '', total: tot, applied: applied, refunded: r2(ref), unapplied: un, status: un <= 0.005 ? (ref > 0 && applied <= 0 ? 'Refunded' : 'Applied') : (applied > 0 ? 'Partly applied' : 'Open'), reason: c.reason || c.notes || '' };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    var orders = arr('orders').map(function (o) {
      var ct = find(o.customerId, o.customerName || o.customer), st = o.status || '';
      return { id: String(o.id), no: o.number || o.orderNumber || o.id, date: iso(o.date), due: iso(o.dueDate), customer: o.customerName || o.customer || (ct ? cname(ct) : ''), ctId: ct ? ct.id : '', total: r2(num(o.total)), status: o.converted ? 'Invoiced' : (st || 'Open'), quoteNo: o.sourceQuoteNumber || '', items: itemsOf(o.items) };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });

    /* rep + branch per customer */
    var repOf = {}, branchOf = {}, bt = {};
    invoices.slice().reverse().forEach(function (i) { if (!i.ctId) return; if (i.rep) repOf[i.ctId] = i.rep; if (i.branch) { bt[i.ctId] = bt[i.ctId] || {}; bt[i.ctId][i.branch] = (bt[i.ctId][i.branch] || 0) + 1; } });
    Object.keys(bt).forEach(function (id) { var best = '', n = 0; Object.keys(bt[id]).forEach(function (b) { if (bt[id][b] > n) { n = bt[id][b]; best = b; } }); branchOf[id] = best; });
    var fill = function (list) { list.forEach(function (x) { if (!x.rep) x.rep = repOf[x.ctId] || ''; if (!x.branch) x.branch = branchOf[x.ctId] || ''; }); };
    fill(payments); fill(credits); fill(orders);
    var org = parseRow('orgInfo') || parseRow('acaciaOrgProfile') || {};
    var company = (org && (org.name || org.companyName || org.legalName)) || ((user() || {}).company) || '';
    return { invoices: invoices, payments: payments, credits: credits, orders: orders, repOf: repOf, branchOf: branchOf, branches: branches, phones: phones, company: company, count: { inv: invoices.length, pay: payments.length, cn: credits.length, ord: orders.length } };
  }

  /* ---------- write into CRM records ---------- */
  function ownerFor(rep) { if (!rep) return ''; try { var u = user(), list = (typeof getUsers === 'function' ? getUsers() : []).filter(function (x) { return x.companyId === u.companyId; }); var m = list.filter(function (x) { return low(x.name) === low(rep) || (x.email && low(x.email) === low(rep)); })[0]; return m ? m.name : ''; } catch (e) { return ''; } }
  function applyProducts() {
    var d = db(), ch = false, items = {}, order = [];
    d.products = d.products || [];
    function put(key, o) { if (!items[key]) { items[key] = o; order.push(key); } else if (o.type === 'Product') { items[key].qty += o.qty; if (!items[key].price && o.price) items[key].price = o.price; } }
    function tx(x) { return taxOf(x.sellVAT != null ? x.sellVAT : (x.vat != null ? x.vat : (x.vatRate != null ? x.vatRate : (x.taxRate != null ? x.taxRate : x.tax)))); }
    var haveInv = !!RAW.inventory, haveSvc = !!RAW.services || !!RAW.products;
    arr('inventory').forEach(function (x) { if (!x.name) return; var sku = String(x.sku || x.code || x.itemCode || ''), t = tx(x); put('p:' + low(sku || x.name), { name: String(x.name), sku: sku, category: x.category || x.itemCategory || x.group || '', unit: x.unit || x.uom || 'unit', description: x.description || x.desc || x.notes || '', price: num(x.sellingPrice || x.sellPrice || x.price), tax: t, qty: num(x.qty), type: 'Product' }); });
    arr('services').concat(arr('products')).forEach(function (x) { var n = x.name || x.title || x.service; if (!n) return; var t = tx(x); put('s:' + low(x.sku || n), { name: String(n), sku: String(x.sku || x.code || ''), category: x.category || 'Service', unit: x.unit || 'service', description: x.description || x.desc || '', price: num(x.rate || x.price || x.sellingPrice || x.amount), tax: t, qty: 0, type: 'Service' }); });
    order.forEach(function (key) {
      var a = items[key], rec = { name: a.name, sku: a.sku, category: a.category, unit: a.unit, description: a.description, price: a.price, taxRate: a.tax ? a.tax.rate : null, taxLabel: a.tax ? a.tax.label : '', stock: a.qty, type: a.type }, hh = h(rec);
      var p = d.products.filter(function (x) { return x.bk === key; })[0];
      if (!p) {
        if (d.products.some(function (x) { return !x.bk && ((a.sku && x.sku && low(x.sku) === low(a.sku)) || low(x.name) === low(a.name)); })) return;   /* a CRM product with the same SKU/name already exists: leave it alone */
        d.products.push(Object.assign({ id: 'pr_bk' + hx(key).slice(0, 8), active: true, bk: key, _bkh: hh, source: 'Acacia Books' }, rec)); ch = true;
      } else if (p._bkh !== hh) { Object.assign(p, rec); p._bkh = hh; p.source = 'Acacia Books'; ch = true; }
    });
    var before = d.products.length;
    d.products = d.products.filter(function (p) { if (!p.bk) return true; if (items[p.bk]) return true; if (/^p:/.test(p.bk)) return !haveInv; return !haveSvc; });
    if (d.products.length !== before) ch = true;
    return ch;
  }
  function applyQuotes() {
    var d = db(), ch = false, list = arr('quotes'), have = !!RAW.quotes, keep = {};
    d.quotes = d.quotes || [];
    var byBid = {}, byName = {}; (d.contacts || []).forEach(function (ct) { if (ct._bk && ct._bk.id != null) byBid[String(ct._bk.id)] = ct; var n = low(cname(ct)); if (n && !byName[n]) byName[n] = ct; });
    var rep = BK && BK.repOf || {};
    list.forEach(function (b) {
      var no = b.quoteNumber || b.number || b.id; if (!no) return; var key = 'bkq:' + no; keep[key] = 1;
      var ct = (b.customerId != null && byBid[String(b.customerId)]) || byName[low(b.customer || b.customerName)] || null;
      var its = (b.items || []).map(function (i) {
        var qty = num(i.qty != null ? i.qty : (i.quantity != null ? i.quantity : 1)) || 1, price = num(i.price != null ? i.price : (i.rate != null ? i.rate : i.unitPrice));
        if (!price && (i.amount != null || i.total != null)) price = num(i.amount != null ? i.amount : i.total) / qty;
        var o = { desc: i.desc || i.description || i.product || i.name || i.item || 'Item', qty: qty, price: r2(price), discount: num(i.discount) };
        if (low(i.category) === 'exempt') o.taxRate = 0; else if (i.vatRate != null && i.vatRate !== '') o.taxRate = num(i.vatRate);
        return o;
      });
      var sub = its.reduce(function (s, i) { return s + i.qty * i.price * (1 - i.discount / 100); }, 0), vat = num(b.vat), taxRate;
      if (vat > 0 && sub > 0) taxRate = r2(vat / sub * 100); else { var f = its.filter(function (i) { return i.taxRate != null; })[0]; taxRate = f ? f.taxRate : num((d.settings || {}).taxRate); }
      var vu = String(b.validity || b.validUntil || b.expiry || ''), valid = /^\d{4}-\d{2}-\d{2}/.test(vu) ? vu.slice(0, 10) : (num(vu) > 0 ? addDays(iso(b.date), num(vu)) : '');
      var s = low(b.status), status = /convert|accept|won|approved/.test(s) ? 'Accepted' : /declin|reject|lost/.test(s) ? 'Declined' : /expire/.test(s) ? 'Expired' : /sent/.test(s) ? 'Sent' : 'Draft';
      var rec = { number: String(no), account: ct ? (ct.account || '') : '', contact: ct ? ct.id : '', customerName: ct ? cname(ct) : (b.customer || b.customerName || ''), date: iso(b.date) || today(), validUntil: valid, taxRate: taxRate, status: status, items: its, notes: b.notes || '', booksTotal: r2(num(b.total)) }, hh = h(rec);
      var q = d.quotes.filter(function (x) { return x.bk === key; })[0];
      if (!q) { d.quotes.push(Object.assign({ id: 'qt_bk' + hx(key).slice(0, 8), deal: '', owner: ownerFor(ct ? rep[ct.id] : '') || (ct && ct.owner) || (user() || {}).name || '', terms: 'Payment due within 30 days of acceptance.', bk: key, _bkh: hh, source: 'Acacia Books' }, rec)); ch = true; }
      else if (q._bkh !== hh) { Object.assign(q, rec); q._bkh = hh; ch = true; }
    });
    if (have) { var n0 = d.quotes.length; d.quotes = d.quotes.filter(function (q) { return !q.bk || keep[q.bk] || q.deal; }); if (d.quotes.length !== n0) ch = true; }
    return ch;
  }
  function applyContacts() {
    var d = db(), ch = false; if (!BK) return false;
    (d.contacts || []).forEach(function (ct) {
      var bid = ct._bk && ct._bk.id != null ? String(ct._bk.id) : '', rep = BK.repOf[ct.id] || '', br = BK.branchOf[ct.id] || '';
      if (bid && ct.booksId !== bid) { ct.booksId = bid; ch = true; }
      if (rep && (ct.salesRep || '') !== rep) { ct.salesRep = rep; ch = true; }
      if (br && (ct.branch || '') !== br) { ct.branch = br; ch = true; }
      if (rep) { var u = ownerFor(rep); if (u && ct.owner !== u && (ct._bkOwner === undefined ? ct.source === 'Acacia Books' : ct.owner === ct._bkOwner)) { ct.owner = u; ct._bkOwner = u; ch = true; } }
    });
    d.settings = d.settings || {};
    if (h(BK.branches) !== d.settings._bkBr) { d.settings.booksBranches = BK.branches; d.settings._bkBr = h(BK.branches); ch = true; }
    return ch;
  }
  function persist(ch) { if (!ch) return; selfSave = true; try { save(); } catch (e) {} selfSave = false; }

  /* ---------- sync ---------- */
  function explain(e) { var m = String((e && e.message) || e || ''), st = e && e.status; if (st === 404 || (e && e.code === 'missing') || /could not find the function|schema cache/i.test(m)) return 'Supabase does not have acx_crm_books_read yet. Run acacia_crm_books_sync.sql in Supabase > SQL Editor, then press Refresh.'; if (st === 401 || st === 403 || /permission denied/i.test(m)) return 'Supabase refused the call. Re-run acacia_crm_books_sync.sql (it re-grants access). ' + m; if (e && e.code === 'offline') return 'Cannot reach Supabase. Check the internet connection.'; return m || 'Unknown error'; }
  async function sync(force) {
    if (busy) return; var u = user(), d = db(); if (!u || !d) return;
    if (!w.AcaciaCloud || !isBooksCo(u.companyId)) { ST = { state: 'warn', msg: 'This login has no company ID that Books can match.', at: new Date() }; return; }
    busy = true;
    try {
      var res;
      try { res = await w.AcaciaCloud.rpc('acx_crm_books_read', { p_company: u.companyId, p_keys: KEYS.concat(['orgInfo_' + u.companyId]), p_known: force === true ? {} : KNOWN }); }
      catch (e) { if (e && (e.status === 404 || e.code === 'missing')) { res = await w.AcaciaCloud.rpc('acx_books_read', { p_company: u.companyId, p_keys: KEYS }); } else throw e; }
      var got = 0; (res || []).forEach(function (r) { RAW[r.key] = r; KNOWN[r.key] = r.updated_at; got++; });
      if (got || !BK || force === true) {
        if (got) writeCache();
        BK = build();
        var ch = false; ch = applyProducts() || ch; ch = applyQuotes() || ch; ch = applyContacts() || ch; persist(ch);
        ST = { state: 'ok', msg: BK.count.inv + ' invoices, ' + BK.count.pay + ' payments, ' + BK.count.cn + ' credit notes, ' + BK.count.ord + ' sales orders read from Books.', at: new Date() };
        if (got || ch) { try { var a = document.activeElement; if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) renderView(); } catch (e) {} }
      } else ST.at = new Date();
    } catch (e) { console.error('[acacia-books-crm]', e); ST = { state: 'error', msg: explain(e), at: new Date() }; try { if (/^bk/.test(currentView)) renderView(); } catch (e2) {} }
    busy = false;
  }
  function soon(ms) { clearTimeout(timer); timer = setTimeout(sync, ms || 3000); }

  /* ---------- scoping ---------- */
  function mine(rec) { var u = user(), role = ''; try { role = currentRole(); } catch (e) {} if (!u || !/^Salesperson$/i.test(String(role))) return true; var d = db(); return !!(rec.ctId && (d.contacts || []).some(function (c) { return c.id === rec.ctId && c.owner === u.name; })); }
  function totals(inv) { var t = { inv: 0, paid: 0, out: 0, od: 0, nOd: 0 }; inv.forEach(function (i) { if (/^(Draft|Void|Pending approval)$/.test(i.status)) return; t.inv += i.total; t.paid += i.paid; t.out += i.bal; if (i.overdue) { t.od += i.bal; t.nOd++; } }); return t; }
  function unapplied(cr) { return cr.reduce(function (s, c) { return s + c.unapplied; }, 0); }

  /* ---------- rendering helpers ---------- */
  var PILL = { Paid: '#dcfce7;color:#166534', 'Partially paid': '#fef3c7;color:#92400e', Unpaid: '#fee2e2;color:#991b1b', Overdue: '#fecaca;color:#7f1d1d', Draft: '#e5e7eb;color:#374151', Void: '#e5e7eb;color:#374151', 'Pending approval': '#e0e7ff;color:#3730a3', Applied: '#dcfce7;color:#166534', 'Partly applied': '#fef3c7;color:#92400e', Open: '#e0e7ff;color:#3730a3', Refunded: '#e5e7eb;color:#374151', Invoiced: '#dcfce7;color:#166534' };
  var pill = function (t) { return '<span class="pill" style="background:' + (PILL[t] || '#e5e7eb;color:#374151') + '">' + E(t) + '</span>'; };
  function tbl(head, rows, empty) { return rows.length ? '<div class="tablewrap"><table><thead><tr>' + head.map(function (x) { return '<th>' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '<div class="empty" style="padding:14px 4px;">' + empty + '</div>'; }
  function kpis(list) { return '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:8px 0 12px;">' + list.map(function (k) { return '<div style="flex:1;min-width:120px;border:1px solid var(--line,#e5e7eb);border-radius:10px;padding:8px 12px;background:var(--paper,#fff);"><div style="font-size:11px;color:var(--ink-soft,#6b7280);">' + k[0] + '</div><div style="font-size:16px;font-weight:700;' + (k[2] ? 'color:' + k[2] : '') + '">' + k[1] + '</div></div>'; }).join('') + '</div>'; }
  var invRow = function (i, withCust) { return '<tr>' + (withCust ? '<td>' + custLink(i) + '</td>' : '') + '<td>' + E(i.no) + (i.lpo ? '<div style="font-size:11px;color:var(--ink-soft)">LPO ' + E(i.lpo) + '</div>' : '') + '</td><td>' + E(i.date) + '</td><td>' + E(i.due || '—') + '</td><td>' + M(i.total) + '</td><td>' + M(i.paid) + '</td><td><b>' + M(i.bal) + '</b></td><td>' + pill(i.status) + (i.overdue ? ' ' + pill('Overdue') + ' <span style="font-size:11px;color:#991b1b">' + i.days + 'd</span>' : '') + '</td></tr>'; };
  var invHead = function (withCust) { return (withCust ? ['Customer'] : []).concat(['Invoice', 'Date', 'Due', 'Total', 'Paid', 'Balance', 'Status']); };
  var payRow = function (p, withCust) { return '<tr>' + (withCust ? '<td>' + custLink(p) + '</td>' : '') + '<td>' + E(p.date) + '</td><td>' + M(p.amount) + '</td><td>' + E(p.method || '—') + '</td><td>' + E(p.ref || '—') + '</td><td>' + E(p.inv || '—') + '</td></tr>'; };
  var payHead = function (withCust) { return (withCust ? ['Customer'] : []).concat(['Date', 'Amount', 'Method', 'Reference', 'Invoice']); };
  var crRow = function (c, withCust) { return '<tr>' + (withCust ? '<td>' + custLink(c) + '</td>' : '') + '<td>' + E(c.no) + '</td><td>' + E(c.date) + '</td><td>' + E(c.inv || '—') + '</td><td>' + M(c.total) + '</td><td>' + M(c.applied) + '</td><td>' + (c.refunded ? M(c.refunded) : '—') + '</td><td><b>' + M(c.unapplied) + '</b></td><td>' + pill(c.status) + '</td></tr>'; };
  var crHead = function (withCust) { return (withCust ? ['Customer'] : []).concat(['Credit note', 'Date', 'Invoice', 'Amount', 'Applied', 'Refunded', 'Unapplied', 'Status']); };
  var ordRow = function (o, withCust) { return '<tr>' + (withCust ? '<td>' + custLink(o) + '</td>' : '') + '<td>' + E(o.no) + '</td><td>' + E(o.date) + '</td><td>' + E(o.due || '—') + '</td><td>' + (o.items.length) + '</td><td>' + M(o.total) + '</td><td>' + pill(o.status) + (o.quoteNo ? ' <span style="font-size:11px;color:var(--ink-soft)">from ' + E(o.quoteNo) + '</span>' : '') + '</td></tr>'; };
  var ordHead = function (withCust) { return (withCust ? ['Customer'] : []).concat(['Order', 'Date', 'Due', 'Lines', 'Total', 'Status']); };
  function custLink(r) { return r.ctId ? '<span class="rowlink" onclick="previewContact(\'' + E(r.ctId) + '\')">' + E(r.customer || '—') + '</span>' : E(r.customer || '—'); }

  function section(title, count, body, open) { return '<details ' + (open ? 'open' : '') + ' style="margin-top:8px;border-top:1px solid var(--line,#e5e7eb);padding-top:6px;"><summary style="cursor:pointer;font-weight:600;padding:4px 0;">' + title + ' <span style="font-weight:400;color:var(--ink-soft,#6b7280)">(' + count + ')</span></summary>' + body + '</details>'; }
  function panelFor(ids) {
    if (!BK) return '';
    var set = {}; ids.forEach(function (i) { set[i] = 1; });
    var inv = BK.invoices.filter(function (x) { return set[x.ctId]; }), pay = BK.payments.filter(function (x) { return set[x.ctId]; }), cr = BK.credits.filter(function (x) { return set[x.ctId]; }), ord = BK.orders.filter(function (x) { return set[x.ctId]; });
    var d = db(), qts = (d.quotes || []).filter(function (q) { return q.bk && set[q.contact]; });
    if (!inv.length && !pay.length && !cr.length && !ord.length && !qts.length) return '<div style="margin-top:14px;border-top:2px solid var(--gold,#c9a227);padding-top:8px;"><b>From Acacia Books</b><div class="empty" style="padding:8px 0;">No invoices, payments or orders in Books for this customer yet.</div></div>';
    var t = totals(inv), un = unapplied(cr), cts = (d.contacts || []).filter(function (c) { return set[c.id]; }), meta = [];
    var reps = {}, brs = {}; cts.forEach(function (c) { if (c.salesRep) reps[c.salesRep] = 1; if (c.branch) brs[c.branch] = 1; });
    if (Object.keys(reps).length) meta.push('Sales rep: <b>' + E(Object.keys(reps).join(', ')) + '</b>'); if (Object.keys(brs).length) meta.push('Branch: <b>' + E(Object.keys(brs).join(', ')) + '</b>'); if (BK.company) meta.push('Company: <b>' + E(BK.company) + '</b>');
    var qrows = qts.map(function (q) { var tt = typeof quoteTotals === 'function' ? quoteTotals(q).total : 0; return '<tr><td><span class="rowlink" onclick="closeModal();goTo(\'quote-detail\',{type:\'quote\',id:\'' + q.id + '\'})">' + E(q.number) + '</span></td><td>' + E(q.date) + '</td><td>' + E(q.validUntil || '—') + '</td><td>' + M(tt) + '</td><td>' + E(q.status) + '</td></tr>'; });
    return '<div style="margin-top:14px;border-top:2px solid var(--gold,#c9a227);padding-top:8px;"><b>From Acacia Books</b>' + (meta.length ? '<div style="font-size:12px;color:var(--ink-soft,#6b7280);margin-top:2px;">' + meta.join(' · ') + '</div>' : '') +
      kpis([['Invoiced', M(t.inv)], ['Paid', M(t.paid)], ['Outstanding', M(t.out), t.out > 0.005 ? '#b45309' : ''], ['Overdue', M(t.od), t.od > 0.005 ? '#991b1b' : ''], ['Credit available', M(un)], ['Net balance', M(Math.max(t.out - un, 0))]]) +
      section('Invoices', inv.length, tbl(invHead(), inv.slice(0, 100).map(function (i) { return invRow(i); }), 'No invoices.'), true) +
      section('Payments received', pay.length, tbl(payHead(), pay.slice(0, 100).map(function (p) { return payRow(p); }), 'No payments.'), false) +
      section('Credit notes &amp; refunds', cr.length, tbl(crHead(), cr.map(function (c) { return crRow(c); }), 'No credit notes.'), false) +
      section('Sales orders', ord.length, tbl(ordHead(), ord.map(function (o) { return ordRow(o); }), 'No sales orders.'), false) +
      section('Quotations from Books', qts.length, tbl(['Quote', 'Date', 'Valid until', 'Total', 'Status'], qrows, 'No quotations.'), false) + '</div>';
  }

  /* ---------- pages ---------- */
  function head(title, sub) { var s = ST.state === 'ok' ? '' : '<div style="margin:8px 0;padding:8px 12px;border-radius:8px;background:#fef3c7;color:#92400e;font-size:13px;">' + E(ST.msg) + '</div>'; return '<div class="pageheader"><div><h1>' + title + '</h1><div class="sub">' + sub + (ST.at ? ' · checked ' + ST.at.toLocaleTimeString() : '') + '</div></div><div class="actions"><button class="btn" onclick="AcaciaBooksCRM.refresh()">Refresh from Books</button></div></div>' + s; }
  function pageLedger(c) {
    if (!BK) { c.innerHTML = head('Invoices &amp; Payments', 'Waiting for Books data…') + '<div class="panel"><div class="empty">' + E(ST.msg) + '</div></div>'; return; }
    var q = low(L.q), flt = function (r) { return mine(r) && (!L.branch || r.branch === L.branch) && (!L.rep || r.rep === L.rep) && (!q || low([r.customer, r.no, r.inv, r.ref].join(' ')).indexOf(q) > -1); };
    var inv = BK.invoices.filter(flt).filter(function (i) { return !L.status || (L.status === 'Overdue' ? i.overdue : (L.status === 'Open' ? i.open : i.status === L.status)); }), pay = BK.payments.filter(flt), cr = BK.credits.filter(flt), ord = BK.orders.filter(flt), t = totals(inv.filter(function (i) { return true; }));
    var reps = {}; BK.invoices.forEach(function (i) { if (i.rep) reps[i.rep] = 1; });
    var sel = function (id, cur, opts, all) { return '<select onchange="AcaciaBooksCRM.set(\'' + id + '\',this.value)" style="padding:6px 8px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);"><option value="">' + all + '</option>' + opts.map(function (o) { return '<option ' + (cur === o ? 'selected' : '') + ' value="' + E(o) + '">' + E(o) + '</option>'; }).join('') + '</select>'; };
    var tabs = [['invoices', 'Invoices', inv.length], ['payments', 'Payments', pay.length], ['credits', 'Credit notes', cr.length], ['orders', 'Sales orders', ord.length]];
    var body = L.tab === 'payments' ? tbl(payHead(1), pay.slice(0, 500).map(function (p) { return payRow(p, 1); }), 'No payments.') : L.tab === 'credits' ? tbl(crHead(1), cr.slice(0, 500).map(function (x) { return crRow(x, 1); }), 'No credit notes.') : L.tab === 'orders' ? tbl(ordHead(1), ord.slice(0, 500).map(function (o) { return ordRow(o, 1); }), 'No sales orders.') : tbl(invHead(1), inv.slice(0, 500).map(function (i) { return invRow(i, 1); }), 'No invoices match.');
    c.innerHTML = head('Invoices &amp; Payments', E(BK.company || 'Books') + ' · live from Acacia Books') +
      kpis([['Invoiced', M(t.inv)], ['Collected', M(t.paid)], ['Outstanding', M(t.out), '#b45309'], ['Overdue (' + t.nOd + ')', M(t.od), t.od > 0 ? '#991b1b' : ''], ['Unapplied credit', M(unapplied(cr))]]) +
      '<div style="display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px;align-items:center;"><input placeholder="Search customer / number" value="' + E(L.q) + '" onchange="AcaciaBooksCRM.set(\'q\',this.value)" style="padding:6px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);min-width:200px;">' +
      sel('branch', L.branch, BK.branches, 'All branches') + sel('rep', L.rep, Object.keys(reps).sort(), 'All sales reps') + (L.tab === 'invoices' ? sel('status', L.status, ['Open', 'Overdue', 'Unpaid', 'Partially paid', 'Paid', 'Draft'], 'All statuses') : '') + '</div>' +
      '<div class="tabs">' + tabs.map(function (x) { return '<div class="tab ' + (L.tab === x[0] ? 'active' : '') + '" onclick="AcaciaBooksCRM.set(\'tab\',\'' + x[0] + '\')">' + x[1] + ' (' + x[2] + ')</div>'; }).join('') + '</div>' + body;
  }
  function overdueGroups() {
    var g = {}; BK.invoices.forEach(function (i) { if (!i.overdue || !mine(i)) return; var k = i.ctId || ('n:' + low(i.customer)); var x = g[k] = g[k] || { ctId: i.ctId, name: i.customer, rep: i.rep, branch: i.branch, n: 0, amt: 0, oldest: 0, nos: [] }; x.n++; x.amt += i.bal; x.oldest = Math.max(x.oldest, i.days); x.nos.push(i.no); });
    return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.amt - a.amt; });
  }
  function contactInfo(g) { var d = db(), ct = g.ctId && (d.contacts || []).filter(function (c) { return c.id === g.ctId; })[0], p = BK.phones[low(g.name)] || {}; return { phone: (ct && ct.phone) || p.phone || '', email: (ct && ct.email) || p.email || '' }; }
  function waNum(p) { var raw = String(p || '').trim(), d = raw.replace(/\D/g, ''); if (!d) return ''; if (raw.indexOf('+') === 0) return d; if (d.indexOf('00') === 0) return d.slice(2); if (d.charAt(0) === '0') return '254' + d.slice(1); if (d.length === 9) return '254' + d; return d; }
  function pageOverdue(c) {
    if (!BK) { c.innerHTML = head('Overdue follow-up', 'Waiting for Books data…') + '<div class="panel"><div class="empty">' + E(ST.msg) + '</div></div>'; return; }
    var gs = overdueGroups(), tot = gs.reduce(function (s, g) { return s + g.amt; }, 0);
    var rows = gs.map(function (g, ix) { var ci = contactInfo(g), msg = encodeURIComponent('Hello ' + g.name + ', a friendly reminder that ' + g.n + ' invoice(s) (' + g.nos.slice(0, 5).join(', ') + ') totalling ' + M(g.amt) + ' are overdue. Kindly let us know when payment will be made. Thank you.');
      return '<tr><td>' + (g.ctId ? '<span class="rowlink" onclick="previewContact(\'' + E(g.ctId) + '\')">' + E(g.name) + '</span>' : E(g.name)) + '</td><td>' + E(g.rep || '—') + '</td><td>' + E(g.branch || '—') + '</td><td>' + g.n + '</td><td><b style="color:#991b1b">' + M(g.amt) + '</b></td><td>' + g.oldest + ' days</td><td style="white-space:nowrap">' +
        (ci.phone ? '<a class="btn btn-sm" href="tel:' + E(ci.phone) + '">Call</a> <a class="btn btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + waNum(ci.phone) + '?text=' + msg + '">WhatsApp</a> ' : '') + (ci.email ? '<a class="btn btn-sm" href="mailto:' + E(ci.email) + '?subject=' + encodeURIComponent('Overdue invoices') + '&body=' + msg + '">Email</a> ' : '') + '<button class="btn btn-sm btn-primary" onclick="AcaciaBooksCRM.task(' + ix + ')">+ Follow-up task</button></td></tr>'; });
    c.innerHTML = head('Overdue follow-up', gs.length + ' customers · ' + M(tot) + ' overdue') + tbl(['Customer', 'Sales rep', 'Branch', 'Overdue invoices', 'Overdue amount', 'Oldest', 'Follow up'], rows, 'Nothing is overdue. 🎉');
    c._g = gs; w.AcaciaBooksCRM._groups = gs;
  }
  function dashPanel(c) {
    if (!BK) return; var inv = BK.invoices.filter(mine), t = totals(inv), gs = overdueGroups().slice(0, 5);
    c.insertAdjacentHTML('beforeend', '<div class="panel" style="margin-top:16px;"><h3>Books receivables</h3>' + kpis([['Outstanding', M(t.out), '#b45309'], ['Overdue (' + t.nOd + ' invoices)', M(t.od), t.od > 0 ? '#991b1b' : ''], ['Collected', M(t.paid)]]) + (gs.length ? tbl(['Customer', 'Overdue', 'Oldest'], gs.map(function (g) { return '<tr><td>' + (g.ctId ? '<span class="rowlink" onclick="previewContact(\'' + E(g.ctId) + '\')">' + E(g.name) + '</span>' : E(g.name)) + '</td><td>' + M(g.amt) + '</td><td>' + g.oldest + ' days</td></tr>'; }), '') + '<div style="margin-top:6px;"><span class="rowlink" onclick="goTo(\'bkoverdue\')">Open overdue follow-up →</span></div>' : '<div class="empty">Nothing overdue.</div>') + '</div>');
  }

  /* ---------- hooks into the CRM ---------- */
  try {
    var sales = NAV.filter(function (s) { return s.group === 'Sales'; })[0];
    if (sales) { if (!sales.items.some(function (i) { return i.id === 'bkledger'; })) sales.items.push({ id: 'bkledger', label: 'Invoices & Payments' }); if (!sales.items.some(function (i) { return i.id === 'bkoverdue'; })) sales.items.push({ id: 'bkoverdue', label: 'Overdue follow-up' }); }
    Object.keys(ROLE_NAV).forEach(function (r) { if (r === 'Marketing') return; ['bkledger', 'bkoverdue'].forEach(function (p) { if (ROLE_NAV[r].indexOf(p) < 0) ROLE_NAV[r].push(p); }); });
    if (typeof PALETTE_PAGES !== 'undefined') [['bkledger', 'Invoices & Payments'], ['bkoverdue', 'Overdue follow-up']].forEach(function (p) { if (!PALETTE_PAGES.some(function (x) { return x[0] === p[0]; })) PALETTE_PAGES.push(p); });
  } catch (e) { console.warn('[acacia-books-crm] nav', e); }

  var _rv = renderView;
  renderView = function () {
    var c = document.getElementById('content');
    if (currentView === 'bkledger') { c.innerHTML = ''; return pageLedger(c); }
    if (currentView === 'bkoverdue') { c.innerHTML = ''; return pageOverdue(c); }
    _rv();
    try {
      if (currentView === 'dashboard') dashPanel(c);
      else if (currentView === 'account-detail' && (typeof accountDetailTab === 'undefined' || accountDetailTab === 'overview') && currentDetail && currentDetail.id) {
        var ids = (db().contacts || []).filter(function (x) { return x.account === currentDetail.id; }).map(function (x) { return x.id; });
        if (ids.length) c.insertAdjacentHTML('beforeend', '<div class="panel" style="margin-top:16px;">' + panelFor(ids) + '</div>');
      }
    } catch (e) { console.warn('[acacia-books-crm] render', e); }
  };

  var _pc = previewContact;
  previewContact = function (id) {
    _pc(id);
    try { var body = document.querySelector('#modalBox .modal-body'); if (body) body.insertAdjacentHTML('beforeend', panelFor([id])); var box = document.getElementById('modalBox'); if (box) box.style.maxWidth = box.style.maxWidth || '980px'; } catch (e) { console.warn('[acacia-books-crm] preview', e); }
  };

  /* quotations: per-line VAT (from Books products) */
  var _qt = quoteTotals;
  quoteTotals = function (q) {
    var sub = 0, tax = 0; (q.items || []).forEach(function (i) { var l = Number(i.qty || 0) * Number(i.price || 0) * (1 - Number(i.discount || 0) / 100); sub += l; var r = i.taxRate != null && i.taxRate !== '' ? Number(i.taxRate) : Number(q.taxRate || 0); tax += l * r / 100; });
    return { sub: sub, tax: tax, total: sub + tax };
  };
  addQuoteProduct = function (id) {
    var q = findQuote(id); if (!q) return; var sel = document.getElementById('qAddProduct'), p = DB.products.find(function (x) { return x.id === (sel && sel.value); });
    if (!p) { toast('Pick a product first.'); return; }
    q.items = q.items || []; var it = { desc: p.name + (p.sku ? ' (' + p.sku + ')' : ''), qty: 1, price: Number(p.price || 0), discount: 0, productId: p.id }; if (p.taxRate != null && p.taxRate !== '') it.taxRate = Number(p.taxRate);
    q.items.push(it); save(); renderView();
  };

  /* products page: show type, VAT rate, stock and source */
  renderProducts = function (c) {
    var canEdit = canManage('products'), list = DB.products;
    var rows = list.map(function (p) { return '<tr><td><span class="rowlink" onclick="openProductForm(\'' + p.id + '\')">' + E(p.name) + '</span>' + (p.description ? '<div style="font-size:11px;color:var(--ink-soft)">' + E(String(p.description).slice(0, 90)) + '</div>' : '') + '</td><td>' + E(p.sku || '—') + '</td><td>' + E(p.type || '—') + '</td><td>' + E(p.category || '—') + '</td><td>' + fmtMoney(p.price) + '</td><td>' + (p.taxRate != null ? E(p.taxLabel || (p.taxRate + '%')) : '—') + '</td><td>' + E(p.unit || 'unit') + '</td><td>' + (p.type === 'Product' && p.bk ? Number(p.stock || 0) : '—') + '</td><td>' + (p.bk ? '<span class="pill" style="background:#e0f2f1;color:#0f766e">Books</span>' : '<span class="pill" style="background:#e5e7eb;color:#374151">CRM</span>') + '</td><td><span class="pill ' + (p.active === false ? 'status-Unqualified' : 'status-Qualified') + '">' + (p.active === false ? 'Inactive' : 'Active') + '</span></td><td style="text-align:right;">' + (canEdit ? '<button class="btn btn-sm" onclick="openProductForm(\'' + p.id + '\')">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteProduct(\'' + p.id + '\')">Delete</button>' : '') + '</td></tr>'; }).join('');
    c.innerHTML = '<div class="pageheader"><div><h1>Products &amp; Services</h1><div class="sub">' + list.length + ' items — ' + list.filter(function (p) { return p.bk; }).length + ' synced from Books (prices, VAT and stock follow Books) · used to build quotations.</div></div><div class="actions"><button class="btn" onclick="exportCSV(\'products\')">Export CSV</button>' + (canEdit ? '<button class="btn btn-primary" onclick="openProductForm()">+ New Product</button>' : '') + '</div></div>' +
      (list.length ? '<div class="tablewrap"><table><thead><tr><th>Name</th><th>SKU</th><th>Type</th><th>Category</th><th>Unit price</th><th>VAT</th><th>Unit</th><th>Stock</th><th>Source</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '<div class="panel"><div class="empty">No products yet. Add a product, or add items in Acacia Books and they will appear here.</div></div>');
  };

  /* ---------- public api ---------- */
  w.AcaciaBooksCRM = {
    refresh: function () { ST.msg = 'Refreshing…'; sync(true); },
    sync: sync, status: function () { return ST; },
    set: function (k, v) { L[k] = v; if (k === 'tab') { L.status = ''; } renderView(); },
    task: function (ix) {
      var g = (w.AcaciaBooksCRM._groups || [])[ix]; if (!g) return; var title = 'Follow up overdue invoices — ' + g.name + ' (' + M(g.amt) + ')', d = db();
      if ((d.activities || []).some(function (a) { return !a.done && a.title === title; })) { toast('A follow-up task for this customer already exists.'); return; }
      d.activities.push({ id: uid('act'), kind: 'Task', title: title, related: '', relatedType: '', due: today(), owner: (user() || {}).name || '', done: false }); save(); toast('Follow-up task created.');
    },
    _t: { build: build, applyProducts: applyProducts, applyQuotes: applyQuotes, applyContacts: applyContacts, panelFor: panelFor, set: function (r) { RAW = r; BK = build(); return BK; } }
  };

  /* ---------- schedule ---------- */
  var cached = false;
  setTimeout(function wait() {
    var u = user(), d = db();
    if (u && d && !cached) { cached = true; if (readCache()) { try { BK = build(); } catch (e) {} } }
    if (u && d) sync(); setTimeout(wait, u ? 30000 : 1500);
  }, 2500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) soon(800); });
})(window);
