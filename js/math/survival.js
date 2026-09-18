import { TRIAL, DEFAULT_ELN } from "../data/model-config.js";

const LN2 = Math.log(2);
const N_TOTAL = TRIAL.randomized, N_ARM = TRIAL.perArm, LMAX = TRIAL.enrollmentEndMonth;
const T1=TRIAL.eventMonths.interim,T2=TRIAL.eventMonths.december2025,T3=TRIAL.eventMonths.may2026,T4=TRIAL.eventMonths.august2026;
const E1=TRIAL.eventCounts.interim,E2=TRIAL.eventCounts.december2025,E3=TRIAL.eventCounts.may2026, THRESH=TRIAL.designHr, IFLOOR=0.547; // IFLOOR is a modeled translation, not a disclosed interim result
const CURRENT_EVENT_ANCHOR={count:78,date:'2026-05-11',month:63,src:'https://www.globenewswire.com/news-release/2026/05/12/3293399/0/en/sellas-life-sciences-reports-first-quarter-2026-financial-results-and-provides-corporate-update.html',label:'Q1 2026 PR'};
const CURRENT_EVENT_STATUS={countLower:78,countUpper:79,date:'2026-08-11',month:T4,src:'https://ir.sellaslifesciences.com/news/News-Details/2026/SELLAS-Life-Sciences-Reports-Second-Quarter-2026-Financial-Results-and-Provides-Corporate-Update/default.aspx',label:'model interpretation of “approaching” the 80th event',caveat:'SELLAS did not disclose a numeric count or data cutoff. Treating the phrase as 78–79 events on Aug 11 is an explicit, optional model assumption.'};
const CURRENT_PUBLIC_SEARCH={date:'2026-09-18',month:67.3,label:'no official 80th-event or topline announcement found',caveat:'Official IR/SEC announcement-status observation only. It is not encoded as an event-count bound because database lock and reporting can lag the event.'};
const PR_SOURCES={60:{date:'2025-01-23',src:'https://www.globenewswire.com/news-release/2025/01/23/3014244/0/en/SELLAS-Life-Sciences-Announces-Positive-Outcome-of-Interim-Analysis-for-its-Pivotal-Phase-3-REGAL-Trial-of-GPS-in-Acute-Myeloid-Leukemia.html',label:'Jan 2025 interim'},
  72:{date:'2025-12-29',src:'https://www.globenewswire.com/news-release/2025/12/29/3210926/0/en/SELLAS-Life-Sciences-Provides-Update-on-Pivotal-Phase-3-REGAL-Trial-of-Galinpepimut-S-GPS-in-Acute-Myeloid-Leukemia-AML.html',label:'Dec 2025 72-event'},
  78:{date:'2026-05-11',src:CURRENT_EVENT_ANCHOR.src,label:'May 2026 78-event/Q1'}};
