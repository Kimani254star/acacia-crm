/* ===== Public home page ===== */
/* Public home page: single-view navigation, same behaviour as the Support site */
  function hpMore(btn){
    var card=btn.closest('.hp-tier');
    var open=card.classList.toggle('hp-open');
    btn.innerHTML=open?'Show less &#9652;':'Show '+btn.getAttribute('data-n')+' more features &#9662;';
  }
  function hpBillingToggle(){
    var yearly=document.getElementById('hpBilling').checked;
    document.querySelectorAll('#homePage .hp-amt').forEach(function(el){
      var p=yearly?+el.getAttribute('data-year'):+el.getAttribute('data-month');
      el.textContent='KES '+p.toLocaleString('en-US');
      var per=el.parentElement.querySelector('.hp-per');
      if(per) per.textContent=yearly?'/yr':'/mo';
    });
  }
(function(){
  var root=document.getElementById('homePage');
  var slides=root.querySelectorAll('.hp-slide'),si=0;
  setInterval(function(){
    if(root.style.display!=='block'||slides.length<2) return;
    slides[si].classList.remove('active'); si=(si+1)%slides.length; slides[si].classList.add('active');
  },5000);
  var nav=document.getElementById('hpNav'),burger=document.getElementById('hpBurger');
  burger.addEventListener('click',function(){
    var open=nav.classList.toggle('open');
    burger.setAttribute('aria-expanded',open?'true':'false');
  });
  var pages=root.querySelectorAll('.hp-page');
  var valid={top:1,about:1,features:1,process:1,pricing:1,faq:1,contact:1};
  function show(id){
    if(!valid[id]) id='top';
    pages.forEach(function(p){p.classList.toggle('hp-active',p.getAttribute('data-page')===id);});
    root.querySelectorAll('.hp-nav a').forEach(function(a){a.classList.toggle('hp-current',a.getAttribute('href')==='#'+id);});
    nav.classList.remove('open'); burger.setAttribute('aria-expanded','false');
    root.scrollTop=0;
  }
  root.querySelectorAll('a[data-scroll]').forEach(function(a){
    a.addEventListener('click',function(e){ e.preventDefault(); show(a.getAttribute('href').slice(1)); });
  });
  var y=document.getElementById('footerYear'); if(y) y.textContent=new Date().getFullYear();
  show('top');
  window.hpShowPage=show;
})();
function hpShowHome(){
  document.getElementById('authScreen').style.display='none';
  document.getElementById('homePage').style.display='block';
  window.hpShowPage&&window.hpShowPage('top');
}
function hpHideHome(){ document.getElementById('homePage').style.display='none'; }
function hpShowLogin(tab){
  hpHideHome();
  document.getElementById('authScreen').style.display='flex';
  switchAuthTab(tab||'login');
}
function hpTheme(){ toggleTheme(); }
function hpContact(e){
  e.preventDefault();
  var n=document.getElementById('hpName').value.trim(), m=document.getElementById('hpEmail').value.trim(), t=document.getElementById('hpMsg').value.trim();
  var body='From: '+n+' <'+m+'>\n\n'+t;
  window.location.href='mailto:hello@example.com?subject='+encodeURIComponent('Acacia Books CRM enquiry')+'&body='+encodeURIComponent(body);
  document.getElementById('contactConfirm').classList.remove('hidden');
  return false;
}

/* =========================================================
   ACACIA BOOKS CRM — single-file app
   Data persists to localStorage under "acaciaCrmData"
   ========================================================= */

/* ---------- Theme (dark mode) ---------- */
const THEME_KEY = "acacia_theme";
function toggleTheme(){
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if(isDark){
    document.documentElement.removeAttribute("data-theme");
    try{ localStorage.setItem(THEME_KEY, "light"); }catch(e){}
  }else{
    document.documentElement.setAttribute("data-theme", "dark");
    try{ localStorage.setItem(THEME_KEY, "dark"); }catch(e){}
  }
}

const USERS_KEY = "acaciaCrmUsers";
const SESSION_KEY = "acaciaCrmSession";
const STORAGE_KEY = "acaciaCrmData";
const uid = (p)=> p + "_" + Math.random().toString(36).slice(2,9);
const todayISO = ()=> new Date().toISOString().slice(0,10);
const fmtDate = (iso)=> { if(!iso) return "—"; const d=new Date(iso+"T00:00:00"); return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); };
const fmtMoney = (n)=> "KSh " + Number(n||0).toLocaleString('en-KE');
const daysBetween = (a,b)=> Math.round((new Date(b)-new Date(a))/86400000);
const initials = (name)=> (name||"").split(" ").filter(Boolean).slice(0,2).map(s=>s[0].toUpperCase()).join("");

/* ---------- Blank starting dataset (no demo data) ---------- */
function seedData(){
  return {accounts: [], contacts: [], leads: [], deals: [], activities: [], timeline: [], notifications: [], nextIds:{}};
}

let DB = null;
let CURRENT_USER = null;

function dataKeyFor(companyId){ return STORAGE_KEY + "_" + companyId; }

function load(companyId){
  try{
    const raw = localStorage.getItem(dataKeyFor(companyId));
    if(raw) return JSON.parse(raw);
  }catch(e){}
  const blank = seedData();
  localStorage.setItem(dataKeyFor(companyId), JSON.stringify(blank));
  return blank;
}
function save(){
  if(!CURRENT_USER) return;
  localStorage.setItem(dataKeyFor(CURRENT_USER.companyId), JSON.stringify(DB));
}

