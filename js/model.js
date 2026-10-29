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

// Pola wpisu w planie:
//   przepis, osoby[]            — co i dla kogo
//   naDni, poPlanie             — gotuję raz na naDni dni; poPlanie = ile z tych dni wypada już po końcu planu
//   zGotowania: data            — danie z gotowania z podanego dnia (nie liczy się na liście zakupów)
//   zPlanu: id, auto: true      — dzień „z gotowania” dopisany sam z poprzedniego planu (gotowanie przechodzące przez koniec planu)
//   zPlanu: id, przeniesione    — danie skopiowane z innego planu, który obejmuje ten sam dzień
//   bezZakupow: true            — gotuję, ale składników nie dopisuj do listy zakupów (np. już kupione)

export function ustawPrzepis(d, p, data, slot, przepisId) {
  usunWpis(p, data, slot, d);
  ustaw(p, data, slot, { przepis: przepisId, osoby: wszystkieOsoby(d) });
}

// Czy wpis x (inny dzień tego samego posiłku) jest „z gotowania” wpisu w z dnia `data`
function odnosiSie(x, w, data) {
  return !!x && x.zGotowania === data && x.przepis === w.przepis && (!x.auto || x.zPlanu === w.zPlanu);
}
// Dni tego planu, które jedzą z gotowania wpisu z dnia `data`
export function dniZGotowania(p, data, slot) {
  const w = wpis(p, data, slot); if (!w || w.zGotowania) return [];
  return dniPlanu(p).filter((dd) => dd !== data && odnosiSie(wpis(p, dd, slot), w, data));
}
// Daty po końcu planu objęte gotowaniem (np. ostatni dzień planu, gotuję na 2 dni → pierwszy dzień następnego planu)
export function dniPoPlanie(p, w) {
  const out = [];
  for (let k = 1; k <= (w?.poPlanie || 0); k++) out.push(dodajDni(p.do, k));
  return out;
}

export function usunWpis(p, data, slot, d = null) {
  const w = wpis(p, data, slot);
  if (!w) return;
  if (w.zGotowania) {
    odlaczOdZrodla(d, p, data, slot);
    ustaw(p, data, slot, null);
    return;
  }
  for (const dd of dniZGotowania(p, data, slot)) if (!wpis(p, dd, slot).auto) ustaw(p, dd, slot, null);
  ustaw(p, data, slot, null);
}

// Wpis „z gotowania” przestaje nim być (usunięty albo „gotuję osobno”): źródło gotuje o jeden dzień mniej
export function odlaczOdZrodla(d, p, data, slot) {
  const x = wpis(p, data, slot); if (!x || !x.zGotowania) return;
  const zr = x.zGotowania;
  if (x.auto && d) {
    const q = d.plany.find((y) => y.id === x.zPlanu);
    const z = q && wpis(q, zr, slot);
    if (z && z.poPlanie > 0) {
      z.poPlanie--; if (!z.poPlanie) delete z.poPlanie;
      z.naDni = (z.naDni || 2) - 1; if (z.naDni <= 1) delete z.naDni;
    }
  }
  const src = wpis(p, zr, slot);
  delete x.zGotowania; delete x.auto; delete x.zPlanu; delete x.przeniesione;
  if (src && !src.zGotowania) przeliczNaDni(p, zr, slot);
}

function przeliczNaDni(p, data, slot) {
  const z = wpis(p, data, slot); if (!z) return;
  const n = 1 + dniZGotowania(p, data, slot).length + (z.poPlanie || 0);
  if (n > 1) z.naDni = n; else delete z.naDni;
}

