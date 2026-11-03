// Live open positions: smart polling, keyed DOM updates (no full re-renders), risk summary, alerts.
// Independent of the trade list: ticking never calls render().
const POS={list:[],ts:0,state:'loading',err:'',fail:0,errors:{}};
const POS_KEY='tape_pos_v1', POS_INT_KEY='tape_pos_int', POS_ALERT_KEY='tape_pos_alerts';
let posMeta={}; try{ posMeta=JSON.parse(localStorage.getItem(POS_KEY)||'{}'); }catch(e){}
(()=>{ const cut=Date.now()-14*864e5; Object.keys(posMeta).forEach(k=>{ if((posMeta[k].lastSeen||0)<cut) delete posMeta[k]; }); })();
let _pmT; function savePosMeta(){ clearTimeout(_pmT); _pmT=setTimeout(()=>{ try{ localStorage.setItem(POS_KEY,JSON.stringify(posMeta)); }catch(e){} },400); }
let posInterval=Number(localStorage.getItem(POS_INT_KEY)); if(!isFinite(posInterval)||localStorage.getItem(POS_INT_KEY)===null) posInterval=10;
let posTimer=null, posBusy=false, posAbort=null, posLastClosedText='';
const posCards=new Map(), baseTitle=document.title;
const alertsOn=()=>{ try{ return localStorage.getItem(POS_ALERT_KEY)==='1'&&window.Notification&&Notification.permission==='granted'; }catch(e){ return false; } };

// ---------- helpers ----------
const dsign=p=>p.side==='long'?1:-1;
function fmtPx(v){ if(v==null||!isFinite(v)) return '—'; return v.toLocaleString('en-US',{maximumFractionDigits:v>=100?2:v>=1?4:6}); }
function fmtSigned(v){ return (v>0?'+':'')+fmtMoney(v); }
function fmtSince(ms){ if(!isFinite(ms)||ms<0) return '—'; const s=Math.floor(ms/1000), m=Math.floor(s/60), h=Math.floor(m/60), d=Math.floor(h/24);
  return d>=2?`${d}d ${h%24}h`:h>=1?`${h}h ${m%60}m`:m>=1?`${m}m ${s%60}s`:`${s}s`; }
function setT(el,v){ if(el&&el._v!==v){ el._v=v; el.textContent=v; } }
function setStyle(el,prop,v){ if(el&&el['_s'+prop]!==v){ el['_s'+prop]=v; el.style[prop]=v; } }
function effective(p){ const m=posMeta[p.id]||{}; return {sl:m.sl!=null?m.sl:p.sl, tp:m.tp!=null?m.tp:p.tp, slCustom:m.sl!=null, tpCustom:m.tp!=null}; }
function calc(p){
  const e=effective(p), mark=p.mark!=null?p.mark:p.entry, d=dsign(p), sl=e.sl, tp=e.tp;
  const riskPer=sl!=null&&p.entry?Math.abs(p.entry-sl):null;
  let a=sl,b=tp;
  if(a==null&&b==null){ a=p.entry*(1-d*0.03); b=p.entry*(1+d*0.03); } else if(a==null){ a=p.entry-(b-p.entry); } else if(b==null){ b=p.entry+(p.entry-a)*2; }
  if(!(b-a)){ a=p.entry*(1-d*0.03); b=p.entry*(1+d*0.03); }
  const f=x=>Math.max(0,Math.min(1,(x-a)/(b-a)));
  return {e, mark, sl, tp, d,
    risk:riskPer!=null?riskPer*p.qty:null,
    R:riskPer?((mark-p.entry)*d)/riskPer:null,
    pct:p.entry?((mark-p.entry)*d)/p.entry*100:null,
    liqDist:p.liq&&mark?Math.abs(mark-p.liq)/mark*100:null,
    fe:f(p.entry), fm:f(mark), a, b,
    toStop:riskPer?Math.max(0,((mark-sl)*d)/riskPer):null,           // 1 = at entry, 0 = at stop
    toTarget:tp!=null&&p.entry!==tp?((mark-p.entry)*d)/(Math.abs(tp-p.entry)):null};
}

