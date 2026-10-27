const KEY='tape_trades_v2';
let trades=[]; try{trades=JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){trades=[];}
let editingId=null, calDate=new Date(), calSelDay=null, statusFilter='all', viewMode='list';

function save(){try{localStorage.setItem(KEY,JSON.stringify(trades));}catch(e){alert('Could not save — storage may be full.');}}

// ---- animated dialog open/close, same fade + zoom-95 pattern as the original ----
function openDialog(overlayId,contentId){
  const overlay=document.getElementById(overlayId), content=document.getElementById(contentId);
  overlay.classList.remove('hidden','closing'); overlay.classList.add('flex');
  content.classList.remove('closing');
}
function closeDialog(overlayId,contentId){
  const overlay=document.getElementById(overlayId), content=document.getElementById(contentId);
  overlay.classList.add('closing'); content.classList.add('closing');
  setTimeout(()=>{ overlay.classList.add('hidden'); overlay.classList.remove('flex','closing'); content.classList.remove('closing'); },180);
}
function pnl(t){
  if(t.pnl_override!==undefined && t.pnl_override!==null) return t.pnl_override;
  if(t.exit===null||t.exit===undefined||t.exit==='') return null;
  return (t.direction==='long'?(t.exit-t.entry):(t.entry-t.exit))*t.qty-(t.fees||0);
}
function fmtMoney(n){ const a=Math.abs(n); return (n<0?'-':'')+'$'+a.toLocaleString(undefined,{maximumFractionDigits:2}); }
function sessionFor(time){ const h=time?parseInt(time.split(':')[0],10):new Date().getUTCHours(); if(h>=0&&h<7)return'Asia'; if(h>=7&&h<13)return'London'; if(h>=13&&h<21)return'New York'; return'Sydney'; }