// Gotuję raz na kilka dni: kolejne dni dostają ten sam przepis jako "z gotowania".
// Dni wypadające po końcu planu zapamiętujemy (poPlanie) — liczą się na liście tego planu,
// a w następnym planie pojawią się same jako „z gotowania” (synchronizujGotowania).
export function gotujNaDni(p, data, slot, n) {
  const w = wpis(p, data, slot); if (!w || w.zGotowania) return;
  for (const dd of dniZGotowania(p, data, slot)) if (!wpis(p, dd, slot).auto) ustaw(p, dd, slot, null);
  const dni = dniPlanu(p); const i = dni.indexOf(data);
  let wPlanie = 1;
  for (let k = 1; k < n && i + k < dni.length; k++) {
    const dd = dni[i + k];
    const x = wpis(p, dd, slot);
    if (x && x.naDni > 1 && !x.zGotowania) usunWpis(p, dd, slot);
    const nowy = { przepis: w.przepis, osoby: [...w.osoby], zGotowania: data };
    if (w.zPlanu) { nowy.zPlanu = w.zPlanu; nowy.przeniesione = true; }
    ustaw(p, dd, slot, nowy);
    wPlanie++;
  }
  const poza = Math.max(0, n - wPlanie);
  if (poza) w.poPlanie = poza; else delete w.poPlanie;
  przeliczNaDni(p, data, slot);
}

// Po zmianie dat planu: dni poza zakresem znikają, gotowania na kilka dni przeliczają się od nowa
export function zmienDatyPlanu(d, p, od, do_) {
  p.od = od; p.do = do_;
  for (const k of Object.keys(p.dni || {})) if (k < od || k > do_) delete p.dni[k];
  for (const data of dniPlanu(p)) {
    for (const [slot, w] of Object.entries(p.dni?.[data] || {})) {
      if (!w) continue;
      // „z gotowania” z dnia, którego już nie ma w planie (i nie z innego planu) → zwykłe danie
      if (w.zGotowania && !w.zPlanu && (w.zGotowania < od || w.zGotowania > do_)) { delete w.zGotowania; continue; }
      if (!w.zGotowania && w.naDni > 1) gotujNaDni(p, data, slot, w.naDni);
    }
  }
}

// Gotowanie przechodzące przez koniec planu: w planach obejmujących te dni dopisujemy (albo usuwamy)
// automatyczne wpisy „z gotowania”. Wywoływane po każdej zmianie danych; niczego nie nadpisuje.
export function synchronizujGotowania(d) {
  const chciane = new Map();
  for (const q of d.plany) {
    for (const [t, sloty] of Object.entries(q.dni || {})) {
      for (const [s, w] of Object.entries(sloty || {})) {
        if (!w || w.zGotowania || !(w.poPlanie > 0)) continue;
        for (const u of dniPoPlanie(q, w)) {
          for (const p of d.plany) {
            if (p === q || u < p.od || u > p.do) continue;
            chciane.set(`${p.id}|${u}|${s}`, { przepis: w.przepis, osoby: [...w.osoby], zGotowania: t, zPlanu: q.id, auto: true });
          }
        }
      }
    }
  }
  let zmiany = 0;
  for (const p of d.plany) {
    for (const [u, sloty] of Object.entries(p.dni || {})) {
      for (const [s, x] of Object.entries(sloty || {})) {
        if (!x?.auto) continue;
        const c = chciane.get(`${p.id}|${u}|${s}`);
        if (!c || c.zPlanu !== x.zPlanu || c.zGotowania !== x.zGotowania) { delete sloty[s]; zmiany++; }
        else if (c.przepis !== x.przepis) { x.przepis = c.przepis; zmiany++; }
      }
    }
  }
  for (const [k, c] of chciane) {
    const [pid, u, s] = k.split('|');
    const p = d.plany.find((x) => x.id === pid);
    if (p && !wpis(p, u, s)) { ustaw(p, u, s, c); zmiany++; }
  }
  return zmiany;
}

