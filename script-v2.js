/* =========================================================
   ACACIA BOOKS CRM — v2 upgrade layer
   Adds: Products, Quotations (with line items + print),
   Sales targets, CSV import/export, JSON backup/restore,
   command palette (Ctrl/Cmd+K).
   Functions here intentionally override earlier definitions.
   ========================================================= */

const V2_COLLECTIONS = ["accounts","contacts","leads","deals","activities","timeline","notifications","products","quotes","trash","notes"];

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
  const key = dataKeyFor(companyId);
  let raw = null, db = null;
  try{ raw = localStorage.getItem(key); }catch(e){}
  if(raw){
    try{ db = JSON.parse(raw); }
    catch(e){
      try{ localStorage.setItem(key+"_corrupt_"+Date.now(), raw); }catch(_){}
      setTimeout(()=>{ try{ toast("Your saved data could not be read. A copy was kept — do not add new records until it is recovered."); }catch(_){} }, 500);
      SAVE_BLOCKED = true; // never overwrite the original with a blank dataset
      return migrateDB(seedData());
    }
  }
  return migrateDB(db || seedData());
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
      <td>${esc(p.unit||"unit")}</td>
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
        <button class="btn" onclick="printQuote('${q.id}')">Print / PDF</button>
        ${canManage('quotes') ? `<button class="btn btn-danger" onclick="deleteRecord('quote','${q.id}')">Delete</button>` : ``}
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
  if(!canManage('quotes')){ toast("You do not have permission to change quotations."); return; }
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
  q.items.push({desc:p.name + (p.sku?` (${esc(p.sku)})`:""), qty:1, price:Number(p.price||0), discount:0, productId:p.id});
  save(); renderView();
}
function updateQuoteItem(id, idx, field, value){
  if(!canManage('quotes')){ toast("You do not have permission to change quotations."); return; }
  const q = findQuote(id); if(!q || !q.items[idx]) return;
  if(q.status==="Accepted"){ return; }
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
  if(!canManage('quotes')){ toast("You do not have permission to change quotations."); return; }
  const q = findQuote(id); if(!q) return;
  q.items.splice(idx,1); save(); renderView();
}
function saveQuoteText(id){
  if(!canManage('quotes')){ toast("You do not have permission to change quotations."); return; }
  const q = findQuote(id); if(!q) return;
  const n = document.getElementById("q_notes"), t = document.getElementById("q_terms");
  if(n) q.notes = n.value;
  if(t) q.terms = t.value;
  save();
}
function editQuoteMeta(id){
  if(!canManage('quotes')){ toast("You do not have permission to change quotations."); return; }
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
  if(!canManage('quotes')){ toast("You do not have permission to change quotations."); renderView(); return; }
  const q = findQuote(id); if(!q) return;
  if(status==="Accepted" && q.validUntil && q.validUntil < todayISO()){ toast("This quotation has expired. Extend the valid-until date before accepting."); return; }
  q.status = status;
  addTimeline(q.id, "quote", `Quotation ${q.number} marked ${status}.`);
  notify(`Quotation ${q.number} marked ${status}.`);
  save(); renderView(); toast("Status: "+status);
  if(status==="Accepted" && !q.deal) quoteToDeal(id, true);
  else if(status==="Accepted" && q.deal){ const dl=findDeal(q.deal); if(dl){ dl.amount=Math.round(quoteTotals(q).total); applyStageChange(dl,"Closed Won"); save(); renderView(); } }
}
function quoteToDeal(id, silent){
  if(!canManage('deals')){ toast("You do not have permission to create deals."); return; }
  const q = findQuote(id); if(!q) return;
  const t = quoteTotals(q);
  const d = {
    id: uid("dl"),
    name: (findAccount(q.account) ? findAccount(q.account).name : (q.customerName||"New")) + " — " + q.number,
    account: q.account, contact: q.contact,
    amount: Math.round(t.total), stage: q.status==="Accepted" ? "Closed Won" : "Proposal",
    probability: q.status==="Accepted" ? 100 : 50,
    stageChangedAt: todayISO(), closedAt: q.status==="Accepted" ? todayISO() : "",
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
  const wonThisMonth = DB.deals.filter(d=>d.stage==="Closed Won" && (d.closedAt||d.closing||"").slice(0,7)===month);
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
function esc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
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
  if(!canManage('leads') && !canManage('accounts') && !canManage('contacts') && !canManage('products')){ toast("You do not have permission to import data."); return; }
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
    DB.leads.filter(l=>hit(l.name)||hit(l.company)).slice(0,5).forEach(l=>out.push({tag:"Lead", label:`${esc(l.name)} · ${esc(l.company||"")}`, go:()=>goTo("lead-detail",{type:"lead",id:l.id})}));
    DB.accounts.filter(a=>hit(a.name)).slice(0,5).forEach(a=>out.push({tag:"Account", label:a.name, go:()=>goTo("account-detail",{type:"account",id:a.id})}));
    DB.contacts.filter(ct=>hit(ct.first+" "+ct.last)||hit(ct.email)).slice(0,5).forEach(ct=>out.push({tag:"Contact", label:`${esc(ct.first)} ${esc(ct.last)}`, go:()=>goTo("contact-detail",{type:"contact",id:ct.id})}));
    DB.deals.filter(d=>hit(d.name)).slice(0,5).forEach(d=>out.push({tag:"Deal", label:`${esc(d.name)} · ${fmtMoney(d.amount)}`, go:()=>goTo("deal-detail",{type:"deal",id:d.id})}));
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
const NAV_DETAIL_BASE = {"lead-detail":"leads","contact-detail":"contacts","account-detail":"accounts","deal-detail":"deals","quote-detail":"quotes"};

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
      d.innerHTML = `<span class="dot"></span>${esc(it.label)}`;
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
    "contact-detail": renderContactDetail,
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


/* =========================================================
   DELETE + RECYCLE BIN (audit H7)
   ========================================================= */
const TRASH_MAP = {lead:["leads","leads"], account:["accounts","accounts"], contact:["contacts","contacts"], deal:["deals","deals"], activity:["activities","activities"], quote:["quotes","quotes"]};
const TRASH_LIST_VIEW = {lead:"leads", account:"accounts", contact:"contacts", deal:"deals", activity:"tasks", quote:"quotes"};
function recordLabel(type, r){
  if(type==="contact") return ((r.first||"")+" "+(r.last||"")).trim() || "Contact";
  if(type==="quote") return r.number || "Quotation";
  if(type==="activity") return r.title || "Activity";
  return r.name || type;
}
function deleteRecord(type, id, quiet){
  const map = TRASH_MAP[type]; if(!map) return;
  if(!canManage(map[1])){ toast("You do not have permission to delete this."); return; }
  const list = DB[map[0]]; const idx = list.findIndex(x=>x.id===id); if(idx<0) return;
  const rec = list[idx];
  if(currentRole()==="Salesperson" && rec.owner && rec.owner!==CURRENT_USER.name){ toast("You can only delete records you own."); return; }
  const unlinked = {};
  let extra = "";
  if(type==="account"){
    unlinked.contacts = DB.contacts.filter(c=>c.account===id).map(c=>c.id);
    unlinked.deals = DB.deals.filter(d=>d.account===id).map(d=>d.id);
    unlinked.quotes = DB.quotes.filter(q=>q.account===id).map(q=>q.id);
    extra = `\n${unlinked.contacts.length} contact(s), ${unlinked.deals.length} deal(s) and ${unlinked.quotes.length} quotation(s) will be un-linked from it.`;
  }
  if(type==="deal"){
    unlinked.quotes = DB.quotes.filter(q=>q.deal===id).map(q=>q.id);
    unlinked.activities = DB.activities.filter(a=>a.related===id && a.relatedType==="deal").map(a=>a.id);
  }
  if(!quiet && !confirm(`Delete "${recordLabel(type,rec)}"? It moves to the Recycle Bin (Settings) where it can be restored.${extra}`)) return;
  if(type==="account"){
    DB.contacts.forEach(c=>{ if(c.account===id) c.account=""; });
    DB.deals.forEach(d=>{ if(d.account===id) d.account=""; });
    DB.quotes.forEach(q=>{ if(q.account===id) q.account=""; });
  }
  if(type==="deal"){ DB.quotes.forEach(q=>{ if(q.deal===id) q.deal=""; }); }
  list.splice(idx,1);
  DB.trash = DB.trash || [];
  DB.trash.unshift({tid:uid("tr"), type, record:rec, unlinked, label:recordLabel(type,rec), deletedAt:todayISO(), deletedBy:CURRENT_USER.name});
  if(DB.trash.length>200) DB.trash.length = 200;
  addTimeline(id, type, `${type[0].toUpperCase()+type.slice(1)} "${recordLabel(type,rec)}" deleted by ${CURRENT_USER.name}.`);
  save();
  if(quiet) return true;
  toast("Moved to Recycle Bin.");
  const back = TRASH_LIST_VIEW[type];
  if(typeof currentView!=="undefined" && /-detail$/.test(currentView)) goTo(back); else renderView();
}
function restoreRecord(tid){
  const t = (DB.trash||[]).find(x=>x.tid===tid); if(!t) return;
  const map = TRASH_MAP[t.type];
  if(!canManage(map[1])){ toast("You do not have permission to restore this."); return; }
  DB[map[0]].push(t.record);
  const u = t.unlinked || {};
  if(t.type==="account"){
    DB.contacts.forEach(c=>{ if((u.contacts||[]).includes(c.id)) c.account=t.record.id; });
    DB.deals.forEach(d=>{ if((u.deals||[]).includes(d.id)) d.account=t.record.id; });
    DB.quotes.forEach(q=>{ if((u.quotes||[]).includes(q.id)) q.account=t.record.id; });
  }
  if(t.type==="deal"){ DB.quotes.forEach(q=>{ if((u.quotes||[]).includes(q.id)) q.deal=t.record.id; }); }
  DB.trash = DB.trash.filter(x=>x.tid!==tid);
  save(); toast("Restored."); renderView();
}
function emptyRecycleBin(){
  if(!isAdmin()){ toast("Only an Administrator can empty the Recycle Bin."); return; }
  if(!(DB.trash||[]).length) return;
  if(!confirm("Permanently delete everything in the Recycle Bin? This cannot be undone.")) return;
  DB.trash = []; save(); renderView();
}

/* =========================================================
   COMPANY PROFILE + BRANDED QUOTE PRINT (audit H11, M11)
   ========================================================= */
function companyProfile(){ return Object.assign({name:(CURRENT_USER&&CURRENT_USER.company)||"", address:"", phone:"", email:"", kraPin:"", bank:"", mpesa:"", footer:""}, (DB.settings&&DB.settings.company)||{}); }
function openCompanyProfile(){
  if(!canManage('settings')){ toast("Only managers and administrators can edit the company profile."); return; }
  const p = companyProfile();
  const f = (id,label,val,full)=>`<div class="field ${full?'full':''}"><label>${label}</label><input id="cp_${id}" value="${esc(val)}"></div>`;
  openModal("Company profile", `<div class="formgrid">
    ${f("name","Company name",p.name,true)}${f("address","Address",p.address,true)}
    ${f("phone","Phone",p.phone)}${f("email","Email",p.email)}
    ${f("kraPin","KRA PIN",p.kraPin)}${f("mpesa","M-Pesa Paybill / Till",p.mpesa)}
    ${f("bank","Bank details (bank, account name, number)",p.bank,true)}
    ${f("footer","Footer line on quotations",p.footer,true)}
  </div>`, ()=>{
    DB.settings.company = {};
    ["name","address","phone","email","kraPin","bank","mpesa","footer"].forEach(k=>{ DB.settings.company[k] = val("cp_"+k).trim(); });
    save(); toast("Company profile saved."); renderView(); return true;
  });
}
function printQuote(id){
  const q = findQuote(id); if(!q) return;
  const p = companyProfile();
  const acc = findAccount(q.account), ct = findContact(q.contact);
  const t = quoteTotals(q);
  const money = n=>"KSh "+Number(n||0).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2});
  const rows = (q.items||[]).map((it,i)=>{
    const line = Number(it.qty||0)*Number(it.price||0)*(1-Number(it.discount||0)/100);
    return `<tr><td>${i+1}</td><td>${esc(it.desc)}</td><td class="r">${Number(it.qty||0)}</td><td class="r">${money(it.price)}</td><td class="r">${Number(it.discount||0)?Number(it.discount)+"%":"—"}</td><td class="r">${money(line)}</td></tr>`;
  }).join("") || `<tr><td colspan="6" style="text-align:center;color:#777;">No line items</td></tr>`;
  const cust = [acc?acc.name:(q.customerName||""), acc&&acc.address, ct&&((ct.first||"")+" "+(ct.last||"")).trim(), (ct&&ct.email)||(acc&&acc.email), (ct&&ct.phone)||(acc&&acc.phone)].filter(Boolean).map(x=>esc(x)).join("<br>");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(q.number)}</title><style>
    *{box-sizing:border-box} body{font-family:Cambria,Georgia,serif;color:#1c2b24;margin:0;padding:28px 36px;font-size:13px}
    .head{display:flex;justify-content:space-between;border-bottom:3px solid #1f4d3a;padding-bottom:12px;margin-bottom:18px}
    h1{margin:0;font-size:22px;color:#1f4d3a} .muted{color:#555;line-height:1.5}
    .qt{text-align:right} .qt h2{margin:0;font-size:20px;letter-spacing:2px;color:#1f4d3a}
    .cols{display:flex;gap:30px;margin-bottom:16px} .cols>div{flex:1} .lab{font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#777;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;margin:8px 0} th{background:#1f4d3a;color:#fff;text-align:left;padding:7px 8px;font-size:12px}
    td{padding:7px 8px;border-bottom:1px solid #ddd;vertical-align:top} .r{text-align:right;white-space:nowrap}
    .tot{width:290px;margin-left:auto} .tot td{border:0;padding:4px 8px} .tot .g td{border-top:2px solid #1f4d3a;font-weight:bold;font-size:15px}
    .box{border:1px solid #ddd;padding:10px 12px;margin-top:14px;white-space:pre-wrap;line-height:1.5}
    .sig{display:flex;gap:40px;margin-top:46px} .sig div{flex:1;border-top:1px solid #333;padding-top:6px;font-size:12px}
    .foot{margin-top:26px;text-align:center;color:#666;font-size:11px}
    @media print{body{padding:0}}
  </style></head><body>
    <div class="head"><div><h1>${esc(p.name)}</h1><div class="muted">${[p.address,p.phone,p.email].filter(Boolean).map(esc).join("<br>")}${p.kraPin?`<br>KRA PIN: ${esc(p.kraPin)}`:""}</div></div>
    <div class="qt"><h2>QUOTATION</h2><div class="muted">No: <b>${esc(q.number)}</b><br>Date: ${fmtDate(q.date)}<br>Valid until: ${fmtDate(q.validUntil)}</div></div></div>
    <div class="cols"><div><div class="lab">Prepared for</div>${cust||"—"}</div><div><div class="lab">Prepared by</div>${esc(q.owner||CURRENT_USER.name)}</div></div>
    <table><thead><tr><th>#</th><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Disc.</th><th class="r">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tot"><tr><td>Subtotal</td><td class="r">${money(t.sub)}</td></tr><tr><td>VAT (${Number(q.taxRate||0)}%)</td><td class="r">${money(t.tax)}</td></tr><tr class="g"><td>Total</td><td class="r">${money(t.total)}</td></tr></table>
    ${q.notes?`<div class="box"><div class="lab">Notes</div>${esc(q.notes)}</div>`:""}
    ${q.terms?`<div class="box"><div class="lab">Terms &amp; conditions</div>${esc(q.terms)}</div>`:""}
    ${(p.bank||p.mpesa)?`<div class="box"><div class="lab">Payment details</div>${p.bank?`Bank: ${esc(p.bank)}<br>`:""}${p.mpesa?`M-Pesa: ${esc(p.mpesa)}`:""}</div>`:""}
    <div class="sig"><div>Authorised signature &amp; date</div><div>Customer acceptance (name, signature, date)</div></div>
    <div class="foot">${esc(p.footer||"Thank you for your business.")}</div>
  </body></html>`;
  const w = window.open("", "_blank");
  if(!w){ toast("Allow pop-ups to print the quotation."); return; }
  w.document.open(); w.document.write(html); w.document.close();
  w.focus(); setTimeout(()=>{ try{ w.print(); }catch(e){} }, 400);
}

/* Settings: add Company profile + Recycle Bin panels without touching the base renderer */
(function(){
  const base = renderSettings;
  renderSettings = function(c){
    base(c);
    const trash = DB.trash || [];
    const el = document.createElement("div");
    el.className = "panel";
    el.innerHTML = `<h3>Company profile &amp; quotations</h3>
      <div class="settings-card"><div><div class="t">Letterhead details</div><div class="d">Address, KRA PIN, bank and M-Pesa details printed on every quotation.</div></div><button class="btn btn-sm btn-primary" onclick="openCompanyProfile()">Edit</button></div>
      <h3 style="margin-top:18px;">Recycle Bin <span class="count">(${trash.length})</span></h3>
      ${trash.length ? trash.slice(0,30).map(t=>`<div class="settings-card"><div><div class="t">${esc(t.label)}</div><div class="d">${esc(t.type)} · deleted ${fmtDate(t.deletedAt)} by ${esc(t.deletedBy)}</div></div><button class="btn btn-sm" onclick="restoreRecord('${t.tid}')">Restore</button></div>`).join("") + (isAdmin()?`<div style="margin-top:8px;"><button class="btn btn-sm btn-danger" onclick="emptyRecycleBin()">Empty Recycle Bin</button></div>`:"") : `<div class="empty">Nothing deleted.</div>`}`;
    c.appendChild(el);
  };
})();


/* =========================================================
   OWNER DROPDOWN + SALESPERSON SCOPING (audit M2, H1)
   ========================================================= */
function ownerSelect(id, current){
  const me = CURRENT_USER.name;
  let names = companyUsers().map(u=>u.name).filter(Boolean);
  if(!names.includes(me)) names.unshift(me);
  if(current && !names.includes(current)) names.push(current); // keep legacy typed owners selectable
  names = [...new Set(names)];
  const locked = currentRole()==="Salesperson";
  if(locked) names = [current && names.includes(current) ? current : me];
  return `<select id="${id}" ${locked?'disabled':''}>${names.map(nm=>`<option value="${esc(nm)}" ${nm===(current||me)?'selected':''}>${esc(nm)}</option>`).join("")}</select>`;
}
/* val() on a disabled select still returns its value, so locked owners are saved unchanged. */

function scopedDB(){
  if(currentRole()!=="Salesperson" || !CURRENT_USER) return DB;
  const me = CURRENT_USER.name;
  const mine = list => (list||[]).filter(r=>r.owner===me);
  const copy = Object.assign({}, DB);
  ["leads","accounts","contacts","deals","activities","quotes"].forEach(k=>{ copy[k] = mine(DB[k]); });
  return copy;
}
function withScope(fn){
  return function(){
    const real = DB;
    if(currentRole()!=="Salesperson") return fn.apply(this, arguments);
    SCOPED_RENDER = true; DB = scopedDB();
    try{ return fn.apply(this, arguments); }
    finally{ DB = real; SCOPED_RENDER = false; }
  };
}
renderDashboard = withScope(renderDashboard);
renderPipeline  = withScope(renderPipeline);
renderForecast  = withScope(renderForecast);
renderActivities= withScope(renderActivities);
renderCalendar  = withScope(renderCalendar);
renderReports   = withScope(renderReports);
renderAnalytics = withScope(renderAnalytics);
renderTargets   = withScope(renderTargets);
renderQuotes    = withScope(renderQuotes);
buildPalette    = withScope(buildPalette);


/* =========================================================
   ACTIVITIES, REMINDERS, NOTIFICATIONS (audit H8, H9)
   ========================================================= */
function isoAddDays(iso, n){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d+n);
  return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(dt.getDate()).padStart(2,"0");
}
function isoAddMonths(iso, n){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1+n, 1);
  const last = new Date(dt.getFullYear(), dt.getMonth()+1, 0).getDate();
  return dt.getFullYear()+"-"+String(dt.getMonth()+1).padStart(2,"0")+"-"+String(Math.min(d,last)).padStart(2,"0");
}
function relatedLabel(a){
  if(!a.related) return "";
  let r = null, t = a.relatedType;
  if(t==="lead") r = findLead(a.related);
  else if(t==="account") r = findAccount(a.related);
  else if(t==="deal") r = findDeal(a.related);
  else if(t==="contact"){ const c=findContact(a.related); return c ? ((c.first||"")+" "+(c.last||"")).trim() : ""; }
  return r ? r.name : "";
}
function activityMeta(a){
  const bits = [];
  const rl = relatedLabel(a); if(rl) bits.push("Re: "+rl);
  if(a.kind==="Call"){ if(a.direction) bits.push(a.direction); if(a.duration) bits.push(a.duration+" min"); if(a.outcome) bits.push(a.outcome); }
  if(a.kind==="Meeting"){ if(a.duration) bits.push(a.duration+" min"); if(a.location) bits.push("@ "+a.location); if(a.attendees) bits.push("With "+a.attendees); }
  if(a.kind==="Task" && a.priority && a.priority!=="Normal") bits.push(a.priority+" priority");
  if(a.remind && a.remind!=="none") bits.push("Reminder "+({"0":"on the day","1":"1 day before","2":"2 days before","7":"1 week before"}[a.remind]||""));
  if(a.repeat && a.repeat!=="none") bits.push("Repeats "+a.repeat.toLowerCase());
  if(a.notes) bits.push(a.notes.length>60 ? a.notes.slice(0,60)+"…" : a.notes);
  return bits.length ? `<div style="color:var(--ink-soft);font-size:11.5px;margin-top:2px;">${bits.map(esc).join(" · ")}</div>` : "";
}
function logActivityButtons(id){
  if(!canManage('activities')) return "";
  const t = findLead(id)?"lead" : findAccount(id)?"account" : findDeal(id)?"deal" : "";
  if(!t) return "";
  return ["Task","Call","Meeting"].map(k=>`<button class="btn btn-sm" style="margin-left:6px;" onclick="openActivityForm('${k}',{related:'${id}',relatedType:'${t}'})">+ ${k}</button>`).join("");
}
function openActivityForm(kind, opts){
  opts = opts || {};
  if(!canManage('activities')){ toast("You do not have permission to change activities."); return; }
  const a = opts.id ? DB.activities.find(x=>x.id===opts.id) : null;
  if(a) kind = a.kind;
  const g = (k,d)=> a ? (a[k]===undefined?d:a[k]) : d;
  const relVal = a ? (a.related? a.relatedType+":"+a.related : "") : (opts.related ? opts.relatedType+":"+opts.related : "");
  const optGroup = (label, type, list, nameFn)=> list.length ? `<optgroup label="${label}">${list.map(r=>`<option value="${type}:${r.id}" ${relVal===type+":"+r.id?"selected":""}>${esc(nameFn(r))}</option>`).join("")}</optgroup>` : "";
  const sel = (id,arr,cur)=>`<select id="${id}">${arr.map(([val,label])=>`<option value="${val}" ${String(cur)===String(val)?"selected":""}>${label}</option>`).join("")}</select>`;
  const related = `<div class="field full"><label>Related to</label><select id="f_related"><option value="">— Not linked —</option>
    ${optGroup("Leads","lead",scopeOwn(DB.leads),r=>r.name+(r.company?" — "+r.company:""))}
    ${optGroup("Accounts","account",scopeOwn(DB.accounts),r=>r.name)}
    ${optGroup("Deals","deal",scopeOwn(DB.deals),r=>r.name)}
    ${optGroup("Contacts","contact",scopeOwn(DB.contacts),r=>((r.first||"")+" "+(r.last||"")).trim())}
  </select></div>`;
  let specific = "";
  if(kind==="Call") specific = `
    <div class="field"><label>Direction</label>${sel("f_direction",[["Outbound","Outbound"],["Inbound","Inbound"]],g("direction","Outbound"))}</div>
    <div class="field"><label>Duration (minutes)</label><input id="f_duration" type="number" min="0" value="${esc(g("duration",""))}"></div>
    <div class="field full"><label>Outcome</label>${sel("f_outcome",[["","— Not yet —"],["Connected","Connected"],["No answer","No answer"],["Left voicemail","Left voicemail"],["Wrong number","Wrong number"],["Follow-up needed","Follow-up needed"]],g("outcome",""))}</div>`;
  else if(kind==="Meeting") specific = `
    <div class="field"><label>Duration (minutes)</label><input id="f_duration" type="number" min="0" value="${esc(g("duration",60))}"></div>
    <div class="field"><label>Location / link</label><input id="f_location" value="${esc(g("location",""))}"></div>
    <div class="field full"><label>Attendees</label><input id="f_attendees" value="${esc(g("attendees",""))}" placeholder="Names or emails, comma separated"></div>`;
  else specific = `<div class="field"><label>Priority</label>${sel("f_priority",[["Low","Low"],["Normal","Normal"],["High","High"]],g("priority","Normal"))}</div>`;
  const body = `<div class="formgrid">
    <div class="field full"><label>Title</label><input id="f_title" value="${esc(g("title",""))}"></div>
    ${related}
    <div class="field"><label>Due date</label><input id="f_due" type="date" value="${esc(g("due",todayISO()))}"></div>
    <div class="field"><label>Time (optional)</label><input id="f_time" type="time" value="${esc(g("time",""))}"></div>
    ${specific}
    <div class="field"><label>Reminder</label>${sel("f_remind",[["none","None"],["0","On the day"],["1","1 day before"],["2","2 days before"],["7","1 week before"]],g("remind","none"))}</div>
    <div class="field"><label>Repeat</label>${sel("f_repeat",[["none","Does not repeat"],["Daily","Daily"],["Weekly","Weekly"],["Monthly","Monthly"]],g("repeat","none"))}</div>
    <div class="field"><label>Owner</label>${ownerSelect("f_owner", g("owner",CURRENT_USER.name))}</div>
    <div class="field full"><label>Notes</label><textarea id="f_notes">${esc(g("notes",""))}</textarea></div>
  </div>`;
  openModal(`${a?"Edit":"New"} ${kind}`, body, ()=>{
    const title = val('f_title');
    if(!title){ toast("Please enter a title."); return false; }
    const due = val('f_due'); if(!due){ toast("Please choose a due date."); return false; }
    const rel = val('f_related').split(":");
    const data = {kind, title, due, time:val('f_time'), owner:val('f_owner'), remind:val('f_remind'), repeat:val('f_repeat'), notes:val('f_notes'),
      related: rel[1]||"", relatedType: rel[0]||""};
    if(kind==="Call"){ data.direction=val('f_direction'); data.duration=val('f_duration'); data.outcome=val('f_outcome'); }
    else if(kind==="Meeting"){ data.duration=val('f_duration'); data.location=val('f_location'); data.attendees=val('f_attendees'); }
    else { data.priority=val('f_priority'); }
    if(a){ Object.assign(a,data); notify(`${kind} updated: ${title}`, data.owner); }
    else { data.id=uid("act"); data.done=false; data.created=todayISO(); DB.activities.push(data); notify(`New ${kind.toLowerCase()} created: ${title}`, data.owner); }
    save(); renderView();
    return true;
  });
}
/* recurring: completing one occurrence schedules the next */
(function(){
  const base = toggleActivity;
  toggleActivity = function(id){
    const a0 = DB.activities.find(x=>x.id===id);
    const wasDone = a0 ? a0.done : true;
    base(id);
    const a = DB.activities.find(x=>x.id===id);
    if(a && !wasDone && a.done && a.repeat && a.repeat!=="none"){
      const next = a.repeat==="Daily" ? isoAddDays(a.due,1) : a.repeat==="Weekly" ? isoAddDays(a.due,7) : isoAddMonths(a.due,1);
      const copy = Object.assign({}, a, {id:uid("act"), due:next<todayISO()?todayISO():next, done:false, outcome:""});
      DB.activities.push(copy); save(); renderView();
      toast("Next "+a.repeat.toLowerCase()+" occurrence scheduled for "+fmtDate(copy.due)+".");
    }
  };
})();

/* ---------- per-user notifications with real timestamps ---------- */
function notify(text, user){
  DB.notifications = DB.notifications || [];
  DB.notifications.unshift({id:uid("nt"), text, ts:Date.now(), user:user||"", readBy:[]});
  if(DB.notifications.length>100) DB.notifications.length = 100;
  save(); renderNotifBadge();
}
function myNotifs(){
  const me = CURRENT_USER ? CURRENT_USER.name : "";
  return (DB.notifications||[]).filter(n=>!n.user || n.user===me);
}
function notifUnread(n){
  const me = CURRENT_USER ? CURRENT_USER.name : "";
  return !n.read && !(n.readBy||[]).includes(me);
}
function timeAgo(ts){
  if(!ts) return "Earlier";
  const m = Math.floor((Date.now()-ts)/60000);
  if(m<1) return "Just now";
  if(m<60) return m+" min ago";
  const h = Math.floor(m/60); if(h<24) return h+" hour"+(h===1?"":"s")+" ago";
  const d = Math.floor(h/24); if(d<7) return d+" day"+(d===1?"":"s")+" ago";
  return new Date(ts).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
}
function renderNotifBadge(){
  const unread = myNotifs().filter(notifUnread).length;
  const badge = document.getElementById("notifCount"); if(!badge) return;
  if(unread>0){ badge.style.display="flex"; badge.textContent = unread>9?"9+":unread; }
  else badge.style.display="none";
}
function renderNotifPanel(){
  const panel = document.getElementById("notifPanel");
  const list = myNotifs().slice(0,15);
  panel.innerHTML = list.length ? list.map(n=>`<div class="notif-item" style="${notifUnread(n)?'font-weight:600;':''}">${esc(n.text)}<div class="t">${esc(timeAgo(n.ts))}</div></div>`).join("") : `<div class="notif-item">No notifications yet.</div>`;
}
function markNotifsRead(){
  const me = CURRENT_USER.name;
  myNotifs().forEach(n=>{ n.readBy = n.readBy||[]; if(!n.readBy.includes(me)) n.readBy.push(me); });
  save(); renderNotifBadge();
}

/* ---------- reminder engine ---------- */
function runReminders(){
  if(!DB || !CURRENT_USER) return;
  DB.alertsSeen = DB.alertsSeen || {};
  const today = todayISO(), seen = DB.alertsSeen;
  let added = 0;
  const once = (key, text, user)=>{ if(seen[key]) return; seen[key] = today; notify(text, user); added++; };
  (DB.activities||[]).forEach(a=>{
    if(a.done || !a.due) return;
    const label = `${a.kind}: ${a.title}`;
    if(a.remind && a.remind!=="none"){
      const rd = isoAddDays(a.due, -Number(a.remind));
      if(today>=rd && today<a.due) once(`ar:${a.id}:${a.due}`, `Reminder — ${label} is due ${fmtDate(a.due)}${a.time?" at "+a.time:""}.`, a.owner);
    }
    if(a.due===today) once(`ad:${a.id}:${a.due}`, `Due today — ${label}${a.time?" at "+a.time:""}.`, a.owner);
    else if(a.due<today) once(`ao:${a.id}:${a.due}`, `Overdue — ${label} was due ${fmtDate(a.due)}.`, a.owner);
  });
  (DB.leads||[]).forEach(l=>{
    if(!l.nextFollowup || ["Converted","Lost","Unqualified"].includes(l.status)) return;
    if(l.nextFollowup<=today) once(`lf:${l.id}:${l.nextFollowup}`, `Follow up with lead ${l.name} (planned ${fmtDate(l.nextFollowup)}).`, l.owner);
  });
  (DB.deals||[]).forEach(d=>{
    if((d.stage||"").startsWith("Closed")) return;
    if(d.closing){
      if(d.closing<today) once(`dp:${d.id}:${d.closing}`, `Deal "${d.name}" is past its expected close date (${fmtDate(d.closing)}).`, d.owner);
      else if(d.closing<=isoAddDays(today,3)) once(`ds:${d.id}:${d.closing}`, `Deal "${d.name}" is due to close on ${fmtDate(d.closing)}.`, d.owner);
    }
    const since = d.stageChangedAt || d.created;
    if(since && since < isoAddDays(today,-30)) once(`dst:${d.id}:${since}`, `Deal "${d.name}" has not moved stage since ${fmtDate(since)}.`, d.owner);
  });
  (DB.quotes||[]).forEach(q=>{
    if(!["Draft","Sent"].includes(q.status) || !q.validUntil) return;
    if(q.validUntil<today) once(`qe:${q.id}:${q.validUntil}`, `Quotation ${q.number} has expired (${fmtDate(q.validUntil)}).`, q.owner);
    else if(q.validUntil<=isoAddDays(today,3)) once(`qx:${q.id}:${q.validUntil}`, `Quotation ${q.number} expires on ${fmtDate(q.validUntil)}.`, q.owner);
  });
  // prune old dedupe keys
  const cutoff = isoAddDays(today,-60);
  Object.keys(seen).forEach(k=>{ if(seen[k] < cutoff) delete seen[k]; });
  if(!added) save();
  renderNotifBadge();
}
(function(){
  const base = initApp;
  let timer = null;
  initApp = function(){
    base();
    runReminders();
    if(timer) clearInterval(timer);
    timer = setInterval(()=>{ try{ runReminders(); }catch(e){} }, 10*60*1000);
  };
})();


/* =========================================================
   ACCESSIBILITY + TOUCH (audit H12)
   ========================================================= */
function a11yify(root){
  root = root || document;
  root.querySelectorAll("[onclick],.navitem,.auth-tab,.auth-back,.rowlink").forEach(el=>{
    if(el.matches("button,input,select,textarea,a[href],summary") || el.id==="modalBackdrop") return;
    const oc = el.getAttribute("onclick")||"";
    if(oc && oc.length<40 && oc.includes("stopPropagation")) return;
    if(!el.hasAttribute("tabindex")) el.setAttribute("tabindex","0");
    if(!el.hasAttribute("role")) el.setAttribute("role","button");
  });
  root.querySelectorAll(".navitem.active").forEach(el=>el.setAttribute("aria-current","page"));
  root.querySelectorAll(".field, .auth-field").forEach(f=>{
    const lab = f.querySelector("label"), ctl = f.querySelector("input,select,textarea");
    if(lab && ctl && ctl.id && !lab.htmlFor) lab.htmlFor = ctl.id;
  });
  const nav = document.getElementById("navlist"); if(nav) nav.setAttribute("aria-label","Main navigation");
}
document.addEventListener("keydown", e=>{
  const el = e.target;
  if((e.key==="Enter"||e.key===" ") && el && el.getAttribute && el.getAttribute("role")==="button" && !el.matches("button,input,select,textarea,a[href]")){
    e.preventDefault(); el.click();
  }
});
(function(){
  const baseView = renderView;
  renderView = function(){ baseView.apply(this, arguments); a11yify(document.getElementById("content")); a11yify(document.getElementById("navlist")); };
  const baseNav = renderNav;
  renderNav = function(){ baseNav.apply(this, arguments); a11yify(document.getElementById("navlist")); };
})();

/* login / register: Enter submits */
document.addEventListener("keydown", e=>{
  if(e.key!=="Enter" || !e.target || e.target.tagName!=="INPUT") return;
  const id = e.target.id||"";
  if(id==="loginEmail"||id==="loginPassword"){ e.preventDefault(); handleLogin(); }
  else if(["regCompany","regName","regEmail","regPassword"].includes(id)){ e.preventDefault(); handleRegister(); }
});
document.addEventListener("DOMContentLoaded", ()=>{ a11yify(document.getElementById("authScreen")); });

/* modals: dialog role, focus management, Escape, focus trap */
let modalReturnFocus = null;
(function(){
  const baseOpen = openModal, baseClose = closeModal;
  openModal = function(title, bodyHtml, onSave, saveLabel){
    modalReturnFocus = document.activeElement;
    baseOpen(title, bodyHtml, onSave, saveLabel);
    const box = document.getElementById("modalBox");
    box.setAttribute("role","dialog"); box.setAttribute("aria-modal","true");
    const h = box.querySelector(".modal-head h3"); if(h){ h.id = "modalTitle"; box.setAttribute("aria-labelledby","modalTitle"); }
    const x = box.querySelector(".closebtn"); if(x) x.setAttribute("aria-label","Close dialog");
    a11yify(box);
    const first = box.querySelector(".modal-body input:not([disabled]),.modal-body select:not([disabled]),.modal-body textarea");
    (first || x || box).focus && (first || x || box).focus();
  };
  closeModal = function(){
    baseClose();
    if(modalReturnFocus && document.contains(modalReturnFocus) && modalReturnFocus.focus){ try{ modalReturnFocus.focus(); }catch(e){} }
    modalReturnFocus = null;
  };
})();
document.addEventListener("keydown", e=>{
  const bd = document.getElementById("modalBackdrop");
  if(!bd || !bd.classList.contains("open")) return;
  if(e.key==="Escape"){ e.preventDefault(); closeModal(); return; }
  if(e.key==="Tab"){
    const f = [...document.getElementById("modalBox").querySelectorAll('button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(x=>!x.disabled && x.offsetParent!==null || x===document.activeElement);
    if(!f.length) return;
    const first = f[0], last = f[f.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
  }
});


/* =========================================================
   VALIDATION + IMPORT WIZARD (audit M7, M13)
   ========================================================= */
IMPORT_TEMPLATES.deals = ["name","account","amount","stage","closing","probability","owner","source","nextStep"];
const IMPORT_PERM = {leads:"leads", accounts:"accounts", contacts:"contacts", products:"products", deals:"deals"};
const IMPORT_LEAD_STATUSES = ["New","Contacted","Attempted Contact","Qualified","Unqualified","Nurturing","Lost"];
const IMPORT_MAX_ROWS = 5000, IMPORT_MAX_BYTES = 2*1024*1024;
const IMPORT_SYNONYMS = {
  name:["full name","fullname","lead name","account name","company name","deal name","product name","title of deal"],
  first:["first name","firstname","given name"], last:["last name","lastname","surname","family name"],
  email:["e-mail","email address","mail"], phone:["mobile","telephone","tel","phone number","mobile number","cell"],
  company:["company name","organisation","organization","business"], account:["account name","company","customer","organisation"],
  closing:["close date","closing date","expected close","expected close date"], amount:["value","deal value","total"],
  nextStep:["next step","next_step"], source:["lead source"], sku:["code","product code"], price:["unit price","selling price"],
  probability:["prob","win probability"], owner:["assigned to","sales rep","rep"]
};
function normKey(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]/g,""); }
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
/* Kenyan-friendly phone normalisation. Returns {ok, value}. Empty is ok. */
function normalizePhone(p){
  p = String(p||"").trim();
  if(!p) return {ok:true, value:""};
  let d = p.replace(/[\s\-().]/g,"");
  const plus = d.startsWith("+"); d = d.replace(/^\+/,"");
  if(!/^\d+$/.test(d)) return {ok:false, value:p};
  if(!plus){
    if(/^0[17]\d{8}$/.test(d)) d = "254"+d.slice(1);
    else if(/^[17]\d{8}$/.test(d)) d = "254"+d;
    else if(d.startsWith("00")) d = d.slice(2);
  }
  if(d.length<9 || d.length>15) return {ok:false, value:p};
  return {ok:true, value:"+"+d};
}
function importKey(type, r){
  const n = x=>String(x||"").trim().toLowerCase();
  if(type==="leads") return r.email ? "e:"+n(r.email) : "n:"+n(r.name)+"|"+n(r.company);
  if(type==="accounts") return "n:"+n(r.name);
  if(type==="contacts") return r.email ? "e:"+n(r.email) : "n:"+n(r.first)+"|"+n(r.last)+"|"+n(r.accountName||r.account);
  if(type==="products") return r.sku ? "s:"+n(r.sku) : "n:"+n(r.name);
  if(type==="deals") return "n:"+n(r.name)+"|"+n(r.accountName||r.account);
  return "";
}
function existingKey(type, rec){
  if(type==="contacts"){ const a=findAccount(rec.account); return importKey(type,{email:rec.email,first:rec.first,last:rec.last,accountName:a?a.name:""}); }
  if(type==="deals"){ const a=findAccount(rec.account); return importKey(type,{name:rec.name,accountName:a?a.name:""}); }
  return importKey(type, rec);
}
function validateImportRow(type, raw){
  const errors = [], warnings = [];
  const r = Object.assign({}, raw);
  const users = companyUsers().map(u=>u.name);
  const me = CURRENT_USER.name;
  // owner
  if(currentRole()==="Salesperson") r.owner = me;
  else if(r.owner && !users.includes(r.owner)){ warnings.push(`Owner "${r.owner}" is not a user — assigned to you`); r.owner = me; }
  else if(!r.owner) r.owner = me;
  // email / phone
  if(r.email && !validEmail(r.email)) errors.push(`Invalid email "${r.email}"`);
  if(r.phone!==undefined){ const p = normalizePhone(r.phone); if(!p.ok) errors.push(`Invalid phone "${r.phone}"`); else r.phone = p.value; }
  if(type==="leads"){
    if(!r.name && !r.company) errors.push("Needs a name or company");
    if(r.status && !IMPORT_LEAD_STATUSES.includes(r.status)){ warnings.push(`Status "${r.status}" not recognised — set to New`); r.status = "New"; }
    if(r.score!==undefined && r.score!==""){ const n = Number(r.score); if(isNaN(n)) { warnings.push("Score is not a number — set to 10"); r.score = 10; } else r.score = Math.max(0, Math.min(100, Math.round(n))); }
  }
  if(type==="accounts" && !r.name) errors.push("Account name is required");
  if(type==="contacts"){
    if(!r.first && !r.last) errors.push("Needs a first or last name");
    if(r.account && !DB.accounts.some(a=>a.name.toLowerCase()===String(r.account).toLowerCase())) warnings.push(`Account "${r.account}" not found — contact left unlinked`);
  }
  if(type==="products"){
    if(!r.name) errors.push("Product name is required");
    if(r.price!==undefined && r.price!==""){ const n = Number(String(r.price).replace(/,/g,"")); if(isNaN(n)||n<0) errors.push(`Invalid price "${r.price}"`); else r.price = n; }
  }
  if(type==="deals"){
    if(!r.name) errors.push("Deal name is required");
    const amt = Number(String(r.amount||0).replace(/,/g,"")); if(isNaN(amt)||amt<0) errors.push(`Invalid amount "${r.amount}"`); else r.amount = amt;
    if(r.stage && !PIPELINE_STAGES.includes(r.stage)){ warnings.push(`Stage "${r.stage}" not recognised — set to ${PIPELINE_STAGES[0]}`); r.stage = PIPELINE_STAGES[0]; }
    if(!r.stage) r.stage = PIPELINE_STAGES[0];
    if(r.closing && !/^\d{4}-\d{2}-\d{2}$/.test(r.closing)) errors.push(`Closing date "${r.closing}" must be YYYY-MM-DD`);
    if(r.probability!==undefined && r.probability!==""){ const n = Number(r.probability); r.probability = isNaN(n) ? 20 : Math.max(0,Math.min(100,Math.round(n))); }
    if(r.account && !DB.accounts.some(a=>a.name.toLowerCase()===String(r.account).toLowerCase())) warnings.push(`Account "${r.account}" not found — deal left unlinked`);
  }
  return {rec:r, errors, warnings};
}
(function(){
  const baseBuild = buildImportRecord;
  buildImportRecord = function(type, r){
    if(type==="deals"){
      if(!r.name) return null;
      const acc = DB.accounts.find(a=>a.name.toLowerCase()===String(r.account||"").toLowerCase());
      const stage = r.stage || PIPELINE_STAGES[0];
      const closed = stage==="Closed Won"||stage==="Closed Lost";
      return {id:uid("deal"), name:r.name, account:acc?acc.id:"", contact:"", owner:r.owner||CURRENT_USER.name, amount:Number(r.amount||0),
        probability: r.probability!==undefined&&r.probability!=="" ? Number(r.probability) : (stage==="Closed Won"?100:stage==="Closed Lost"?0:20),
        closing:r.closing||"", stage, type:"New Business", source:r.source||"Import", competitor:"", nextStep:r.nextStep||"", description:"",
        created:todayISO(), stageChangedAt:todayISO(), closedAt:closed?todayISO():""};
    }
    return baseBuild(type, r);
  };
})();

let importPlan = null;
function openImport(){
  const types = Object.keys(IMPORT_TEMPLATES).filter(k=>canManage(IMPORT_PERM[k]));
  if(!types.length){ toast("You do not have permission to import data."); return; }
  importPlan = null;
  const body = `
    <div class="field full"><label>What are you importing?</label>
      <select id="im_type">${types.map(k=>`<option value="${k}">${k.charAt(0).toUpperCase()+k.slice(1)}</option>`).join("")}</select></div>
    <div class="field full" style="margin-top:10px;"><label>CSV file (header row required, max ${IMPORT_MAX_ROWS} rows / 2 MB)</label><input id="im_file" type="file" accept=".csv,text/csv"></div>
    <div class="field full" style="margin-top:10px;"><label>If a record already exists</label>
      <select id="im_dupes"><option value="skip">Skip it (recommended)</option><option value="update">Update the existing record with the file's values</option><option value="add">Import anyway (create a duplicate)</option></select></div>
    <div style="margin:10px 0;"><button class="btn btn-sm" onclick="downloadTemplate()">Download template CSV</button></div>
    <div id="im_preview"></div>`;
  openModal("Import from CSV", body, ()=>{ importStepPreview(); return false; }, "Preview");
}
function importStepPreview(){
  const type = val("im_type"), file = document.getElementById("im_file").files[0];
  if(!file){ toast("Choose a CSV file first."); return; }
  if(file.size > IMPORT_MAX_BYTES){ toast("That file is larger than 2 MB. Split it into smaller files."); return; }
  const reader = new FileReader();
  reader.onload = ()=>{
    let rows;
    try{ rows = parseCSV(String(reader.result).replace(/^\uFEFF/,"")); }catch(e){ toast("Could not read that CSV."); return; }
    if(rows.length<2){ toast("That file has no data rows."); return; }
    if(rows.length-1 > IMPORT_MAX_ROWS){ toast(`Too many rows (${rows.length-1}). The limit is ${IMPORT_MAX_ROWS} per import.`); return; }
    importPlan = {type, header: rows[0].map(h=>h.trim()), rows: rows.slice(1), dupes: val("im_dupes")};
    importRenderMapping();
  };
  reader.readAsText(file);
}
function importAutoMap(field, header){
  const nk = normKey(field);
  let i = header.findIndex(h=>normKey(h)===nk); if(i>=0) return i;
  const syn = (IMPORT_SYNONYMS[field]||[]).map(normKey);
  i = header.findIndex(h=>syn.includes(normKey(h))); return i;
}
function importRenderMapping(){
  const p = importPlan, fields = IMPORT_TEMPLATES[p.type];
  const opt = (i)=>`<option value="-1">— not imported —</option>` + p.header.map((h,j)=>`<option value="${j}" ${j===i?"selected":""}>${esc(h||"(blank)")}</option>`).join("");
  document.getElementById("im_preview").innerHTML = `
    <div style="font-weight:600;margin:12px 0 6px;">Match your columns (${p.rows.length} rows found)</div>
    <div style="display:grid;grid-template-columns:130px 1fr;gap:6px 10px;align-items:center;max-height:220px;overflow:auto;">
      ${fields.map(f=>`<label for="im_map_${f}" style="font-size:12px;">${esc(f)}</label><select id="im_map_${f}">${opt(importAutoMap(f,p.header))}</select>`).join("")}
    </div>
    <div style="margin-top:10px;"><button class="btn btn-sm btn-primary" onclick="importRunValidation()">Check data</button></div>`;
  const b = document.getElementById("modalSaveBtn"); b.textContent = "Check data first"; b.disabled = true;
}
function importRunValidation(){
  const p = importPlan, fields = IMPORT_TEMPLATES[p.type];
  const map = {}; fields.forEach(f=>{ map[f] = Number(document.getElementById("im_map_"+f).value); });
  const existing = new Map(); DB[p.type].forEach(r=>{ const k = existingKey(p.type,r); if(k && !existing.has(k)) existing.set(k,r); });
  const seenInFile = new Set();
  const out = {ok:[], dupes:[], errors:[]};
  p.rows.forEach((row,idx)=>{
    const raw = {}; fields.forEach(f=>{ if(map[f]>=0) raw[f] = String(row[map[f]]||"").trim(); });
    const v = validateImportRow(p.type, raw);
    const line = idx+2;
    if(v.errors.length){ out.errors.push({line, row, msgs:v.errors}); return; }
    const key = importKey(p.type, Object.assign({}, v.rec, {accountName:v.rec.account}));
    if(key && seenInFile.has(key) && p.dupes!=="add"){ out.dupes.push({line, rec:v.rec, warnings:v.warnings, inFile:true}); return; }
    seenInFile.add(key);
    const ex = key ? existing.get(key) : null;
    if(ex && p.dupes!=="add"){ out.dupes.push({line, rec:v.rec, warnings:v.warnings, existing:ex}); return; }
    out.ok.push({line, rec:v.rec, warnings:v.warnings});
  });
  p.result = out;
  const warnCount = out.ok.reduce((s,x)=>s+x.warnings.length,0);
  const willUpdate = p.dupes==="update" ? out.dupes.filter(d=>d.existing).length : 0;
  const preview = out.ok.slice(0,5).map(x=>`<tr>${fields.slice(0,5).map(f=>`<td>${esc(x.rec[f]===undefined?"":x.rec[f])}</td>`).join("")}</tr>`).join("");
  document.getElementById("im_preview").insertAdjacentHTML("beforeend", `<div id="im_result" style="margin-top:14px;border-top:1px solid var(--line);padding-top:10px;">
    <div style="font-size:13px;line-height:1.7;">
      <b style="color:var(--good);">${out.ok.length}</b> ready to import${warnCount?` (${warnCount} adjusted)`:""}<br>
      <b>${out.dupes.length}</b> already exist ${p.dupes==="update"?`(${willUpdate} will be updated)`:p.dupes==="skip"?"(will be skipped)":""}<br>
      <b style="color:var(--clay);">${out.errors.length}</b> rows have errors and will be skipped
    </div>
    ${out.errors.slice(0,6).map(e=>`<div style="font-size:11.5px;color:var(--clay);">Row ${e.line}: ${e.msgs.map(esc).join("; ")}</div>`).join("")}
    ${out.errors.length>6?`<div style="font-size:11.5px;color:var(--ink-soft);">…and ${out.errors.length-6} more (see the error report)</div>`:""}
    ${(out.errors.length||out.dupes.length)?`<div style="margin-top:8px;"><button class="btn btn-sm" onclick="importDownloadReport()">Download error / duplicate report</button></div>`:""}
    ${preview?`<div style="margin-top:10px;font-size:11.5px;color:var(--ink-soft);">Preview of first rows</div><div style="overflow:auto;"><table style="font-size:11.5px;"><thead><tr>${fields.slice(0,5).map(f=>`<th>${esc(f)}</th>`).join("")}</tr></thead><tbody>${preview}</tbody></table></div>`:""}
  </div>`);
  const prev = document.getElementById("im_result"); if(prev && prev.previousElementSibling && prev.previousElementSibling.id==="im_result") prev.previousElementSibling.remove();
  const total = out.ok.length + willUpdate;
  const b = document.getElementById("modalSaveBtn");
  b.disabled = total===0; b.textContent = total ? `Import ${out.ok.length}${willUpdate?` + update ${willUpdate}`:""}` : "Nothing to import";
  b.onclick = importCommit;
}
function importDownloadReport(){
  const p = importPlan, out = p.result;
  const rows = [["Row","Status","Details",...p.header]];
  out.errors.forEach(e=>rows.push([e.line,"Error",e.msgs.join("; "),...e.row]));
  out.dupes.forEach(d=>rows.push([d.line,d.inFile?"Duplicate in file":"Already exists","", ...Object.values(d.rec)]));
  download(`acacia-${p.type}-import-report-${todayISO()}.csv`, toCSV(rows), "text/csv;charset=utf-8");
}
function importCommit(){
  const p = importPlan; if(!p||!p.result) return;
  const type = p.type, out = p.result;
  if(!canManage(IMPORT_PERM[type])){ toast("You do not have permission to import data."); return; }
  let added = 0, updated = 0;
  out.ok.forEach(x=>{ const rec = buildImportRecord(type, x.rec); if(rec){ DB[type].push(rec); added++; } });
  if(p.dupes==="update"){
    out.dupes.filter(d=>d.existing).forEach(d=>{
      const built = buildImportRecord(type, d.rec); if(!built) return;
      const keep = {id:d.existing.id, created:d.existing.created};
      Object.keys(built).forEach(k=>{ if(k!=="id" && k!=="created" && built[k]!=="" && built[k]!==undefined && !(type==="deals" && (k==="stageChangedAt"||k==="closedAt"))) d.existing[k] = built[k]; });
      Object.assign(d.existing, keep); updated++;
    });
  }
  save();
  closeModal();
  toast(`${added} ${type} imported${updated?`, ${updated} updated`:""}${out.errors.length?`, ${out.errors.length} skipped`:""}.`);
  importPlan = null;
  goTo(type);
}

/* ---------- form validation + duplicate warning on every modal form (M7) ---------- */
function validateModalFields(){
  const box = document.getElementById("modalBox"); if(!box) return true;
  const title = (box.querySelector(".modal-head h3")||{}).textContent||"";
  const email = box.querySelector("#f_email"), phone = box.querySelector("#f_phone"), mobile = box.querySelector("#f_mobile");
  let ok = true;
  const mark = (el,bad,msg)=>{ el.setAttribute("aria-invalid", bad?"true":"false"); el.style.borderColor = bad ? "var(--clay)" : ""; if(bad){ toast(msg); if(ok) el.focus(); ok = false; } };
  if(email && email.value.trim()) mark(email, !validEmail(email.value.trim()), "Please enter a valid email address.");
  [phone,mobile].forEach(el=>{
    if(!el || !el.value.trim()) return;
    const n = normalizePhone(el.value); mark(el, !n.ok, "Please enter a valid phone number, e.g. 0712 345 678 or +254712345678.");
    if(n.ok) el.value = n.value;
  });
  if(!ok) return false;
  if(/^New (Lead|Contact|Account)$/.test(title)){
    const type = title.includes("Lead")?"leads":title.includes("Contact")?"contacts":"accounts";
    const em = email && email.value.trim().toLowerCase(), ph = phone && phone.value.trim();
    const nm = (box.querySelector("#f_name")||{}).value;
    const dup = DB[type].find(r=> (em && String(r.email||"").toLowerCase()===em) || (ph && r.phone && normalizePhone(r.phone).value===ph) || (type==="accounts" && nm && String(r.name||"").trim().toLowerCase()===nm.trim().toLowerCase()));
    if(dup){
      const label = type==="contacts" ? ((dup.first||"")+" "+(dup.last||"")).trim() : dup.name;
      if(!confirm(`A similar record already exists: "${label}" (same email, phone or name). Create another anyway?`)) return false;
    }
  }
  return true;
}
(function(){
  const baseOpen = openModal;
  openModal = function(title, bodyHtml, onSave, saveLabel){
    baseOpen(title, bodyHtml, onSave, saveLabel);
    const b = document.getElementById("modalSaveBtn");
    if(b && title!=="Import from CSV") b.onclick = ()=>{ if(!validateModalFields()) return; if(onSave()!==false) closeModal(); };
  };
})();


/* =========================================================
   LIST TOOLS: search, sort, paging, bulk actions (audit M8)
   Works on the Leads, Accounts, Contacts and Deals tables.
   ========================================================= */
const LIST_VIEWS = {leads:"lead", accounts:"account", contacts:"contact", deals:"deal"};
const listState = {};
function listStateFor(view){ return listState[view] || (listState[view] = {q:"", col:-1, dir:1, page:1, size:25, sel:new Set()}); }
function cellValue(tr, i){ const td = tr.children[i]; return td ? td.textContent.trim() : ""; }
function cmpValues(a, b){
  const num = x=>{ const n = parseFloat(String(x).replace(/[^0-9.\-]/g,"")); return (/\d/.test(x) && !isNaN(n)) ? n : NaN; };
  const na = num(a), nb = num(b);
  if(!isNaN(na) && !isNaN(nb) && !/[a-z]{3,}/i.test(a.replace(/KSh/i,"")) ) return na-nb;
  const da = Date.parse(a), db = Date.parse(b);
  if(!isNaN(da) && !isNaN(db) && /\d{4}/.test(a) && /\d{4}/.test(b)) return da-db;
  return a.localeCompare(b, undefined, {numeric:true, sensitivity:"base"});
}
function enhanceList(view){
  const type = LIST_VIEWS[view]; if(!type) return;
  const content = document.getElementById("content");
  const wrap = content.querySelector(".tablewrap"); const table = wrap && wrap.querySelector("table");
  if(!table) return;
  if(table.dataset.enhanced) return; table.dataset.enhanced = "1";
  const tbody = table.tBodies[0]; const st = listStateFor(view);
  const dataRows = ()=>[...tbody.querySelectorAll("tr[data-id]")];
  if(!dataRows().length) return;
  const canEdit = canManage(IMPORT_PERM[view]);
  const hasOwnSearch = !!document.getElementById("leadSearchInput");

  // checkbox column
  const headRow = table.tHead.rows[0];
  const th0 = document.createElement("th"); th0.style.width = "34px";
  th0.innerHTML = canEdit ? `<input type="checkbox" id="listSelAll" aria-label="Select all rows">` : "";
  headRow.insertBefore(th0, headRow.firstChild);
  dataRows().forEach(tr=>{
    const td = document.createElement("td"); td.setAttribute("onclick","event.stopPropagation()");
    td.innerHTML = canEdit ? `<input type="checkbox" class="listSel" aria-label="Select row" ${st.sel.has(tr.dataset.id)?"checked":""}>` : "";
    tr.insertBefore(td, tr.firstChild);
  });

  // toolbar
  const bar = document.createElement("div"); bar.className = "listtools";
  bar.innerHTML = `
    ${hasOwnSearch ? "" : `<input type="search" id="listSearch" placeholder="Search this list…" aria-label="Search this list" value="${esc(st.q)}">`}
    <span id="listCount" class="muted"></span>
    <span style="flex:1"></span>
    <label class="muted" style="display:flex;align-items:center;gap:6px;">Rows <select id="listSize" aria-label="Rows per page">${[25,50,100].map(n=>`<option ${st.size===n?"selected":""}>${n}</option>`).join("")}</select></label>
    <button class="btn btn-sm" id="listPrev" aria-label="Previous page">‹</button>
    <span id="listPage" class="muted"></span>
    <button class="btn btn-sm" id="listNext" aria-label="Next page">›</button>`;
  wrap.parentNode.insertBefore(bar, wrap);
  const bulk = document.createElement("div"); bulk.className = "bulkbar"; bulk.id = "bulkBar"; bulk.style.display = "none";
  wrap.parentNode.insertBefore(bulk, wrap);

  // sortable headers
  [...headRow.cells].forEach((th,i)=>{
    if(i===0 || !th.textContent.trim()) return;
    th.setAttribute("role","button"); th.tabIndex = 0; th.style.cursor = "pointer"; th.title = "Click to sort";
    th.addEventListener("click", ()=>{ if(st.col===i) st.dir = -st.dir; else { st.col = i; st.dir = 1; } st.page = 1; apply(); });
  });

  function matching(){
    const q = st.q.trim().toLowerCase();
    return dataRows().filter(tr=> !q || tr.textContent.toLowerCase().includes(q));
  }
  function apply(){
    const all = dataRows(), match = matching();
    if(st.col>=0) match.sort((a,b)=> st.dir*cmpValues(cellValue(a,st.col), cellValue(b,st.col)));
    const pages = Math.max(1, Math.ceil(match.length/st.size));
    if(st.page>pages) st.page = pages;
    const start = (st.page-1)*st.size, shown = new Set(match.slice(start, start+st.size));
    all.forEach(tr=>{ tr.style.display = "none"; });
    match.forEach(tr=>{ tbody.appendChild(tr); if(shown.has(tr)) tr.style.display = ""; });
    [...headRow.cells].forEach((th,i)=>{ const old = th.querySelector(".sortmark"); if(old) old.remove(); if(i===st.col){ th.insertAdjacentHTML("beforeend", `<span class="sortmark"> ${st.dir>0?"▲":"▼"}</span>`); th.setAttribute("aria-sort", st.dir>0?"ascending":"descending"); } else th.removeAttribute("aria-sort"); });
    let empty = tbody.querySelector(".listempty");
    if(!match.length){ if(!empty){ empty = document.createElement("tr"); empty.className = "listempty"; empty.innerHTML = `<td colspan="${headRow.cells.length}"><div class="empty">Nothing matches your search.</div></td>`; tbody.appendChild(empty); } }
    else if(empty) empty.remove();
    document.getElementById("listCount").textContent = match.length===all.length ? `${all.length} records` : `${match.length} of ${all.length} records`;
    document.getElementById("listPage").textContent = `${st.page} / ${pages}`;
    document.getElementById("listPrev").disabled = st.page<=1; document.getElementById("listNext").disabled = st.page>=pages;
    const selAll = document.getElementById("listSelAll");
    if(selAll){ const ids = match.map(t=>t.dataset.id); selAll.checked = ids.length>0 && ids.every(i=>st.sel.has(i)); }
    dataRows().forEach(tr=>{ const cb = tr.querySelector(".listSel"); if(cb) cb.checked = st.sel.has(tr.dataset.id); });
    renderBulk();
  }
  function renderBulk(){
    const ids = [...st.sel].filter(id=>dataRows().some(t=>t.dataset.id===id));
    st.sel = new Set(ids);
    if(!ids.length){ bulk.style.display = "none"; bulk.innerHTML = ""; return; }
    const owners = companyUsers().map(u=>u.name);
    const extra = type==="lead" ? `<select id="bulkStatus" aria-label="Set status"><option value="">Set status…</option>${IMPORT_LEAD_STATUSES.map(x=>`<option>${x}</option>`).join("")}</select>`
      : type==="deal" ? `<select id="bulkStage" aria-label="Move to stage"><option value="">Move to stage…</option>${PIPELINE_STAGES.map(x=>`<option>${x}</option>`).join("")}</select>` : "";
    bulk.style.display = "flex";
    bulk.innerHTML = `<b>${ids.length} selected</b>
      ${currentRole()==="Salesperson" ? "" : `<select id="bulkOwner" aria-label="Reassign owner"><option value="">Reassign to…</option>${owners.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>`}
      ${extra}
      <button class="btn btn-sm" id="bulkExport">Export selected</button>
      <button class="btn btn-sm btn-danger" id="bulkDelete">Delete</button>
      <button class="btn btn-sm" id="bulkClear">Clear</button>`;
    const list = DB[IMPORT_PERM[view]];
    const recs = ()=> ids.map(id=>list.find(r=>r.id===id)).filter(Boolean);
    const done = (msg)=>{ st.sel.clear(); save(); toast(msg); renderView(); };
    const bo = document.getElementById("bulkOwner");
    if(bo) bo.onchange = ()=>{ if(!bo.value) return; if(!confirm(`Reassign ${ids.length} record(s) to ${bo.value}?`)){ bo.value=""; return; } recs().forEach(r=>{ r.owner = bo.value; }); done(`Reassigned ${ids.length} to ${bo.value}.`); };
    const bs = document.getElementById("bulkStatus");
    if(bs) bs.onchange = ()=>{ if(!bs.value) return; recs().forEach(r=>{ r.status = bs.value; }); done(`Updated ${ids.length} lead(s).`); };
    const bg = document.getElementById("bulkStage");
    if(bg) bg.onchange = ()=>{ if(!bg.value) return; if(!confirm(`Move ${ids.length} deal(s) to ${bg.value}?`)){ bg.value=""; return; } recs().forEach(r=>applyStageChange(r,bg.value)); done(`Moved ${ids.length} deal(s) to ${bg.value}.`); };
    document.getElementById("bulkClear").onclick = ()=>{ st.sel.clear(); apply(); };
    document.getElementById("bulkExport").onclick = ()=>{
      const heads = [...headRow.cells].slice(1).map(h=>h.textContent.replace(/[▲▼]/g,"").trim()).filter(Boolean);
      const rows = [heads]; dataRows().filter(t=>st.sel.has(t.dataset.id)).forEach(t=>rows.push([...t.cells].slice(1,1+heads.length).map(td=>td.textContent.trim())));
      download(`acacia-${view}-selected-${todayISO()}.csv`, toCSV(rows), "text/csv;charset=utf-8");
    };
    document.getElementById("bulkDelete").onclick = ()=>{
      if(!confirm(`Delete ${ids.length} record(s)? They move to the Recycle Bin (Settings) and can be restored.`)) return;
      let n = 0; ids.forEach(id=>{ if(deleteRecord(type, id, true)) n++; });
      st.sel.clear(); toast(`${n} moved to Recycle Bin.`); renderView();
    };
  }

  // events
  const search = document.getElementById("listSearch");
  if(search) search.addEventListener("input", ()=>{ st.q = search.value; st.page = 1; apply(); });
  document.getElementById("listSize").onchange = e=>{ st.size = Number(e.target.value); st.page = 1; apply(); };
  document.getElementById("listPrev").onclick = ()=>{ st.page--; apply(); };
  document.getElementById("listNext").onclick = ()=>{ st.page++; apply(); };
  const selAll = document.getElementById("listSelAll");
  if(selAll) selAll.onchange = ()=>{ matching().forEach(tr=>{ selAll.checked ? st.sel.add(tr.dataset.id) : st.sel.delete(tr.dataset.id); }); apply(); };
  tbody.addEventListener("change", e=>{ if(e.target.classList.contains("listSel")){ const id = e.target.closest("tr").dataset.id; e.target.checked ? st.sel.add(id) : st.sel.delete(id); apply(); } });
  // leads list has its own search box that re-renders; keep our state when it does
  if(hasOwnSearch) st.q = "";
  apply();
}
(function(){
  const base = renderView;
  renderView = function(){ base.apply(this, arguments); try{ enhanceList(currentView); }catch(e){ console.error(e); } a11yify(document.getElementById("content")); };
})();

(function(){
  const baseLeads = renderLeads;
  renderLeads = function(c){ baseLeads.apply(this, arguments); try{ enhanceList("leads"); }catch(e){ console.error(e); } };
})();


/* =========================================================
   NOTES, UNIFIED HISTORY, CONTACT PAGE, DEAL CONTACT ROLES
   (audit M9, M10)
   ========================================================= */
const NOTE_PERM = {lead:"leads", account:"accounts", contact:"contacts", deal:"deals"};
function escRe(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"); }
function noteHtml(text){
  let h = esc(text).replace(/\n/g,"<br>");
  companyUsers().forEach(u=>{
    if(!u.name) return;
    const names = [u.name]; const first = u.name.split(" ")[0]; if(first && first!==u.name) names.push(first);
    names.forEach(n=>{ h = h.replace(new RegExp("@"+escRe(esc(n))+"(?![\\w])","gi"), m=>`<span class="mention">${m}</span>`); });
  });
  return h;
}
function mentionedUsers(text){
  const t = text.toLowerCase();
  return companyUsers().filter(u=>{
    if(!u.name) return false;
    const first = u.name.split(" ")[0].toLowerCase();
    return t.includes("@"+u.name.toLowerCase()) || (first && new RegExp("@"+escRe(first)+"(?![\\w])").test(t));
  });
}
function entityLabel(type,id){
  const r = type==="lead"?findLead(id): type==="account"?findAccount(id): type==="deal"?findDeal(id): findContact(id);
  if(!r) return "";
  return type==="contact" ? ((r.first||"")+" "+(r.last||"")).trim() : r.name;
}
function addNote(type, id){
  if(!canManage(NOTE_PERM[type])){ toast("You do not have permission to add notes here."); return; }
  const box = document.getElementById("noteBox"); const text = box ? box.value.trim() : "";
  if(!text){ toast("Write a note first."); return; }
  DB.notes = DB.notes || [];
  DB.notes.push({id:uid("nt"), entity:id, entityType:type, text, author:CURRENT_USER.name, ts:Date.now()});
  mentionedUsers(text).forEach(u=>{ if(u.name!==CURRENT_USER.name) notify(`${CURRENT_USER.name} mentioned you in a note on ${entityLabel(type,id)}.`, u.name); });
  save(); renderView();
}
function deleteNote(nid){
  const n = (DB.notes||[]).find(x=>x.id===nid); if(!n) return;
  if(n.author!==CURRENT_USER.name && !isAdmin()){ toast("Only the author or an Administrator can delete a note."); return; }
  if(!confirm("Delete this note?")) return;
  DB.notes = DB.notes.filter(x=>x.id!==nid); save(); renderView();
}
function historyFor(type, id){
  const items = [];
  const ids = new Set([id]);
  if(type==="account"){ DB.deals.filter(d=>d.account===id).forEach(d=>ids.add(d.id)); }
  (DB.notes||[]).filter(n=>ids.has(n.entity)).forEach(n=>items.push({ts:n.ts, kind:"note", text:n.text, who:n.author, id:n.id, from: n.entity!==id ? entityLabel(n.entityType,n.entity) : ""}));
  (DB.timeline||[]).filter(t=>ids.has(t.entity)).forEach(t=>items.push({ts:Date.parse(t.date)||0, kind:"event", text:t.text, date:t.date}));
  (DB.activities||[]).filter(a=>ids.has(a.related)).forEach(a=>items.push({ts:Date.parse(a.due)||0, kind:"activity", text:`${a.kind}: ${a.title}${a.done?" — done":""}`, date:a.due, done:a.done}));
  return items.sort((x,y)=>y.ts-x.ts);
}
function notesPanel(type, id){
  const canAdd = canManage(NOTE_PERM[type]);
  const items = historyFor(type, id);
  const icon = {note:"📝", event:"🕘", activity:"✅"};
  return `<div class="panel"><h3>Notes &amp; history <span class="count">(${items.length})</span></h3>
    ${canAdd ? `<div class="notecomposer"><textarea id="noteBox" rows="2" placeholder="Add a note… use @Name to notify a teammate" aria-label="New note"></textarea><button class="btn btn-sm btn-primary" onclick="addNote('${type}','${id}')">Add note</button></div>` : ``}
    ${items.length ? `<div class="feed">${items.map(it=>`<div class="feeditem ${it.kind}">
      <div class="ficon" aria-hidden="true">${icon[it.kind]}</div>
      <div class="fbody">
        <div class="fmeta">${it.kind==="note" ? `<b>${esc(it.who)}</b> · ${esc(timeAgo(it.ts))}${it.from?` · on ${esc(it.from)}`:""}` : esc(fmtDate(it.date))}
          ${it.kind==="note" && (it.who===CURRENT_USER.name || isAdmin()) ? `<button class="xbtn" title="Delete note" aria-label="Delete note" onclick="deleteNote('${it.id}')">✕</button>` : ``}</div>
        <div class="ftext">${it.kind==="note" ? noteHtml(it.text) : esc(it.text)}</div>
      </div></div>`).join("")}</div>` : `<div class="empty">Nothing here yet.</div>`}
  </div>`;
}

/* quote and deal links for contact page */
function renderContactDetail(c){
  const ct = findContact(currentDetail.id);
  if(!ct){ c.innerHTML = `<div class="empty">Contact not found.</div>`; return; }
  const acc = findAccount(ct.account);
  const full = ((ct.first||"")+" "+(ct.last||"")).trim();
  const deals = DB.deals.filter(d=>d.contact===ct.id || (d.roles||[]).some(r=>r.contact===ct.id));
  const quotes = DB.quotes.filter(q=>q.contact===ct.id);
  const phone = ct.mobile||ct.phone||"";
  const wa = phone ? "https://wa.me/"+phone.replace(/\D/g,"") : "";
  c.innerHTML = `
    <div class="backlink" onclick="goTo('contacts')" role="button" tabindex="0">← Back to Contacts</div>
    <div class="detail-header">
      <div class="top">
        <div style="display:flex;gap:12px;align-items:center;"><div class="avatarsm" style="width:44px;height:44px;font-size:16px;">${esc(initials(full))}</div>
          <div><h2>${esc(full)}</h2><div class="sub2">${esc(ct.title||"—")}${acc?` · <span class="rowlink" onclick="goTo('account-detail',{type:'account',id:'${acc.id}'})">${esc(acc.name)}</span>`:""} · Owner: ${esc(ct.owner||"—")}</div></div></div>
        <div class="actions">
          ${ct.email ? `<a class="btn btn-sm" href="mailto:${esc(ct.email)}">Email</a>` : ``}
          ${phone ? `<a class="btn btn-sm" href="tel:${esc(phone)}">Call</a><a class="btn btn-sm" href="${esc(wa)}" target="_blank" rel="noopener">WhatsApp</a>` : ``}
          ${canManage('contacts') ? `<button class="btn btn-sm" onclick="openContactForm('${ct.id}')">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteRecord('contact','${ct.id}')">Delete</button>` : ``}
        </div>
      </div>
      <div class="fieldsgrid">
        <div><div class="k">Email</div><div class="v">${esc(ct.email||"—")}</div></div>
        <div><div class="k">Phone</div><div class="v">${esc(ct.phone||"—")}</div></div>
        <div><div class="k">Mobile</div><div class="v">${esc(ct.mobile||"—")}</div></div>
        <div><div class="k">Department</div><div class="v">${esc(ct.department||"—")}</div></div>
        <div><div class="k">Account</div><div class="v">${acc?esc(acc.name):"—"}</div></div>
        <div><div class="k">Owner</div><div class="v">${esc(ct.owner||"—")}</div></div>
      </div>
    </div>
    <div class="panel"><h3>Deals <span class="count">(${deals.length})</span></h3>
      ${listOrEmpty(deals.map(d=>{ const role = (d.roles||[]).find(r=>r.contact===ct.id); return `<div class="listrow" style="cursor:pointer" onclick="goTo('deal-detail',{type:'deal',id:'${d.id}'})"><div class="main"><div class="title rowlink">${esc(d.name)}</div><div class="meta">${esc(d.stage)} · ${fmtMoney(d.amount)}${role?` · ${esc(role.role)}`:""}</div></div></div>`; }), "No deals linked to this contact.")}
    </div>
    <div class="panel"><h3>Quotations <span class="count">(${quotes.length})</span></h3>
      ${listOrEmpty(quotes.map(q=>`<div class="listrow" style="cursor:pointer" onclick="goTo('quote-detail',{type:'quote',id:'${q.id}'})"><div class="main"><div class="title rowlink">${esc(q.number)}</div><div class="meta">${esc(effectiveQuoteStatus(q))} · ${fmtMoney(Math.round(quoteTotals(q).total))}</div></div></div>`), "No quotations for this contact.")}
    </div>
    <div class="panel"><h3>Activities ${logActivityButtons(ct.id)}</h3>${renderRelatedActivities(ct.id)}</div>
    ${notesPanel('contact', ct.id)}`;
}

/* multiple contacts per deal, with roles */
const DEAL_ROLES = ["Decision maker","Influencer","Champion","Budget holder","User","Other"];
function dealContactsPanel(d){
  const roles = d.roles || [];
  const can = canManage('deals');
  const primary = findContact(d.contact);
  return `<div class="panel"><h3>People on this deal <span class="count">(${roles.length + (primary?1:0)})</span>
      ${can ? `<button class="btn btn-sm" style="margin-left:6px;" onclick="openDealContactForm('${d.id}')">+ Add contact</button>` : ``}</h3>
    ${primary ? `<div class="listrow"><div class="main"><div class="title rowlink" onclick="goTo('contact-detail',{type:'contact',id:'${primary.id}'})">${esc(primary.first)} ${esc(primary.last)}</div><div class="meta">Primary contact</div></div></div>` : ``}
    ${roles.map((r,i)=>{ const ct = findContact(r.contact); if(!ct) return ""; return `<div class="listrow"><div class="main"><div class="title rowlink" onclick="goTo('contact-detail',{type:'contact',id:'${ct.id}'})">${esc(ct.first)} ${esc(ct.last)}</div><div class="meta">${esc(r.role)}</div></div>${can?`<button class="xbtn" title="Remove" aria-label="Remove contact from deal" onclick="removeDealContact('${d.id}',${i})">✕</button>`:""}</div>`; }).join("")}
    ${(!primary && !roles.length) ? `<div class="empty">No contacts yet.</div>` : ``}
  </div>`;
}
function openDealContactForm(dealId){
  if(!canManage('deals')){ toast("You do not have permission to change deals."); return; }
  const d = findDeal(dealId); if(!d) return;
  const used = new Set([d.contact, ...(d.roles||[]).map(r=>r.contact)]);
  const opts = DB.contacts.filter(c=>!used.has(c.id));
  const body = `<div class="formgrid">
    <div class="field full"><label>Contact</label><select id="dc_contact"><option value="">— Choose —</option>${opts.map(c=>`<option value="${c.id}">${esc(((c.first||"")+" "+(c.last||"")).trim())}${c.account&&findAccount(c.account)?" — "+esc(findAccount(c.account).name):""}</option>`).join("")}</select></div>
    <div class="field full"><label>Role on this deal</label><select id="dc_role">${DEAL_ROLES.map(r=>`<option>${r}</option>`).join("")}</select></div></div>`;
  openModal("Add contact to deal", body, ()=>{
    const cid = val("dc_contact"); if(!cid){ toast("Choose a contact."); return false; }
    d.roles = d.roles || []; d.roles.push({contact:cid, role:val("dc_role")});
    save(); renderView(); return true;
  });
}
function removeDealContact(dealId, idx){
  if(!canManage('deals')){ toast("You do not have permission to change deals."); return; }
  const d = findDeal(dealId); if(!d || !d.roles) return;
  d.roles.splice(idx,1); save(); renderView();
}
(function(){
  const base = logActivityButtons;
  logActivityButtons = function(id){
    if(findContact(id) && !findLead(id) && !findAccount(id) && !findDeal(id)){
      if(!canManage('activities')) return "";
      return ["Task","Call","Meeting"].map(k=>`<button class="btn btn-sm" style="margin-left:6px;" onclick="openActivityForm('${k}',{related:'${id}',relatedType:'contact'})">+ ${k}</button>`).join("");
    }
    return base(id);
  };
})();
