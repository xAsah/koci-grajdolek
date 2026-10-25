// Widok planu posiłków
import { html, useState, useMemo, useRef, Modal, Potwierdz, PoleProduktu, useLokalny, Etykieta } from './wspolne.js';
import { stan, zmien, komunikat } from '../store.js';
import * as M from '../model.js';
import { dataPelna, dataPl, dzienKrotko, dodajDni, dzisiaj, roznicaDni, fold, clone } from '../util.js';
import { drukujWszystko, drukujListe, drukujDni, drukujPlan } from '../druk.js';

export function opisPlanu(p) { return `${dataPl(p.od)} – ${dataPl(p.do)} (${roznicaDni(p.od, p.do) + 1} dni)`; }

export function PlanView({ d, wybranyPlan, ustawPlan, otworzPrzepis, idzDoListy }) {
  const plan = d.plany.find((p) => p.id === wybranyPlan) || d.plany[0] || null;
  const [picker, setPicker] = useState(null);
  const [menu, setMenu] = useState(null);
  const [nowyPlan, setNowyPlan] = useState(false);
  const [edycjaDat, setEdycjaDat] = useState(false);
  const [usun, setUsun] = useState(false);
  const [cofnij, setCofnij] = useState(null);
  const [drukMenu, setDrukMenu] = useState(false);
  const drukRef = useRef(null);
  const drukPoPrawej = () => { const r = drukRef.current?.getBoundingClientRect(); return r ? r.left + 360 > window.innerWidth : false; };

  if (!plan) {
    return html`<div class="pusty-stan"><h2>Nie ma jeszcze żadnego planu</h2>
      <p>Plan to okres „od zakupów do zakupów”. Wybierz daty, potem dodawaj dania do posiłków.</p>
      ${M.przepisy(d, 'zatwierdzony').length === 0 ? html`<p class="ostrzezenie">Nie masz jeszcze zatwierdzonych przepisów. Do planu trafiają tylko zatwierdzone — przejrzyj je w zakładce <strong>Przepisy → Do przejrzenia</strong>.</p>` : null}
      <button class="przycisk przycisk-glowny przycisk-duzy" onClick=${() => setNowyPlan(true)}>➕ Utwórz plan</button>
      ${nowyPlan ? html`<${PlanDatyModal} tytul="Nowy plan" onZamknij=${() => setNowyPlan(false)} onZapisz=${(od, do_) => { let id; zmien((dd) => { id = M.nowyPlan(dd, od, do_).id; }); ustawPlan(id); setNowyPlan(false); }} />` : null}
    </div>`;
  }

  const dni = M.dniPlanu(plan);
  const posilki = d.ustawienia.posilki;
  const pusteSloty = dni.reduce((s, data) => s + posilki.filter((pos) => !M.wpis(plan, data, pos.id)).length, 0);

  const zaproponujPuste = () => {
    const kopia = clone(plan.dni || {});
    let n = 0;
    zmien((dd) => {
      const p = dd.plany.find((x) => x.id === plan.id);
      const uzyte = new Set();
      for (const data of dni) for (const pos of posilki) {
        if (M.wpis(p, data, pos.id)) continue;
        const r = M.zaproponuj(dd, p, pos.id, uzyte);
        if (r) { M.ustawPrzepis(dd, p, data, pos.id, r.id); uzyte.add(r.id); n++; }
      }
    });
    setCofnij({ dni: kopia, opis: `Wstawiono ${n} propozycji` });
    komunikat(n ? `Wstawiono ${n} propozycji — podmień te, które nie pasują.` : 'Brak zatwierdzonych przepisów do zaproponowania.');
  };

  return html`<div class="widok-planu">
    <div class="pasek-narzedzi">
      <label class="wybor-planu">Plan:
        <select value=${plan.id} onChange=${(ev) => ustawPlan(ev.target.value)}>
          ${d.plany.slice().sort((a, b) => (a.od < b.od ? 1 : -1)).map((p) => html`<option value=${p.id}>${opisPlanu(p)}</option>`)}
        </select>
      </label>
      <button class="przycisk" onClick=${() => setNowyPlan(true)}>➕ Nowy plan</button>
      <button class="przycisk" onClick=${() => setEdycjaDat(true)}>📅 Zmień daty</button>
      <button class="przycisk" onClick=${() => setUsun(true)}>🗑 Usuń plan</button>
      <span class="odstep"></span>
      <button class="przycisk" disabled=${!pusteSloty} onClick=${zaproponujPuste} title="Wypełnia puste posiłki propozycjami z zatwierdzonych przepisów">🎲 Zaproponuj dla pustych (${pusteSloty})</button>
      ${cofnij ? html`<button class="przycisk" onClick=${() => { zmien((dd) => { dd.plany.find((x) => x.id === plan.id).dni = cofnij.dni; }); setCofnij(null); komunikat('Cofnięto propozycje.'); }}>↶ Cofnij propozycje</button>` : null}
      <button class="przycisk przycisk-glowny" onClick=${idzDoListy}>🛒 Lista zakupów</button>
      <div class="rozwijane">
        <button class="przycisk" ref=${drukRef} onClick=${() => setDrukMenu(!drukMenu)}>🖨 Drukuj ▾</button>
        ${drukMenu ? html`<div class=${'menu-rozwijane' + (drukPoPrawej() ? ' do-prawej' : '')} onMouseLeave=${() => setDrukMenu(false)}>
          <button onClick=${() => { setDrukMenu(false); drukujWszystko(d, plan); }}><strong>Wszystko</strong> — lista zakupów + dni z przepisami</button>
          <button onClick=${() => { setDrukMenu(false); drukujListe(d, plan); }}>Tylko lista zakupów</button>
          <button onClick=${() => { setDrukMenu(false); drukujDni(d, plan); }}>Tylko dni z przepisami</button>
          <button onClick=${() => { setDrukMenu(false); drukujPlan(d, plan); }}>Plan na jednej kartce (np. na lodówkę)</button>
        </div>` : null}
      </div>
    </div>

    <table class="siatka-planu">
      <thead><tr><th class="kol-dzien">Dzień</th>${posilki.map((p) => html`<th>${p.nazwa}</th>`)}<th class="kol-kcal">Kalorie na osobę</th></tr></thead>
      <tbody>${dni.map((data) => html`<tr class=${data === dzisiaj() ? 'dzis' : ''}>
        <th class="kol-dzien"><div class="dzien-nazwa">${dzienKrotko(data)}</div><div class="dzien-data">${dataPl(data)}</div></th>
        ${posilki.map((pos) => html`<td class="komorka"><${Komorka} d=${d} plan=${plan} data=${data} slot=${pos.id}
          onDodaj=${() => setPicker({ data, slot: pos.id })} onMenu=${() => setMenu({ data, slot: pos.id })} /></td>`)}
        <td class="kol-kcal"><${KcalDnia} d=${d} plan=${plan} data=${data} /></td>
      </tr>`)}</tbody>
    </table>
    <p class="podpowiedz">Kliknij pusty posiłek, żeby dodać danie. Kliknij danie, żeby zmienić osoby, ustawić „gotuję na kilka dni” albo je usunąć. Inicjały pokazują, kto je dany posiłek.</p>

    ${picker ? html`<${WyborPrzepisu} d=${d} plan=${plan} data=${picker.data} slot=${picker.slot} onZamknij=${() => setPicker(null)}
      onWybierz=${(rid) => { zmien((dd) => M.ustawPrzepis(dd, dd.plany.find((x) => x.id === plan.id), picker.data, picker.slot, rid)); setPicker(null); }} />` : null}
    ${menu ? html`<${MenuWpisu} d=${d} plan=${plan} data=${menu.data} slot=${menu.slot} onZamknij=${() => setMenu(null)}
      onZmien=${() => { setPicker(menu); setMenu(null); }} otworzPrzepis=${otworzPrzepis} />` : null}
    ${nowyPlan ? html`<${PlanDatyModal} tytul="Nowy plan" od=${dodajDni(plan.do, 1)} onZamknij=${() => setNowyPlan(false)} onZapisz=${(od, do_) => { let id; zmien((dd) => { id = M.nowyPlan(dd, od, do_).id; }); ustawPlan(id); setNowyPlan(false); }} />` : null}
    ${edycjaDat ? html`<${PlanDatyModal} tytul="Zmień daty planu" od=${plan.od} do_=${plan.do} onZamknij=${() => setEdycjaDat(false)}
      onZapisz=${(od, do_) => { zmien((dd) => { const p = dd.plany.find((x) => x.id === plan.id); p.od = od; p.do = do_; for (const k of Object.keys(p.dni || {})) if (k < od || k > do_) delete p.dni[k]; }); setEdycjaDat(false); }} />` : null}
    ${usun ? html`<${Potwierdz} tytul="Usunąć plan?" tekst=${`Plan ${opisPlanu(plan)} zostanie usunięty razem z listą zakupów. Przepisy zostają.`} tak="Usuń plan" niebezpieczne
      onNie=${() => setUsun(false)} onTak=${() => { zmien((dd) => { dd.plany = dd.plany.filter((x) => x.id !== plan.id); }); setUsun(false); ustawPlan(null); }} />` : null}
  </div>`;
}

