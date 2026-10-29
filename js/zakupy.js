// Lista zakupów: sumowanie składników z planu
import { gotowania } from './model.js';
import { gramy, liczba, jednostka, iloscTekst, dataPl, spakuj, jednostkaZFormy } from './util.js';

const OPAKOWANIA = new Set(['opakowanie', 'puszka', 'butelka', 'kartonik', 'słoik', 'kubek', 'torebka', 'woreczek']);
const EPS = 1e-6;

function dodajZrodlo(acc, opis) { acc.zrodla.push(opis); }

function nowyAkumulator(pid) {
  return { pid, g: 0, ml: 0, szt: 0, opak: 0, inne: {}, bezIlosci: [], zrodla: [], czesci: [] };
}

function dolicz(acc, prod, e, f, zrodlo) {
  const jg = prod?.jg || {};
  const tryb = prod?.tryb || 'g';
  if (e.ilosc == null && !e.g) {
    acc.bezIlosci.push(e.uwaga || (tryb === 'brak' ? 'do smaku' : 'bez podanej ilości'));
    dodajZrodlo(acc, zrodlo);
    return;
  }
  const q = (e.ilosc ?? 0) * f;
  const j = e.jedn;
  // kolejność: sztuki dla produktów kupowanych na sztuki, potem gramy podane w przepisie, potem opakowania
  if (j === 'szt' && tryb === 'szt' && e.ilosc != null) {
    acc.szt += q; acc.czesci.push(`${liczba(q)} szt.`);
  } else if (e.g) {
    acc.g += e.g * f; acc.czesci.push(gramy(e.g * f));
  } else if (tryb === 'opak' && ((j === 'szt' && !jg.szt) || OPAKOWANIA.has(j))) {
    acc.opak += q; acc.czesci.push(j === 'szt' ? `${liczba(q)} opak.` : iloscTekst(q, j));
  } else if (j === 'g') {
    acc.g += q; acc.czesci.push(gramy(q));
  } else if (j === 'ml') {
    acc.ml += q; acc.czesci.push(`${liczba(Math.round(q))} ml`);
  } else if (j === 'szt' && tryb === 'opak' && jg.szt) {
    acc.g += q * jg.szt; acc.czesci.push(`${liczba(q)} szt.`);
  } else if (j === 'szt' && tryb === 'g' && (jg.szt || prod?.gSzt)) {
    acc.g += q * (jg.szt || prod.gSzt); acc.czesci.push(`${liczba(q)} szt.`);
  } else {
    const jj = j || 'szt';
    acc.inne[jj] = (acc.inne[jj] || 0) + q; acc.czesci.push(iloscTekst(q, jj));
  }
  dodajZrodlo(acc, zrodlo);
}

// łyżki, garście itp. zaokrąglamy w górę do połówek, żeby nie zabrakło
function polowkaWGore(v) { return Math.ceil(v * 2 - 1e-6) / 2; }
function inneTekst(inne) {
  return Object.entries(inne).filter(([, v]) => v > EPS).map(([j, v]) => iloscTekst(j === 'g' || j === 'ml' ? v : polowkaWGore(v), j)).join(' + ');
}

// Orientacyjne gramy dla łyżek, garści itp. (jeśli słownik zna wagę jednostki)
function inneGramy(inne, prod) {
  const jg = prod?.jg || {};
  let g = 0;
  for (const [j, v] of Object.entries(inne)) {
    if (v <= EPS) continue;
    if (!jg[j]) return null;
    g += v * jg[j];
  }
  return g > EPS ? g : null;
}

function sufit(x) { return Math.max(1, Math.ceil(x - 0.05)); }

