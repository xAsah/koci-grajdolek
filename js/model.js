// Logika domenowa: przepisy, plany, produkty, propozycje
import { norm, fold, podobienstwo, iloscTekst, liczba, gramy, dzisiaj, roznicaDni, zakresDat, uid, dodajDni } from './util.js';

export const KATEGORIE = [
  { id: 'sniadanie', nazwa: 'Śniadanie' }, { id: 'drugie_sniadanie', nazwa: 'II śniadanie / lunchbox' },
  { id: 'obiad', nazwa: 'Obiad' }, { id: 'kolacja', nazwa: 'Kolacja' }, { id: 'deser', nazwa: 'Deser / przekąska' },
  { id: 'baza', nazwa: 'Przepis bazowy (pasta, sos)' },
];
export const nazwaKategorii = (id) => KATEGORIE.find((k) => k.id === id)?.nazwa || id;
export const STATUSY = { zatwierdzony: 'Zatwierdzone', do_przejrzenia: 'Do przejrzenia', kosz: 'Kosz' };

// ---------- przepisy ----------
export function przepisy(d, status) {
  return Object.values(d.przepisy).filter((r) => !status || r.status === status);
}
export function czyBatch(r) { return (r.porcje || 1) > 1; }

// Skaluje składniki przepisu na podaną liczbę osób (każda osoba zjada porcjeNaOsobe porcji)
export function skalujSkladniki(r, osoby) {
  const porcje = Math.max(1, r.porcje || 1);
  const pno = r.porcjeNaOsobe || 1;
  const fBatch = (osoby * pno) / porcje;
  return (r.skladniki || []).map((e) => {
    const f = e.naPorcje ? osoby : fBatch;
    return { ...e, ilosc: e.ilosc == null ? null : e.ilosc * f, g: e.g ? e.g * f : null, wspolczynnik: f };
  });
}

export function opisSkladnika(e, d) {
  const nazwa = e.przepis ? (d.przepisy[e.przepis]?.nazwa || e.nazwa || 'przepis bazowy') : (e.nazwa || d.produkty[e.produkt]?.nazwa || e.tekst || '?');
  let q = '';
  if (e.ilosc != null && e.jedn) {
    q = iloscTekst(e.ilosc, e.jedn);
    if (e.g && e.jedn !== 'g') q += ` (${gramy(e.g)})`;
  } else if (e.ilosc != null) q = liczba(e.ilosc);
  const uw = e.uwaga ? ` (${e.uwaga})` : '';
  if (!q) return `${nazwa}${uw}`;
  if (e.szyk === 'przed') return `${q} ${nazwa}${uw}`;
  return `${nazwa} – ${q}${uw}`;
}

export function noweIdPrzepisu(d, nazwa) {
  return 'wlasny-' + uid();
}

export function oznaczEdycje(r) { r.edytowano = new Date().toISOString(); }

// ---------- plany ----------
export function nowyPlan(d, od, do_) {
  const p = { id: uid('plan-'), od, do: do_, utworzono: new Date().toISOString(), dni: {}, lista: { wlasne: [], stale: [], skreslone: [], partie: {} } };
  d.plany.unshift(p);
  return p;
}
export function dniPlanu(p) { return zakresDat(p.od, p.do); }
export function wpis(p, data, slot) { return p.dni?.[data]?.[slot] || null; }
function ustaw(p, data, slot, w) {
  p.dni ||= {};
  p.dni[data] ||= {};
  if (w) p.dni[data][slot] = w; else delete p.dni[data][slot];
}
export function wszystkieOsoby(d) { return d.ustawienia.osoby.map((o) => o.id); }

export function ustawPrzepis(d, p, data, slot, przepisId) {
  usunWpis(p, data, slot);
  ustaw(p, data, slot, { przepis: przepisId, osoby: wszystkieOsoby(d) });
}

export function usunWpis(p, data, slot) {
  const w = wpis(p, data, slot);
  if (!w) return;
  if (w.naDni > 1) {
    for (const dd of dniPlanu(p)) {
      const x = wpis(p, dd, slot);
      if (x && x.zGotowania === data) ustaw(p, dd, slot, null);
    }
  }
  if (w.zGotowania) {
    const zrodlo = wpis(p, w.zGotowania, slot);
    ustaw(p, data, slot, null);
    if (zrodlo) przeliczNaDni(p, w.zGotowania, slot);
    return;
  }
  ustaw(p, data, slot, null);
}

function przeliczNaDni(p, data, slot) {
  const z = wpis(p, data, slot); if (!z) return;
  let n = 1;
  for (const dd of dniPlanu(p)) { const x = wpis(p, dd, slot); if (x && x.zGotowania === data) n++; }
  if (n > 1) z.naDni = n; else delete z.naDni;
}

