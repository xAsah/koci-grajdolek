// Główny układ programu
import { html, useStan, useLokalny, useState, Potwierdz } from './wspolne.js';
import * as S from '../store.js';
import { PlanView } from './plan.js';
import { PrzepisyView } from './przepisy.js';
import { ZakupyView } from './zakupy.js';
import { ProduktyView } from './produkty.js';
import { UstawieniaView, ScalModal } from './ustawienia.js';

const ZAKLADKI = [
  { id: 'plan', nazwa: 'Plan', ikona: '📅' },
  { id: 'przepisy', nazwa: 'Przepisy', ikona: '📖' },
  { id: 'zakupy', nazwa: 'Lista zakupów', ikona: '🛒' },
  { id: 'produkty', nazwa: 'Produkty', ikona: '🥕' },
  { id: 'ustawienia', nazwa: 'Ustawienia', ikona: '⚙️' },
];

function Ekran({ tytul, children }) {
  return html`<div class="ekran-startowy"><div class="karta-startowa"><div class="logo-duze">🐾</div><h1>${tytul}</h1>${children}</div></div>`;
}

export function App() {
  const st = useStan();
  const [zakladka, setZakladka] = useLokalny('zakladka', 'plan');
  const [wybranyPlan, setWybranyPlan] = useLokalny('plan', null);
  const [wybranyPrzepis, setWybranyPrzepis] = useLokalny('przepis', null);
  const [potwierdzNowe, setPotwierdzNowe] = useState(false);
  const [scal, setScal] = useState(null);
  const [ukryjInne, setUkryjInne] = useState('');

  if (st.faza === 'start') return html`<${Ekran} tytul="Koci Grajdołek"><p>Uruchamiam…</p><//>`;
  if (st.faza === 'nieobslugiwane') return html`<${Ekran} tytul="Ta przeglądarka nie wystarczy">
    <p>Program zapisuje dane do folderu na dysku, a tego nie potrafi ta przeglądarka (np. Firefox).</p>
    <p><strong>Otwórz program w Google Chrome albo Microsoft Edge.</strong> Na co dzień możesz dalej używać swojej przeglądarki.</p><//>`;
  if (st.faza === 'brak-folderu') return html`<${Ekran} tytul="Witaj w Kocim Grajdołku">
    <p>Na początek wskaż folder, w którym program ma trzymać dane (przepisy, plany, listy).</p>
    <p class="podpowiedz">Wybierz folder <strong>Koci Grajdołek</strong> w OneDrive — wtedy oba komputery będą miały te same dane.</p>
    <button class="przycisk przycisk-glowny przycisk-duzy" onClick=${S.wybierzFolder}>📁 Wybierz folder z danymi</button><//>`;
  if (st.faza === 'uprawnienia') return html`<${Ekran} tytul="Koci Grajdołek">
    <p>Przeglądarka pyta o zgodę na folder <strong>${st.folderNazwa}</strong>.</p>
    <button class="przycisk przycisk-glowny przycisk-duzy" onClick=${S.udzielUprawnien}>🔓 Otwórz dane</button>
    <p class="podpowiedz">W okienku przeglądarki wybierz „Zezwalaj przy każdej wizycie”, jeśli jest taka opcja.</p>
    <button class="przycisk-link" onClick=${S.wybierzFolder}>wskaż inny folder</button><//>`;
  if (st.faza === 'nowy-folder') {
    const sl = st.slady || { kopie: 0, inne: [] };
    const sladyDanych = sl.kopie > 0 || sl.inne.length > 0;
    return html`<${Ekran} tytul="Brak pliku z danymi">
    <p>W folderze <strong>${st.folderNazwa}</strong> nie ma pliku <code>dane.json</code>.</p>
    <div class="ostrzezenie"><strong>Jeśli na drugim komputerze program już działa, NIE twórz nowych danych.</strong> Powstałyby dwie osobne wersje i zmiany z jednego komputera nie byłyby widoczne na drugim.
      Poczekaj, aż OneDrive pobierze plik (chmurka przy zegarze przestanie się kręcić), i kliknij „Sprawdź ponownie”. Upewnij się też, że wskazany jest wspólny folder <strong>Koci Grajdołek</strong> w OneDrive.</div>
    ${sladyDanych ? html`<div class="info-pasek">W tym folderze są już ślady danych${sl.kopie ? ` (${sl.kopie} kopii zapasowych)` : ''}${sl.inne.length ? ` i plik ${sl.inne.map((x) => x.nazwa).join(', ')}` : ''}. Zamiast tworzyć nowe dane, możesz zacząć od nich:
      <div class="przyciski-wiersz">
        ${sl.inne.map((x) => html`<button class="przycisk" onClick=${() => S.zacznijOdPliku(x.nazwa).catch((e) => S.komunikat(String(e?.message || e), 'blad'))}>Użyj pliku ${x.nazwa}</button>`)}
        ${sl.ostatniaKopia ? html`<button class="przycisk" onClick=${() => S.zacznijOdKopii().catch((e) => S.komunikat(String(e?.message || e), 'blad'))}>Użyj najnowszej kopii</button>` : null}
      </div></div>` : null}
    <div class="przyciski-wiersz">
      <button class="przycisk przycisk-glowny" onClick=${S.start}>🔄 Sprawdź ponownie</button>
      <button class="przycisk" onClick=${S.wybierzFolder}>📁 Inny folder</button>
      <button class="przycisk" onClick=${() => setPotwierdzNowe(true)}>✨ Utwórz nowe dane</button>
    </div>
    ${potwierdzNowe ? html`<${Potwierdz} tytul="Utworzyć nowe, puste dane?" tekst="Rób to tylko przy pierwszym uruchomieniu, na pierwszym komputerze. Jeśli drugi komputer już ma dane, powstaną dwie osobne wersje (trzeba je będzie potem scalać)." tak="Tak, utwórz nowe dane" niebezpieczne
      onNie=${() => setPotwierdzNowe(false)} onTak=${() => { setPotwierdzNowe(false); S.utworzNowaBaze(); }} />` : null}<//>`;
  }
  if (st.faza === 'blad') return html`<${Ekran} tytul="Coś poszło nie tak">
    <p class="blad">${st.bladZapisu}</p>
    <div class="przyciski-wiersz"><button class="przycisk" onClick=${S.start}>Spróbuj ponownie</button><button class="przycisk" onClick=${S.wybierzFolder}>Wskaż folder</button></div><//>`;

  const d = st.dane;
  const doPrzejrzenia = Object.values(d.przepisy).filter((r) => r.status === 'do_przejrzenia').length;
  const idzDo = (z) => { setZakladka(z); window.scrollTo(0, 0); };
  const otworzPrzepis = (id) => {
    if (id && d.przepisy[id] && zakladka !== 'przepisy') { try { localStorage.setItem('kg:statusPrzepisow', JSON.stringify(d.przepisy[id].status)); } catch { /* bez pamięci */ } }
    setWybranyPrzepis(id); if (id) idzDo('przepisy');
  };
  const statusZapisu = { zapisano: '✔ zapisano', niezapisane: '● zapisuję za chwilę', zapisywanie: '⏳ zapisywanie…', blad: '⚠ błąd zapisu' }[st.zapis];
  const oz = d.ostatniZapis;
  const opisZapisu = st.bladZapisu || `Dane zapisują się same po każdej zmianie.${oz?.kiedy ? ` Ostatni zapis: ${new Date(oz.kiedy).toLocaleString('pl-PL', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}${oz.kto ? ` (${oz.kto})` : ''}.` : ''}`;
  const inne = st.inneWersje.filter((x) => !ukryjInne.includes(x.nazwa + x.zmieniono));

  return html`<div class="uklad">
    <header class="naglowek">
      <div class="logo">🐾 Koci Grajdołek</div>
      <nav class="nawigacja">${ZAKLADKI.map((z) => html`<button class=${'nav' + (zakladka === z.id ? ' aktywna' : '')} onClick=${() => idzDo(z.id)}>
        <span class="nav-ikona">${z.ikona}</span> ${z.nazwa}
        ${z.id === 'przepisy' && doPrzejrzenia ? html`<span class="znaczek">${doPrzejrzenia}</span>` : null}
        ${z.id === 'produkty' && d.noweProdukty.length ? html`<span class="znaczek">${d.noweProdukty.length}</span>` : null}
      </button>`)}</nav>
      <div class=${'status-zapisu ' + st.zapis} title=${opisZapisu}>${S.fs.trybTestowy ? 'TEST · ' : ''}${statusZapisu}</div>
    </header>
    ${st.konflikt ? html`<div class="baner-konflikt">
      <strong>Plik z danymi zmienił się na drugim komputerze</strong>, a tutaj są niezapisane zmiany.
      <button class="przycisk" onClick=${S.wczytajIchWersje}>Wczytaj wersję z drugiego komputera (moje ostatnie zmiany przepadną)</button>
      <button class="przycisk przycisk-czerwony" onClick=${S.nadpiszMoja}>Zapisz moją wersję (nadpisze tamtą)</button>
    </div>` : null}
    ${inne.length ? html`<div class="baner-konflikt">
      <strong>W folderze danych jest druga wersja danych: ${inne.map((x) => x.nazwa).join(', ')}.</strong> Zwykle tworzy ją OneDrive, gdy oba komputery zapisały dane w tym samym czasie albo gdy na drugim komputerze utworzono nowe dane.
      ${inne.map((x) => html`<button class="przycisk" onClick=${async () => { try { setScal({ nazwa: x.nazwa, ich: await S.czytajInnaWersje(x.nazwa), wFolderze: true }); } catch (e) { S.komunikat(String(e?.message || e), 'blad'); } }}>Dołącz zmiany z ${x.nazwa}</button>`)}
      <button class="przycisk" onClick=${() => setUkryjInne(ukryjInne + inne.map((x) => x.nazwa + x.zmieniono).join('|'))}>Później</button>
    </div>` : null}
    ${scal ? html`<${ScalModal} ...${scal} onZamknij=${() => setScal(null)} />` : null}
    ${st.zapis === 'blad' ? html`<div class="baner-blad">Nie udało się zapisać danych: ${st.bladZapisu} <button class="przycisk" onClick=${() => S.zapiszTeraz(true)}>Spróbuj ponownie</button></div>` : null}
    <main class="tresc">
      ${zakladka === 'plan' ? html`<${PlanView} d=${d} wybranyPlan=${wybranyPlan} ustawPlan=${setWybranyPlan} otworzPrzepis=${otworzPrzepis} idzDoListy=${() => idzDo('zakupy')} />` : null}
      ${zakladka === 'przepisy' ? html`<${PrzepisyView} d=${d} wybrany=${wybranyPrzepis} setWybrany=${setWybranyPrzepis} />` : null}
      ${zakladka === 'zakupy' ? html`<${ZakupyView} d=${d} wybranyPlan=${wybranyPlan} ustawPlan=${setWybranyPlan} idzDoPlanu=${() => idzDo('plan')} idzDoUstawien=${() => idzDo('ustawienia')} />` : null}
      ${zakladka === 'produkty' ? html`<${ProduktyView} d=${d} otworzPrzepis=${otworzPrzepis} />` : null}
      ${zakladka === 'ustawienia' ? html`<${UstawieniaView} d=${d} idzDo=${idzDo} />` : null}
    </main>
    ${st.komunikat ? html`<div class=${'toast ' + (st.komunikat.typ || '')} key=${st.komunikat.id}>${st.komunikat.tekst}</div>` : null}
  </div>`;
}
