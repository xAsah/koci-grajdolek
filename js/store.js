// Stan programu: wczytywanie i zapisywanie pliku dane.json, wykrywanie zmian z drugiego komputera
import * as fs from './fs.js';
import { debounce } from './util.js';
import { synchronizujGotowania } from './model.js';
import { czyInnaWersja } from './scal.js';

export const DZIALY_DOMYSLNE = [
  { id: 'wo', nazwa: 'Warzywa i owoce' }, { id: 'pie', nazwa: 'Pieczywo' }, { id: 'mie', nazwa: 'Mięso i wędliny' },
  { id: 'ryb', nazwa: 'Ryby i owoce morza' }, { id: 'nab', nazwa: 'Nabiał i jaja' }, { id: 'got', nazwa: 'Dania gotowe i garmażerka' },
  { id: 'suc', nazwa: 'Kasze, makarony, ryż, mąki' }, { id: 'kon', nazwa: 'Konserwy, sosy i przetwory' },
  { id: 'prz', nazwa: 'Przyprawy i dodatki do pieczenia' }, { id: 'bak', nazwa: 'Bakalie, orzechy i nasiona' },
  { id: 'slo', nazwa: 'Słodycze i przekąski' }, { id: 'ole', nazwa: 'Oleje i octy' }, { id: 'nap', nazwa: 'Napoje' },
  { id: 'mro', nazwa: 'Mrożonki' }, { id: 'che', nazwa: 'Chemia i dom' }, { id: 'inn', nazwa: 'Inne' },
];
export const POSILKI = [
  { id: 'sniadanie', nazwa: 'Śniadanie' }, { id: 'drugie_sniadanie', nazwa: 'II śniadanie' },
  { id: 'obiad', nazwa: 'Obiad' }, { id: 'kolacja', nazwa: 'Kolacja' },
];

export function nowaBaza() {
  const teraz = new Date().toISOString();
  return {
    format: 'koci-grajdolek-dane', wersja: 1, utworzono: teraz, zmieniono: teraz, licznik: 0,
    ustawienia: {
      osoby: [{ id: 'anita', imie: 'Anita', celKcal: null }, { id: 'marcin', imie: 'Marcin', celKcal: null }],
      posilki: POSILKI.map((p) => ({ ...p })),
      dzialy: DZIALY_DOMYSLNE.map((d) => ({ ...d })),
      staleZakupy: [
        { id: 'stale-kawa', nazwa: 'Kawa', dzial: 'nap' },
        { id: 'stale-mleko-kawa', nazwa: 'Mleko do kawy', dzial: 'nab' },
        { id: 'stale-papier', nazwa: 'Papier toaletowy', dzial: 'che' },
        { id: 'stale-plyn', nazwa: 'Płyn do naczyń', dzial: 'che' },
      ],
    },
    produkty: {}, przepisy: {}, plany: [], importy: [], noweProdukty: [],
  };
}

function migruj(d) {
  if (!d.ustawienia) d.ustawienia = nowaBaza().ustawienia;
  const u = d.ustawienia;
  u.osoby ||= nowaBaza().ustawienia.osoby;
  u.posilki ||= POSILKI.map((p) => ({ ...p }));
  u.dzialy ||= DZIALY_DOMYSLNE.map((x) => ({ ...x }));
  for (const dz of DZIALY_DOMYSLNE) if (!u.dzialy.find((x) => x.id === dz.id)) u.dzialy.push({ ...dz });
  u.staleZakupy ||= [];
  d.produkty ||= {}; d.przepisy ||= {}; d.plany ||= []; d.importy ||= []; d.noweProdukty ||= [];
  u.migracje ||= [];
  // 1.2.0: mięso (bez wędlin) na liście zakupów osobno dla każdego dania — da się zmienić w Produktach
  if (!u.migracje.includes('mieso-osobno')) {
    for (const id of MIESO_OSOBNO) if (d.produkty[id] && d.produkty[id].osobno === undefined) d.produkty[id].osobno = true;
    u.migracje.push('mieso-osobno');
  }
  return d;
}
const MIESO_OSOBNO = ['piers-z-kurczaka-filet', 'udka-z-kurczaka', 'mieso-mielone-z-kurczaka', 'mieso-mielone-z-indyka', 'filet-z-indyka', 'poledwiczka-z-indyka', 'lopatka-wieprzowa'];

