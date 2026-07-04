const LN2 = Math.log(2);
const N_ARM = 63, LMAX = 38;
const T1=46,T2=58,T3=63,T4=65, E1=60,E2=72,E3=78, THRESH=0.636, IFLOOR=0.547; // IFLOOR = OBF interim efficacy HR at 60 deaths (Z=2.34; Jamy & Cicic 2025); REGAL did NOT stop early
const CURRENT_EVENT_ANCHOR={count:78,date:'2026-05-11',month:63,src:'https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html',label:'Q1 2026 PR'};
const PR_SOURCES={60:{date:'2025-01-23',src:'https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html',label:'Jan 2025 interim'},
  72:{date:'2025-12-29',src:'https://www.globenewswire.com/news-release/2025/12/29/3210926/0/en/SELLAS-Life-Sciences-Provides-Update-on-Pivotal-Phase-3-REGAL-Trial-of-Galinpepimut-S-GPS-in-Acute-Myeloid-Leukemia-AML.html',label:'Dec 2025 72-event'},
  78:{date:'2026-05-11',src:CURRENT_EVENT_ANCHOR.src,label:'May 2026 78-event/Q1'}};
const HRMAX=1.0; // gauge scale
const ZFINAL=2.012;             // O'Brien-Fleming FINAL efficacy boundary (Z) ~ at 80 events
function rmst(fn,p,tau){let s=0;const h=0.25;for(let t=0;t<tau;t+=h)s+=(fn(t,p)+fn(t+h,p))/2*h;return s;} // restricted mean survival time (area under S to tau)
const ZEFF=2.34, ZFUT=0.4, STRATF=0.90; // interim efficacy boundary Z; mild futility Z; stratified log-rank efficiency
function Phi(x){const s=x<0?-1:1;x=Math.abs(x)/Math.SQRT2;const t=1/(1+0.3275911*x);const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);return 0.5*(1+s*y);}
function phi(x){return Math.exp(-x*x/2)/Math.sqrt(2*Math.PI);}
function monthLabel(m){const d=new Date(2021,1,1);d.setMonth(d.getMonth()+Math.round(Math.min(m,120)));return "("+d.toLocaleString('en-US',{month:'short',year:'numeric'})+")";}
function monthToDate(m){const d=new Date(2021,1,1);d.setMonth(d.getMonth()+Math.round(Math.min(m,120)));return d;}
function fmtCalMonth(m){return monthToDate(m).toLocaleString('en-US',{month:'short',year:'numeric'});}
function fmtCalRange(mLo,mHi){
  const dLo=monthToDate(mLo),dHi=monthToDate(mHi);
  if(dLo.getFullYear()===dHi.getFullYear())return dLo.toLocaleString('en-US',{month:'short'})+'–'+dHi.toLocaleString('en-US',{month:'short',year:'numeric'});
  return fmtCalMonth(mLo)+'–'+fmtCalMonth(mHi);
}
// Poisson likelihood on event-count increments (models the counting noise; SD≈√λ)
function lpois(k,lam){if(lam<=1e-9)return k===0?0:-1e9;let lf=0;for(let i=2;i<=k;i++)lf+=Math.log(i);return -lam+k*Math.log(lam)-lf;}
function pois(k,lam){return Math.exp(lpois(k,lam));}
function poisLE(k,lam){let s=0;for(let j=0;j<=k;j++)s+=pois(j,lam);return s;}

// ---------- enrollment ----------
function rawC(x,m,k){return 1/(1+Math.exp(-k*(x-m)));}
function enrollCDF(x,m,k){if(x<=0)return 0;if(x>=LMAX)return 1;const c0=rawC(0,m,k),cL=rawC(LMAX,m,k);return Math.min(1,Math.max(0,(rawC(x,m,k)-c0)/(cL-c0)));}

