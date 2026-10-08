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
;
/* ===== acacia-cloud: shared Supabase layer for the Acacia apps (same project as Books) =====
   - Sign in / sign up against the same accounts Books uses (table app_accounts)
   - New companies + users show up in Support (acacia_company_status, app_accounts, acacia_app_usage)
   - Each app's data is saved per company in acacia_app_data and loaded on any device
   Needs acacia_apps_cloud.sql to be run once in Supabase. Offline: falls back to this browser's copy. */
(function (w) {
  'use strict';
  var URL_ = 'https://xglsampckermarjpczdf.supabase.co';
  var KEY_ = 'sb_publishable_x-dPR7pzhvJgag9soW0I8w_yfKTmi6A';
  var H = { apikey: KEY_, Authorization: 'Bearer ' + KEY_, 'Content-Type': 'application/json' };
  var cfg = null, ctx = null, timer = 0, hbTimer = 0;
  var rawSet = Storage.prototype.setItem;
  var low = function (v) { return String(v == null ? '' : v).trim().toLowerCase(); };
  var enc = encodeURIComponent;
  var isCloudId = function (id) { return /^ACC-\d+$/i.test(String(id || '')); };
  function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  async function req(path, opt) {
    var ctl = w.AbortController ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : null;
    try {
      var r = await fetch(URL_ + '/rest/v1/' + path, Object.assign({ headers: H, signal: ctl ? ctl.signal : undefined }, opt || {}));
      if (t) clearTimeout(t);
      return r;
    } catch (e) { if (t) clearTimeout(t); throw err('offline', 'Cannot reach the Acacia cloud. Check your internet connection.'); }
  }
  async function rpc(name, args) {
    var r = await req('rpc/' + name, { method: 'POST', body: JSON.stringify(args || {}) });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) {
      var m = (j && (j.message || j.hint)) || ('HTTP ' + r.status);
      var e = err(/already exists|exists/i.test(m) ? 'exists' : (r.status === 404 ? 'missing' : 'rpc'), m); e.status = r.status; throw e;
    }
    return j;
  }

  /* same hashing as Books: SHA-256 of "salt:password" */
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
  function newSalt() { var a = new Uint8Array(16); crypto.getRandomValues(a); return hex(a); }
  async function hash(pass, salt) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pass))); }
  async function verify(d, pass) {
    d = d || {};
    if (d.passwordHash && d.passwordSalt) return (await hash(pass, d.passwordSalt)) === d.passwordHash;
    return typeof d.password === 'string' && d.password === pass;
  }
  function mapRole(r, d) { return cfg && cfg.mapRole ? cfg.mapRole(r, d) : (/^admin/i.test(String(r || '')) ? 'Administrator' : (r || 'Administrator')); }

  /* deleted / suspended companies are blocked (fails open if the cloud can't be reached) */
  async function gate(cid, login) {
    try { if ((await rpc('acx_account_state', { p_company: low(cid), p_login: low(login) })) === 'deleted') return 'This account was removed by Acacia support.'; } catch (e) {}
    try {
      var r = await req('acacia_company_status?select=status&company_id=eq.' + enc(cid));
      if (r.ok) { var j = await r.json(); var s = j[0] && j[0].status; if (s && s !== 'active') return 'Your company account is "' + s + '". Please contact Acacia support.'; }
    } catch (e) {}
    return null;
  }

  async function signIn(email, pass, company) {
    email = low(email);
    var r = await req('app_accounts?select=login_id,username,company_id,data&login_id=eq.' + enc(email));
    if (!r.ok) throw err('offline', 'Could not read accounts (' + r.status + '). Run acacia_apps_cloud.sql in Supabase.');
    var rows = await r.json(), ok = [], cn = low(company);
    if (cn) rows = rows.filter(function (x) { var d = x.data || {}; return low(d.companyName) === cn || low(x.company_id) === cn || (d.previousCompanyNames || []).map(low).indexOf(cn) > -1; });
    for (var i = 0; i < rows.length; i++) if (await verify(rows[i].data, pass)) ok.push(rows[i]);
    if (!ok.length) return null;
    var row = ok[0];
    if (ok.length > 1) {
      var pick = w.prompt('This login belongs to more than one company:\n' + ok.map(function (x, n) { return (n + 1) + '. ' + ((x.data && x.data.companyName) || x.company_id) + ' (' + x.company_id + ')'; }).join('\n') + '\n\nType the number to open:', '1');
      row = ok[(parseInt(pick, 10) || 1) - 1] || ok[0];
    }
    var msg = await gate(row.company_id, email); if (msg) throw err('blocked', msg);
    var d = row.data || {};
    return { companyId: row.company_id, company: d.companyName || '', name: d.fullName || d.username || email.split('@')[0], email: email, role: mapRole(d.role, d), passwordHash: d.passwordHash, passwordSalt: d.passwordSalt };
  }

  async function register(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    var id = await rpc('acx_register_company', { p_company: o.company, p_name: o.name, p_email: low(o.email), p_hash: h, p_salt: salt, p_app: cfg.app });
    return { companyId: id, passwordHash: h, passwordSalt: salt };
  }

  /* teammates added inside an app (CRM Users & Roles). The app's own role is kept per app; Books sees admin/user */
  var booksRole = function (r) { return /^admin/i.test(String(r || '')) ? 'admin' : 'user'; };
  async function addUser(o) {
    var salt = newSalt(), h = await hash(o.password, salt);
    await rpc('acx_add_user', { p_company: o.companyId, p_name: o.name, p_email: low(o.email), p_role: booksRole(o.role), p_hash: h, p_salt: salt, p_app: cfg.app, p_app_role: o.role || '' });
    return { passwordHash: h, passwordSalt: salt };
  }
  function setRole(companyId, email, role) { return rpc('acx_set_user_role', { p_company: companyId, p_email: low(email), p_role: booksRole(role), p_app: cfg.app, p_app_role: role || '' }); }
  function removeUser(companyId, email) { return rpc('acx_remove_user', { p_company: companyId, p_email: low(email) }); }

  /* keep a copy of cloud users in this browser so the app's own session code keeps working (and offline sign-in) */
  function cacheUser(usersKey, u) {
    try {
      var list = JSON.parse(localStorage.getItem(usersKey) || '[]');
      var rec = { companyId: u.companyId, company: u.company, name: u.name, email: low(u.email), role: u.role, passwordHash: u.passwordHash, passwordSalt: u.passwordSalt };
      var i = list.findIndex(function (x) { return low(x.email) === rec.email && x.companyId === rec.companyId; });
      if (i > -1) { list[i] = Object.assign({}, list[i], rec); delete list[i].password; } else list.push(rec);
      rawSet.call(localStorage, usersKey, JSON.stringify(list));
    } catch (e) {}
  }
  function verifyLocal(u, pass) { return verify(u, pass); }

  /* accounts that only ever existed in this browser get a cloud company; their data and teammates move with them.
     'all' is the local users array: it is updated in place (caller saves it). Returns the signed-in user's new record. */
  async function migrate(u, pass, all) {
    var oldId = u.companyId, same = (all || [u]).filter(function (x) { return x.companyId === oldId; });
    var owner = same.find(function (x) { return /^admin/i.test(String(x.role || 'Administrator')) && x.password; }) || u;
    var ownerPass = owner === u ? pass : owner.password;
    var r = await register({ company: owner.company, name: owner.name, email: owner.email, password: ownerPass });
    for (var i = 0; i < same.length; i++) {
      var x = same[i];
      if (x === owner) { x.passwordHash = r.passwordHash; x.passwordSalt = r.passwordSalt; }
      else {
        var pw = x === u ? pass : x.password;
        if (pw) { try { var h = await addUser({ companyId: r.companyId, name: x.name, email: x.email, password: pw, role: x.role || 'Administrator' }); x.passwordHash = h.passwordHash; x.passwordSalt = h.passwordSalt; } catch (e) { continue; } }
        else continue;
      }
      delete x.password; x.companyId = r.companyId;
    }
    var o = cfg.dataKey(oldId), n = cfg.dataKey(r.companyId), v = localStorage.getItem(o);
    if (v != null) { rawSet.call(localStorage, n, v); localStorage.removeItem(o); rawSet.call(localStorage, dirtyKey(r.companyId), '1'); }
    return same.find(function (x) { return low(x.email) === low(u.email) && x.companyId === r.companyId; }) || null;
  }

  /* ---- data sync (one JSON blob per company per app) ---- */
  function tsKey(c) { return 'acx_ts_' + cfg.app + '_' + (c || ctx.companyId); }
  function dirtyKey(c) { return 'acx_dirty_' + cfg.app + '_' + (c || ctx.companyId); }
  async function pullRow(app) {
    var r = await req('acacia_app_data?select=value,updated_at&key=eq.data&company_id=eq.' + enc(ctx.companyId) + '&app=eq.' + enc(app));
    if (!r.ok) return null; var j = await r.json(); return j[0] || null;
  }
  async function pushNow() {
    if (!ctx || !isCloudId(ctx.companyId)) return false;
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return false;
    try {
      var r = await req('acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) });
      if (r.ok) { var j = await r.json(); rawSet.call(localStorage, tsKey(), (j[0] && j[0].updated_at) || ''); localStorage.removeItem(dirtyKey()); return true; }
    } catch (e) {}
    return false;
  }
  function schedule() {
    if (!ctx || !isCloudId(ctx.companyId)) return;
    rawSet.call(localStorage, dirtyKey(), '1');
    clearTimeout(timer); timer = setTimeout(pushNow, 2500);
  }
  function flush() {
    if (!ctx || !isCloudId(ctx.companyId) || localStorage.getItem(dirtyKey()) !== '1') return;
    clearTimeout(timer);
    var v = localStorage.getItem(cfg.dataKey(ctx.companyId)); if (v == null) return;
    try {
      fetch(URL_ + '/rest/v1/acacia_app_data?on_conflict=company_id,app,key', { method: 'POST', keepalive: v.length < 60000, headers: Object.assign({}, H, { Prefer: 'resolution=merge-duplicates,return=minimal' }), body: JSON.stringify({ company_id: ctx.companyId, app: cfg.app, key: 'data', value: v }) }).then(function (r) { if (r.ok) localStorage.removeItem(dirtyKey()); }).catch(function () {});
    } catch (e) {}
  }
  async function pullData() {
    var row = await pullRow(cfg.app);
    var dirty = localStorage.getItem(dirtyKey()) === '1', last = localStorage.getItem(tsKey());
    if (row && !dirty && row.updated_at !== last) { rawSet.call(localStorage, cfg.dataKey(ctx.companyId), row.value); rawSet.call(localStorage, tsKey(), row.updated_at); }
    else if (!row) { if (localStorage.getItem(cfg.dataKey(ctx.companyId)) != null) await pushNow(); }
    else if (dirty) await pushNow();
  }
  /* read-only copies of another app's data (e.g. Expenses reads Payroll) */
  async function pullExtras() {
    var ex = cfg.readFrom || [];
    for (var i = 0; i < ex.length; i++) { try { var row = await pullRow(ex[i].app); if (row) rawSet.call(localStorage, ex[i].dataKey(ctx.companyId), row.value); } catch (e) {} }
  }

  function heartbeat() {
    if (!ctx || !isCloudId(ctx.companyId) || !ctx.email) return;
    var k = 'acx_hb_' + ctx.companyId + '_' + cfg.app + '_' + ctx.email;
    if (Date.now() - Number(localStorage.getItem(k) || 0) < 3e5) return;
    rawSet.call(localStorage, k, String(Date.now()));
    try { fetch(URL_ + '/rest/v1/rpc/acx_heartbeat', { method: 'POST', headers: H, keepalive: true, body: JSON.stringify({ p_company: ctx.companyId, p_app: cfg.app, p_user: ctx.email, p_role: String(ctx.role || '') }) }).catch(function () {}); } catch (e) {}
  }

  /* called when a user enters the app: returns 'ok' | 'local' | 'blocked:<message>' */
  async function start(user) {
    ctx = { companyId: user.companyId, email: low(user.email), role: user.role || '' };
    if (!isCloudId(ctx.companyId)) return 'local';
    var msg = await gate(ctx.companyId, ctx.email); if (msg) return 'blocked:' + msg;
    try { await pullData(); await pullExtras(); } catch (e) {}
    heartbeat(); clearInterval(hbTimer); hbTimer = setInterval(function () { heartbeat(); }, 3e5);
    return 'ok';
  }
  function stop() { flush(); clearInterval(hbTimer); ctx = null; }

  function init(c) {
    cfg = c;
    Storage.prototype.setItem = function (k, v) {
      rawSet.apply(this, arguments);
      try { if (this === w.localStorage && ctx && k === cfg.dataKey(ctx.companyId)) schedule(); } catch (e) {}
    };
    w.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', function () { if (document.hidden) flush(); });
  }

  w.AcaciaCloud = { init: init, signIn: signIn, register: register, addUser: addUser, setRole: setRole, removeUser: removeUser, cacheUser: cacheUser, verifyLocal: verifyLocal, migrate: migrate, start: start, stop: stop, flush: flush, isCloudId: isCloudId, gate: gate, URL: URL_, KEY: KEY_, rpc: rpc, req: req };
})(window);
;
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
AcaciaCloud.init({app:'CRM', dataKey:dataKeyFor, mapRole:function(r,d){ return /^admin/i.test(String(r||'')) ? 'Administrator' : ((d && d.appRoles && d.appRoles.CRM) || 'Viewer'); }});
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