// Gotuję raz na kilka dni: kolejne dni dostają ten sam przepis jako "z gotowania"
export function gotujNaDni(p, data, slot, n) {
  const w = wpis(p, data, slot); if (!w || w.zGotowania) return;
  for (const dd of dniPlanu(p)) {
    const x = wpis(p, dd, slot);
    if (x && x.zGotowania === data) ustaw(p, dd, slot, null);
  }
  const dni = dniPlanu(p); const i = dni.indexOf(data);
  let dodane = 1;
  for (let k = 1; k < n && i + k < dni.length; k++) {
    const dd = dni[i + k];
    const x = wpis(p, dd, slot);
    if (x && x.naDni > 1) usunWpis(p, dd, slot);
    ustaw(p, dd, slot, { przepis: w.przepis, osoby: [...w.osoby], zGotowania: data });
    dodane++;
  }
  if (dodane > 1) w.naDni = dodane; else delete w.naDni;
}

export function przelaczOsobe(p, data, slot, osobaId) {
  const w = wpis(p, data, slot); if (!w) return;
  const i = w.osoby.indexOf(osobaId);
  if (i >= 0) { if (w.osoby.length > 1) w.osoby.splice(i, 1); } else w.osoby.push(osobaId);
}

// Wpisy, przy których się gotuje (bez "z gotowania"), z łączną liczbą porcji-osób
export function gotowania(p, d) {
  const out = [];
  for (const data of dniPlanu(p)) {
    for (const slot of d.ustawienia.posilki.map((x) => x.id)) {
      const w = wpis(p, data, slot);
      if (!w || w.zGotowania || !d.przepisy[w.przepis]) continue;
      let osobyRazem = w.osoby.length;
      const dniZ = [data];
      for (const dd of dniPlanu(p)) {
        const x = wpis(p, dd, slot);
        if (x && x.zGotowania === data) { osobyRazem += x.osoby.length; dniZ.push(dd); }
      }
      out.push({ data, slot, wpis: w, przepis: d.przepisy[w.przepis], osoby: osobyRazem, dni: dniZ });
    }
  }
  return out;
}

export function kcalDnia(p, d, data) {
  const wynik = {};
  for (const o of d.ustawienia.osoby) wynik[o.id] = { kcal: 0, b: 0, t: 0, w: 0, niepelne: false, szacunkowe: false };
  for (const pos of d.ustawienia.posilki) {
    const w = wpis(p, data, pos.id); if (!w) continue;
    const r = d.przepisy[w.przepis]; if (!r) continue;
    for (const oid of w.osoby) {
      const x = wynik[oid]; if (!x) continue;
      x.kcal += r.kcal || 0;
      if (r.b == null) x.niepelne = true; else { x.b += r.b; x.t += r.t || 0; x.w += r.w || 0; }
      if (r.makroSzacowane) x.szacunkowe = true;
    }
  }
  return wynik;
}

// Ostatnie (lub zaplanowane) daty dań
export function historia(d) {
  const h = {};
  for (const p of d.plany) {
    for (const [data, sloty] of Object.entries(p.dni || {})) {
      for (const w of Object.values(sloty)) {
        if (!w?.przepis) continue;
        const x = (h[w.przepis] ||= { ostatnio: null, zaplanowane: null, razy: 0 });
        x.razy++;
        if (data <= dzisiaj()) { if (!x.ostatnio || data > x.ostatnio) x.ostatnio = data; }
        else if (!x.zaplanowane || data < x.zaplanowane) x.zaplanowane = data;
      }
    }
  }
  return h;
}
export function opisHistorii(h) {
  if (!h || !h.ostatnio) return h?.zaplanowane ? 'zaplanowane' : 'jeszcze nie jedzone';
  const n = roznicaDni(h.ostatnio, dzisiaj());
  if (n === 0) return 'jedzone dziś';
  if (n === 1) return 'jedzone wczoraj';
  return `jedzone ${n} dni temu`;
}

// ---------- propozycje ----------
export function zaproponuj(d, p, slot, wykluczone = new Set(), losuj = Math.random) {
  const h = historia(d);
  const wPlanie = new Set();
  for (const sl of Object.values(p.dni || {})) for (const w of Object.values(sl)) if (w?.przepis) wPlanie.add(w.przepis);
  const kand = przepisy(d, 'zatwierdzony').filter((r) => !r.ukryty && !(r.kategorie || []).includes('baza') && !wPlanie.has(r.id) && !wykluczone.has(r.id));
  const pasujace = kand.filter((r) => (r.kategorie || []).includes(slot));
  const pula = pasujace.length ? pasujace : kand;
  if (!pula.length) return null;
  const wagi = pula.map((r) => {
    let w = 1;
    if (r.ulubiony) w *= 3;
    const o = h[r.id]?.ostatnio;
    if (o) w *= Math.min(1, Math.max(0.05, roznicaDni(o, dzisiaj()) / 21));
    return w;
  });
  const suma = wagi.reduce((a, b) => a + b, 0);
  let x = losuj() * suma;
  for (let i = 0; i < pula.length; i++) { x -= wagi[i]; if (x <= 0) return pula[i]; }
  return pula[pula.length - 1];
}

