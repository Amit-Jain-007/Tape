// ---- chart helpers (plain SVG, no library) ----
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
function svgPie(slices,{money=false}={}){
  const size=180,r=70,cx=90,cy=90;
  const total=slices.reduce((s,x)=>s+x.v,0)||1;
  let acc=0; const paths=slices.map(s=>{
    const a0=(acc/total)*2*Math.PI, a1=((acc+s.v)/total)*2*Math.PI; acc+=s.v;
    const large=(a1-a0)>Math.PI?1:0;
    const x0=cx+r*Math.sin(a0), y0=cy-r*Math.cos(a0), x1=cx+r*Math.sin(a1), y1=cy-r*Math.cos(a1);
    const valueLabel=money?fmtMoney(s.v):`${s.v} trade${s.v===1?'':'s'}`;
    const tip=tipRow(s.name,`${valueLabel} (${(s.v/total*100).toFixed(0)}%)`,s.color);
    return `<path data-tip="${tip.replace(/"/g,'&quot;')}" style="cursor:pointer;transition:opacity .15s" d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${s.color}" fill-opacity="${s.opacity??1}"/>`;
  }).join('');
  const legend=slices.map(s=>`<span class="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span class="h-2.5 w-2.5 rounded-full" style="background:${s.color};opacity:${s.opacity??1}"></span>${s.name}${money?` — ${fmtMoney(s.v)}`:''}</span>`).join('');
  return `<div class="flex h-full flex-col items-center justify-center gap-3"><svg viewBox="0 0 ${size} ${size}" class="h-44 w-44"><circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--secondary)"/>${paths}<circle cx="${cx}" cy="${cy}" r="${r*0.55}" fill="var(--card)"/></svg><div class="flex flex-wrap items-center justify-center gap-4">${legend}</div></div>`;
}
function chartPanel(title,subtitle,inner,extraClass=''){
  return `<div class="rounded-2xl border bg-card p-5 shadow-soft ${extraClass}">
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
// ---- moon phase: the lunar cycle split into two halves ----
// "New Moon"  = everything from the new moon up to the full moon (waxing).
// "Full Moon" = everything from the full moon back around to the next new moon (waning).
// Every trade lands in exactly one of the two. Synodic month = 29.53059 days;
// reference new moon 2000-01-06 18:14 UTC. Uses the average cycle length, which
// is off by a few hours (up to ~9), so only a trade on the switch day itself
// can occasionally land on the other side.
function moonKind(dateStr){
  const ref=Date.UTC(2000,0,6,18,14,0);
  // Read the date at the END of the day, so the day a new or full moon happens
  // already counts as that phase ("when the New Moon starts...").
  const d=new Date(dateStr+'T23:59:59').getTime(); // end of that day in your local time
  const cycle=29.53059;
  const phase=(((d-ref)/86400000)%cycle+cycle)%cycle;
  return phase<cycle/2 ? 'new' : 'full';
}

// Slice colors come from the app's own design tokens (the same broker dots
// used in the trades table), not a made-up palette. Extra accounts of the
// same broker share its color at lower opacity so they stay distinguishable.
const BROKER_VAR={Bitunix:'var(--broker-bitunix)',Hyperliquid:'var(--broker-hyperliquid)',Binance:'var(--broker-binance)',BloFin:'var(--broker-blofin)',Manual:'var(--broker-manual)'};
function capitalSlices(){
  const slices=[];
  Object.keys(BROKER_CONFIG).forEach(name=>{
    const cfg=BROKER_CONFIG[name];
    const color=BROKER_VAR[name]||'var(--primary)';
    if(cfg.param){
      let n=0;
      getAccounts(name).forEach(acc=>{
        const meta=connMeta[`${name}:${acc.id}`];
        if(meta&&typeof meta.balance==='number'){
          slices.push({name:`${name} ${shortLabel(acc.value)}`,v:meta.balance,color,opacity:Math.max(0.35,1-n*0.25)});
          n++;
        }
      });
    } else {
      const meta=connMeta[name];
      if(meta&&typeof meta.balance==='number') slices.push({name,v:meta.balance,color,opacity:1});
    }
  });
  return slices;
}
function buildCapitalPanel(){
  const slices=capitalSlices();
  const total=slices.reduce((s,x)=>s+x.v,0);
  const inner = slices.length
    ? svgPie(slices.filter(s=>s.v>0),{money:true})
    : `<div class="flex h-full items-center justify-center text-center text-sm text-muted-foreground">Sync an account to see your capital here.</div>`;
  return chartPanel('Total capital', slices.length?`${fmtMoney(total)} across ${slices.length} account${slices.length===1?'':'s'}`:'Balance across your connected accounts', inner);
}

function buildMoonPanel(closed){
  const buckets={new:[],full:[]};
  closed.forEach(t=>{ const k=moonKind(t.date); if(k) buckets[k].push(t); });
  const summarize=arr=>{
    const longs=arr.filter(t=>t.direction==='long'), shorts=arr.filter(t=>t.direction==='short');
    const sum=a=>a.reduce((s,t)=>s+pnl(t),0);
    const wr=a=>a.length?Math.round(a.filter(t=>pnl(t)>0).length/a.length*100):null;
    return {count:arr.length,total:sum(arr),long:{n:longs.length,pnl:sum(longs),wr:wr(longs)},short:{n:shorts.length,pnl:sum(shorts),wr:wr(shorts)}};
  };
  const N=summarize(buckets.new), F=summarize(buckets.full);
  const bestKey = (N.count&&F.count) ? (N.total>=F.total?'new':'full') : (N.count?'new':(F.count?'full':null));
  const tone=v=>v>=0?'text-gain':'text-loss';
  const sideRow=(label,s)=>`<div class="flex items-center justify-between text-xs">
      <span class="text-muted-foreground">${label} <span class="opacity-70">· ${s.n}</span></span>
      ${s.n?`<span><span class="text-muted-foreground">${s.wr}% win</span> <span class="ml-2 font-semibold ${tone(s.pnl)}">${fmtMoney(s.pnl)}</span></span>`:'<span class="text-muted-foreground">—</span>'}
    </div>`;
  const card=(key,emoji,title,sub,S)=>`<div class="flex flex-col justify-between rounded-xl border p-4 ${bestKey===key?'bg-gain-subtle/40':'bg-secondary/40'}">
      <div>
        <div class="flex items-center justify-between">
          <span class="text-sm font-semibold">${emoji} ${title}<span class="block text-[11px] font-normal text-muted-foreground">${sub}</span></span>
          ${bestKey===key&&(N.count&&F.count)?'<span class="rounded-full bg-gain-subtle px-2 py-0.5 text-[10px] font-semibold text-gain">Better for you</span>':''}
        </div>
        <p class="mt-2 font-display text-2xl font-bold ${S.count?tone(S.total):'text-muted-foreground'}">${S.count?fmtMoney(S.total):'—'}</p>
        <p class="text-xs text-muted-foreground">${S.count} trade${S.count===1?'':'s'}</p>
      </div>
      <div class="mt-3 space-y-1.5 border-t pt-3">${sideRow('Long',S.long)}${sideRow('Short',S.short)}</div>
    </div>`;
  const inner = (N.count||F.count)
    ? `<div class="grid h-full grid-cols-2 gap-3">${card('new','🌑','New Moon','New → Full (growing)',N)}${card('full','🌕','Full Moon','Full → New (fading)',F)}</div>`
    : `<div class="flex h-full items-center justify-center text-center text-sm text-muted-foreground">No closed trades yet.</div>`;
  return chartPanel('New moon vs full moon','Long vs short results in each half of the lunar cycle', inner);
}

let chartRange='all';
const RANGES=[['7','7D'],['30','30D'],['90','90D'],['all','All']];
function rangeBar(){
  return `<div class="mb-4 inline-flex rounded-xl border bg-card p-1 shadow-soft">${RANGES.map(([k,l])=>`<button data-range="${k}" class="rounded-lg px-3 py-1.5 text-xs font-semibold ${chartRange===k?'bg-primary text-primary-foreground':'text-muted-foreground hover:bg-accent'}">${l}</button>`).join('')}</div>`;
}
function wireRange(el,all){ el.querySelectorAll('[data-range]').forEach(b=>b.addEventListener('click',()=>{ chartRange=b.dataset.range; renderTradeCharts(all); })); }
function fmtDur(ms){ if(!isFinite(ms)||ms<=0) return '—'; const m=Math.round(ms/60000); if(m<60) return m+'m'; const h=m/60; if(h<48) return h.toFixed(1)+'h'; return (h/24).toFixed(1)+'d'; }
function strategyTable(list){
  const m={}; list.forEach(t=>{ const k=(t.strategy||'').trim(); if(!k) return; (m[k]=m[k]||[]).push(t); });
  const rows=Object.entries(m).map(([name,ts])=>{
    const ps=ts.map(pnl), rs=ts.map(rMultiple).filter(x=>x!==null);
    const w=ps.filter(p=>p>0), l=ps.filter(p=>p<0), gw=w.reduce((s,p)=>s+p,0), gl=Math.abs(l.reduce((s,p)=>s+p,0));
    const wr=w.length/ps.length, aw=w.length?gw/w.length:0, al=l.length?gl/l.length:0;
    return {name,n:ps.length,wr:wr*100,pf:gl>0?gw/gl:(gw>0?Infinity:null),exp:wr*aw-(1-wr)*al,net:ps.reduce((s,p)=>s+p,0),r:rs.length?rs.reduce((s,x)=>s+x,0)/rs.length:null};
  }).sort((a,b)=>b.net-a.net);
  if(!rows.length) return '<div class="flex h-full items-center justify-center text-sm text-muted-foreground">Tag your trades with a strategy to see this.</div>';
  const td='p-2 text-right whitespace-nowrap';
  return `<div class="h-full overflow-auto"><table class="w-full text-sm"><thead><tr class="border-b text-xs uppercase text-muted-foreground"><th class="p-2 text-left">Strategy</th><th class="${td}">Trades</th><th class="${td}">Win %</th><th class="${td}">PF</th><th class="${td}">Avg R</th><th class="${td}">Expect.</th><th class="${td}">Net</th></tr></thead><tbody>${rows.map(r=>`<tr class="border-b last:border-0"><td class="max-w-40 truncate p-2 font-semibold">${escHtml(r.name)}</td><td class="${td}">${r.n}</td><td class="${td}">${r.wr.toFixed(0)}%</td><td class="${td}">${r.pf==null?'—':r.pf===Infinity?'∞':r.pf.toFixed(2)}</td><td class="${td}">${fmtR(r.r)}</td><td class="${td} ${r.exp>=0?'text-gain':'text-loss'}">${fmtMoney(r.exp)}</td><td class="${td} font-semibold ${r.net>=0?'text-gain':'text-loss'}">${fmtMoney(r.net)}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderTradeCharts(allClosed){
  const el=document.getElementById('chartsSection');
  const cutoff=chartRange==='all'?0:Date.now()-Number(chartRange)*86400000;
  const closed=allClosed.filter(t=>{ const ts=t.closeTs||t.ts||Date.parse(t.date); return !isFinite(ts)||ts>=cutoff; });
  if(!closed.length){
    el.innerHTML=(allClosed.length?rangeBar():'')+`<div class="grid gap-4 lg:grid-cols-3">
      <div class="rounded-2xl border bg-card p-10 text-center shadow-soft lg:col-span-2 flex items-center justify-center"><p class="text-sm text-muted-foreground">Close a trade with a P&amp;L to unlock your performance charts.</p></div>
      ${buildCapitalPanel()}
    </div>`;
    wireTooltips(el); wireRange(el,allClosed);
    return;
  }
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

  const payoff=avgLoss>0?avgWin/avgLoss:null;
  const totalFees=chron.reduce((s,t)=>s+Math.abs(t.fees||0),0);
  const holds=chron.map(t=>t.closeTs-t.ts).filter(x=>isFinite(x)&&x>0);
  const avgHold=holds.length?holds.reduce((s,x)=>s+x,0)/holds.length:NaN;
  const net=chron.reduce((s,t)=>s+pnl(t),0);
  const rs=chron.map(rMultiple).filter(x=>x!==null);
  const rSum=rs.reduce((x,y)=>x+y,0);
  const rCards=rs.length?[metricCard('Avg R',fmtR(rSum/rs.length),rSum>=0?'gain':'loss'),metricCard('Total R',fmtR(rSum),rSum>=0?'gain':'loss'),metricCard('Best R',fmtR(Math.max(...rs)),'gain'),metricCard('Worst R',fmtR(Math.min(...rs)),'loss')].join(''):'<div class="rounded-2xl border border-dashed bg-card p-4 text-sm text-muted-foreground sm:col-span-2 lg:col-span-4">Add a stop-loss to your trades (click a trade → Edit) to unlock R-multiple stats.</div>';

  el.innerHTML = rangeBar()+`
    <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      ${metricCard('Net P&L (range)',fmtMoney(net),net>=0?'gain':'loss')}
      ${metricCard('Payoff ratio',payoff==null?'—':payoff.toFixed(2))}
      ${metricCard('Total fees',fmtMoney(-totalFees),'loss')}
      ${metricCard('Avg hold time',fmtDur(avgHold))}
      ${metricCard('Avg win',fmtMoney(avgWin),'gain')}
      ${metricCard('Avg loss',fmtMoney(-avgLoss),'loss')}
      ${metricCard('Expectancy / trade',fmtMoney(expectancy),expectancy>=0?'gain':'loss')}
      ${metricCard('Max drawdown',fmtMoney(maxDrawdown),'loss')}
      ${metricCard('Best trade',fmtMoney(best),'gain')}
      ${metricCard('Worst trade',fmtMoney(worst),'loss')}
      ${metricCard('Best win streak',String(bestStreak))}
      ${metricCard('Worst loss streak',String(Math.abs(worstStreak)))}
      ${rCards}
    </div>
    <div class="mt-4 grid gap-4 lg:grid-cols-3">
      ${chartPanel('Equity curve','Cumulative P&L across closed trades', svgArea(curve.map(c=>c.equity),curveDates),'lg:col-span-2')}
      ${buildCapitalPanel()}
    </div>
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
      ${buildMoonPanel(chron)}
      ${chartPanel('Trade-by-trade P&L','Every closed trade in sequence', svgBar(distribution),'lg:col-span-2')}
    </div>`;
  wireTooltips(el); wireRange(el,allClosed);
}


// ---- hero: balance, P&L snapshot, goals ----
const GOALS_KEY='tape_goals_v1';
let goals={}; try{goals=JSON.parse(localStorage.getItem(GOALS_KEY)||'{}');}catch(e){goals={};}
let goalsEditing=false, heroClosed=[];
function localDay(ts){ const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function closeDay(t){ return t.closeTs?localDay(t.closeTs):(t.exitAt?String(t.exitAt).slice(0,10):t.date); }
function sparkline(vals){
  if(vals.length<2) return '';
  const W=240,H=56,mn=Math.min(...vals),mx=Math.max(...vals),sp=(mx-mn)||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1)*W).toFixed(1)},${(H-4-(v-mn)/sp*(H-8)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="h-14 w-full"><polyline points="${pts}" fill="none" stroke="${vals[vals.length-1]>=vals[0]?'var(--gain)':'var(--loss)'}" stroke-width="2" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function goalBar(label,text,pct,color,note){
  return `<div><div class="flex items-baseline justify-between text-xs"><span class="font-semibold uppercase tracking-wide text-muted-foreground">${label}</span><span class="font-semibold">${text}</span></div>
    <div class="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary"><div class="h-full rounded-full" style="width:${Math.max(0,Math.min(100,pct))}%;background:${color}"></div></div>
    ${note?`<p class="mt-1 text-xs text-muted-foreground">${note}</p>`:''}</div>`;
}
function renderHero(closed){
  heroClosed=closed;
  const el=document.getElementById('heroSection'); if(!el) return;
  const now=Date.now(), today=localDay(now), month=today.slice(0,7), wk=localDay(now-6*86400000);
  const sum=f=>closed.filter(f).reduce((s,t)=>s+pnl(t),0);
  const dayP=sum(t=>closeDay(t)===today), weekP=sum(t=>closeDay(t)>=wk), monthP=sum(t=>closeDay(t).startsWith(month)), rolling30=sum(t=>closeDay(t)>=localDay(now-29*86400000));
  const slices=capitalSlices(), bal=slices.reduce((s,x)=>s+x.v,0);
  let cum=0; const vals=[0,...[...closed].sort((a,b)=>(a.closeTs||a.ts||0)-(b.closeTs||b.ts||0)).slice(-40).map(t=>cum+=pnl(t))];
  const tone=v=>v>0?'text-gain':v<0?'text-loss':'';
  const pill=(l,v)=>`<div><p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">${l}</p><p class="mt-0.5 font-display text-lg font-bold ${tone(v)}">${v>0?'+':''}${fmtMoney(v)}</p></div>`;
  const left=`<div class="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-2">
    <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total balance</p>
    <div class="mt-1 flex flex-wrap items-end justify-between gap-4">
      <div><p class="font-display text-4xl font-bold">${slices.length?fmtMoney(bal):'—'}</p>
      ${slices.length?'':'<p class="mt-1 text-sm text-muted-foreground">Sync an account to see your balance.</p>'}</div>
      <div class="flex gap-6">${pill('Today',dayP)}${pill('7 days',weekP)}${pill('30 days',rolling30)}</div>
    </div><div class="mt-3">${sparkline(vals)}</div></div>`;
  let right;
  if(goalsEditing){
    const inp='mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm';
    right=`<div class="rounded-2xl border bg-card p-5 shadow-soft"><p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Set goals</p>
      <label class="mt-3 block text-sm font-medium">Monthly profit target ($)<input id="goalTarget" type="number" min="0" step="any" value="${goals.target||''}" class="${inp}"></label>
      <label class="mt-3 block text-sm font-medium">Daily loss limit ($)<input id="goalLoss" type="number" min="0" step="any" value="${goals.dailyLoss||''}" class="${inp}"></label>
      <div class="mt-4 flex gap-2"><button id="goalSave" class="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground">Save</button><button id="goalCancel" class="inline-flex h-9 items-center rounded-md border border-input px-4 text-sm font-medium hover:bg-accent">Cancel</button></div></div>`;
  } else {
    const bars=[];
    if(goals.target>0) bars.push(goalBar('Monthly target',`${fmtMoney(monthP)} / ${fmtMoney(goals.target)}`,monthP/goals.target*100,'var(--gain)',monthP>=goals.target?'Target reached 🎯':`${Math.max(0,Math.round(monthP/goals.target*100))}% of the way there`));
    if(goals.dailyLoss>0){ const lost=Math.max(0,-dayP), pct=lost/goals.dailyLoss*100;
      bars.push(goalBar('Daily loss limit',`${fmtMoney(-lost)} / ${fmtMoney(-goals.dailyLoss)}`,pct,pct>=100?'var(--loss)':pct>=70?'oklch(0.75 0.15 75)':'var(--primary)',pct>=100?'Limit hit. Stop trading for today.':'')); }
    right=`<div class="rounded-2xl border bg-card p-5 shadow-soft"><div class="flex items-center justify-between"><p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Goals</p><button id="goalEdit" class="text-xs font-semibold text-primary hover:underline">${bars.length?'Edit':'Set goals'}</button></div>
      <div class="mt-3 space-y-4">${bars.join('')||'<p class="text-sm text-muted-foreground">Set a monthly profit target and a daily loss limit to stay disciplined.</p>'}</div></div>`;
  }
  el.innerHTML=`<div class="grid gap-4 lg:grid-cols-3">${left}${right}</div>`;
  const on=(id,fn)=>{ const b=document.getElementById(id); if(b) b.addEventListener('click',fn); };
  on('goalEdit',()=>{ goalsEditing=true; renderHero(heroClosed); });
  on('goalCancel',()=>{ goalsEditing=false; renderHero(heroClosed); });
  on('goalSave',()=>{ goals={target:Number(document.getElementById('goalTarget').value)||0,dailyLoss:Number(document.getElementById('goalLoss').value)||0}; try{localStorage.setItem(GOALS_KEY,JSON.stringify(goals));}catch(e){} goalsEditing=false; renderHero(heroClosed); });
}
