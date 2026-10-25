// Główny układ programu
import { html, useStan, useLokalny } from './wspolne.js';
import * as S from '../store.js';
import { PlanView } from './plan.js';
import { PrzepisyView } from './przepisy.js';
import { ZakupyView } from './zakupy.js';
import { ProduktyView } from './produkty.js';
import { UstawieniaView } from './ustawienia.js';

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
  if (st.faza === 'nowy-folder') return html`<${Ekran} tytul="Nowy folder danych">
    <p>W folderze <strong>${st.folderNazwa}</strong> nie ma jeszcze pliku <code>dane.json</code>.</p>
    <p class="podpowiedz">Jeśli na drugim komputerze dane już są, poczekaj, aż OneDrive skończy synchronizację, i kliknij „Sprawdź ponownie”.</p>
    <div class="przyciski-wiersz">
      <button class="przycisk przycisk-glowny przycisk-duzy" onClick=${S.utworzNowaBaze}>✨ Utwórz nowe dane</button>
      <button class="przycisk" onClick=${S.start}>🔄 Sprawdź ponownie</button>
      <button class="przycisk" onClick=${S.wybierzFolder}>📁 Inny folder</button>
    </div><//>`;
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

  return html`<div class="uklad">
    <header class="naglowek">
      <div class="logo">🐾 Koci Grajdołek</div>
      <nav class="nawigacja">${ZAKLADKI.map((z) => html`<button class=${'nav' + (zakladka === z.id ? ' aktywna' : '')} onClick=${() => idzDo(z.id)}>
        <span class="nav-ikona">${z.ikona}</span> ${z.nazwa}
        ${z.id === 'przepisy' && doPrzejrzenia ? html`<span class="znaczek">${doPrzejrzenia}</span>` : null}
        ${z.id === 'produkty' && d.noweProdukty.length ? html`<span class="znaczek">${d.noweProdukty.length}</span>` : null}
      </button>`)}</nav>
      <div class=${'status-zapisu ' + st.zapis} title=${st.bladZapisu || 'Dane zapisują się same po każdej zmianie'}>${S.fs.trybTestowy ? 'TEST · ' : ''}${statusZapisu}</div>
    </header>
    ${st.konflikt ? html`<div class="baner-konflikt">
      <strong>Plik z danymi zmienił się na drugim komputerze</strong>, a tutaj są niezapisane zmiany.
      <button class="przycisk" onClick=${S.wczytajIchWersje}>Wczytaj wersję z drugiego komputera (moje ostatnie zmiany przepadną)</button>
      <button class="przycisk przycisk-czerwony" onClick=${S.nadpiszMoja}>Zapisz moją wersję (nadpisze tamtą)</button>
    </div>` : null}
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
