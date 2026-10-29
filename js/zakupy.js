// Lista zakupów: sumowanie składników z planu
import { gotowania } from './model.js';
import { gramy, liczba, jednostka, iloscTekst, dataPl, spakuj, jednostkaZFormy, fold } from './util.js';

// Jednostki: opakowania (kupuje się całe), rzeczy liczone w sztukach (zostają jak w przepisie), miary kuchenne (przeliczamy na gramy, jeśli słownik zna wagę)
const OPAKOWANIA = new Set(['opakowanie', 'puszka', 'butelka', 'kartonik', 'słoik', 'kubek', 'torebka', 'woreczek']);
const MIARY = new Set(['łyżka', 'łyżeczka', 'szklanka', 'garść', 'szczypta', 'kieliszek', 'filiżanka']);
const EPS = 1e-6;

function nowyAkumulator(pid) {
  return { pid, wklady: [], bezIlosci: [], zrodla: [], czesci: [] };
}

// Dolicza jeden składnik (przemnożony przez f) — zapamiętujemy go tak, jak jest w przepisie; o formie na liście decyduje formatujPozycje
function dolicz(acc, prod, e, f, zrodlo) {
  acc.zrodla.push(zrodlo);
  if (e.ilosc == null && !e.g) {
    acc.bezIlosci.push(e.uwaga || (prod?.tryb === 'brak' ? 'do smaku' : 'bez podanej ilości'));
    return;
  }
  let j = e.ilosc == null ? 'g' : (e.jedn || 'szt');
  // „1 kostka” kostki rosołowej, „2 placki” tortilli = sztuki tego produktu
  if (!['g', 'ml', 'szt'].includes(j) && !MIARY.has(j) && !OPAKOWANIA.has(j) && fold(prod?.nazwa || '').startsWith(fold(j).slice(0, 5))) j = 'szt';
  const q = e.ilosc == null ? e.g * f : e.ilosc * f;
  const g = e.g ? e.g * f : (j === 'g' || j === 'ml' ? q : null);
  acc.wklady.push({ j: j === 'ml' ? 'g' : j, q, g, ml: j === 'ml' });
  acc.czesci.push(opisIlosci(e, f));
}

// Gramy jednego wkładu (z przepisu albo z wag jednostek w słowniku); null = nie wiadomo
function gramyWkladu(w, prod) {
  if (w.g != null) return w.g;
  const jg = prod?.jg || {};
  if (jg[w.j]) return w.q * jg[w.j];
  if (w.j === 'szt' && prod?.gSzt && prod.tryb !== 'opak') return w.q * prod.gSzt;
  return null;
}

function sumaJednostek(mapa) {
  // kolejność: sztuki i inne liczone, potem gramy
  return [...mapa.entries()].filter(([, v]) => v > EPS)
    .sort(([a], [b]) => (a === 'g') - (b === 'g'))
    .map(([j, v]) => (j === 'g' ? gramy(v) : iloscTekst(v, j))).join(' + ');
}

function sufit(x) { return Math.max(1, Math.ceil(x - 0.05)); }

