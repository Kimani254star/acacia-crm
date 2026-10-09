/* Acacia CRM ↔ Acacia Books field matching
 * Contacts now capture the same fields as a Books Customer.
 * Deals now capture the same fields as a Books Invoice (with line items, VAT, totals).
 * Each record can be exported in the Books import shape (JSON / CSV).
 */
(function(){
  const TAX_TREATMENTS = ["VAT Registered","Non VAT Registered","Exempt","Export"];
  const PAY_TERMS = [["Due on Receipt",0],["Net 7",7],["Net 15",15],["Net 30",30],["Net 45",45],["Net 60",60]];
  const CURRENCIES = ["KES","USD","EUR","GBP","AUD","CAD","CHF","CNY","JPY","INR","ZAR","NGN","UGX","TZS"];
  const SALUTATIONS = ["","Mr.","Mrs.","Ms.","Miss","Dr.","Prof.","Eng."];
  const ITEM_TYPES = ["product","service","consultation","subscription","software","maintenance","delivery","installation","rental","training","support"];
  const TAX_RATES = [["16","VAT 16%"],["0","Zero Rated"],["8","Other Rates 8%"],["exempt","Exempt"]];
  const BASES = [["accrual","Accrual"],["cash","Cash"]];

  const e = s => (typeof esc==="function"? esc(s) : String(s==null?"":s));
  const opt = (list, cur) => list.map(o=>{ const [v,l] = Array.isArray(o)?o:[o,o]; return `<option value="${e(v)}" ${String(cur)===String(v)?"selected":""}>${e(l||"— Select —")}</option>`; }).join("");
  const money = (n,c) => { try{ return new Intl.NumberFormat("en-KE",{style:"currency",currency:c||"KES"}).format(Number(n||0)); }catch(_){ return (c||"KES")+" "+Number(n||0).toFixed(2); } };
  const termDays = t => (PAY_TERMS.find(p=>p[0]===t)||[0,0])[1];
  const addDays = (iso,d) => { if(!iso) return ""; const x=new Date(iso); x.setDate(x.getDate()+Number(d||0)); return x.toISOString().slice(0,10); };
  const fullName = ct => ct ? [ct.salutation, ct.first, ct.last].filter(Boolean).join(" ") : "";
  const custDisplay = ct => ct ? (ct.companyName || fullName(ct)) : "";

  /* ================= CONTACTS = BOOKS CUSTOMERS ================= */
  window.renderContacts = function(c){
    const rows = scopeOwn(DB.contacts);
    c.innerHTML = `
      <div class="pageheader">
        <div><h1>Contacts</h1><div class="sub">${rows.length} contacts · fields match Books customers</div></div>
        <div class="actions">
          <button class="btn" onclick="abmExportCustomers('csv')">Export to Books (CSV)</button>
          <button class="btn" onclick="abmExportCustomers('json')">Export JSON</button>
          ${canManage('contacts') ? `<button class="btn btn-primary" onclick="openContactForm()">+ New Contact</button>` : ``}
        </div>
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Name</th><th>Company</th><th>KRA PIN</th><th>Email</th><th>Phone</th><th>Terms</th><th>Tax</th><th>Currency</th><th></th></tr></thead>
        <tbody>
        ${rows.map(ct=>`<tr>
            <td><div style="display:flex;align-items:center;gap:8px;"><div class="avatarsm">${initials(ct.first+' '+(ct.last||''))}</div>${e(fullName(ct))}</div></td>
            <td>${e(ct.companyName || (findAccount(ct.account)||{}).name || "—")}</td>
            <td>${e(ct.kraPin||"—")}</td>
            <td>${e(ct.email||"—")}</td>
            <td>${e(ct.phone||"—")}</td>
            <td>${e(ct.paymentTerms||"—")}</td>
            <td>${e(ct.taxTreatment||"—")}</td>
            <td>${e(ct.currency||"KES")}</td>
            <td>${canManage('contacts')?`<button class="btn btn-sm" onclick="openContactForm('${ct.id}')">Edit</button>`:""}</td>
          </tr>`).join("") || `<tr><td colspan="9" class="empty">No contacts yet.</td></tr>`}
        </tbody>
      </table></div>`;
  };

  window.openContactForm = function(id){
    const ct = id ? findContact(id) : null;
    const v = k => e(ct && ct[k] != null ? ct[k] : "");
    const body = `<div class="formgrid">
      <div class="field full"><b>Primary contact</b></div>
      <div class="field"><label>Salutation</label><select id="f_sal">${opt(SALUTATIONS, ct&&ct.salutation)}</select></div>
      <div class="field"><label>First name *</label><input id="f_first" value="${v('first')}"></div>
      <div class="field"><label>Last name</label><input id="f_last" value="${v('last')}"></div>
      <div class="field"><label>Job title</label><input id="f_title" value="${v('title')}"></div>
      <div class="field"><label>Company name (Customer name in Books)</label><input id="f_company" value="${v('companyName')}"></div>
      <div class="field"><label>Account</label><select id="f_account"><option value="">— None —</option>${DB.accounts.map(a=>`<option value="${a.id}" ${ct&&ct.account===a.id?"selected":""}>${e(a.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Department</label><input id="f_department" value="${v('department')}"></div>
      <div class="field"><label>Owner / Sales person</label><input id="f_owner" value="${ct?v('owner'):e(CURRENT_USER.name)}"></div>

      <div class="field full"><b>Contact details</b></div>
      <div class="field"><label>Primary email</label><input id="f_email" type="email" value="${v('email')}"></div>
      <div class="field"><label>Secondary email</label><input id="f_email2" type="email" value="${v('email2')}"></div>
      <div class="field"><label>Phone</label><input id="f_phone" value="${v('phone')}"></div>
      <div class="field"><label>Mobile</label><input id="f_mobile" value="${v('mobile')}"></div>
      <div class="field"><label>Website</label><input id="f_web" value="${v('website')}"></div>

      <div class="field full"><b>Tax &amp; billing (as in Books)</b></div>
      <div class="field"><label>KRA PIN</label><input id="f_kra" maxlength="11" placeholder="P051234567X" value="${v('kraPin')}" style="text-transform:uppercase"></div>
      <div class="field"><label>Tax treatment</label><select id="f_taxt">${opt(["",...TAX_TREATMENTS], ct&&ct.taxTreatment)}</select></div>
      <div class="field"><label>Currency</label><select id="f_cur">${opt(CURRENCIES, (ct&&ct.currency)||"KES")}</select></div>
      <div class="field"><label>Payment terms</label><select id="f_terms">${opt(["",...PAY_TERMS.map(p=>p[0])], ct&&ct.paymentTerms)}</select></div>
      <div class="field"><label>Credit limit</label><input id="f_credit" type="number" min="0" value="${v('creditLimit')}"></div>
      <div class="field"><label>Opening balance</label><input id="f_open" type="number" value="${v('openingBalance')}"></div>
      <div class="field"><label><input type="checkbox" id="f_autostmt" ${ct&&ct.autoSendStatement?"checked":""}> Auto-send monthly statement</label></div>

      <div class="field full"><b>Addresses</b></div>
      <div class="field full"><label>Billing address</label><textarea id="f_bill" placeholder="Street, Building, P.O. Box, City, Country">${v('billingAddress')}</textarea></div>
      <div class="field full"><label><input type="checkbox" id="f_same" onchange="if(this.checked)document.getElementById('f_ship').value=document.getElementById('f_bill').value"> Shipping same as billing</label></div>
      <div class="field full"><label>Shipping address</label><textarea id="f_ship">${v('shippingAddress')}</textarea></div>

      <div class="field"><label>Tags (comma separated)</label><input id="f_tags" value="${v('tags')}"></div>
      <div class="field"><label>Source</label><input id="f_src" value="${ct?v('source'):'Manual Entry'}"></div>
      <div class="field full"><label>Remarks</label><textarea id="f_rem">${v('remarks')}</textarea></div>
    </div>`;
    openModal(ct?"Edit Contact / Customer":"New Contact / Customer", body, ()=>{
      const first = val('f_first');
      if(!first){ toast("First name is required."); return false; }
      const email = val('f_email'), email2 = val('f_email2');
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if(email && !re.test(email)){ toast("Primary email looks invalid."); return false; }
      if(email2 && !re.test(email2)){ toast("Secondary email looks invalid."); return false; }
      const kra = val('f_kra').toUpperCase();
      if(kra && !/^[AP]\d{9}[A-Z]$/.test(kra)){ toast("KRA PIN should look like P051234567X."); return false; }
      const data = {
        salutation:val('f_sal'), first, last:val('f_last'), title:val('f_title'), companyName:val('f_company'),
        account:val('f_account'), department:val('f_department'), owner:val('f_owner'),
        email, email2, phone:val('f_phone'), mobile:val('f_mobile'), website:val('f_web'),
        kraPin:kra, taxTreatment:val('f_taxt'), currency:val('f_cur')||"KES", paymentTerms:val('f_terms'),
        creditLimit:Number(val('f_credit')||0), openingBalance:Number(val('f_open')||0),
        autoSendStatement:document.getElementById('f_autostmt').checked,
        billingAddress:val('f_bill'), shippingAddress:val('f_ship'),
        tags:val('f_tags'), source:val('f_src')||"Manual Entry", remarks:val('f_rem')
      };
      if(ct){ Object.assign(ct,data); notify(`Contact updated: ${first} ${data.last}`); }
      else { DB.contacts.push(Object.assign({id:uid("con")}, data)); notify(`New contact created: ${first} ${data.last}`); }
      save(); goTo("contacts"); return true;
    });
  };

  function toBooksCustomer(ct){
    return {
      customerName: custDisplay(ct), salutation: ct.salutation||"", firstName: ct.first||"", lastName: ct.last||"",
      companyName: ct.companyName||"", krapin: ct.kraPin||"", emailPrimary: ct.email||"", emailSecondary: ct.email2||"",
      phone: ct.phone||"", mobile: ct.mobile||"", website: ct.website||"", currency: ct.currency||"KES",
      paymentTerms: ct.paymentTerms||"", taxTreatment: ct.taxTreatment||"", creditLimit: ct.creditLimit||0,
      openingBalance: ct.openingBalance||0, autoSendStatement: !!ct.autoSendStatement,
      billingAddress: ct.billingAddress||"", shippingAddress: ct.shippingAddress||"",
      tags: ct.tags||"", remarks: ct.remarks||"", salesPerson: ct.owner||"", crmId: ct.id
    };
  }

  /* ================= DEALS = BOOKS INVOICES ================= */
  let lines = [];
  function lineCalc(l){
    const gross = Number(l.qty||0) * Number(l.price||0);
    const disc = gross * Number(l.discount||0) / 100;
    const net = gross - disc;
    const rate = l.tax==="exempt" ? 0 : Number(l.tax||0);
    const vat = net * rate / 100;
    return {gross, disc, net, vat, total: net + vat};
  }
  function totals(ls){
    return ls.reduce((a,l)=>{ const c=lineCalc(l); a.sub+=c.gross; a.disc+=c.disc; a.net+=c.net; a.vat+=c.vat; a.total+=c.total; return a; }, {sub:0,disc:0,net:0,vat:0,total:0});
  }
  function nextInvoiceNo(){
    const nums = DB.deals.map(d=>parseInt(String(d.invoiceNumber||"").replace(/\D/g,""),10)).filter(n=>!isNaN(n));
    return "INV-" + String((nums.length?Math.max(...nums):0)+1).padStart(5,"0");
  }

  window.abmRenderLines = function(){
    const cur = val('f_cur') || "KES";
    const prods = (DB.products||[]);
    const tb = document.getElementById("abmLines"); if(!tb) return;
    tb.innerHTML = lines.map((l,i)=>{ const c=lineCalc(l); return `<tr>
      <td><select onchange="abmSetLine(${i},'type',this.value)">${opt(["",...ITEM_TYPES], l.type)}</select></td>
      <td><select onchange="abmPickProduct(${i},this.value)"><option value="">— Custom —</option>${prods.map(p=>`<option value="${p.id}" ${l.productId===p.id?"selected":""}>${e(p.name)}</option>`).join("")}</select>
          <input placeholder="Description" value="${e(l.description)}" oninput="abmSetLine(${i},'description',this.value,true)"></td>
      <td><input type="number" min="0" step="any" style="width:70px" value="${l.qty}" oninput="abmSetLine(${i},'qty',this.value)"></td>
      <td><input type="number" min="0" step="any" style="width:100px" value="${l.price}" oninput="abmSetLine(${i},'price',this.value)"></td>
      <td><input type="number" min="0" max="100" step="any" style="width:60px" value="${l.discount}" oninput="abmSetLine(${i},'discount',this.value)"></td>
      <td><select onchange="abmSetLine(${i},'tax',this.value)">${opt(TAX_RATES, l.tax)}</select></td>
      <td style="text-align:right;white-space:nowrap">${money(c.total,cur)}</td>
      <td><button class="btn btn-sm" type="button" onclick="abmDelLine(${i})">✕</button></td>
    </tr>`; }).join("");
    const t = totals(lines);
    document.getElementById("abmTotals").innerHTML =
      `Sub-total ${money(t.sub,cur)} · Discount ${money(t.disc,cur)} · Taxable ${money(t.net,cur)} · VAT ${money(t.vat,cur)} · <b>Total ${money(t.total,cur)}</b>`;
    const amt = document.getElementById("f_amount"); if(amt && lines.length) amt.value = t.total.toFixed(2);
  };
  window.abmSetLine = function(i,k,v,quiet){ lines[i][k]=v; if(!quiet) abmRenderLines(); else { /* keep focus */ } };
  window.abmPickProduct = function(i,pid){
    const p=(DB.products||[]).find(x=>x.id===pid); lines[i].productId=pid;
    if(p){ lines[i].description=p.name; lines[i].price=Number(p.price||0); }
    abmRenderLines();
  };
  window.abmAddLine = function(){ lines.push({type:"product",productId:"",description:"",qty:1,price:0,discount:0,tax:"16"}); abmRenderLines(); };
  window.abmDelLine = function(i){ lines.splice(i,1); abmRenderLines(); };
  window.abmContactChanged = function(){
    const ct = findContact(val('f_contact')); if(!ct) return;
    if(ct.account) document.getElementById('f_account').value = ct.account;
    if(ct.currency) document.getElementById('f_cur').value = ct.currency;
    if(ct.paymentTerms){ document.getElementById('f_terms').value = ct.paymentTerms; abmDueFromTerms(); }
    if(ct.billingAddress) document.getElementById('f_bill').value = ct.billingAddress;
    if(ct.shippingAddress) document.getElementById('f_ship').value = ct.shippingAddress;
    abmRenderLines();
  };
  window.abmDueFromTerms = function(){
    const d = val('f_invdate'), t = val('f_terms');
    if(d && t){ document.getElementById('f_due').value = addDays(d, termDays(t)); document.getElementById('f_netdays').value = termDays(t); }
  };

  window.openDealForm = function(id){
    const d = id ? findDeal(id) : null;
    const v = k => e(d && d[k] != null ? d[k] : "");
    lines = d && Array.isArray(d.items) ? d.items.map(x=>Object.assign({},x)) : [];
    const today = todayISO();
    const body = `<div class="formgrid">
      <div class="field full"><b>Deal</b></div>
      <div class="field full"><label>Deal name *</label><input id="f_name" value="${v('name')}"></div>
      <div class="field"><label>Contact / Customer</label><select id="f_contact" onchange="abmContactChanged()"><option value="">— None —</option>${DB.contacts.map(ct=>`<option value="${ct.id}" ${d&&d.contact===ct.id?"selected":""}>${e(custDisplay(ct))}${ct.companyName?" ("+e(ct.first+" "+(ct.last||""))+")":""}</option>`).join("")}</select></div>
      <div class="field"><label>Account</label><select id="f_account"><option value="">— None —</option>${DB.accounts.map(a=>`<option value="${a.id}" ${d&&d.account===a.id?"selected":""}>${e(a.name)}</option>`).join("")}</select></div>
      <div class="field"><label>Stage</label><select id="f_stage">${PIPELINE_STAGES.map(s=>`<option ${d&&d.stage===s?"selected":""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Probability (%)</label><input id="f_prob" type="number" min="0" max="100" value="${d?d.probability:20}"></div>
      <div class="field"><label>Closing date</label><input id="f_closing" type="date" value="${v('closing')}"></div>
      <div class="field"><label>Deal type</label><select id="f_type" onchange="crmAddNew(this,'dealTypes','deal type')">${crmCustList("dealTypes",["New Business","Upsell","Renewal"]).map(s=>`<option ${d&&d.type===s?"selected":""}>${s}</option>`).join("")}<option value="__add_new__">➕ Add New...</option></select></div>
      <div class="field"><label>Owner / Sales person</label><input id="f_owner" value="${d?v('owner'):e(CURRENT_USER.name)}"></div>

      <div class="field full"><b>Invoice details (as in Books)</b></div>
      <div class="field"><label>Invoice number</label><input id="f_invno" value="${d&&d.invoiceNumber?v('invoiceNumber'):nextInvoiceNo()}"></div>
      <div class="field"><label>Order number</label><input id="f_order" value="${v('orderNumber')}"></div>
      <div class="field"><label>LPO number</label><input id="f_lpo" value="${v('lpo')}"></div>
      <div class="field"><label>Invoice date</label><input id="f_invdate" type="date" value="${d&&d.invoiceDate?v('invoiceDate'):today}" onchange="abmDueFromTerms()"></div>
      <div class="field"><label>Payment terms</label><select id="f_terms" onchange="abmDueFromTerms()">${opt(["",...PAY_TERMS.map(p=>p[0])], d&&d.paymentTerms)}</select></div>
      <div class="field"><label>Net days</label><input id="f_netdays" type="number" min="0" value="${v('netDays')}"></div>
      <div class="field"><label>Due date</label><input id="f_due" type="date" value="${v('dueDate')}"></div>
      <div class="field"><label>Basis</label><select id="f_basis">${opt(BASES, (d&&d.basis)||"accrual")}</select></div>
      <div class="field"><label>Currency</label><select id="f_cur" onchange="abmRenderLines()">${opt(CURRENCIES, (d&&d.currency)||"KES")}</select></div>
      <div class="field"><label>Exchange rate (to KES)</label><input id="f_fx" type="number" step="any" min="0" value="${d&&d.exchangeRate?v('exchangeRate'):1}"></div>
      <div class="field full"><label>Billing address</label><textarea id="f_bill">${v('billingAddress')}</textarea></div>
      <div class="field full"><label>Shipping address</label><textarea id="f_ship">${v('shippingAddress')}</textarea></div>

      <div class="field full"><b>Line items</b>
        <div style="overflow:auto"><table style="width:100%;margin-top:6px">
          <thead><tr><th>Type</th><th>Item / Description</th><th>Qty</th><th>Price</th><th>Disc %</th><th>Tax</th><th>Total</th><th></th></tr></thead>
          <tbody id="abmLines"></tbody></table></div>
        <button class="btn btn-sm" type="button" style="margin-top:6px" onclick="abmAddLine()">+ Add line</button>
        <div id="abmTotals" style="margin-top:8px;font-size:13px"></div>
      </div>
      <div class="field"><label>Deal amount (auto from lines)</label><input id="f_amount" type="number" step="any" value="${d?d.amount:0}"></div>
      <div class="field"><label>Next step</label><input id="f_next" value="${v('nextStep')}"></div>
      <div class="field full"><label>Customer notes (shown on invoice)</label><textarea id="f_notes">${v('customerNotes')}</textarea></div>
      <div class="field full"><label>Terms &amp; conditions</label><textarea id="f_tnc">${v('terms')}</textarea></div>
      <div class="field full"><label>Internal description</label><textarea id="f_desc">${v('description')}</textarea></div>
    </div>`;
    openModal(d?"Edit Deal / Invoice":"New Deal / Invoice", body, ()=>{
      const name = val('f_name');
      if(!name){ toast("Deal name is required."); return false; }
      const bad = lines.find(l=>!l.description || Number(l.qty)<=0 || Number(l.price)<0);
      if(bad){ toast("Each line needs a description, quantity above 0 and a price."); return false; }
      const t = totals(lines);
      const data = {
        name, contact:val('f_contact'), account:val('f_account'), stage:val('f_stage'),
        probability:Number(val('f_prob')||0), closing:val('f_closing'), type:val('f_type'), owner:val('f_owner'),
        invoiceNumber:val('f_invno'), orderNumber:val('f_order'), lpo:val('f_lpo'), invoiceDate:val('f_invdate'),
        paymentTerms:val('f_terms'), netDays:Number(val('f_netdays')||0), dueDate:val('f_due'), basis:val('f_basis'),
        currency:val('f_cur')||"KES", exchangeRate:Number(val('f_fx')||1),
        billingAddress:val('f_bill'), shippingAddress:val('f_ship'),
        items:lines.map(l=>Object.assign({},l,{qty:Number(l.qty),price:Number(l.price),discount:Number(l.discount||0)})),
        subTotal:t.sub, discountTotal:t.disc, taxable:t.net, vat:t.vat, total:t.total,
        amount: lines.length ? Number(t.total.toFixed(2)) : Number(val('f_amount')||0),
        nextStep:val('f_next'), customerNotes:val('f_notes'), terms:val('f_tnc'), description:val('f_desc'),
        source:d?d.source:"Manual Entry", competitor:d?d.competitor:""
      };
      if(d){ Object.assign(d,data); notify(`Deal updated: ${name}`); }
      else { data.id=uid("deal"); data.created=todayISO(); DB.deals.push(data); notify(`New deal created: ${name}`); }
      save(); goTo("deal-detail", {type:'deal', id:d?d.id:data.id}); return true;
    });
    setTimeout(()=>{ if(!lines.length) abmAddLine(); else abmRenderLines(); if(!d) abmDueFromTerms(); }, 0);
  };

  const _origDetail = window.renderDealDetail;
  window.renderDealDetail = function(c){
    _origDetail(c);
    const d = findDeal(currentDetail.id); if(!d) return;
    const cur = d.currency || "KES";
    const ct = findContact(d.contact);
    const items = d.items || [];
    const panel = document.createElement("div");
    panel.className = "panel";
    panel.innerHTML = `<h3>Invoice ${e(d.invoiceNumber||"")}</h3>
      <div class="fieldsgrid">
        <div><div class="k">Customer</div><div class="v">${e(custDisplay(ct)||"—")}</div></div>
        <div><div class="k">KRA PIN</div><div class="v">${e((ct&&ct.kraPin)||"—")}</div></div>
        <div><div class="k">Invoice date</div><div class="v">${d.invoiceDate?fmtDate(d.invoiceDate):"—"}</div></div>
        <div><div class="k">Due date</div><div class="v">${d.dueDate?fmtDate(d.dueDate):"—"}</div></div>
        <div><div class="k">Terms</div><div class="v">${e(d.paymentTerms||"—")}</div></div>
        <div><div class="k">Order / LPO</div><div class="v">${e(d.orderNumber||"—")} / ${e(d.lpo||"—")}</div></div>
        <div><div class="k">Currency</div><div class="v">${e(cur)} @ ${d.exchangeRate||1}</div></div>
        <div><div class="k">Basis</div><div class="v">${e(d.basis||"accrual")}</div></div>
      </div>
      ${items.length?`<div class="tablewrap" style="margin-top:10px"><table>
        <thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Price</th><th>Disc %</th><th>Tax</th><th style="text-align:right">Total</th></tr></thead>
        <tbody>${items.map(l=>`<tr><td>${e(l.description)}</td><td>${e(l.type||"")}</td><td>${l.qty}</td><td>${money(l.price,cur)}</td><td>${l.discount||0}</td><td>${l.tax==="exempt"?"Exempt":l.tax+"%"}</td><td style="text-align:right">${money(lineCalc(l).total,cur)}</td></tr>`).join("")}</tbody>
      </table></div>
      <div style="text-align:right;margin-top:8px;font-size:13px">Sub-total ${money(d.subTotal,cur)} · Discount ${money(d.discountTotal,cur)} · VAT ${money(d.vat,cur)} · <b>Total ${money(d.total,cur)}</b></div>`:`<div class="empty">No line items yet — edit the deal to add them.</div>`}
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-sm" onclick="abmExportInvoice('${d.id}','json')">Export invoice to Books (JSON)</button>
        <button class="btn btn-sm" onclick="abmExportInvoice('${d.id}','csv')">Export invoice (CSV)</button>
      </div>`;
    c.appendChild(panel);
  };

  function toBooksInvoice(d){
    const ct = findContact(d.contact) || {};
    return {
      invoiceNumber:d.invoiceNumber||"", customer:custDisplay(ct), customerKraPin:ct.kraPin||"",
      customerEmail:ct.email||"", invoiceDate:d.invoiceDate||"", dueDate:d.dueDate||"", netDays:d.netDays||0,
      paymentTerms:d.paymentTerms||"", orderNumber:d.orderNumber||"", lpo:d.lpo||"", basis:d.basis||"accrual",
      currency:d.currency||"KES", exchangeRate:d.exchangeRate||1, salesPerson:d.owner||"",
      billingAddress:d.billingAddress||"", shippingAddress:d.shippingAddress||"",
      items:(d.items||[]).map(l=>({itemType:l.type, product:l.description, qty:l.qty, price:l.price, discount:l.discount||0, tax:l.tax, total:Number(lineCalc(l).total.toFixed(2))})),
      subTotal:d.subTotal||0, discount:d.discountTotal||0, vat:d.vat||0, total:d.total||d.amount||0,
      notes:d.customerNotes||"", terms:d.terms||"", status:d.stage==="Closed Won"?"Unpaid":"Draft", crmDealId:d.id
    };
  }

  function download(name, text, type){
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([text],{type})); a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }
  function toCsv(rows){
    if(!rows.length) return "";
    const keys = Object.keys(rows[0]);
    const q = x => { const s = typeof x==="object" ? JSON.stringify(x) : String(x==null?"":x); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; };
    return [keys.join(","), ...rows.map(r=>keys.map(k=>q(r[k])).join(","))].join("\n");
  }
  window.abmExportCustomers = function(fmt){
    const rows = scopeOwn(DB.contacts).map(toBooksCustomer);
    if(!rows.length){ toast("No contacts to export."); return; }
    fmt==="csv" ? download("books-customers.csv", toCsv(rows), "text/csv") : download("books-customers.json", JSON.stringify(rows,null,2), "application/json");
  };
  window.abmExportInvoice = function(id, fmt){
    const d = findDeal(id); if(!d) return;
    const inv = toBooksInvoice(d);
    if(fmt==="csv"){
      const flat = (inv.items.length?inv.items:[{}]).map(l=>Object.assign({}, inv, {items:undefined}, l));
      flat.forEach(r=>delete r.items);
      download(`${inv.invoiceNumber||"invoice"}.csv`, toCsv(flat), "text/csv");
    } else download(`${inv.invoiceNumber||"invoice"}.json`, JSON.stringify(inv,null,2), "application/json");
  };
})();
