// Strona listy zakupów na telefon. Lista jest zapisana w części adresu po „#”, więc nie trafia na żaden serwer.
import { rozpakuj } from './util.js';

const el = (id) => document.getElementById(id);
const kod = location.hash.slice(1);
const KLUCZ = 'kg-lista:' + kod.slice(0, 40);
let ukryjKupione = false;

function wczytajStan() { try { return JSON.parse(localStorage.getItem(KLUCZ) || '{}'); } catch { return {}; } }
function zapiszStan(s) { try { localStorage.setItem(KLUCZ, JSON.stringify(s)); } catch { /* tryb prywatny */ } }

async function start() {
  if (!kod) { el('lista').innerHTML = '<p class="info">Ta strona pokazuje listę zakupów z programu Koci Grajdołek. Zeskanuj kod QR z programu.</p>'; return; }
  let dane;
  try { dane = await rozpakuj(kod); } catch { el('lista').innerHTML = '<p class="info">Nie udało się odczytać listy z kodu. Zeskanuj kod jeszcze raz.</p>'; return; }
  document.title = dane.t || 'Lista zakupów';
  el('tytul').textContent = dane.t || 'Lista zakupów';
  const stan = wczytajStan();
  const main = el('lista');
  main.innerHTML = '';
  let nr = 0;
  for (const [dzial, pozycje] of dane.g) {
    const sek = document.createElement('section');
    const h = document.createElement('h2'); h.textContent = dzial; sek.appendChild(h);
    const ul = document.createElement('ul');
    for (const [nazwa, ilosc] of pozycje) {
      const id = 'p' + (nr++);
      const li = document.createElement('li');
      const label = document.createElement('label');
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!stan[id];
      const n = document.createElement('span'); n.className = 'nazwa'; n.textContent = nazwa;
      label.append(cb, n);
      // ilość: dotknij, żeby poprawić (np. część jest w domu) — poprawka zostaje tylko na tym telefonie
      const q = document.createElement('button'); q.type = 'button'; q.className = 'ilosc';
      const pokazIlosc = () => {
        const wl = wczytajStan()['q' + id];
        q.textContent = (wl ?? ilosc) || '✎';
        q.classList.toggle('zmieniona', wl != null);
      };
      q.addEventListener('click', () => {
        const s = wczytajStan();
        const teraz = s['q' + id] ?? ilosc ?? '';
        const nowa = prompt(`${nazwa}\nIle kupić? (z listy: ${ilosc || '—'})\nZostaw puste, żeby wrócić do ilości z listy.`, teraz);
        if (nowa === null) return;
        const t = nowa.trim();
        if (!t || t === (ilosc || '')) delete s['q' + id]; else s['q' + id] = t;
        zapiszStan(s); pokazIlosc();
      });
      pokazIlosc();
      li.append(label, q);
      if (cb.checked) li.classList.add('kupione');
      cb.addEventListener('change', () => {
        const s = wczytajStan(); if (cb.checked) s[id] = 1; else delete s[id]; zapiszStan(s);
        li.classList.toggle('kupione', cb.checked); odswiez();
      });
      ul.appendChild(li);
    }
    sek.appendChild(ul); main.appendChild(sek);
  }
  odswiez();
}

function odswiez() {
  const wszystkie = document.querySelectorAll('#lista li');
  const kupione = document.querySelectorAll('#lista li.kupione');
  el('licznik').textContent = `${kupione.length} / ${wszystkie.length}`;
  document.body.classList.toggle('ukryj-kupione', ukryjKupione);
  el('ukryj').textContent = ukryjKupione ? 'Pokaż kupione' : 'Ukryj kupione';
  document.querySelectorAll('#lista section').forEach((s) => {
    const zostalo = s.querySelectorAll('li:not(.kupione)').length;
    s.classList.toggle('pusta', zostalo === 0);
  });
}

el('ukryj').addEventListener('click', () => { ukryjKupione = !ukryjKupione; odswiez(); });
el('wyczysc').addEventListener('click', () => {
  if (!confirm('Odznaczyć wszystkie pozycje?')) return;
  // odznaczamy pozycje, ale zostawiamy poprawione ilości
  const s = wczytajStan(); for (const k of Object.keys(s)) if (!k.startsWith('q')) delete s[k]; zapiszStan(s);
  document.querySelectorAll('#lista input').forEach((c) => { c.checked = false; }); document.querySelectorAll('#lista li').forEach((l) => l.classList.remove('kupione')); odswiez();
});
start();
