// Risk helpers + trade detail drawer
function escHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function riskOf(t){ if(t.stop==null||t.stop==='') return null; const r=Math.abs((t.entry-t.stop)*t.qty); return isFinite(r)&&r>0?r:null; }
function rMultiple(t){ const p=pnl(t), r=riskOf(t); return p===null||r===null?null:p/r; }
function fmtR(r){ return r==null?'—':(r>0?'+':'')+r.toFixed(2)+'R'; }

function closeDrawer(){ const d=document.getElementById('tradeDrawer'); if(d) d.remove(); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });

function openDrawer(id){
  const t=trades.find(x=>x.id===id); if(!t) return;
  closeDrawer();
  const p=pnl(t), open=p===null, R=rMultiple(t), risk=riskOf(t);
  const held=t.closeTs&&t.ts?t.closeTs-t.ts:(t.exitAt&&t.date&&t.time?new Date(t.exitAt)-new Date(`${t.date}T${t.time}`):NaN);
  const rr=(t.target!=null&&t.stop!=null&&t.entry!==t.stop)?Math.abs((t.target-t.entry)/(t.entry-t.stop)):null;
  const lab='text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const cell=(l,v)=>`<div><p class="${lab}">${l}</p><p class="mt-0.5 text-sm font-semibold">${v}</p></div>`;
  const block=(l,v)=>v?`<div class="mt-4"><p class="${lab}">${l}</p><p class="mt-1 whitespace-pre-wrap text-sm">${escHtml(v)}</p></div>`:'';
  const d=document.createElement('div');
  d.id='tradeDrawer'; d.className='fixed inset-0 z-40 flex justify-end bg-black/50';
  d.innerHTML=`<div class="drawer-in h-full w-full max-w-md overflow-y-auto border-l bg-background p-6 shadow-lg">
    <div class="flex items-start justify-between gap-3">
      <div><h2 class="font-display text-2xl font-bold">${escHtml(t.symbol)}</h2>
        <p class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span class="rounded-md border px-2 py-0.5 text-xs font-semibold ${t.direction==='long'?'text-gain':'text-loss'}">${t.direction}</span>${escHtml(t.broker||'Manual')} · ${t.date} ${t.time||''}</p></div>
      <button id="drawerClose" aria-label="Close" class="rounded-md p-1 text-xl leading-none text-muted-foreground hover:text-foreground">×</button>
    </div>
    <div class="mt-5 rounded-2xl border bg-card p-4"><p class="${lab}">${open?'Open trade':'Net P&amp;L'}</p>
      <p class="mt-1 font-display text-3xl font-bold ${open?'':(p>=0?'text-gain':'text-loss')}">${open?'—':fmtMoney(p)}</p>
      ${R!==null?`<p class="mt-1 text-sm font-semibold ${R>=0?'text-gain':'text-loss'}">${fmtR(R)}</p>`:''}</div>
    <div class="mt-5 grid grid-cols-2 gap-4">
      ${cell('Entry',t.entry)}${cell('Exit',open?'—':t.exit)}${cell('Quantity',t.qty)}${cell('Fees',fmtMoney(-(t.fees||0)))}
      ${cell('Stop loss',t.stop!=null?t.stop:'—')}${cell('Target',t.target!=null?t.target:'—')}
      ${cell('Risk',risk!==null?fmtMoney(risk):'—')}${cell('Planned R:R',rr!==null?'1 : '+rr.toFixed(2):'—')}
      ${cell('Hold time',fmtDur(held))}${cell('Session',t.session||sessionFor(t.time))}
      ${cell('Strategy',escHtml(t.strategy)||'—')}${cell('Timeframe',escHtml(t.timeframe)||'—')}
    </div>
    ${t.chart?`<img id="drawerImg" src="${t.chart}" class="mt-5 max-h-60 w-full cursor-zoom-in rounded-xl border bg-secondary/30 object-contain">`:''}
    ${block('What went well',t.wentWell)}${block('What went wrong',t.wentWrong)}${block('Notes',t.notes)}
    <div class="mt-6 flex gap-2">
      <button id="drawerEdit" class="inline-flex h-9 flex-1 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Edit</button>
      <button id="drawerDel" class="inline-flex h-9 items-center justify-center rounded-md border border-input px-4 text-sm font-medium text-destructive hover:bg-accent">Delete</button>
    </div></div>`;
  d.addEventListener('click',e=>{ if(e.target===d) closeDrawer(); });
  document.body.appendChild(d);
  document.getElementById('drawerClose').onclick=closeDrawer;
  document.getElementById('drawerEdit').onclick=()=>{ closeDrawer(); openForm(id); };
  document.getElementById('drawerDel').onclick=()=>{ if(!confirm('Delete this trade?')) return; trades=trades.filter(x=>x.id!==id); save(); render(); closeDrawer(); };
  const img=document.getElementById('drawerImg');
  if(img) img.onclick=()=>{ const lb=document.createElement('div'); lb.className='lightbox-in fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-5'; lb.innerHTML=`<img src="${t.chart}" class="max-h-full max-w-full rounded-lg">`; lb.onclick=()=>lb.remove(); document.body.appendChild(lb); };
}