const HRMAX=1.0; // gauge scale
const ZFINAL=2.012;             // O'Brien-Fleming FINAL efficacy boundary (Z) ~ at 80 events
function rmst(fn,p,tau){let s=0;const h=0.25;for(let t=0;t<tau;t+=h)s+=(fn(t,p)+fn(t+h,p))/2*h;return s;} // restricted mean survival time (area under S to tau)
const ZEFF=2.34, ZFUT=0.4; // interim efficacy boundary Z; mild futility Z
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
function sGPSbase(t,p){if(t<=0)return 1;const d=p.delay;if(t<=d)return sBATbase(t,p);const b=sBATbase(d,p),c=Math.max(0,Math.min(p.gpsc,b));return c+(b-c)*Math.exp(-LN2*(t-d)/p.gpsu);}
const ELN_KEYS=["fav","int","adv"];
function isElnModel(p){return !!p&&p.modelFamily==="eln";}
function normalizeMix(m){
  const raw=ELN_KEYS.map(k=>Math.max(0,Number(m&&m[k])||0)),sum=raw[0]+raw[1]+raw[2]||1;
  return{fav:raw[0]/sum,int:raw[1]/sum,adv:raw[2]/sum};
}
function elnRuntime(p){
  const d=DEFAULT_ELN;
  return{
    mix:normalizeMix(p.elnMix||{fav:d.mixFav,int:d.mixInt,adv:d.mixAdv}),
    mos:p.elnBatMos||{fav:d.batMosFav,int:d.batMosInt,adv:d.batMosAdv},
    os3:p.elnBat3||{fav:d.bat3Fav/100,int:d.bat3Int/100,adv:d.bat3Adv/100},
    durable:p.elnGpsDurable||{fav:d.gpsDurFav/100,int:d.gpsDurInt/100,adv:d.gpsDurAdv/100},
    gain:Math.max(1,Number(p.gpsNonDurableGain)||d.gpsNonDurableGain),
    batXtx:p.batXtx!=null?p.batXtx:d.batXtx/100,
    gpsXtx:p.gpsXtx!=null?p.gpsXtx:d.gpsXtx/100,
    benefitModel:p.benefitModel==="leaky"?"leaky":"durable"
  };
}
// Weibull calibrated to an overall median and 3-year survival. Inputs are
// explicit model assumptions unless their metadata says otherwise.
function elnRiskBase(t,median,os3){
  if(t<=0)return 1;
  const m=Math.max(0.5,Number(median)||12),s=Math.max(0.001,Math.min(0.95,Number(os3)||0.1));
  const den=Math.log(36/m);
  let shape=Math.abs(den)<1e-8?1:Math.log((-Math.log(s))/LN2)/den;
  if(!Number.isFinite(shape)||shape<=0)shape=1;
  shape=Math.max(0.25,Math.min(3,shape));
  return Math.exp(-LN2*Math.pow(t/m,shape));
}
function elnBATBase(t,p,key){
  const e=elnRuntime(p);
  return elnRiskBase(t,e.mos[key],e.os3[key]);
}
function elnGPSBase(t,p,key){
  if(t<=0)return 1;
  const e=elnRuntime(p),d=Math.max(0,p.delay||0),bat=t0=>elnRiskBase(t0,e.mos[key],e.os3[key]);
  if(t<=d)return bat(t);
  const atDelay=bat(d),c=Math.max(0,Math.min(Number(e.durable[key])||0,atDelay));
  const gain=e.benefitModel==="leaky"?e.gain:1;
  const equivalent=d+(t-d)/gain;
  const residual=bat(equivalent)/Math.max(1e-12,bat(d));
  return c+(atDelay-c)*Math.max(0,Math.min(1,residual));
}
// Stylized planned transition at month 6: pre-transition deaths remain counted,
// and post-transition survival starts among those alive at transition.
const TX_MONTH=6;
function txMix(t,p,base,baseAtTx){if(!(p.xtx>0)||p.osmode==='censor'||t<=TX_MONTH)return base;const atTx=baseAtTx!=null?baseAtTx:base;return (1-p.xtx)*base+p.xtx*atTx*Stx(t-TX_MONTH);}
function elnStratumSurvival(t,p,key,arm){
  const e=elnRuntime(p),baseFn=arm==="gps"?elnGPSBase:elnBATBase,xtx=arm==="gps"?e.gpsXtx:e.batXtx;
  const q=Object.assign({},p,{xtx}),base=baseFn(t,q,key),atTx=baseFn(TX_MONTH,q,key);
  return txMix(t,q,base,atTx);
}
function elnArmSurvival(t,p,arm){
  const e=elnRuntime(p);
  return ELN_KEYS.reduce((sum,key)=>sum+e.mix[key]*elnStratumSurvival(t,p,key,arm),0);
}
function sBAT(t,p){if(t<=0)return 1;if(isElnModel(p))return elnArmSurvival(t,p,"bat");return txMix(t,p,sBATbase(t,p),sBATbase(TX_MONTH,p));}
function sGPS(t,p){if(t<=0)return 1;if(isElnModel(p))return elnArmSurvival(t,p,"gps");return txMix(t,p,sGPSbase(t,p),sGPSbase(TX_MONTH,p));}
function poolS(t,p){return 0.5*sBAT(t,p)+0.5*sGPS(t,p);}

