'use strict'; //pokazuje błedy na zaś

// opóźnienie w milisekundach — używane do czekania przed przekierowaniem
const delay = ms => new Promise(r => setTimeout(r, ms));

// powiadomienie na dole ekranu
let toastT;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), 4000);
}

// alerty w formularzu
function pokazAlert(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function ukryjAlert(id) {
  document.getElementById(id).classList.add('hidden');
}

// blokowanie przycisku podczas wysyłania zapytania
// busy=true  → wyłącza przycisk i pokazuje kręcące się kółko
// busy=false → przywraca przycisk z oryginalną etykietą
function setBusy(btnId, labelId, busy, resetLabel) {
  const btn = document.getElementById(btnId);
  btn.disabled = busy;
  const sp = btn.querySelector('.spin');
  if (sp) sp.style.display = busy ? 'block' : 'none';
  document.getElementById(labelId).textContent = busy ? '' : resetLabel;
}

// przełączanie zakładek Zaloguj / Utwórz konto
function przelaczTab(tab) {
  document.querySelectorAll('.atab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tab);
  });
  document.querySelectorAll('.auth-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById('panel-' + tab).classList.remove('hidden');
  ukryjAlert('log-alert');
  ukryjAlert('reg-alert');
}

// wysyła POST /api/konta/logowanie, zapisuje sesję i przekierowuje do Nowy.html
async function doLogowanie() {
  ukryjAlert('log-alert');
  const email = document.getElementById('l-email').value.trim();
  const haslo = document.getElementById('l-haslo').value;

  if (!email || !haslo) {
    pokazAlert('log-alert', 'Wpisz adres email i hasło.');
    return;
  }

  setBusy('btn-logowanie', 'log-label', true, 'Zaloguj się');

  try {
    const res  = await fetch('http://localhost:3000/api/konta/logowanie', {
      method:  'POST',
      headers: {'Content-Type': 'application/json'},
      body:    JSON.stringify({email, haslo}),
    });
    const data = await res.json();

    if (!res.ok) {
      pokazAlert('log-alert', data.error || 'Błąd logowania.');
      setBusy('btn-logowanie', 'log-label', false, 'Zaloguj się');
      return;
    }

    // zapis sesji w localStorage — Nowy.html sprawdza ten klucz przy wejściu
    localStorage.setItem('cafe_konto_sesja', JSON.stringify(data.konto));
    toast('Zalogowano! Za chwilę przekierowanie… ✦');
    await delay(900);
    window.location.href = 'Nowy.html';

  } catch(e) {
    pokazAlert('log-alert', 'Błąd połączenia z serwerem. Sprawdź czy serwer jest uruchomiony.');
    setBusy('btn-logowanie', 'log-label', false, 'Zaloguj się');
  }
}

// waliduje dane, wysyła POST /api/konta/rejestracja, zapisuje sesję i przekierowuje
async function doRejestracja() {
  ukryjAlert('reg-alert');
  const imie     = document.getElementById('r-imie').value.trim();
  const nazwisko = document.getElementById('r-nazwisko').value.trim();
  const email    = document.getElementById('r-email').value.trim();
  const haslo    = document.getElementById('r-haslo').value;
  const haslo2   = document.getElementById('r-haslo2').value;

  if (!imie || !nazwisko || !email || !haslo) {
    pokazAlert('reg-alert', 'Wypełnij wszystkie wymagane pola.');
    return;
  }
  if (haslo.length < 6) {
    pokazAlert('reg-alert', 'Hasło musi mieć co najmniej 6 znaków.');
    return;
  }
  if (haslo !== haslo2) {
    pokazAlert('reg-alert', 'Hasła nie są identyczne.');
    return;
  }

  setBusy('btn-rejestracja', 'reg-label', true, 'Utwórz konto');

  try {
    const res  = await fetch('http://localhost:3000/api/konta/rejestracja', {
      method:  'POST',
      headers: {'Content-Type': 'application/json'},
      body:    JSON.stringify({imie, nazwisko, email, haslo}),
    });
    const data = await res.json();

    if (!res.ok) {
      pokazAlert('reg-alert', data.error || 'Błąd rejestracji.');
      setBusy('btn-rejestracja', 'reg-label', false, 'Utwórz konto');
      return;
    }

    localStorage.setItem('cafe_konto_sesja', JSON.stringify(data.konto));
    toast('Konto utworzone! Za chwilę przekierowanie… ✦');
    await delay(900);
    window.location.href = 'Nowy.html';

  } catch(e) {
    pokazAlert('reg-alert', 'Błąd połączenia z serwerem. Sprawdź czy serwer jest uruchomiony.');
    setBusy('btn-rejestracja', 'reg-label', false, 'Utwórz konto');
  }
}

// inicjalizacja po załadowaniu strony
document.addEventListener('DOMContentLoaded', () => {

  // jeśli sesja już istnieje — od razu przekieruj do Nowy.html bez logowania
  const sesja = localStorage.getItem('cafe_konto_sesja');
  if (sesja) {
    window.location.href = 'Nowy.html';
    return;
  }

  // obsługa kliknięcia zakładek
  document.querySelectorAll('.atab').forEach(tab => {
    tab.addEventListener('click', () => przelaczTab(tab.dataset.tab));
  });

  // przyciski formularzy
  document.getElementById('btn-logowanie').addEventListener('click', doLogowanie);
  document.getElementById('btn-rejestracja').addEventListener('click', doRejestracja);

  // zatwierdzanie enterem
  document.getElementById('l-haslo').addEventListener('keydown',  e => e.key === 'Enter' && doLogowanie());
  document.getElementById('r-haslo2').addEventListener('keydown', e => e.key === 'Enter' && doRejestracja());
});