/* ---------- Auth ---------- */
function getUsers(){
  try{ return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }catch(e){ return []; }
}
function saveUsers(list){ localStorage.setItem(USERS_KEY, JSON.stringify(list)); }
function getSession(){
  try{ return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }catch(e){ return null; }
}
function setSession(user){ localStorage.setItem(SESSION_KEY, JSON.stringify({email:user.email, companyId:user.companyId, name:user.name, company:user.company})); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

function switchAuthTab(which){
  document.getElementById('tabLoginBtn').classList.toggle('active', which==='login');
  document.getElementById('tabRegisterBtn').classList.toggle('active', which==='register');
  document.getElementById('loginPane').style.display = which==='login' ? 'block' : 'none';
  document.getElementById('registerPane').style.display = which==='register' ? 'block' : 'none';
  document.getElementById('loginError').classList.remove('show');
  document.getElementById('registerError').classList.remove('show');
}

function showAuthError(id, msg){
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.add('show');
}

function handleRegister(){
  const company = document.getElementById('regCompany').value.trim();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  if(!company || !name || !email || !password){ showAuthError('registerError','Please fill in every field.'); return; }
  if(password.length < 6){ showAuthError('registerError','Password must be at least 6 characters.'); return; }
  const users = getUsers();
  if(users.some(u=>u.email===email)){ showAuthError('registerError','An account with that email already exists.'); return; }
  const companyId = uid('co');
  const user = {companyId, company, name, email, password, role:"Administrator"};
  users.push(user);
  saveUsers(users);
  setSession(user);
  enterApp(user);
}

function handleLogin(){
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  if(!email || !password){ showAuthError('loginError','Please enter your email and password.'); return; }
  const users = getUsers();
  const user = users.find(u=>u.email===email && u.password===password);
  if(!user){ showAuthError('loginError','That email and password combination was not found.'); return; }
  setSession(user);
  enterApp(user);
}

function handleLogout(){
  clearSession();
  CURRENT_USER = null;
  DB = null;
  document.getElementById('app').classList.remove('ready');
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  switchAuthTab('login');
}

function toggleUserMenu(e){
  e.stopPropagation();
  document.getElementById('userMenuPanel').classList.toggle('open');
}

function enterApp(user){
  if(!user.role) user.role = "Administrator";
  CURRENT_USER = user;
  DB = load(user.companyId);
  document.getElementById('authScreen').style.display = 'none'; hpHideHome();
  document.getElementById('app').classList.add('ready');
  document.getElementById('userAvatar').textContent = initials(user.name) || 'U';
  document.getElementById('userNameLabel').textContent = user.name;
  document.getElementById('userRoleLabel').textContent = user.role || "Administrator";
  initApp();
}

function addTimeline(entity, entityType, text){
  DB.timeline.push({id:uid("tl"), entity, entityType, date: todayISO(), text});
}
function notify(text){
  DB.notifications.unshift({id:uid("nt"), text, time:"Just now", read:false});
  save(); renderNotifBadge();
}

/* ---------- Navigation config ---------- */
const NAV = [
  {group:null, items:[{id:"dashboard", label:"Dashboard", icon:"◆"}]},
  {group:"Leads", items:[
    {id:"leads", label:"Leads"},
    {id:"lead-sources", label:"Lead Sources"},
    {id:"lead-scoring", label:"Lead Scoring"}
  ]},
  {group:"Sales", items:[
    {id:"accounts", label:"Accounts"},
    {id:"contacts", label:"Contacts"},
    {id:"deals", label:"Deals"},
    {id:"pipeline", label:"Pipeline"},
    {id:"forecast", label:"Forecast"}
  ]},
  {group:"Activities", items:[
    {id:"tasks", label:"Tasks"},
    {id:"calls", label:"Calls"},
    {id:"meetings", label:"Meetings"},
    {id:"calendar", label:"Calendar"}
  ]},
  {group:"Reports", items:[
    {id:"reports", label:"Reports"},
    {id:"analytics", label:"Analytics"}
  ]},
  {group:"Settings", items:[
    {id:"settings", label:"Settings"}
  ]}
];

let currentView = "dashboard";
let currentDetail = null; // {type, id}

function renderNav(){
  const el = document.getElementById("navlist");
  el.innerHTML = "";
  NAV.forEach(sec=>{
    const g = document.createElement("div");
    g.className = "navgroup";
    if(sec.group){
      const lab = document.createElement("div");
      lab.className = "navgroup-label";
      lab.textContent = sec.group.toUpperCase();
      g.appendChild(lab);
    }
    sec.items.forEach(it=>{
      const d = document.createElement("div");
      d.className = "navitem" + (currentView===it.id ? " active":"");
      d.innerHTML = `<span class="dot"></span>${it.label}`;
      d.onclick = ()=>{ goTo(it.id); if(window.innerWidth<=840) document.getElementById("sidebar").classList.remove("open"); };
      g.appendChild(d);
    });
    el.appendChild(g);
  });
}

function goTo(viewId, detail){
  currentView = viewId;
  currentDetail = detail || null;
  renderNav();
  renderView();
  document.getElementById("content").scrollTop = 0;
  window.scrollTo(0,0);
}

/* ---------- Helpers to look up records ---------- */
const findLead = id => DB.leads.find(x=>x.id===id);
const findAccount = id => DB.accounts.find(x=>x.id===id);
const findContact = id => DB.contacts.find(x=>x.id===id);
const findDeal = id => DB.deals.find(x=>x.id===id);
const accountContacts = accId => DB.contacts.filter(c=>c.account===accId);
const accountDeals = accId => DB.deals.filter(d=>d.account===accId);
const scoreLabel = (n)=> n>=76?"VeryHot":n>=51?"Hot":n>=21?"Warm":"Cold";
const scoreLabelText = (n)=> n>=76?"Very Hot":n>=51?"Hot":n>=21?"Warm":"Cold";

const STAGES = ["Qualification","Needs Analysis","Value Proposition","Proposal","Needs Analysis","Negotiation","Closed Won","Closed Lost"];
const PIPELINE_STAGES = ["Qualification","Needs Analysis","Proposal","Negotiation","Closed Won","Closed Lost"];

/* =========================================================
   VIEW RENDERERS
   ========================================================= */
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

/* ---------- DASHBOARD ---------- */
function renderDashboard(c){
  const openDeals = DB.deals.filter(d=>!d.stage.startsWith("Closed"));
  const wonDeals = DB.deals.filter(d=>d.stage==="Closed Won");
  const lostDeals = DB.deals.filter(d=>d.stage==="Closed Lost");
  const pipelineValue = openDeals.reduce((s,d)=>s+Number(d.amount),0);
  const expectedRevenue = openDeals.reduce((s,d)=>s+Number(d.amount)*d.probability/100,0);
  const totalClosed = wonDeals.length+lostDeals.length;
  const convRate = totalClosed? Math.round(wonDeals.length/totalClosed*100):0;
  const dueActivities = DB.activities.filter(a=>!a.done).length;
  const newLeads = DB.leads.filter(l=>l.status==="New").length;

  const funnelData = [
    {label:"Leads", value: DB.leads.length},
    {label:"Qualified", value: DB.leads.filter(l=>["Qualified","Nurturing","Converted"].includes(l.status)).length},
    {label:"Opportunity", value: DB.deals.length},
    {label:"Deals", value: openDeals.length},
    {label:"Won", value: wonDeals.length}
  ];
  const maxFunnel = Math.max(...funnelData.map(f=>f.value),1);

  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Dashboard</h1><div class="sub">${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})} — here's where the pipeline stands.</div></div>
      <div class="actions"><button class="btn btn-primary" onclick="openLeadForm()">+ New Lead</button><button class="btn" onclick="openDealForm()">+ New Deal</button></div>
    </div>
    <div class="kpi-row">
      ${kpi("New Leads", newLeads)}
      ${kpi("Open Deals", openDeals.length)}
      ${kpi("Pipeline Value", fmtMoney(pipelineValue))}
      ${kpi("Expected Revenue", fmtMoney(Math.round(expectedRevenue)))}
      ${kpi("Deals Won", wonDeals.length)}
      ${kpi("Deals Lost", lostDeals.length)}
      ${kpi("Conversion Rate", convRate+"%")}
      ${kpi("Activities Due", dueActivities)}
    </div>
    <div class="grid-2">
      <div>
        <div class="panel">
          <h3>Sales funnel</h3>
          <div class="funnel">
            ${funnelData.map(f=>`
              <div class="funnel-row">
                <div class="funnel-label">${f.label}</div>
                <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.max(6,f.value/maxFunnel*100)}%"></div></div>
                <div class="funnel-num">${f.value}</div>
              </div>`).join("")}
          </div>
        </div>
        <div class="panel">
          <h3>Pipeline by stage</h3>
          ${PIPELINE_STAGES.map(st=>{
            const items = DB.deals.filter(d=>d.stage===st);
            const val = items.reduce((s,d)=>s+Number(d.amount),0);
            const max = Math.max(...PIPELINE_STAGES.map(s2=>DB.deals.filter(d=>d.stage===s2).reduce((s,d)=>s+Number(d.amount),0)),1);
            return `<div class="reportbar-row"><div class="reportbar-label">${st}</div><div class="reportbar-track"><div class="reportbar-fill" style="width:${Math.max(3,val/max*100)}%"></div></div><div class="reportbar-val">${fmtMoney(val)}</div></div>`;
          }).join("")}
        </div>
      </div>
      <div>
        <div class="panel">
          <h3>Today &amp; overdue tasks <span class="count">(${DB.activities.filter(a=>!a.done).length} open)</span></h3>
          ${listOrEmpty(DB.activities.filter(a=>!a.done).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,6).map(a=>`
            <div class="listrow"><div class="main"><div class="title">${a.title}</div><div class="meta">${a.kind} · Due ${fmtDate(a.due)} · ${a.owner}</div></div></div>
          `), "No open tasks — nice work.")}
        </div>
        <div class="panel">
          <h3>Recent leads</h3>
          ${listOrEmpty([...DB.leads].sort((a,b)=>b.created.localeCompare(a.created)).slice(0,5).map(l=>`
            <div class="listrow"><div class="main"><div class="title">${l.name} — ${l.company}</div><div class="meta">${l.source} · <span class="pill status-${l.status}">${l.status}</span></div></div></div>
          `), "No leads yet.")}
        </div>
        <div class="panel">
          <h3>Deals closing soon</h3>
          ${listOrEmpty([...DB.deals].filter(d=>!d.stage.startsWith("Closed")).sort((a,b)=>a.closing.localeCompare(b.closing)).slice(0,5).map(d=>`
            <div class="listrow"><div class="main"><div class="title">${d.name}</div><div class="meta">${fmtMoney(d.amount)} · ${fmtDate(d.closing)} · ${d.stage}</div></div></div>
          `), "No open deals.")}
        </div>
      </div>
    </div>
  `;
}
function kpi(label,value,delta){
  return `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>${delta?`<div class="delta ${delta.dir}">${delta.text}</div>`:""}</div>`;
}
function listOrEmpty(rows,emptyText){
  return rows.length ? rows.join("") : `<div class="empty">${emptyText}</div>`;
}

/* ---------- LEADS ---------- */
let leadFilters = {status:"", search:""};
function renderLeads(c){
  const base = scopeOwn(DB.leads);
  const rows = base.filter(l=>{
    if(leadFilters.status && l.status!==leadFilters.status) return false;
    if(leadFilters.search){
      const s = leadFilters.search.toLowerCase();
      if(!(l.name.toLowerCase().includes(s)||l.company.toLowerCase().includes(s))) return false;
    }
    return true;
  });
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Leads</h1><div class="sub">${base.length} total leads · ${base.filter(l=>l.status==="New").length} new</div></div>
      <div class="actions">${canManage('leads') ? `<button class="btn btn-primary" onclick="openLeadForm()">+ New Lead</button>` : ``}</div>
    </div>
    <div class="tabletoolbar">
      <input id="leadSearchInput" placeholder="Search name or company..." value="${leadFilters.search}" oninput="leadFilters.search=this.value;renderLeads(document.getElementById('content'))">
      <select onchange="leadFilters.status=this.value;renderLeads(document.getElementById('content'))">
        <option value="">All statuses</option>
        ${["New","Contacted","Attempted Contact","Qualified","Unqualified","Nurturing","Converted","Lost"].map(s=>`<option ${leadFilters.status===s?"selected":""}>${s}</option>`).join("")}
      </select>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Name</th><th>Company</th><th>Source</th><th>Status</th><th>Score</th><th>Owner</th><th>Next Follow-up</th><th></th></tr></thead>
        <tbody>
        ${rows.length ? rows.map(l=>`
          <tr onclick="goTo('lead-detail',{type:'lead',id:'${l.id}'})">
            <td><span class="rowlink">${l.name}</span></td>
            <td>${l.company}</td>
            <td>${l.source}</td>
            <td><span class="pill status-${l.status.replace(/ /g,'')}">${l.status}</span></td>
            <td><span class="pill score-${scoreLabel(l.score)}">${l.score} · ${scoreLabelText(l.score)}</span></td>
            <td>${l.owner}</td>
            <td>${l.nextFollowup?fmtDate(l.nextFollowup):"—"}</td>
            <td onclick="event.stopPropagation()">${canManage('leads') ? `<button class="btn btn-sm" onclick="openLeadForm('${l.id}')">Edit</button>` : ``}</td>
          </tr>
        `).join("") : `<tr><td colspan="8"><div class="empty">No leads match this filter.</div></td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderLeadDetail(c){
  const l = findLead(currentDetail.id);
  if(!l){ c.innerHTML = `<div class="empty">Lead not found.</div>`; return; }
  c.innerHTML = `
    <div class="backlink" onclick="goTo('leads')">← Back to Leads</div>
    <div class="detail-header">
      <div class="top">
        <div>
          <h2>${l.name}</h2>
          <div class="sub2">${l.title||""} at ${l.company} · <span class="pill status-${l.status.replace(/ /g,'')}">${l.status}</span> <span class="pill score-${scoreLabel(l.score)}">${scoreLabelText(l.score)} (${l.score})</span></div>
        </div>
        <div class="actions">
          <button class="btn btn-sm" onclick="openLeadForm('${l.id}')">Edit</button>
          ${l.status!=="Converted" ? `<button class="btn btn-gold btn-sm" onclick="convertLead('${l.id}')">Convert Lead</button>` : `<span class="pill status-Converted">Converted</span>`}
        </div>
      </div>
      <div class="fieldsgrid">
        <div><div class="k">Email</div><div class="v">${l.email||"—"}</div></div>
        <div><div class="k">Phone</div><div class="v">${l.phone||"—"}</div></div>
        <div><div class="k">Mobile</div><div class="v">${l.mobile||"—"}</div></div>
        <div><div class="k">Industry</div><div class="v">${l.industry||"—"}</div></div>
        <div><div class="k">Country / County</div><div class="v">${l.country||"—"} ${l.county?"/ "+l.county:""}</div></div>
        <div><div class="k">Lead Source</div><div class="v">${l.source}</div></div>
        <div><div class="k">Lead Owner</div><div class="v">${l.owner}</div></div>
        <div><div class="k">Expected Revenue</div><div class="v">${fmtMoney(l.revenue)}</div></div>
        <div><div class="k">Created</div><div class="v">${fmtDate(l.created)}</div></div>
        <div><div class="k">Last Contacted</div><div class="v">${l.lastContacted?fmtDate(l.lastContacted):"—"}</div></div>
        <div><div class="k">Next Follow-up</div><div class="v">${l.nextFollowup?fmtDate(l.nextFollowup):"—"}</div></div>
      </div>
    </div>
    <div class="panel"><h3>Activities</h3>${renderRelatedActivities(l.id)}</div>
  `;
}