// Dni planu [od, do], które są też w innych planach (z daniami). Dla każdego dnia bierzemy najnowszy taki plan.
export function dniWspolne(d, od, do_, pominId = null) {
  const out = [];
  for (const data of zakresDat(od, do_)) {
    const q = d.plany
      .filter((x) => x.id !== pominId && data >= x.od && data <= x.do && Object.values(x.dni?.[data] || {}).some((w) => w && !w.auto))
      .sort((a, b) => ((b.utworzono || '') > (a.utworzono || '') ? 1 : -1))[0];
    if (q) out.push({ data, plan: q, ile: Object.values(q.dni[data]).filter((w) => w && !w.auto).length });
  }
  return out;
}

// Kopiuje dania z dni wspólnych z innymi planami (tylko w puste posiłki).
// doListy = false: składniki przeniesionych dań nie trafiają na listę zakupów (są już kupione / ugotowane).
export function przeniesDniWspolne(d, p, { doListy = false } = {}) {
  let n = 0;
  for (const { data, plan: q } of dniWspolne(d, p.od, p.do, p.id)) {
    for (const [s, w] of Object.entries(q.dni[data] || {})) {
      if (!w || w.auto || wpis(p, data, s)) continue;
      const k = { przepis: w.przepis, osoby: [...w.osoby], zPlanu: q.id, przeniesione: true };
      if (w.zGotowania) k.zGotowania = w.zGotowania;
      else if (!doListy) k.bezZakupow = true;
      ustaw(p, data, s, k); n++;
    }
  }
  for (const data of dniPlanu(p)) for (const [s, w] of Object.entries(p.dni?.[data] || {})) if (w?.przeniesione && !w.zGotowania) przeliczNaDni(p, data, s);
  return n;
}

export function przelaczOsobe(p, data, slot, osobaId) {
  const w = wpis(p, data, slot); if (!w) return;
  const i = w.osoby.indexOf(osobaId);
  if (i >= 0) { if (w.osoby.length > 1) w.osoby.splice(i, 1); } else w.osoby.push(osobaId);
}

// Ile porcji-osób gotuje się przy wpisie z dnia `data` (razem z dniami „z gotowania” w planie i po planie)
export function porcjeGotowania(p, data, slot) {
  const w = wpis(p, data, slot); if (!w || w.zGotowania) return null;
  const dniZ = dniZGotowania(p, data, slot);
  let osoby = w.osoby.length;
  for (const dd of dniZ) osoby += wpis(p, dd, slot).osoby.length;
  const poza = dniPoPlanie(p, w);
  osoby += poza.length * w.osoby.length;
  return { osoby, dniZ, poza };
}

