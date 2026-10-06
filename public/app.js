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
function pendingReviewTrades(){
  // Synced trades (not manual) that haven't had notes added yet.
  const dismissed=loadDismissed();
  return trades.filter(t=>t.broker!=='Manual' && (t.notes===null||t.notes===undefined) && !dismissed.includes(t.id));
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
    date:entryAtVal.slice(0,10), time:entryAtVal.slice(11,16), exitAt:exitAtVal||null, session:sessionFor(entryAtVal.slice(11,16)),
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
// ---- chart helpers (plain SVG, no library) ----
function fmtMoney(v){ const a=Math.abs(v); return (v<0?'-':'')+'$'+a.toLocaleString(undefined,{maximumFractionDigits:2}); }
// ---- shared floating tooltip, same behavior as the original's Recharts Tooltip ----
let tipEl=null;
function ensureTip(){
  if(tipEl) return tipEl;
  tipEl=document.createElement('div');
  tipEl.className='pointer-events-none fixed z-50 hidden rounded-lg border bg-card px-3 py-2 text-xs shadow-lift';
  document.body.appendChild(tipEl);
  return tipEl;
}
function wireTooltips(container){
  const tip=ensureTip();
  container.querySelectorAll('[data-tip]').forEach(el=>{
    el.addEventListener('mouseenter',(e)=>{
      tip.innerHTML=el.getAttribute('data-tip');
      tip.classList.remove('hidden');
      el.style.opacity='0.85';
    });
    el.addEventListener('mousemove',(e)=>{
      tip.style.left=(e.clientX+14)+'px';
      tip.style.top=(e.clientY+14)+'px';
    });
    el.addEventListener('mouseleave',()=>{
      tip.classList.add('hidden');
      el.style.opacity='1';
    });
  });
}
function tipRow(label,value,color){
  return `<div class="font-semibold text-card-foreground">${label}</div><div class="mt-0.5" style="color:${color||'var(--card-foreground)'}">${value}</div>`;
}
function svgBar(data,{horizontal=false,signed=true}={}){
  const W=520,H=200,PAD=34,LPAD=38,BPAD=18,TPAD=8;
  if(!data.length) return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="h-full w-full"></svg>`;
  const vals=data.map(d=>d.v);
  const max=Math.max(0,...vals), min=Math.min(0,...vals), range=(max-min)||1;
  if(horizontal){
    const xPAD=34, xBPAD=16;
    const rowsH=H-xBPAD;
    const bh=rowsH/data.length;
    const hTicks=niceTicks(min,max,5);
    const hMin=Math.min(min,hTicks[0]), hMax=Math.max(max,hTicks[hTicks.length-1]), hRange=(hMax-hMin)||1;
    const xOf=v=>xPAD+((v-hMin)/hRange)*(W-xPAD-10);
    const zeroX=xOf(0);
    const grid=hTicks.map(t=>`<line x1="${xOf(t).toFixed(1)}" y1="0" x2="${xOf(t).toFixed(1)}" y2="${rowsH}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/><text x="${xOf(t).toFixed(1)}" y="${H-3}" font-size="9" text-anchor="middle" fill="var(--muted-foreground)">${niceLabel(t)}</text>`).join('');
    const bars=data.map((d,i)=>{
      const x1=xOf(Math.min(0,d.v));
      const w=Math.abs(xOf(d.v)-xOf(0));
      const rowY=i*bh;
      const y=rowY+4;
      const color=d.v>=0?'var(--gain)':'var(--loss)';
      const tip=tipRow(d.label,fmtMoney(d.v),color).replace(/"/g,'&quot;');
      return `<rect data-tip="${tip}" class="row-hover" style="cursor:pointer" x="0" y="${rowY.toFixed(1)}" width="${W}" height="${bh.toFixed(1)}" fill="transparent"/>
        <rect style="pointer-events:none" x="${x1.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w,1).toFixed(1)}" height="${(bh-8).toFixed(1)}" rx="3" fill="${color}"/>
        <text style="pointer-events:none" x="4" y="${(rowY+bh/2+3).toFixed(1)}" font-size="9" fill="var(--muted-foreground)">${d.label.length>12?d.label.slice(0,11)+'…':d.label}</text>`;
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="h-full w-full">${grid}<line x1="${zeroX.toFixed(1)}" y1="0" x2="${zeroX.toFixed(1)}" y2="${rowsH}" stroke="var(--muted-foreground)" stroke-width="1"/>${bars}</svg>`;
  }
  const bw=(W-LPAD)/data.length;
  const ticks=niceTicks(min,max,5);
  const tMin=Math.min(min,ticks[0]), tMax=Math.max(max,ticks[ticks.length-1]), tRange=(tMax-tMin)||1;
  const yOf=v=>H-BPAD-((v-tMin)/tRange)*(H-BPAD-TPAD);
  const zeroY=yOf(0);
  const bars=data.map((d,i)=>{
    const x=LPAD+i*bw+2;
    const y1=yOf(Math.max(0,d.v)), y2=yOf(Math.min(0,d.v));
    const color=signed?(d.v>=0?'var(--gain)':'var(--loss)'):'var(--primary)';
    const tip=tipRow(d.label,signed?fmtMoney(d.v):d.v+'%',color);
    return `<rect data-tip="${tip.replace(/"/g,'&quot;')}" style="cursor:pointer;transition:opacity .15s" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${Math.max(bw-4,1).toFixed(1)}" height="${Math.max(y2-y1,1).toFixed(1)}" rx="2" fill="${color}"/>`;
  }).join('');
  const maxLabels=Math.max(2,Math.floor((W-LPAD)/38));
  const everyN=Math.max(1,Math.ceil(data.length/maxLabels));
  const xLabels=data.map((d,i)=>i%everyN===0?`<text x="${(LPAD+i*bw+bw/2).toFixed(1)}" y="${H-6}" font-size="9" text-anchor="middle" fill="var(--muted-foreground)">${d.label}</text>`:'').join('');
  const grid=ticks.map(t=>`<line x1="${LPAD}" y1="${yOf(t).toFixed(1)}" x2="${W}" y2="${yOf(t).toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/><text x="${LPAD-6}" y="${(yOf(t)+3).toFixed(1)}" font-size="9" text-anchor="end" fill="var(--muted-foreground)">${signed?niceLabel(t):t}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="h-full w-full">${grid}<line x1="${LPAD}" y1="${zeroY.toFixed(1)}" x2="${W}" y2="${zeroY.toFixed(1)}" stroke="var(--muted-foreground)" stroke-width="1"/>${bars}${xLabels}</svg>`;
}
// "Nice" round tick values, same idea as Recharts' default axis tick generator.
function niceTicks(min,max,count){
  if(min===max){ min-=1; max+=1; }
  const range=niceNum(max-min,false);
  const step=niceNum(range/(count-1),true);
  const niceMin=Math.floor(min/step)*step, niceMax=Math.ceil(max/step)*step;
  const out=[]; for(let v=niceMin; v<=niceMax+step*0.5; v+=step) out.push(Math.round(v*1000)/1000);
  return out;
}
function niceNum(range,round){
  const exp=Math.floor(Math.log10(range||1));
  const f=(range||1)/Math.pow(10,exp);
  let nf;
  if(round) nf = f<1.5?1:f<3?2:f<7?5:10;
  else nf = f<=1?1:f<=2?2:f<=5?5:10;
  return nf*Math.pow(10,exp);
}
function niceLabel(v){ return v===0?'0':v.toLocaleString(); }
function svgArea(series,labels,{loss:isLoss=false}={}){
  const W=760,H=200,LPAD=42,BPAD=18,TPAD=8;
  if(!series.length) return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="h-full w-full"><line x1="${LPAD}" y1="${H/2}" x2="${W}" y2="${H/2}" stroke="var(--border)"/></svg>`;
  const min=Math.min(0,...series), max=Math.max(0,...series);
  const ticks=niceTicks(min,max,5);
  const tMin=Math.min(min,ticks[0]), tMax=Math.max(max,ticks[ticks.length-1]), tRange=(tMax-tMin)||1;
  const stepX=(W-LPAD-8)/((series.length-1)||1);
  const yOf=v=>H-BPAD-((v-tMin)/tRange)*(H-BPAD-TPAD);
  const coords=series.map((v,i)=>[LPAD+i*stepX, yOf(v)]);
  const zeroY=yOf(0);
  const line=coords.map((c,i)=>(i===0?'M':'L')+c[0].toFixed(1)+','+c[1].toFixed(1)).join(' ');
  const area='M'+coords[0][0].toFixed(1)+','+zeroY.toFixed(1)+' '+coords.map(c=>'L'+c[0].toFixed(1)+','+c[1].toFixed(1)).join(' ')+' L'+coords[coords.length-1][0].toFixed(1)+','+zeroY.toFixed(1)+' Z';
  const color=isLoss?'var(--loss)':'var(--primary)';
  const fill=isLoss?'var(--loss-subtle)':'var(--accent)';
  const dots=coords.map((c,i)=>{
    const tip=tipRow(labels&&labels[i]?labels[i]:'Point '+(i+1),fmtMoney(series[i]),color);
    return `<circle data-tip="${tip.replace(/"/g,'&quot;')}" style="cursor:pointer" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="7" fill="transparent"/>`;
  }).join('');
  const maxLabels=Math.max(2,Math.floor((W-LPAD)/38));
  const everyN=labels?Math.max(1,Math.ceil(labels.length/maxLabels)):0;
  const xLabels=labels?labels.map((lb,i)=>i%everyN===0?`<text x="${coords[i][0].toFixed(1)}" y="${H-4}" font-size="9" text-anchor="middle" fill="var(--muted-foreground)">${lb}</text>`:'').join(''):'';
  const grid=ticks.map(t=>`<line x1="${LPAD}" y1="${yOf(t).toFixed(1)}" x2="${W}" y2="${yOf(t).toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/><text x="${LPAD-6}" y="${(yOf(t)+3).toFixed(1)}" font-size="9" text-anchor="end" fill="var(--muted-foreground)">${niceLabel(t)}</text>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="h-full w-full">${grid}<path d="${area}" fill="${fill}"/><line x1="${LPAD}" y1="${zeroY.toFixed(1)}" x2="${W}" y2="${zeroY.toFixed(1)}" stroke="var(--muted-foreground)" stroke-width="1"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}${xLabels}</svg>`;
}
function svgPie(slices){
  const size=180,r=70,cx=90,cy=90;
  const total=slices.reduce((s,x)=>s+x.v,0)||1;
  let acc=0; const paths=slices.map(s=>{
    const a0=(acc/total)*2*Math.PI, a1=((acc+s.v)/total)*2*Math.PI; acc+=s.v;
    const large=(a1-a0)>Math.PI?1:0;
    const x0=cx+r*Math.sin(a0), y0=cy-r*Math.cos(a0), x1=cx+r*Math.sin(a1), y1=cy-r*Math.cos(a1);
    const tip=tipRow(s.name,`${s.v} trade${s.v===1?'':'s'} (${(s.v/total*100).toFixed(0)}%)`,s.color);
    return `<path data-tip="${tip.replace(/"/g,'&quot;')}" style="cursor:pointer;transition:opacity .15s" d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${s.color}"/>`;
  }).join('');
  const legend=slices.map(s=>`<span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span class="h-2.5 w-2.5 rounded-full" style="background:${s.color}"></span>${s.name}</span>`).join('');
  return `<div class="flex h-full flex-col items-center justify-center gap-3"><svg viewBox="0 0 ${size} ${size}" class="h-44 w-44"><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--secondary)"/>${paths}<circle cx="${cx}" cy="${cy}" r="${r*0.55}" fill="var(--card)"/></svg><div class="flex items-center gap-4">${legend}</div></div>`;
}
function chartPanel(title,subtitle,inner){
  return `<div class="rounded-2xl border bg-card p-5 shadow-soft">
    <h3 class="text-sm font-bold text-card-foreground">${title}</h3>
    ${subtitle?`<p class="mt-0.5 text-xs text-muted-foreground">${subtitle}</p>`:''}
    <div class="mt-3 h-56">${inner}</div></div>`;
}
function metricCard(label,value,tone){
  const color=tone==='gain'?'text-gain':tone==='loss'?'text-loss':'text-card-foreground';
  return `<div class="rounded-2xl border bg-card p-4 shadow-soft">
    <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">${label}</p>
    <p class="mt-1 font-display text-xl font-bold ${color}">${value}</p></div>`;
}
function groupBy(list,keyFn){
  const m={}; list.forEach(t=>{ const k=keyFn(t)||'—'; const c=m[k]=m[k]||{pnl:0,wins:0,total:0}; c.pnl+=pnl(t); c.total++; if(pnl(t)>0)c.wins++; });
  return Object.entries(m).map(([name,v])=>({name,pnl:v.pnl,winRate:(v.wins/v.total*100),total:v.total}))
    .sort((a,b)=>Math.abs(b.pnl)-Math.abs(a.pnl)).slice(0,8);
}
function renderTradeCharts(closed){
  const el=document.getElementById('chartsSection');
  if(!closed.length){ el.innerHTML=`<div class="rounded-2xl border bg-card p-10 text-center shadow-soft"><p class="text-sm text-muted-foreground">Close a trade with a P&amp;L to unlock your performance charts.</p></div>`; return; }
  const chron=[...closed].sort((a,b)=>(a.date+((a.time)||'')).localeCompare(b.date+((b.time)||'')));
  let equity=0,peak=0; const curve=chron.map(t=>{ equity+=pnl(t); peak=Math.max(peak,equity); return {equity,drawdown:equity-peak}; });
  const curveDates=chron.map(t=>{ const d=new Date(t.date+'T00:00:00'); return d.toLocaleDateString(undefined,{month:'short',day:'numeric'}); });
  const maxDrawdown=Math.min(0,...curve.map(c=>c.drawdown));
  const dailyMap={}; chron.forEach(t=>{ dailyMap[t.date]=(dailyMap[t.date]||0)+pnl(t); });
  const daily=Object.entries(dailyMap).sort(([a],[b])=>a.localeCompare(b)).slice(-30).map(([k,v])=>({label:k.slice(5),v}));
  const monthlyMap={}; chron.forEach(t=>{ const k=t.date.slice(0,7); monthlyMap[k]=(monthlyMap[k]||0)+pnl(t); });
  const monthly=Object.entries(monthlyMap).sort(([a],[b])=>a.localeCompare(b)).slice(-12).map(([k,v])=>({label:k,v}));
  const wins=chron.filter(t=>pnl(t)>0), losses=chron.filter(t=>pnl(t)<0), breakeven=chron.filter(t=>pnl(t)===0);
  const winLoss=[{name:'Wins',v:wins.length,color:'var(--gain)'},{name:'Losses',v:losses.length,color:'var(--loss)'},{name:'Breakeven',v:breakeven.length,color:'var(--muted-foreground)'}].filter(s=>s.v>0);
  const bySymbol=groupBy(chron,t=>t.symbol);
  const byStrategy=groupBy(chron.filter(t=>t.strategy&&t.strategy.trim()),t=>t.strategy);
  const bySession=groupBy(chron,t=>t.session||sessionFor(t.time));
  const bySide=groupBy(chron,t=>t.direction);
  const dows=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dowAgg=dows.map(d=>({day:d,wins:0,total:0,pnl:0}));
  chron.forEach(t=>{ const idx=new Date(t.date+'T00:00:00').getDay(); const r=dowAgg[idx]; r.total++; r.pnl+=pnl(t); if(pnl(t)>0)r.wins++; });
  const byWeekday=dowAgg.filter(d=>d.total>0).map(d=>({label:d.day,v:Number((d.wins/d.total*100).toFixed(1))}));
  const distribution=chron.map((t,i)=>({label:String(i+1),v:pnl(t)}));
  const avgWin=wins.length?wins.reduce((s,t)=>s+pnl(t),0)/wins.length:0;
  const avgLoss=losses.length?Math.abs(losses.reduce((s,t)=>s+pnl(t),0)/losses.length):0;
  const winRate=chron.length?wins.length/chron.length:0;
  const expectancy=chron.length?winRate*avgWin-(1-winRate)*avgLoss:0;
  const best=chron.length?Math.max(...chron.map(t=>pnl(t))):0;
  const worst=chron.length?Math.min(...chron.map(t=>pnl(t))):0;
  let cur=0,bestStreak=0,worstStreak=0;
  chron.forEach(t=>{ const p=pnl(t); if(p>0) cur=cur>0?cur+1:1; else if(p<0) cur=cur<0?cur-1:-1; else cur=0; bestStreak=Math.max(bestStreak,cur); worstStreak=Math.min(worstStreak,cur); });

  el.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      ${metricCard('Avg win',fmtMoney(avgWin),'gain')}
      ${metricCard('Avg loss',fmtMoney(-avgLoss),'loss')}
      ${metricCard('Expectancy / trade',fmtMoney(expectancy),expectancy>=0?'gain':'loss')}
      ${metricCard('Max drawdown',fmtMoney(maxDrawdown),'loss')}
      ${metricCard('Best trade',fmtMoney(best),'gain')}
      ${metricCard('Worst trade',fmtMoney(worst),'loss')}
      ${metricCard('Best win streak',String(bestStreak))}
      ${metricCard('Worst loss streak',String(Math.abs(worstStreak)))}
    </div>
    <div class="mt-4">${chartPanel('Equity curve','Cumulative P&L across closed trades', svgArea(curve.map(c=>c.equity),curveDates))}</div>
    <div class="mt-4 grid gap-4 lg:grid-cols-2">
      ${chartPanel('Daily P&L','Last 30 trading days', svgBar(daily))}
      ${chartPanel('Drawdown','Distance below your equity high', svgArea(curve.map(c=>c.drawdown),curveDates,{loss:true}))}
      ${chartPanel('Monthly P&L','Last 12 months', svgBar(monthly))}
      ${chartPanel('Win / loss split',`${chron.length} closed trades`, svgPie(winLoss))}
      ${chartPanel('P&L by symbol','Top instruments by impact', svgBar(bySymbol.map(d=>({label:d.name,v:d.pnl})),{horizontal:true}))}
      ${chartPanel('P&L by strategy','Which setups actually pay', byStrategy.length?svgBar(byStrategy.map(d=>({label:d.name,v:d.pnl})),{horizontal:true}):'<div class="flex h-full items-center justify-center text-sm text-muted-foreground">Tag your trades with a strategy to see this.</div>')}
      ${chartPanel('Win rate by weekday','Where your edge shows up', svgBar(byWeekday,{signed:false}))}
      ${chartPanel('P&L by session','Asia / London / New York / Sydney', bySession.length?svgBar(bySession.map(d=>({label:d.name,v:d.pnl}))):'<div class="flex h-full items-center justify-center text-sm text-muted-foreground">Close some trades to see session performance.</div>')}
      ${chartPanel('Long vs short','Directional bias performance', svgBar(bySide.map(d=>({label:d.name,v:d.pnl}))))}
      ${chartPanel('Trade-by-trade P&L','Every closed trade in sequence', svgBar(distribution))}
    </div>`;
  wireTooltips(el);
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
const BROKER_ENDPOINTS=Object.fromEntries(Object.entries(BROKER_CONFIG).map(([k,v])=>[k,v.endpoint]));
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

function brokerParamValue(name){
  const cfg=BROKER_CONFIG[name];
  if(!cfg||!cfg.param) return null;
  try{ return localStorage.getItem(cfg.paramKey)||null; }catch(e){ return null; }
}
let syncInFlight={};
async function syncBroker(name,endpoint,silent){
  const cfg=BROKER_CONFIG[name];
  if(cfg&&cfg.param&&!brokerParamValue(name)) return; // not connected yet — nothing to sync with
  if(syncInFlight[name]) return;
  syncInFlight[name]=true;
  const btn=document.querySelector(`.sync-btn[data-broker="${name}"]`);
  if(btn){ btn.disabled=true; btn.textContent='Syncing…'; }
  try{
    const m=connMeta[name];
    // Only pull trades since the last sync, so background syncs stay small.
    const since=m?new Date(m.date).getTime():Date.now()-90*86400000;
    const paramPart=cfg&&cfg.param?`&${cfg.param}=${encodeURIComponent(brokerParamValue(name))}`:'';
    const res=await fetch(`${endpoint}?since=${since}${paramPart}`);
    const body=await res.json();
    if(!res.ok) throw new Error(body.error||'Sync failed');
    const incoming=body.trades||[];
    trades=trades.filter(t=>!(t.broker===name&&incoming.some(x=>x.id===t.id))).concat(incoming);
    save();
    connMeta[name]={date:new Date().toISOString().slice(0,10),count:incoming.length}; saveConnMeta();
    render();
    if(!silent || incoming.length>0){
      toast(incoming.length>0 ? `Imported ${incoming.length} trade(s) from ${name}` : 'Already up to date');
    }
    if(incoming.length>0) checkNewTradesReview();
  }catch(err){
    if(!silent) toast(`Sync failed: ${err.message||'unknown error'}`,'error');
    // Silent background syncs fail quietly — no popup interrupting the person.
  }finally{
    syncInFlight[name]=false;
    if(document.getElementById('view-conn').classList.contains('hidden')===false) renderConnections();
    else if(btn){ btn.disabled=false; btn.innerHTML='<svg class="icon" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>Sync now'; }
  }
}
// Background auto-sync every 10 minutes while the app is open — same
// interval the original app used. Each run only asks the backend for
// trades since the last successful sync (see the `since` param below),
// so it's always just the new ones, not a full re-fetch.
function startAutoSync(){
  Object.entries(BROKER_ENDPOINTS).forEach(([name,endpoint])=>syncBroker(name,endpoint,true));
  setInterval(()=>{
    Object.entries(BROKER_ENDPOINTS).forEach(([name,endpoint])=>syncBroker(name,endpoint,true));
  }, 10*60*1000);
}

function renderConnections(){
  const wrap=document.getElementById('connCards'); wrap.innerHTML='';
  Object.entries(BROKER_CONFIG).forEach(([name,cfg])=>{
    const meta=connMeta[name];
    const needsParam=!!cfg.param;
    const paramVal=needsParam?brokerParamValue(name):null;
    const connected=needsParam?!!paramVal:true; // Bitunix is "connected" once its server key is set — we can't see that from here, so just let Sync now surface the error if it's missing.
    const card=document.createElement('div');
    card.className='flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm';
    const rightSide = needsParam && !paramVal
      ? `<div class="flex items-center gap-2">
          <input type="text" id="param-${name}" placeholder="${cfg.paramPlaceholder}" class="h-9 w-48 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <button data-connect="${name}" class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90">Connect</button>
        </div>`
      : `<div class="flex items-center gap-2">
          ${needsParam?`<button data-disconnect="${name}" class="text-xs text-muted-foreground underline hover:text-foreground">disconnect</button>`:''}
          <button data-broker="${name}" data-endpoint="${cfg.endpoint}" class="sync-btn inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium shadow-sm hover:bg-accent">
            <svg class="icon" viewBox="0 0 24 24"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>Sync now
          </button>
        </div>`;
    card.innerHTML=`<div class="min-w-0">
      <div class="flex items-center gap-2">
        <svg class="icon text-muted-foreground" viewBox="0 0 24 24"><path d="M9 2v6M15 2v6M6 8h12l-1 5a5 5 0 0 1-10 0Z"/><path d="M12 17v5"/></svg>
        <span class="font-medium">${name}</span>
        <span class="inline-flex items-center rounded-md border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">${connected?'connected':'not connected'}</span>
      </div>
      <p class="mt-1 truncate text-xs text-muted-foreground">${meta?`Last synced ${meta.date} · ${meta.count} trade(s)`:(needsParam&&!paramVal?`Enter your ${cfg.paramLabel.toLowerCase()} to connect`:'Not synced yet')}</p>
    </div>
    ${rightSide}`;
    const syncBtn=card.querySelector('.sync-btn');
    if(syncBtn) syncBtn.addEventListener('click',(e)=>{ syncBroker(e.currentTarget.dataset.broker,e.currentTarget.dataset.endpoint,false); });
    const connectBtn=card.querySelector('[data-connect]');
    if(connectBtn) connectBtn.addEventListener('click',()=>{
      const val=document.getElementById(`param-${name}`).value.trim();
      if(!val){ toast(`Enter a ${cfg.paramLabel.toLowerCase()} first`,'error'); return; }
      try{ localStorage.setItem(cfg.paramKey,val); }catch(e){}
      renderConnections();
      syncBroker(name,cfg.endpoint,false);
    });
    const disconnectBtn=card.querySelector('[data-disconnect]');
    if(disconnectBtn) disconnectBtn.addEventListener('click',()=>{
      try{ localStorage.removeItem(cfg.paramKey); }catch(e){}
      renderConnections();
    });
    wrap.appendChild(card);
  });
}

render();
checkNewTradesReview();
startAutoSync();