function openLeadForm(id){
  const l = id ? findLead(id) : null;
  const body = `
    <div class="formgrid">
      <div class="field"><label>Full name</label><input id="f_name" value="${l?l.name:''}"></div>
      <div class="field"><label>Company</label><input id="f_company" value="${l?l.company:''}"></div>
      <div class="field"><label>Job title</label><input id="f_title" value="${l?l.title:''}"></div>
      <div class="field"><label>Industry</label><input id="f_industry" value="${l?l.industry:''}"></div>
      <div class="field"><label>Email</label><input id="f_email" value="${l?l.email:''}"></div>
      <div class="field"><label>Phone</label><input id="f_phone" value="${l?l.phone:''}"></div>
      <div class="field"><label>County</label><input id="f_county" value="${l?l.county:''}"></div>
      <div class="field"><label>Lead source</label><select id="f_source">${["Website","Google","Facebook","LinkedIn","Referral","Phone","Email","Exhibition","Advertisement","Existing Customer","Manual Entry"].map(s=>`<option ${l&&l.source===s?"selected":""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Status</label><select id="f_status">${["New","Contacted","Attempted Contact","Qualified","Unqualified","Nurturing","Converted","Lost"].map(s=>`<option ${l&&l.status===s?"selected":""}>${s}</option>`).join("")}</select></div>
      <div class="field"><label>Lead score (0–100)</label><input id="f_score" type="number" min="0" max="100" value="${l?l.score:20}"></div>
      <div class="field"><label>Expected revenue (KSh)</label><input id="f_revenue" type="number" value="${l?l.revenue:0}"></div>
      <div class="field"><label>Owner</label><input id="f_owner" value="${l?l.owner:CURRENT_USER.name}"></div>
      <div class="field"><label>Next follow-up</label><input id="f_next" type="date" value="${l?l.nextFollowup:''}"></div>
    </div>
  `;
  openModal(l?"Edit Lead":"New Lead", body, ()=>{
    const data = {
      name:val('f_name'), company:val('f_company'), title:val('f_title'), industry:val('f_industry'),
      email:val('f_email'), phone:val('f_phone'), mobile:val('f_phone'), website:"", county:val('f_county'), country:"Kenya",
      source:val('f_source'), status:val('f_status'), score:Number(val('f_score')||0), revenue:Number(val('f_revenue')||0),
      owner:val('f_owner'), nextFollowup:val('f_next'), lastContacted:l?l.lastContacted:""
    };
    if(!data.name){ toast("Please enter a name."); return false; }
    if(l){ Object.assign(l,data); notify(`Lead updated: ${data.name}`); }
    else { data.id = uid("lead"); data.created = todayISO(); DB.leads.push(data); notify(`New lead created: ${data.name}`); }
    save();
    goTo(l?"lead-detail":"leads", l?{type:'lead',id:l.id}:null);
    return true;
  });
}

function convertLead(id){
  const l = findLead(id);
  if(!l) return;
  openModal("Convert Lead", `
    <p style="margin-top:0;font-size:13.5px;color:var(--ink-soft);">Converting <strong>${l.name}</strong> will create an Account, a Contact, and a Deal — then mark the lead as Converted.</p>
    <div class="formgrid">
      <div class="field full"><label>Account name</label><input id="cv_account" value="${l.company}"></div>
      <div class="field full"><label>Deal name</label><input id="cv_deal" value="${l.company} — Initial Deal"></div>
      <div class="field"><label>Deal amount (KSh)</label><input id="cv_amount" type="number" value="${l.revenue}"></div>
      <div class="field"><label>Deal stage</label><select id="cv_stage">${["Qualification","Needs Analysis","Proposal","Negotiation"].map(s=>`<option>${s}</option>`).join("")}</select></div>
    </div>
  `, ()=>{
    const accId = uid("acc");
    const conId = uid("con");
    const dealId = uid("deal");
    const nameParts = l.name.split(" ");
    DB.accounts.push({id:accId, name:val('cv_account'), industry:l.industry, website:l.website, phone:l.phone, email:l.email, address:l.county, country:l.country, employees:"", revenue:l.revenue, owner:l.owner, type:"Prospect", status:"Active", created:todayISO()});
    DB.contacts.push({id:conId, first:nameParts[0]||l.name, last:nameParts.slice(1).join(" "), title:l.title, account:accId, email:l.email, phone:l.phone, mobile:l.mobile, department:"", owner:l.owner, source:l.source});
    DB.deals.push({id:dealId, name:val('cv_deal'), account:accId, contact:conId, owner:l.owner, amount:Number(val('cv_amount')||0), probability:20, closing:"", stage:val('cv_stage'), type:"New Business", source:l.source, competitor:"", nextStep:"", description:`Converted from lead ${l.name}.`, created:todayISO()});
    l.status = "Converted";
    addTimeline(accId,"account", `Lead converted from ${l.name}`);
    notify(`Lead converted: ${l.name} → Account, Contact & Deal created`);
    save();
    goTo("account-detail", {type:'account', id:accId});
    return true;
  }, "Convert");
}

/* ---------- LEAD SOURCES / SCORING (informational modules) ---------- */
function renderLeadSources(c){
  const sources = {};
  DB.leads.forEach(l=> sources[l.source] = (sources[l.source]||0)+1 );
  const max = Math.max(...Object.values(sources),1);
  c.innerHTML = `
    <div class="pageheader"><div><h1>Lead Sources</h1><div class="sub">Where your leads are coming from.</div></div></div>
    <div class="panel">
      ${Object.keys(sources).length? Object.entries(sources).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`
        <div class="reportbar-row"><div class="reportbar-label">${s}</div><div class="reportbar-track"><div class="reportbar-fill" style="width:${n/max*100}%"></div></div><div class="reportbar-val">${n}</div></div>
      `).join("") : `<div class="empty">No leads yet.</div>`}
    </div>
  `;
}
function renderLeadScoring(c){
  c.innerHTML = `
    <div class="pageheader"><div><h1>Lead Scoring</h1><div class="sub">How lead scores are weighted. Adjust when you refine your qualification criteria.</div></div></div>
    <div class="grid-2">
      <div class="panel">
        <h3>Scoring rules</h3>
        ${[["Opened email","+5"],["Clicked email","+10"],["Visited website","+10"],["Requested demo","+25"],["Completed form","+15"],["Company size > 50 staff","+10"],["No activity for 30 days","−10"]].map(r=>`
          <div class="listrow"><div class="main"><div class="title">${r[0]}</div></div><div style="font-weight:700;color:var(--forest-text)">${r[1]}</div></div>
        `).join("")}
      </div>
      <div class="panel">
        <h3>Score bands</h3>
        <div class="listrow"><div class="main"><span class="pill score-Cold">Cold</span></div><div>0–20</div></div>
        <div class="listrow"><div class="main"><span class="pill score-Warm">Warm</span></div><div>21–50</div></div>
        <div class="listrow"><div class="main"><span class="pill score-Hot">Hot</span></div><div>51–75</div></div>
        <div class="listrow"><div class="main"><span class="pill score-VeryHot">Very Hot</span></div><div>76–100</div></div>
      </div>
    </div>
  `;
}

/* ---------- ACCOUNTS ---------- */
function renderAccounts(c){
  const rows = scopeOwn(DB.accounts);
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Accounts</h1><div class="sub">${rows.length} accounts</div></div>
      <div class="actions">${canManage('accounts') ? `<button class="btn btn-primary" onclick="openAccountForm()">+ New Account</button>` : ``}</div>
    </div>
    <div class="tablewrap">
      <table>
        <thead><tr><th>Account</th><th>Industry</th><th>Owner</th><th>Type</th><th>Contacts</th><th>Open Deals</th><th>Status</th></tr></thead>
        <tbody>
        ${rows.map(a=>`
          <tr onclick="goTo('account-detail',{type:'account',id:'${a.id}'})">
            <td><span class="rowlink">${a.name}</span></td>
            <td>${a.industry||"—"}</td>
            <td>${a.owner}</td>
            <td>${a.type}</td>
            <td>${accountContacts(a.id).length}</td>
            <td>${accountDeals(a.id).filter(d=>!d.stage.startsWith("Closed")).length}</td>
            <td><span class="pill status-Qualified">${a.status}</span></td>
          </tr>
        `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

let accountDetailTab = "overview";
function renderAccountDetail(c){
  const a = findAccount(currentDetail.id);
  if(!a){ c.innerHTML=`<div class="empty">Account not found.</div>`; return; }
  const conts = accountContacts(a.id);
  const dls = accountDeals(a.id);
  const tls = DB.timeline.filter(t=>t.entity===a.id || dls.some(d=>d.id===t.entity)).sort((x,y)=>y.date.localeCompare(x.date));
  const tabs = ["overview","contacts","deals","activities","timeline"];
  c.innerHTML = `
    <div class="backlink" onclick="goTo('accounts')">← Back to Accounts</div>
    <div class="detail-header">
      <div class="top">
        <div><h2>${a.name}</h2><div class="sub2">${a.industry||"—"} · ${a.country||""} · Owner: ${a.owner}</div></div>
        <div class="actions">${canManage('accounts') ? `<button class="btn btn-sm" onclick="openAccountForm('${a.id}')">Edit</button>` : ``}</div>
      </div>
    </div>
    <div class="tabs">${tabs.map(t=>`<div class="tab ${accountDetailTab===t?'active':''}" onclick="accountDetailTab='${t}';renderView()">${t.charAt(0).toUpperCase()+t.slice(1)}</div>`).join("")}</div>
    <div id="accTabBody"></div>
  `;
  const body = document.getElementById("accTabBody");
  if(accountDetailTab==="overview"){
    body.innerHTML = `<div class="panel"><h3>Account profile</h3><div class="fieldsgrid">
      <div><div class="k">Website</div><div class="v">${a.website||"—"}</div></div>
      <div><div class="k">Phone</div><div class="v">${a.phone||"—"}</div></div>
      <div><div class="k">Email</div><div class="v">${a.email||"—"}</div></div>
      <div><div class="k">Address</div><div class="v">${a.address||"—"}</div></div>
      <div><div class="k">Employees</div><div class="v">${a.employees||"—"}</div></div>
      <div><div class="k">Annual Revenue</div><div class="v">${fmtMoney(a.revenue)}</div></div>
      <div><div class="k">Account Type</div><div class="v">${a.type}</div></div>
      <div><div class="k">Status</div><div class="v">${a.status}</div></div>
      <div><div class="k">Created</div><div class="v">${fmtDate(a.created)}</div></div>
    </div></div>`;
  } else if(accountDetailTab==="contacts"){
    body.innerHTML = `<div class="panel"><h3>Contacts <span class="count">(${conts.length})</span></h3>
      ${listOrEmpty(conts.map(ct=>`<div class="listrow"><div class="avatarsm">${initials(ct.first+' '+ct.last)}</div><div class="main"><div class="title">${ct.first} ${ct.last} — ${ct.title}</div><div class="meta">${ct.email} · ${ct.phone}</div></div></div>`),"No contacts linked yet.")}
    </div>`;
  } else if(accountDetailTab==="deals"){
    body.innerHTML = `<div class="panel"><h3>Deals <span class="count">(${dls.length})</span></h3>
      ${listOrEmpty(dls.map(d=>`<div class="listrow" style="cursor:pointer" onclick="goTo('deal-detail',{type:'deal',id:'${d.id}'})"><div class="main"><div class="title rowlink">${d.name}</div><div class="meta">${fmtMoney(d.amount)} · ${d.stage}</div></div></div>`),"No deals yet.")}
    </div>`;
  } else if(accountDetailTab==="activities"){
    body.innerHTML = `<div class="panel"><h3>Activities</h3>${renderRelatedActivities(a.id)}</div>`;
  } else if(accountDetailTab==="timeline"){
    body.innerHTML = `<div class="panel"><h3>Customer timeline</h3><div class="timeline">
      ${tls.length? tls.map(t=>`<div class="tl-item"><div class="tl-date">${fmtDate(t.date)}</div><div class="tl-text">${t.text}</div></div>`).join("") : `<div class="empty">No timeline events yet.</div>`}
    </div></div>`;
  }
}

function openAccountForm(id){
  const a = id?findAccount(id):null;
  const body = `<div class="formgrid">
    <div class="field full"><label>Company name</label><input id="f_name" value="${a?a.name:''}"></div>
    <div class="field"><label>Industry</label><input id="f_industry" value="${a?a.industry:''}"></div>
    <div class="field"><label>Website</label><input id="f_website" value="${a?a.website:''}"></div>
    <div class="field"><label>Phone</label><input id="f_phone" value="${a?a.phone:''}"></div>
    <div class="field"><label>Email</label><input id="f_email" value="${a?a.email:''}"></div>
    <div class="field"><label>Address</label><input id="f_address" value="${a?a.address:''}"></div>
    <div class="field"><label>Employees</label><input id="f_employees" value="${a?a.employees:''}"></div>
    <div class="field"><label>Annual revenue (KSh)</label><input id="f_revenue" type="number" value="${a?a.revenue:0}"></div>
    <div class="field"><label>Owner</label><input id="f_owner" value="${a?a.owner:CURRENT_USER.name}"></div>
    <div class="field"><label>Account type</label><select id="f_type">${["Prospect","Customer","Partner"].map(s=>`<option ${a&&a.type===s?"selected":""}>${s}</option>`).join("")}</select></div>
  </div>`;
  openModal(a?"Edit Account":"New Account", body, ()=>{
    const data = {name:val('f_name'), industry:val('f_industry'), website:val('f_website'), phone:val('f_phone'), email:val('f_email'), address:val('f_address'), country:"Kenya", employees:val('f_employees'), revenue:Number(val('f_revenue')||0), owner:val('f_owner'), type:val('f_type'), status:"Active"};
    if(!data.name){ toast("Company name is required."); return false; }
    if(a){ Object.assign(a,data); notify(`Account updated: ${data.name}`); }
    else { data.id=uid("acc"); data.created=todayISO(); DB.accounts.push(data); notify(`New account created: ${data.name}`); }
    save();
    goTo("account-detail", {type:'account', id:a?a.id:data.id});
    return true;
  });
}

/* ---------- CONTACTS ---------- */
function renderContacts(c){
  const rows = scopeOwn(DB.contacts);
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Contacts</h1><div class="sub">${rows.length} contacts</div></div>
      <div class="actions">${canManage('contacts') ? `<button class="btn btn-primary" onclick="openContactForm()">+ New Contact</button>` : ``}</div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Name</th><th>Title</th><th>Account</th><th>Email</th><th>Phone</th><th>Owner</th></tr></thead>
      <tbody>
      ${rows.map(ct=>{
        const acc = findAccount(ct.account);
        return `<tr onclick="${acc?`goTo('account-detail',{type:'account',id:'${acc.id}'})`:''}">
          <td><div style="display:flex;align-items:center;gap:8px;"><div class="avatarsm">${initials(ct.first+' '+ct.last)}</div>${ct.first} ${ct.last}</div></td>
          <td>${ct.title||"—"}</td>
          <td>${acc?`<span class="rowlink">${acc.name}</span>`:"—"}</td>
          <td>${ct.email||"—"}</td>
          <td>${ct.phone||"—"}</td>
          <td>${ct.owner||"—"}</td>
        </tr>`;
      }).join("")}
      </tbody>
    </table></div>
  `;
}
function openContactForm(){
  const body = `<div class="formgrid">
    <div class="field"><label>First name</label><input id="f_first"></div>
    <div class="field"><label>Last name</label><input id="f_last"></div>
    <div class="field"><label>Title</label><input id="f_title"></div>
    <div class="field"><label>Account</label><select id="f_account"><option value="">— None —</option>${DB.accounts.map(a=>`<option value="${a.id}">${a.name}</option>`).join("")}</select></div>
    <div class="field"><label>Email</label><input id="f_email"></div>
    <div class="field"><label>Phone</label><input id="f_phone"></div>
    <div class="field"><label>Department</label><input id="f_department"></div>
    <div class="field"><label>Owner</label><input id="f_owner" value="${CURRENT_USER.name}"></div>
  </div>`;
  openModal("New Contact", body, ()=>{
    const first = val('f_first');
    if(!first){ toast("First name is required."); return false; }
    DB.contacts.push({id:uid("con"), first, last:val('f_last'), title:val('f_title'), account:val('f_account'), email:val('f_email'), phone:val('f_phone'), mobile:val('f_phone'), department:val('f_department'), owner:val('f_owner'), source:"Manual Entry"});
    save(); notify(`New contact created: ${first} ${val('f_last')}`);
    goTo("contacts");
    return true;
  });
}