/** Default CR2→randomization lead-time (months) for IRM ↔ CR2-onset display.
 *  Sensitivity only — does not enter eventsAt / passesVerdict / chart fit. */
const DEFAULT_IRM_LEAD = 3;
/** Map from-randomization IRM median to implied CR2-onset median: max(0, IRM − lead). */
function cr2OnsetFromIrm(irmMedian, leadMonths){
  if(irmMedian==null||!Number.isFinite(irmMedian))return null;
  const lead=Number(leadMonths);
  if(!Number.isFinite(lead))return irmMedian;
  return Math.max(0, irmMedian-lead);
}

// ---------- events (with transplant handling + independent censoring) ----------
// `cens` is the probability of independent loss to follow-up by month 36.
function censorSurvival(t,p){const c=Math.max(0,Math.min(0.95,p.cens||0));return Math.pow(1-c,Math.max(0,t)/36);}
function hctRetention(t,p){return p.osmode==='censor'&&p.xtx>0&&t>TX_MONTH?1-p.xtx:1;}
function armEventSurvival(t,p,baseFn){const base=baseFn(t,p),atTx=baseFn(TX_MONTH,p);return txMix(t,p,base,atTx);}
function observedDeathCurve(maxF,p,baseFn,step){
  step=step||0.5;const vals=[0],times=[0];let d=0;
  for(let t=0;t<maxF;t+=step){const t1=Math.min(maxF,t+step),mid=(t+t1)/2;const s0=armEventSurvival(t,p,baseFn),s1=armEventSurvival(t1,p,baseFn);d+=Math.max(0,s0-s1)*censorSurvival(mid,p)*hctRetention(mid,p);vals.push(d);times.push(t1);}
  return{step,vals,at(f){if(f<=0)return 0;if(f>=maxF)return vals[vals.length-1];const i=Math.min(vals.length-2,Math.floor(f/step)),r=(f-times[i])/Math.max(1e-12,times[i+1]-times[i]);return vals[i]+(vals[i+1]-vals[i])*r;}};
}
function armStep(T,p,arm,t,h,nScale,key){
  const t1=Math.min(T,t+h),mid=(t+t1)/2,av=enrollCDF(T-t,p.mid,p.k);
  const surv=key?(x=>elnStratumSurvival(x,p,key,arm)):(arm==="gps"?x=>sGPS(x,p):x=>sBAT(x,p));
  const s0=surv(t),s1=surv(t1),ret=censorSurvival(t,p)*hctRetention(t,p),retMid=censorSurvival(mid,p)*hctRetention(mid,p);
  return{
    risk:nScale*av*s0*ret,
    deaths:nScale*av*Math.max(0,s0-s1)*retMid
  };
}
function armDeaths(T,p,baseFn,bins){
  const arm=baseFn===sGPSbase?"gps":"bat",h=bins&&bins>=300?0.25:0.5;
  let total=0;
  if(isElnModel(p)){
    const e=elnRuntime(p);
    for(const key of ELN_KEYS)for(let t=0;t<T;t+=h)total+=armStep(T,p,arm,t,h,N_ARM*e.mix[key],key).deaths;
  }else{
    for(let t=0;t<T;t+=h)total+=armStep(T,p,arm,t,h,N_ARM).deaths;
  }
  return total;
}
function armStatus(T,p,survivalFn,bins){
  bins=bins||180;let alive=0;
  let administrativelyCensored=0;
  for(let i=0;i<bins;i++){
    const e0=LMAX*i/bins,e1=LMAX*(i+1)/bins,em=(e0+e1)/2,w=enrollCDF(e1,p.mid,p.k)-enrollCDF(e0,p.mid,p.k);
    if(em>=T)continue;
    const follow=T-em;
    const trueAlive=N_ARM*w*survivalFn(follow,p);
    alive+=trueAlive;
    administrativelyCensored+=trueAlive*censorSurvival(follow,p)*hctRetention(follow,p);
  }
  const enrolled=N_ARM*enrollCDF(T,p.mid,p.k);
  const baseFn=survivalFn===sGPS?sGPSbase:sBATbase;
  const observedDeaths=armDeaths(T,p,baseFn,bins);
  const withoutObservedDeath=Math.max(0,enrolled-observedDeaths);
  const ltfuCensored=Math.max(0,withoutObservedDeath-administrativelyCensored);
  return{enrolled,alive,observedDeaths,withoutObservedDeath,administrativelyCensored,ltfuCensored};
}
function armAlive(T,p,survivalFn,bins){return armStatus(T,p,survivalFn,bins).alive;}
function eventsAt(T,p,bins){return armDeaths(T,p,sBATbase,bins)+armDeaths(T,p,sGPSbase,bins);}
// Forward projection locked to confirmed PR anchors (78 @ m63); model increments only beyond anchor
function eventsAtAnchored(T,p,bins){bins=bins||110;if(T<T3)return eventsAt(T,p,bins);const modelAtAnchor=eventsAt(T3,p,bins);return E3+(eventsAt(T,p,bins)-modelAtAnchor);}
function T80PrPace(){const rate=(E3-E2)/(T3-T2);return T3+(80-E3)/rate;}
// Optional interpretation of the Aug 11 phrase "approaching 80" as <80 at T4.
// If disabled, only the confirmed 78 @ T3 anchor is used.
function usesStatusAssumption(p){return p.assumeStatus!==false;}
function statusLogLikelihood(p,bins){if(!usesStatusAssumption(p))return 0;bins=bins||110;const atAnchor=eventsAt(T3,p,bins),atStatus=eventsAt(T4,p,bins);return Math.log(Math.max(1e-12,poisLE(1,Math.max(0,atStatus-atAnchor))));}
const T80_MEAN_CACHE=new WeakMap();
function rawPostAnchorMean(T,p,anchor,bins){return Math.max(0,eventsAt(T,p,bins)-eventsAt(anchor,p,bins));}
function postAnchorMean(T,p,anchor,bins){
  if(!p||typeof p!=="object")return rawPostAnchorMean(T,p,anchor,bins);
  let byAnchor=T80_MEAN_CACHE.get(p);
  if(!byAnchor){byAnchor=new Map();T80_MEAN_CACHE.set(p,byAnchor);}
  const key=anchor+":"+bins;
  let c=byAnchor.get(key);
  if(!c){
    c={anchor,bins,anchorEvents:eventsAt(anchor,p,bins),calls:0,step:0.1,values:null};
    byAnchor.set(key,c);
  }
  c.calls++;
  // Build only for repeated point-scenario work. One-off MC draws retain exact evaluation.
  if(!c.values&&c.calls===256){
    c.values=[];
    for(let t=anchor;t<=130+1e-9;t+=c.step)c.values.push(Math.max(0,eventsAt(t,p,bins)-c.anchorEvents));
  }
  if(!c.values)return Math.max(0,eventsAt(T,p,bins)-c.anchorEvents);
  const x=(T-anchor)/c.step,i=Math.max(0,Math.min(c.values.length-2,Math.floor(x))),f=Math.max(0,Math.min(1,x-i));
  return c.values[i]+(c.values[i+1]-c.values[i])*f;
}
function t80ConditionalCdf(T,p,statusMonth,bins){
  bins=bins||110;const useStatus=usesStatusAssumption(p);statusMonth=statusMonth!=null?statusMonth:T4;
  if(!useStatus){if(T<=T3)return 0;const lambda=postAnchorMean(T,p,T3,bins),e=Math.exp(-lambda);return 1-e*(1+lambda);}
  if(T<=statusMonth)return 0;
  const lambdaPast=postAnchorMean(statusMonth,p,T3,bins);
  const p0=1/(1+lambdaPast),p1=lambdaPast/(1+lambdaPast);
  const lambdaFuture=postAnchorMean(T,p,statusMonth,bins);
  const e=Math.exp(-lambdaFuture);
  return p1*(1-e)+p0*(1-e*(1+lambdaFuture));
}
function t80Quantile(p,q,statusMonth,bins,iterations){
  bins=bins||110;q=Math.min(0.999999,Math.max(0.000001,q==null?0.5:q));
  iterations=iterations||28;
  statusMonth=statusMonth!=null?statusMonth:T4;
  let lo=usesStatusAssumption(p)?statusMonth:T3,hi=130;
  if(t80ConditionalCdf(hi,p,statusMonth,bins)<q)return hi;
  for(let i=0;i<iterations;i++){const m=(lo+hi)/2;if(t80ConditionalCdf(m,p,statusMonth,bins)<q)lo=m;else hi=m;}
  return (lo+hi)/2;
}
function eventsAtStatusConditioned(T,p,bins){
  bins=bins||110;
  if(T<T3)return eventsAt(T,p,bins);
  if(!usesStatusAssumption(p))return Math.min(79.999,E3+Math.max(0,eventsAt(T,p,bins)-eventsAt(T3,p,bins)));
  const atAnchor=eventsAt(T3,p,bins),atStatus=eventsAt(T4,p,bins);
  const lambdaStatus=Math.max(0,atStatus-atAnchor);
  if(T<=T4){
    const lambdaT=Math.max(0,eventsAt(T,p,bins)-atAnchor);
    return E3+lambdaT/(1+lambdaStatus);
  }
  const expectedAtStatus=E3+lambdaStatus/(1+lambdaStatus);
  return Math.min(79.999,expectedAtStatus+Math.max(0,eventsAt(T,p,bins)-atStatus));
}
function eventsBeforeT80(T,p,bins){
  bins=bins||110;if(T<=T3)return Math.min(E3,eventsAt(T,p,bins));
  if(!usesStatusAssumption(p)){const lambda=Math.max(0,eventsAt(T,p,bins)-eventsAt(T3,p,bins));return E3+lambda/(1+lambda);}
  const atAnchor=eventsAt(T3,p,bins),atStatus=eventsAt(T4,p,bins),past=Math.max(0,atStatus-atAnchor),p0=1/(1+past),p1=past/(1+past);
  if(T<=T4){const lambda=Math.max(0,eventsAt(T,p,bins)-atAnchor);return E3+lambda/(1+lambda);}
  const future=Math.max(0,eventsAt(T,p,bins)-atStatus),e=Math.exp(-future),w0=p0*e,w1=p0*future*e+p1*e;return E3+w1/Math.max(1e-12,w0+w1);
}
function T80(p){return t80Quantile(p,0.5,T4,110);}
function t80Analysis(p,cutoff,bins,u,iterations){
  bins=bins||110;
  const q=u==null?0.5:u,t80=t80Quantile(p,q,T4,bins,iterations),reached=t80<=cutoff;
  // The protocol final analysis occurs at 80 deaths even when that date lies
  // beyond a selected display horizon. Reach-by-cutoff is reported separately.
  return{t80,Tan:t80,Dan:80,reached,reachedProbability:t80ConditionalCdf(cutoff,p,T4,bins)};
}
function mcPathToT80(q,bins,u,iterations){return t80Quantile(q,u==null?0.5:u,T4,bins||110,iterations);}