// ---------- stan i subskrypcje ----------
const sluchacze = new Set();
export const stan = {
  faza: 'start',          // start | nieobslugiwane | brak-folderu | uprawnienia | nowy-folder | gotowe | blad
  dane: null,
  folder: null,
  folderNazwa: '',
  zapis: 'zapisano',      // zapisano | niezapisane | zapisywanie | blad
  bladZapisu: '',
  konflikt: null,         // { kiedy } gdy plik zmienił się na innym komputerze, a tu są niezapisane zmiany
  znanaWersjaPliku: 0,    // lastModified pliku po ostatnim odczycie/zapisie
  ostatniaKopia: 0,
  komunikat: null,
  wersjaDanych: 0,        // licznik zmian w pamięci (do odświeżania widoków)
  inneWersje: [],         // pliki „dane-…json” obok dane.json (zwykle konflikt OneDrive: druga wersja danych)
  slady: null,            // przy braku dane.json: co jeszcze jest w folderze (kopie, inne wersje)
};
// Kto pracuje na tym komputerze (zapisujemy w danych, kto i kiedy ostatnio zapisał)
export function ktoTo() { try { return JSON.parse(localStorage.getItem('kg:ktoTo') || 'null'); } catch { return null; } }
export function ustawKtoTo(id) { try { localStorage.setItem('kg:ktoTo', JSON.stringify(id)); } catch { /* bez pamięci */ } powiadom(); }
function imieKto(d) { const id = ktoTo(); return d?.ustawienia?.osoby?.find((o) => o.id === id)?.imie || null; }
export function subskrybuj(fn) { sluchacze.add(fn); return () => sluchacze.delete(fn); }
function powiadom() { stan.wersjaDanych++; sluchacze.forEach((f) => f(stan)); }
export function komunikat(tekst, typ = 'info') {
  const czas = Math.max(4000, tekst.length * 65); // dłuższy komunikat = dłużej widoczny
  const id = Date.now();
  stan.komunikat = { tekst, typ, id };
  powiadom();
  setTimeout(() => { if (stan.komunikat && stan.komunikat.id === id) { stan.komunikat = null; powiadom(); } }, czas);
}

// ---------- start ----------
export async function start() {
  if (!fs.obslugiwane()) { stan.faza = 'nieobslugiwane'; powiadom(); return; }
  const h = await fs.zapamietanyFolder();
  if (!h) { stan.faza = 'brak-folderu'; powiadom(); return; }
  stan.folder = h; stan.folderNazwa = h.name;
  const p = await fs.stanUprawnien(h);
  if (p !== 'granted') { stan.faza = 'uprawnienia'; powiadom(); return; }
  await wczytaj();
}

export async function wybierzFolder() {
  try {
    const h = await fs.wybierzFolder();
    stan.folder = h; stan.folderNazwa = h.name;
    await wczytaj();
  } catch (e) {
    if (e?.name !== 'AbortError') { stan.faza = 'blad'; stan.bladZapisu = String(e?.message || e); powiadom(); }
  }
}

export async function udzielUprawnien() {
  const ok = await fs.poprosOUprawnienia(stan.folder);
  if (ok) await wczytaj();
  else komunikat('Bez zgody na folder program nie może czytać ani zapisywać danych.', 'blad');
}