/* ---------- DEALS (list) ---------- */
function renderDealsList(c){
  const rows = scopeOwn(DB.deals);
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Deals</h1><div class="sub">${rows.length} deals · ${fmtMoney(rows.filter(d=>!d.stage.startsWith('Closed')).reduce((s,d)=>s+Number(d.amount),0))} open pipeline</div></div>
      <div class="actions"><button class="btn" onclick="goTo('pipeline')">View pipeline</button>${canManage('deals') ? `<button class="btn btn-primary" onclick="openDealForm()">+ New Deal</button>` : ``}</div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Deal</th><th>Account</th><th>Amount</th><th>Stage</th><th>Probability</th><th>Closing</th><th>Owner</th></tr></thead>
      <tbody>
      ${rows.map(d=>{
        const acc = findAccount(d.account);
        return `<tr onclick="goTo('deal-detail',{type:'deal',id:'${d.id}'})">
          <td><span class="rowlink">${d.name}</span></td>
          <td>${acc?acc.name:"—"}</td>
          <td>${fmtMoney(d.amount)}</td>
          <td><span class="pill status-Qualified">${d.stage}</span></td>
          <td>${d.probability}%</td>
          <td>${d.closing?fmtDate(d.closing):"—"}</td>
          <td>${d.owner}</td>
        </tr>`;
      }).join("")}
      </tbody>
    </table></div>
  `;
}

function renderDealDetail(c){
  const d = findDeal(currentDetail.id);
  if(!d){ c.innerHTML=`<div class="empty">Deal not found.</div>`; return; }
  const acc = findAccount(d.account);
  const cont = findContact(d.contact);
  c.innerHTML = `
    <div class="backlink" onclick="goTo('deals')">← Back to Deals</div>
    <div class="detail-header">
      <div class="top">
        <div><h2>${d.name}</h2><div class="sub2">${fmtMoney(d.amount)} · <span class="pill status-Qualified">${d.stage}</span> · ${d.probability}% probability</div></div>
        <div class="actions">
          <select onchange="updateDealStage('${d.id}',this.value)" class="btn btn-sm" style="border:1px solid var(--line)" ${canManage('deals')?'':'disabled'}>
            ${PIPELINE_STAGES.map(s=>`<option ${s===d.stage?"selected":""}>${s}</option>`).join("")}
          </select>
          <button class="btn btn-sm" onclick="openDealForm('${d.id}')" ${canManage('deals')?'':'disabled'}>Edit</button>
        </div>
      </div>
      <div class="fieldsgrid">
        <div><div class="k">Account</div><div class="v">${acc?`<span class="rowlink" onclick="goTo('account-detail',{type:'account',id:'${acc.id}'})">${acc.name}</span>`:"—"}</div></div>
        <div><div class="k">Contact</div><div class="v">${cont?cont.first+' '+cont.last:"—"}</div></div>
        <div><div class="k">Owner</div><div class="v">${d.owner}</div></div>
        <div><div class="k">Closing Date</div><div class="v">${d.closing?fmtDate(d.closing):"—"}</div></div>
        <div><div class="k">Deal Type</div><div class="v">${d.type}</div></div>
        <div><div class="k">Lead Source</div><div class="v">${d.source}</div></div>
        <div><div class="k">Competitor</div><div class="v">${d.competitor||"—"}</div></div>
        <div><div class="k">Next Step</div><div class="v">${d.nextStep||"—"}</div></div>
        <div><div class="k">Created</div><div class="v">${fmtDate(d.created)}</div></div>
      </div>
      ${d.description?`<div style="margin-top:12px;font-size:13px;color:var(--ink-soft)">${d.description}</div>`:""}
    </div>
    <div class="panel"><h3>Activities</h3>${renderRelatedActivities(d.id)}</div>
  `;
}

function updateDealStage(id, stage){
  const d = findDeal(id);
  const prev = d.stage;
  d.stage = stage;
  if(stage==="Closed Won") d.probability=100;
  if(stage==="Closed Lost") d.probability=0;
  addTimeline(d.account||d.id, d.account?"account":"deal", `Deal "${d.name}" moved ${prev} → ${stage}`);
  if(stage==="Closed Won"){
    DB.activities.push({id:uid("act"), kind:"Task", title:`Create customer onboarding plan for ${d.name}`, related:d.id, relatedType:"deal", due:todayISO(), owner:d.owner, done:false});
    notify(`Deal Closed Won: ${d.name}`);
  } else if(stage==="Closed Lost"){
    notify(`Deal Closed Lost: ${d.name}`);
  }
  save();
  renderView();
}

function openDealForm(id){
  const d = id?findDeal(id):null;
  const body = `<div class="formgrid">
    <div class="field full"><label>Deal name</label><input id="f_name" value="${d?d.name:''}"></div>
    <div class="field"><label>Account</label><select id="f_account"><option value="">— None —</option>${DB.accounts.map(a=>`<option value="${a.id}" ${d&&d.account===a.id?"selected":""}>${a.name}</option>`).join("")}</select></div>
    <div class="field"><label>Contact</label><select id="f_contact"><option value="">— None —</option>${DB.contacts.map(ct=>`<option value="${ct.id}" ${d&&d.contact===ct.id?"selected":""}>${ct.first} ${ct.last}</option>`).join("")}</select></div>
    <div class="field"><label>Amount (KSh)</label><input id="f_amount" type="number" value="${d?d.amount:0}"></div>
    <div class="field"><label>Probability (%)</label><input id="f_prob" type="number" min="0" max="100" value="${d?d.probability:20}"></div>
    <div class="field"><label>Stage</label><select id="f_stage">${PIPELINE_STAGES.map(s=>`<option ${d&&d.stage===s?"selected":""}>${s}</option>`).join("")}</select></div>
    <div class="field"><label>Closing date</label><input id="f_closing" type="date" value="${d?d.closing:''}"></div>
    <div class="field"><label>Deal type</label><select id="f_type">${["New Business","Upsell","Renewal"].map(s=>`<option ${d&&d.type===s?"selected":""}>${s}</option>`).join("")}</select></div>
    <div class="field"><label>Owner</label><input id="f_owner" value="${d?d.owner:CURRENT_USER.name}"></div>
    <div class="field full"><label>Next step</label><input id="f_next" value="${d?d.nextStep:''}"></div>
    <div class="field full"><label>Description</label><textarea id="f_desc">${d?d.description:''}</textarea></div>
  </div>`;
  openModal(d?"Edit Deal":"New Deal", body, ()=>{
    const data = {name:val('f_name'), account:val('f_account'), contact:val('f_contact'), amount:Number(val('f_amount')||0), probability:Number(val('f_prob')||0), stage:val('f_stage'), closing:val('f_closing'), type:val('f_type'), owner:val('f_owner'), nextStep:val('f_next'), description:val('f_desc'), source:d?d.source:"Manual Entry", competitor:d?d.competitor:""};
    if(!data.name){ toast("Deal name is required."); return false; }
    if(d){ Object.assign(d,data); notify(`Deal updated: ${data.name}`); }
    else { data.id=uid("deal"); data.created=todayISO(); DB.deals.push(data); notify(`New deal created: ${data.name}`); }
    save();
    goTo("deal-detail", {type:'deal', id:d?d.id:data.id});
    return true;
  });
}

/* ---------- PIPELINE (Kanban) ---------- */
let dragDealId = null;
function renderPipeline(c){
  const stages = PIPELINE_STAGES;
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Pipeline</h1><div class="sub">Drag a deal to move it between stages.</div></div>
      <div class="actions"><button class="btn btn-primary" onclick="openDealForm()">+ New Deal</button></div>
    </div>
    <div class="kanban">
      ${stages.map(st=>{
        const items = DB.deals.filter(d=>d.stage===st);
        const total = items.reduce((s,d)=>s+Number(d.amount),0);
        return `<div class="kanban-col" data-stage="${st}" ondragover="event.preventDefault();this.classList.add('dragover')" ondragleave="this.classList.remove('dragover')" ondrop="onDropStage(event,'${st}')">
          <div class="kanban-col-head"><span>${st}</span><span style="color:var(--ink-soft);font-weight:400;">${items.length}</span></div>
          <div class="kanban-col-body">
            ${items.map(d=>`
              <div class="kcard" draggable="true" ondragstart="dragDealId='${d.id}';this.classList.add('dragging')" ondragend="this.classList.remove('dragging')" onclick="goTo('deal-detail',{type:'deal',id:'${d.id}'})">
                <div class="kname">${d.name}</div>
                <div class="kamount">${fmtMoney(d.amount)}</div>
                <div class="kmeta">${findAccount(d.account)?findAccount(d.account).name:"No account"} · ${d.probability}%</div>
              </div>
            `).join("")}
            <div style="font-size:11px;color:var(--ink-soft);padding:6px 4px 0 4px;">Total: ${fmtMoney(total)}</div>
          </div>
        </div>`;
      }).join("")}
    </div>
  `;
}
function onDropStage(e, stage){
  e.currentTarget.classList.remove('dragover');
  if(!dragDealId) return;
  updateDealStage(dragDealId, stage);
  dragDealId = null;
}