function Komorka({ d, plan, data, slot, onDodaj, onMenu }) {
  const w = M.wpis(plan, data, slot);
  if (!w) return html`<button class="komorka-pusta" onClick=${onDodaj}>+ dodaj</button>`;
  const r = d.przepisy[w.przepis];
  if (!r) return html`<button class="komorka-danie brak" onClick=${onMenu}>(usunięty przepis)</button>`;
  const wszyscy = w.osoby.length === d.ustawienia.osoby.length;
  return html`<button class=${'komorka-danie' + (w.zGotowania ? ' z-gotowania' : '') + (r.status !== 'zatwierdzony' ? ' niezatw' : '')} onClick=${onMenu} title=${r.nazwa}>
    <span class="danie-nazwa">${w.zGotowania ? '↻ ' : ''}${r.nazwa}</span>
    <span class="danie-meta">
      ${r.kcal ? html`<span>${r.kcal} kcal</span>` : null}
      ${w.naDni > 1 ? html`<${Etykieta} klasa="et-niebieska">gotuję na ${w.naDni} dni<//>` : null}
      ${w.zGotowania ? html`<${Etykieta}>z ${dzienKrotko(w.zGotowania)}<//>` : null}
      <span class="osoby">${d.ustawienia.osoby.map((o) => html`<span class=${'osoba' + (w.osoby.includes(o.id) ? ' tak' : ' nie')} title=${o.imie}>${o.imie[0]}</span>`)}</span>
      ${!wszyscy ? html`<${Etykieta} klasa="et-pomaranczowa">1 os.<//>` : null}
    </span>
  </button>`;
}

function KcalDnia({ d, plan, data }) {
  const k = M.kcalDnia(plan, d, data);
  return html`<div class="kcal-dnia">${d.ustawienia.osoby.map((o) => {
    const x = k[o.id]; const cel = o.celKcal;
    let klasa = '';
    if (cel && x.kcal) klasa = x.kcal > cel * 1.05 ? 'za-duzo' : x.kcal < cel * 0.85 ? 'za-malo' : 'ok';
    return html`<div class=${'kcal-osoba ' + klasa} title=${`B ${Math.round(x.b)} g · T ${Math.round(x.t)} g · W ${Math.round(x.w)} g${x.szacunkowe ? ' (część szacunkowa)' : ''}${x.niepelne ? ' · niepełne dane makro' : ''}`}>
      <strong>${o.imie}:</strong> ${Math.round(x.kcal)}${cel ? html`<span class="cel"> / ${cel}</span>` : null} kcal
      <div class="makro">B ${Math.round(x.b)} · T ${Math.round(x.t)} · W ${Math.round(x.w)}${x.szacunkowe ? '*' : ''}</div>
    </div>`;
  })}</div>`;
}

function PlanDatyModal({ tytul, od, do_, onZamknij, onZapisz }) {
  const start = od || M.domyslnyNowyPlanOd();
  const [a, setA] = useState(start);
  const [b, setB] = useState(do_ || dodajDni(start, 6));
  const dni = a && b ? roznicaDni(a, b) + 1 : 0;
  const ok = a && b && dni >= 1 && dni <= 31;
  return html`<${Modal} tytul=${tytul} onZamknij=${onZamknij} stopka=${html`<button class="przycisk" onClick=${onZamknij}>Anuluj</button><button class="przycisk przycisk-glowny" disabled=${!ok} onClick=${() => onZapisz(a, b)}>Zapisz</button>`}>
    <div class="wiersz-pol">
      <label class="pole">Od (pierwszy dzień)<input type="date" value=${a} onInput=${(ev) => { setA(ev.target.value); if (b < ev.target.value) setB(dodajDni(ev.target.value, 6)); }} /></label>
      <label class="pole">Do (ostatni dzień)<input type="date" value=${b} min=${a} onInput=${(ev) => setB(ev.target.value)} /></label>
    </div>
    <p>${ok ? `${dni} ${dni === 1 ? 'dzień' : 'dni'}: ${dataPelna(a)} – ${dataPelna(b)}` : 'Plan może mieć od 1 do 31 dni.'}</p>
  <//>`;
}

