// Stan programu: wczytywanie i zapisywanie pliku dane.json, wykrywanie zmian z drugiego komputera
import * as fs from './fs.js';
import { debounce } from './util.js';

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
  return d;
}

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
};
export function subskrybuj(fn) { sluchacze.add(fn); return () => sluchacze.delete(fn); }
function powiadom() { stan.wersjaDanych++; sluchacze.forEach((f) => f(stan)); }
export function komunikat(tekst, typ = 'info') {
  stan.komunikat = { tekst, typ, id: Date.now() };
  powiadom();
  setTimeout(() => { if (stan.komunikat && Date.now() - stan.komunikat.id > 3500) { stan.komunikat = null; powiadom(); } }, 4000);
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

async function wczytaj() {
  try {
    if (!(await fs.istnieje(stan.folder, fs.PLIK_DANYCH))) {
      stan.faza = 'nowy-folder'; stan.dane = null; powiadom(); return;
    }
    const { tekst, zmieniono } = await fs.czytajPlik(stan.folder, fs.PLIK_DANYCH);
    const d = JSON.parse(tekst);
    if (d.format !== 'koci-grajdolek-dane') throw new Error('Plik dane.json nie pochodzi z programu Koci Grajdołek.');
    stan.dane = migruj(d);
    stan.znanaWersjaPliku = zmieniono;
    stan.zapis = 'zapisano'; stan.konflikt = null;
    stan.faza = 'gotowe';
    powiadom();
    uruchomPodglad();
  } catch (e) {
    stan.faza = 'blad'; stan.bladZapisu = 'Nie udało się wczytać dane.json: ' + (e?.message || e); powiadom();
  }
}

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
let podglad = null;
function uruchomPodglad() {
  if (podglad) return;
  podglad = setInterval(async () => {
    if (document.hidden || stan.faza !== 'gotowe' || zapisWToku || stan.konflikt) return;
    const info = await fs.infoPliku(stan.folder, fs.PLIK_DANYCH).catch(() => null);
    if (!info || !stan.znanaWersjaPliku || info.zmieniono === stan.znanaWersjaPliku) return;
    if (stan.zapis === 'niezapisane' || zapiszPozniej.pending()) { stan.konflikt = { kiedy: info.zmieniono }; powiadom(); return; }
    await wczytaj();
    komunikat('Dane zmieniły się na drugim komputerze — wczytano nową wersję.');
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