/* ---------- FORECAST ---------- */
function renderForecast(c){
  const open = DB.deals.filter(d=>!d.stage.startsWith("Closed"));
  const total = open.reduce((s,d)=>s+Number(d.amount)*d.probability/100,0);
  c.innerHTML = `
    <div class="pageheader"><div><h1>Forecast</h1><div class="sub">Expected revenue = deal amount × probability, summed across open deals.</div></div></div>
    <div class="kpi-row" style="grid-template-columns:repeat(3,1fr)">
      ${kpi("Open Deals", open.length)}
      ${kpi("Total Pipeline", fmtMoney(open.reduce((s,d)=>s+Number(d.amount),0)))}
      ${kpi("Forecast (Expected Revenue)", fmtMoney(Math.round(total)))}
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Deal</th><th>Amount</th><th>Probability</th><th>Expected</th><th>Closing</th></tr></thead>
      <tbody>
      ${open.map(d=>`<tr onclick="goTo('deal-detail',{type:'deal',id:'${d.id}'})">
        <td><span class="rowlink">${d.name}</span></td><td>${fmtMoney(d.amount)}</td><td>${d.probability}%</td>
        <td>${fmtMoney(Math.round(d.amount*d.probability/100))}</td><td>${d.closing?fmtDate(d.closing):"—"}</td>
      </tr>`).join("")}
      <tr style="font-weight:700;background:var(--paper-2);"><td colspan="3">Total forecast</td><td>${fmtMoney(Math.round(total))}</td><td></td></tr>
      </tbody>
    </table></div>
  `;
}