export function formatujPozycje(acc, prod) {
  const tryb = prod?.tryb || 'g';
  const inne = inneTekst(acc.inne);
  let glowna = '', szczegoly = '';
  const czesci = acc.czesci.length > 1 ? acc.czesci.join(' + ') : '';
  if (tryb === 'brak') {
    glowna = inne || '';
    szczegoly = [...new Set(acc.bezIlosci)].join(', ');
  } else if (tryb === 'szt' && prod.gSzt) {
    const razem = acc.szt + (acc.g + acc.ml) / prod.gSzt;
    if (razem > EPS) {
      const n = sufit(razem);
      glowna = prod.opis && !/^\d/.test(prod.opis) ? `${n} × ${prod.opis}` : `${n} szt.`;
      const sz = [];
      if (acc.g + acc.ml > EPS) sz.push(`${czesci || acc.czesci.join(' + ')} ≈ ${liczba(razem)} szt.`);
      else if (czesci) sz.push(czesci);
      if (n - razem >= 0.25) sz.push(`zostanie ok. ${liczba(n - razem)} szt.`);
      szczegoly = sz.join('; ');
    }
    if (inne) glowna = glowna ? `${glowna} + ${inne}` : inne;
  } else if (tryb === 'opak' && prod.gSzt) {
    const razem = acc.opak + (acc.g + acc.ml) / prod.gSzt;
    if (razem > EPS) {
      const n = sufit(razem);
      glowna = `${n} × ${prod.opis || 'opak. ' + gramy(prod.gSzt)}`;
      const sz = [];
      if (acc.g + acc.ml > EPS) sz.push(`potrzeba ${czesci || acc.czesci.join(' + ')}`);
      else if (czesci) sz.push(czesci);
      szczegoly = sz.join('; ');
    }
    if (inne) glowna = glowna ? `${glowna} + ${inne}` : inne;
  } else {
    const g = acc.g + acc.ml + acc.szt * (prod?.gSzt || 0) + acc.opak * (prod?.gSzt || 0);
    if (g > EPS) {
      glowna = acc.ml > EPS && acc.g < EPS ? `${liczba(Math.round(acc.ml))} ml` : gramy(g);
      if (czesci) szczegoly = czesci;
    }
    if (acc.szt > EPS && !prod?.gSzt) glowna = (glowna ? glowna + ' + ' : '') + `${liczba(acc.szt)} szt.`;
    if (inne) glowna = glowna ? `${glowna} + ${inne}` : inne;
  }
  const ig = inneGramy(acc.inne, prod);
  if (inne && ig && tryb !== 'brak') szczegoly = [szczegoly, `${inne} ≈ ${gramy(ig)}`].filter(Boolean).join('; ');
  if (!glowna && acc.bezIlosci.length && tryb !== 'brak') {
    szczegoly = [szczegoly, [...new Set(acc.bezIlosci)].join(', ')].filter(Boolean).join('; ');
  } else if (acc.bezIlosci.length && tryb !== 'brak') {
    szczegoly = [szczegoly, '+ ' + [...new Set(acc.bezIlosci)].join(', ')].filter(Boolean).join('; ');
  }
  return { glowna, szczegoly };
}

