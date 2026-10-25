// Słownik produktów: edycja, scalanie, nowe produkty, podejrzane duplikaty, raport scaleń
import { html, useState, useMemo, Modal, Potwierdz, Etykieta, useLokalny } from './wspolne.js';
import { stan, zmien, komunikat } from '../store.js';
import * as M from '../model.js';
import { zatwierdzNowy } from '../importer.js';
import { fold, gramy } from '../util.js';

const TRYBY = { g: 'na wagę (gramy)', szt: 'na sztuki', opak: 'na opakowania', brak: 'bez ilości (przyprawy)' };
function opisKupowania(p) {
  if (p.tryb === 'szt') return `sztuki${p.gSzt ? ` (1 szt. ≈ ${gramy(p.gSzt)})` : ''}`;
  if (p.tryb === 'opak') return `opakowania${p.opis ? `: ${p.opis}` : p.gSzt ? ` po ${gramy(p.gSzt)}` : ''}`;
  if (p.tryb === 'brak') return 'bez ilości';
  return 'gramy';
}

export function ProduktyView({ d, otworzPrzepis }) {
  const [zakl, setZakl] = useLokalny('zakladkaProduktow', 'wszystkie');
  const w = stan.wersjaDanych;
  const duplikaty = useMemo(() => M.podejrzaneDuplikaty(d), [w]);
  const uzycia = useMemo(() => M.uzyciaProduktow(d), [w]);
  const [edytuj, setEdytuj] = useState(null);
  return html`<div class="widok-produktow">
    <div class="zakladki">
      <button class=${'zakladka' + (zakl === 'wszystkie' ? ' aktywna' : '')} onClick=${() => setZakl('wszystkie')}>Wszystkie <span class="licznik-zakl">${Object.keys(d.produkty).length}</span></button>
      <button class=${'zakladka' + (zakl === 'nowe' ? ' aktywna' : '')} onClick=${() => setZakl('nowe')}>Nowe produkty <span class=${'licznik-zakl' + (d.noweProdukty.length ? ' alarm' : '')}>${d.noweProdukty.length}</span></button>
      <button class=${'zakladka' + (zakl === 'duplikaty' ? ' aktywna' : '')} onClick=${() => setZakl('duplikaty')}>Podejrzane duplikaty <span class="licznik-zakl">${duplikaty.length}</span></button>
      <button class=${'zakladka' + (zakl === 'raport' ? ' aktywna' : '')} onClick=${() => setZakl('raport')}>Raport scaleń z importu</button>
    </div>
    ${zakl === 'wszystkie' ? html`<${ListaProduktow} d=${d} uzycia=${uzycia} onEdytuj=${setEdytuj} />` : null}
    ${zakl === 'nowe' ? html`<${NoweProdukty} d=${d} uzycia=${uzycia} onEdytuj=${setEdytuj} />` : null}
    ${zakl === 'duplikaty' ? html`<${Duplikaty} d=${d} pary=${duplikaty} uzycia=${uzycia} onEdytuj=${setEdytuj} />` : null}
    ${zakl === 'raport' ? html`<${RaportScalen} d=${d} onEdytuj=${setEdytuj} />` : null}
    ${edytuj && d.produkty[edytuj] ? html`<${EdycjaProduktu} d=${d} id=${edytuj} uzycia=${uzycia[edytuj] || []} onZamknij=${() => setEdytuj(null)} otworzPrzepis=${(rid) => { setEdytuj(null); otworzPrzepis(rid); }} />` : null}
  </div>`;
}