// ---- sync helpers (pure functions: they only look at what they are given) ----
const pad2=n=>String(n).padStart(2,'0');
function localDateStr(ms){ const d=new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function localTimeStr(ms){ const d=new Date(ms); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function utcTimeStr(ms){ return new Date(ms).toISOString().slice(11,16); }

// Brokers send exact moments (`ts`, in ms). Dates and times are then worked out in YOUR
// local time, so a trade at 2am lands on the right calendar day. Sessions (Asia / London /
// New York / Sydney) are defined in UTC hours, so those come from the UTC time instead.
function normalizeIncoming(t){
  if(typeof t.ts==='number' && isFinite(t.ts)){
    t.date=localDateStr(t.ts); t.time=localTimeStr(t.ts); t.session=sessionFor(utcTimeStr(t.ts));
  }
  return t;
}

function isOpenTrade(t){
  return (t.exit===null||t.exit===undefined||t.exit==='') && (t.pnl_override===undefined||t.pnl_override===null);
}

// A sync must never wipe what you typed. When the broker re-sends a trade, its numbers are
// refreshed but your notes, strategy, screenshot, etc. are kept. Also tidies up:
//  - old one-row-per-fill Hyperliquid records are folded into the whole position that replaces them
//  - rows that were "open" but are no longer open at the broker are removed (only when the
//    broker confirmed its open-positions list, so a failed request can never delete anything)
function mergeSynced(current, incoming, {broker, account, openOk}){
  const byId=new Map(current.map(t=>[t.id,t]));
  const incomingIds=new Set(incoming.map(t=>t.id));
  const folded=new Set(incoming.flatMap(t=>(t.fillIds||[]).map(String)));
  const merged=incoming.map(inc=>{
    const old=byId.get(inc.id) || (inc.fillIds||[]).map(f=>byId.get(String(f))).find(Boolean);
    const t={...inc};
    if(old){
      if(old.notes!==null && old.notes!==undefined) t.notes=old.notes; // '' means "reviewed, nothing to add"
      ['strategy','wentWell','wentWrong','chart','timeframe','asset_class'].forEach(k=>{ if(old[k]) t[k]=old[k]; });
    }
    return t;
  });
  const sameSource=t=>t.broker===broker && (!account || !t.account || t.account===account);
  const kept=current.filter(t=>{
    if(incomingIds.has(t.id)) return false;
    if(t.broker===broker && folded.has(String(t.id))) return false;
    if(openOk && sameSource(t) && isOpenTrade(t)) return false;
    return true;
  });
  return kept.concat(merged);
}

// Where to start reading from. Bitunix filters by when a position was OPENED, so the window
// must reach back to the oldest position still open at the last sync, or its close would never
// arrive. A 3-day overlap covers gaps between syncs; trades are matched by id, so overlap is harmless.
function computeSince(meta, allTrades, broker, account, now){
  const DAY=86400000;
  if(!meta) return now-730*DAY;
  let since=new Date(meta.date).getTime()-3*DAY;
  if(!isFinite(since)) return now-730*DAY;
  allTrades.forEach(t=>{
    if(t.broker!==broker || !isOpenTrade(t)) return;
    if(account && t.account && t.account!==account) return;
    const ts=(typeof t.ts==='number')?t.ts:Date.parse(t.date);
    if(isFinite(ts)) since=Math.min(since, ts-DAY);
  });
  return since;
}
function countFor(allTrades, broker, account){
  return allTrades.filter(t=>t.broker===broker && (!account || t.account===account)).length;
}

// One-time: older saved trades had UTC dates and no exact timestamp. Give each one a `ts`
// and move synced trades onto your local calendar day.
(function migrateTimes(){
  try{
    if(localStorage.getItem('tape_tz_v1')) return;
    let changed=false;
    trades.forEach(t=>{
      if(typeof t.ts==='number' || !t.date) return;
      const hhmm=t.time||'00:00';
      const synced=t.broker && t.broker!=='Manual';
      const ms=synced ? Date.parse(`${t.date}T${hhmm}:00Z`) : new Date(`${t.date}T${hhmm}:00`).getTime();
      if(!isFinite(ms)) return;
      t.ts=ms; changed=true;
      if(synced) normalizeIncoming(t); else t.session=sessionFor(utcTimeStr(ms));
    });
    if(changed) save();
    localStorage.setItem('tape_tz_v1','1');
  }catch(e){}
})();

// ---- access key: keeps your trade data private ----
// The server only answers requests that carry the key you set as TAPE_ACCESS_KEY in Vercel.
// It is asked for once and remembered on this device.
const ACCESS_KEY_STORAGE='tape_access_key';
let keyPromise=null, keyPromptedThisLoad=false;
function storedKey(){ try{ return (localStorage.getItem(ACCESS_KEY_STORAGE)||'').trim(); }catch(e){ return ''; } }
function getAccessKey(){
  const k=storedKey(); if(k) return Promise.resolve(k);
  if(keyPromise) return keyPromise; // several syncs at once all wait on the same prompt
  keyPromise=new Promise(resolve=>{
    const form=document.getElementById('keyForm'), input=document.getElementById('keyInput'), cancel=document.getElementById('keyCancel');
    const finish=(val)=>{ form.onsubmit=null; cancel.onclick=null; keyPromise=null; closeDialog('keyOverlay','keyContent'); resolve(val); };
    form.onsubmit=(e)=>{ e.preventDefault(); const v=input.value.trim(); if(!v) return; try{ localStorage.setItem(ACCESS_KEY_STORAGE,v); }catch(err){} finish(v); };
    cancel.onclick=()=>finish('');
    input.value=''; openDialog('keyOverlay','keyContent'); setTimeout(()=>input.focus(),60);
  });
  return keyPromise;
}
async function apiFetch(url){
  return fetch(url);
}

// ---- backup: your notes and screenshots live only in this browser ----
function downloadBackup(){
  const data={
    app:'tape', version:1, exportedAt:new Date().toISOString(), trades,
    accounts:Object.fromEntries(Object.entries(BROKER_CONFIG).filter(([,c])=>c.param).map(([n])=>[n,getAccounts(n)])),
  };
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`tape-backup-${localDateStr(Date.now())}.json`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function restoreBackup(file){
  const r=new FileReader();
  r.onload=()=>{
    let data; try{ data=JSON.parse(r.result); }catch(e){ toast('That file is not a valid backup','error'); return; }
    if(!data||!Array.isArray(data.trades)){ toast('That file is not a valid Tape backup','error'); return; }
    const byId=new Map(trades.map(t=>[t.id,t]));
    let added=0, filled=0;
    data.trades.forEach(b=>{
      if(!b||!b.id) return;
      const cur=byId.get(b.id);
      if(!cur){ trades.push(b); byId.set(b.id,b); added++; return; }
      // Already on this device: only fill in blanks, never overwrite what is here.
      ['strategy','wentWell','wentWrong','chart','timeframe'].forEach(k=>{ if(!cur[k] && b[k]){ cur[k]=b[k]; filled++; } });
      if((cur.notes===null||cur.notes===undefined) && b.notes!==null && b.notes!==undefined){ cur.notes=b.notes; filled++; }
    });
    Object.entries(data.accounts||{}).forEach(([name,list])=>{
      if(!BROKER_CONFIG[name]||!BROKER_CONFIG[name].param||!Array.isArray(list)) return;
      const have=getAccounts(name);
      list.forEach(a=>{
        if(a&&a.value&&!have.some(h=>h.value.toLowerCase()===String(a.value).toLowerCase())){
          have.push({id:'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),value:a.value});
        }
      });
      saveAccounts(name,have);
    });
    save(); render(); renderConnections();
    toast(`Restored ${added} trade${added===1?'':'s'}${filled?` and filled in ${filled} blank${filled===1?'':'s'}`:''}`);
  };
  r.readAsText(file);
}

// ---- new-trades review modal, same behavior as the original ----
// Dismissals persist in localStorage so this only reopens for genuinely
// new trades, never on every page visit.
const DISMISSED_KEY='tradelog:review-dismissed';
function loadDismissed(){ try{ return JSON.parse(localStorage.getItem(DISMISSED_KEY)||'[]'); }catch(e){ return []; } }
function dismissReview(ids){
  const d=loadDismissed();
  const next=[...d, ...ids.filter(id=>!d.includes(id))];
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
}
const REVIEW_WINDOW_MS=7*86400000;
function pendingReviewTrades(){
  // Synced trades (not manual) with no notes yet, from the last 7 days — "while they're fresh".
  // Without the time limit, syncing your full history would open a popup with every old trade.
  const dismissed=loadDismissed(), cutoff=Date.now()-REVIEW_WINDOW_MS;
  return trades.filter(t=>{
    if(t.broker==='Manual' || dismissed.includes(t.id)) return false;
    if(!(t.notes===null||t.notes===undefined)) return false;
    const when=(typeof t.closeTs==='number')?t.closeTs:t.ts;
    return typeof when==='number' && when>=cutoff;
  });
}
function fmtReviewDate(t){
  const d=new Date(t.date+'T'+(t.time||'00:00')+':00');
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const hh=String(d.getHours()).padStart(2,'0'), mm=String(d.getMinutes()).padStart(2,'0');
  return `${months[d.getMonth()]} ${d.getDate()}, ${hh}:${mm}`;
}
function checkNewTradesReview(){
  const visible=pendingReviewTrades();
  if(visible.length===0){ closeDialog('reviewOverlay','reviewContent'); return; }
  renderReviewModal(visible);
  openDialog('reviewOverlay','reviewContent');
}
function renderReviewModal(visible){
  document.getElementById('reviewCountText').textContent=`${visible.length} new trade${visible.length===1?'':'s'} synced`;
  const list=document.getElementById('reviewList'); list.innerHTML='';
  visible.forEach(t=>{
    const p=pnl(t);
    const row=document.createElement('div');
    row.className='flex items-center justify-between gap-3 rounded-xl border bg-card p-3';
    row.innerHTML=`<div class="min-w-0">
      <div class="flex items-center gap-2">
        <span class="truncate font-semibold">${t.symbol}</span>
        <span class="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${t.direction==='long'?'text-gain':'text-loss'}">${t.direction}</span>
      </div>
      <p class="mt-0.5 text-xs text-muted-foreground">${fmtReviewDate(t)}${t.broker?` · ${t.broker.toLowerCase()}`:''}${p!=null?` · <span class="${p>=0?'text-gain':'text-loss'}">${fmtMoney(p)}</span>`:''}</p>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <button data-review="${t.id}" class="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
        <svg class="icon h-3.5 w-3.5" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>Review</button>
      <button data-skip="${t.id}" aria-label="Skip this trade" class="inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
        <svg class="icon h-4 w-4" viewBox="0 0 24 24"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg></button>
    </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>{
    const id=b.dataset.review; dismissReview([id]); checkNewTradesReview(); openForm(id);
  }));
  list.querySelectorAll('[data-skip]').forEach(b=>b.addEventListener('click',()=>{
    dismissReview([b.dataset.skip]); checkNewTradesReview();
  }));
}
document.getElementById('reviewSkipAll').addEventListener('click',()=>{
  dismissReview(pendingReviewTrades().map(t=>t.id)); checkNewTradesReview();
});
document.getElementById('reviewLater').addEventListener('click',()=>{
  closeDialog('reviewOverlay','reviewContent');
});
document.getElementById('reviewXClose').addEventListener('click',()=>{
  closeDialog('reviewOverlay','reviewContent');
});
const BROKER_COLOR={Manual:'bg-broker-manual',Binance:'bg-broker-binance',BloFin:'bg-broker-blofin',Bitunix:'bg-broker-bitunix',Hyperliquid:'bg-broker-hyperliquid'};

document.getElementById('logoHome').addEventListener('click',()=>showView('log'));
document.getElementById('connBtn').addEventListener('click',()=>showView('conn'));
document.getElementById('backToJournal').addEventListener('click',()=>showView('log'));
function showView(name){
  document.getElementById('view-log').classList.toggle('hidden',name!=='log');
  document.getElementById('view-conn').classList.toggle('hidden',name!=='conn');
  if(name==='conn') renderConnections();
}

let isDarkMode=false;
document.getElementById('themeBtn').addEventListener('click',()=>{
  isDarkMode=!isDarkMode;
  document.documentElement.style.setProperty('--background', isDarkMode?'oklch(0.19 0.012 60)':'oklch(0.985 0.002 95)');
  document.documentElement.style.setProperty('--foreground', isDarkMode?'oklch(0.95 0.005 95)':'oklch(0.22 0.015 60)');
  document.documentElement.style.setProperty('--card', isDarkMode?'oklch(0.23 0.014 60)':'oklch(1 0 0)');
  document.documentElement.style.setProperty('--card-foreground', isDarkMode?'oklch(0.95 0.005 95)':'oklch(0.22 0.015 60)');
  document.documentElement.style.setProperty('--secondary', isDarkMode?'oklch(0.27 0.014 60)':'oklch(0.955 0.008 100)');
  document.documentElement.style.setProperty('--muted-foreground', isDarkMode?'oklch(0.65 0.015 80)':'oklch(0.52 0.02 80)');
  document.documentElement.style.setProperty('--border', isDarkMode?'oklch(0.32 0.014 60)':'oklch(0.91 0.008 95)');
});

document.getElementById('statusSeg').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return; statusFilter=b.dataset.status;
  document.querySelectorAll('#statusSeg button').forEach(x=>{
    x.className = x===b ? 'rounded-lg bg-primary px-3.5 py-1.5 text-sm font-medium text-primary-foreground' : 'rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground';
  });
  render();
});
document.getElementById('modeSeg').addEventListener('click',e=>{
  const b=e.target.closest('button'); if(!b) return; viewMode=b.dataset.mode;
  document.querySelectorAll('#modeSeg button').forEach(x=>{
    x.className = 'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium ' + (x===b?'bg-primary text-primary-foreground':'text-muted-foreground hover:text-foreground');
  });
  document.getElementById('statusSeg').parentElement.querySelector('#statusSeg').classList.toggle('invisible', viewMode!=='list');
  document.getElementById('listPanel').classList.toggle('hidden', viewMode!=='list');
  document.getElementById('calPanel').classList.toggle('hidden', viewMode!=='calendar');
  document.getElementById('calDayPanel').classList.toggle('hidden', viewMode!=='calendar');
  if(viewMode==='calendar') renderCalendar();
});

function toLocalInput(d){
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
document.getElementById('logTradeBtn').addEventListener('click',()=>openForm(null));
document.getElementById('cancelForm').addEventListener('click',closeForm);
document.getElementById('formXClose').addEventListener('click',closeForm);
function openForm(id){
  editingId=id;
  const f=document.getElementById('tradeForm'); f.reset();
  document.getElementById('f_entryAt').value=toLocalInput(new Date()); document.getElementById('f_exitAt').value='';
  document.getElementById('f_fees').value='0'; document.getElementById('f_timeframe').value='intraday'; document.getElementById('f_asset').value='stocks';
  resetChartPreview();
  if(id){
    const t=trades.find(x=>x.id===id);
    document.getElementById('f_symbol').value=t.symbol; document.getElementById('f_direction').value=t.direction;
    document.getElementById('f_asset').value=t.asset_class||'stocks'; document.getElementById('f_timeframe').value=t.timeframe||'intraday';
    document.getElementById('f_entry').value=t.entry; document.getElementById('f_exit').value=t.exit==null?'':t.exit;
    document.getElementById('f_qty').value=t.qty; document.getElementById('f_fees').value=t.fees||0;
    document.getElementById('f_entryAt').value=t.date&&t.time?`${t.date}T${t.time}`:toLocalInput(new Date());
    document.getElementById('f_exitAt').value=t.exitAt||'';
    document.getElementById('f_strategy').value=t.strategy||''; document.getElementById('f_notes').value=t.notes||'';
    document.getElementById('f_well').value=t.wentWell||''; document.getElementById('f_wrong').value=t.wentWrong||'';
    if(t.chart) showChartPreview(t.chart);
    document.getElementById('formTitle').textContent='Edit trade'; document.getElementById('submitBtn').textContent='Save changes';
  } else {
    document.getElementById('formTitle').textContent='Log a trade'; document.getElementById('submitBtn').textContent='Add trade';
  }
  updatePnlPreview();
  openDialog('formOverlay','formContent');
}
function closeForm(){ closeDialog('formOverlay','formContent'); }
document.getElementById('formOverlay').addEventListener('click',e=>{ if(e.target.id==='formOverlay') closeForm(); });

let pendingChart=null;
function resetChartPreview(){
  pendingChart=null;
  document.getElementById('chartPreviewWrap').classList.add('hidden');
  document.getElementById('chartDropLabel').textContent='Click to upload a chart image';
}
function showChartPreview(dataUrl){
  document.getElementById('chartPreviewImg').src=dataUrl;
  document.getElementById('chartPreviewWrap').classList.remove('hidden');
}
document.getElementById('f_chart').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f){pendingChart=undefined;return;}
  document.getElementById('chartDropLabel').textContent=f.name;
  const r=new FileReader(); r.onload=()=>{ pendingChart=r.result; showChartPreview(r.result); }; r.readAsDataURL(f);
});
document.getElementById('chartRemove').addEventListener('click',()=>{ pendingChart=null; resetChartPreview(); document.getElementById('f_chart').value=''; });

function updatePnlPreview(){
  const entry=parseFloat(document.getElementById('f_entry').value);
  const exit=parseFloat(document.getElementById('f_exit').value);
  const qty=parseFloat(document.getElementById('f_qty').value);
  const fees=parseFloat(document.getElementById('f_fees').value)||0;
  const dir=document.getElementById('f_direction').value;
  const box=document.getElementById('pnlPreview');
  if(isNaN(entry)||isNaN(exit)||isNaN(qty)){ box.classList.add('hidden'); return; }
  const p=(dir==='long'?(exit-entry):(entry-exit))*qty-fees;
  box.classList.remove('hidden');
  box.className=`rounded-xl px-4 py-2.5 text-sm font-semibold ${p>=0?'bg-gain-subtle text-gain':'bg-loss-subtle text-loss'}`;
  box.textContent=`Estimated P&L: ${p>=0?'+':''}${p.toFixed(2)}`;
}
['f_entry','f_exit','f_qty','f_fees','f_direction'].forEach(id=>document.getElementById(id).addEventListener('input',updatePnlPreview));

document.getElementById('tradeForm').addEventListener('submit',e=>{
  e.preventDefault();
  const exitVal=document.getElementById('f_exit').value;
  const entryAtVal=document.getElementById('f_entryAt').value || toLocalInput(new Date());
  const exitAtVal=document.getElementById('f_exitAt').value;
  const data={
    date:entryAtVal.slice(0,10), time:entryAtVal.slice(11,16), ts:new Date(entryAtVal).getTime(), exitAt:exitAtVal||null, session:sessionFor(utcTimeStr(new Date(entryAtVal).getTime())),
    symbol:document.getElementById('f_symbol').value.toUpperCase(), direction:document.getElementById('f_direction').value,
    asset_class:document.getElementById('f_asset').value, timeframe:document.getElementById('f_timeframe').value,
    entry:parseFloat(document.getElementById('f_entry').value), exit:exitVal===''?null:parseFloat(exitVal),
    qty:parseFloat(document.getElementById('f_qty').value), fees:parseFloat(document.getElementById('f_fees').value)||0,
    strategy:document.getElementById('f_strategy').value, notes:document.getElementById('f_notes').value,
    wentWell:document.getElementById('f_well').value, wentWrong:document.getElementById('f_wrong').value,
  };
  if(editingId){ const t=trades.find(x=>x.id===editingId); Object.assign(t,data); if(pendingChart!==undefined) t.chart=pendingChart; }
  else { trades.push(Object.assign({id:Date.now().toString(36)+Math.random().toString(36).slice(2,7),chart:pendingChart||null,broker:'Manual'},data)); }
  save(); render(); closeForm();
});

function filtered(){
  return trades.filter(t=>{ const open=pnl(t)===null; if(statusFilter==='open'&&!open)return false; if(statusFilter==='closed'&&open)return false; return true; });
}
function render(){
  const list=filtered().sort((a,b)=>a.date.localeCompare(b.date));
  const body=document.getElementById('tradeBody'), empty=document.getElementById('emptyMsg');
  body.innerHTML=''; empty.classList.toggle('hidden', list.length>0 || trades.length>0);
  document.querySelector('table').parentElement.querySelector('.hidden.py-12') && (document.getElementById('emptyMsg').classList.toggle('hidden', trades.length>0));
  [...list].reverse().forEach(t=>{
    const p=pnl(t), open=p===null; const tr=document.createElement('tr'); tr.className='border-b last:border-0';
    tr.innerHTML=`<td class="whitespace-nowrap p-2 align-middle text-muted-foreground">${new Date(t.date+'T00:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</td>
      <td class="p-2 align-middle font-semibold">${t.symbol}</td>
      <td class="p-2 align-middle"><span class="inline-flex items-center gap-1.5"><span class="h-2 w-2 rounded-full ${BROKER_COLOR[t.broker||'Manual']||'bg-broker-manual'}"></span><span class="text-xs text-muted-foreground whitespace-nowrap">${t.broker||'Manual'}</span></span></td>
      <td class="p-2 align-middle"><span class="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${t.direction==='long'?'text-gain':'text-loss'}">${t.direction}</span></td>
      <td class="p-2 align-middle"><span class="inline-flex items-center rounded-md border border-transparent px-2.5 py-0.5 text-xs font-semibold ${open?'bg-primary/90 text-primary-foreground':'bg-secondary text-secondary-foreground'}">${open?'Open':'Closed'}</span></td>
      <td class="p-2 align-middle capitalize text-muted-foreground">${t.asset_class||'crypto'}</td>
      <td class="max-w-40 truncate p-2 align-middle text-muted-foreground">${t.strategy||'—'}</td>
      <td class="whitespace-nowrap p-2 align-middle text-muted-foreground">${t.session||sessionFor(t.time)}</td>
      <td class="p-2 align-middle text-right font-semibold ${open?'text-muted-foreground':(p>=0?'text-gain':'text-loss')}">${open?'Open':fmtMoney(p)}</td>
      <td class="p-2 align-middle text-right"><div class="flex justify-end gap-1">
        ${t.chart?`<button data-view-chart="${t.id}" class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"><svg class="icon" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg></button>`:''}
        <button data-edit="${t.id}" class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"><svg class="icon" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>
        <button data-del="${t.id}" class="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"><svg class="icon text-destructive" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg></button>
      </div></td>`;
    body.appendChild(tr);
  });
  body.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{trades=trades.filter(t=>t.id!==b.dataset.del);save();render();}));
  body.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openForm(b.dataset.edit)));
  body.querySelectorAll('[data-view-chart]').forEach(b=>b.addEventListener('click',()=>{
    const t=trades.find(x=>x.id===b.dataset.viewChart); if(!t||!t.chart)return;
    const lb=document.createElement('div'); lb.className='lightbox-in fixed inset-0 z-30 flex items-center justify-center bg-black/80 p-5';
    lb.innerHTML=`<img src="${t.chart}" class="max-h-full max-w-full rounded-lg">`; lb.addEventListener('click',()=>lb.remove());
    document.body.appendChild(lb);
  }));

  const closed=trades.filter(t=>pnl(t)!==null);
  const wins=closed.filter(t=>pnl(t)>0), losses=closed.filter(t=>pnl(t)<0);
  const totalPnl=closed.reduce((s,t)=>s+pnl(t),0);
  const winRate=closed.length?(wins.length/closed.length*100):null;
  const grossWin=wins.reduce((s,t)=>s+pnl(t),0), grossLoss=Math.abs(losses.reduce((s,t)=>s+pnl(t),0));
  const pf=grossLoss>0?(grossWin/grossLoss):(grossWin>0?Infinity:null);
  const openCount=trades.length-closed.length;

  document.getElementById('stats').innerHTML = [
    statCard('<path d="M2 7h20v10H2zM16 12h.01"/>','Total P&L', fmtMoney(totalPnl), totalPnl>=0?'gain':'loss'),
    statCard('<path d="M3 17l6-6 4 4 8-8"/><path d="M17 7h4v4"/>','Win rate', winRate==null?'—':winRate.toFixed(1)+'%'),
    statCard('<path d="M3 7l6 6 4-4 8 8"/><path d="M21 17h-4v-4"/>','Profit factor', pf==null?'—':(pf===Infinity?'∞':pf.toFixed(2))),
    statCard('<path d="M3 3v18h18"/><path d="M18.7 8 12 14.7 8.7 11.4 3 17.1"/>','Trades', String(trades.length)),
  ].join('');
  document.getElementById('journalSub').textContent = trades.length===0?'Log your first trade to start building your record.':`${trades.length} trade${trades.length===1?'':'s'} logged · ${closed.length} closed`;
  document.querySelector('#statusSeg [data-status=all]').textContent=`All (${trades.length})`;
  document.querySelector('#statusSeg [data-status=open]').textContent=`Open (${openCount})`;
  document.querySelector('#statusSeg [data-status=closed]').textContent=`Closed (${closed.length})`;

  renderTradeCharts(closed);
}
function statCard(iconPath,label,value,tone){
  const color = tone==='gain'?'text-gain':tone==='loss'?'text-loss':'text-card-foreground';
  return `<div class="rounded-2xl border bg-card p-5 shadow-soft">
    <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><svg class="icon" viewBox="0 0 24 24">${iconPath}</svg>${label}</div>
    <p class="mt-2 font-display text-2xl font-bold ${color}">${value}</p></div>`;
}

function renderCalendar(){
  const y=calDate.getFullYear(), m=calDate.getMonth();
  document.getElementById('calMonth').textContent=calDate.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const byDay={}; trades.forEach(t=>{(byDay[t.date]=byDay[t.date]||[]).push(t);});
  const first=new Date(y,m,1), startPad=first.getDay(), daysInMonth=new Date(y,m+1,0).getDate();
  const grid=document.getElementById('calGrid'); grid.innerHTML='';
  ['Su','Mo','Tu','We','Th','Fr','Sa'].forEach(d=>grid.insertAdjacentHTML('beforeend',`<div class="bg-secondary p-2 text-center text-xs font-medium text-muted-foreground">${d}</div>`));
  for(let i=0;i<startPad;i++) grid.insertAdjacentHTML('beforeend','<div class="min-h-[70px] bg-secondary/50"></div>');
  for(let d=1;d<=daysInMonth;d++){
    const dateStr=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayTrades=byDay[dateStr]||[]; const dp=dayTrades.reduce((s,t)=>s+(pnl(t)||0),0);
    const sel=dateStr===calSelDay;
    const cell=document.createElement('div');
    cell.className='min-h-[70px] cursor-pointer bg-card p-2 hover:bg-accent'+(sel?' ring-2 ring-inset ring-primary':'');
    cell.innerHTML=`<div class="text-xs font-medium text-muted-foreground">${d}</div>${dayTrades.length?`<div class="mt-1.5 text-xs font-semibold ${dp>=0?'text-gain':'text-loss'}">${fmtMoney(dp)}</div>`:''}`;
    cell.addEventListener('click',()=>{calSelDay=dateStr;renderCalendar();renderCalDay(dayTrades,dateStr);});
    grid.appendChild(cell);
  }
  if(calSelDay) renderCalDay(byDay[calSelDay]||[],calSelDay);
}
function renderCalDay(list,dateStr){
  document.getElementById('calDayTitle').textContent=dateStr?`Trades on ${dateStr}`:'Select a day';
  const body=document.getElementById('calDayBody'); body.innerHTML='';
  list.forEach(t=>{const p=pnl(t);const tr=document.createElement('tr');tr.className='border-b last:border-0';
    tr.innerHTML=`<td class="p-2 align-middle">${t.symbol}</td><td class="p-2 align-middle"><span class="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold ${t.direction==='long'?'text-gain':'text-loss'}">${t.direction}</span></td><td class="p-2 align-middle">${t.entry}</td><td class="p-2 align-middle">${t.exit==null?'—':t.exit}</td><td class="p-2 align-middle text-right font-semibold ${p==null?'text-muted-foreground':(p>=0?'text-gain':'text-loss')}">${p==null?'Open':fmtMoney(p)}</td>`;
    body.appendChild(tr);});
}
document.getElementById('calPrev').addEventListener('click',()=>{calDate.setMonth(calDate.getMonth()-1);renderCalendar();});
document.getElementById('calNext').addEventListener('click',()=>{calDate.setMonth(calDate.getMonth()+1);renderCalendar();});

// Each entry maps a broker to its backend endpoint. Brokers whose only
// credential is public (like a wallet address) can take that value right
// in the browser via `param` — it's stored locally and sent with each
// sync request. Brokers needing a real secret (like Bitunix) have no
// `param` here on purpose: that secret only ever lives in Vercel's
// environment variables, never in the browser.
const BROKER_CONFIG={
  Bitunix:{endpoint:'/api/trades'},
  Hyperliquid:{endpoint:'/api/hyperliquid', param:'wallet', paramLabel:'Wallet address', paramPlaceholder:'0x…', paramKey:'hyperliquid_wallet'},
};

const CONN_KEY='tape_connections_v1';
let connMeta={}; try{connMeta=JSON.parse(localStorage.getItem(CONN_KEY)||'{}');}catch(e){connMeta={};}
function saveConnMeta(){try{localStorage.setItem(CONN_KEY,JSON.stringify(connMeta));}catch(e){}}

// ---- toast notifications, same idea as the original's sonner toasts ----
function ensureToastHost(){
  let host=document.getElementById('toastHost');
  if(!host){
    host=document.createElement('div');
    host.id='toastHost';
    host.className='fixed right-4 top-4 z-50 flex w-80 flex-col gap-2';
    document.body.appendChild(host);
  }
  return host;
}
function toast(message,type){
  const host=ensureToastHost();
  const el=document.createElement('div');
  const isErr=type==='error';
  el.className='toast-in flex items-start gap-2.5 rounded-lg border bg-card p-3.5 text-sm shadow-lift transition-all duration-300';
  el.innerHTML=`<svg class="icon mt-0.5 shrink-0" style="stroke:${isErr?'var(--loss)':'var(--gain)'}" viewBox="0 0 24 24">${isErr?'<circle cx="12" cy="12" r="10"/><path d="M12 8v5M12 16h.01"/>':'<path d="M20 6 9 17l-5-5"/>'}</svg><span class="text-card-foreground">${message}</span>`;
  host.appendChild(el);
  setTimeout(()=>{
    el.style.opacity='0'; el.style.transform='translateX(20px)';
    setTimeout(()=>el.remove(),300);
  },4000);
}

// ---- multi-account support for brokers whose credential is public (e.g. a wallet address) ----
// Stored as an array of {id, value} per broker. Old single-value storage
// (from before multiple accounts were supported) is migrated automatically.
function getAccounts(name){
  const cfg=BROKER_CONFIG[name];
  if(!cfg||!cfg.param) return [];
  try{
    const raw=localStorage.getItem(cfg.paramKey);
    if(!raw) return [];
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed)) return parsed;
    return []; // unexpected shape — treat as empty rather than crash
  }catch(e){
    // Not JSON — this is the old single-wallet format from before multi-account support. Migrate it.
    try{
      const old=localStorage.getItem(cfg.paramKey);
      if(old){ const migrated=[{id:'a1',value:old}]; localStorage.setItem(cfg.paramKey,JSON.stringify(migrated)); return migrated; }
    }catch(e2){}
    return [];
  }
}
function saveAccounts(name,accounts){
  const cfg=BROKER_CONFIG[name]; if(!cfg) return;
  try{ localStorage.setItem(cfg.paramKey,JSON.stringify(accounts)); }catch(e){}
}
function shortLabel(v){ return v.length>14?v.slice(0,6)+'…'+v.slice(-4):v; }

let syncInFlight={};
async function syncBroker(name,endpoint,silent,accountId){
  const cfg=BROKER_CONFIG[name];
  const key=accountId?`${name}:${accountId}`:name;
  let paramValue=null;
  if(cfg&&cfg.param){
    const acc=getAccounts(name).find(a=>a.id===accountId);
    if(!acc) return; // this account was removed or never connected
    paramValue=acc.value;
  }
  if(syncInFlight[key]) return;
  if(!storedKey() && !keyPromise){
    if(silent && keyPromptedThisLoad) return; // background syncs ask for the key at most once per visit
    keyPromptedThisLoad=true;
  }
  syncInFlight[key]=true;
  const btn=document.querySelector(`.sync-btn[data-sync-key="${key}"]`);
  if(btn){ btn.disabled=true; btn.textContent='Syncing…'; }
  try{
    const acct=paramValue?paramValue.toLowerCase():null;
    // Only ask for what could have changed since the last sync (see computeSince).
    const since=computeSince(connMeta[key],trades,name,acct,Date.now());
    const paramPart=cfg&&cfg.param?`&${cfg.param}=${encodeURIComponent(paramValue)}`:'';
    const res=await apiFetch(`${endpoint}?since=${since}${paramPart}`);
    const body=await res.json();
    if(!res.ok) throw new Error(body.error||'Sync failed');
    const incoming=(body.trades||[]).map(t=>normalizeIncoming({...t}));
    // "New" means a trade you have never had, not one that was merely re-sent.
    const known=new Set(trades.map(t=>t.id));
    const newOnes=incoming.filter(t=>!known.has(t.id) && !(t.fillIds||[]).some(f=>known.has(String(f))));
    trades=mergeSynced(trades,incoming,{broker:name,account:acct,openOk:body.openOk===true});
    save();
    connMeta[key]={
      date:new Date().toISOString().slice(0,10),
      count:countFor(trades,name,acct),
      balance:(typeof body.balance==='number'?body.balance:(connMeta[key]&&connMeta[key].balance!=null?connMeta[key].balance:null)),
    };
    saveConnMeta();
    render();
    if(newOnes.length>0) toast(`Imported ${newOnes.length} new trade${newOnes.length===1?'':'s'} from ${name}`);
    else if(!silent) toast('Already up to date');
    if(newOnes.length>0) checkNewTradesReview();
  }catch(err){
    // Silent background syncs stay quiet, except when the access key is the problem.
    if(!silent || err.auth) toast(`Sync failed: ${err.message||'unknown error'}`,'error');
  }finally{
    syncInFlight[key]=false;
    if(document.getElementById('view-conn').classList.contains('hidden')===false) renderConnections();
    else if(btn){ btn.disabled=false; btn.innerHTML='<svg class="icon" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>Sync now'; }
  }
}
// Background auto-sync every 10 minutes while the app is open — same
// interval the original app used. Each run only asks the backend for
// trades since the last successful sync, so it's always just the new ones.
function syncEverything(silent){
  Object.entries(BROKER_CONFIG).forEach(([name,cfg])=>{
    if(cfg.param){ getAccounts(name).forEach(acc=>syncBroker(name,cfg.endpoint,silent,acc.id)); }
    else { syncBroker(name,cfg.endpoint,silent,null); }
  });
}
function startAutoSync(){
  syncEverything(true);
  setInterval(()=>syncEverything(true), 10*60*1000);
}

function renderConnections(){
  const wrap=document.getElementById('connCards'); wrap.innerHTML='';
  Object.entries(BROKER_CONFIG).forEach(([name,cfg])=>{
    const section=document.createElement('div');
    section.className='rounded-lg border bg-card p-4 shadow-sm';

    if(!cfg.param){
      // Single server-side credential (e.g. Bitunix's API key) — one row, no accounts list.
      const meta=connMeta[name];
      section.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-3">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <svg class="icon text-muted-foreground" viewBox="0 0 24 24"><path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-10 0Z"/><path d="M12 17v5"/></svg>
            <span class="font-medium">${name}</span>
          </div>
          <p class="mt-1 truncate text-xs text-muted-foreground">${meta?`Last synced ${meta.date} · ${meta.count} trade(s)${meta.balance!=null?` · ${fmtMoney(meta.balance)}`:''}`:'Not synced yet'}</p>
        </div>
        <button data-sync-key="${name}" data-sync-name="${name}" data-endpoint="${cfg.endpoint}" class="sync-btn inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent">
          <svg class="icon" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>Sync now
        </button>
      </div>`;
      section.querySelector('.sync-btn').addEventListener('click',(e)=>{
        syncBroker(e.currentTarget.dataset.syncName,e.currentTarget.dataset.endpoint,false,null);
      });
      wrap.appendChild(section);
      return;
    }

    // Multi-account broker (e.g. Hyperliquid wallets).
    const accounts=getAccounts(name);
    const rows=accounts.map(acc=>{
      const meta=connMeta[`${name}:${acc.id}`];
      return `<div class="flex flex-wrap items-center justify-between gap-3 border-t pt-3 first:border-t-0 first:pt-0">
        <div class="min-w-0">
          <p class="truncate text-sm font-medium">${shortLabel(acc.value)}</p>
          <p class="mt-0.5 truncate text-xs text-muted-foreground">${meta?`Last synced ${meta.date} · ${meta.count} trade(s)${meta.balance!=null?` · ${fmtMoney(meta.balance)}`:''}`:'Not synced yet'}</p>
        </div>
        <div class="flex items-center gap-2">
          <button data-remove-account="${acc.id}" aria-label="Remove account" class="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"><svg class="icon h-3.5 w-3.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
          <button data-sync-key="${name}:${acc.id}" data-sync-name="${name}" data-endpoint="${cfg.endpoint}" data-account="${acc.id}" class="sync-btn inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent">
            <svg class="icon" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>Sync now
          </button>
        </div>
      </div>`;
    }).join('');
    section.innerHTML=`
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2">
          <svg class="icon text-muted-foreground" viewBox="0 0 24 24"><path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-10 0Z"/><path d="M12 17v5"/></svg>
          <span class="font-medium">${name}</span>
          <span class="inline-flex items-center rounded-md border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">${accounts.length} account${accounts.length===1?'':'s'}</span>
        </div>
        <button data-add-account="${name}" aria-label="Add account" class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background shadow-sm hover:bg-accent">
          <svg class="icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
      ${accounts.length?`<div class="mt-3 space-y-3">${rows}</div>`:`<p class="mt-2 text-xs text-muted-foreground">No accounts connected yet — click + to add your ${cfg.paramLabel.toLowerCase()}.</p>`}
      <div id="addRow-${name}" class="mt-3 hidden items-center gap-2 border-t pt-3">
        <input type="text" id="param-${name}" placeholder="${cfg.paramPlaceholder}" class="h-9 w-full max-w-xs rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
        <button data-connect="${name}" class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">Connect</button>
        <button data-cancel-add="${name}" class="inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent">Cancel</button>
      </div>`;

    section.querySelector('[data-add-account]').addEventListener('click',()=>{
      const row=section.querySelector(`#addRow-${name}`);
      row.classList.remove('hidden'); row.classList.add('flex');
      section.querySelector(`#param-${name}`).focus();
    });
    section.querySelector('[data-cancel-add]').addEventListener('click',()=>{
      const row=section.querySelector(`#addRow-${name}`);
      row.classList.add('hidden'); row.classList.remove('flex');
    });
    section.querySelector('[data-connect]').addEventListener('click',()=>{
      const val=section.querySelector(`#param-${name}`).value.trim();
      if(!val){ toast(`Enter a ${cfg.paramLabel.toLowerCase()} first`,'error'); return; }
      const list=getAccounts(name);
      if(list.some(a=>a.value.toLowerCase()===val.toLowerCase())){ toast('That account is already connected','error'); return; }
      const id='a'+Date.now().toString(36);
      list.push({id,value:val});
      saveAccounts(name,list);
      renderConnections();
      syncBroker(name,cfg.endpoint,false,id);
    });
    section.querySelectorAll('[data-sync-key]').forEach(b=>b.addEventListener('click',(e)=>{
      syncBroker(e.currentTarget.dataset.syncName,e.currentTarget.dataset.endpoint,false,e.currentTarget.dataset.account);
    }));
    section.querySelectorAll('[data-remove-account]').forEach(b=>b.addEventListener('click',(e)=>{
      const id=e.currentTarget.dataset.removeAccount;
      const list=getAccounts(name).filter(a=>a.id!==id);
      saveAccounts(name,list);
      delete connMeta[`${name}:${id}`]; saveConnMeta();
      renderConnections();
    }));
    wrap.appendChild(section);
  });

  const safety=document.createElement('div');
  safety.className='rounded-lg border bg-card p-4 shadow-sm';
  safety.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <p class="font-medium">Backup</p>
        <p class="mt-1 text-xs text-muted-foreground">Your notes, strategies and screenshots live only in this browser. Download a copy now and then.</p>
      </div>
      <div class="flex items-center gap-2">
        <button id="backupDownload" class="inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent">Download backup</button>
        <label class="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent">Restore<input id="backupRestore" type="file" accept=".json,application/json" class="hidden"></label>
      </div>
    </div>
    <div class="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
      <p class="text-xs text-muted-foreground">Access key: ${storedKey()?'saved on this device':'not entered yet'}</p>
      ${storedKey()?'<button id="forgetKey" class="text-xs text-muted-foreground underline hover:text-foreground">Remove from this device</button>':''}
    </div>`;
  safety.querySelector('#backupDownload').addEventListener('click',downloadBackup);
  safety.querySelector('#backupRestore').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) restoreBackup(f); e.target.value=''; });
  const fk=safety.querySelector('#forgetKey');
  if(fk) fk.addEventListener('click',()=>{ try{ localStorage.removeItem(ACCESS_KEY_STORAGE); }catch(err){} renderConnections(); toast('Access key removed from this device'); });
  wrap.appendChild(safety);
}

render();
checkNewTradesReview();
startAutoSync();
