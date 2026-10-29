// Wczytywanie słownika produktów i paczek przepisów przygotowanych przez Claude
import { norm, uid } from './util.js';
import { indeksProduktow, podobneProdukty } from './model.js';

function scalSynonimy(cel, zrodlo) {
  const s = new Set(cel.synonimy || []);
  for (const x of [zrodlo.nazwa, ...(zrodlo.synonimy || [])]) if (x && norm(x) !== norm(cel.nazwa)) s.add(x);
  cel.synonimy = [...s];
}

function czystyProdukt(p) {
  const { id, nazwa, dzial, tryb, gSzt, opis, naListe, synonimy, jg, osobno } = p;
  const o = { id, nazwa, dzial: dzial || 'inn', tryb: tryb || 'g', naListe: naListe !== false, synonimy: [...(synonimy || [])] };
  if (osobno) o.osobno = true;
  if (gSzt) o.gSzt = gSzt;
  if (opis) o.opis = opis;
  if (jg) o.jg = { ...jg };
  return o;
}

// Dodaje produkty z paczki. Zwraca mapę id z paczki -> id w bazie.
function dodajProdukty(d, produkty, { kolejkuj, zrodlo, zweryfikowane = false }) {
  const mapa = {}; const nowe = []; const scalone = [];
  const idx = indeksProduktow(d, Math.random());
  for (const p of produkty || []) {
    if (d.produkty[p.id]) { scalSynonimy(d.produkty[p.id], p); mapa[p.id] = p.id; continue; }
    const trafienie = idx.get(norm(p.nazwa)) || (p.synonimy || []).map((s) => idx.get(norm(s))).find(Boolean);
    if (trafienie && d.produkty[trafienie]) {
      scalSynonimy(d.produkty[trafienie], p); mapa[p.id] = trafienie; scalone.push({ z: p.nazwa, do: d.produkty[trafienie].nazwa });
      continue;
    }
    const nowy = czystyProdukt(p);
    if (zweryfikowane) nowy.zweryfikowany = true;
    if (kolejkuj) {
      const podobne = podobneProdukty(d, p.nazwa, 4, 0.55).map((x) => x.id);
      nowy.nowy = true;
      d.noweProdukty.push({ id: nowy.id, zrodlo, podobne, dodano: new Date().toISOString() });
    }
    d.produkty[nowy.id] = nowy;
    idx.set(norm(nowy.nazwa), nowy.id);
    for (const s of nowy.synonimy) if (!idx.has(norm(s))) idx.set(norm(s), nowy.id);
    mapa[p.id] = nowy.id; nowe.push(nowy.nazwa);
  }
  return { mapa, nowe, scalone };
}

export function importujSlownik(d, json) {
  if (json.format !== 'koci-grajdolek-slownik') throw new Error('To nie jest słownik produktów programu Koci Grajdołek.');
  if (Array.isArray(json.dzialy)) {
    for (const dz of json.dzialy) if (!d.ustawienia.dzialy.find((x) => x.id === dz.id)) d.ustawienia.dzialy.push({ id: dz.id, nazwa: dz.nazwa });
  }
  const { nowe, scalone } = dodajProdukty(d, json.produkty, { kolejkuj: false, zrodlo: 'słownik', zweryfikowane: true });
  d.importy.push({ id: uid('imp-'), typ: 'slownik', zrodlo: 'Słownik produktów', data: new Date().toISOString(), dodane: nowe.length, scalone: scalone.length });
  return { typ: 'slownik', dodane: nowe.length, scalone, nowe };
}

export function importujPaczke(d, json) {
  if (json.format === 'koci-grajdolek-slownik') return importujSlownik(d, json);
  if (json.format !== 'koci-grajdolek-paczka') throw new Error('To nie jest paczka przepisów programu Koci Grajdołek.');
  const pierwszy = Object.keys(d.produkty).length === 0;
  const { mapa, nowe, scalone } = dodajProdukty(d, json.produkty, { kolejkuj: !pierwszy, zrodlo: json.opis || json.zrodlo, zweryfikowane: pierwszy });
  let dodane = 0, zaktualizowane = 0, pominiete = 0;
  const raport = new Map();
  for (const r0 of json.przepisy || []) {
    const r = JSON.parse(JSON.stringify(r0));
    for (const e of r.skladniki || []) {
      if (e.produkt && mapa[e.produkt]) e.produkt = mapa[e.produkt];
      if (e.produkt && d.produkty[e.produkt] && e.nazwa && norm(e.nazwa) !== norm(d.produkty[e.produkt].nazwa)) {
        const k = norm(e.nazwa) + '→' + e.produkt;
        if (!raport.has(k)) raport.set(k, { z: e.nazwa, do: d.produkty[e.produkt].nazwa, produkt: e.produkt });
      }
    }
    const ist = d.przepisy[r.id];
    // paczka z poprawką błędu importu: podmieniamy treść, zostawiając status, ulubione i „nie smakowało”
    if (ist && json.poprawka && ist.status !== 'kosz' && (json.poprawioneOd || '') !== (ist.poprawka || '')) {
      r.status = ist.status; r.ulubiony = ist.ulubiony; r.ukryty = ist.ukryty;
      r.zaimportowano = ist.zaimportowano; r.poprawka = json.poprawioneOd || 'tak'; r.edytowano = new Date().toISOString();
      d.przepisy[r.id] = r; zaktualizowane++;
      continue;
    }
    if (ist) {
      if (ist.edytowano || ist.status !== 'do_przejrzenia') { pominiete++; continue; }
      r.status = 'do_przejrzenia'; r.ulubiony = ist.ulubiony; r.ukryty = ist.ukryty;
      d.przepisy[r.id] = r; zaktualizowane++;
    } else {
      r.status = 'do_przejrzenia';
      r.zaimportowano = new Date().toISOString();
      d.przepisy[r.id] = r; dodane++;
    }
  }
  const wpisImportu = {
    id: uid('imp-'), typ: 'paczka', zrodlo: json.opis || json.zrodlo, data: new Date().toISOString(),
    dodane, zaktualizowane, pominiete, noweProdukty: pierwszy ? 0 : nowe.length,
    raportScalen: [...raport.values()].sort((a, b) => a.do.localeCompare(b.do, 'pl')),
  };
  d.importy.push(wpisImportu);
  return { typ: 'paczka', ...wpisImportu, nowe, scalone };
}

// Rozstrzygnięcie nowego produktu z kolejki
export function zatwierdzNowy(d, id) {
  const p = d.produkty[id]; if (p) { delete p.nowy; p.zweryfikowany = true; }
  d.noweProdukty = d.noweProdukty.filter((x) => x.id !== id);
}