// ---------- HR (Pike) ----------
function scoreParts(T,p,h){
  h=h||1;let Ob=0,Og=0,Eb=0,Eg=0,U=0,V=0;
  const fh=!!p.fh;
  // ELN groups construct each arm's marginal survival curve; they are not
  // REGAL primary-analysis strata. The published analysis used other baseline
  // factors, including poor-vs-other cytogenetics, whose joint allocations and
  // arm effects are unavailable. Score only the marginal arm risk sets rather
  // than inventing those data or stratifying on ELN labels.
  for(let t=0;t<T;t+=h){
    const b=armStep(T,p,"bat",t,h,N_ARM,null),g=armStep(T,p,"gps",t,h,N_ARM,null),nt=b.risk+g.risk;
    if(nt<1e-9)continue;
    const dt=b.deaths+g.deaths;
    Ob+=b.deaths;Og+=g.deaths;Eb+=dt*b.risk/nt;Eg+=dt*g.risk/nt;
    const wt=fh?(1-poolS(t,p)):1;
    U+=wt*(b.deaths-dt*b.risk/nt);
    V+=wt*wt*dt*(b.risk/nt)*(g.risk/nt);
  }
  const hr=(Eb<1e-9||Eg<1e-9)?NaN:(Og/Eg)/(Ob/Eb),z=(V<1e-9)?0:U/Math.sqrt(V);
  return{hr,z,events:Ob+Og,Ob,Og,Eb,Eg,U,V};
}
function hazardRatio(T,p){return scoreParts(T,p,0.5).hr;}
// HR gauge display state: separates interim IA floor (@ m46) from final readout threshold
function hrGaugeState(p,cutoff,bins,iterations){bins=bins||110;const hrInterim=hazardRatio(T1,p),hrM58=hazardRatio(T2,p);const{t80,Tan,Dan}=t80Analysis(p,cutoff,bins,null,iterations);const aFin=analyzeLR(Tan,p);const hrReadout=isNaN(aFin.hr)?null:aFin.hr,hrForFinal=hrReadout!=null?hrReadout:hrM58;return{hrInterim,hrM58,hrReadout,zReadout:aFin.z,Tan,Dan,t80,readoutSameAsM58:Tan===T2,interimClearsFloor:!isNaN(hrInterim)&&hrInterim>IFLOOR,interimWouldStop:!isNaN(hrInterim)&&hrInterim<=IFLOOR,hrForFinal,finalClears:Number.isFinite(aFin.z)&&aFin.z>ZFINAL};}
// Expected unstratified score from marginal arm curves. Actual REGAL strata
// cannot be reconstructed from the available aggregate inputs.
function analyzeLR(T,p){return scoreParts(T,p,0.5);}
// conditional power given the interim landed in the CONTINUE zone [zfut,ZEFF]; returns P(continue) & conditional power
function condPow(thIA,th80,Dan,zfut){const zf=(zfut!=null?zfut:ZFUT),finalInfo=Math.max(60,Dan||80);const rho=Math.sqrt(60/finalInfo),s=Math.sqrt(Math.max(1e-6,1-rho*rho));let num=0,den=0;const M=24,lo=zf,hi=ZEFF,h=(hi-lo)/M;for(let i=0;i<=M;i++){const z=lo+i*h,wt=(i===0||i===M)?1:(i%2?4:2),f=phi(z-thIA);den+=wt*f;num+=wt*f*Phi((th80+rho*(z-thIA)-ZFINAL)/s);}den*=h/3;num*=h/3;return{Pc:den, cp:den>1e-12?num/den:0};}
function interimContribution(binding,fitWeight,thIA,thFinal,Dan,zfut){if(!binding)return{w:fitWeight,pw:Phi(thFinal-ZFINAL),Pc:1};const r=condPow(thIA,thFinal,Dan,zfut);return{w:fitWeight*r.Pc,pw:r.cp,Pc:r.Pc};}
function Tfor(events,p){
  if(events===80)return T80(p);
  const evAt=(T,b)=>events>=E3?eventsAtStatusConditioned(T,p,b):eventsAt(T,p,b);
  let lo=events>=E3?T3:20,hi=130;
  if(evAt(hi,60)<events)return hi;
  for(let i=0;i<24;i++){const m=(lo+hi)/2;if(evAt(m,60)<events)lo=m;else hi=m;}
  return (lo+hi)/2;
}