// Wpisy, przy których się gotuje i kupuje (bez "z gotowania" i bez „nie dopisuj do listy”), z łączną liczbą porcji-osób
export function gotowania(p, d) {
  const out = [];
  for (const data of dniPlanu(p)) {
    for (const slot of d.ustawienia.posilki.map((x) => x.id)) {
      const w = wpis(p, data, slot);
      if (!w || w.zGotowania || w.bezZakupow || !d.przepisy[w.przepis]) continue;
      const g = porcjeGotowania(p, data, slot);
      out.push({ data, slot, wpis: w, przepis: d.przepisy[w.przepis], osoby: g.osoby, dni: [data, ...g.dniZ, ...g.poza] });
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
        if (!w?.przepis || w.auto || w.przeniesione) continue; // kopie z innych planów liczymy raz
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
// Dopasowanie kategorii przepisu do posiłku: 0 = pasuje, liczba = kara, brak = nie pasuje
const ZGODNOSC = {
  sniadanie: { sniadanie: 0, drugie_sniadanie: 0.06, deser: 0.15 },
  drugie_sniadanie: { drugie_sniadanie: 0, sniadanie: 0.05, deser: 0.08, obiad: 0.12 },
  obiad: { obiad: 0, kolacja: 0.08, drugie_sniadanie: 0.15 },
  kolacja: { kolacja: 0, obiad: 0.06, drugie_sniadanie: 0.1, sniadanie: 0.15 },
};
export function karaKategorii(r, slot) {
  const z = ZGODNOSC[slot];
  if (!z) return 0;
  if ((slot === 'obiad' || slot === 'kolacja') && (r.kategorie || []).includes('deser')) return null; // deser to nie obiad ani kolacja
  let best = null;
  for (const k of r.kategorie || []) if (k in z && (best === null || z[k] < best)) best = z[k];
  return best;
}

function kandydaci(d, slot) {
  const wszystkie = przepisy(d, 'zatwierdzony').filter((r) => !r.ukryty && !(r.kategorie || []).includes('baza'));
  const zKcal = wszystkie.filter((r) => r.kcal);
  const baza = zKcal.length ? zKcal : wszystkie;
  const pasujace = baza.map((r) => ({ r, kat: karaKategorii(r, slot) })).filter((x) => x.kat !== null);
  // gdy nic nie pasuje do posiłku, bierzemy wszystko z dużą karą
  return pasujace.length ? pasujace : baza.map((r) => ({ r, kat: 0.5 }));
}

function cele(d) {
  return d.ustawienia.osoby.map((o) => ({ id: o.id, kcal: o.celKcal || null, b: o.celB || null, t: o.celT || null, w: o.celW || null }));
}

// Ocena dnia (im mniej, tym lepiej): kalorie i makro względem celów, różnorodność, kategorie, ulubione
function ocenDzien(d, p, data, wybor, kontekst) {
  const { celeOsob, uzycia, poprzedni, h, szum } = kontekst;
  const sumy = {};
  for (const c of celeOsob) sumy[c.id] = { kcal: 0, b: 0, t: 0, w: 0 };
  const wDniu = {};
  for (const pos of d.ustawienia.posilki) {
    const w = wybor[pos.id] ? { przepis: wybor[pos.id].r.id, osoby: wszystkieOsoby(d) } : wpis(p, data, pos.id);
    if (!w) continue;
    const r = d.przepisy[w.przepis]; if (!r) continue;
    wDniu[r.id] = (wDniu[r.id] || 0) + 1;
    for (const oid of w.osoby) { const s = sumy[oid]; if (!s) continue; s.kcal += r.kcal || 0; s.b += r.b || 0; s.t += r.t || 0; s.w += r.w || 0; }
  }
  let ocena = 0;
  for (const c of celeOsob) {
    const s = sumy[c.id];
    if (c.kcal) ocena += Math.abs(s.kcal - c.kcal) / c.kcal;
    for (const m of ['b', 't', 'w']) if (c[m]) ocena += 0.35 * Math.abs(s[m] - c[m]) / c[m];
  }
  for (const [slot, x] of Object.entries(wybor)) {
    const r = x.r;
    ocena += x.kat;
    ocena += 0.08 * (uzycia[r.id] || 0);                    // już jest w planie
    if (wDniu[r.id] > 1) ocena += 0.6;                       // to samo dwa razy jednego dnia
    if (poprzedni?.[slot] === r.id) ocena += 0.1;            // to samo co wczoraj w tym posiłku
    if (r.ulubiony) ocena -= 0.04;
    const o = h[r.id]?.ostatnio;
    if (o && o < p.od && roznicaDni(o, p.od) < 10) ocena += 0.04;
    ocena += szum(slot, r.id);
  }
  return ocena;
}

function kontekstPlanu(d, p, losuj) {
  const uzycia = {};
  for (const sl of Object.values(p.dni || {})) for (const w of Object.values(sl)) if (w?.przepis && !w.zGotowania) uzycia[w.przepis] = (uzycia[w.przepis] || 0) + 1;
  const szumy = new Map();
  return {
    celeOsob: cele(d), uzycia, h: historia(d),
    szum: (slot, id) => { const k = slot + '|' + id; if (!szumy.has(k)) szumy.set(k, losuj() * 0.06); return szumy.get(k); },
    odnowSzum: () => szumy.clear(),
  };
}

// Dobiera przepisy do wskazanych pustych posiłków jednego dnia (losowy start + poprawianie po jednym posiłku)
function dobierzDzien(d, p, data, sloty, kontekst, losuj, odrzucone = new Set()) {
  const pule = {};
  for (const s of sloty) {
    pule[s] = kandydaci(d, s).filter((x) => !odrzucone.has(x.r.id));
    if (!pule[s].length) return null;
  }
  const dni = dniPlanu(p); const i = dni.indexOf(data);
  kontekst.poprzedni = {};
  if (i > 0) for (const s of sloty) { const w = wpis(p, dni[i - 1], s); if (w) kontekst.poprzedni[s] = w.przepis; }
  let najlepszy = null, najlepszaOcena = Infinity;
  for (let restart = 0; restart < 8; restart++) {
    kontekst.odnowSzum();
    const wybor = {};
    for (const s of sloty) wybor[s] = pule[s][Math.floor(losuj() * pule[s].length)];
    let ocena = ocenDzien(d, p, data, wybor, kontekst);
    for (let przejscie = 0; przejscie < 3; przejscie++) {
      let poprawa = false;
      for (const s of sloty) {
        for (const x of pule[s]) {
          if (x === wybor[s]) continue;
          const stary = wybor[s]; wybor[s] = x;
          const o = ocenDzien(d, p, data, wybor, kontekst);
          if (o < ocena - 1e-9) { ocena = o; poprawa = true; } else wybor[s] = stary;
        }
      }
      if (!poprawa) break;
    }
    if (ocena < najlepszaOcena) { najlepszaOcena = ocena; najlepszy = { ...wybor }; }
  }
  return najlepszy;
}

// Wypełnia wszystkie puste posiłki planu. Zwraca liczbę wstawionych dań i liczbę dni wyraźnie poniżej celu kalorii.
export function uzupelnijPuste(d, p, losuj = Math.random) {
  const kontekst = kontekstPlanu(d, p, losuj);
  let n = 0, ponizejCelu = 0;
  for (const data of dniPlanu(p)) {
    const sloty = d.ustawienia.posilki.map((x) => x.id).filter((s) => !wpis(p, data, s));
    if (!sloty.length) continue;
    const wybor = dobierzDzien(d, p, data, sloty, kontekst, losuj);
    if (!wybor) continue;
    for (const s of sloty) {
      ustawPrzepis(d, p, data, s, wybor[s].r.id);
      kontekst.uzycia[wybor[s].r.id] = (kontekst.uzycia[wybor[s].r.id] || 0) + 1;
      n++;
    }
    const k = kcalDnia(p, d, data);
    if (d.ustawienia.osoby.some((o) => o.celKcal && k[o.id].kcal < o.celKcal * 0.9)) ponizejCelu++;
  }
  return { n, ponizejCelu };
}

// Propozycja do jednego posiłku, z uwzględnieniem reszty dnia (kalorie, makro) i całego planu
export function zaproponujDlaSlotu(d, p, data, slot, odrzucone = new Set(), losuj = Math.random) {
  const kontekst = kontekstPlanu(d, p, losuj);
  const biezacy = wpis(p, data, slot);
  odrzucone = new Set(odrzucone);
  if (biezacy?.przepis) {
    odrzucone.add(biezacy.przepis); // proponujemy coś innego niż to, co już jest w tym posiłku
    if (!biezacy.zGotowania) kontekst.uzycia[biezacy.przepis] = Math.max(0, (kontekst.uzycia[biezacy.przepis] || 1) - 1);
  }
  // na czas oceny traktujemy ten posiłek jako pusty
  const kopia = { ...p, dni: { ...(p.dni || {}), [data]: { ...((p.dni || {})[data] || {}) } } };
  delete kopia.dni[data][slot];
  const wybor = dobierzDzien(d, kopia, data, [slot], kontekst, losuj, odrzucone);
  return wybor ? wybor[slot].r : null;
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