// ---------- survival ----------
function Stx(t){return 0.45+0.55*Math.exp(-LN2*t/16);} // OS after allo-transplant in CR2 (~45% cured)
function sBATbase(t,p){if(t<=0)return 1;const kk=p.batk||1;const lam=p.bat/Math.pow(LN2,1/kk);return p.batc+(1-p.batc)*Math.exp(-Math.pow(t/lam,kk));} // Weibull (k=1 => exponential)
function sGPSbase(t,p){if(t<=0)return 1;const d=p.delay;if(t<=d)return sBATbase(t,p);const b=sBATbase(d,p);return b*(p.gpsc+(1-p.gpsc)*Math.exp(-LN2*(t-d)/p.gpsu));}
// ITT: transplanted patients (a fraction of each arm) contribute their better survival
function txMix(t,p,base){return (p.xtx>0 && p.osmode!=='censor') ? p.xtx*Stx(t)+(1-p.xtx)*base : base;}
function sBAT(t,p){if(t<=0)return 1;return txMix(t,p,sBATbase(t,p));}
function sGPS(t,p){if(t<=0)return 1;return txMix(t,p,sGPSbase(t,p));}
function poolS(t,p){return 0.5*sBAT(t,p)+0.5*sGPS(t,p);}

// ---------- events (with transplant handling + dropout censoring) ----------
function armDeaths(T,p,baseFn,bins){bins=bins||180;let d=0;for(let i=0;i<bins;i++){const e0=LMAX*i/bins,e1=LMAX*(i+1)/bins,em=(e0+e1)/2,w=enrollCDF(e1,p.mid,p.k)-enrollCDF(e0,p.mid,p.k);if(em>=T)continue;const f=T-em;let pd;
    if(p.xtx>0 && p.osmode==='censor'){ // transplanted pts censored ~month 6 post-enrollment
      pd=(1-p.xtx)*(1-baseFn(f,p)) + p.xtx*(1-baseFn(Math.min(f,6),p));
    } else { pd = 1 - txMix(f,p,baseFn(f,p)); }
    d+=N_ARM*w*pd;}
  return d;}
function eventsAt(T,p,bins){const raw=armDeaths(T,p,sBATbase,bins)+armDeaths(T,p,sGPSbase,bins);return raw*(1-p.cens*0.5);}
// Forward projection locked to confirmed PR anchors (78 @ m63); model increments only beyond anchor
function eventsAtAnchored(T,p,bins){bins=bins||110;if(T<T3)return eventsAt(T,p,bins);const modelAtAnchor=eventsAt(T3,p,bins);return E3+(eventsAt(T,p,bins)-modelAtAnchor);}
function T80PrPace(){const rate=(E3-E2)/(T3-T2);return T3+(80-E3)/rate;}
function T80(p){let lo=T3,hi=130;if(eventsAtAnchored(hi,p,110)<80)return hi;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(eventsAtAnchored(m,p,110)<80)lo=m;else hi=m;}return (lo+hi)/2;}
function t80Analysis(p,cutoff,bins){bins=bins||110;const t80=T80(p);if(t80<=cutoff)return{t80,Tan:t80,Dan:80};return{t80,Tan:cutoff,Dan:eventsAtAnchored(cutoff,p,bins)};}
function mcPathToT80(q,bins){bins=bins||110;let t=T3;while(eventsAtAnchored(t,q,bins)<80&&t<120)t+=0.5;return t;}