// ---------- medians ----------
function medianOf(fn,p){let prev=1;for(let t=0.1;t<=240;t+=0.1){const s=fn(t,p);if(s<=0.5){const t0=t-0.1;return t0+(prev-0.5)/(prev-s)*0.1;}prev=s;}return null;}

// ---------- consistency / verdict ----------
function consistent(p,bins){
  bins=bins||110;
  const e1=eventsAt(T1,p,bins);if(!Number.isFinite(e1)||Math.abs(e1-E1)>4)return false;
  const e2=eventsAt(T2,p,bins);if(!Number.isFinite(e2)||Math.abs(e2-E2)>3)return false;
  const e3=eventsAt(T3,p,bins);if(!Number.isFinite(e3)||Math.abs(e3-E3)>3)return false;
  const e4=eventsAt(T4,p,bins);
  if(!Number.isFinite(e4))return false;
  if(usesStatusAssumption(p)&&Math.exp(statusLogLikelihood(p,bins))<0.05)return false;
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
  if(isElnModel(p)){
    const e=elnRuntime(p);
    if(ELN_KEYS.some(k=>!Number.isFinite(e.mos[k])||e.mos[k]<4||e.mos[k]>36||e.os3[k]<=0||e.os3[k]>=0.8||e.durable[k]<0||e.durable[k]>0.85))return false;
    if(bm!==null&&(bm<8||bm>22))return false;
    return true;
  }
  if(bm!==null&&bm>BAT_MED_CAP)return false;
  return true;
}
// ---------- auto-fit ----------
function autofitCure(p){const test=c=>eventsAt(T2,Object.assign({},p,{gpsc:c}));const lo=test(0),hi=test(0.9);if(lo<E2)return{sol:null,reason:"even 0% GPS cure gives only "+lo.toFixed(0)+" events by m58 — BAT too strong for the data"};if(hi>E2)return{sol:null,reason:"even 90% GPS cure still gives "+hi.toFixed(0)+" events by m58 — BAT too weak / uncured mOS too low"};let a=0,b=0.9;for(let i=0;i<40;i++){const m=(a+b)/2;if(test(m)>E2)a=m;else b=m;}return{sol:(a+b)/2};}

