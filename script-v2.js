/* =========================================================
   ACACIA BOOKS CRM — v2 upgrade layer
   Adds: Products, Quotations (with line items + print),
   Sales targets, CSV import/export, JSON backup/restore,
   command palette (Ctrl/Cmd+K).
   Functions here intentionally override earlier definitions.
   ========================================================= */

const V2_COLLECTIONS = ["accounts","contacts","leads","deals","activities","timeline","notifications","products","quotes"];

function seedData(){
  const d = {nextIds:{}, settings:{monthlyTarget:0, taxRate:16, quoteValidityDays:30, quoteSeq:1}};
  V2_COLLECTIONS.forEach(k=> d[k] = []);
  return d;
}
function migrateDB(db){
  if(!db || typeof db !== "object") db = {};
  V2_COLLECTIONS.forEach(k=>{ if(!Array.isArray(db[k])) db[k] = []; });
  db.nextIds = db.nextIds || {};
  db.settings = Object.assign({monthlyTarget:0, taxRate:16, quoteValidityDays:30, quoteSeq:1}, db.settings || {});
  return db;
}
function load(companyId){
  let db = null;
  try{
    const raw = localStorage.getItem(dataKeyFor(companyId));
    if(raw) db = JSON.parse(raw);
  }catch(e){}
  db = migrateDB(db || seedData());
  localStorage.setItem(dataKeyFor(companyId), JSON.stringify(db));
  return db;
}

/* ---------- Nav additions ---------- */
(function extendNav(){
  const sales = NAV.find(s=>s.group==="Sales");
  if(sales && !sales.items.some(i=>i.id==="quotes")){
    sales.items.push({id:"products", label:"Products"});
    sales.items.push({id:"quotes", label:"Quotations"});
  }
  const reports = NAV.find(s=>s.group==="Reports");
  if(reports && !reports.items.some(i=>i.id==="targets")) reports.items.push({id:"targets", label:"Sales Targets"});
})();

/* ---------- View router (extended) ---------- */
function renderView(){
  const c = document.getElementById("content");
  const map = {
    dashboard: renderDashboard,
    leads: renderLeads,
    "lead-sources": renderLeadSources,
    "lead-scoring": renderLeadScoring,
    accounts: renderAccounts,
    "account-detail": renderAccountDetail,
    contacts: renderContacts,
    deals: renderDealsList,
    "deal-detail": renderDealDetail,
    pipeline: renderPipeline,
    forecast: renderForecast,
    products: renderProducts,
    quotes: renderQuotes,
    "quote-detail": renderQuoteDetail,
    targets: renderTargets,
    tasks: ()=>renderActivities("Task"),
    calls: ()=>renderActivities("Call"),
    meetings: ()=>renderActivities("Meeting"),
    calendar: renderCalendar,
    reports: renderReports,
    analytics: renderAnalytics,
    settings: renderSettings,
    "lead-detail": renderLeadDetail
  };
  const fn = map[currentView] || renderDashboard;
  c.innerHTML = "";
  fn(c);
}

/* =========================================================
   PRODUCTS
   ========================================================= */
