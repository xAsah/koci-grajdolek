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

  const utworzPlan = (od, do_, opc) => {
    let id, n = 0;
    zmien((dd) => { const p = M.nowyPlan(dd, od, do_); id = p.id; if (opc?.przenies) n = M.przeniesDniWspolne(dd, p, opc); });
    ustawPlan(id);
    if (n) komunikat(`Przeniesiono ${n} ${n === 1 ? 'danie' : n < 5 ? 'dania' : 'dań'} z poprzedniego planu${opc.doListy ? '' : ' (bez dopisywania do listy zakupów)'}.`);
  };

  if (!plan) {
    return html`<div class="pusty-stan"><h2>Nie ma jeszcze żadnego planu</h2>
      <p>Plan to okres „od zakupów do zakupów”. Wybierz daty, potem dodawaj dania do posiłków.</p>
      ${M.przepisy(d, 'zatwierdzony').length === 0 ? html`<p class="ostrzezenie">Nie masz jeszcze zatwierdzonych przepisów. Do planu trafiają tylko zatwierdzone — przejrzyj je w zakładce <strong>Przepisy → Do przejrzenia</strong>.</p>` : null}
      <button class="przycisk przycisk-glowny przycisk-duzy" onClick=${() => setNowyPlan(true)}>➕ Utwórz plan</button>
      ${nowyPlan ? html`<${PlanDatyModal} d=${d} tytul="Nowy plan" onZamknij=${() => setNowyPlan(false)} onZapisz=${(od, do_, opc) => { utworzPlan(od, do_, opc); setNowyPlan(false); }} />` : null}
    </div>`;
  }

  const dni = M.dniPlanu(plan);
  const posilki = d.ustawienia.posilki;
  const pusteSloty = dni.reduce((s, data) => s + posilki.filter((pos) => !M.wpis(plan, data, pos.id)).length, 0);

  const zaproponujPuste = () => {
    const kopia = clone(plan.dni || {});
    let w = { n: 0, ponizejCelu: 0 };
    zmien((dd) => { w = M.uzupelnijPuste(dd, dd.plany.find((x) => x.id === plan.id)); });
    setCofnij({ dni: kopia, opis: `Wstawiono ${w.n} propozycji` });
    const zCelami = d.ustawienia.osoby.some((o) => o.celKcal);
    if (!w.n) komunikat('Brak zatwierdzonych przepisów do zaproponowania.');
    else if (w.ponizejCelu) komunikat(`Wstawiono ${w.n} propozycji. W ${w.ponizejCelu} ${w.ponizejCelu === 1 ? 'dniu' : 'dniach'} nie da się dojść do celu kalorii z obecnych zatwierdzonych przepisów — zatwierdź ich więcej (zwłaszcza obiady i kolacje).`);
    else komunikat(`Wstawiono ${w.n} propozycji${zCelami ? ' dobranych pod cele kalorii' : ''} — podmień te, które nie pasują.`);
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
    ${nowyPlan ? html`<${PlanDatyModal} d=${d} tytul="Nowy plan" od=${dodajDni(plan.do, 1)} onZamknij=${() => setNowyPlan(false)} onZapisz=${(od, do_, opc) => { utworzPlan(od, do_, opc); setNowyPlan(false); }} />` : null}
    ${edycjaDat ? html`<${PlanDatyModal} d=${d} tytul="Zmień daty planu" od=${plan.od} do_=${plan.do} pominId=${plan.id} onZamknij=${() => setEdycjaDat(false)}
      onZapisz=${(od, do_, opc) => { let n = 0; zmien((dd) => { const p = dd.plany.find((x) => x.id === plan.id); M.zmienDatyPlanu(dd, p, od, do_); if (opc.przenies) n = M.przeniesDniWspolne(dd, p, opc); }); setEdycjaDat(false); if (n) komunikat(`Przeniesiono ${n} ${n === 1 ? 'danie' : n < 5 ? 'dania' : 'dań'} z poprzedniego planu.`); }} />` : null}
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
  const spozaPlanu = w.zGotowania && (w.zGotowania < plan.od || w.zGotowania > plan.do);
  const tytul = r.nazwa + (w.poPlanie ? ` — ${w.poPlanie} ${w.poPlanie === 1 ? 'dzień' : 'dni'} po końcu planu (następny plan)` : '')
    + (spozaPlanu ? ` — z gotowania z ${dataPl(w.zGotowania)} (poprzedni plan)` : '') + (w.bezZakupow ? ' — składniki nie idą na listę zakupów' : '');
  return html`<button class=${'komorka-danie' + (w.zGotowania ? ' z-gotowania' : '') + (r.status !== 'zatwierdzony' ? ' niezatw' : '')} onClick=${onMenu} title=${tytul}>
    <span class="danie-nazwa">${w.zGotowania ? '↻ ' : ''}${r.nazwa}</span>
    <span class="danie-meta">
      ${r.kcal ? html`<span>${r.kcal} kcal</span>` : null}
      ${w.naDni > 1 ? html`<${Etykieta} klasa="et-niebieska">gotuję na ${w.naDni} dni${w.poPlanie ? ' →' : ''}<//>` : null}
      ${w.zGotowania ? html`<${Etykieta}>z ${dzienKrotko(w.zGotowania)}${spozaPlanu ? ' (poprz. plan)' : ''}<//>` : null}
      ${w.przeniesione && !w.zGotowania ? html`<${Etykieta}>z poprz. planu<//>` : null}
      ${w.bezZakupow ? html`<${Etykieta} klasa="et-szara">bez zakupów<//>` : null}
      <span class="osoby">${d.ustawienia.osoby.map((o) => html`<span class=${'osoba' + (w.osoby.includes(o.id) ? ' tak' : ' nie')} title=${o.imie}>${o.imie[0]}</span>`)}</span>
      ${!wszyscy ? html`<${Etykieta} klasa="et-pomaranczowa">1 os.<//>` : null}
    </span>
  </button>`;
}

function KcalDnia({ d, plan, data }) {
  const k = M.kcalDnia(plan, d, data);
  const klasaCelu = (v, cel, tol = 0.1) => (!cel || !v ? '' : v > cel * (1 + tol) ? 'za-duzo' : v < cel * (1 - tol) ? 'za-malo' : 'ok');
  return html`<div class="kcal-dnia">${d.ustawienia.osoby.map((o) => {
    const x = k[o.id]; const cel = o.celKcal;
    const klasa = cel && x.kcal ? (x.kcal > cel * 1.05 ? 'za-duzo' : x.kcal < cel * 0.9 ? 'za-malo' : 'ok') : '';
    const makro = (lit, v, c) => html`<span class=${'m ' + klasaCelu(v, c, 0.15)}>${lit} ${Math.round(v)}${c ? '/' + c : ''}</span>`;
    return html`<div class=${'kcal-osoba ' + klasa} title=${`${x.szacunkowe ? 'Część makro jest szacunkowa. ' : ''}${x.niepelne ? 'Niepełne dane makro.' : ''}`}>
      <strong>${o.imie}:</strong> ${Math.round(x.kcal)}${cel ? html`<span class="cel"> / ${cel}</span>` : null} kcal
      <div class="makro">${makro('B', x.b, o.celB)} · ${makro('T', x.t, o.celT)} · ${makro('W', x.w, o.celW)}${x.szacunkowe ? '*' : ''}</div>
    </div>`;
  })}</div>`;
}

function PlanDatyModal({ d, tytul, od, do_, pominId = null, onZamknij, onZapisz }) {
  const start = od || M.domyslnyNowyPlanOd();
  const [a, setA] = useState(start);
  const [b, setB] = useState(do_ || dodajDni(start, 6));
  const [przenies, setPrzenies] = useState(true);
  const [doListy, setDoListy] = useState(false);
  const dni = a && b ? roznicaDni(a, b) + 1 : 0;
  const ok = a && b && dni >= 1 && dni <= 31;
  // dni wspólne z innymi planami (bez tych, które ten plan już ma)
  const wspolne = useMemo(() => {
    if (!ok) return [];
    const ten = pominId ? d.plany.find((x) => x.id === pominId) : null;
    return M.dniWspolne(d, a, b, pominId).filter((x) => !ten || x.data < ten.od || x.data > ten.do || !Object.keys(ten.dni?.[x.data] || {}).length);
  }, [a, b, ok, stan.wersjaDanych]);
  const plany = [...new Map(wspolne.map((x) => [x.plan.id, x.plan])).values()];
  return html`<${Modal} tytul=${tytul} onZamknij=${onZamknij} stopka=${html`<button class="przycisk" onClick=${onZamknij}>Anuluj</button><button class="przycisk przycisk-glowny" disabled=${!ok} onClick=${() => onZapisz(a, b, { przenies: przenies && wspolne.length > 0, doListy })}>Zapisz</button>`}>
    <div class="wiersz-pol">
      <label class="pole">Od (pierwszy dzień)<input type="date" value=${a} onInput=${(ev) => { setA(ev.target.value); if (b < ev.target.value) setB(dodajDni(ev.target.value, 6)); }} /></label>
      <label class="pole">Do (ostatni dzień)<input type="date" value=${b} min=${a} onInput=${(ev) => setB(ev.target.value)} /></label>
    </div>
    <p>${ok ? `${dni} ${dni === 1 ? 'dzień' : 'dni'}: ${dataPelna(a)} – ${dataPelna(b)}` : 'Plan może mieć od 1 do 31 dni.'}</p>
    ${wspolne.length ? html`<div class="menu-sekcja dni-wspolne">
      <p><strong>Te dni są już w ${plany.length === 1 ? `planie ${opisPlanu(plany[0])}` : 'innych planach'}:</strong> ${wspolne.map((x) => `${dataPelna(x.data)} (${x.ile} ${x.ile === 1 ? 'danie' : x.ile < 5 ? 'dania' : 'dań'})`).join(', ')}.</p>
      <label class="przelacznik"><input type="checkbox" checked=${przenies} onChange=${(ev) => setPrzenies(ev.target.checked)} /> Przenieś te dania do ${pominId ? 'tego' : 'nowego'} planu</label>
      ${przenies ? html`<div class="opcje-wciete">
        <label class="przelacznik"><input type="radio" name="doListy" checked=${!doListy} onChange=${() => setDoListy(false)} /> Nie dopisuj ich składników do listy zakupów (już kupione albo ugotowane)</label>
        <label class="przelacznik"><input type="radio" name="doListy" checked=${doListy} onChange=${() => setDoListy(true)} /> Dopisz ich składniki do nowej listy zakupów</label>
        <p class="podpowiedz">Potem możesz to zmienić przy każdym daniu osobno (kliknij danie → „Dopisz składniki do listy zakupów”). Dania „z gotowania” nigdy nie idą na listę drugi raz.</p>
      </div>` : null}
    </div>` : null}
  <//>`;
}