function ListaProduktow({ d, uzycia, onEdytuj }) {
  const [szukaj, setSzukaj] = useState('');
  const [dzial, setDzial] = useState('');
  const [tylkoNieuzywane, setTylkoNieuzywane] = useState(false);
  const [zazn, setZazn] = useState(new Set());
  const [scal, setScal] = useState(false);
  const lista = useMemo(() => {
    const q = fold(szukaj);
    let l = Object.values(d.produkty);
    if (dzial) l = l.filter((p) => p.dzial === dzial);
    if (tylkoNieuzywane) l = l.filter((p) => !(uzycia[p.id] || []).length);
    if (q) l = l.filter((p) => fold(p.nazwa).includes(q) || (p.synonimy || []).some((s) => fold(s).includes(q)));
    return l.sort((a, b) => a.nazwa.localeCompare(b.nazwa, 'pl'));
  }, [szukaj, dzial, tylkoNieuzywane, stan.wersjaDanych]);
  const nazwaDzialu = Object.fromEntries(d.ustawienia.dzialy.map((x) => [x.id, x.nazwa]));
  return html`<div>
    <div class="filtry">
      <input type="search" class="szukaj" placeholder="Szukaj produktu (także po nazwach z przepisów)…" value=${szukaj} onInput=${(ev) => setSzukaj(ev.target.value)} />
      <select value=${dzial} onChange=${(ev) => setDzial(ev.target.value)}><option value="">Wszystkie działy</option>${d.ustawienia.dzialy.map((x) => html`<option value=${x.id}>${x.nazwa}</option>`)}</select>
      <label class="przelacznik"><input type="checkbox" checked=${tylkoNieuzywane} onChange=${(ev) => setTylkoNieuzywane(ev.target.checked)} /> tylko nieużywane</label>
      <span class="odstep"></span>
      <button class="przycisk przycisk-glowny" disabled=${zazn.size < 2} onClick=${() => setScal(true)}>⇄ Scal zaznaczone (${zazn.size})</button>
    </div>
    <table class="tab-produktow">
      <thead><tr><th></th><th>Produkt (nazwa na liście)</th><th>Dział</th><th>Kupowanie</th><th>Nazwy w przepisach</th><th>Przepisy</th></tr></thead>
      <tbody>${lista.map((p) => html`<tr class=${p.nowy ? 'nowy' : ''}>
        <td><input type="checkbox" checked=${zazn.has(p.id)} onChange=${(ev) => { const s = new Set(zazn); if (ev.target.checked) s.add(p.id); else s.delete(p.id); setZazn(s); }} /></td>
        <td><button class="przycisk-link" onClick=${() => onEdytuj(p.id)}>${p.nazwa}</button>${p.nowy ? html` <${Etykieta} klasa="et-pomaranczowa">nowy<//>` : null}${p.naListe === false ? html` <${Etykieta} klasa="et-szara">nie na liście<//>` : null}</td>
        <td>${nazwaDzialu[p.dzial] || p.dzial}</td>
        <td>${opisKupowania(p)}</td>
        <td class="synonimy" title=${(p.synonimy || []).join(', ')}>${(p.synonimy || []).slice(0, 3).join(', ')}${(p.synonimy || []).length > 3 ? ` … (+${p.synonimy.length - 3})` : ''}</td>
        <td class="srodek">${(uzycia[p.id] || []).length}</td>
      </tr>`)}</tbody>
    </table>
    ${scal ? html`<${ScalModal} d=${d} ids=${[...zazn]} uzycia=${uzycia} onZamknij=${() => setScal(false)} onGotowe=${() => { setScal(false); setZazn(new Set()); }} />` : null}
  </div>`;
}

function ScalModal({ d, ids, uzycia, onZamknij, onGotowe }) {
  const posort = ids.slice().sort((a, b) => (uzycia[b] || []).length - (uzycia[a] || []).length);
  const [cel, setCel] = useState(posort[0]);
  const wykonaj = () => {
    const n = d.produkty[cel].nazwa;
    zmien((dd) => M.scalProdukty(dd, ids, cel));
    komunikat(`Scalono ${ids.length} produkty w „${n}”.`);
    onGotowe();
  };
  return html`<${Modal} tytul="Scal produkty" onZamknij=${onZamknij} stopka=${html`<button class="przycisk" onClick=${onZamknij}>Anuluj</button><button class="przycisk przycisk-glowny" onClick=${wykonaj}>Scal</button>`}>
    <p>Wybierz nazwę główną — tak produkt będzie się nazywał na liście zakupów. Pozostałe nazwy staną się synonimami, a przepisy przepną się same.</p>
    <ul class="lista-wyboru">${posort.map((id) => html`<li><label class="przelacznik"><input type="radio" name="cel" checked=${cel === id} onChange=${() => setCel(id)} />
      <strong>${d.produkty[id].nazwa}</strong> <span class="szary">(${(uzycia[id] || []).length} przepisów, ${opisKupowania(d.produkty[id])})</span></label></li>`)}</ul>
  <//>`;
}

