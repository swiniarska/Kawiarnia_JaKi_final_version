// server.js — Główny serwer backendu Café JaKi
// Uruchamianie: node server.js
// Działa na: http://localhost:3000
//
// Obsługuje:
//   - Rezerwacje stolików (zapis/odczyt/zmiana statusu/usuwanie)
//   - Konta użytkowników (rejestracja i logowanie przez logowanie.html)
//   - Newsletter (wysyłka emaila przez Resend API) — TYLKO jako fallback,
//     główny serwer newslettera to mikroserwis Clojure na porcie 4000
//   - Serwowanie plików HTML/CSS/JS strony

const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors    = require("cors");
const bcrypt  = require("bcrypt");  // szyfrowanie haseł
const https   = require("https");   // wbudowany moduł Node do zapytań HTTPS

const app  = express();
const PORT = 3000;

// Middleware — kolejność ma znaczenie:
app.use(cors());                      // zezwala na zapytania z innych portów (np. z przeglądarki)
app.use(express.json());              // parsuje JSON z ciała zapytania
app.use(express.static(__dirname));   // serwuje pliki statyczne (HTML, CSS, JS) z tego samego folderu

// ── Baza danych ──────────────────────────────────────────────────────────────
// Plik database.db tworzony automatycznie w tym samym folderze co server.js
const db = new sqlite3.Database("./database.db");

// Tabela rezerwacji stolików — tworzona jeśli nie istnieje
db.run(`
CREATE TABLE IF NOT EXISTS reservations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name    TEXT,    -- imię i nazwisko klienta
    customer_phone   TEXT,    -- numer telefonu
    party_size       INTEGER, -- liczba gości
    table_id         INTEGER, -- id stolika (1-5, patrz TABLES w Nowy.html)
    reservation_date TEXT,    -- data w formacie YYYY-MM-DD
    reservation_time TEXT,    -- godzina np. "14:00"
    status           TEXT,    -- pending / confirmed / completed / cancelled
    notes            TEXT     -- uwagi + zamówienie z menu + alergeny
)
`);

// Tabela kont — używana przez logowanie.html i Nowy.html
db.run(`
CREATE TABLE IF NOT EXISTS konta (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    imie     TEXT,
    nazwisko TEXT,
    email    TEXT UNIQUE,
    haslo    TEXT  -- hasło zahashowane bcrypt
)
`);

// ── REZERWACJE ───────────────────────────────────────────────────────────────