// ---------- produkty ----------
let _idx = null, _idxWersja = -1;
export function indeksProduktow(d, wersja) {
  if (_idx && wersja === _idxWersja) return _idx;
  const m = new Map();
  for (const p of Object.values(d.produkty)) {
    m.set(norm(p.nazwa), p.id);
    for (const s of p.synonimy || []) if (!m.has(norm(s))) m.set(norm(s), p.id);
  }
  _idx = m; _idxWersja = wersja;
  return m;
}
export function znajdzProdukt(d, nazwa, wersja) {
  return indeksProduktow(d, wersja).get(norm(nazwa)) || null;
}
export function podobneProdukty(d, nazwa, limit = 5, prog = 0.5) {
  const wyn = [];
  for (const p of Object.values(d.produkty)) {
    let s = podobienstwo(nazwa, p.nazwa);
    for (const syn of p.synonimy || []) s = Math.max(s, podobienstwo(nazwa, syn));
    if (s >= prog) wyn.push({ id: p.id, s });
  }
  return wyn.sort((a, b) => b.s - a.s).slice(0, limit);
}

export function uzyciaProduktow(d) {
  const u = {};
  for (const r of Object.values(d.przepisy)) {
    if (r.status === 'kosz') continue;
    for (const e of r.skladniki || []) if (e.produkt) (u[e.produkt] ||= []).push(r.id);
  }
  return u;
}

export function podejrzaneDuplikaty(d) {
  const lista = Object.values(d.produkty);
  const ignor = new Set(d.ustawienia.nieDuplikaty || []);
  const pary = [];
  for (let i = 0; i < lista.length; i++) {
    for (let j = i + 1; j < lista.length; j++) {
      const a = lista[i], b = lista[j];
      if (a.zweryfikowany && b.zweryfikowany) continue; // oba ze sprawdzonego słownika albo potwierdzone przez Was
      const klucz = [a.id, b.id].sort().join('|');
      if (ignor.has(klucz)) continue;
      const s = podobienstwo(a.nazwa, b.nazwa);
      const A = fold(a.nazwa), B = fold(b.nazwa);
      const zawiera = (A.length > 4 && B.startsWith(A + ' ')) || (B.length > 4 && A.startsWith(B + ' '));
      if (s >= 0.8 || (zawiera && a.dzial === b.dzial)) pary.push({ a: a.id, b: b.id, s: Math.max(s, zawiera ? 0.8 : 0), klucz });
    }
  }
  return pary.sort((x, y) => y.s - x.s);
}

// Scala produkty: przepisy przepinają się na produkt docelowy, stare nazwy zostają synonimami
export function scalProdukty(d, ids, celId) {
  const cel = d.produkty[celId]; if (!cel) return;
  const syn = new Set(cel.synonimy || []);
  for (const id of ids) {
    if (id === celId) continue;
    const p = d.produkty[id]; if (!p) continue;
    syn.add(p.nazwa); (p.synonimy || []).forEach((s) => syn.add(s));
    for (const r of Object.values(d.przepisy)) for (const e of r.skladniki || []) if (e.produkt === id) e.produkt = celId;
    for (const pl of d.plany) {
      if (pl.lista?.skreslone) pl.lista.skreslone = pl.lista.skreslone.map((k) => (k === id ? celId : k));
    }
    delete d.produkty[id];
  }
  syn.delete(cel.nazwa);
  cel.synonimy = [...syn];
}

export function nowyProdukt(d, nazwa, dzial = 'inn') {
  let id = 'p-' + norm(nazwa).replace(/[^a-z0-9ąćęłńóśźż]+/g, '-').slice(0, 40);
  if (d.produkty[id]) id += '-' + uid().slice(-4);
  d.produkty[id] = { id, nazwa, dzial, tryb: 'g', naListe: true, synonimy: [] };
  return d.produkty[id];
}

export function przepisyZProduktem(d, produktIds) {
  if (!produktIds.length) return null;
  const wynik = new Set();
  const zawiera = (r, pid, glebokosc = 0) => (r.skladniki || []).some((e) => e.produkt === pid || (e.przepis && glebokosc < 2 && d.przepisy[e.przepis] && zawiera(d.przepisy[e.przepis], pid, glebokosc + 1)));
  for (const r of Object.values(d.przepisy)) if (produktIds.every((pid) => zawiera(r, pid))) wynik.add(r.id);
  return wynik;
}

export function domyslnyNowyPlanOd() { return dodajDni(dzisiaj(), 1); }
