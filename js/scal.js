// Dołączanie zmian z innego pliku danych (np. gdy na drugim komputerze powstały osobne dane albo OneDrive zrobił kopię „dane-KOMPUTER.json”).
// Zasady:
//  - plany, których tu nie ma, są dodawane; w planie, który jest w obu plikach, dopisujemy dania tylko w puste posiłki,
//  - przepis z obu plików: wygrywa wersja zmieniona później (zatwierdzenie, kosz, edycja, ulubione — wszystko zapisuje datę zmiany),
//  - nowe przepisy i produkty są dodawane, synonimy produktów się sumują,
//  - cele osób i stałe zakupy uzupełniamy tylko tam, gdzie tu jest pusto.
import { clone, norm, dataPl } from './util.js';

function opisPlanu(p) { return `${dataPl(p.od)}–${dataPl(p.do)}`; }
function tresc(r) {
  const { nazwa, kategorie, porcje, porcjeNaOsobe, kcal, b, t, w, skladniki, kroki, notatka } = r;
  return JSON.stringify({ nazwa, kategorie, porcje, porcjeNaOsobe, kcal, b, t, w, skladniki, kroki, notatka });
}

export function scalDane(nasze, ich) {
  if (!ich || ich.format !== 'koci-grajdolek-dane') throw new Error('To nie jest plik danych programu Koci Grajdołek.');
  const raport = {
    planyNowe: [], planyUzupelnione: [], przepisyNowe: [], zatwierdzone: [], doKosza: [], doPrzejrzenia: [], zmienione: [],
    produktyNowe: [], ustawienia: [],
  };

  // produkty
  for (const [id, p] of Object.entries(ich.produkty || {})) {
    const x = nasze.produkty[id];
    if (!x) { nasze.produkty[id] = clone(p); raport.produktyNowe.push(p.nazwa); continue; }
    const syn = new Set(x.synonimy || []);
    for (const s of [p.nazwa, ...(p.synonimy || [])]) if (s && norm(s) !== norm(x.nazwa)) syn.add(s);
    x.synonimy = [...syn];
  }
  for (const n of ich.noweProdukty || []) {
    if (nasze.produkty[n.id]?.nowy && !nasze.noweProdukty.some((y) => y.id === n.id)) nasze.noweProdukty.push(clone(n));
  }

  // przepisy
  for (const [id, r] of Object.entries(ich.przepisy || {})) {
    const x = nasze.przepisy[id];
    if (!x) { nasze.przepisy[id] = clone(r); raport.przepisyNowe.push(r.nazwa); continue; }
    if ((r.edytowano || '') <= (x.edytowano || '')) continue; // u nas nowsze albo to samo
    if (r.status !== x.status) {
      if (r.status === 'zatwierdzony') raport.zatwierdzone.push(r.nazwa);
      else if (r.status === 'kosz') raport.doKosza.push(r.nazwa);
      else raport.doPrzejrzenia.push(r.nazwa);
    }
    if (tresc(r) === tresc(x)) {
      // ta sama treść — przenosimy tylko status, ulubione i „nie smakowało”
      x.status = r.status; x.edytowano = r.edytowano;
      if (r.ulubiony) x.ulubiony = true; else delete x.ulubiony;
      if (r.ukryty) x.ukryty = true; else delete x.ukryty;
    } else {
      raport.zmienione.push(r.nazwa);
      nasze.przepisy[id] = clone(r);
    }
  }

  // plany
  for (const p of ich.plany || []) {
    const x = nasze.plany.find((q) => q.id === p.id);
    if (!x) { nasze.plany.push(clone(p)); raport.planyNowe.push(opisPlanu(p)); continue; }
    let n = 0;
    for (const [data, sloty] of Object.entries(p.dni || {})) {
      if (data < x.od || data > x.do) continue;
      for (const [s, w] of Object.entries(sloty || {})) {
        if (!w || w.auto) continue;
        x.dni ||= {}; x.dni[data] ||= {};
        if (!x.dni[data][s]) { x.dni[data][s] = clone(w); n++; }
      }
    }
    const l = (x.lista ||= {}); const m = p.lista || {};
    l.skreslone = [...new Set([...(l.skreslone || []), ...(m.skreslone || [])])];
    l.stale = [...new Set([...(l.stale || []), ...(m.stale || [])])];
    l.wlasne ||= []; for (const w of m.wlasne || []) if (!l.wlasne.some((y) => y.id === w.id)) { l.wlasne.push(clone(w)); n++; }
    l.partie = { ...(m.partie || {}), ...(l.partie || {}) };
    l.korekty = { ...(m.korekty || {}), ...(l.korekty || {}) };
    if (n) raport.planyUzupelnione.push(`${opisPlanu(x)} (+${n})`);
  }

  // ustawienia
  const u = nasze.ustawienia; const v = ich.ustawienia || {};
  for (const o of v.osoby || []) {
    const x = u.osoby.find((y) => y.id === o.id); if (!x) continue;
    for (const k of ['celKcal', 'celB', 'celT', 'celW']) if (!x[k] && o[k]) { x[k] = o[k]; raport.ustawienia.push(`${x.imie}: cel ${k === 'celKcal' ? 'kcal' : k.slice(3)}`); }
  }
  for (const s of v.staleZakupy || []) if (!u.staleZakupy.some((y) => y.id === s.id)) { u.staleZakupy.push(clone(s)); raport.ustawienia.push(`stały zakup: ${s.nazwa}`); }
  for (const dz of v.dzialy || []) if (!u.dzialy.some((y) => y.id === dz.id)) u.dzialy.push(clone(dz));
  for (const i of ich.importy || []) if (!nasze.importy.some((y) => y.id === i.id)) nasze.importy.push(clone(i));

  raport.cokolwiek = ['planyNowe', 'planyUzupelnione', 'przepisyNowe', 'zatwierdzone', 'doKosza', 'doPrzejrzenia', 'zmienione', 'produktyNowe', 'ustawienia'].some((k) => raport[k].length);
  return raport;
}

// Pliki w folderze danych, które wyglądają na drugą wersję danych (konflikt OneDrive: „dane-LAPTOP-ANITA.json”, „dane (1).json”)
export function czyInnaWersja(nazwa) {
  return /^dane.*\.json$/i.test(nazwa) && nazwa.toLowerCase() !== 'dane.json';
}
