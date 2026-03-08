/**
 * Generates the self-contained, self-decrypting HTML offline bundle reader.
 *
 * The HTML file:
 *  - Shows a dark "unlock" screen with a passphrase prompt.
 *  - Uses the Web Crypto API (PBKDF2 + AES-256-GCM) to decrypt the payload.
 *  - Renders a full read-only doc/database viewer after unlock.
 *  - Works offline in any modern browser (no external resources).
 */

export interface BundleMeta {
  generatedAt: string;
  generatedBy: string;
  spacesCount: number;
  docsCount: number;
  dbsCount: number;
  filename: string;
}

export function buildReaderHtml(
  encryptedPayloadBase64: string,
  meta: BundleMeta,
): string {
  const metaJson = JSON.stringify(meta);
  const payloadJson = JSON.stringify(encryptedPayloadBase64);
  const genDate = new Date(meta.generatedAt).toLocaleString("en-GB", {
    dateStyle: "long",
    timeStyle: "short",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>doc-it Offline Bundle \u2014 ${escAttr(meta.generatedBy)} \u2014 ${meta.generatedAt.slice(0, 10)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#fff;--surface:#f8fafc;--border:#e2e8f0;--text:#1e293b;--muted:#64748b;--accent:#2563eb;--accent-h:#1d4ed8;--red:#dc2626;--sw:272px;--th:48px}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:var(--bg);color:var(--text);height:100vh;overflow:hidden}

/* ── Unlock screen ──────────────────────────────────────────── */
#unlock-screen{position:fixed;inset:0;background:#0a0f1e;display:flex;align-items:center;justify-content:center;z-index:999}
.u-card{background:#131c30;border:1px solid #1e3a5f;border-radius:14px;padding:40px;width:440px;max-width:92vw;box-shadow:0 24px 64px rgba(0,0,0,.6)}
.u-logo{text-align:center;margin-bottom:6px}
.u-logo-text{font-size:26px;font-weight:800;color:#f0f6ff;letter-spacing:-0.5px}
.u-logo-sub{font-size:12px;color:#64748b;text-align:center;margin-bottom:28px;letter-spacing:.4px}
.u-meta{background:#0a0f1e;border:1px solid #1e3a5f;border-radius:8px;padding:12px 14px;margin-bottom:24px;display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:12px}
.u-mk{color:#475569}.u-mv{color:#94a3b8;font-weight:500;text-align:right}
.u-label{font-size:12px;color:#475569;margin-bottom:5px;font-weight:500}
.u-input{width:100%;background:#0a0f1e;border:1px solid #1e3a5f;border-radius:8px;padding:11px 14px;font-size:15px;color:#f0f6ff;outline:none;transition:border-color .15s;letter-spacing:.5px;margin-bottom:10px}
.u-input:focus{border-color:#2563eb}
.u-input::placeholder{color:#334155;letter-spacing:0}
.u-btn{width:100%;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s;display:flex;align-items:center;justify-content:center;gap:8px}
.u-btn:hover:not(:disabled){background:#1d4ed8}
.u-btn:disabled{background:#1e3a5f;cursor:default;color:#475569}
.u-err{color:#f87171;font-size:13px;margin-top:10px;min-height:18px;text-align:center}
.u-keyicon{color:#334155;margin:0 auto 20px;display:flex;justify-content:center}

/* ── App ────────────────────────────────────────────────────── */
#app{display:none;flex-direction:column;height:100vh}
#topbar{height:var(--th);background:var(--bg);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px;padding:0 14px;flex-shrink:0;min-width:0}
.t-logo{font-size:17px;font-weight:800;color:var(--text);letter-spacing:-.3px;white-space:nowrap}
.t-dot{width:1px;height:18px;background:var(--border);flex-shrink:0}
.t-badge{background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:2px 7px;border-radius:9999px;border:1px solid #fde68a;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap}
.t-meta{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.t-flex{flex:1;min-width:0}
.search-wrap{position:relative;flex-shrink:0}
.search-input{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:6px 11px 6px 30px;font-size:13px;color:var(--text);width:210px;outline:none;transition:border-color .15s}
.search-input:focus{border-color:var(--accent)}
.search-ico{position:absolute;left:8px;top:50%;transform:translateY(-50%);pointer-events:none;color:var(--muted)}
.search-panel{position:absolute;top:calc(100% + 4px);right:0;width:360px;background:var(--bg);border:1px solid var(--border);border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,.12);max-height:380px;overflow-y:auto;z-index:200;display:none}
.search-panel.open{display:block}
.sri{padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background .1s}
.sri:last-child{border-bottom:none}
.sri:hover{background:var(--surface)}
.sri-t{font-size:13px;font-weight:500;color:var(--text)}
.sri-m{font-size:11px;color:var(--muted);margin-top:2px}
.search-empty{padding:12px 14px;color:var(--muted);font-size:13px}

/* ── Layout ─────────────────────────────────────────────────── */
#layout{display:flex;flex:1;overflow:hidden}

/* ── Sidebar ────────────────────────────────────────────────── */
#sidebar{width:var(--sw);background:var(--surface);border-right:1px solid var(--border);display:flex;flex-direction:column;overflow-y:auto;flex-shrink:0}
.s-spaces{padding:8px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:2px}
.s-space{background:transparent;border:none;text-align:left;padding:6px 10px;border-radius:6px;font-size:13px;font-weight:500;color:var(--muted);cursor:pointer;transition:background .1s,color .1s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-space:hover{background:var(--border);color:var(--text)}
.s-space.active{background:#dbeafe;color:var(--accent)}
.s-section{padding:12px 8px 4px}
.s-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);padding:0 8px 6px}
.s-cat{display:flex;align-items:center;gap:4px;padding:4px 8px;font-size:11.5px;font-weight:600;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;user-select:none}
.s-doc{display:block;width:100%;text-align:left;background:transparent;border:none;padding:5px 8px;font-size:13px;color:var(--text);cursor:pointer;border-radius:6px;transition:background .1s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-doc:hover{background:var(--border)}
.s-doc.active{background:#dbeafe;color:var(--accent);font-weight:500}
.s-db{display:block;width:100%;text-align:left;background:transparent;border:none;padding:5px 8px 5px 16px;font-size:13px;color:var(--text);cursor:pointer;border-radius:6px;transition:background .1s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-db:hover{background:var(--border)}
.s-db.active{background:#dbeafe;color:var(--accent);font-weight:500}

/* ── Content ────────────────────────────────────────────────── */
#content{flex:1;overflow-y:auto;background:var(--bg)}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--muted);gap:10px;font-size:14px}

/* ── Document view ──────────────────────────────────────────── */
.dv{padding:44px 64px;max-width:860px;margin:0 auto}
@media(max-width:900px){.dv{padding:28px 24px}}
.dv-title{font-size:28px;font-weight:700;line-height:1.2;margin-bottom:6px}
.dv-meta{font-size:12px;color:var(--muted);margin-bottom:30px;padding-bottom:22px;border-bottom:1px solid var(--border)}
.dv-body{font-size:15px;line-height:1.75;color:var(--text)}
.dv-body h1{font-size:24px;font-weight:700;margin:28px 0 10px}
.dv-body h2{font-size:20px;font-weight:600;margin:24px 0 8px}
.dv-body h3{font-size:17px;font-weight:600;margin:20px 0 6px}
.dv-body h4{font-size:15px;font-weight:600;margin:16px 0 5px}
.dv-body p{margin:0 0 14px}
.dv-body ul,.dv-body ol{margin:0 0 14px 22px}
.dv-body li{margin-bottom:4px}
.dv-body code{background:#f1f5f9;padding:2px 5px;border-radius:4px;font-family:ui-monospace,'Cascadia Code','Fira Code',monospace;font-size:13px;color:#0f172a}
.dv-body pre{background:#1e293b;color:#e2e8f0;padding:16px;border-radius:8px;overflow-x:auto;margin:0 0 16px;font-size:13px}
.dv-body pre code{background:none;color:inherit;padding:0}
.dv-body blockquote{border-left:3px solid var(--accent);margin:0 0 16px;padding:8px 16px;background:#f0f9ff;border-radius:0 6px 6px 0}
.dv-body a{color:var(--accent);text-decoration:underline}
.dv-body img{max-width:100%;border-radius:8px;margin:6px 0;display:block}
.dv-body table{border-collapse:collapse;width:100%;margin-bottom:16px;font-size:14px}
.dv-body th{background:var(--surface);padding:8px 12px;text-align:left;border:1px solid var(--border);font-weight:600}
.dv-body td{padding:8px 12px;border:1px solid var(--border)}
.dv-body hr{border:none;border-top:1px solid var(--border);margin:24px 0}
.dv-body strong{font-weight:600}
.dv-body input[type=checkbox]{margin-right:5px}

/* ── Database view ──────────────────────────────────────────── */
.dbv{padding:36px 48px}
@media(max-width:900px){.dbv{padding:24px 16px}}
.dbv-title{font-size:24px;font-weight:700;margin-bottom:4px}
.dbv-meta{font-size:12px;color:var(--muted);margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid var(--border)}
.table-wrap{overflow-x:auto}
.dbt{border-collapse:collapse;font-size:13px;min-width:100%}
.dbt th{background:var(--surface);padding:8px 12px;text-align:left;border:1px solid var(--border);font-weight:600;white-space:nowrap}
.dbt td{padding:7px 12px;border:1px solid var(--border);vertical-align:top;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbt tr:hover td{background:#fafbfc}
.db-true{color:#16a34a;font-weight:600}.db-false{color:#dc2626}
.db-tag{display:inline-block;background:#dbeafe;color:#1d4ed8;font-size:11px;padding:1px 6px;border-radius:9999px;margin:1px}
.db-url{color:var(--accent);word-break:break-all}
.db-nil{color:#94a3b8}

/* ── Spinner ─────────────────────────────────────────────────── */
@keyframes spin{to{transform:rotate(360deg)}}
.spinner{width:20px;height:20px;border:2px solid #334155;border-top-color:#2563eb;border-radius:50%;animation:spin .7s linear infinite}
</style>
</head>
<body>

<!-- ══════════════════ UNLOCK SCREEN ══════════════════ -->
<div id="unlock-screen">
  <div class="u-card">
    <div class="u-keyicon">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#1e3a5f" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
    <div class="u-logo"><span class="u-logo-text">doc-it</span></div>
    <p class="u-logo-sub">OFFLINE BUNDLE &mdash; READ ONLY</p>
    <div class="u-meta">
      <span class="u-mk">Generated</span><span class="u-mv">${escText(genDate)}</span>
      <span class="u-mk">By</span><span class="u-mv">${escText(meta.generatedBy)}</span>
      <span class="u-mk">Spaces</span><span class="u-mv">${meta.spacesCount}</span>
      <span class="u-mk">Documents</span><span class="u-mv">${meta.docsCount}</span>
      <span class="u-mk">Databases</span><span class="u-mv">${meta.dbsCount}</span>
    </div>
    <div class="u-label">Passphrase</div>
    <input class="u-input" type="password" id="passphrase" placeholder="Enter your passphrase\u2026" autocomplete="off" spellcheck="false">
    <button class="u-btn" id="unlock-btn" onclick="unlock()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
      Unlock Bundle
    </button>
    <div class="u-err" id="unlock-err"></div>
  </div>
</div>

<!-- ══════════════════ MAIN APP ══════════════════ -->
<div id="app">
  <header id="topbar">
    <span class="t-logo">doc-it</span>
    <div class="t-dot"></div>
    <span class="t-badge">Read Only</span>
    <span class="t-meta" id="t-meta"></span>
    <div class="t-flex"></div>
    <div class="search-wrap">
      <svg class="search-ico" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <input class="search-input" id="search-input" type="text" placeholder="Search\u2026" autocomplete="off" oninput="onSearch(this.value)">
      <div class="search-panel" id="search-panel"></div>
    </div>
  </header>
  <div id="layout">
    <nav id="sidebar"></nav>
    <main id="content"><div class="empty"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>Select a document</div></main>
  </div>
</div>

<script>
var ENC = ${payloadJson};
var META = ${metaJson};
var state = { payload: null, space: null, doc: null, db: null };
var enc = new TextEncoder(), dec = new TextDecoder();

// ── helpers ──────────────────────────────────────────────────────────────────
function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(iso){
  if(!iso) return '';
  try{ return new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)); }
  catch(e){ return String(iso); }
}
function currentSpace(){
  return state.payload && state.space
    ? state.payload.spaces.find(function(s){ return s.slug===state.space; }) || null
    : null;
}

// ── unlock ────────────────────────────────────────────────────────────────────
function unlock(){
  var pw = document.getElementById('passphrase').value;
  var errEl = document.getElementById('unlock-err');
  var btn = document.getElementById('unlock-btn');
  if(!pw){ errEl.textContent='Enter your passphrase.'; return; }
  btn.disabled=true;
  btn.innerHTML='<div class="spinner"></div>';
  errEl.textContent='';
  setTimeout(function(){ doDecrypt(pw,btn,errEl); },30);
}
function doDecrypt(pw,btn,errEl){
  var raw = atob(ENC);
  var buf = new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++) buf[i]=raw.charCodeAt(i);
  var salt=buf.slice(0,16), iv=buf.slice(16,28), tag=buf.slice(28,44), ct=buf.slice(44);
  var withTag=new Uint8Array(ct.length+16);
  withTag.set(ct); withTag.set(tag,ct.length);
  crypto.subtle.importKey('raw',enc.encode(pw),'PBKDF2',false,['deriveKey'])
    .then(function(km){
      return crypto.subtle.deriveKey(
        {name:'PBKDF2',salt:salt,iterations:100000,hash:'SHA-256'},
        km,{name:'AES-GCM',length:256},false,['decrypt']
      );
    })
    .then(function(key){
      return crypto.subtle.decrypt({name:'AES-GCM',iv:iv},key,withTag);
    })
    .then(function(plain){
      var data=JSON.parse(dec.decode(plain));
      state.payload=data;
      state.space=data.spaces.length>0?data.spaces[0].slug:null;
      document.getElementById('unlock-screen').style.display='none';
      document.getElementById('app').style.display='flex';
      initApp();
    })
    .catch(function(){
      errEl.textContent='Incorrect passphrase or corrupted bundle.';
      btn.disabled=false;
      btn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg> Unlock Bundle';
    });
}
document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('passphrase').addEventListener('keydown',function(e){
    if(e.key==='Enter') unlock();
  });
});

// ── app init ──────────────────────────────────────────────────────────────────
function initApp(){
  var d=new Date(META.generatedAt);
  document.getElementById('t-meta').textContent=
    'Snapshot '+d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+
    ' \u00b7 '+META.generatedBy;
  renderSidebar();
  var sp=currentSpace();
  if(sp){
    if(sp.documents && sp.documents.length>0) showDoc(sp.documents[0]);
    else if(sp.databases && sp.databases.length>0) showDb(sp.databases[0].id);
  }
}

// ── sidebar ────────────────────────────────────────────────────────────────────
function renderSidebar(){
  var sp=currentSpace();
  if(!state.payload||!sp){ document.getElementById('sidebar').innerHTML=''; return; }
  var html='';

  // Space tabs
  if(state.payload.spaces.length>1){
    html+='<div class="s-spaces">';
    for(var i=0;i<state.payload.spaces.length;i++){
      var s=state.payload.spaces[i];
      html+='<button class="s-space'+(s.slug===state.space?' active':'')+'" data-slug="'+esc(s.slug)+'">'+esc(s.name)+'</button>';
    }
    html+='</div>';
  }

  // Docs section
  if(sp.documents && sp.documents.length>0){
    // Group docs by category
    var byCat={};
    for(var d=0;d<sp.documents.length;d++){
      var doc=sp.documents[d];
      var k=doc.category||'';
      if(!byCat[k]) byCat[k]=[];
      byCat[k].push(doc);
    }
    html+='<div class="s-section"><div class="s-label">Documents</div>';

    // Root-level docs (no category)
    var rootDocs=byCat['']||[];
    for(var ri=0;ri<rootDocs.length;ri++){
      var rd=rootDocs[ri];
      var rdActive=state.doc&&state.doc.category===''&&state.doc.name===rd.name;
      html+='<button class="s-doc'+(rdActive?' active':'')+'" data-cat="" data-name="'+esc(rd.name)+'" style="padding-left:8px">'+esc(rd.name)+'</button>';
    }

    // Categories + their docs
    var cats=sp.categories||[];
    for(var ci=0;ci<cats.length;ci++){
      var cat=cats[ci];
      var indent=(cat.level*12+8);
      html+='<div class="s-cat" style="padding-left:'+indent+'px">'+
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>'+
        esc(cat.name)+'</div>';
      var catDocs=byCat[cat.path]||[];
      for(var cdi=0;cdi<catDocs.length;cdi++){
        var cd=catDocs[cdi];
        var cdActive=state.doc&&state.doc.category===cat.path&&state.doc.name===cd.name;
        html+='<button class="s-doc'+(cdActive?' active':'')+'" data-cat="'+esc(cat.path)+'" data-name="'+esc(cd.name)+'" style="padding-left:'+(indent+16)+'px">'+esc(cd.name)+'</button>';
      }
    }
    html+='</div>';
  }

  // Databases section
  if(sp.databases && sp.databases.length>0){
    html+='<div class="s-section"><div class="s-label">Databases</div>';
    for(var dbi=0;dbi<sp.databases.length;dbi++){
      var db=sp.databases[dbi];
      var dbActive=state.db===db.id;
      html+='<button class="s-db'+(dbActive?' active':'')+'" data-dbid="'+esc(db.id)+'">'+
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:5px"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>'+
        esc(db.title)+'</button>';
    }
    html+='</div>';
  }

  document.getElementById('sidebar').innerHTML=html;
}

// Sidebar event delegation
document.addEventListener('click',function(e){
  var st=e.target.closest('.s-space');
  if(st){ state.space=st.dataset.slug; state.doc=null; state.db=null; renderSidebar(); var sp=currentSpace(); if(sp){ if(sp.documents&&sp.documents.length>0) showDoc(sp.documents[0]); else if(sp.databases&&sp.databases.length>0) showDb(sp.databases[0].id); else document.getElementById('content').innerHTML='<div class="empty">No content in this space.</div>'; } return; }
  var sd=e.target.closest('.s-doc');
  if(sd){ showDoc({category:sd.dataset.cat,name:sd.dataset.name}); return; }
  var sdb=e.target.closest('.s-db');
  if(sdb){ showDb(sdb.dataset.dbid); return; }
  if(!e.target.closest('.search-wrap')) document.getElementById('search-panel').classList.remove('open');
});

// ── show document ─────────────────────────────────────────────────────────────
function showDoc(ref){
  var sp=currentSpace(); if(!sp) return;
  var doc=null;
  for(var i=0;i<sp.documents.length;i++){
    if(sp.documents[i].category===ref.category&&sp.documents[i].name===ref.name){ doc=sp.documents[i]; break; }
  }
  if(!doc) return;
  state.doc=ref; state.db=null;
  var meta=[];
  if(doc.updatedAt) meta.push('Updated '+fmtDate(doc.updatedAt));
  if(doc.updatedBy) meta.push('by '+esc(doc.updatedBy));
  if(doc.category) meta.push('in '+esc(doc.category));
  document.getElementById('content').innerHTML=
    '<div class="dv">'+
      '<h1 class="dv-title">'+esc(doc.name)+'</h1>'+
      (meta.length?'<div class="dv-meta">'+meta.join(' \u00b7 ')+'</div>':'')+
      '<div class="dv-body">'+doc.html+'</div>'+
    '</div>';
  renderSidebar();
}

// ── show database ─────────────────────────────────────────────────────────────
function showDb(dbId){
  var sp=currentSpace(); if(!sp) return;
  var db=null;
  for(var i=0;i<sp.databases.length;i++){ if(sp.databases[i].id===dbId){ db=sp.databases[i]; break; } }
  if(!db) return;
  state.db=dbId; state.doc=null;
  var cols=db.columns, rows=db.rows;
  var thead='<tr>'+cols.map(function(c){ return '<th>'+esc(c.name)+'</th>'; }).join('')+'</tr>';
  var tbody=rows.map(function(row){
    return '<tr>'+cols.map(function(col){
      return '<td>'+renderCell(row.cells[col.id],col)+'</td>';
    }).join('')+'</tr>';
  }).join('');
  document.getElementById('content').innerHTML=
    '<div class="dbv">'+
      '<h1 class="dbv-title">'+esc(db.title)+'</h1>'+
      '<div class="dbv-meta">'+rows.length+' rows \u00b7 '+cols.length+' columns'+(db.updatedAt?' \u00b7 Updated '+fmtDate(db.updatedAt):'')+' </div>'+
      '<div class="table-wrap"><table class="dbt"><thead>'+thead+'</thead><tbody>'+tbody+'</tbody></table></div>'+
    '</div>';
  renderSidebar();
}

function renderCell(v,col){
  if(v===null||v===undefined||v==='') return '<span class="db-nil">\u2014</span>';
  switch(col.type){
    case 'checkbox': return v?'<span class="db-true">\u2713</span>':'<span class="db-false">\u2717</span>';
    case 'multiSelect': return Array.isArray(v)?v.map(function(x){ return '<span class="db-tag">'+esc(String(x))+'</span>'; }).join(' '):esc(String(v));
    case 'select': return '<span class="db-tag">'+esc(String(v))+'</span>';
    case 'url': return '<a class="db-url" href="'+esc(String(v))+'" target="_blank" rel="noopener">'+esc(String(v))+'</a>';
    case 'date': return fmtDate(String(v));
    default: return esc(String(v));
  }
}

// ── search ────────────────────────────────────────────────────────────────────
var _st=null;
function onSearch(q){
  clearTimeout(_st);
  var panel=document.getElementById('search-panel');
  if(!q.trim()){ panel.classList.remove('open'); return; }
  _st=setTimeout(function(){
    if(!state.payload){ return; }
    var results=[]; var ql=q.toLowerCase();
    for(var si=0;si<state.payload.spaces.length&&results.length<12;si++){
      var sp=state.payload.spaces[si];
      for(var di=0;di<sp.documents.length&&results.length<12;di++){
        var doc=sp.documents[di];
        var text=doc.html.replace(/<[^>]+>/g,' ');
        if(doc.name.toLowerCase().indexOf(ql)>=0||text.toLowerCase().indexOf(ql)>=0){
          results.push({type:'doc',spaceSlug:sp.slug,spaceName:sp.name,doc:doc});
        }
      }
      for(var dbi=0;dbi<sp.databases.length&&results.length<12;dbi++){
        var db=sp.databases[dbi];
        if(db.title.toLowerCase().indexOf(ql)>=0) results.push({type:'db',spaceSlug:sp.slug,spaceName:sp.name,db:db});
      }
    }
    if(results.length===0){
      panel.innerHTML='<div class="search-empty">No results for \u201c'+esc(q)+'\u201d</div>';
    } else {
      panel.innerHTML=results.map(function(r){
        if(r.type==='doc') return '<div class="sri" data-type="doc" data-slug="'+esc(r.spaceSlug)+'" data-cat="'+esc(r.doc.category)+'" data-name="'+esc(r.doc.name)+'"><div class="sri-t">'+esc(r.doc.name)+'</div><div class="sri-m">'+esc(r.spaceName)+(r.doc.category?' \u00b7 '+esc(r.doc.category):'')+' \u00b7 Document</div></div>';
        return '<div class="sri" data-type="db" data-slug="'+esc(r.spaceSlug)+'" data-dbid="'+esc(r.db.id)+'"><div class="sri-t">'+esc(r.db.title)+'</div><div class="sri-m">'+esc(r.spaceName)+' \u00b7 Database</div></div>';
      }).join('');
    }
    panel.classList.add('open');
  },200);
}
document.addEventListener('click',function(e){
  var sri=e.target.closest('.sri');
  if(!sri) return;
  document.getElementById('search-panel').classList.remove('open');
  document.getElementById('search-input').value='';
  var slug=sri.dataset.slug;
  if(slug) state.space=slug;
  if(sri.dataset.type==='doc') showDoc({category:sri.dataset.cat,name:sri.dataset.name});
  else if(sri.dataset.type==='db') showDb(sri.dataset.dbid);
});
</script>
</body>
</html>`;
}

function escAttr(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escText(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