/* ---------- ACTIVITIES (Tasks/Calls/Meetings) ---------- */
function renderActivities(kind, c){
  c = c || document.getElementById("content");
  const items = scopeOwn(DB.activities.filter(a=>a.kind===kind)).sort((a,b)=> (a.done - b.done) || a.due.localeCompare(b.due));
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>${kind}s</h1><div class="sub">${items.filter(a=>!a.done).length} open · ${items.filter(a=>a.done).length} done</div></div>
      <div class="actions">${canManage('activities') ? `<button class="btn btn-primary" onclick="openActivityForm('${kind}')">+ New ${kind}</button>` : ``}</div>
    </div>
    <div class="panel">
      ${items.length? items.map(a=>{
        const overdue = !a.done && a.due < todayISO();
        return `<div class="checklist-item ${a.done?'done':''}">
          <input type="checkbox" ${a.done?'checked':''} onchange="toggleActivity('${a.id}')" ${canManage('activities')?'':'disabled'}>
          <div class="cltext">${a.title} <span style="color:var(--ink-soft);font-size:11.5px;">(${a.owner})</span></div>
          <span class="cltag ${overdue?'overdue':''}">${overdue?'Overdue · ':''}${fmtDate(a.due)}</span>
        </div>`;
      }).join("") : `<div class="empty">No ${kind.toLowerCase()}s yet.</div>`}
    </div>
  `;
}
function toggleActivity(id){
  const a = DB.activities.find(x=>x.id===id);
  a.done = !a.done;
  save(); renderView();
}
function openActivityForm(kind){
  const body = `<div class="formgrid">
    <div class="field full"><label>Title</label><input id="f_title"></div>
    <div class="field"><label>Due date</label><input id="f_due" type="date" value="${todayISO()}"></div>
    <div class="field"><label>Owner</label><input id="f_owner" value="${CURRENT_USER.name}"></div>
  </div>`;
  openModal(`New ${kind}`, body, ()=>{
    const title = val('f_title');
    if(!title){ toast("Please enter a title."); return false; }
    DB.activities.push({id:uid("act"), kind, title, related:"", relatedType:"", due:val('f_due'), owner:val('f_owner'), done:false});
    save(); notify(`New ${kind.toLowerCase()} created: ${title}`);
    renderView();
    return true;
  });
}
function renderRelatedActivities(relatedId){
  const items = DB.activities.filter(a=>a.related===relatedId);
  return listOrEmpty(items.map(a=>`
    <div class="checklist-item ${a.done?'done':''}">
      <input type="checkbox" ${a.done?'checked':''} onchange="toggleActivity('${a.id}')">
      <div class="cltext">${a.title}</div>
      <span class="cltag ${(!a.done && a.due<todayISO())?'overdue':''}">${fmtDate(a.due)}</span>
    </div>
  `), "No linked activities yet.");
}

/* ---------- CALENDAR ---------- */
let calMonth = new Date().getMonth();
let calYear = new Date().getFullYear();
function renderCalendar(c){
  const first = new Date(calYear, calMonth, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const monthName = first.toLocaleDateString('en-GB',{month:'long', year:'numeric'});
  let cells = "";
  for(let i=0;i<startDow;i++) cells += `<div class="cal-cell muted"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const iso = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const items = DB.activities.filter(a=>a.due===iso);
    cells += `<div class="cal-cell"><div class="cal-daynum">${d}</div>${items.map(a=>`<div class="cal-item ${a.done?'done':''}" title="${a.title}">${a.title}</div>`).join("")}</div>`;
  }
  c.innerHTML = `
    <div class="pageheader">
      <div><h1>Calendar</h1><div class="sub">${monthName}</div></div>
      <div class="actions">
        <button class="btn btn-sm" onclick="calMonth--;if(calMonth<0){calMonth=11;calYear--;}renderView()">‹ Prev</button>
        <button class="btn btn-sm" onclick="calMonth++;if(calMonth>11){calMonth=0;calYear++;}renderView()">Next ›</button>
      </div>
    </div>
    <div class="calendar">
      ${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=>`<div class="cal-head">${d}</div>`).join("")}
      ${cells}
    </div>
  `;
}