async function sprawdzInneWersje() {
  try {
    const pliki = await fs.listaPlikow(stan.folder);
    const inne = pliki.filter((p) => czyInnaWersja(p.nazwa));
    const klucz = (l) => l.map((p) => p.nazwa + p.zmieniono).join('|');
    if (klucz(inne) !== klucz(stan.inneWersje)) { stan.inneWersje = inne; powiadom(); }
    return inne;
  } catch { return []; }
}

async function wczytaj() {
  try {
    if (!(await fs.istnieje(stan.folder, fs.PLIK_DANYCH))) {
      const inne = await sprawdzInneWersje();
      const kopie = await fs.listaKopii(stan.folder);
      stan.slady = { kopie: kopie.length, ostatniaKopia: kopie[0]?.nazwa || null, inne };
      stan.faza = 'nowy-folder'; stan.dane = null; powiadom(); return;
    }
    const { tekst, zmieniono } = await fs.czytajPlik(stan.folder, fs.PLIK_DANYCH);
    const d = JSON.parse(tekst);
    if (d.format !== 'koci-grajdolek-dane') throw new Error('Plik dane.json nie pochodzi z programu Koci Grajdołek.');
    stan.dane = migruj(d);
    stan.znanaWersjaPliku = zmieniono;
    stan.zapis = 'zapisano'; stan.konflikt = null;
    stan.faza = 'gotowe'; stan.slady = null;
    powiadom();
    sprawdzInneWersje();
    uruchomPodglad();
  } catch (e) {
    stan.faza = 'blad'; stan.bladZapisu = 'Nie udało się wczytać dane.json: ' + (e?.message || e); powiadom();
  }
}

// Na nowym folderze, w którym są ślady danych: zacznij od najnowszej kopii albo od innej wersji pliku
export async function zacznijOdKopii() {
  const n = stan.slady?.ostatniaKopia; if (!n) return;
  const json = JSON.parse(await fs.czytajKopie(stan.folder, n));
  stan.dane = migruj(json); stan.faza = 'gotowe';
  await zapiszTeraz(true); uruchomPodglad(); sprawdzInneWersje();
  komunikat('Wczytano najnowszą kopię z folderu kopie.');
}
export async function zacznijOdPliku(nazwa) {
  const json = JSON.parse((await fs.czytajPlik(stan.folder, nazwa)).tekst);
  if (json.format !== 'koci-grajdolek-dane') throw new Error('To nie jest plik danych programu.');
  stan.dane = migruj(json); stan.faza = 'gotowe';
  await zapiszTeraz(true); uruchomPodglad(); sprawdzInneWersje();
  komunikat(`Wczytano dane z pliku ${nazwa}.`);
}
// Druga wersja danych po dołączeniu zmian (albo gdy jest niepotrzebna) trafia do podfolderu kopie
export async function odlozInnaWersje(nazwa) {
  const { tekst } = await fs.czytajPlik(stan.folder, nazwa);
  const kopie = await fs.podfolder(stan.folder, fs.FOLDER_KOPII);
  await fs.zapiszPlik(kopie, 'odlozone-' + nazwa, tekst);
  await fs.usunPlik(stan.folder, nazwa);
  await sprawdzInneWersje();
}
export async function czytajInnaWersje(nazwa) { return JSON.parse((await fs.czytajPlik(stan.folder, nazwa)).tekst); }
export function wymusKopie() { stan.ostatniaKopia = 0; }

export async function utworzNowaBaze() {
  stan.dane = nowaBaza();
  stan.faza = 'gotowe';
  await zapiszTeraz(true);
  uruchomPodglad();
}

// ---------- zmiany i zapis ----------
const zapiszPozniej = debounce(() => { zapiszTeraz(false); }, 1200);

// Każda zmiana danych przechodzi przez tę funkcję
export function zmien(fn) {
  if (!stan.dane) return;
  fn(stan.dane);
  synchronizujGotowania(stan.dane); // gotowanie przechodzące przez koniec planu → następny plan
  stan.zapis = 'niezapisane';
  powiadom();
  zapiszPozniej();
}