// Ilość na liście „jak w przepisach”: sumujemy w jednostkach z przepisów (bez zaokrąglania do całych sztuk);
// miary kuchenne (łyżki, szklanki) zamieniamy na gramy, jeśli znamy ich wagę. Produkty w opakowaniach liczymy w całych opakowaniach.
export function formatujPozycje(acc, prod) {
  const tryb = prod?.tryb || 'g';
  const czesci = acc.czesci.length > 1 ? acc.czesci.join(' + ') : '';
  const bez = [...new Set(acc.bezIlosci)];
  let glowna = '', szczegoly = '';
  if (tryb === 'opak' && prod?.gSzt) {
    let opak = 0, gram = 0; const reszta = new Map();
    for (const w of acc.wklady) {
      const naSzt = w.g != null && w.q > EPS ? w.g / w.q : null;
      if (OPAKOWANIA.has(w.j)) opak += w.q;
      else if (w.j === 'szt' && prod.jg?.szt) gram += w.q * prod.jg.szt;
      else if (w.j === 'szt' && naSzt && naSzt / prod.gSzt >= 0.6 && naSzt / prod.gSzt <= 1.6) opak += w.q; // „1 szt. (150 g)” = jedno opakowanie
      else if (MIARY.has(w.j) && w.g == null) reszta.set(w.j, (reszta.get(w.j) || 0) + w.q); // „2 łyżki oleju” nie oznacza kupna butelki — zostaje jak w przepisie
      else if (gramyWkladu(w, prod) != null && w.j !== 'szt') gram += gramyWkladu(w, prod);
      else if (w.j === 'szt' && w.g != null) gram += w.g;
      else reszta.set(w.j, (reszta.get(w.j) || 0) + w.q); // np. kostka rosołowa „2 szt.” — zostaje w sztukach
    }
    // gdy i tak kupujemy opakowanie, łyżki itp. o znanej wadze wliczamy do niego („1 × butelka”, a nie „1 × butelka + 2 łyżki”)
    if ((opak > EPS || gram > EPS) && reszta.size) {
      for (const [j, v] of [...reszta]) if (prod.jg?.[j]) { gram += v * prod.jg[j]; reszta.delete(j); }
    }
    const razem = opak + gram / prod.gSzt;
    const czesciGlownej = [];
    if (razem > EPS) czesciGlownej.push(`${sufit(razem)} × ${prod.opis || 'opak. ' + gramy(prod.gSzt)}`);
    if (reszta.size) czesciGlownej.push(sumaJednostek(reszta));
    glowna = czesciGlownej.join(' + ');
    const sz = [];
    if (razem > EPS && (gram > EPS || czesci)) sz.push(`potrzeba ${acc.czesci.join(' + ')}`);
    if (reszta.size) {
      let gr = 0, znane = true;
      for (const [j, v] of reszta) { const x = prod.jg?.[j]; if (x) gr += v * x; else znane = false; }
      if (znane && gr > EPS) sz.push(`${sumaJednostek(reszta)} ≈ ${gramy(gr)}`);
    }
    szczegoly = sz.join('; ');
  } else if (tryb === 'brak') {
    const m = new Map();
    for (const w of acc.wklady) m.set(w.j, (m.get(w.j) || 0) + w.q);
    glowna = sumaJednostek(m);
  } else {
    // sumy w jednostkach: rzeczy liczone zostają (szt., kromki, plastry, ząbki), miary i gramy → gramy, gdy się da
    const m = new Map(); let gramyRazem = 0, gramyZnane = true;
    for (const w of acc.wklady) {
      const gw = gramyWkladu(w, prod);
      if (gw == null) gramyZnane = false; else gramyRazem += gw;
      let j = w.j;
      if (MIARY.has(j) && gw != null) j = 'g';
      if (OPAKOWANIA.has(j) && gw != null) j = 'g';
      m.set(j, (m.get(j) || 0) + (j === 'g' ? gw : w.q));
    }
    // ta sama rzecz raz w sztukach, raz w gramach (np. „½ szt. (90 g)” i „200 g”) — przy produktach na sztuki zostawiamy obie części,
    // przy produktach na wagę wszystko, co ma znane gramy, sumujemy w gramach
    if (tryb === 'g' && m.size > 1 && gramyZnane) { m.clear(); m.set('g', gramyRazem); }
    glowna = sumaJednostek(m);
    if (acc.wklady.every((w) => w.ml) && m.size === 1 && m.has('g')) glowna = `${liczba(Math.round(m.get('g')))} ml`;
    const hint = [];
    const tylkoSzt = m.size === 1 && m.has('szt');
    if (tryb === 'szt' && prod?.gSzt && gramyZnane && gramyRazem > EPS) {
      const szt = gramyRazem / prod.gSzt;
      if (!tylkoSzt) hint.push(prod.opis && !/^\d/.test(prod.opis) ? `≈ ${liczba(szt)} × ${prod.opis}` : `≈ ${liczba(szt)} szt.`);
      else if (prod.opis && !/^\d/.test(prod.opis)) hint.push(`≈ ${liczba(szt)} × ${prod.opis}`);
    } else if (!(m.size === 1 && m.has('g')) && gramyZnane && gramyRazem > EPS) hint.push(`≈ ${gramy(gramyRazem)}`);
    szczegoly = hint.join('; ');
  }
  if (bez.length && tryb !== 'brak') szczegoly = [szczegoly, (glowna ? '+ ' : '') + bez.join(', ')].filter(Boolean).join('; ');
  else if (tryb === 'brak') szczegoly = bez.join(', ');
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
