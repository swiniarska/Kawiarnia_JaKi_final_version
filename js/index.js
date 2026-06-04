// CSS reaguje na tę klasę zmieniając tło i padding
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  navbar.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true }); // passive: true = lepsza wydajność przewijania

// Menu mobilne
const burger     = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
let menuOpen     = false;

// otwiera/zamyka menu i blokuje przewijanie strony gdy menu jest otwarte
function toggleMenu() {
  menuOpen = !menuOpen;
  burger.classList.toggle('open', menuOpen);
  mobileMenu.classList.toggle('open', menuOpen);
  document.body.style.overflow = menuOpen ? 'hidden' : '';
}

// zamyka menu (wywoływane po kliknięciu w link w menu)
function closeMenu() {
  menuOpen = false;
  burger.classList.remove('open');
  mobileMenu.classList.remove('open');
  document.body.style.overflow = '';
}

// Animacja "reveal" przy przewijaniu, elementy z klasą "reveal" pojawiają się z animacją gdy wchodzą w widok
// IntersectionObserver wykrywa kiedy element jest widoczny w oknie przeglądarki
const revealEls = document.querySelectorAll('.reveal');
const observer  = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible'); // CSS animuje pojawienie się
      observer.unobserve(e.target);      // przestań obserwować — animacja tylko raz
    }
  });
}, { threshold: 0.12 }); // uruchom gdy 12% elementu jest widoczne
revealEls.forEach(el => observer.observe(el));

// ── Galeria zdjęć slider
const track  = document.getElementById('gal-track');
const slides = track.querySelectorAll('.gal-slide');
const wrap   = document.getElementById('gal-wrap');
let gIdx     = 0; // aktualny indeks slajdu

// oblicza szerokość jednego slajdu (zmienia się przy resize okna)
function getSlideWidth() {
  if (!slides[0]) return 0;
  return slides[0].getBoundingClientRect().width + 20; // +20 = gap między slajdami
}

// przesuwa do slajdu o danym indeksie max zależy od szerokości ekranu — na komputerach widoczne 3 slajdy, na telefonach 1
function gotoSlide(i) {
  const max = slides.length - (window.innerWidth > 768 ? 3 : 1);
  gIdx = Math.max(0, Math.min(i, max)); // ogranicz do zakresu 0..max
  track.style.transform = `translateX(calc(${gIdx * -getSlideWidth()}px))`;
}

// strzałki nawigacji
document.getElementById('gal-prev').addEventListener('click', () => gotoSlide(gIdx - 1));
document.getElementById('gal-next').addEventListener('click', () => gotoSlide(gIdx + 1));

// automatyczne przewijanie co 4 sekundy — zatrzymuje się po najechaniu myszą
let autoTimer = setInterval(() => {
  const max  = slides.length - (window.innerWidth > 768 ? 3 : 1);
  gotoSlide(gIdx + 1 > max ? 0 : gIdx + 1); // wróć na początek po ostatnim
}, 4000);
wrap.addEventListener('mouseenter', () => clearInterval(autoTimer));    // pauza
wrap.addEventListener('mouseleave', () => {
  autoTimer = setInterval(() => {
    const max = slides.length - (window.innerWidth > 768 ? 3 : 1);
    gotoSlide(gIdx + 1 > max ? 0 : gIdx + 1);
  }, 4000);
});

// obsługa swipe na urządzeniach dotykowych
let touchX = 0;
track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
track.addEventListener('touchend',   e => {
  const dx = touchX - e.changedTouches[0].clientX;
  if (Math.abs(dx) > 40) gotoSlide(dx > 0 ? gIdx + 1 : gIdx - 1); // min. 40px swipe
});

// Zakładki menu kliknięcie zakładki: aktywna zakładka + pokazuje odpowiedni panel z kartami
document.querySelectorAll('.menu-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.menu-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.menu-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    // karty w nowo otwartym panelu mogły nie mieć szansy na animację reveal
    document.querySelectorAll('.menu-panel.active .reveal:not(.visible)').forEach(el => {
      setTimeout(() => el.classList.add('visible'), 50);
    });
  });
});

// Newsletter
// Zapis do newslettera — wysyła email na adres podany w formularzu
// Endpoint obsługuje mikroserwis Clojure na porcie 4000
document.getElementById('nl-submit').addEventListener('click', subscribeNewsletter);
document.getElementById('nl-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') subscribeNewsletter();
});

async function subscribeNewsletter() {
  const input = document.getElementById('nl-email');
  const msg   = document.getElementById('nl-msg');
  const btn   = document.getElementById('nl-submit');
  const email = input.value.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  // walidacja po stronie przeglądarki — nie wysyłaj jeśli email niepoprawny
  if (!valid) {
    msg.textContent = 'Wpisz poprawny adres email.';
    msg.className   = 'nl-msg error';
    input.focus();
    return;
  }

  // zablokuj przycisk podczas wysyłania
  btn.disabled    = true;
  msg.textContent = 'Wysyłanie…';
  msg.className   = 'nl-msg';

  try {
    // zapytanie do mikroserwisu Clojure (port 4000)
    const res  = await fetch('http://localhost:4000/api/newsletter', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    const data = await res.json();

    if (res.ok) {
      // sukces — wygaś formularz
      msg.textContent = 'Dziękujemy! Wkrótce będziemy w kontakcie.';
      msg.className   = 'nl-msg success';
      input.value     = '';
      document.getElementById('nl-form').style.opacity = '.4';
    } else {
      // błąd z serwera (np. zły email, błąd Resend)
      msg.textContent = data.error || 'Coś poszło nie tak. Spróbuj ponownie.';
      msg.className   = 'nl-msg error';
      btn.disabled    = false;
    }
  } catch (e) {
    // brak połączenia (mikroserwis nie działa lub zły port)
    msg.textContent = 'Brak połączenia z serwerem newslettera.';
    msg.className   = 'nl-msg error';
    btn.disabled    = false;
  }
}

// ── Płynne przewijanie do sekcji (linki z href) ──────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});