// Potrzeby planu: ile porcji każdego przepisu (także bazowych) i jaki współczynnik partii
export function potrzebyPlanu(d, plan) {
  const lista = plan.lista ||= { wlasne: [], stale: [], skreslone: [], partie: {} };
  lista.partie ||= {}; lista.wlasne ||= []; lista.stale ||= []; lista.skreslone ||= [];
  const potrzeby = {}; // przepisId -> { jednostki (porcje partii), osoby, zrodla: [], czesci: [każde gotowanie osobno] }
  const doliczPotrzebe = (rid, jedn, osoby, zrodlo, kiedy, od = '9999') => {
    const x = (potrzeby[rid] ||= { jednostki: 0, osoby: 0, zrodla: [], czesci: [] });
    x.jednostki += jedn; x.osoby += osoby; x.zrodla.push(zrodlo);
    x.czesci.push({ jednostki: jedn, osoby, kiedy, od });
  };
  for (const g of gotowania(plan, d)) {
    const r = g.przepis;
    doliczPotrzebe(r.id, g.osoby * (r.porcjeNaOsobe || 1), g.osoby, `${r.nazwa} (${g.dni.map(dataPl).join(', ')})`, g.dni.map(dataPl).join(', '), g.data);
  }
  // przepisy bazowe (pasty itp.) wynikające z innych dań — do 3 poziomów
  const rozwiniete = new Set();
  for (let poziom = 0; poziom < 3; poziom++) {
    for (const [rid, x] of Object.entries({ ...potrzeby })) {
      if (rozwiniete.has(rid)) continue;
      const r = d.przepisy[rid]; if (!r) continue;
      rozwiniete.add(rid);
      const porcje = Math.max(1, r.porcje || 1);
      for (const e of r.skladniki || []) {
        if (!e.przepis || !d.przepisy[e.przepis]) continue;
        const ile = (e.ilosc ?? 1) * (e.naPorcje ? x.osoby : x.jednostki / porcje);
        doliczPotrzebe(e.przepis, ile, 0, `do: ${r.nazwa}`, `do: ${r.nazwa}`);
      }
    }
  }
  const partie = [];
  const wspolczynnik = {};
  for (const [rid, x] of Object.entries(potrzeby)) {
    const r = d.przepisy[rid]; if (!r) continue;
    const porcje = Math.max(1, r.porcje || 1);
    if (porcje > 1) {
      const calych = Math.max(1, Math.ceil(x.jednostki / porcje - 1e-6));
      const rowne = Math.abs(x.jednostki / porcje - Math.round(x.jednostki / porcje)) < 1e-6 && x.jednostki > 0;
      const decyzja = rowne ? 'cala' : (lista.partie[rid] || null);
      if (!rowne) partie.push({ przepisId: rid, nazwa: r.nazwa, porcje, potrzebne: x.jednostki, calych, decyzja });
      wspolczynnik[rid] = decyzja === 'cala' ? calych : x.jednostki / porcje;
    } else {
      wspolczynnik[rid] = x.jednostki;
    }
  }
  return { potrzeby, wspolczynnik, partie, lista };
}