function NoweProdukty({ d, uzycia, onEdytuj }) {
  if (!d.noweProdukty.length) return html`<p class="pusto">Brak nowych produktów do sprawdzenia. Pojawią się tu nazwy z nowych paczek przepisów, których słownik jeszcze nie zna.</p>`;
  return html`<div>
    <p class="info-pasek">Te produkty przyszły z importu i słownik ich nie znał. Sprawdź, czy to nie jest coś, co już masz pod inną nazwą — wtedy wybierz „To to samo co…”.</p>
    <button class="przycisk" onClick=${() => { zmien((dd) => { for (const x of [...dd.noweProdukty]) zatwierdzNowy(dd, x.id); }); komunikat('Zatwierdzono wszystkie jako nowe produkty.'); }}>✔ Wszystkie to nowe produkty</button>
    <ul class="lista-nowych">${d.noweProdukty.map((x) => {
      const p = d.produkty[x.id];
      if (!p) return null;
      return html`<li>
        <div><strong>${p.nazwa}</strong> <span class="szary">— z: ${x.zrodlo}, w ${(uzycia[p.id] || []).length} przepisach</span> <button class="przycisk-link" onClick=${() => onEdytuj(p.id)}>szczegóły</button></div>
        <div class="przyciski-wiersz">
          ${x.podobne.filter((pid) => d.produkty[pid] && pid !== p.id).map((pid) => html`<button class="przycisk" onClick=${() => { zmien((dd) => { M.scalProdukty(dd, [p.id], pid); dd.noweProdukty = dd.noweProdukty.filter((y) => y.id !== p.id); }); komunikat(`„${p.nazwa}” dopisano do „${d.produkty[pid].nazwa}”.`); }}>To to samo co: ${d.produkty[pid].nazwa}</button>`)}
          <button class="przycisk przycisk-glowny" onClick=${() => zmien((dd) => zatwierdzNowy(dd, p.id))}>✔ Nowy produkt</button>
        </div>
      </li>`;
    })}</ul>
  </div>`;
}

function Duplikaty({ d, pary, uzycia, onEdytuj }) {
  if (!pary.length) return html`<p class="pusto">Nie widzę podejrzanych duplikatów.</p>`;
  const scal = (z, cel) => { const n = d.produkty[cel].nazwa; zmien((dd) => M.scalProdukty(dd, [z], cel)); komunikat(`Scalono w „${n}”.`); };
  return html`<div>
    <p class="info-pasek">Program znalazł produkty o podobnych nazwach. Jeśli to ten sam produkt na półce — scal. Jeśli nie (np. „jogurt naturalny” i „jogurt naturalny bez laktozy”) — kliknij „To różne produkty”, a para zniknie z tej listy.</p>
    <table class="tab-produktow"><tbody>${pary.slice(0, 200).map((x) => {
      const a = d.produkty[x.a], b = d.produkty[x.b];
      if (!a || !b) return null;
      return html`<tr>
        <td><button class="przycisk-link" onClick=${() => onEdytuj(a.id)}>${a.nazwa}</button> <span class="szary">(${(uzycia[a.id] || []).length})</span></td>
        <td><button class="przycisk-link" onClick=${() => onEdytuj(b.id)}>${b.nazwa}</button> <span class="szary">(${(uzycia[b.id] || []).length})</span></td>
        <td class="przyciski-wiersz">
          <button class="przycisk przycisk-maly" onClick=${() => scal(b.id, a.id)}>Scal w „${a.nazwa}”</button>
          <button class="przycisk przycisk-maly" onClick=${() => scal(a.id, b.id)}>Scal w „${b.nazwa}”</button>
          <button class="przycisk przycisk-maly" onClick=${() => zmien((dd) => { dd.ustawienia.nieDuplikaty = [...(dd.ustawienia.nieDuplikaty || []), x.klucz]; })}>To różne produkty</button>
        </td></tr>`;
    })}</tbody></table>
  </div>`;
}

