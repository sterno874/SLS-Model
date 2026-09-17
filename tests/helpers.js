import {
  T1,
  T2,
  T3,
  T4,
  E1,
  E2,
  E3,
  ZFINAL,
  STRATF,
  ZFUT,
  eventsAt,
  lpois,
  poisLE
} from "../js/math/survival.js";

export { T1, T2, T3, E1, E2, E3, ZFINAL };

export function mk(p = {}) {
  return Object.assign(
    {
      bat: 13,
      batc: 0,
      batk: 1,
      gpsc: 0.42,
      gpsu: 42.5,
      delay: 3,
      xtx: 0,
      cens: 0,
      osmode: "itt",
      mid: 25,
      k: 0.15,
      fh: false,
      assumeStatus: true,
      stratF: STRATF,
      zfut: ZFUT
    },
    p
  );
}

export function paramsFromPresetQ(q) {
  if (!q) return null;
  return {
    bat: q.bat,
    batc: q.batc / 100,
    batk: q.batk != null ? q.batk : 1,
    gpsc: q.gpsc / 100,
    gpsu: q.gpsu,
    delay: q.delay,
    xtx: (q.xtx != null ? q.xtx : 0) / 100,
    cens: (q.cens != null ? q.cens : 0) / 100,
    osmode: "itt",
    mid: q.mid || 25,
    k: q.k || 0.15,
    fh: false,
    assumeStatus: true,
    stratF: STRATF,
    zfut: ZFUT
  };
}

export function poisLL(p) {
  const e58v = eventsAt(58, p, 100);
  const e46v = eventsAt(46, p, 100);
  const e63v = eventsAt(63, p, 100);
  const l2 = Math.max(0, e58v - e46v);
  const l3 = Math.max(0, e63v - e58v);
  return lpois(60, e46v) + lpois(12, l2) + lpois(6, l3);
}

export function poisLogLThrough(p, throughMonth) {
  const e46v = eventsAt(46, p, 100);
  const e58v = eventsAt(58, p, 100);
  const e63v = eventsAt(63, p, 100);
  const eStatus = eventsAt(T4, p, 100);
  let ll = 0;
  if (throughMonth >= 46) ll += lpois(60, e46v);
  if (throughMonth >= 58) ll += lpois(12, Math.max(0, e58v - e46v));
  if (throughMonth >= 63) ll += lpois(6, Math.max(0, e63v - e58v));
  if (throughMonth >= T4) {
    ll += Math.log(Math.max(1e-12, poisLE(1, Math.max(0, eStatus - e63v))));
  }
  return ll;
}