// ---------- HR (Pike) ----------
function hazardRatio(T,p){const h=0.5;let Ob=0,Og=0,Eb=0,Eg=0;for(let t=0;t<T;t+=h){const av=enrollCDF(T-t,p.mid,p.k);const nb=N_ARM*av*sBAT(t,p),ng=N_ARM*av*sGPS(t,p),nt=nb+ng;if(nt<1e-9)continue;const db=N_ARM*av*(sBAT(t,p)-sBAT(t+h,p)),dg=N_ARM*av*(sGPS(t,p)-sGPS(t+h,p)),dt=db+dg;Ob+=db;Og+=dg;Eb+=dt*nb/nt;Eg+=dt*ng/nt;}if(Eb<1e-6||Eg<1e-6)return NaN;return (Og/Eg)/(Ob/Eb);}
// HR gauge display state: separates interim IA floor (@ m46) from final readout threshold
function hrGaugeState(p,cutoff,bins){bins=bins||110;const hrInterim=hazardRatio(T1,p),hrM58=hazardRatio(T2,p);const{t80,Tan,Dan}=t80Analysis(p,cutoff,bins);const aFin=analyzeLR(Tan,p);const hrReadout=isNaN(aFin.hr)?null:aFin.hr;const hrForFinal=hrReadout!=null?hrReadout:hrM58;return{hrInterim,hrM58,hrReadout,Tan,Dan,t80,readoutSameAsM58:Tan===T2,interimClearsFloor:!isNaN(hrInterim)&&hrInterim>IFLOOR,interimWouldStop:!isNaN(hrInterim)&&hrInterim<=IFLOOR,hrForFinal,finalClears:!isNaN(hrForFinal)&&hrForFinal<THRESH};}
// combined point-HR (Pike) + proper stratified log-rank expected z at analysis time T
function analyzeLR(T,p){const h=1;const sf=(p.stratF!=null?p.stratF:STRATF),fh=!!p.fh;let Ob=0,Og=0,Eb=0,Eg=0,U=0,V=0;for(let t=0;t<T;t+=h){const av=enrollCDF(T-t,p.mid,p.k);const nb=N_ARM*av*sBAT(t,p),ng=N_ARM*av*sGPS(t,p),nt=nb+ng;if(nt<1e-9)continue;const db=N_ARM*av*(sBAT(t,p)-sBAT(t+h,p)),dg=N_ARM*av*(sGPS(t,p)-sGPS(t+h,p)),dt=db+dg;Ob+=db;Og+=dg;Eb+=dt*nb/nt;Eg+=dt*ng/nt;const wt=fh?(1-poolS(t,p)):1;U+=wt*(db-dt*nb/nt);V+=wt*wt*dt*(nb/nt)*(ng/nt);}const hr=(Eb<1e-9||Eg<1e-9)?NaN:(Og/Eg)/(Ob/Eb);const z=(V<1e-9)?0:(U/Math.sqrt(V))*Math.sqrt(sf);return{hr:hr,z:z};}
// conditional power given the interim landed in the CONTINUE zone [zfut,ZEFF]; returns P(continue) & conditional power
function condPow(thIA,th80,Dan,zfut){const zf=(zfut!=null?zfut:ZFUT);const rho=Math.sqrt(60/Dan),s=Math.sqrt(Math.max(1e-6,1-rho*rho));let num=0,den=0;const M=24,lo=zf,hi=ZEFF,h=(hi-lo)/M;for(let i=0;i<=M;i++){const z=lo+i*h,wt=(i===0||i===M)?1:(i%2?4:2),f=phi(z-thIA);den+=wt*f;num+=wt*f*Phi((th80+rho*(z-thIA)-ZFINAL)/s);}den*=h/3;num*=h/3;return{Pc:den, cp:den>1e-12?num/den:0};}
function Tfor(events,p){const evAt=(T,b)=>events>=E3?eventsAtAnchored(T,p,b):eventsAt(T,p,b);let lo=events>=E3?T3:20,hi=130;if(evAt(hi,60)<events)return hi;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(evAt(m,60)<events)lo=m;else hi=m;}return (lo+hi)/2;}

// ---------- medians ----------
function medianOf(fn,p){let prev=1;for(let t=0.1;t<=240;t+=0.1){const s=fn(t,p);if(s<=0.5){const t0=t-0.1;return t0+(prev-0.5)/(prev-s)*0.1;}prev=s;}return null;}

// ---------- consistency / verdict ----------
function consistent(p,bins){
  bins=bins||110;
  const e1=eventsAt(T1,p,bins);if(!Number.isFinite(e1)||Math.abs(e1-E1)>4)return false;
  const e2=eventsAt(T2,p,bins);if(!Number.isFinite(e2)||Math.abs(e2-E2)>3)return false;
  const e3=eventsAt(T3,p,bins);if(!Number.isFinite(e3)||Math.abs(e3-E3)>3)return false;
  const e4=eventsAt(T4,p,bins);if(!Number.isFinite(e4)||e4>=80||e4<77)return false;
  return true;
}
function passesVerdict(p,bins){
  if(!consistent(p,bins))return false;
  const pm=medianOf(poolS,p);
  return pm===null||pm>13.5;
}
// BAT mOS ceiling from QUAZAR CR1 placebo (14.8m) + Kurosawa CR2 caps — matches red-hatch slider bands
const BAT_MED_CAP=15;
function isBiologicallyPlausible(p){
  const bm=medianOf(sBAT,p);
  if(bm!==null&&bm>BAT_MED_CAP)return false;
  return true;
}
// ---------- auto-fit ----------
function autofitCure(p){const test=c=>eventsAt(T2,Object.assign({},p,{gpsc:c}));const lo=test(0),hi=test(0.9);if(lo<E2)return{sol:null,reason:"even 0% GPS cure gives only "+lo.toFixed(0)+" events by m58 — BAT too strong for the data"};if(hi>E2)return{sol:null,reason:"even 90% GPS cure still gives "+hi.toFixed(0)+" events by m58 — BAT too weak / uncured mOS too low"};let a=0,b=0.9;for(let i=0;i<40;i++){const m=(a+b)/2;if(test(m)>E2)a=m;else b=m;}return{sol:(a+b)/2};}

