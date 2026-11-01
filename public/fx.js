// Theme (Graphite dark / light / auto + accent) and motion helpers.
const REDUCE=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches);
const mq=window.matchMedia?matchMedia('(prefers-color-scheme: dark)'):{matches:false,addEventListener(){}};
var seenRows=new Set(), calDir=0, goalW={};

// ---------- theme ----------
function themeMode(){ try{ return localStorage.getItem('tape_theme')||'auto'; }catch(e){ return 'auto'; } }
function paintTheme(){
  const mode=themeMode();
  document.documentElement.dataset.theme=(mode==='dark'||(mode==='auto'&&mq.matches))?'dark':'light';
  document.querySelectorAll('#themeSeg button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeMode===mode)));
}
function setTheme(mode,btn){
  if(mode===themeMode()) return;
  try{ localStorage.setItem('tape_theme',mode); }catch(e){}
  if(!document.startViewTransition||REDUCE){
    const r=document.documentElement; r.classList.add('theme-fade'); paintTheme(); setTimeout(()=>r.classList.remove('theme-fade'),320); return;
  }
  const b=btn.getBoundingClientRect(), x=b.left+b.width/2, y=b.top+b.height/2;
  const end=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
  const t=document.startViewTransition(paintTheme);
  t.ready.then(()=>document.documentElement.animate(
    {clipPath:[`circle(0px at ${x}px ${y}px)`,`circle(${end}px at ${x}px ${y}px)`]},
    {duration:550,easing:'cubic-bezier(.2,.8,.2,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{});
}
function paintAccent(){
  let a='teal'; try{ a=localStorage.getItem('tape_accent')||'teal'; }catch(e){}
  if(a==='teal') delete document.documentElement.dataset.accent; else document.documentElement.dataset.accent=a;
  document.querySelectorAll('#accentDots button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.accent===a)));
}
document.querySelectorAll('#themeSeg button').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.themeMode,b)));
document.querySelectorAll('#accentDots button').forEach(b=>b.addEventListener('click',()=>{ try{ localStorage.setItem('tape_accent',b.dataset.accent); }catch(e){} paintAccent(); }));
if(mq.addEventListener) mq.addEventListener('change',()=>{ if(themeMode()==='auto') paintTheme(); });
paintTheme(); paintAccent();

// ---------- count-up numbers (with green/red flash when a value changes) ----------
const numSeen={};
function animateNumbers(){
  document.querySelectorAll('#heroSection .font-display, #stats .font-display, #chartsSection .font-display').forEach(el=>{
    if(el.children.length) return;
    const txt=el.textContent.trim(), m=txt.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(\D*)$/); if(!m) return;
    const key=(el.previousElementSibling&&el.previousElementSibling.textContent)||(el.closest('.rounded-2xl')&&el.closest('.rounded-2xl').querySelector('p')||{}).textContent||'';
    const to=parseFloat(m[2].replace(/,/g,'')), sv=(m[1].includes('-')?-1:1)*to;
    const dec=(m[2].split('.')[1]||'').length, comma=m[2].includes(',');
    const prev=numSeen[key]; numSeen[key]={txt,to,sv};
    if(prev&&prev.txt===txt) return;
    if(REDUCE) return;
    if(prev){ el.classList.add(sv>prev.sv?'num-up':'num-down'); setTimeout(()=>el.classList.remove('num-up','num-down'),1000); }
    const from=prev?prev.to:0, t0=performance.now(), dur=prev?500:750;
    const fmt=v=>m[1]+v.toLocaleString('en-US',{minimumFractionDigits:dec,maximumFractionDigits:dec,useGrouping:comma})+m[3];
    const step=now=>{ const k=Math.min(1,(now-t0)/dur), e=1-Math.pow(1-k,3); el.textContent=k<1?fmt(from+(to-from)*e):txt; if(k<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

// ---------- entrance + chart pulse ----------
let entered=false;
function playEntranceOnce(){
  if(entered) return; entered=true; if(REDUCE) return;
  const els=[...document.querySelectorAll('#heroSection .rounded-2xl, #stats > *, #chartsSection .rounded-2xl')];
  els.forEach((el,i)=>{ el.style.animation='fadeUp .55s cubic-bezier(.2,.8,.2,1) backwards'; el.style.animationDelay=Math.min(i,16)*50+'ms'; });
  setTimeout(()=>els.forEach(el=>{ el.style.animation=''; el.style.animationDelay=''; }),1800);
}
function fxPulse(el,sig){
  if(REDUCE||el.dataset.fxSig===sig) return; el.dataset.fxSig=sig;
  el.classList.remove('fx-run'); void el.offsetWidth; el.classList.add('fx-run');
  clearTimeout(el._fxT); el._fxT=setTimeout(()=>el.classList.remove('fx-run'),1600);
}

// ---------- card spotlight + chart crosshair ----------
document.addEventListener('pointermove',e=>{
  const t=e.target; if(!t||!t.closest) return;
  const c=t.closest('.rounded-2xl.border.bg-card');
  if(c){ const r=c.getBoundingClientRect(); c.style.setProperty('--mx',(e.clientX-r.left)+'px'); c.style.setProperty('--my',(e.clientY-r.top)+'px'); }
  const h=t.closest('.chart-host');
  document.querySelectorAll('.crosshair').forEach(x=>{ if(x.parentElement!==h) x.remove(); });
  if(!h||!h.querySelector('circle[data-tip]')) return;
  let x=h.querySelector('.crosshair'); if(!x){ x=document.createElement('div'); x.className='crosshair'; h.appendChild(x); }
  x.style.left=(e.clientX-h.getBoundingClientRect().left)+'px';
},{passive:true});

// ---------- confetti when the monthly goal is hit (once per month) ----------
function celebrate(key){
  if(REDUCE) return; const k='tape_confetti_'+key;
  try{ if(localStorage.getItem(k)) return; localStorage.setItem(k,'1'); }catch(e){}
  const host=document.createElement('div'); host.className='confetti';
  const cols=['var(--gain)','var(--primary)','oklch(0.8 0.15 85)','oklch(0.7 0.18 20)','oklch(0.75 0.14 300)'];
  for(let i=0;i<48;i++){ const p=document.createElement('i');
    p.style.cssText=`left:${50+(Math.random()-.5)*20}%;background:${cols[i%5]};--dx:${(Math.random()-.5)*90}vw;--dy:${-18-Math.random()*34}vh;--r:${Math.random()*720-360}deg;animation-delay:${Math.random()*120}ms`;
    host.appendChild(p); }
  document.body.appendChild(host); setTimeout(()=>host.remove(),2300);
}