/* ---------- REPORTS ---------- */
function renderReports(c){
  const leadsBySource = {};
  DB.leads.forEach(l=> leadsBySource[l.source]=(leadsBySource[l.source]||0)+1 );
  const dealsByStage = {};
  DB.deals.forEach(d=> dealsByStage[d.stage]=(dealsByStage[d.stage]||0)+1 );
  const won = DB.deals.filter(d=>d.stage==="Closed Won");
  const lost = DB.deals.filter(d=>d.stage==="Closed Lost");
  const winRate = (won.length+lost.length) ? Math.round(won.length/(won.length+lost.length)*100) : 0;
  const avgDeal = DB.deals.length ? Math.round(DB.deals.reduce((s,d)=>s+Number(d.amount),0)/DB.deals.length) : 0;
  const maxSrc = Math.max(...Object.values(leadsBySource),1);
  const maxStage = Math.max(...Object.values(dealsByStage),1);
  c.innerHTML = `
    <div class="pageheader"><div><h1>Reports</h1><div class="sub">Lead, deal and activity performance at a glance.</div></div></div>
    <div class="kpi-row" style="grid-template-columns:repeat(4,1fr)">
      ${kpi("Win Rate", winRate+"%")}
      ${kpi("Average Deal Size", fmtMoney(avgDeal))}
      ${kpi("Deals Won", won.length)}
      ${kpi("Deals Lost", lost.length)}
    </div>
    <div class="grid-2">
      <div class="panel"><h3>Leads by source</h3>
        ${Object.entries(leadsBySource).map(([s,n])=>`<div class="reportbar-row"><div class="reportbar-label">${s}</div><div class="reportbar-track"><div class="reportbar-fill" style="width:${n/maxSrc*100}%"></div></div><div class="reportbar-val">${n}</div></div>`).join("")}
      </div>
      <div class="panel"><h3>Deals by stage</h3>
        ${Object.entries(dealsByStage).map(([s,n])=>`<div class="reportbar-row"><div class="reportbar-label">${s}</div><div class="reportbar-track"><div class="reportbar-fill" style="width:${n/maxStage*100}%"></div></div><div class="reportbar-val">${n}</div></div>`).join("")}
      </div>
    </div>
    <div class="panel"><h3>Activity summary</h3>
      <div class="fieldsgrid">
        <div><div class="k">Tasks completed</div><div class="v">${DB.activities.filter(a=>a.kind==='Task'&&a.done).length}</div></div>
        <div><div class="k">Calls logged</div><div class="v">${DB.activities.filter(a=>a.kind==='Call').length}</div></div>
        <div><div class="k">Meetings held</div><div class="v">${DB.activities.filter(a=>a.kind==='Meeting').length}</div></div>
        <div><div class="k">Overdue activities</div><div class="v">${DB.activities.filter(a=>!a.done && a.due<todayISO()).length}</div></div>
      </div>
    </div>
  `;
}
function renderAnalytics(c){
  const owners = {};
  DB.deals.forEach(d=>{ owners[d.owner]=owners[d.owner]||{count:0,value:0,won:0}; owners[d.owner].count++; owners[d.owner].value+=Number(d.amount); if(d.stage==="Closed Won") owners[d.owner].won++; });
  c.innerHTML = `
    <div class="pageheader"><div><h1>Team Analytics</h1><div class="sub">Performance by salesperson.</div></div></div>
    <div class="tablewrap"><table>
      <thead><tr><th>Salesperson</th><th>Deals</th><th>Total Value</th><th>Won</th></tr></thead>
      <tbody>${Object.entries(owners).map(([o,v])=>`<tr><td>${o}</td><td>${v.count}</td><td>${fmtMoney(v.value)}</td><td>${v.won}</td></tr>`).join("")}</tbody>
    </table></div>
  `;
}