function MenuWpisu({ d, plan, data, slot, onZamknij, onZmien, otworzPrzepis }) {
  const w = M.wpis(plan, data, slot);
  if (!w) return null;
  const r = d.przepisy[w.przepis];
  const pos = d.ustawienia.posilki.find((p) => p.id === slot);
  const zm = (fn) => zmien((dd) => fn(dd.plany.find((x) => x.id === plan.id), dd));
  const dni = M.dniPlanu(plan); const ileDalej = dni.length - dni.indexOf(data);
  const planZr = w.zPlanu ? d.plany.find((x) => x.id === w.zPlanu) : null;
  const spozaPlanu = w.zGotowania && (w.zGotowania < plan.od || w.zGotowania > plan.do);
  const pg = w.zGotowania ? null : M.porcjeGotowania(plan, data, slot);
  return html`<${Modal} tytul=${`${pos?.nazwa} · ${dataPelna(data)}`} onZamknij=${onZamknij}>
    <h3 class="menu-danie">${r ? r.nazwa : '(usunięty przepis)'}</h3>
    ${r && r.status !== 'zatwierdzony' ? html`<p class="ostrzezenie">Ten przepis nie jest już zatwierdzony (${M.STATUSY[r.status]}).</p>` : null}
    <div class="menu-sekcja"><strong>Kto je:</strong>
      ${d.ustawienia.osoby.map((o) => html`<label class="przelacznik"><input type="checkbox" checked=${w.osoby.includes(o.id)} disabled=${w.osoby.length === 1 && w.osoby.includes(o.id)}
        onChange=${() => zm((p) => M.przelaczOsobe(p, data, slot, o.id))} /> ${o.imie}</label>`)}
    </div>
    ${w.zGotowania ? html`<div class="menu-sekcja"><p>To danie jest z gotowania z dnia <strong>${dataPelna(w.zGotowania)}</strong>${spozaPlanu ? html` (plan ${planZr ? opisPlanu(planZr) : 'poprzedni'})` : null} — nie liczy się drugi raz na liście zakupów.</p>
      <button class="przycisk" onClick=${() => zm((p, dd) => M.odlaczOdZrodla(dd, p, data, slot))}>Odłącz — gotuję osobno</button>
      ${spozaPlanu && w.auto ? html`<p class="podpowiedz">„Odłącz” albo „Usuń z planu” zmniejszy też gotowanie w poprzednim planie o ten dzień.</p>` : null}</div>`
    : html`<div class="menu-sekcja"><strong>Gotuję raz na:</strong>
      ${[1, 2, 3, 4].map((n) => html`<button class=${'przycisk' + ((w.naDni || 1) === n ? ' przycisk-glowny' : '')} onClick=${() => zm((p) => M.gotujNaDni(p, data, slot, n))}>${n} ${n === 1 ? 'dzień' : 'dni'}</button>`)}
      <p class="podpowiedz">Kolejne dni dostaną to samo danie jako „z gotowania”. Na liście zakupów policzy się to raz, na łączną liczbę porcji.${ileDalej < 4 ? ' Dni po końcu planu też się liczą na tej liście, a w następnym planie pojawią się same jako „z gotowania”.' : ''}</p>
      ${pg?.poza.length ? html`<p class="info-pasek">Po końcu planu: ${pg.poza.map(dataPelna).join(', ')} — to danie będzie tam „z gotowania”.</p>` : null}
      ${w.przeniesione ? html`<p>Danie przeniesione z planu ${planZr ? opisPlanu(planZr) : '(usuniętego)'}.</p>` : null}
      <label class="przelacznik"><input type="checkbox" checked=${!w.bezZakupow} onChange=${(ev) => zm((p) => { const x = M.wpis(p, data, slot); if (ev.target.checked) delete x.bezZakupow; else x.bezZakupow = true; })} /> Dopisz składniki do listy zakupów</label>
      ${w.bezZakupow ? html`<p class="podpowiedz">Składniki tego dania nie trafią na listę (np. już kupione albo ugotowane).</p>` : null}</div>`}
    <div class="menu-akcje">
      ${r ? html`<button class="przycisk" onClick=${() => { onZamknij(); otworzPrzepis(r.id); }}>📖 Otwórz przepis</button>` : null}
      <button class="przycisk" onClick=${onZmien}>🔁 Zmień danie</button>
      <button class="przycisk przycisk-czerwony" onClick=${() => { zm((p, dd) => M.usunWpis(p, data, slot, dd)); onZamknij(); }}>🗑 Usuń z planu</button>
    </div>
  <//>`;
}

