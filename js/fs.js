// Dostęp do folderu z danymi (File System Access API).
// Tryb testowy (?test w adresie) używa prywatnego folderu przeglądarki (OPFS) zamiast folderu na dysku.

const DB_NAME = 'koci-grajdolek';
const STORE = 'uchwyty';
const KLUCZ = 'folderDanych';
export const PLIK_DANYCH = 'dane.json';
export const FOLDER_KOPII = 'kopie';
export const FOLDER_IMPORTU = 'import';

export const trybTestowy = new URLSearchParams(location.search).has('test');

export function obslugiwane() {
  return trybTestowy ? !!navigator.storage?.getDirectory : typeof window.showDirectoryPicker === 'function';
}

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbGet(k) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
    t.onsuccess = () => res(t.result); t.onerror = () => rej(t.error);
  });
}
async function idbSet(k, v) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, 'readwrite').objectStore(STORE).put(v, k);
    t.onsuccess = () => res(); t.onerror = () => rej(t.error);
  });
}

// Zwraca zapamiętany folder (lub null). Nie pyta użytkownika o nic.
export async function zapamietanyFolder() {
  if (trybTestowy) {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle('Koci Grajdołek (test)', { create: true });
  }
  try { return (await idbGet(KLUCZ)) || null; } catch { return null; }
}

export async function stanUprawnien(h) {
  if (trybTestowy) return 'granted';
  try { return await h.queryPermission({ mode: 'readwrite' }); } catch { return 'prompt'; }
}

// Wymaga kliknięcia użytkownika (gest)
export async function poprosOUprawnienia(h) {
  if (trybTestowy) return true;
  try { return (await h.requestPermission({ mode: 'readwrite' })) === 'granted'; } catch { return false; }
}

// Okno wyboru folderu (wymaga kliknięcia)
export async function wybierzFolder() {
  if (trybTestowy) return zapamietanyFolder();
  const h = await window.showDirectoryPicker({ id: 'koci-grajdolek', mode: 'readwrite', startIn: 'documents' });
  await idbSet(KLUCZ, h);
  return h;
}

export async function istnieje(dir, nazwa) {
  try { await dir.getFileHandle(nazwa); return true; } catch { return false; }
}

export async function czytajPlik(dir, nazwa) {
  const fh = await dir.getFileHandle(nazwa);
  const f = await fh.getFile();
  return { tekst: await f.text(), zmieniono: f.lastModified, rozmiar: f.size };
}

export async function infoPliku(dir, nazwa) {
  try {
    const fh = await dir.getFileHandle(nazwa);
    const f = await fh.getFile();
    return { zmieniono: f.lastModified, rozmiar: f.size };
  } catch { return null; }
}

// Zapis jest atomowy: Chrome pisze do pliku tymczasowego i podmienia go dopiero przy close()
export async function zapiszPlik(dir, nazwa, tekst) {
  const fh = await dir.getFileHandle(nazwa, { create: true });
  const w = await fh.createWritable();
  await w.write(tekst);
  await w.close();
  const f = await fh.getFile();
  return f.lastModified;
}

export async function podfolder(dir, nazwa, create = true) {
  return dir.getDirectoryHandle(nazwa, { create });
}

export async function listaPlikow(dir) {
  const out = [];
  for await (const [nazwa, h] of dir.entries()) {
    if (h.kind === 'file') {
      const f = await h.getFile();
      out.push({ nazwa, zmieniono: f.lastModified, rozmiar: f.size });
    }
  }
  return out.sort((a, b) => b.zmieniono - a.zmieniono);
}

export async function usunPlik(dir, nazwa) {
  try { await dir.removeEntry(nazwa); } catch { /* plik już nie istnieje */ }
}

// ---------- kopie zapasowe ----------
// Zostawiamy 30 najnowszych kopii oraz po jednej kopii dziennie z ostatnich 60 dni.
export async function zrobKopie(dir, tekst) {
  const kopie = await podfolder(dir, FOLDER_KOPII);
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  const nazwa = `dane-${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}-${z(d.getMinutes())}-${z(d.getSeconds())}.json`;
  await zapiszPlik(kopie, nazwa, tekst);
  await przytnijKopie(kopie);
  return nazwa;
}

async function przytnijKopie(kopie) {
  const pliki = (await listaPlikow(kopie)).filter((p) => /^dane-\d{4}-\d{2}-\d{2}_/.test(p.nazwa));
  pliki.sort((a, b) => (a.nazwa < b.nazwa ? 1 : -1)); // najnowsze najpierw (nazwa zawiera datę)
  const zostaw = new Set(pliki.slice(0, 30).map((p) => p.nazwa));
  const dni = new Set();
  const granica = Date.now() - 60 * 86400000;
  for (const p of pliki) {
    const dzien = p.nazwa.slice(5, 15);
    if (!dni.has(dzien) && p.zmieniono > granica) { dni.add(dzien); zostaw.add(p.nazwa); }
  }
  for (const p of pliki) if (!zostaw.has(p.nazwa)) await usunPlik(kopie, p.nazwa);
}

export async function listaKopii(dir) {
  try {
    const kopie = await podfolder(dir, FOLDER_KOPII, false);
    return (await listaPlikow(kopie)).filter((p) => p.nazwa.endsWith('.json')).sort((a, b) => (a.nazwa < b.nazwa ? 1 : -1));
  } catch { return []; }
}

export async function czytajKopie(dir, nazwa) {
  const kopie = await podfolder(dir, FOLDER_KOPII, false);
  return (await czytajPlik(kopie, nazwa)).tekst;
}

export async function plikiImportu(dir) {
  try {
    const imp = await podfolder(dir, FOLDER_IMPORTU, false);
    const pliki = (await listaPlikow(imp)).filter((p) => p.nazwa.toLowerCase().endsWith('.json'));
    return { folder: imp, pliki };
  } catch { return { folder: null, pliki: [] }; }
}