function RaportScalen({ d, onEdytuj }) {
  const importy = d.importy.filter((i) => i.raportScalen?.length).slice().reverse();
  const [wybrany, setWybrany] = useState(importy[0]?.id || '');
  const imp = importy.find((i) => i.id === wybrany);
  const grupy = useMemo(() => {
    const m = new Map();
    for (const x of imp?.raportScalen || []) { const k = x.produkt; if (!m.has(k)) m.set(k, []); m.get(k).push(x.z); }
    return [...m.entries()].sort((a, b) => (d.produkty[a[0]]?.nazwa || '').localeCompare(d.produkty[b[0]]?.nazwa || '', 'pl'));
  }, [wybrany, stan.wersjaDanych]);
  if (!importy.length) return html`<p class="pusto">Raport pojawi się po wczytaniu paczki przepisów.</p>`;
  return html`<div>
    <p class="info-pasek">Tak nazwy z przepisów zostały przypisane do produktów na liście zakupów. Jeśli coś jest źle (dwa różne produkty pod jedną nazwą), otwórz przepis i w „Popraw” wybierz właściwy produkt dla tego składnika.</p>
    <label class="pole">Import: <select value=${wybrany} onChange=${(ev) => setWybrany(ev.target.value)}>${importy.map((i) => html`<option value=${i.id}>${i.zrodlo} — ${new Date(i.data).toLocaleString('pl-PL')}</option>`)}</select></label>
    <table class="tab-produktow"><thead><tr><th>Na liście zakupów</th><th>Nazwy w przepisach</th></tr></thead><tbody>
      ${grupy.map(([pid, nazwy]) => html`<tr><td>${d.produkty[pid] ? html`<button class="przycisk-link" onClick=${() => onEdytuj(pid)}>${d.produkty[pid].nazwa}</button>` : html`<span class="szary">(produkt scalony/usunięty)</span>`}</td><td>${[...new Set(nazwy)].join(' · ')}</td></tr>`)}
    </tbody></table>
  </div>`;
}