function MenuWpisu({ d, plan, data, slot, onZamknij, onZmien, otworzPrzepis }) {
  const w = M.wpis(plan, data, slot);
  if (!w) return null;
  const r = d.przepisy[w.przepis];
  const pos = d.ustawienia.posilki.find((p) => p.id === slot);
  const zm = (fn) => zmien((dd) => fn(dd.plany.find((x) => x.id === plan.id)));
  const dni = M.dniPlanu(plan); const ileDalej = dni.length - dni.indexOf(data);
  return html`<${Modal} tytul=${`${pos?.nazwa} · ${dataPelna(data)}`} onZamknij=${onZamknij}>
    <h3 class="menu-danie">${r ? r.nazwa : '(usunięty przepis)'}</h3>
    ${r && r.status !== 'zatwierdzony' ? html`<p class="ostrzezenie">Ten przepis nie jest już zatwierdzony (${M.STATUSY[r.status]}).</p>` : null}
    <div class="menu-sekcja"><strong>Kto je:</strong>
      ${d.ustawienia.osoby.map((o) => html`<label class="przelacznik"><input type="checkbox" checked=${w.osoby.includes(o.id)} disabled=${w.osoby.length === 1 && w.osoby.includes(o.id)}
        onChange=${() => zm((p) => M.przelaczOsobe(p, data, slot, o.id))} /> ${o.imie}</label>`)}
    </div>
    ${w.zGotowania ? html`<div class="menu-sekcja"><p>To danie jest z gotowania z dnia <strong>${dataPelna(w.zGotowania)}</strong> — nie liczy się drugi raz na liście zakupów.</p>
      <button class="przycisk" onClick=${() => { zm((p) => { const x = M.wpis(p, data, slot); const zr = x.zGotowania; delete x.zGotowania; const z = M.wpis(p, zr, slot); if (z) { let n = 1; for (const dd of M.dniPlanu(p)) { const y = M.wpis(p, dd, slot); if (y && y.zGotowania === zr) n++; } if (n > 1) z.naDni = n; else delete z.naDni; } }); }}>Odłącz — gotuję osobno</button></div>`
    : html`<div class="menu-sekcja"><strong>Gotuję raz na:</strong>
      ${[1, 2, 3, 4].filter((n) => n <= ileDalej).map((n) => html`<button class=${'przycisk' + ((w.naDni || 1) === n ? ' przycisk-glowny' : '')} onClick=${() => zm((p) => M.gotujNaDni(p, data, slot, n))}>${n} ${n === 1 ? 'dzień' : 'dni'}</button>`)}
      <p class="podpowiedz">Kolejne dni dostaną to samo danie jako „z gotowania”. Na liście zakupów policzy się to raz, na łączną liczbę porcji.</p></div>`}
    <div class="menu-akcje">
      ${r ? html`<button class="przycisk" onClick=${() => { onZamknij(); otworzPrzepis(r.id); }}>📖 Otwórz przepis</button>` : null}
      <button class="przycisk" onClick=${onZmien}>🔁 Zmień danie</button>
      <button class="przycisk przycisk-czerwony" onClick=${() => { zm((p) => M.usunWpis(p, data, slot)); onZamknij(); }}>🗑 Usuń z planu</button>
    </div>
  <//>`;
}