function eventErr(p){
  const e1=eventsAt(T1,p,110),e2=eventsAt(T2,p,110),e3=eventsAt(T3,p,110),e4=eventsAt(T4,p,110);
  const pm=medianOf(poolS,p);
  // Penalize both sides of the e65 window [77,80) — old solver only punished e4>79.5 and
  // could land on e65≈77.1 (razor-thin margin that breaks under slider step snap).
  let err=Math.pow(e1-E1,2)+Math.pow(e2-E2,2)+Math.pow(e3-E3,2)+Math.max(0,e4-79.5)*400+Math.max(0,77-e4)*400;
  if(pm!==null&&pm<13.5)err+=Math.pow(13.5-pm,2)*8;
  return err;
}
function bisectField(p,field,metric,target,lo,hi,steps){
  steps=steps||36;
  const test=v=>metric(Object.assign({},p,{[field]:v}));
  const mLo=test(lo),mHi=test(hi);
  if((mLo-target)*(mHi-target)>0)return null;
  let a=lo,b=hi;
  for(let i=0;i<steps;i++){const m=(a+b)/2;if(test(m)>target)a=m;else b=m;}
  return (a+b)/2;
}
function batcFor3yrCap(p,bat,target3yr){
  let lo=0,hi=0.35;
  for(let i=0;i<28;i++){const m=(lo+hi)/2,c=Object.assign({},p,{bat,batc:m});if(sBAT(36,c)*100>target3yr)hi=m;else lo=m;}
  return (lo+hi)/2;
}
// Joint (BAT mOS, GPS uncured) grid — do NOT pin e58 exactly via gpsu bisect; that forced
// e63/e65 onto the tolerance floor (e65≈77.1) so default/best failed under tiny perturbations.
function inverseSolve(base, cap3){
  const p=Object.assign({},base);
  let best=null,bestErr=1e9;
  for(let bat=6;bat<=14.01;bat+=0.25){
    const zeroTail=Object.assign({},p,{bat,batc:0});
    // ~1pp slack: bat=13 / batc=0 yields ~14.7% 3-yr OS under a nominal 14% cap
    if(sBAT(36,zeroTail)*100>cap3+1)continue;
    const batc=batcFor3yrCap(p,bat,cap3);
    for(let gpsu=8;gpsu<=60.01;gpsu+=0.25){
      const trial=Object.assign({},p,{bat,batc,gpsu});
      const err=eventErr(trial);
      if(err<bestErr){bestErr=err;best=Object.assign({},trial);}
    }
  }
  if(!best)return{sol:null,err:bestErr,reason:"No (BAT, GPS uncured) pair fits the anchored events with BAT 3-yr OS ≤ "+cap3+"%. Try raising the cap or lowering cure fraction."};
  return{sol:best,err:bestErr};
}

export {
  LN2, N_ARM, LMAX, T1, T2, T3, T4, E1, E2, E3, THRESH, IFLOOR,
  CURRENT_EVENT_ANCHOR, PR_SOURCES, HRMAX, ZFINAL, rmst, ZEFF, ZFUT, STRATF,
  Phi, phi, monthLabel, monthToDate, fmtCalMonth, fmtCalRange,
  lpois, pois, poisLE, rawC, enrollCDF, Stx, sBATbase, sGPSbase, txMix,
  sBAT, sGPS, poolS, armDeaths, eventsAt, eventsAtAnchored,
  T80PrPace, T80, t80Analysis, mcPathToT80,
  hazardRatio, analyzeLR, hrGaugeState, condPow, Tfor, medianOf, consistent, passesVerdict, BAT_MED_CAP, isBiologicallyPlausible, autofitCure,
  eventErr, bisectField, batcFor3yrCap, inverseSolve
};
