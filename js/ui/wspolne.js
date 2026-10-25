// Wspólne elementy interfejsu
import { html, useState, useEffect, useRef, useMemo } from '../../vendor/preact-htm.mjs';
import { stan, subskrybuj } from '../store.js';
import { norm, fold } from '../util.js';
import { podobneProdukty, znajdzProdukt } from '../model.js';

export { html, useState, useEffect, useRef, useMemo };

export function useStan() {
  const [, setWersja] = useState(0);
  useEffect(() => subskrybuj(() => setWersja((x) => x + 1)), []);
  return stan;
}

export function useLokalny(klucz, domyslna) {
  const [v, setV] = useState(() => {
    try { const x = localStorage.getItem('kg:' + klucz); return x === null ? domyslna : JSON.parse(x); } catch { return domyslna; }
  });
  const ustaw = (nv) => {
    setV((stara) => {
      const w = typeof nv === 'function' ? nv(stara) : nv;
      try { localStorage.setItem('kg:' + klucz, JSON.stringify(w)); } catch { /* brak pamięci przeglądarki */ }
      return w;
    });
  };
  return [v, ustaw];
}

export function Modal({ tytul, onZamknij, children, szeroki, stopka }) {
  useEffect(() => {
    const h = (ev) => { if (ev.key === 'Escape') onZamknij?.(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onZamknij]);
  return html`<div class="modal-tlo" onMouseDown=${(ev) => { if (ev.target === ev.currentTarget) onZamknij?.(); }}>
    <div class=${'modal' + (szeroki ? ' modal-szeroki' : '')} role="dialog" aria-modal="true">
      <header class="modal-naglowek"><h2>${tytul}</h2><button class="przycisk-ikona" title="Zamknij (Esc)" onClick=${onZamknij}>✕</button></header>
      <div class="modal-tresc">${children}</div>
      ${stopka ? html`<footer class="modal-stopka">${stopka}</footer>` : null}
    </div>
  </div>`;
}

export function Potwierdz({ tytul, tekst, tak = 'Tak', nie = 'Anuluj', onTak, onNie, niebezpieczne }) {
  return html`<${Modal} tytul=${tytul} onZamknij=${onNie} stopka=${html`<button class="przycisk" onClick=${onNie}>${nie}</button><button class=${'przycisk ' + (niebezpieczne ? 'przycisk-czerwony' : 'przycisk-glowny')} onClick=${onTak}>${tak}</button>`}>
    <p>${tekst}</p>
  <//>`;
}

// Pole z podpowiedziami produktów (nazwa główna + synonimy)
export function PoleProduktu({ dane, wartosc, onWybierz, onNowy, placeholder = 'Zacznij pisać nazwę produktu…', autoFocus }) {
  const [tekst, setTekst] = useState(wartosc ? (dane.produkty[wartosc]?.nazwa || '') : '');
  const [otwarte, setOtwarte] = useState(false);
  const [akt, setAkt] = useState(0);
  const tekstRef = useRef(tekst); tekstRef.current = tekst;
  const wybranoRef = useRef(0);
  const nazwaWartosci = () => (wartosc ? (dane.produkty[wartosc]?.nazwa || '') : '');
  useEffect(() => { setTekst(nazwaWartosci()); }, [wartosc]);
  // po wyjściu z pola: dokładna nazwa (lub nazwa z przepisów) = wybór produktu; inny tekst = powrót do wybranego produktu
  const poWyjsciu = () => {
    setOtwarte(false);
    if (Date.now() - wybranoRef.current < 400) return;
    const t = tekstRef.current.trim();
    const pid = t ? znajdzProdukt(dane, t, stan.wersjaDanych) : null;
    if (pid && pid !== wartosc) { wybranoRef.current = Date.now(); setTekst(wartosc == null ? '' : dane.produkty[pid].nazwa); onWybierz(pid); return; }
    setTekst(pid ? dane.produkty[pid].nazwa : nazwaWartosci());
  };
  const podpowiedzi = useMemo(() => {
    const q = fold(tekst);
    if (!q) return [];
    const wyn = [];
    for (const p of Object.values(dane.produkty)) {
      const n = fold(p.nazwa);
      let s = n.startsWith(q) ? 3 : n.includes(q) ? 2 : 0;
      let przez = '';
      if (!s) for (const syn of p.synonimy || []) { const f = fold(syn); if (f.includes(q)) { s = 1; przez = syn; break; } }
      if (s) wyn.push({ p, s, przez });
    }
    return wyn.sort((a, b) => b.s - a.s || a.p.nazwa.localeCompare(b.p.nazwa, 'pl')).slice(0, 8);
  }, [tekst, stan.wersjaDanych]);
  const dokladny = podpowiedzi.find((x) => norm(x.p.nazwa) === norm(tekst) || (x.przez && norm(x.przez) === norm(tekst)));
  // pole bez wybranego produktu (filtr „ze składnikiem”) czyścimy po wyborze; w składniku przepisu nazwę ustawi useEffect
  const wybierz = (p) => { wybranoRef.current = Date.now(); setTekst(wartosc == null ? '' : p.nazwa); setOtwarte(false); onWybierz(p.id); };
  return html`<div class="pole-produktu">
    <input type="text" value=${tekst} placeholder=${placeholder} autoFocus=${autoFocus}
      onInput=${(ev) => { setTekst(ev.target.value); setOtwarte(true); setAkt(0); }}
      onFocus=${(ev) => { setOtwarte(true); ev.target.select(); }} onBlur=${() => setTimeout(poWyjsciu, 150)}
      onKeyDown=${(ev) => {
        if (ev.key === 'ArrowDown') { ev.preventDefault(); setAkt((a) => Math.min(a + 1, podpowiedzi.length - 1)); }
        else if (ev.key === 'ArrowUp') { ev.preventDefault(); setAkt((a) => Math.max(a - 1, 0)); }
        else if (ev.key === 'Enter' && otwarte && podpowiedzi[akt]) { ev.preventDefault(); wybierz(podpowiedzi[akt].p); }
      }} />
    ${otwarte && tekst.trim() ? html`<ul class="podpowiedzi">
      ${podpowiedzi.map((x, i) => html`<li class=${i === akt ? 'aktywna' : ''} onMouseDown=${(ev) => { ev.preventDefault(); wybierz(x.p); }}>
        <strong>${x.p.nazwa}</strong>${x.przez ? html` <small>(w przepisach: „${x.przez}”)</small>` : null}</li>`)}
      ${onNowy && !dokladny ? html`<li class="nowy" onMouseDown=${(ev) => { ev.preventDefault(); setOtwarte(false); onNowy(tekst.trim()); }}>➕ Dodaj nowy produkt „${tekst.trim()}”</li>` : null}
    </ul>` : null}
  </div>`;
}

// Okno dodawania nowego produktu z ostrzeżeniem o podobnych
export function NowyProduktModal({ dane, nazwa, onAnuluj, onUzyjIstniejacego, onUtworz }) {
  const [n, setN] = useState(nazwa);
  const [dzial, setDzial] = useState('inn');
  const podobne = useMemo(() => podobneProdukty(dane, n, 5, 0.45), [n]);
  return html`<${Modal} tytul="Nowy produkt" onZamknij=${onAnuluj} stopka=${html`<button class="przycisk" onClick=${onAnuluj}>Anuluj</button><button class="przycisk przycisk-glowny" disabled=${!n.trim()} onClick=${() => onUtworz(n.trim(), dzial)}>Dodaj jako nowy produkt</button>`}>
    ${podobne.length ? html`<div class="ostrzezenie"><strong>Podobne istniejące produkty — czy to któryś z nich?</strong>
      <ul class="lista-wyboru">${podobne.map((x) => html`<li><button class="przycisk" onClick=${() => onUzyjIstniejacego(x.id)}>Tak, to: ${dane.produkty[x.id].nazwa}</button></li>`)}</ul></div>` : null}
    <label class="pole">Nazwa produktu (tak, jak ma być na liście zakupów)<input value=${n} onInput=${(ev) => setN(ev.target.value)} /></label>
    <label class="pole">Dział sklepu<select value=${dzial} onChange=${(ev) => setDzial(ev.target.value)}>${dane.ustawienia.dzialy.map((dz) => html`<option value=${dz.id}>${dz.nazwa}</option>`)}</select></label>
  <//>`;
}

export function Etykieta({ children, klasa = '' }) { return html`<span class=${'etykieta ' + klasa}>${children}</span>`; }