async function handleRegister(){
  const company = document.getElementById('regCompany').value.trim();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim().toLowerCase();
  const password = document.getElementById('regPassword').value;
  if(!company || !name || !email || !password){ showAuthError('registerError','Please fill in every field.'); return; }
  if(password.length < 6){ showAuthError('registerError','Password must be at least 6 characters.'); return; }
  const users = getUsers();
  let user, viaCloud = false;
  try{
    const c = await AcaciaCloud.register({company, name, email, password});
    user = {companyId:c.companyId, company, name, email, role:'Administrator', passwordHash:c.passwordHash, passwordSalt:c.passwordSalt};
    viaCloud = true;
  }catch(e){
    if(e.code === 'exists'){ showAuthError('registerError','This company already has an account with that email. Please sign in instead.'); return; }
    if(e.code !== 'offline'){ showAuthError('registerError', e.message || 'Could not create the account. Please try again.'); return; }
    if(users.some(u=>u.email===email)){ showAuthError('registerError','An account with that email already exists.'); return; }
    user = {companyId:uid('co'), company, name, email, password, role:'Administrator'};   // offline: uploaded the next time you sign in online
  }
  if(viaCloud) AcaciaCloud.cacheUser(USERS_KEY, user); else { users.push(user); saveUsers(users); }
  setSession(user);
  await enterApp(user);
}
async function handleLogin(){
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const password = document.getElementById('loginPassword').value;
  const company = (document.getElementById('loginCompany').value || '').trim();
  if(!company || !email || !password){ showAuthError('loginError','Please enter your company name, email and password.'); return; }
  let user = null;
  try{
    user = await AcaciaCloud.signIn(email, password, company);
    if(user) AcaciaCloud.cacheUser(USERS_KEY, user);
  }catch(e){
    if(e.code === 'blocked'){ showAuthError('loginError', e.message); return; }
  }
  if(!user){
    const users = getUsers();
    for(const u of users){ if(u.email === email && String(u.company||'').trim().toLowerCase() === company.toLowerCase() && await AcaciaCloud.verifyLocal(u, password)){ user = u; break; } }
    if(!user){ showAuthError('loginError','That email and password combination was not found.'); return; }
    if(!AcaciaCloud.isCloudId(user.companyId)){
      try{ const moved = await AcaciaCloud.migrate(user, password, users); if(moved){ saveUsers(users); user = moved; } }catch(e){ /* offline: stays on this device for now */ }
    }
  }
  setSession(user);
  await enterApp(user);
}
function handleLogout(){
  AcaciaCloud.stop();
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

async function enterApp(user){
  let res = 'local';
  try{ res = await AcaciaCloud.start(user); }catch(e){}
  if(String(res).indexOf('blocked:') === 0){
    try{ clearSession(); }catch(e){}
    AcaciaCloud.stop();
    alert(String(res).slice(8));
    location.reload();
    return;
  }
  return __enterAppLocal(user);
}
function __enterAppLocal(user){
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
;
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
    if(AcaciaCloud.isCloudId(CURRENT_USER.companyId)){
      AcaciaCloud.addUser({companyId: CURRENT_USER.companyId, name, email, password, role}).then(h=>{
        const us = getUsers(); const x = us.find(z=>z.email===email && z.companyId===CURRENT_USER.companyId);
        if(x){ x.passwordHash = h.passwordHash; x.passwordSalt = h.passwordSalt; delete x.password; saveUsers(us); }
      }).catch(e=>toast('Saved on this device only: ' + (e.message || e)));
    }
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
  if(AcaciaCloud.isCloudId(CURRENT_USER.companyId)) AcaciaCloud.setRole(CURRENT_USER.companyId, email, role).catch(()=>{});
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
  if(AcaciaCloud.isCloudId(CURRENT_USER.companyId)) AcaciaCloud.removeUser(CURRENT_USER.companyId, email).catch(()=>{});
  toast(`${u.name} removed.`);
  renderView();
}