export function WyborPrzepisu({ d, plan, data, slot, onZamknij, onWybierz }) {
  const [szukaj, setSzukaj] = useState('');
  const [kat, setKat] = useState(slot);
  const [tylkoUlub, setTylkoUlub] = useState(false);
  const [skladniki, setSkladniki] = useState([]);
  const [sortuj, setSortuj] = useLokalny('sortWyboru', 'dawno');
  const [rozwiniety, setRozwiniety] = useState(null);
  const [propozycja, setPropozycja] = useState(null);
  const [odrzucone] = useState(() => new Set());
  const h = useMemo(() => M.historia(d), [stan.wersjaDanych]);
  const zSkladnikami = useMemo(() => M.przepisyZProduktem(d, skladniki), [skladniki, stan.wersjaDanych]);
  const lista = useMemo(() => {
    const q = fold(szukaj);
    let l = M.przepisy(d, 'zatwierdzony').filter((r) => !r.ukryty && !(r.kategorie || []).includes('baza'));
    if (kat) l = l.filter((r) => (r.kategorie || []).includes(kat));
    if (tylkoUlub) l = l.filter((r) => r.ulubiony);
    if (q) l = l.filter((r) => fold(r.nazwa).includes(q));
    if (zSkladnikami) l = l.filter((r) => zSkladnikami.has(r.id));
    const coll = new Intl.Collator('pl');
    if (sortuj === 'nazwa') l.sort((a, b) => coll.compare(a.nazwa, b.nazwa));
    else if (sortuj === 'kcal') l.sort((a, b) => (a.kcal || 0) - (b.kcal || 0));
    else l.sort((a, b) => ((h[a.id]?.ostatnio || '0') < (h[b.id]?.ostatnio || '0') ? -1 : 1) || coll.compare(a.nazwa, b.nazwa));
    return l;
  }, [szukaj, kat, tylkoUlub, zSkladnikami, sortuj, stan.wersjaDanych]);
  const losuj = () => {
    const r = M.zaproponuj(d, plan, slot, odrzucone);
    if (propozycja) odrzucone.add(propozycja.id);
    setPropozycja(r || null);
    if (!r) komunikat('Brak kolejnych propozycji — zmień filtry albo zatwierdź więcej przepisów.');
  };
  const pos = d.ustawienia.posilki.find((p) => p.id === slot);
  return html`<${Modal} szeroki tytul=${`Wybierz danie: ${pos?.nazwa}, ${dataPelna(data)}`} onZamknij=${onZamknij}>
    <div class="filtry">
      <input type="search" class="szukaj" placeholder="Szukaj po nazwie…" value=${szukaj} onInput=${(ev) => setSzukaj(ev.target.value)} autoFocus />
      <select value=${kat} onChange=${(ev) => setKat(ev.target.value)}>
        <option value="">Wszystkie kategorie</option>
        ${M.KATEGORIE.filter((k) => k.id !== 'baza').map((k) => html`<option value=${k.id}>${k.nazwa}</option>`)}
      </select>
      <label class="przelacznik"><input type="checkbox" checked=${tylkoUlub} onChange=${(ev) => setTylkoUlub(ev.target.checked)} /> tylko ★ ulubione</label>
      <select value=${sortuj} onChange=${(ev) => setSortuj(ev.target.value)}>
        <option value="dawno">Najdawniej jedzone najpierw</option><option value="nazwa">Alfabetycznie</option><option value="kcal">Wg kalorii</option>
      </select>
      <button class="przycisk" onClick=${losuj}>🎲 Zaproponuj</button>
    </div>
    <div class="filtr-skladnikow">
      <span>Mam w domu:</span>
      ${skladniki.map((pid) => html`<span class="chip">${d.produkty[pid]?.nazwa}<button onClick=${() => setSkladniki(skladniki.filter((x) => x !== pid))}>✕</button></span>`)}
      <div class="pole-chip"><${PoleProduktu} dane=${d} wartosc=${null} placeholder="dodaj składnik, np. cukinia" onWybierz=${(pid) => { if (pid && !skladniki.includes(pid)) setSkladniki([...skladniki, pid]); }} /></div>
    </div>
    ${propozycja ? html`<div class="propozycja">
      <div><small>Propozycja:</small> <strong>${propozycja.nazwa}</strong> · ${propozycja.kcal || '?'} kcal · ${M.opisHistorii(h[propozycja.id])}</div>
      <div><button class="przycisk przycisk-glowny" onClick=${() => onWybierz(propozycja.id)}>Wstaw</button> <button class="przycisk" onClick=${losuj}>Inna propozycja</button></div>
    </div>` : null}
    <p class="licznik">${lista.length} przepisów</p>
    <ul class="lista-przepisow-wybor">
      ${lista.slice(0, 300).map((r) => html`<li>
        <div class="wiersz-wyboru">
          <button class="przycisk-link nazwa" onClick=${() => onWybierz(r.id)}>${r.ulubiony ? '★ ' : ''}${r.nazwa}</button>
          <span class="meta">${r.kcal ? r.kcal + ' kcal' : ''}</span>
          <span class="meta">${M.opisHistorii(h[r.id])}</span>
          <button class="przycisk-maly" onClick=${() => setRozwiniety(rozwiniety === r.id ? null : r.id)}>${rozwiniety === r.id ? 'ukryj' : 'składniki'}</button>
          <button class="przycisk przycisk-maly przycisk-glowny" onClick=${() => onWybierz(r.id)}>Wybierz</button>
        </div>
        ${rozwiniety === r.id ? html`<ul class="skladniki-podglad">${M.skalujSkladniki(r, 1).map((e) => html`<li>${M.opisSkladnika(e, d)}</li>`)}</ul>` : null}
      </li>`)}
    </ul>
    ${lista.length === 0 ? html`<p class="pusto">Nic nie pasuje do filtrów.${kat ? ' Spróbuj „Wszystkie kategorie”.' : ''}</p>` : null}
  <//>`;
}