export function WyborPrzepisu({ d, plan, data, slot, onZamknij, onWybierz }) {
  const [szukaj, setSzukaj] = useState('');
  const [kat, setKat] = useState('__pasujace');
  const [tylkoUlub, setTylkoUlub] = useState(false);
  const [skladniki, setSkladniki] = useState([]);
  const [sortuj, setSortuj] = useLokalny('sortWyboru2', 'cel');
  // ile kalorii zostało na ten posiłek (cel dnia minus reszta dnia, podzielone na puste posiłki)
  const naPosilek = useMemo(() => {
    const k = M.kcalDnia(plan, d, data);
    const biez = M.wpis(plan, data, slot); const rb = biez && d.przepisy[biez.przepis];
    const puste = d.ustawienia.posilki.filter((x) => x.id === slot || !M.wpis(plan, data, x.id)).length;
    const wyn = [];
    for (const o of d.ustawienia.osoby) {
      if (!o.celKcal) continue;
      const bez = k[o.id].kcal - (rb && biez.osoby.includes(o.id) ? rb.kcal || 0 : 0);
      wyn.push({ imie: o.imie, reszta: o.celKcal - bez, naPosilek: Math.max(0, (o.celKcal - bez) / Math.max(1, puste)) });
    }
    return wyn;
  }, [stan.wersjaDanych, data, slot]);
  const celPosilku = naPosilek.length ? naPosilek.reduce((s, x) => s + x.naPosilek, 0) / naPosilek.length : null;
  const [rozwiniety, setRozwiniety] = useState(null);
  const [propozycja, setPropozycja] = useState(null);
  const [odrzucone] = useState(() => new Set());
  const h = useMemo(() => M.historia(d), [stan.wersjaDanych]);
  const zSkladnikami = useMemo(() => M.przepisyZProduktem(d, skladniki), [skladniki, stan.wersjaDanych]);
  const lista = useMemo(() => {
    const q = fold(szukaj);
    let l = M.przepisy(d, 'zatwierdzony').filter((r) => !r.ukryty && !(r.kategorie || []).includes('baza'));
    if (kat === '__pasujace') { const pas = l.filter((r) => { const k = M.karaKategorii(r, slot); return k !== null && k <= 0.08; }); if (pas.length) l = pas; }
    else if (kat) l = l.filter((r) => (r.kategorie || []).includes(kat));
    if (tylkoUlub) l = l.filter((r) => r.ulubiony);
    if (q) l = l.filter((r) => fold(r.nazwa).includes(q));
    if (zSkladnikami) l = l.filter((r) => zSkladnikami.has(r.id));
    const coll = new Intl.Collator('pl');
    if (sortuj === 'nazwa') l.sort((a, b) => coll.compare(a.nazwa, b.nazwa));
    else if (sortuj === 'kcal') l.sort((a, b) => (a.kcal || 0) - (b.kcal || 0));
    else if (sortuj === 'cel' && celPosilku !== null) l.sort((a, b) => Math.abs((a.kcal || 0) - celPosilku) - Math.abs((b.kcal || 0) - celPosilku) || coll.compare(a.nazwa, b.nazwa));
    else l.sort((a, b) => ((h[a.id]?.ostatnio || '0') < (h[b.id]?.ostatnio || '0') ? -1 : 1) || coll.compare(a.nazwa, b.nazwa));
    return l;
  }, [szukaj, kat, tylkoUlub, zSkladnikami, sortuj, celPosilku, stan.wersjaDanych]);
  const losuj = () => {
    const r = M.zaproponujDlaSlotu(d, plan, data, slot, odrzucone);
    if (propozycja) odrzucone.add(propozycja.id);
    setPropozycja(r || null);
    if (!r) komunikat('Brak kolejnych propozycji — zmień filtry albo zatwierdź więcej przepisów.');
  };
  const pos = d.ustawienia.posilki.find((p) => p.id === slot);
  return html`<${Modal} szeroki tytul=${`Wybierz danie: ${pos?.nazwa}, ${dataPelna(data)}`} onZamknij=${onZamknij}>
    <div class="filtry">
      <input type="search" class="szukaj" placeholder="Szukaj po nazwie…" value=${szukaj} onInput=${(ev) => setSzukaj(ev.target.value)} autoFocus />
      <select value=${kat} onChange=${(ev) => setKat(ev.target.value)}>
        <option value="__pasujace">Pasujące do tego posiłku</option>
        <option value="">Wszystkie kategorie</option>
        ${M.KATEGORIE.filter((k) => k.id !== 'baza').map((k) => html`<option value=${k.id}>${k.nazwa}</option>`)}
      </select>
      <label class="przelacznik"><input type="checkbox" checked=${tylkoUlub} onChange=${(ev) => setTylkoUlub(ev.target.checked)} /> tylko ★ ulubione</label>
      <select value=${sortuj} onChange=${(ev) => setSortuj(ev.target.value)}>
        ${celPosilku !== null ? html`<option value="cel">Najlepiej pasujące do celu kcal</option>` : null}
        <option value="dawno">Najdawniej jedzone najpierw</option><option value="nazwa">Alfabetycznie</option><option value="kcal">Wg kalorii</option>
      </select>
      <button class="przycisk" onClick=${losuj}>🎲 Zaproponuj</button>
    </div>
    ${naPosilek.length ? html`<p class="info-pasek">Na ten posiłek zostało ok. <strong>${Math.round(celPosilku)} kcal</strong> na osobę (${naPosilek.map((x) => `${x.imie}: do celu brakuje ${Math.round(x.reszta)} kcal`).join(', ')}).</p>` : null}
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