// Główna funkcja: lista zakupów dla planu
export function obliczListe(d, plan) {
  const { potrzeby, wspolczynnik, partie, lista } = potrzebyPlanu(d, plan);
  // sumowanie produktów (łączna ilość) + osobno każde gotowanie (do „skąd to jest” i do produktów kupowanych osobno, np. mięso)
  const akum = {};
  for (const [rid, x] of Object.entries(potrzeby)) {
    const r = d.przepisy[rid]; if (!r) continue;
    const F = wspolczynnik[rid];
    for (const e of r.skladniki || []) {
      if (e.przepis || !e.produkt) continue;
      const prod = d.produkty[e.produkt];
      const f = e.naPorcje ? x.osoby : F;
      if (f <= EPS && !(e.naPorcje && x.osoby === 0 && F > 0)) continue;
      const acc = (akum[e.produkt] ||= nowyAkumulator(e.produkt));
      dolicz(acc, prod, e, e.naPorcje && x.osoby === 0 ? F : f, r.nazwa);
      acc.dania ||= new Map();
      for (const c of x.czesci) {
        const udzial = x.jednostki > EPS ? c.jednostki / x.jednostki : 1 / x.czesci.length;
        const fc = e.naPorcje && x.osoby > 0 ? c.osoby : F * udzial;
        const k = rid + '|' + c.kiedy;
        const dn = acc.dania.get(k) || { przepis: r.nazwa, kiedy: c.kiedy, od: c.od, porcje: c.jednostki, acc: nowyAkumulator(e.produkt), opisy: [] };
        dolicz(dn.acc, prod, e, fc, r.nazwa);
        dn.opisy.push(opisIlosci(e, fc));
        acc.dania.set(k, dn);
      }
    }
  }
  // grupy wg działów
  const skreslone = new Set(lista.skreslone);
  const korekty = lista.korekty || {};
  const grupy = new Map(d.ustawienia.dzialy.map((dz) => [dz.id, { dzial: dz, pozycje: [] }]));
  const grupa = (id) => grupy.get(id) || grupy.get('inn');
  const pominiete = [];
  const dodaj = (dzial, poz) => {
    const k = korekty[poz.klucz];
    poz.wyliczona = poz.ilosc;
    if (k && k.ilosc != null) {
      poz.korekta = k;
      poz.ilosc = k.ilosc;
      poz.nieaktualna = (k.wyliczone || '') !== (poz.wyliczona || ''); // plan się zmienił od poprawki
    }
    grupa(dzial).pozycje.push(poz);
  };
  for (const acc of Object.values(akum)) {
    const prod = d.produkty[acc.pid];
    if (prod && prod.naListe === false) { pominiete.push(prod.nazwa); continue; }
    let { glowna, szczegoly } = formatujPozycje(acc, prod);
    const dania = [...(acc.dania?.values() || [])].sort((a, b) => (a.od < b.od ? -1 : a.od > b.od ? 1 : 0));
    // produkty kupowane osobno dla każdego dania (np. mięso mrożone w porcjach): 300 g + 300 g
    if (prod?.osobno && dania.length > 1) {
      const czesci = dania.map((dn) => formatujPozycje(dn.acc, prod).glowna).filter(Boolean);
      if (czesci.length > 1) { szczegoly = `razem ${glowna}`; glowna = czesci.join(' + '); }
    }
    dodaj(prod?.dzial || 'inn', {
      klucz: acc.pid, nazwa: prod?.nazwa || acc.pid, ilosc: glowna, szczegoly, osobno: !!prod?.osobno,
      zrodla: dania.map((dn) => ({ przepis: dn.przepis, kiedy: dn.kiedy, porcje: dn.porcje, ilosc: dn.opisy.join(' + ') })),
      skreslona: skreslone.has(acc.pid),
    });
  }
  for (const s of d.ustawienia.staleZakupy || []) {
    if (!lista.stale.includes(s.id)) continue;
    dodaj(s.dzial || 'inn', { klucz: 's:' + s.id, nazwa: s.nazwa, ilosc: s.ilosc || '', szczegoly: 'stały zakup', zrodla: [], stala: true, skreslona: skreslone.has('s:' + s.id) });
  }
  for (const w of lista.wlasne) {
    dodaj(w.dzial || 'inn', { klucz: 'w:' + w.id, nazwa: w.nazwa, ilosc: w.ilosc || '', szczegoly: 'dopisane ręcznie', zrodla: [], wlasna: true, id: w.id, skreslona: skreslone.has('w:' + w.id) });
  }
  const coll = new Intl.Collator('pl');
  const wynik = [...grupy.values()].filter((g) => g.pozycje.length).map((g) => ({ ...g, pozycje: g.pozycje.sort((a, b) => coll.compare(a.nazwa, b.nazwa)) }));
  return { grupy: wynik, partie, pominiete, liczba: wynik.reduce((s, g) => s + g.pozycje.filter((p) => !p.skreslona).length, 0) };
}

// Ilość składnika w jednym daniu, tak jak w przepisie (do „skąd to jest”)
function opisIlosci(e, f) {
  if (e.ilosc == null && !e.g) return e.uwaga || 'do smaku';
  if (e.ilosc != null && e.jedn && e.jedn !== 'g') return iloscTekst(e.ilosc * f, e.jedn) + (e.g ? ` (${gramy(e.g * f)})` : '');
  if (e.g) return gramy(e.g * f);
  if (e.jedn === 'g') return gramy(e.ilosc * f);
  return `${liczba(e.ilosc * f)} szt.`;
}