// POST /api/reservations — zapisuje nową rezerwację do bazy
// Wywoływane przez: Nowy.html po kliknięciu "Zarezerwuj stolik"
app.post("/api/reservations", (req, res) => {

    const {
        customer_name, customer_phone, party_size,
        table_id, reservation_date, reservation_time,
        status, notes
    } = req.body;

    db.run(`
        INSERT INTO reservations
        (customer_name, customer_phone, party_size, table_id,
         reservation_date, reservation_time, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [customer_name, customer_phone, party_size, table_id,
     reservation_date, reservation_time, status, notes],
    function(err) {
        if (err) return res.status(500).json(err);
        res.json({ success: true });
    });

});

// GET /api/reservations — zwraca wszystkie rezerwacje
// Wywoływane przez: Nowy.html przy ładowaniu strony i po każdej zmianie
app.get("/api/reservations", (req, res) => {

    db.all("SELECT * FROM reservations", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });

});

// PATCH /api/reservations/:id — zmienia status rezerwacji
// Wywoływane przez: panel admina w Nowy.html (Potwierdź / Zakończ / Anuluj)
app.patch("/api/reservations/:id", (req, res) => {

    const { status } = req.body;
    const { id }     = req.params;

    db.run(
        "UPDATE reservations SET status = ? WHERE id = ?",
        [status, id],
        function(err) {
            if (err) return res.status(500).json(err);
            res.json({ success: true });
        }
    );

});

// DELETE /api/reservations/:id — trwale usuwa rezerwację z bazy
// Wywoływane przez: panel admina w Nowy.html (przycisk "Usuń")
app.delete("/api/reservations/:id", (req, res) => {

    const { id } = req.params;

    db.run(
        "DELETE FROM reservations WHERE id = ?",
        [id],
        function(err) {
            if (err) return res.status(500).json(err);
            res.json({ success: true });
        }
    );

});

// POST /api/konta/rejestracja — tworzy nowe konto w tabeli "konta"
// Wywoływane przez: logowanie.html (zakładka "Utwórz konto")
app.post("/api/konta/rejestracja", async (req, res) => {

    const { imie, nazwisko, email, haslo } = req.body;

    if (!imie || !nazwisko || !email || !haslo) {
        return res.status(400).json({ error: "Wszystkie pola są wymagane." });
    }

    try {
        const hashedHaslo = await bcrypt.hash(haslo, 10); // hashowanie hasła przed zapisem
        db.run(
            "INSERT INTO konta (imie, nazwisko, email, haslo) VALUES (?, ?, ?, ?)",
            [imie, nazwisko, email, hashedHaslo],
            function(err) {
                if (err) return res.status(400).json({ error: "Konto z tym adresem email już istnieje." });
                res.json({ success: true, konto: { id: this.lastID, imie, nazwisko, email } });
            }
        );
    } catch(error) {
        res.status(500).json({ error: "Błąd serwera." });
    }

});

// POST /api/konta/logowanie — sprawdza dane logowania z tabeli "konta"
// Wywoływane przez: logowanie.html (zakładka "Zaloguj się")
// Po sukcesie zwraca dane konta, które frontend zapisuje w localStorage
app.post("/api/konta/logowanie", (req, res) => {

    const { email, haslo } = req.body;

    if (!email || !haslo) {
        return res.status(400).json({ error: "Podaj email i hasło." });
    }

    db.get("SELECT * FROM konta WHERE email = ?", [email], async (err, konto) => {
        if (err)    return res.status(500).json({ error: "Błąd serwera." });
        if (!konto) return res.status(400).json({ error: "Nie znaleziono konta z tym adresem email." });

        const poprawneHaslo = await bcrypt.compare(haslo, konto.haslo);
        if (!poprawneHaslo) return res.status(400).json({ error: "Nieprawidłowe hasło." });

        res.json({
            success: true,
            konto: { id: konto.id, imie: konto.imie, nazwisko: konto.nazwisko, email: konto.email }
        });
    });

});

// NEWSLETTER (fallback Node.js)
// UWAGA: Główny serwer newslettera to mikroserwis Clojure na porcie 4000
// Ten endpoint jest zapasowy — frontend (index.js) domyślnie wywołuje port 4000
// Aby użyć wersji Node.js, zmień port w js/index.js z 4000 na 3000
const RESEND_API_KEY = "re_Euxceqpk_M38z6mmvMZvRNHSYLLqWxxGD";

// POST /api/newsletter — wysyła email powitalny do subskrybenta przez Resend API
app.post("/api/newsletter", (req, res) => {

    const { email } = req.body;

    // walidacja formatu email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ error: "Nieprawidłowy adres email." });
    }

    // treść emaila w HTML
    const html = `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb">
            <div style="background:#102C26;padding:32px 40px">
                <h1 style="color:#F7E7CE;font-family:Georgia,serif;font-size:26px;font-weight:300;margin:0">Café JaKi</h1>
                <p style="color:#C9A96E;font-size:10px;letter-spacing:.3em;text-transform:uppercase;margin:6px 0 0">Newsletter</p>
            </div>
            <div style="padding:36px 40px;background:#FDFAF6">
                <p style="font-family:Georgia,serif;font-size:28px;font-weight:300;color:#102C26;margin:0 0 16px">Dziękujemy za zapis!</p>
                <p style="font-size:13px;color:#6b7c6f;line-height:1.9;margin:0 0 24px">
                    Witaj w gronie gości Café JaKi. Będziemy Ci wysyłać informacje
                    o nowych pozycjach w menu, wydarzeniach specjalnych i ekskluzywnych ofertach.
                </p>
                <p style="font-size:13px;color:#6b7c6f;line-height:1.9;margin:0 0 24px">
                    Pozdrawiamy serdecznie :D
                </p>
                <a href="http://localhost:3000"
                   style="display:inline-block;background:#102C26;color:#F7E7CE;text-decoration:none;font-size:10px;letter-spacing:.25em;text-transform:uppercase;padding:14px 28px">
                    Zarezerwuj stolik →
                </a>
            </div>
            <div style="padding:20px 40px;background:#102C26;text-align:center">
                <p style="color:rgba(247,231,206,.35);font-size:10px;letter-spacing:.15em;margin:0">© 2026 Café JaKi</p>
            </div>
        </div>`;

    const body = JSON.stringify({
        from:    "Café JaKi <onboarding@resend.dev>",
        to:      [email],
        subject: "Witaj w newsletterze Café JaKi!",
        html:    html,
    });

    // zapytanie HTTPS do Resend API — bez zewnętrznych bibliotek
    const options = {
        hostname: "api.resend.com",
        path:     "/emails",
        method:   "POST",
        headers: {
            "Authorization":  `Bearer ${RESEND_API_KEY}`,
            "Content-Type":   "application/json",
            "Content-Length": Buffer.byteLength(body),
        },
    };

    const request = https.request(options, (response) => {
        let data = "";
        response.on("data", chunk => data += chunk);
        response.on("end", () => {
            if (response.statusCode === 200 || response.statusCode === 201) {
                console.log(`[newsletter] Wysłano → ${email}`);
                res.json({ success: true, message: "Dziękujemy! Sprawdź swoją skrzynkę." });
            } else {
                console.error(`[newsletter] Błąd Resend: ${data}`);
                res.status(500).json({ error: "Błąd wysyłania emaila." });
            }
        });
    });

    request.on("error", (err) => {
        console.error(`[newsletter] Błąd sieci: ${err.message}`);
        res.status(500).json({ error: "Błąd połączenia z serwisem email." });
    });

    request.write(body);
    request.end();

});

//NARZĘDZIA 
// GET /clear-users — usuwa wszystkich użytkowników z tabeli users
app.get("/clear-users", (req, res) => {
    db.run("DELETE FROM users");
    res.send("Users usunięci");
});

//START
app.listen(PORT, () => {
    console.log(`Serwer działa na http://localhost:${PORT}`);
});
