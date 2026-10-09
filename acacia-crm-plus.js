/* =========================================================
   ACACIA BOOKS CRM — PLUS
   Loaded after script.js. Adds:
   1. My Day  – overdue, due today, follow-ups, closing soon, stale deals
   2. Quick contact – Call / WhatsApp / Email buttons on lead, account, deal
   3. Notes + tags on leads, accounts and deals
   4. Lost-reason capture when a deal is marked Closed Lost
   5. Insights – win rate, sales cycle, loss reasons, source conversion, leaderboard
   6. Data Quality – find and merge duplicate leads, contacts and accounts
   ========================================================= */
(function(){
  "use strict";

  /* ---------- helpers ---------- */
  const E = s => (typeof esc==="function") ? esc(s) : String(s==null?"":s);
  const digits = s => String(s||"").replace(/\D/g,"");
  function waNumber(p){
    let raw = String(p||"").trim(); if(!raw) return "";
    const plus = raw.startsWith("+");
    let d = digits(raw);
    if(!d) return "";
    if(plus) return d;
    if(d.startsWith("00")) return d.slice(2);
    if(d.startsWith("0")) return "254"+d.slice(1);
    if(d.length===9) return "254"+d;
    return d;
  }
  function daysBetween(aISO, bISO){
    const a = new Date(aISO+"T00:00:00"), b = new Date(bISO+"T00:00:00");
    return Math.round((b-a)/86400000);
  }
  function addDays(iso, n){ const d=new Date(iso+"T00:00:00"); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }
  function ensure(){ if(!DB) return; DB.notes = DB.notes||[]; DB.tags = DB.tags||{}; }
  const isOpenDeal = d => d.stage!=="Closed Won" && d.stage!=="Closed Lost";
  const canEdit = type => canManage(type);

  /* ---------- navigation ---------- */
  const first = NAV[0];
  if(first && !first.items.some(i=>i.id==="myday")) first.items.push({id:"myday", label:"My Day"});
  const rep = NAV.find(s=>s.group==="Reports");
  if(rep && !rep.items.some(i=>i.id==="insights")) rep.items.push({id:"insights", label:"Insights"});
  const st = NAV.find(s=>s.group==="Settings");
  if(st && !st.items.some(i=>i.id==="dataquality")){
    const idx = st.items.findIndex(i=>i.id==="settings");
    st.items.splice(idx<0?st.items.length:idx+1, 0, {id:"dataquality", label:"Data Quality"});
  }
  Object.keys(ROLE_NAV).forEach(r=>{
    const l = ROLE_NAV[r];
    if(!l.includes("myday")) l.push("myday");
    if((r==="Sales Manager"||r==="Marketing") && !l.includes("insights")) l.push("insights");
    if(r==="Sales Manager" && !l.includes("dataquality")) l.push("dataquality");
  });
  if(typeof PALETTE_PAGES!=="undefined"){
    [["myday","My Day"],["insights","Insights"],["dataquality","Data Quality"]].forEach(p=>{
      if(!PALETTE_PAGES.some(x=>x[0]===p[0])) PALETTE_PAGES.push(p);
    });
  }

  /* ---------- MY DAY ---------- */
  function lastTouch(d){
    let best = d.created||"";
    DB.timeline.forEach(t=>{ if((t.entity===d.id||(d.account&&t.entity===d.account)) && t.date>best) best=t.date; });
    DB.activities.forEach(a=>{ if(a.related===d.id && a.due && a.due<=todayISO() && a.due>best) best=a.due; });
    (DB.notes||[]).forEach(n=>{ if(n.entity===d.id && n.date.slice(0,10)>best) best=n.date.slice(0,10); });
    return best;
  }
  function renderMyDay(c){
    ensure();
    const t = todayISO(), soon = addDays(t,7);
    const acts = scopeOwn(DB.activities).filter(a=>!a.done);
    const overdue = acts.filter(a=>a.due<t).sort((a,b)=>a.due.localeCompare(b.due));
    const today = acts.filter(a=>a.due===t);
    const upcoming = acts.filter(a=>a.due>t && a.due<=soon).sort((a,b)=>a.due.localeCompare(b.due));
    const fu = scopeOwn(DB.leads).filter(l=>l.nextFollowup && l.nextFollowup<=t && l.status!=="Converted" && l.status!=="Lost" && l.status!=="Unqualified")
              .sort((a,b)=>a.nextFollowup.localeCompare(b.nextFollowup));
    const open = scopeOwn(DB.deals).filter(isOpenDeal);
    const closing = open.filter(d=>d.closing && d.closing<=soon).sort((a,b)=>a.closing.localeCompare(b.closing));
    const stale = open.map(d=>({d, idle:daysBetween(lastTouch(d), t)})).filter(x=>x.idle>=14).sort((a,b)=>b.idle-a.idle);
    const actRow = a=>{
      const od = a.due<t;
      return `<div class="checklist-item">
        <input type="checkbox" onchange="toggleActivity('${a.id}')" ${canEdit('activities')?'':'disabled'}>
        <div class="cltext"><b>${E(a.kind)}</b> · ${E(a.title)} <span style="color:var(--ink-soft);font-size:11.5px;">(${E(a.owner)})</span></div>
        <span class="cltag ${od?'overdue':''}">${od?'Overdue · ':''}${fmtDate(a.due)}</span></div>`;
    };
    const block = (title, count, body, empty)=>`<div class="panel"><h3>${title} <span class="count">(${count})</span></h3>${count? body : `<div class="empty">${empty}</div>`}</div>`;
    c.innerHTML = `
      <div class="pageheader"><div><h1>My Day</h1><div class="sub">${fmtDate(t)} · ${overdue.length} overdue · ${today.length} due today · ${fu.length} lead follow-ups</div></div></div>
      <div class="kpi-row">
        <div class="kpi"><div class="label">Overdue</div><div class="value" style="color:${overdue.length?'var(--bad)':'inherit'}">${overdue.length}</div></div>
        <div class="kpi"><div class="label">Due today</div><div class="value">${today.length}</div></div>
        <div class="kpi"><div class="label">Deals closing in 7 days</div><div class="value">${closing.length}</div></div>
        <div class="kpi"><div class="label">Stale deals (14+ days)</div><div class="value" style="color:${stale.length?'var(--warn)':'inherit'}">${stale.length}</div></div>
      </div>
      ${block("Overdue", overdue.length, overdue.map(actRow).join(""), "Nothing overdue. Nice.")}
      ${block("Due today", today.length, today.map(actRow).join(""), "No tasks, calls or meetings due today.")}
      ${block("Leads to follow up", fu.length, fu.map(l=>`<div class="listrow" style="cursor:pointer" onclick="goTo('lead-detail',{type:'lead',id:'${l.id}'})"><div class="main"><div class="title rowlink">${E(l.name)} · ${E(l.company)}</div><div class="meta">${E(l.status)} · follow-up ${fmtDate(l.nextFollowup)}${l.nextFollowup<t?' (late)':''}</div></div></div>`).join(""), "No leads waiting for a follow-up.")}
      ${block("Deals closing within 7 days", closing.length, closing.map(d=>`<div class="listrow" style="cursor:pointer" onclick="goTo('deal-detail',{type:'deal',id:'${d.id}'})"><div class="main"><div class="title rowlink">${E(d.name)}</div><div class="meta">${fmtMoney(d.amount)} · ${E(d.stage)} · closes ${fmtDate(d.closing)}${d.closing<t?' (past due date)':''}</div></div></div>`).join(""), "No deals due to close this week.")}
      ${block("Stale deals", stale.length, stale.map(x=>`<div class="listrow" style="cursor:pointer" onclick="goTo('deal-detail',{type:'deal',id:'${x.d.id}'})"><div class="main"><div class="title rowlink">${E(x.d.name)}</div><div class="meta">${fmtMoney(x.d.amount)} · ${E(x.d.stage)} · no activity for ${x.idle} days</div></div></div>`).join(""), "Every open deal has had recent activity.")}
      ${block("Coming up this week", upcoming.length, upcoming.map(actRow).join(""), "Nothing scheduled for the next 7 days.")}
    `;
  }

  /* ---------- QUICK CONTACT + NOTES + TAGS ---------- */
  function currentEntity(){
    if(!currentDetail) return null;
    if(currentView==="lead-detail"){
      const l = findLead(currentDetail.id); if(!l) return null;
      return {type:"lead", id:l.id, name:l.name, phones:[l.mobile,l.phone], email:l.email, perm:"leads", greet:(l.name||"").split(" ")[0], rec:l};
    }
    if(currentView==="account-detail"){
      const a = findAccount(currentDetail.id); if(!a) return null;
      return {type:"account", id:a.id, name:a.name, phones:[a.phone], email:a.email, perm:"accounts", greet:a.name, rec:a};
    }
    if(currentView==="deal-detail"){
      const d = findDeal(currentDetail.id); if(!d) return null;
      const ct = findContact(d.contact), ac = findAccount(d.account);
      return {type:"deal", id:d.id, name:d.name, phones:[ct&&ct.mobile, ct&&ct.phone, ac&&ac.phone], email:(ct&&ct.email)||(ac&&ac.email),
              perm:"deals", greet:ct?ct.first:(ac?ac.name:""), rec:d, account:d.account};
    }
    return null;
  }
  function quickBar(en){
    const phone = (en.phones.find(p=>digits(p).length>=7)||"");
    const wa = waNumber(phone);
    const me = (CURRENT_USER&&CURRENT_USER.name)||"", co = (CURRENT_USER&&CURRENT_USER.company)||"";
    const msg = `Hello ${en.greet||""}, this is ${me}${co?" from "+co:""}. `;
    const btn = (href, icon, label, kind, target)=> href
      ? `<a class="btn btn-sm crm-q" href="${href}" ${target?'target="_blank" rel="noopener"':''} onclick="crmPlusLog('${kind}')">${icon} ${label}</a>`
      : `<span class="btn btn-sm crm-q off" title="Nothing on file">${icon} ${label}</span>`;
    return `<div class="crm-quickbar" id="crmQuickBar">
      ${btn(phone?"tel:"+String(phone).replace(/[^\d+]/g,""):"", "📞", "Call", "call")}
      ${btn(wa?`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`:"", "💬", "WhatsApp", "whatsapp", true)}
      ${btn(en.email?`mailto:${encodeURIComponent(en.email).replace(/%40/g,"@")}`:"", "✉️", "Email", "email")}
      <span class="crm-tags" id="crmTags"></span>
    </div>`;
  }
  window.crmPlusLog = function(kind){
    const en = currentEntity(); if(!en) return;
    const label = {call:"Call started", whatsapp:"WhatsApp chat opened", email:"Email started"}[kind];
    addTimeline(en.account||en.id, (en.account?"account":en.type), `${label} with ${en.name} (by ${(CURRENT_USER&&CURRENT_USER.name)||"user"})`);
    if(en.type==="lead") en.rec.lastContacted = todayISO();
    save();
  };

  function tagsOf(id){ ensure(); return DB.tags[id]||[]; }
  function paintTags(en){
    const box = document.getElementById("crmTags"); if(!box) return;
    const list = tagsOf(en.id), ed = canEdit(en.perm);
    box.innerHTML = list.map((t,i)=>`<span class="crm-tag">${E(t)}${ed?`<b onclick="crmPlusTag('rm',${i})" title="Remove">×</b>`:""}</span>`).join("")
      + (ed?`<span class="crm-tag add" onclick="crmPlusTag('add')">＋ Tag</span>`:"");
  }
  window.crmPlusTag = function(op, i){
    const en = currentEntity(); if(!en||!canEdit(en.perm)) return; ensure();
    const arr = DB.tags[en.id] = DB.tags[en.id]||[];
    if(op==="add"){
      const v = (window.prompt("New tag (e.g. VIP, Wholesale, Follow-up call):","")||"").trim().slice(0,24);
      if(!v) return;
      if(!arr.some(t=>t.toLowerCase()===v.toLowerCase())) arr.push(v);
    } else if(op==="rm"){ arr.splice(i,1); if(!arr.length) delete DB.tags[en.id]; }
    save(); paintTags(en);
  };

  function notesPanel(en){
    ensure();
    const list = DB.notes.filter(n=>n.entity===en.id).sort((a,b)=>b.date.localeCompare(a.date));
    const ed = canEdit(en.perm);
    return `<div class="panel" id="crmNotes"><h3>Notes <span class="count">(${list.length})</span></h3>
      ${ed?`<div class="crm-noteadd"><textarea id="crmNoteText" rows="2" placeholder="Write a note: what was said, what was agreed..."></textarea><button class="btn btn-primary btn-sm" onclick="crmPlusAddNote()">Add note</button></div>`:""}
      ${list.length? list.map(n=>`<div class="crm-note"><div class="crm-notemeta"><b>${E(n.by)}</b> · ${new Date(n.date).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
        ${(isAdmin()||n.by===(CURRENT_USER&&CURRENT_USER.name))&&ed?`<span class="crm-notedel" onclick="crmPlusDelNote('${n.id}')">Delete</span>`:""}</div>
        <div>${E(n.text).replace(/\n/g,"<br>")}</div></div>`).join("") : `<div class="empty">No notes yet.</div>`}
    </div>`;
  }
  window.crmPlusAddNote = function(){
    const en = currentEntity(); if(!en||!canEdit(en.perm)) return; ensure();
    const el = document.getElementById("crmNoteText"); const text = (el&&el.value||"").trim();
    if(!text){ toast("Write something first."); return; }
    DB.notes.push({id:uid("note"), entity:en.id, text, by:(CURRENT_USER&&CURRENT_USER.name)||"User", date:new Date().toISOString()});
    save(); renderView(); toast("Note added.");
  };
  window.crmPlusDelNote = function(id){
    if(!confirm("Delete this note?")) return; ensure();
    DB.notes = DB.notes.filter(n=>n.id!==id); save(); renderView();
  };

  function lostPanel(en){
    if(en.type!=="deal" || en.rec.stage!=="Closed Lost") return "";
    const d = en.rec;
    return `<div class="panel"><h3>Why this deal was lost</h3><div class="fieldsgrid">
      <div><div class="k">Reason</div><div class="v">${E(d.lostReason||"Not recorded")}</div></div>
      <div><div class="k">Lost to</div><div class="v">${E(d.competitor||"—")}</div></div>
      <div><div class="k">Closed</div><div class="v">${d.closedDate?fmtDate(d.closedDate):"—"}</div></div></div></div>`;
  }

  /* ---------- LOST REASON ---------- */
  const LOSS_DEFAULTS = ["Price too high","Chose a competitor","No budget","No response","Timing not right","Product did not fit","Went with in-house solution"];
  const _updateDealStage = updateDealStage;
  updateDealStage = function(id, stage){
    const d = findDeal(id);
    if(!d) return _updateDealStage(id, stage);
    const prev = d.stage;
    const finish = ()=>{
      _updateDealStage(id, stage);
      if(stage==="Closed Won"||stage==="Closed Lost"){ d.closedDate = todayISO(); }
      else if(prev==="Closed Won"||prev==="Closed Lost"){ delete d.closedDate; delete d.lostReason; }
      save(); renderView();
    };
    if(stage!=="Closed Lost" || prev==="Closed Lost"){ finish(); return; }
    const body = `<div class="formgrid">
      <div class="field full"><label>Why was this deal lost?</label>
        <select id="f_lostreason" onchange="crmAddNew(this,'lossReasons','loss reason')">${crmCustList("lossReasons",LOSS_DEFAULTS).map(s=>`<option>${E(s)}</option>`).join("")}<option value="__add_new__">➕ Add New...</option></select></div>
      <div class="field full"><label>Lost to (competitor, optional)</label><input id="f_lostto" value="${E(d.competitor||"")}"></div>
    </div>`;
    openModal("Mark deal as lost: "+E(d.name), body, ()=>{
      d.lostReason = val("f_lostreason"); const lt = val("f_lostto"); if(lt) d.competitor = lt;
      finish(); return true;
    }, "Mark as lost");
    renderView(); // snap any dragged card back until confirmed
  };

  /* ---------- INSIGHTS ---------- */
  function bars(rows, fmt){
    const max = Math.max(1, ...rows.map(r=>r.v));
    return rows.length ? rows.map(r=>`<div class="crm-bar"><div class="crm-barlabel">${E(r.k)}</div><div class="crm-bartrack"><div class="crm-barfill" style="width:${Math.max(2,Math.round(r.v/max*100))}%"></div></div><div class="crm-barval">${fmt?fmt(r.v):r.v}</div></div>`).join("") : `<div class="empty">No data yet.</div>`;
  }
  function renderInsights(c){
    ensure();
    const deals = scopeOwn(DB.deals), leads = scopeOwn(DB.leads);
    const won = deals.filter(d=>d.stage==="Closed Won"), lost = deals.filter(d=>d.stage==="Closed Lost"), open = deals.filter(isOpenDeal);
    const closedN = won.length+lost.length;
    const winRate = closedN? Math.round(won.length/closedN*100) : 0;
    const avgWon = won.length? Math.round(won.reduce((s,d)=>s+Number(d.amount||0),0)/won.length) : 0;
    const cycles = won.map(d=>daysBetween(d.created, d.closedDate||d.closing||d.created)).filter(n=>n>=0);
    const avgCycle = cycles.length? Math.round(cycles.reduce((a,b)=>a+b,0)/cycles.length) : 0;
    const weighted = open.reduce((s,d)=>s+Number(d.amount||0)*Number(d.probability||0)/100,0);
    const convRate = leads.length? Math.round(leads.filter(l=>l.status==="Converted").length/leads.length*100) : 0;

    const reasons = {}; lost.forEach(d=>{ const k=d.lostReason||"Not recorded"; reasons[k]=(reasons[k]||0)+1; });
    const reasonRows = Object.keys(reasons).map(k=>({k, v:reasons[k]})).sort((a,b)=>b.v-a.v);

    const src = {}; leads.forEach(l=>{ const k=l.source||"Unknown"; src[k]=src[k]||{n:0,c:0}; src[k].n++; if(l.status==="Converted") src[k].c++; });
    const srcRows = Object.keys(src).map(k=>({k:`${k} (${src[k].c}/${src[k].n})`, v:Math.round(src[k].c/src[k].n*100)})).sort((a,b)=>b.v-a.v);

    const reps = {}; won.forEach(d=>{ const k=d.owner||"Unassigned"; reps[k]=(reps[k]||0)+Number(d.amount||0); });
    const repRows = Object.keys(reps).map(k=>({k, v:reps[k]})).sort((a,b)=>b.v-a.v).slice(0,8);

    const stageRows = PIPELINE_STAGES.filter(s=>s!=="Closed Won"&&s!=="Closed Lost").map(s=>({k:s+" ("+open.filter(d=>d.stage===s).length+")", v:open.filter(d=>d.stage===s).reduce((a,d)=>a+Number(d.amount||0),0)}));

    const comp = {}; lost.forEach(d=>{ if(d.competitor){ comp[d.competitor]=(comp[d.competitor]||0)+1; } });
    const compRows = Object.keys(comp).map(k=>({k, v:comp[k]})).sort((a,b)=>b.v-a.v).slice(0,6);

    c.innerHTML = `
      <div class="pageheader"><div><h1>Insights</h1><div class="sub">How well the pipeline is converting${currentRole()==="Salesperson"?" (your records)":""}</div></div></div>
      <div class="kpi-row">
        <div class="kpi"><div class="label">Win rate</div><div class="value">${winRate}%</div><div class="delta">${won.length} won · ${lost.length} lost</div></div>
        <div class="kpi"><div class="label">Average won deal</div><div class="value">${fmtMoney(avgWon)}</div></div>
        <div class="kpi"><div class="label">Average sales cycle</div><div class="value">${avgCycle} days</div></div>
        <div class="kpi"><div class="label">Lead → deal conversion</div><div class="value">${convRate}%</div></div>
      </div>
      <div class="kpi-row">
        <div class="kpi"><div class="label">Open pipeline</div><div class="value">${fmtMoney(open.reduce((s,d)=>s+Number(d.amount||0),0))}</div></div>
        <div class="kpi"><div class="label">Weighted by probability</div><div class="value">${fmtMoney(Math.round(weighted))}</div></div>
        <div class="kpi"><div class="label">Revenue won</div><div class="value">${fmtMoney(won.reduce((s,d)=>s+Number(d.amount||0),0))}</div></div>
        <div class="kpi"><div class="label">Revenue lost</div><div class="value">${fmtMoney(lost.reduce((s,d)=>s+Number(d.amount||0),0))}</div></div>
      </div>
      <div class="crm-twocol">
        <div class="panel"><h3>Open pipeline by stage</h3>${bars(stageRows, fmtMoney)}</div>
        <div class="panel"><h3>Why deals are lost</h3>${bars(reasonRows)}</div>
        <div class="panel"><h3>Lead source conversion</h3>${bars(srcRows, v=>v+"%")}</div>
        <div class="panel"><h3>Top performers (won revenue)</h3>${bars(repRows, fmtMoney)}</div>
        <div class="panel"><h3>Competitors we lose to</h3>${bars(compRows)}</div>
      </div>`;
  }

  /* ---------- DATA QUALITY (duplicates) ---------- */
  const norm = s => String(s||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  function groupBy(list, keyFns){
    const used = new Set(), groups = [];
    keyFns.forEach(kf=>{
      const m = {};
      list.forEach(r=>{ const k = kf(r); if(k) (m[k]=m[k]||[]).push(r); });
      Object.keys(m).forEach(k=>{
        const g = m[k].filter(r=>!used.has(r.id));
        if(g.length>1){ g.forEach(r=>used.add(r.id)); groups.push({why:k, rows:g}); }
      });
    });
    return groups;
  }
  const phoneKey = p => { const d = digits(p); return d.length>=9 ? "phone "+d.slice(-9) : ""; };
  function findDupes(){
    return {
      leads: groupBy(DB.leads.filter(l=>l.status!=="Converted"), [r=>r.email?"email "+r.email.toLowerCase().trim():"", r=>phoneKey(r.mobile||r.phone), r=>(norm(r.name)&&norm(r.company))?"name+company "+norm(r.name)+norm(r.company):""]),
      contacts: groupBy(DB.contacts, [r=>r.email?"email "+r.email.toLowerCase().trim():"", r=>phoneKey(r.mobile||r.phone), r=>norm(r.first+r.last).length>3?"name "+norm(r.first+r.last)+"@"+(r.account||""):""]),
      accounts: groupBy(DB.accounts, [r=>norm(r.name).length>2?"name "+norm(r.name):"", r=>phoneKey(r.phone), r=>r.email?"email "+r.email.toLowerCase().trim():""])
    };
  }
  const label = {leads:r=>`${r.name} · ${r.company||""}`, contacts:r=>`${r.first} ${r.last} · ${r.email||r.phone||""}`, accounts:r=>`${r.name} · ${r.phone||r.email||""}`};
  function renderDataQuality(c){
    const dq = findDupes(), total = dq.leads.length+dq.contacts.length+dq.accounts.length;
    const section = (key, title)=>`<div class="panel"><h3>${title} <span class="count">(${dq[key].length} group${dq[key].length===1?"":"s"})</span></h3>
      ${dq[key].length? dq[key].map((g,gi)=>`<div class="crm-dupgroup"><div class="crm-dupwhy">Matched on ${E(g.why.split(" ")[0])}</div>
        ${g.rows.map((r,ri)=>`<div class="listrow"><div class="main"><div class="title">${E(label[key](r))}${ri===0?' <span class="pill status-Qualified">keep</span>':''}</div><div class="meta">Created ${fmtDate(r.created)} · ${E(r.owner||"")}</div></div></div>`).join("")}
        ${isAdmin()||currentRole()==="Sales Manager"?`<div style="margin-top:8px"><button class="btn btn-sm btn-gold" onclick="crmPlusMerge('${key}',${gi})">Merge into first record</button></div>`:""}
      </div>`).join("") : `<div class="empty">No duplicates found.</div>`}</div>`;
    c.innerHTML = `<div class="pageheader"><div><h1>Data Quality</h1><div class="sub">${total? total+" duplicate group"+(total===1?"":"s")+" to review":"Your data looks clean"}</div></div></div>
      ${section("leads","Duplicate leads")}${section("contacts","Duplicate contacts")}${section("accounts","Duplicate accounts")}`;
  }
  window.crmPlusMerge = function(key, gi){
    if(!(isAdmin()||currentRole()==="Sales Manager")) return;
    const g = findDupes()[key][gi]; if(!g) return;
    if(!confirm(`Merge ${g.rows.length} records into "${label[key](g.rows[0])}"? The others will be deleted and everything linked to them moves to the kept record. This cannot be undone.`)) return;
    ensure();
    const keep = g.rows[0], drop = g.rows.slice(1), dropIds = new Set(drop.map(r=>r.id));
    drop.forEach(r=> Object.keys(r).forEach(f=>{ if((keep[f]===undefined||keep[f]===""||keep[f]===null) && r[f]!==undefined && r[f]!=="") keep[f]=r[f]; }));
    const fix = (arr, fields)=> arr.forEach(x=> fields.forEach(f=>{ if(dropIds.has(x[f])) x[f]=keep.id; }));
    fix(DB.deals,["account","contact"]); fix(DB.contacts,["account"]); fix(DB.activities,["related"]); fix(DB.timeline,["entity"]);
    fix(DB.notes,["entity"]); if(DB.quotes) fix(DB.quotes,["account","contact","deal"]);
    drop.forEach(r=>{ const t = DB.tags[r.id]; if(t){ DB.tags[keep.id] = Array.from(new Set((DB.tags[keep.id]||[]).concat(t))); delete DB.tags[r.id]; } });
    DB[key] = DB[key].filter(r=>!dropIds.has(r.id));
    addTimeline(keep.id, key==="accounts"?"account":key.slice(0,-1), `Merged ${drop.length} duplicate record${drop.length>1?"s":""} into this one`);
    save(); toast("Merged."); renderView();
  };

  /* ---------- hook into routing ---------- */
  const _navAllowed = navAllowed;
  navAllowed = function(viewId){
    if(viewId==="myday") return true;
    return _navAllowed(viewId);
  };
  const _renderView = renderView;
  renderView = function(){
    ensure();
    const c = document.getElementById("content");
    if(currentView==="myday"){ c.innerHTML=""; return renderMyDay(c); }
    if(currentView==="insights"){ c.innerHTML=""; return renderInsights(c); }
    if(currentView==="dataquality"){ c.innerHTML=""; return renderDataQuality(c); }
    _renderView();
    const en = currentEntity(); if(!en) return;
    const hdr = c.querySelector(".detail-header");
    if(hdr){
      hdr.insertAdjacentHTML("afterend", quickBar(en)); paintTags(en);
      const lp = lostPanel(en); if(lp) c.insertAdjacentHTML("beforeend", lp);
    }
    if(currentView!=="account-detail" || (typeof accountDetailTab!=="undefined" && accountDetailTab==="overview")){
      c.insertAdjacentHTML("beforeend", notesPanel(en));
    }
  };

  /* make sure sidebar shows the new pages for the logged-in user */
  try{ if(CURRENT_USER) renderNav(); }catch(e){}
})();