// ---------- poprawki ilości („mamy 2 w domu”) ----------
const ULAMKI = { '½': 0.5, '⅓': 1 / 3, '¼': 0.25, '¾': 0.75, '⅔': 2 / 3 };
// Rozbija ilość typu „6 szt.”, „1½ ząbka”, „450 g”, „2 × kubek 150 g” na liczbę i resztę. Złożonych („450 g + 2 łyżki”) nie.
export function rozbijIlosc(tekst) {
  const t = String(tekst || '').trim();
  if (!t || t.includes('+')) return null;
  const m = t.match(/^(\d+(?:[.,]\d+)?)?\s*([½⅓¼¾⅔])?\s*(.*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  const n = (m[1] ? Number(m[1].replace(',', '.')) : 0) + (m[2] ? ULAMKI[m[2]] : 0);
  return { n, reszta: m[3].trim() };
}
// Odejmuje to, co jest w domu. Zwraca nowy tekst ilości albo null (gdy się nie da), '' gdy nic nie trzeba kupić.
export function odejmijIlosc(tekst, mam) {
  const a = rozbijIlosc(tekst); const b = Number(String(mam).replace(',', '.'));
  if (!a || !(b > 0)) return null;
  const n = Math.round((a.n - b) * 1000) / 1000;
  if (n <= EPS) return '';
  const r = a.reszta;
  if (r === 'g') return gramy(n);
  if (r === 'kg') return `${liczba(n, 2)} kg`;
  const j = jednostkaZFormy(r);
  return j ? iloscTekst(n, j) : `${liczba(n, 2)}${r ? ' ' + r : ''}`;
}

export function tytulListy(plan) { return `Lista zakupów ${dataPl(plan.od)}–${dataPl(plan.do)}`; }

export function listaJakoTekst(plan, wynik) {
  const linie = [tytulListy(plan), ''];
  for (const g of wynik.grupy) {
    const poz = g.pozycje.filter((p) => !p.skreslona);
    if (!poz.length) continue;
    linie.push(g.dzial.nazwa.toUpperCase());
    for (const p of poz) linie.push(`☐ ${p.nazwa}${p.ilosc ? ' – ' + p.ilosc : ''}`);
    linie.push('');
  }
  return linie.join('\n');
}

// Dane do kodu QR: jeśli lista jest długa, dzielimy ją na części (każda to osobna lista)
export async function linkiQR(plan, wynik, adresStrony, maxDlugosc = 1100) {
  const grupy = wynik.grupy.map((g) => [g.dzial.nazwa, g.pozycje.filter((p) => !p.skreslona).map((p) => (p.ilosc ? [p.nazwa, p.ilosc] : [p.nazwa]))]).filter((g) => g[1].length);
  const tytul = tytulListy(plan);
  const zrob = async (gr, t) => `${adresStrony}#${await spakuj({ t, g: gr, id: plan.id })}`;
  let link = await zrob(grupy, tytul);
  if (link.length <= maxDlugosc) return [link];
  // dzielimy po pozycjach na 2-3 części
  for (const n of [2, 3, 4, 5, 6]) {
    const wszystkie = [];
    grupy.forEach(([dz, poz]) => poz.forEach((p) => wszystkie.push([dz, p])));
    const naCzesc = Math.ceil(wszystkie.length / n);
    const linki = [];
    for (let c = 0; c < n; c++) {
      const kawalek = wszystkie.slice(c * naCzesc, (c + 1) * naCzesc);
      const gr = [];
      for (const [dz, p] of kawalek) { const ost = gr[gr.length - 1]; if (ost && ost[0] === dz) ost[1].push(p); else gr.push([dz, [p]]); }
      if (gr.length) linki.push(await zrob(gr, `${tytul} (cz. ${c + 1}/${n})`));
    }
    if (linki.every((l) => l.length <= maxDlugosc)) return linki;
  }
  return [link];
}