function eventErr(p){
  const e1=eventsAt(T1,p,110),e2=eventsAt(T2,p,110),e3=eventsAt(T3,p,110),e4=eventsAt(T4,p,110);
  const pm=medianOf(poolS,p);
  // Exact-count anchors use squared residuals; current no-trigger status contributes
  // a right-censored Poisson deviance for <=1 event since 78 @ m63.
  let err=Math.pow(e1-E1,2)+Math.pow(e2-E2,2)+Math.pow(e3-E3,2)-2*statusLogLikelihood(p,110);
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
// later event counts onto a tolerance edge so default/best failed under tiny perturbations.
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
  LN2, N_TOTAL, N_ARM, LMAX, T1, T2, T3, T4, E1, E2, E3, THRESH, IFLOOR, TX_MONTH,
  CURRENT_EVENT_ANCHOR, CURRENT_EVENT_STATUS, CURRENT_PUBLIC_SEARCH, PR_SOURCES, HRMAX, ZFINAL, rmst, ZEFF, ZFUT,
  Phi, phi, monthLabel, monthToDate, fmtCalMonth, fmtCalRange,
  lpois, pois, poisLE, rawC, enrollCDF, Stx, sBATbase, sGPSbase, txMix, censorSurvival, hctRetention, armEventSurvival,
  isElnModel, normalizeMix, elnRuntime, elnRiskBase, elnBATBase, elnGPSBase, elnStratumSurvival, elnArmSurvival,
  sBAT, sGPS, poolS, armStep, armDeaths, armStatus, armAlive, eventsAt, eventsAtAnchored, eventsAtStatusConditioned,
  T80PrPace, T80, t80Analysis, mcPathToT80, t80ConditionalCdf, t80Quantile, eventsBeforeT80, usesStatusAssumption, statusLogLikelihood,
  hazardRatio, analyzeLR, hrGaugeState, condPow, interimContribution, Tfor, medianOf, consistent, passesVerdict, BAT_MED_CAP, isBiologicallyPlausible, autofitCure,
  eventErr, bisectField, batcFor3yrCap, inverseSolve,
  DEFAULT_IRM_LEAD, cr2OnsetFromIrm
};