function renderProducts(c){
  const canEdit = canManage('products');
  const rows = DB.products.map(p=>`
    <tr>
      <td><span class="rowlink" onclick="openProductForm('${p.id}')">${esc(p.name)}</span></td>
      <td>${esc(p.sku||"—")}</td>
      <td>${esc(p.category||"—")}</td>
      <td>${fmtMoney(p.price)}</td>
      <td>${p.unit||"unit"}</td>
      <td><span class="pill ${p.active===false?"status-Unqualified":"status-Qualified"}">${p.active===false?"Inactive":"Active"}</span></td>
      <td style="text-align:right;">${canEdit ? `<button class="btn btn-sm" onclick="openProductForm('${p.id}')">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>` : ``}</td>
    </tr>`).join("");
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Products &amp; Services</h1><div class="sub">${DB.products.length} items in your catalogue — used to build quotations.</div></div>
      <div class="actions">
        <button class="btn" onclick="exportCSV('products')">Export CSV</button>
        ${canEdit ? `<button class="btn btn-primary" onclick="openProductForm()">+ New Product</button>` : ``}
      </div>
    </div>
    ${DB.products.length ? `<div class="tablewrap"><table>
      <thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Unit price</th><th>Unit</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : `<div class="panel"><div class="empty">No products yet. Add your first product or service to start quoting.</div></div>`}
  `;
}
function openProductForm(id){
  const p = id ? DB.products.find(x=>x.id===id) : null;
  const body = `<div class="formgrid">
    <div class="field full"><label>Name</label><input id="p_name" value="${p?esc(p.name):''}"></div>
    <div class="field"><label>SKU / Code</label><input id="p_sku" value="${p?esc(p.sku||''):''}"></div>
    <div class="field"><label>Category</label><input id="p_cat" value="${p?esc(p.category||''):''}"></div>
    <div class="field"><label>Unit price (KSh)</label><input id="p_price" type="number" min="0" value="${p?p.price:0}"></div>
    <div class="field"><label>Unit</label><input id="p_unit" value="${p?esc(p.unit||'unit'):'unit'}"></div>
    <div class="field"><label>Status</label><select id="p_active"><option value="1" ${p&&p.active===false?"":"selected"}>Active</option><option value="0" ${p&&p.active===false?"selected":""}>Inactive</option></select></div>
    <div class="field full"><label>Description</label><textarea id="p_desc">${p?esc(p.description||''):''}</textarea></div>
  </div>`;
  openModal(p?"Edit product":"New product", body, ()=>{
    const name = val("p_name");
    if(!name){ toast("Product name is required."); return false; }
    const rec = {
      name, sku: val("p_sku"), category: val("p_cat"),
      price: Number(val("p_price")||0), unit: val("p_unit")||"unit",
      active: val("p_active")==="1", description: val("p_desc")
    };
    if(p) Object.assign(p, rec);
    else DB.products.push(Object.assign({id:uid("pr")}, rec));
    save(); renderView(); toast(p?"Product updated.":"Product added.");
  });
}
function deleteProduct(id){
  if(!confirm("Delete this product? Existing quotations keep their saved line items.")) return;
  DB.products = DB.products.filter(p=>p.id!==id);
  save(); renderView(); toast("Product deleted.");
}

/* =========================================================
   QUOTATIONS
   ========================================================= */
const QUOTE_STATUSES = ["Draft","Sent","Accepted","Declined","Expired"];
function quoteTotals(q){
  const sub = (q.items||[]).reduce((s,i)=> s + Number(i.qty||0)*Number(i.price||0)*(1-Number(i.discount||0)/100), 0);
  const tax = sub * Number(q.taxRate||0)/100;
  return {sub, tax, total: sub+tax};
}
function nextQuoteNumber(){
  const n = DB.settings.quoteSeq || 1;
  DB.settings.quoteSeq = n + 1;
  return "QT-" + String(new Date().getFullYear()) + "-" + String(n).padStart(4,"0");
}
function effectiveQuoteStatus(q){
  if(q.status==="Draft" || q.status==="Sent"){
    if(q.validUntil && q.validUntil < todayISO()) return "Expired";
  }
  return q.status;
}

function renderQuotes(c){
  const list = scopeOwn([...DB.quotes]).sort((a,b)=> (b.date||"").localeCompare(a.date||""));
  const totalValue = list.reduce((s,q)=> s + quoteTotals(q).total, 0);
  const accepted = list.filter(q=>q.status==="Accepted");
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Quotations</h1><div class="sub">${list.length} quotations · ${fmtMoney(Math.round(totalValue))} quoted</div></div>
      <div class="actions">
        <button class="btn" onclick="exportCSV('quotes')">Export CSV</button>
        ${canManage('quotes') ? `<button class="btn btn-primary" onclick="openQuoteForm()">+ New Quotation</button>` : ``}
      </div>
    </div>
    <div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">
      ${kpi("Quotations", list.length)}
      ${kpi("Value quoted", fmtMoney(Math.round(totalValue)))}
      ${kpi("Accepted", accepted.length)}
      ${kpi("Accepted value", fmtMoney(Math.round(accepted.reduce((s,q)=>s+quoteTotals(q).total,0))))}
    </div>
    ${list.length ? `<div class="tablewrap"><table>
      <thead><tr><th>Number</th><th>Account</th><th>Date</th><th>Valid until</th><th>Items</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>${list.map(q=>{
        const st = effectiveQuoteStatus(q);
        const acc = findAccount(q.account);
        return `<tr onclick="goTo('quote-detail',{type:'quote',id:'${q.id}'})">
          <td><span class="rowlink">${q.number}</span></td>
          <td>${acc?esc(acc.name):esc(q.customerName||"—")}</td>
          <td>${fmtDate(q.date)}</td>
          <td>${fmtDate(q.validUntil)}</td>
          <td>${(q.items||[]).length}</td>
          <td>${fmtMoney(Math.round(quoteTotals(q).total))}</td>
          <td><span class="pill q-${st}">${st}</span></td>
        </tr>`;
      }).join("")}</tbody></table></div>`
    : `<div class="panel"><div class="empty">No quotations yet. Create one to send pricing to a customer.</div></div>`}
  `;
}

function openQuoteForm(){
  const days = DB.settings.quoteValidityDays || 30;
  const valid = new Date(Date.now() + days*86400000).toISOString().slice(0,10);
  const body = `<div class="formgrid">
    <div class="field"><label>Account</label><select id="q_account"><option value="">— None —</option>${DB.accounts.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Contact</label><select id="q_contact"><option value="">— None —</option>${DB.contacts.map(ct=>`<option value="${ct.id}">${esc(ct.first+" "+ct.last)}</option>`).join("")}</select></div>
    <div class="field full"><label>Or customer name (if not an account yet)</label><input id="q_customer" placeholder="e.g. Baraka Traders Ltd"></div>
    <div class="field"><label>Linked deal</label><select id="q_deal"><option value="">— None —</option>${DB.deals.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Quote date</label><input id="q_date" type="date" value="${todayISO()}"></div>
    <div class="field"><label>Valid until</label><input id="q_valid" type="date" value="${valid}"></div>
    <div class="field"><label>VAT / tax rate (%)</label><input id="q_tax" type="number" min="0" value="${DB.settings.taxRate||0}"></div>
  </div>`;
  openModal("New quotation", body, ()=>{
    const q = {
      id: uid("qt"), number: nextQuoteNumber(),
      account: val("q_account"), contact: val("q_contact"),
      customerName: val("q_customer"), deal: val("q_deal"),
      date: val("q_date") || todayISO(), validUntil: val("q_valid"),
      taxRate: Number(val("q_tax")||0), status: "Draft",
      owner: CURRENT_USER.name, items: [], notes: "", terms: "Payment due within 30 days of acceptance."
    };
    DB.quotes.push(q);
    addTimeline(q.id, "quote", `Quotation ${q.number} created.`);
    save();
    goTo("quote-detail", {type:"quote", id:q.id});
    toast("Quotation created — add line items.");
  }, "Create");
}

function findQuote(id){ return DB.quotes.find(q=>q.id===id); }

function renderQuoteDetail(c){
  const q = findQuote(currentDetail && currentDetail.id);
  if(!q){ goTo("quotes"); return; }
  const t = quoteTotals(q);
  const st = effectiveQuoteStatus(q);
  const acc = findAccount(q.account);
  const ct = findContact(q.contact);
  const deal = findDeal(q.deal);
  c.innerHTML = `
    <div class="pageheader">
      <div>
        <div class="sub"><span class="rowlink" onclick="goTo('quotes')">← Quotations</span></div>
        <h1>${q.number} <span class="pill q-${st}" style="vertical-align:middle;">${st}</span></h1>
        <div class="sub">${acc?esc(acc.name):esc(q.customerName||"No customer set")} · ${fmtDate(q.date)} · valid until ${fmtDate(q.validUntil)}</div>
      </div>
      <div class="actions">
        <button class="btn" onclick="window.print()">Print / PDF</button>
        ${st!=="Accepted" ? `<button class="btn" onclick="setQuoteStatus('${q.id}','Sent')">Mark Sent</button>
        <button class="btn btn-primary" onclick="setQuoteStatus('${q.id}','Accepted')">Mark Accepted</button>` : ``}
        ${st!=="Declined" ? `<button class="btn btn-danger" onclick="setQuoteStatus('${q.id}','Declined')">Declined</button>`:``}
      </div>
    </div>

    <div class="panel">
      <h3>Line items <span class="count">${(q.items||[]).length}</span></h3>
      <div class="lineitem-head"><div>Description</div><div>Qty</div><div>Unit price</div><div>Disc %</div><div style="text-align:right;">Total</div><div></div></div>
      <div id="qItems">
        ${(q.items||[]).map((it,idx)=>lineItemRow(q,it,idx)).join("") || `<div class="empty">No line items yet.</div>`}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
        <button class="btn btn-sm" onclick="addQuoteItem('${q.id}')">+ Blank line</button>
        ${DB.products.filter(p=>p.active!==false).length ? `<select id="qAddProduct" style="padding:7px 10px;border:1px solid var(--line);border-radius:var(--radius);background:var(--paper);">
          <option value="">Add from catalogue…</option>
          ${DB.products.filter(p=>p.active!==false).map(p=>`<option value="${p.id}">${esc(p.name)} — ${fmtMoney(p.price)}</option>`).join("")}
        </select><button class="btn btn-sm btn-gold" onclick="addQuoteProduct('${q.id}')">Add product</button>` : `<span style="font-size:12px;color:var(--ink-soft);align-self:center;">Tip: add products under Sales → Products to quote faster.</span>`}
      </div>
      <div class="qtotals" style="margin-top:16px;">
        <div class="row"><span>Subtotal</span><span>${fmtMoney(Math.round(t.sub))}</span></div>
        <div class="row"><span>VAT / tax (${q.taxRate||0}%)</span><span>${fmtMoney(Math.round(t.tax))}</span></div>
        <div class="row grand"><span>Total</span><span>${fmtMoney(Math.round(t.total))}</span></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <h3>Customer &amp; linkage</h3>
        <div class="listrow"><div class="main"><div class="meta">Account</div><div class="title">${acc?`<span class="rowlink" onclick="goTo('account-detail',{type:'account',id:'${acc.id}'})">${esc(acc.name)}</span>`:esc(q.customerName||"—")}</div></div></div>
        <div class="listrow"><div class="main"><div class="meta">Contact</div><div class="title">${ct?esc(ct.first+" "+ct.last):"—"}</div></div></div>
        <div class="listrow"><div class="main"><div class="meta">Deal</div><div class="title">${deal?`<span class="rowlink" onclick="goTo('deal-detail',{type:'deal',id:'${deal.id}'})">${esc(deal.name)}</span>`:"Not linked"}</div></div>
          ${!deal?`<button class="btn btn-sm btn-primary" onclick="quoteToDeal('${q.id}')">Create deal</button>`:``}</div>
        <div class="listrow"><div class="main"><div class="meta">Owner</div><div class="title">${esc(q.owner||"—")}</div></div></div>
        <div class="listrow"><div class="main"><div class="meta">Tax rate</div><div class="title">${q.taxRate||0}%</div></div><button class="btn btn-sm" onclick="editQuoteMeta('${q.id}')">Edit</button></div>
      </div>
      <div class="panel">
        <h3>Notes &amp; terms</h3>
        <div class="field"><label>Notes to customer</label><textarea id="q_notes" oninput="saveQuoteText('${q.id}')">${esc(q.notes||"")}</textarea></div>
        <div class="field" style="margin-top:10px;"><label>Terms</label><textarea id="q_terms" oninput="saveQuoteText('${q.id}')">${esc(q.terms||"")}</textarea></div>
        <div style="font-size:11.5px;color:var(--ink-soft);margin-top:8px;">Saved automatically as you type.</div>
      </div>
    </div>
  `;
}
function lineItemRow(q,it,idx){
  const total = Number(it.qty||0)*Number(it.price||0)*(1-Number(it.discount||0)/100);
  return `<div class="lineitem">
    <input value="${esc(it.desc||"")}" placeholder="Description" oninput="updateQuoteItem('${q.id}',${idx},'desc',this.value)">
    <input type="number" min="0" value="${it.qty}" oninput="updateQuoteItem('${q.id}',${idx},'qty',this.value)">
    <input type="number" min="0" value="${it.price}" oninput="updateQuoteItem('${q.id}',${idx},'price',this.value)">
    <input type="number" min="0" max="100" value="${it.discount||0}" oninput="updateQuoteItem('${q.id}',${idx},'discount',this.value)">
    <div class="li-total">${fmtMoney(Math.round(total))}</div>
    <button class="xbtn" title="Remove line" onclick="removeQuoteItem('${q.id}',${idx})">✕</button>
  </div>`;
}
function addQuoteItem(id){
  const q = findQuote(id); if(!q) return;
  q.items = q.items || [];
  q.items.push({desc:"", qty:1, price:0, discount:0});
  save(); renderView();
}
function addQuoteProduct(id){
  const q = findQuote(id); if(!q) return;
  const sel = document.getElementById("qAddProduct");
  const p = DB.products.find(x=>x.id===(sel && sel.value));
  if(!p){ toast("Pick a product first."); return; }
  q.items = q.items || [];
  q.items.push({desc:p.name + (p.sku?` (${p.sku})`:""), qty:1, price:Number(p.price||0), discount:0, productId:p.id});
  save(); renderView();
}
function updateQuoteItem(id, idx, field, value){
  const q = findQuote(id); if(!q || !q.items[idx]) return;
  q.items[idx][field] = (field==="desc") ? value : Number(value||0);
  save();
  if(field!=="desc" || false) { /* keep focus: only refresh totals */ }
  refreshQuoteTotals(q, idx);
}
function refreshQuoteTotals(q, idx){
  const t = quoteTotals(q);
  const rows = document.querySelectorAll("#qItems .lineitem");
  if(rows[idx]){
    const it = q.items[idx];
    rows[idx].querySelector(".li-total").textContent = fmtMoney(Math.round(Number(it.qty||0)*Number(it.price||0)*(1-Number(it.discount||0)/100)));
  }
  const box = document.querySelector(".qtotals");
  if(box){
    box.innerHTML = `
      <div class="row"><span>Subtotal</span><span>${fmtMoney(Math.round(t.sub))}</span></div>
      <div class="row"><span>VAT / tax (${q.taxRate||0}%)</span><span>${fmtMoney(Math.round(t.tax))}</span></div>
      <div class="row grand"><span>Total</span><span>${fmtMoney(Math.round(t.total))}</span></div>`;
  }
}
function removeQuoteItem(id, idx){
  const q = findQuote(id); if(!q) return;
  q.items.splice(idx,1); save(); renderView();
}
function saveQuoteText(id){
  const q = findQuote(id); if(!q) return;
  const n = document.getElementById("q_notes"), t = document.getElementById("q_terms");
  if(n) q.notes = n.value;
  if(t) q.terms = t.value;
  save();
}
function editQuoteMeta(id){
  const q = findQuote(id); if(!q) return;
  const body = `<div class="formgrid">
    <div class="field"><label>Account</label><select id="q_account"><option value="">— None —</option>${DB.accounts.map(a=>`<option value="${a.id}" ${q.account===a.id?"selected":""}>${esc(a.name)}</option>`).join("")}</select></div>
    <div class="field"><label>Contact</label><select id="q_contact"><option value="">— None —</option>${DB.contacts.map(ct=>`<option value="${ct.id}" ${q.contact===ct.id?"selected":""}>${esc(ct.first+" "+ct.last)}</option>`).join("")}</select></div>
    <div class="field"><label>Quote date</label><input id="q_date" type="date" value="${q.date||todayISO()}"></div>
    <div class="field"><label>Valid until</label><input id="q_valid" type="date" value="${q.validUntil||""}"></div>
    <div class="field"><label>Tax rate (%)</label><input id="q_tax" type="number" min="0" value="${q.taxRate||0}"></div>
    <div class="field"><label>Status</label><select id="q_status">${QUOTE_STATUSES.map(s=>`<option ${q.status===s?"selected":""}>${s}</option>`).join("")}</select></div>
  </div>`;
  openModal("Edit quotation "+q.number, body, ()=>{
    q.account = val("q_account"); q.contact = val("q_contact");
    q.date = val("q_date"); q.validUntil = val("q_valid");
    q.taxRate = Number(val("q_tax")||0); q.status = val("q_status");
    save(); renderView(); toast("Quotation updated.");
  });
}
function setQuoteStatus(id, status){
  const q = findQuote(id); if(!q) return;
  q.status = status;
  addTimeline(q.id, "quote", `Quotation ${q.number} marked ${status}.`);
  notify(`Quotation ${q.number} marked ${status}.`);
  save(); renderView(); toast("Status: "+status);
  if(status==="Accepted" && !q.deal) quoteToDeal(id, true);
}
function quoteToDeal(id, silent){
  const q = findQuote(id); if(!q) return;
  const t = quoteTotals(q);
  const d = {
    id: uid("dl"),
    name: (findAccount(q.account) ? findAccount(q.account).name : (q.customerName||"New")) + " — " + q.number,
    account: q.account, contact: q.contact,
    amount: Math.round(t.total), stage: q.status==="Accepted" ? "Negotiation" : "Proposal",
    probability: q.status==="Accepted" ? 80 : 50,
    closing: q.validUntil || todayISO(), owner: q.owner || CURRENT_USER.name,
    source: "Quotation", type: "New Business", nextStep: "Follow up on quotation", timeline: []
  };
  DB.deals.push(d);
  q.deal = d.id;
  addTimeline(d.id, "deal", `Deal created from quotation ${q.number}.`);
  save();
  if(silent){ renderView(); toast("Deal created from quotation."); }
  else goTo("deal-detail", {type:"deal", id:d.id});
}

/* =========================================================
   SALES TARGETS
   ========================================================= */
function renderTargets(c){
  const target = Number(DB.settings.monthlyTarget||0);
  const month = todayISO().slice(0,7);
  const wonThisMonth = DB.deals.filter(d=>d.stage==="Closed Won" && (d.closing||"").slice(0,7)===month);
  const won = wonThisMonth.reduce((s,d)=>s+Number(d.amount||0),0);
  const openWeighted = DB.deals.filter(d=>!d.stage.startsWith("Closed")).reduce((s,d)=>s+Number(d.amount||0)*Number(d.probability||0)/100,0);
  const pct = target ? Math.min(100, Math.round(won/target*100)) : 0;
  const byOwner = {};
  DB.deals.filter(d=>d.stage==="Closed Won").forEach(d=>{ byOwner[d.owner||"Unassigned"] = (byOwner[d.owner||"Unassigned"]||0) + Number(d.amount||0); });
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Sales Targets</h1><div class="sub">Progress against your monthly revenue goal.</div></div>
      <div class="actions"><button class="btn btn-primary" onclick="editTarget()">Set target</button></div>
    </div>
    <div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">
      ${kpi("Monthly target", target?fmtMoney(target):"Not set")}
      ${kpi("Closed won this month", fmtMoney(won))}
      ${kpi("Gap to target", target?fmtMoney(Math.max(0,target-won)):"—")}
      ${kpi("Weighted pipeline", fmtMoney(Math.round(openWeighted)))}
    </div>
    <div class="panel">
      <h3>This month</h3>
      <div class="goalbar"><span style="width:${pct}%"></span></div>
      <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-soft);margin-top:6px;">
        <span>${pct}% of target</span><span>${fmtMoney(won)} / ${target?fmtMoney(target):"—"}</span>
      </div>
    </div>
    <div class="panel">
      <h3>Closed won by owner</h3>
      ${Object.keys(byOwner).length ? Object.entries(byOwner).sort((a,b)=>b[1]-a[1]).map(([o,v])=>`
        <div class="listrow"><div class="main"><div class="title">${esc(o)}</div></div><div style="font-weight:700;">${fmtMoney(v)}</div></div>`).join("")
      : `<div class="empty">No won deals yet.</div>`}
    </div>
  `;
}
function editTarget(){
  openModal("Monthly revenue target", `<div class="formgrid">
    <div class="field full"><label>Target (KSh per month)</label><input id="t_target" type="number" min="0" value="${DB.settings.monthlyTarget||0}"></div>
    <div class="field"><label>Default tax rate (%)</label><input id="t_tax" type="number" min="0" value="${DB.settings.taxRate||0}"></div>
    <div class="field"><label>Quote validity (days)</label><input id="t_valid" type="number" min="1" value="${DB.settings.quoteValidityDays||30}"></div>
  </div>`, ()=>{
    DB.settings.monthlyTarget = Number(val("t_target")||0);
    DB.settings.taxRate = Number(val("t_tax")||0);
    DB.settings.quoteValidityDays = Number(val("t_valid")||30);
    save(); renderView(); toast("Targets saved.");
  });
}

/* =========================================================
   CSV / JSON IMPORT-EXPORT
   ========================================================= */
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function csvCell(v){
  const s = v==null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
function toCSV(rows){
  if(!rows.length) return "";
  const cols = Array.from(rows.reduce((set,r)=>{ Object.keys(r).forEach(k=>set.add(k)); return set; }, new Set()));
  return [cols.join(","), ...rows.map(r=>cols.map(c=>csvCell(r[c])).join(","))].join("\n");
}
function download(filename, text, mime){
  const blob = new Blob([text], {type: mime || "text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1500);
}
function exportCSV(collection){
  const rows = DB[collection] || [];
  if(!rows.length){ toast("Nothing to export yet."); return; }
  const flat = rows.map(r=> collection==="quotes" ? Object.assign({}, r, {items:(r.items||[]).length, total: Math.round(quoteTotals(r).total)}) : r);
  download(`acacia-${collection}-${todayISO()}.csv`, toCSV(flat), "text/csv;charset=utf-8");
  toast(`${collection} exported.`);
}
function parseCSV(text){
  const rows = []; let cur = [], field = "", q = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    if(q){
      if(ch === '"'){ if(text[i+1] === '"'){ field += '"'; i++; } else q = false; }
      else field += ch;
    } else if(ch === '"') q = true;
    else if(ch === ','){ cur.push(field); field = ""; }
    else if(ch === '\n'){ cur.push(field); rows.push(cur); cur = []; field = ""; }
    else if(ch !== '\r') field += ch;
  }
  if(field.length || cur.length){ cur.push(field); rows.push(cur); }
  return rows.filter(r=> r.some(v=>String(v).trim() !== ""));
}
const IMPORT_TEMPLATES = {
  leads:   ["name","company","title","email","phone","source","status","score","owner","industry","notes"],
  accounts:["name","industry","website","phone","owner","type","status","city","country"],
  contacts:["first","last","title","email","phone","account","owner","department"],
  products:["name","sku","category","price","unit","description"]
};
function openImport(){
  const body = `
    <div class="field full"><label>What are you importing?</label>
      <select id="im_type">${Object.keys(IMPORT_TEMPLATES).map(k=>`<option value="${k}">${k.charAt(0).toUpperCase()+k.slice(1)}</option>`).join("")}</select>
    </div>
    <div style="font-size:12px;color:var(--ink-soft);margin:10px 0;">Your CSV needs a header row. Recognised columns per type are shown after you download a template.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
      <button class="btn btn-sm" onclick="downloadTemplate()">Download template CSV</button>
    </div>
    <div class="field full"><label>CSV file</label><input id="im_file" type="file" accept=".csv,text/csv"></div>
    <div id="im_status" style="font-size:12px;color:var(--ink-soft);margin-top:10px;"></div>`;
  openModal("Import from CSV", body, ()=>{
    const type = val("im_type");
    const file = document.getElementById("im_file").files[0];
    if(!file){ toast("Choose a CSV file first."); return false; }
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const rows = parseCSV(String(reader.result));
        if(rows.length < 2){ toast("That file has no data rows."); return; }
        const header = rows[0].map(h=>h.trim().toLowerCase());
        let added = 0;
        rows.slice(1).forEach(r=>{
          const rec = {};
          header.forEach((h,i)=>{ rec[h] = (r[i]||"").trim(); });
          const built = buildImportRecord(type, rec);
          if(built){ DB[type].push(built); added++; }
        });
        save();
        toast(`${added} ${type} imported.`);
        goTo(type === "products" ? "products" : type);
      }catch(e){ toast("Could not read that CSV."); }
    };
    reader.readAsText(file);
  }, "Import");
}
function downloadTemplate(){
  const type = val("im_type") || "leads";
  download(`acacia-${type}-template.csv`, IMPORT_TEMPLATES[type].join(",") + "\n", "text/csv;charset=utf-8");
}
function buildImportRecord(type, r){
  const owner = r.owner || (CURRENT_USER ? CURRENT_USER.name : "");
  if(type === "leads"){
    if(!r.name && !r.company) return null;
    return {id:uid("ld"), name:r.name||r.company, company:r.company||"", title:r.title||"", email:r.email||"",
      phone:r.phone||"", source:r.source||"Import", status:r.status||"New", score:Number(r.score||10),
      owner, industry:r.industry||"", notes:r.notes||"", created:todayISO(), timeline:[]};
  }
  if(type === "accounts"){
    if(!r.name) return null;
    return {id:uid("ac"), name:r.name, industry:r.industry||"", website:r.website||"", phone:r.phone||"",
      owner, type:r.type||"Customer", status:r.status||"Active", city:r.city||"", country:r.country||"Kenya", created:todayISO()};
  }
  if(type === "contacts"){
    if(!r.first && !r.last) return null;
    const acc = DB.accounts.find(a=>a.name.toLowerCase() === String(r.account||"").toLowerCase());
    return {id:uid("ct"), first:r.first||"", last:r.last||"", title:r.title||"", email:r.email||"",
      phone:r.phone||"", account:acc?acc.id:"", owner, department:r.department||""};
  }
  if(type === "products"){
    if(!r.name) return null;
    return {id:uid("pr"), name:r.name, sku:r.sku||"", category:r.category||"", price:Number(r.price||0),
      unit:r.unit||"unit", description:r.description||"", active:true};
  }
  return null;
}
function backupJSON(){
  download(`acacia-crm-backup-${todayISO()}.json`, JSON.stringify({company:CURRENT_USER.company, exported:new Date().toISOString(), data:DB}, null, 2), "application/json");
  toast("Backup downloaded.");
}
function openRestore(){
  openModal("Restore from backup", `
    <div class="field full"><label>Backup JSON file</label><input id="rs_file" type="file" accept=".json,application/json"></div>
    <div style="font-size:12px;color:var(--clay);margin-top:10px;">This replaces all current data for this company.</div>`, ()=>{
    const file = document.getElementById("rs_file").files[0];
    if(!file){ toast("Choose a backup file."); return false; }
    const reader = new FileReader();
    reader.onload = ()=>{
      try{
        const parsed = JSON.parse(String(reader.result));
        DB = migrateDB(parsed.data || parsed);
        save(); goTo("dashboard"); toast("Backup restored.");
      }catch(e){ toast("That file is not a valid backup."); }
    };
    reader.readAsText(file);
  }, "Restore");
}

/* ---------- Settings (extended) ---------- */
function renderSettings(c){
  c.innerHTML = `
    <div class="pageheader"><div><h1>Settings</h1><div class="sub">Company preferences, data import/export and backups.</div></div></div>
    <div class="panel">
      <h3>Company</h3>
      <div class="settings-card"><div><div class="t">${esc(CURRENT_USER.company)}</div><div class="d">Signed in as ${esc(CURRENT_USER.name)} · ${esc(CURRENT_USER.email)} · ${esc(currentRole())}</div></div></div>
      <div class="settings-card"><div><div class="t">Monthly revenue target</div><div class="d">${DB.settings.monthlyTarget?fmtMoney(DB.settings.monthlyTarget):"Not set yet"} — drives the Sales Targets page.</div></div><button class="btn btn-sm" onclick="editTarget()">Edit</button></div>
      <div class="settings-card"><div><div class="t">Quoting defaults</div><div class="d">Tax ${DB.settings.taxRate||0}% · quotes valid ${DB.settings.quoteValidityDays||30} days.</div></div><button class="btn btn-sm" onclick="editTarget()">Edit</button></div>
    </div>
    ${isAdmin() ? `<div class="panel">
      <h3>Team</h3>
      <div class="settings-card"><div><div class="t">Users &amp; roles</div><div class="d">${companyUsers().length} teammate${companyUsers().length===1?"":"s"} · Administrator, Sales Manager, Salesperson, Marketing, Support, Viewer.</div></div><button class="btn btn-sm btn-primary" onclick="goTo('users-roles')">Manage</button></div>
    </div>` : ``}
    <div class="panel">
      <h3>Data</h3>
      <div class="settings-card"><div><div class="t">Import from CSV</div><div class="d">Bring in leads, accounts, contacts or products. Templates included.</div></div><button class="btn btn-sm btn-primary" onclick="openImport()">Import</button></div>
      <div class="settings-card"><div><div class="t">Export CSV</div><div class="d">Download any table for Excel or Sheets.</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${["leads","accounts","contacts","deals","products","quotes","activities"].map(k=>`<button class="btn btn-sm" onclick="exportCSV('${k}')">${k}</button>`).join("")}
        </div></div>
      <div class="settings-card"><div><div class="t">Full backup</div><div class="d">Download every record as one JSON file.</div></div><button class="btn btn-sm" onclick="backupJSON()">Backup</button></div>
      ${isAdmin() ? `
      <div class="settings-card"><div><div class="t">Restore backup</div><div class="d">Replace current data with a backup file.</div></div><button class="btn btn-sm" onclick="openRestore()">Restore</button></div>
      <div class="settings-card"><div><div class="t">Clear all data</div><div class="d">Permanently delete every record for this company.</div></div><button class="btn btn-sm btn-danger" onclick="resetDemoData()">Clear data</button></div>` : `
      <div class="settings-card"><div><div class="t">Restore backup &amp; clear data</div><div class="d">Administrator only.</div></div></div>`}
    </div>
    <div class="panel">
      <h3>Coming from the roadmap</h3>
      <div class="settings-card"><div><div class="t">Automation rules</div><div class="d">e.g. "Deal moves to Proposal → create follow-up task in 3 days."</div></div><button class="btn btn-sm" disabled>Planned</button></div>
      <div class="settings-card"><div><div class="t">Custom fields &amp; territories</div><div class="d">Extend records and assign accounts to regions.</div></div><button class="btn btn-sm" disabled>Planned</button></div>
    </div>
  `;
}

/* =========================================================
   COMMAND PALETTE (Ctrl / Cmd + K)
   ========================================================= */
const PALETTE_PAGES = [
  ["dashboard","Dashboard"],["leads","Leads"],["accounts","Accounts"],["contacts","Contacts"],
  ["deals","Deals"],["pipeline","Pipeline"],["forecast","Forecast"],["products","Products"],
  ["quotes","Quotations"],["targets","Sales Targets"],["tasks","Tasks"],["calls","Calls"],
  ["meetings","Meetings"],["calendar","Calendar"],["reports","Reports"],["analytics","Analytics"],["settings","Settings"]
];
let palResults = [], palIndex = 0;
function openPalette(){
  const back = document.getElementById("paletteBack");
  back.classList.add("open");
  const input = document.getElementById("paletteInput");
  input.value = ""; input.focus();
  buildPalette("");
}
function closePalette(){ document.getElementById("paletteBack").classList.remove("open"); }
function buildPalette(q){
  q = q.trim().toLowerCase();
  const hit = (s)=> !q || String(s||"").toLowerCase().includes(q);
  const out = [];
  PALETTE_PAGES.filter(p=>hit(p[1])).slice(0,6).forEach(p=> out.push({tag:"Page", label:p[1], go:()=>goTo(p[0])}));
  if(q){
    DB.leads.filter(l=>hit(l.name)||hit(l.company)).slice(0,5).forEach(l=>out.push({tag:"Lead", label:`${l.name} · ${l.company||""}`, go:()=>goTo("lead-detail",{type:"lead",id:l.id})}));
    DB.accounts.filter(a=>hit(a.name)).slice(0,5).forEach(a=>out.push({tag:"Account", label:a.name, go:()=>goTo("account-detail",{type:"account",id:a.id})}));
    DB.contacts.filter(ct=>hit(ct.first+" "+ct.last)||hit(ct.email)).slice(0,5).forEach(ct=>out.push({tag:"Contact", label:`${ct.first} ${ct.last}`, go:()=>goTo("contacts")}));
    DB.deals.filter(d=>hit(d.name)).slice(0,5).forEach(d=>out.push({tag:"Deal", label:`${d.name} · ${fmtMoney(d.amount)}`, go:()=>goTo("deal-detail",{type:"deal",id:d.id})}));
    DB.quotes.filter(x=>hit(x.number)||hit(x.customerName)).slice(0,5).forEach(x=>out.push({tag:"Quote", label:`${x.number} · ${fmtMoney(Math.round(quoteTotals(x).total))}`, go:()=>goTo("quote-detail",{type:"quote",id:x.id})}));
  }
  palResults = out; palIndex = 0;
  const list = document.getElementById("paletteList");
  list.innerHTML = out.length ? out.map((r,i)=>`<div class="pal-item ${i===0?"sel":""}" data-i="${i}"><span class="tag">${r.tag}</span><span>${esc(r.label)}</span></div>`).join("")
    : `<div class="pal-item"><span>No matches</span></div>`;
  list.querySelectorAll(".pal-item[data-i]").forEach(el=>{
    el.onclick = ()=>{ closePalette(); palResults[Number(el.dataset.i)].go(); };
  });
}
function movePalette(delta){
  if(!palResults.length) return;
  palIndex = (palIndex + delta + palResults.length) % palResults.length;
  const items = document.querySelectorAll("#paletteList .pal-item[data-i]");
  items.forEach((el,i)=> el.classList.toggle("sel", i===palIndex));
  const sel = items[palIndex];
  if(sel) sel.scrollIntoView({block:"nearest"});
}
document.addEventListener("keydown", (e)=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="k"){
    if(!DB) return;
    e.preventDefault();
    document.getElementById("paletteBack").classList.contains("open") ? closePalette() : openPalette();
    return;
  }
  const open = document.getElementById("paletteBack").classList.contains("open");
  if(!open){
    if(e.key === "Escape") closeModal();
    return;
  }
  if(e.key === "Escape"){ closePalette(); }
  else if(e.key === "ArrowDown"){ e.preventDefault(); movePalette(1); }
  else if(e.key === "ArrowUp"){ e.preventDefault(); movePalette(-1); }
  else if(e.key === "Enter"){
    const r = palResults[palIndex];
    if(r){ closePalette(); r.go(); }
  }
});
document.addEventListener("DOMContentLoaded", ()=>{
  const input = document.getElementById("paletteInput");
  if(input) input.addEventListener("input", ()=> buildPalette(input.value));
  const back = document.getElementById("paletteBack");
  if(back) back.addEventListener("click", (e)=>{ if(e.target === back) closePalette(); });
  const gs = document.getElementById("globalSearch");
  if(gs){
    gs.placeholder = "Search or press Ctrl + K…";
    gs.addEventListener("focus", ()=>{ gs.blur(); openPalette(); });
  }
});

/* ---------- Quick add (extended) ---------- */
function openQuickAdd(){
  const items = [
    {type:"leads", html:`<button class="btn" onclick="closeModal();openLeadForm()">＋ Lead</button>`},
    {type:"accounts", html:`<button class="btn" onclick="closeModal();openAccountForm()">＋ Account</button>`},
    {type:"contacts", html:`<button class="btn" onclick="closeModal();openContactForm()">＋ Contact</button>`},
    {type:"deals", html:`<button class="btn" onclick="closeModal();openDealForm()">＋ Deal</button>`},
    {type:"products", html:`<button class="btn" onclick="closeModal();openProductForm()">＋ Product</button>`},
    {type:"quotes", html:`<button class="btn btn-gold" onclick="closeModal();openQuoteForm()">＋ Quotation</button>`},
    {type:"activities", html:`<button class="btn" onclick="closeModal();openActivityForm('Task')">＋ Task</button>`}
  ].filter(i=>canManage(i.type)).map(i=>i.html).join("");
  openModal("Quick add", `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${items || `<div class="empty">Your role doesn't have anything to add here.</div>`}
    </div>`, ()=>true, "Close");
}

/* =========================================================
   USERS & ROLES
   Roles: Administrator, Sales Manager, Salesperson, Marketing, Support, Viewer.
   ========================================================= */
const ROLES = ["Administrator","Sales Manager","Salesperson","Marketing","Support","Viewer"];

// Which record types each role can create/edit/delete.
const ROLE_MANAGE = {
  "Administrator": ["leads","accounts","contacts","deals","products","quotes","activities","settings","users"],
  "Sales Manager": ["leads","accounts","contacts","deals","products","quotes","activities","settings"],
  "Salesperson":   ["leads","accounts","contacts","deals","products","quotes","activities"],
  "Marketing":     ["leads","activities"],
  "Support":       ["accounts","contacts","activities"],
  "Viewer":        []
};
// Which nav destinations each role can open. Missing role or "null" list = everything.
const ROLE_NAV = {
  "Sales Manager": ["dashboard","leads","lead-sources","lead-scoring","accounts","contacts","deals","pipeline","forecast","products","quotes","targets","tasks","calls","meetings","calendar","reports","analytics","settings"],
  "Salesperson":   ["dashboard","leads","lead-sources","lead-scoring","accounts","contacts","deals","pipeline","forecast","products","quotes","tasks","calls","meetings","calendar"],
  "Marketing":     ["dashboard","leads","lead-sources","lead-scoring","reports","analytics"],
  "Support":       ["dashboard","accounts","contacts","tasks","calls","meetings","calendar"]
};
const NAV_DETAIL_BASE = {"lead-detail":"leads","account-detail":"accounts","deal-detail":"deals","quote-detail":"quotes"};

function currentRole(){ return (CURRENT_USER && CURRENT_USER.role) || "Administrator"; }
function isAdmin(){ return currentRole() === "Administrator"; }
function canManage(type){
  const list = ROLE_MANAGE[currentRole()];
  return !!(list && list.includes(type));
}
function navAllowed(viewId){
  if(viewId === "users-roles") return isAdmin();
  const base = NAV_DETAIL_BASE[viewId] || viewId;
  const list = ROLE_NAV[currentRole()];
  if(!list) return true; // Administrator & Viewer see every page
  return list.includes(base);
}
function scopeOwn(list){
  if(currentRole() === "Salesperson" && CURRENT_USER) return list.filter(r=>r.owner===CURRENT_USER.name);
  return list;
}

/* ---------- Nav + routing overrides (role-aware) ---------- */
(function extendNavRoles(){
  const settingsGroup = NAV.find(s=>s.group==="Settings");
  if(settingsGroup && !settingsGroup.items.some(i=>i.id==="users-roles")){
    settingsGroup.items.push({id:"users-roles", label:"Users & Roles"});
  }
})();

function renderNav(){
  const el = document.getElementById("navlist");
  el.innerHTML = "";
  NAV.forEach(sec=>{
    const visible = sec.items.filter(it=>navAllowed(it.id));
    if(!visible.length) return;
    const g = document.createElement("div");
    g.className = "navgroup";
    if(sec.group){
      const lab = document.createElement("div");
      lab.className = "navgroup-label";
      lab.textContent = sec.group.toUpperCase();
      g.appendChild(lab);
    }
    visible.forEach(it=>{
      const d = document.createElement("div");
      d.className = "navitem" + (currentView===it.id ? " active":"");
      d.innerHTML = `<span class="dot"></span>${it.label}`;
      d.onclick = ()=>{ goTo(it.id); if(window.innerWidth<=840) document.getElementById("sidebar").classList.remove("open"); };
      g.appendChild(d);
    });
    el.appendChild(g);
  });
  const qa = document.getElementById("quickAddBtn");
  if(qa) qa.style.display = currentRole()==="Viewer" ? "none" : "";
}

function goTo(viewId, detail){
  if(!navAllowed(viewId)){
    toast("Your role doesn't have access to that page.");
    viewId = "dashboard"; detail = null;
  }
  currentView = viewId;
  currentDetail = detail || null;
  renderNav();
  renderView();
  document.getElementById("content").scrollTop = 0;
  window.scrollTo(0,0);
}

function renderView(){
  const c = document.getElementById("content");
  const map = {
    dashboard: renderDashboard,
    leads: renderLeads,
    "lead-sources": renderLeadSources,
    "lead-scoring": renderLeadScoring,
    accounts: renderAccounts,
    "account-detail": renderAccountDetail,
    contacts: renderContacts,
    deals: renderDealsList,
    "deal-detail": renderDealDetail,
    pipeline: renderPipeline,
    forecast: renderForecast,
    products: renderProducts,
    quotes: renderQuotes,
    "quote-detail": renderQuoteDetail,
    targets: renderTargets,
    tasks: ()=>renderActivities("Task"),
    calls: ()=>renderActivities("Call"),
    meetings: ()=>renderActivities("Meeting"),
    calendar: renderCalendar,
    reports: renderReports,
    analytics: renderAnalytics,
    settings: renderSettings,
    "lead-detail": renderLeadDetail,
    "users-roles": renderUsersRoles
  };
  const fn = map[currentView] || renderDashboard;
  c.innerHTML = "";
  fn(c);
}

function companyUsers(){
  return getUsers().filter(u=>u.companyId===CURRENT_USER.companyId);
}
function renderUsersRoles(c){
  if(!isAdmin()){ c.innerHTML = `<div class="empty">You don't have access to this page.</div>`; return; }
  const users = companyUsers();
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Users &amp; Roles</h1><div class="sub">${users.length} teammate${users.length===1?"":"s"} on ${esc(CURRENT_USER.company)}.</div></div>
      <div class="actions"><button class="btn btn-primary" onclick="openUserForm()">+ Add teammate</button></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th></th></tr></thead>
      <tbody>
      ${users.map(u=>{
        const role = u.role || "Administrator";
        const isSelf = u.email === CURRENT_USER.email;
        return `<tr>
          <td>${esc(u.name)}${isSelf?' <span class="pill status-Converted">You</span>':''}</td>
          <td>${esc(u.email)}</td>
          <td><select onchange="changeUserRole('${esc(u.email)}',this.value)">${ROLES.map(r=>`<option ${r===role?"selected":""}>${r}</option>`).join("")}</select></td>
          <td onclick="event.stopPropagation()">${isSelf?'':`<button class="btn btn-sm btn-danger" onclick="removeUser('${esc(u.email)}')">Remove</button>`}</td>
        </tr>`;
      }).join("")}
      </tbody>
    </table></div>
    <div class="panel">
      <h3>What each role can do</h3>
      <div class="settings-card"><div><div class="t">Administrator</div><div class="d">Full access, including data, backups and Users &amp; Roles.</div></div></div>
      <div class="settings-card"><div><div class="t">Sales Manager</div><div class="d">Full sales access across the whole team, plus Settings — cannot manage users.</div></div></div>
      <div class="settings-card"><div><div class="t">Salesperson</div><div class="d">Sales tools scoped to their own leads, accounts, contacts, deals, quotes and activities.</div></div></div>
      <div class="settings-card"><div><div class="t">Marketing</div><div class="d">Leads, lead sources and lead scoring, plus Reports and Analytics.</div></div></div>
      <div class="settings-card"><div><div class="t">Support</div><div class="d">Accounts, contacts and activities — no leads, deals or quotes.</div></div></div>
      <div class="settings-card"><div><div class="t">Viewer</div><div class="d">Read-only access across the app — cannot create, edit or delete anything.</div></div></div>
    </div>
  `;
}
function openUserForm(){
  const body = `<div class="formgrid">
    <div class="field full"><label>Full name</label><input id="f_uname"></div>
    <div class="field full"><label>Email address</label><input id="f_uemail" type="email"></div>
    <div class="field full"><label>Temporary password</label><input id="f_upass" type="password" placeholder="At least 6 characters"></div>
    <div class="field full"><label>Role</label><select id="f_urole">${ROLES.map(r=>`<option ${r==="Salesperson"?"selected":""}>${r}</option>`).join("")}</select></div>
  </div>`;
  openModal("Add teammate", body, ()=>{
    const name = val('f_uname').trim();
    const email = val('f_uemail').trim().toLowerCase();
    const password = val('f_upass');
    const role = val('f_urole');
    if(!name || !email || !password){ toast("Fill in every field."); return false; }
    if(password.length < 6){ toast("Password must be at least 6 characters."); return false; }
    const users = getUsers();
    if(users.some(u=>u.email===email)){ toast("That email is already in use."); return false; }
    users.push({companyId: CURRENT_USER.companyId, company: CURRENT_USER.company, name, email, password, role});
    saveUsers(users);
    toast(`${name} added as ${role}.`);
    goTo("users-roles");
    return true;
  }, "Add");
}
function changeUserRole(email, role){
  const users = getUsers();
  const u = users.find(x=>x.email===email && x.companyId===CURRENT_USER.companyId);
  if(!u) return;
  const isSelf = email === CURRENT_USER.email;
  const adminCount = users.filter(x=>x.companyId===CURRENT_USER.companyId && (x.role||"Administrator")==="Administrator").length;
  if(isSelf && (u.role||"Administrator")==="Administrator" && role!=="Administrator" && adminCount<=1){
    toast("Assign another Administrator before changing your own role.");
    renderView();
    return;
  }
  u.role = role;
  saveUsers(users);
  if(isSelf) CURRENT_USER.role = role;
  toast(`${u.name}'s role is now ${role}.`);
  renderView();
}
function removeUser(email){
  if(email === CURRENT_USER.email){ toast("You can't remove yourself."); return; }
  const users = getUsers();
  const u = users.find(x=>x.email===email && x.companyId===CURRENT_USER.companyId);
  if(!u) return;
  if(!confirm(`Remove ${u.name} from ${CURRENT_USER.company}?`)) return;
  saveUsers(users.filter(x=>!(x.email===email && x.companyId===CURRENT_USER.companyId)));
  toast(`${u.name} removed.`);
  renderView();
}