// ---------- section shell ----------
function buildShell(){
  const el=document.getElementById('openSection'); if(!el||el._built) return; el._built=true;
  el.innerHTML=`<div class="open-head">
    <div class="open-title"><h2 class="font-display">Open positions</h2><span class="live-pill" data-f="live"><i></i><span data-f="livetxt">Connecting…</span></span><span class="open-count" data-f="count"></span></div>
    <div class="open-tools"><div class="open-total" data-f="total"></div>
      <div class="int-seg" id="intSeg" title="Refresh rate">${[[5,'5s'],[10,'10s'],[30,'30s'],[0,'Off']].map(([v,l])=>`<button data-int="${v}">${l}</button>`).join('')}</div>
      <button id="bellBtn" class="bell-btn" title="Alerts for stop, target, liquidation and loss limit"><svg class="icon" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg></button></div></div>
    <div class="pos-warn hidden" data-f="warn"></div>
    <div class="pos-grid" data-f="grid"></div>`;
  el._f={}; el.querySelectorAll('[data-f]').forEach(n=>el._f[n.dataset.f]=n);
  el.addEventListener('click',e=>{
    const ib=e.target.closest('[data-int]'); if(ib){ posInterval=Number(ib.dataset.int); try{ localStorage.setItem(POS_INT_KEY,String(posInterval)); }catch(x){} paintInt(); scheduleNext(true); return; }
    if(e.target.closest('#bellBtn')){ toggleAlerts(); return; }
    const eb=e.target.closest('[data-edit]'); if(eb) startEdit(eb);
  });
  paintInt(); paintBell(); el.hidden=false;
  el._f.grid.innerHTML='<div class="pos-skel"></div><div class="pos-skel"></div>';
}
function paintInt(){ document.querySelectorAll('#intSeg button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.int)===posInterval))); }
function paintBell(){ const b=document.getElementById('bellBtn'); if(b) b.setAttribute('aria-pressed',String(alertsOn())); }
async function toggleAlerts(){
  if(!window.Notification){ toast('This browser does not support notifications','error'); return; }
  if(alertsOn()){ try{ localStorage.setItem(POS_ALERT_KEY,'0'); }catch(e){} paintBell(); toast('Alerts off'); return; }
  const perm=Notification.permission==='granted'?'granted':await Notification.requestPermission();
  if(perm==='granted'){ try{ localStorage.setItem(POS_ALERT_KEY,'1'); }catch(e){} paintBell(); toast('Alerts on. You will be notified near your stop, target or liquidation.'); scheduleNext(true); }
  else toast('Notifications are blocked for this site in your browser settings','error');
}

// ---------- cards ----------
function makeCard(p){
  const el=document.createElement('article'); el.className='pos-card rounded-2xl border bg-card p-5 shadow-soft pos-in'; el.dataset.id=p.id;
  el.innerHTML=`<div class="pos-top"><div class="pos-title"><span class="pos-dot"></span><b data-f="symbol"></b><span class="pos-badge" data-f="badge"></span><span class="pos-broker" data-f="broker"></span></div><span class="pos-since" data-since title="Time in trade"></span></div>
  <div class="pos-main"><div><div class="pos-pnl font-display" data-f="pnl"></div><div class="pos-sub"><span data-f="pct"></span><span class="dotsep">·</span><span data-f="r"></span></div></div>
    <div class="pos-prices"><div><span>Price</span><b data-f="mark"></b></div><div><span>Entry</span><b data-f="entry"></b></div></div></div>
  <div class="pos-gauge"><i class="g-zone-l"></i><i class="g-zone-r"></i><i class="g-fill" data-f="gfill"></i><i class="g-entry" data-f="gentry"></i><i class="g-mark" data-f="gmark"></i></div>
  <div class="pos-glabels"><span data-f="gsl"></span><span data-f="gtp"></span></div>
  <div class="pos-liq"><span class="lbl">Liquidation</span><div class="liq-bar"><i data-f="liqfill"></i></div><span class="liq-txt" data-f="liqtxt"></span></div>
  <div class="pos-chips"><span data-f="size"></span><span data-f="margin"></span><span data-f="risk"></span></div>
  <div class="pos-actions"><button class="chip-btn" data-edit="sl"></button><button class="chip-btn" data-edit="tp"></button><span class="pos-flag hidden" data-f="flag">No stop set</span></div>`;
  const f={}; el.querySelectorAll('[data-f]').forEach(n=>f[n.dataset.f]=n);
  f.sl=el.querySelector('[data-edit=sl]'); f.tp=el.querySelector('[data-edit=tp]'); f.since=el.querySelector('[data-since]');
  setTimeout(()=>el.classList.remove('pos-in'),700);
  return {el,f,prev:null};
}
function patchCard(c,p){
  const k=calc(p), f=c.f, up=p.upnl;
  setT(f.symbol,p.symbol); setT(f.badge,`${p.side.toUpperCase()}${p.leverage?' '+p.leverage+'x':''}`); f.badge.dataset.side=p.side;
  setT(f.broker,p.account?`${p.broker} · ${p.account}`:p.broker);
  setT(f.pnl,fmtSigned(up)); setT(f.pct,k.pct==null?'—':`${k.pct>=0?'+':''}${k.pct.toFixed(2)}%`+(p.roe!=null?` (${p.roe>=0?'+':''}${p.roe.toFixed(1)}% ROE)`:''));
  setT(f.r,k.R==null?'no stop':`${k.R>=0?'+':''}${k.R.toFixed(2)}R`);
  setT(f.mark,fmtPx(k.mark)); setT(f.entry,fmtPx(p.entry));
  const tone=up>0?'pos':up<0?'neg':'flat'; if(c.el.dataset.tone!==tone) c.el.dataset.tone=tone;
  if(c.prev!=null&&up!==c.prev){ f.pnl.classList.remove('num-up','num-down'); void f.pnl.offsetWidth; f.pnl.classList.add(up>c.prev?'num-up':'num-down'); }
  c.prev=up;
  // gauge
  setStyle(f.gentry,'left',(k.fe*100).toFixed(2)+'%'); setStyle(f.gmark,'left',(k.fm*100).toFixed(2)+'%');
  setStyle(f.gfill,'left',(Math.min(k.fe,k.fm)*100).toFixed(2)+'%'); setStyle(f.gfill,'width',(Math.abs(k.fm-k.fe)*100).toFixed(2)+'%');
  setStyle(f.gfill,'background',up>=0?'var(--gain)':'var(--loss)');
  c.el.querySelector('.g-zone-l').style.width=(k.fe*100).toFixed(2)+'%'; c.el.querySelector('.g-zone-r').style.width=((1-k.fe)*100).toFixed(2)+'%';
  setT(f.gsl,k.sl!=null?`Stop ${fmtPx(k.sl)}`:'No stop'); setT(f.gtp,k.tp!=null?`Target ${fmtPx(k.tp)}`:'No target');
  // liquidation
  if(k.liqDist==null){ setT(f.liqtxt,'—'); setStyle(f.liqfill,'width','0%'); }
  else{ const w=Math.min(100,k.liqDist/30*100), col=k.liqDist<5?'var(--loss)':k.liqDist<15?'oklch(0.78 0.15 75)':'var(--gain)';
    setStyle(f.liqfill,'width',w.toFixed(1)+'%'); setStyle(f.liqfill,'background',col); setT(f.liqtxt,`${fmtPx(p.liq)} · ${k.liqDist.toFixed(1)}% away`); }
  setT(f.size,`Size ${fmtMoney(p.notional)}`); setT(f.margin,`Margin ${fmtMoney(p.margin)}`);
  setT(f.risk,k.risk!=null?`Risk ${fmtMoney(k.risk)}`:'Risk —');
  // editable SL / TP chips
  const slTxt=k.sl!=null?`SL ${fmtPx(k.sl)}`:'Set stop', tpTxt=k.tp!=null?`TP ${fmtPx(k.tp)}`:'Set target';
  if(!f.sl.querySelector('input')){ setT(f.sl,slTxt+' ✎'); f.sl.classList.toggle('missing',k.sl==null); f.sl.title=k.e.slCustom?'Custom stop (click to edit)':k.sl!=null?'From exchange (click to override)':'Click to set a stop'; }
  if(!f.tp.querySelector('input')){ setT(f.tp,tpTxt+' ✎'); f.tp.title=k.e.tpCustom?'Custom target (click to edit)':k.tp!=null?'From exchange (click to override)':'Click to set a target'; }
  f.flag.classList.toggle('hidden',k.sl!=null);
  return k;
}
function startEdit(btn){
  const card=btn.closest('.pos-card'), id=card.dataset.id, kind=btn.dataset.edit, p=POS.list.find(x=>x.id===id); if(!p||btn.querySelector('input')) return;
  const cur=effective(p)[kind]; btn.textContent=''; btn._v=undefined;
  const inp=document.createElement('input'); inp.type='number'; inp.step='any'; inp.value=cur!=null?cur:''; inp.placeholder=kind==='sl'?'Stop price':'Target price'; inp.className='pos-input';
  btn.appendChild(inp); inp.focus(); inp.select();
  let finished=false;
  const done=save=>{
    if(finished) return; finished=true;
    if(save){ const raw=inp.value.trim(), v=raw===''?null:Number(raw); const d=dsign(p);
      if(v!==null&&(!isFinite(v)||v<=0||(kind==='sl'&&(v-p.entry)*d>=0)||(kind==='tp'&&(v-p.entry)*d<=0))){ toast(kind==='sl'?`A ${p.side} stop must be ${p.side==='long'?'below':'above'} your entry`:`A ${p.side} target must be ${p.side==='long'?'above':'below'} your entry`,'error'); }
      else{ posMeta[id]=posMeta[id]||{}; if(v===null) delete posMeta[id][kind]; else posMeta[id][kind]=v; savePosMeta(); }
    }
    inp.remove(); const c=posCards.get(id); if(c) refreshAll();
  };
  inp.addEventListener('keydown',e=>{ if(e.key==='Enter') done(true); else if(e.key==='Escape') done(false); });
  inp.addEventListener('blur',()=>done(true)); inp.addEventListener('click',e=>e.stopPropagation());
}

// ---------- reconcile + totals ----------
function lastClosedLine(){
  const list=(typeof heroClosed!=='undefined'?heroClosed:[]).filter(t=>t.closeTs||t.exitAt);
  if(!list.length) return '';
  const t=[...list].sort((a,b)=>(b.closeTs||0)-(a.closeTs||0))[0], v=pnl(t);
  return `Last trade: ${escHtml(t.symbol)} <b class="${v>=0?'text-gain':'text-loss'}">${fmtSigned(v)}</b>`;
}
function refreshAll(){
  const el=document.getElementById('openSection'); if(!el||!el._f) return; const f=el._f;
  const ids=new Set(POS.list.map(p=>p.id));
  posCards.forEach((c,id)=>{ if(!ids.has(id)){ c.el.classList.add('pos-out'); setTimeout(()=>c.el.remove(),260); posCards.delete(id); } });
  const skel=f.grid.querySelectorAll('.pos-skel'); if(POS.ts&&skel.length) skel.forEach(s=>s.remove());
  const flat=f.grid.querySelector('.pos-flat');
  if(!POS.list.length&&POS.ts){
    if(!flat){ const d=document.createElement('div'); d.className='pos-flat rounded-2xl border bg-card p-6'; f.grid.appendChild(d); }
    f.grid.querySelector('.pos-flat').innerHTML=`<div class="flat-ring"></div><div><b class="font-display">You're flat</b><p>No open positions right now. New trades appear here live.</p><p class="flat-last">${lastClosedLine()}</p></div>`;
  } else if(flat) flat.remove();
  let total=0, ks=[];
  POS.list.forEach(p=>{ let c=posCards.get(p.id); if(!c){ c=makeCard(p); posCards.set(p.id,c); f.grid.appendChild(c.el); }
    const k=patchCard(c,p); ks.push([p,k,c]); total+=p.upnl; });
  setT(f.count,POS.list.length?`${POS.list.length} open`:''); 
  setT(f.total,POS.list.length?fmtSigned(total):''); if(f.total) f.total.className='open-total font-display '+(total>0?'text-gain':total<0?'text-loss':'');
  updateLive(); tickSince(); renderRisk(total,ks); updateTab(total); checkAlerts(total,ks);
}
function updateLive(){
  const el=document.getElementById('openSection'); if(!el||!el._f) return; const f=el._f;
  const st=POS.state, txt=st==='live'?'Live':st==='error'?'Offline':st==='loading'?'Connecting…':'Paused';
  const paused=posInterval===0&&st==='live';
  f.live.dataset.state=paused?'paused':st; setT(f.livetxt,paused?'Paused':txt);
  const errs=Object.entries(POS.errors||{});
  if(errs.length||st==='error'){ f.warn.classList.remove('hidden'); setT(f.warn,errs.length?errs.map(([k,v])=>`${k}: ${v}`).join(' · '):`Could not reach the server (${POS.err}). Retrying…`); } else f.warn.classList.add('hidden');
}
function tickSince(){
  const now=Date.now();
  posCards.forEach((c,id)=>{ const p=POS.list.find(x=>x.id===id); if(!p) return; const t0=p.openedAt||(posMeta[id]&&posMeta[id].firstSeen)||now; setT(c.f.since,'⏱ '+fmtSince(now-t0)); });
}
setInterval(()=>{ if(!document.hidden&&posCards.size) tickSince(); },1000);

// ---------- risk summary (sidebar) ----------
function renderRisk(total,ks){
  const el=document.getElementById('riskSection'); if(!el) return;
  if(!ks.length){ el.hidden=true; return; } el.hidden=false;
  if(!el._f){
    el.innerHTML=`<div class="rounded-2xl border bg-card p-5 shadow-soft risk-card"><div class="flex items-center justify-between"><p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Open risk</p><span class="live-pill" data-state="live"><i></i><span>Live</span></span></div>
      <div class="risk-pnl font-display" data-f="pnl"></div>
      <div class="risk-rows">
        <div><span>Exposure</span><b data-f="exp"></b></div><div><span>At risk to stops</span><b data-f="risk"></b></div>
        <div><span>Margin used</span><b data-f="margin"></b></div><div><span>Unprotected</span><b data-f="unp"></b></div></div>
      <div class="bias"><div class="bias-bar"><i data-f="bl"></i><i data-f="bs"></i></div><div class="bias-lbl"><span data-f="bltxt"></span><span data-f="bstxt"></span></div></div>
      <div class="risk-limit hidden" data-f="limit"><div class="flex justify-between text-xs"><span class="font-semibold uppercase tracking-wide text-muted-foreground">Daily limit (incl. open)</span><b data-f="limtxt"></b></div><div class="goal-track"><i data-f="limfill"></i></div></div></div>`;
    el._f={}; el.querySelectorAll('[data-f]').forEach(n=>el._f[n.dataset.f]=n);
  }
  const f=el._f, bal=(typeof capitalSlices==='function'?capitalSlices().reduce((s,x)=>s+x.v,0):0)||null;
  let exp=0, risk=0, margin=0, unp=0, longN=0, shortN=0;
  ks.forEach(([p,k])=>{ exp+=p.notional||0; margin+=p.margin||0; if(k.risk!=null) risk+=k.risk; else unp++; if(p.side==='long') longN+=p.notional||0; else shortN+=p.notional||0; });
  setT(f.pnl,fmtSigned(total)); f.pnl.className='risk-pnl font-display '+(total>0?'text-gain':total<0?'text-loss':'');
  setT(f.exp,fmtMoney(exp)+(bal?` · ${(exp/bal).toFixed(1)}x`:'')); setT(f.risk,fmtMoney(risk)+(bal?` · ${(risk/bal*100).toFixed(1)}%`:''));
  setT(f.margin,fmtMoney(margin)+(bal?` · ${(margin/bal*100).toFixed(0)}%`:'')); setT(f.unp,unp?`${unp} position${unp>1?'s':''}`:'None ✓'); f.unp.className=unp?'text-warn':'';
  const tot=longN+shortN||1; setStyle(f.bl,'width',(longN/tot*100).toFixed(1)+'%'); setStyle(f.bs,'width',(shortN/tot*100).toFixed(1)+'%');
  setT(f.bltxt,`Long ${(longN/tot*100).toFixed(0)}%`); setT(f.bstxt,`Short ${(shortN/tot*100).toFixed(0)}%`);
  const gl=typeof goals!=='undefined'&&goals&&goals.dailyLoss>0?goals.dailyLoss:0;
  if(gl){ const today=(typeof heroClosed!=='undefined'?heroClosed:[]).filter(t=>closeDay(t)===localDay(Date.now())).reduce((s,t)=>s+pnl(t),0);
    const loss=Math.max(0,-(today+total)), pct=loss/gl*100; f.limit.classList.remove('hidden'); f.limit._pct=pct;
    setT(f.limtxt,`${fmtMoney(-loss)} / ${fmtMoney(-gl)}`); setStyle(f.limfill,'width',Math.min(100,pct).toFixed(1)+'%'); setStyle(f.limfill,'background',pct>=100?'var(--loss)':pct>=70?'oklch(0.78 0.15 75)':'var(--primary)'); }
  else { f.limit.classList.add('hidden'); f.limit._pct=0; }
}

// ---------- tab title + favicon ----------
let _fav=null, _favOrig=null;
function setFavicon(tone){
  if(_fav===tone) return; _fav=tone; let l=document.querySelector('link[rel~="icon"]');
  if(!l){ l=document.createElement('link'); l.rel='icon'; document.head.appendChild(l); }
  if(_favOrig===null) _favOrig=l.getAttribute('href')||'';
  l.type='image/svg+xml'; l.href=tone?`data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="13" fill="${tone==='pos'?'#22c55e':'#ef4444'}"/></svg>`)}`:_favOrig;
}
function updateTab(total){
  if(!POS.list.length){ if(document.title!==baseTitle) document.title=baseTitle; setFavicon(null); return; }
  const t=`${total>=0?'+':'-'}${fmtMoney(Math.abs(total))} · ${baseTitle}`; if(document.title!==t) document.title=t; setFavicon(total>=0?'pos':'neg');
}

// ---------- alerts (re-arm automatically when the condition clears) ----------
const alerted=new Set();
function fire(key,cond,title,body){
  if(!cond){ alerted.delete(key); return; } if(alerted.has(key)) return; alerted.add(key);
  toast(`${title}: ${body}`,'error');
  if(alertsOn()&&document.hidden){ try{ new Notification(title,{body,tag:key}); }catch(e){} }
}
function checkAlerts(total,ks){
  ks.forEach(([p,k])=>{
    fire(p.id+':stop',k.toStop!=null&&k.toStop<=0.15,`${p.symbol} near your stop`,`price ${fmtPx(k.mark)}, stop ${fmtPx(k.sl)}`);
    fire(p.id+':tp',k.toTarget!=null&&k.tp!=null&&((k.mark-p.entry)*k.d)/Math.abs(k.tp-p.entry)>=0.9,`${p.symbol} near your target`,`price ${fmtPx(k.mark)}, target ${fmtPx(k.tp)}`);
    fire(p.id+':liq',k.liqDist!=null&&k.liqDist<5,`${p.symbol} close to liquidation`,`${k.liqDist!=null?k.liqDist.toFixed(1):''}% away`);
  });
  const rl=document.querySelector('#riskSection [data-f=limit]');
  fire('daily-limit',!!(rl&&rl._pct>=80),'Daily loss limit','open losses plus today are at '+(rl&&rl._pct?Math.round(rl._pct):0)+'% of your limit');
}

// ---------- polling ----------
function posUrl(){
  const w=(typeof getAccounts==='function'?getAccounts('Hyperliquid'):[]).map(a=>a.value).filter(Boolean);
  return '/api/positions'+(w.length?`?hl=${encodeURIComponent(w.join(','))}`:'');
}
function applyPositions(j){
  const now=Date.now(); POS.errors=j.errors||{}; POS.ts=j.ts||now;
  POS.list=(j.positions||[]).sort((a,b)=>((a.openedAt||(posMeta[a.id]&&posMeta[a.id].firstSeen)||now)-(b.openedAt||(posMeta[b.id]&&posMeta[b.id].firstSeen)||now)));
  POS.list.forEach(p=>{ const m=posMeta[p.id]=posMeta[p.id]||{}; if(!m.firstSeen) m.firstSeen=now; m.lastSeen=now; });
  savePosMeta();
}
async function pollPositions(){
  if(posBusy||(document.hidden&&!(alertsOn()&&POS.list.length))) return; posBusy=true;
  try{
    posAbort=new AbortController();
    const r=await fetch(posUrl(),{signal:posAbort.signal,cache:'no-store'}); if(!r.ok) throw new Error('HTTP '+r.status);
    applyPositions(await r.json()); POS.fail=0; POS.state='live'; POS.err='';
  }catch(e){ if(e.name==='AbortError'){ posBusy=false; return; } POS.fail++; POS.state='error'; POS.err=e.message; if(!POS.ts) POS.ts=Date.now(); }
  finally{ posBusy=false; }
  refreshAll(); scheduleNext();
}
function scheduleNext(now){
  clearTimeout(posTimer); if(!posInterval){ updateLive(); return; }
  if(document.hidden&&!(alertsOn()&&POS.list.length)) return;
  if(now){ pollPositions(); return; }
  const base=posInterval*1000*(POS.list.length?1:3)*(document.hidden?3:1);
  posTimer=setTimeout(pollPositions,Math.min(60000,base*Math.pow(2,Math.min(POS.fail,3))));
}
document.addEventListener('visibilitychange',()=>{ if(!document.hidden) scheduleNext(true); });
window.addEventListener('load',()=>{ buildShell(); if(posInterval) pollPositions(); else { POS.ts=Date.now(); POS.state='live'; refreshAll(); } });