let zapisWToku = null;
export async function zapiszTeraz(wymus = false) {
  if (!stan.dane || !stan.folder) return;
  if (zapisWToku) { await zapisWToku; if (stan.zapis !== 'niezapisane' && !wymus) return; }
  zapisWToku = (async () => {
    try {
      const info = await fs.infoPliku(stan.folder, fs.PLIK_DANYCH);
      if (!wymus && info && stan.znanaWersjaPliku && info.zmieniono !== stan.znanaWersjaPliku) {
        stan.konflikt = { kiedy: info.zmieniono }; stan.zapis = 'niezapisane'; powiadom(); return;
      }
      stan.zapis = 'zapisywanie'; powiadom();
      // kopia poprzedniej wersji pliku (najwyżej co 5 minut)
      if (info && Date.now() - stan.ostatniaKopia > 5 * 60 * 1000) {
        const stary = await fs.czytajPlik(stan.folder, fs.PLIK_DANYCH);
        await fs.zrobKopie(stan.folder, stary.tekst);
        stan.ostatniaKopia = Date.now();
      }
      stan.dane.zmieniono = new Date().toISOString();
      stan.dane.licznik = (stan.dane.licznik || 0) + 1;
      stan.dane.ostatniZapis = { kto: imieKto(stan.dane), kiedy: stan.dane.zmieniono };
      const tekst = JSON.stringify(stan.dane);
      stan.znanaWersjaPliku = await fs.zapiszPlik(stan.folder, fs.PLIK_DANYCH, tekst);
      stan.zapis = 'zapisano'; stan.konflikt = null; stan.bladZapisu = '';
      powiadom();
    } catch (e) {
      stan.zapis = 'blad'; stan.bladZapisu = String(e?.message || e); powiadom();
    }
  })();
  await zapisWToku; zapisWToku = null;
}

export async function wczytajIchWersje() { stan.konflikt = null; await wczytaj(); komunikat('Wczytano wersję z drugiego komputera.'); }
export async function nadpiszMoja() { stan.konflikt = null; await zapiszTeraz(true); komunikat('Zapisano Twoją wersję.'); }

// Podgląd pliku: co kilka sekund sprawdzamy, czy plik nie zmienił się na drugim komputerze
let podglad = null, tik = 0;
function uruchomPodglad() {
  if (podglad) return;
  podglad = setInterval(async () => {
    if (document.hidden || stan.faza !== 'gotowe' || zapisWToku || stan.konflikt) return;
    if (++tik % 8 === 0) sprawdzInneWersje(); // co ok. 30 s
    const info = await fs.infoPliku(stan.folder, fs.PLIK_DANYCH).catch(() => null);
    if (!info || !stan.znanaWersjaPliku || info.zmieniono === stan.znanaWersjaPliku) return;
    if (stan.zapis === 'niezapisane' || zapiszPozniej.pending()) { stan.konflikt = { kiedy: info.zmieniono }; powiadom(); return; }
    await wczytaj();
    const kto = stan.dane?.ostatniZapis?.kto;
    komunikat(`Dane zmieniły się na drugim komputerze${kto ? ` (${kto})` : ''} — wczytano nową wersję.`);
  }, 4000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) zapiszPozniej.flush(); });
  window.addEventListener('beforeunload', (e) => {
    if (stan.zapis === 'niezapisane' || zapisWToku) { zapiszPozniej.flush(); e.preventDefault(); e.returnValue = ''; }
  });
}

// Podmiana całych danych (przywracanie kopii, wczytanie kopii z pliku)
export async function podmienDane(d) {
  if (d.format !== 'koci-grajdolek-dane') throw new Error('To nie jest plik danych programu Koci Grajdołek.');
  stan.dane = migruj(d);
  stan.zapis = 'niezapisane';
  powiadom();
  stan.ostatniaKopia = 0; // wymuś kopię bieżącego pliku przed nadpisaniem
  await zapiszTeraz(true);
}

export { fs };