function EdycjaProduktu({ d, id, uzycia, onZamknij, otworzPrzepis }) {
  const p = d.produkty[id];
  const [f, setF] = useState(() => ({ nazwa: p.nazwa, dzial: p.dzial, tryb: p.tryb || 'g', gSzt: p.gSzt ?? '', opis: p.opis || '', naListe: p.naListe !== false, synonimy: [...(p.synonimy || [])], nowySyn: '' }));
  const [usun, setUsun] = useState(false);
  const ust = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const zapisz = () => {
    if (!f.nazwa.trim()) return;
    zmien((dd) => {
      const x = dd.produkty[id];
      x.nazwa = f.nazwa.trim(); x.dzial = f.dzial; x.tryb = f.tryb; x.naListe = f.naListe;
      const g = Number(String(f.gSzt).replace(',', '.'));
      if (g > 0) x.gSzt = g; else delete x.gSzt;
      if (f.opis.trim()) x.opis = f.opis.trim(); else delete x.opis;
      x.synonimy = f.synonimy.filter(Boolean);
      delete x.nowy; x.zweryfikowany = true;
      dd.noweProdukty = dd.noweProdukty.filter((y) => y.id !== id);
    });
    komunikat('Zapisano produkt.');
    onZamknij();
  };
  return html`<${Modal} tytul="Produkt" onZamknij=${onZamknij} szeroki stopka=${html`
    ${!uzycia.length ? html`<button class="przycisk przycisk-czerwony" onClick=${() => setUsun(true)}>Usuń produkt</button>` : null}
    <span class="odstep"></span><button class="przycisk" onClick=${onZamknij}>Anuluj</button><button class="przycisk przycisk-glowny" onClick=${zapisz}>Zapisz</button>`}>
    <div class="wiersz-pol">
      <label class="pole">Nazwa na liście zakupów<input value=${f.nazwa} onInput=${(ev) => ust('nazwa', ev.target.value)} /></label>
      <label class="pole">Dział sklepu<select value=${f.dzial} onChange=${(ev) => ust('dzial', ev.target.value)}>${d.ustawienia.dzialy.map((x) => html`<option value=${x.id}>${x.nazwa}</option>`)}</select></label>
    </div>
    <div class="wiersz-pol">
      <label class="pole">Jak kupujecie<select value=${f.tryb} onChange=${(ev) => ust('tryb', ev.target.value)}>${Object.entries(TRYBY).map(([k, v]) => html`<option value=${k}>${v}</option>`)}</select></label>
      ${f.tryb === 'szt' || f.tryb === 'opak' || f.tryb === 'g' ? html`<label class="pole">${f.tryb === 'opak' ? 'Waga opakowania (g)' : 'Waga 1 sztuki (g)'}${f.tryb === 'g' ? ' — opcjonalnie' : ''}<input type="text" inputmode="decimal" value=${f.gSzt} onInput=${(ev) => ust('gSzt', ev.target.value)} /></label>` : null}
      ${f.tryb === 'opak' || f.tryb === 'szt' ? html`<label class="pole">Opis (np. „kubek 150 g”, „pęczek”)<input value=${f.opis} onInput=${(ev) => ust('opis', ev.target.value)} /></label>` : null}
    </div>
    <label class="przelacznik"><input type="checkbox" checked=${f.naListe} onChange=${(ev) => ust('naListe', ev.target.checked)} /> pokazuj na liście zakupów (odznacz np. dla wody z kranu)</label>
    <h3>Nazwy w przepisach (synonimy)</h3>
    <p class="podpowiedz">Każda z tych nazw w przepisie trafi na listę zakupów jako „${f.nazwa}”.</p>
    <div class="chipy">${f.synonimy.map((s) => html`<span class="chip">${s}<button onClick=${() => ust('synonimy', f.synonimy.filter((x) => x !== s))}>✕</button></span>`)}</div>
    <div class="wiersz-pol"><input placeholder="dodaj nazwę…" value=${f.nowySyn} onInput=${(ev) => ust('nowySyn', ev.target.value)} onKeyDown=${(ev) => { if (ev.key === 'Enter' && f.nowySyn.trim()) { ust('synonimy', [...f.synonimy, f.nowySyn.trim()]); ust('nowySyn', ''); } }} />
      <button class="przycisk" onClick=${() => { if (f.nowySyn.trim()) { ust('synonimy', [...f.synonimy, f.nowySyn.trim()]); ust('nowySyn', ''); } }}>Dodaj</button></div>
    <h3>Używany w przepisach (${uzycia.length})</h3>
    <ul class="lista-uzyc">${uzycia.slice(0, 60).map((rid) => html`<li><button class="przycisk-link" onClick=${() => otworzPrzepis(rid)}>${d.przepisy[rid]?.nazwa}</button></li>`)}</ul>
    ${usun ? html`<${Potwierdz} tytul="Usunąć produkt?" tekst=${`„${p.nazwa}” nie jest używany w żadnym przepisie.`} tak="Usuń" niebezpieczne onNie=${() => setUsun(false)}
      onTak=${() => { zmien((dd) => { delete dd.produkty[id]; dd.noweProdukty = dd.noweProdukty.filter((y) => y.id !== id); }); onZamknij(); }} />` : null}
  <//>`;
}