/* ---------- SETTINGS ---------- */
function renderSettings(c){
  c.innerHTML = `
    <div class="pageheader"><div><h1>Settings</h1><div class="sub">Core CRM configuration.</div></div></div>
    <div class="panel">
      <div class="settings-card"><div><div class="t">Users</div><div class="d">Manage who has access to this CRM.</div></div><button class="btn btn-sm" disabled>Manage</button></div>
      <div class="settings-card"><div><div class="t">Roles &amp; Profiles</div><div class="d">Administrator, Sales Manager, Salesperson, Marketing, Support, Viewer.</div></div><button class="btn btn-sm" disabled>Manage</button></div>
      <div class="settings-card"><div><div class="t">Territories</div><div class="d">Assign accounts to regions or teams.</div></div><button class="btn btn-sm" disabled>Manage</button></div>
      <div class="settings-card"><div><div class="t">Custom Fields</div><div class="d">Add fields to Leads, Accounts, Contacts or Deals.</div></div><button class="btn btn-sm" disabled>Manage</button></div>
      <div class="settings-card"><div><div class="t">Automation Rules</div><div class="d">e.g. "When Deal moves to Proposal → create follow-up task in 3 days."</div></div><button class="btn btn-sm" disabled>Manage</button></div>
      <div class="settings-card"><div><div class="t">Import / Export</div><div class="d">Bring in Leads, Accounts, Contacts or Deals from CSV/Excel.</div></div><button class="btn btn-sm" disabled>Manage</button></div>
      <div class="settings-card"><div><div class="t">Audit Log</div><div class="d">Track who changed what, and when.</div></div><button class="btn btn-sm" disabled>Manage</button></div>
      <div class="settings-card"><div><div class="t">Clear all data</div><div class="d">Permanently delete every lead, account, contact, deal and activity for this company.</div></div><button class="btn btn-sm btn-danger" onclick="resetDemoData()">Clear data</button></div>
    </div>
  `;
}
function resetDemoData(){
  if(!confirm("This permanently deletes all leads, accounts, contacts, deals and activities for this company. Continue?")) return;
  DB = seedData();
  save();
  goTo("dashboard");
  toast("All data cleared.");
}

/* =========================================================
   MODAL / TOAST HELPERS
   ========================================================= */
function val(id){ const el=document.getElementById(id); return el? el.value.trim() : ""; }
function openModal(title, bodyHtml, onSave, saveLabel){
  const backdrop = document.getElementById("modalBackdrop");
  const box = document.getElementById("modalBox");
  box.innerHTML = `
    <div class="modal-head"><h3>${title}</h3><button class="closebtn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">${bodyHtml}</div>
    <div class="modal-foot"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn btn-primary" id="modalSaveBtn">${saveLabel||"Save"}</button></div>
  `;
  document.getElementById("modalSaveBtn").onclick = ()=>{ if(onSave()!==false) closeModal(); };
  backdrop.classList.add("open");
}
function closeModal(){ document.getElementById("modalBackdrop").classList.remove("open"); }
function toast(msg){
  const wrap = document.getElementById("toastWrap");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(()=>t.remove(), 3200);
}

/* ---------- Quick add ---------- */
function openQuickAdd(){
  openModal("Quick add", `
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn" onclick="closeModal();openLeadForm()">＋ Lead</button>
      <button class="btn" onclick="closeModal();openAccountForm()">＋ Account</button>
      <button class="btn" onclick="closeModal();openContactForm()">＋ Contact</button>
      <button class="btn" onclick="closeModal();openDealForm()">＋ Deal</button>
      <button class="btn" onclick="closeModal();openActivityForm('Task')">＋ Task</button>
    </div>
  `, ()=>false, "Close");
  document.getElementById("modalSaveBtn").style.display="none";
}

/* ---------- Notifications ---------- */
function renderNotifBadge(){
  const unread = DB.notifications.filter(n=>!n.read).length;
  const badge = document.getElementById("notifCount");
  if(unread>0){ badge.style.display="flex"; badge.textContent = unread>9?"9+":unread; }
  else badge.style.display="none";
}
function renderNotifPanel(){
  const panel = document.getElementById("notifPanel");
  panel.innerHTML = DB.notifications.length ? DB.notifications.slice(0,12).map(n=>`<div class="notif-item">${n.text}<div class="t">${n.time}</div></div>`).join("") : `<div class="notif-item">No notifications.</div>`;
}

/* ---------- Global search ---------- */
document.addEventListener("DOMContentLoaded", checkSessionOnLoad);

function checkSessionOnLoad(){
  const session = getSession();
  if(session){
    const users = getUsers();
    const user = users.find(u=>u.email===session.email && u.companyId===session.companyId);
    if(user){ enterApp(user); return; }
  }
  hpShowHome();
}

let appInitialized = false;
function initApp(){
  currentView = "dashboard";
  currentDetail = null;
  renderNav();
  renderView();
  renderNotifBadge();

  if(appInitialized) return;
  appInitialized = true;

  document.getElementById("quickAddBtn").onclick = openQuickAdd;
  document.getElementById("notifBtn").onclick = (e)=>{
    e.stopPropagation();
    renderNotifPanel();
    const p = document.getElementById("notifPanel");
    p.classList.toggle("open");
    document.getElementById("userMenuPanel").classList.remove("open");
    DB.notifications.forEach(n=>n.read=true);
    save(); renderNotifBadge();
  };
  document.addEventListener("click", (e)=>{
    const p = document.getElementById("notifPanel");
    if(p.classList.contains("open") && !p.contains(e.target) && e.target.id!=="notifBtn") p.classList.remove("open");
    const um = document.getElementById("userMenuPanel");
    if(um.classList.contains("open") && !um.contains(e.target) && e.target.id!=="userChip") um.classList.remove("open");
  });
  document.getElementById("menuToggle").onclick = ()=> document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("modalBackdrop").addEventListener("click", (e)=>{ if(e.target.id==="modalBackdrop") closeModal(); });

  document.getElementById("globalSearch").addEventListener("input", function(){
    const q = this.value.trim().toLowerCase();
    if(q.length<2) return;
    const lead = DB.leads.find(l=>l.name.toLowerCase().includes(q)||l.company.toLowerCase().includes(q));
    const acc = DB.accounts.find(a=>a.name.toLowerCase().includes(q));
    const deal = DB.deals.find(d=>d.name.toLowerCase().includes(q));
    if(acc){ goTo('account-detail',{type:'account',id:acc.id}); }
    else if(deal){ goTo('deal-detail',{type:'deal',id:deal.id}); }
    else if(lead){ goTo('lead-detail',{type:'lead',id:lead.id}); }
  });
}
