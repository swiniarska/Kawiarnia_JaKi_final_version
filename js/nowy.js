'use strict';

// dane stolików — id, pojemność, etykieta, lokalizacja
const TABLES = [
  {id:1, capacity:2, label:'Stolik 1', desc:'Przy oknie'},
  {id:2, capacity:2, label:'Stolik 2', desc:'Przy oknie'},
  {id:3, capacity:2, label:'Stolik 3', desc:'Centralny'},
  {id:4, capacity:4, label:'Stolik 4', desc:'Narożny'},
  {id:5, capacity:4, label:'Stolik 5', desc:'Przy ścianie'},
];

// dostępne godziny rezerwacji
const HOURS = ['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];
// wszystkie godziny do kalendarza (8:00–21:00)
const ALL_HOURS = Array.from({length:14}, (_,i) => `${(8+i).toString().padStart(2,'0')}:00`);
const TODAY = new Date().toISOString().split('T')[0];

// etykiety i style kolorów dla statusów rezerwacji
const STATUS_LABEL = {pending:'Oczekująca', confirmed:'Potwierdzona', completed:'Zakończona', cancelled:'Anulowana'};
const STATUS_STYLE = {
  pending:   'background:#FEF3C7;color:#92400E',
  confirmed: 'background:#D1FAE5;color:#065F46',
  completed: 'background:#E0E7FF;color:#3730A3',
  cancelled: 'background:#FEE2E2;color:#991B1B',
};

// dane menu 
const MENU = {
  coffee: [
    {id:'esp',  name:'Espresso',    desc:'Intensywna, parzona pod ciśnieniem, złota crema',           price:16.00},
    {id:'fw',   name:'Flat White',  desc:'Podwójne espresso z delikatnie spienionego mleka',           price:18.00},
    {id:'cap',  name:'Cappuccino',  desc:'Klasyczne proporcje, aksamitna piana',                       price:24.00},
    {id:'lat',  name:'Latte',       desc:'Espresso z dużą ilością gorącego, spienionego mleka',        price:22.00},
  ],
  tea: [
    {id:'earl', name:'Earl Grey',          desc:'Herbata czarna z aromatem bergamotki',               price:15.00},
    {id:'jas',  name:'Herbata jaśminowa',  desc:'Aromatyzowana aromatem kwiatu jaśminu',               price:17.50},
    {id:'sen',  name:'Sencha',             desc:'Japońska zielona herbata',                            price:17.50},
  ],
  matcha: [
    {id:'mlat', name:'Matcha Latte',       desc:'Ceremonialna matcha z mlekiem owsianym lub pełnym',  price:24.00},
    {id:'smat', name:'Truskawkowa Matcha', desc:'Puree truskawkowe, matcha i zimne mleko',            price:26.50},
    {id:'imat', name:'Matcha na zimno',    desc:'Matcha z lodem i wybranym mlekiem',                  price:25.50},
  ],
  desserts: [
    {id:'chk',  name:'Sernik',     desc:'Nowojorski z ciastem Biscoff i kompotem jagodowym',          price:29.00},
    {id:'tir',  name:'Tiramisu',   desc:'Savoiardi w espresso z kremem mascarpone',                   price:30.50},
    {id:'cro',  name:'Croissant',  desc:'Maślane, pieczone codziennie — zwykłe lub migdałowe',        price:22.00},
    {id:'brn',  name:'Brownie',    desc:'Z gorzkiej czekolady, gęste i delikatnie ciepłe',            price:28.50},
  ],
};

// lista alergenów do zaznaczenia 
const ALLERGENS = [
  {id:'gluten',    label:'Gluten'},    {id:'lactose',   label:'Laktoza'},   {id:'nuts',     label:'Orzechy'},
  {id:'eggs',      label:'Jaja'},      {id:'soy',       label:'Soja'},      {id:'mustard',  label:'Gorczyca'},
  {id:'celery',    label:'Seler'},     {id:'sulphites', label:'Siarczyny'}, {id:'shellfish',label:'Skorupiaki'},
];

// koszyk — ilości wybranych pozycji menu (id → liczba)
const cart = Object.values(MENU).flat().reduce((acc, i) => { acc[i.id] = 0; return acc; }, {});
// zbiór zaznaczonych alergenów
const selAllergens = new Set();

let reservations  = [];
let selectedHour  = '12:00';
let calDate       = TODAY;
let statusFilter  = 'all';
let adminTab      = 'reservations';
let adminAuthed   = false;

// szuka wolnego stolika pasującego do liczby gości, daty i godziny
function findTable(size, date, time) {
  const cap   = size <= 2 ? 2 : 4;
  const taken = reservations
    .filter(r => r.reservation_date === date && r.reservation_time === time && r.status !== 'cancelled')
    .map(r => r.table_id);
  return TABLES.find(t => t.capacity === cap && !taken.includes(t.id)) || null;
}

// generuje kolorowy badge ze statusem rezerwacji
function badge(status) {
  return `<span class="badge" style="${STATUS_STYLE[status]}">${STATUS_LABEL[status]}</span>`;
}

// powiadomienie na dole ekranu
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

// wyświetla alert w formularzu rezerwacji (error = czerwony, success = zielony)
function showAlert(type, msg) {
  const el = document.getElementById('form-alert');
  el.className = type === 'error'
    ? 'text-red-700 text-[12px] bg-red-50 border border-red-200 rounded-sm px-4 py-3 mb-6 tracking-[.03em]'
    : 'text-emerald-700 text-[12px] bg-emerald-50 border border-emerald-200 rounded-sm px-4 py-3 mb-6 tracking-[.03em]';
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideAlert() { document.getElementById('form-alert').classList.add('hidden'); }

// pobiera wszystkie rezerwacje z serwera i odświeża widoki
async function loadReservations() {
  try {
    const res = await fetch('http://localhost:3000/api/reservations');
    reservations = await res.json();
    renderCalendar();
    if (adminAuthed) renderAdminContent();
  } catch(e) {
    console.error('Błąd pobierania rezerwacji:', e);
  }
}

// inicjalizuje całą stronę po załadowaniu
function init() {
  document.getElementById('f-date').value = TODAY;
  document.getElementById('f-date').min   = TODAY;
  document.getElementById('cal-date').value = TODAY;

  renderHours();
  renderLegend();
  renderCalendar();
  renderMenu();
  renderAllergens();
  updateSummary();
  loadReservations();

  // zakładki nawigacji (Rezerwacja / Kalendarz / Admin)
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + btn.dataset.view).classList.add('active');
      if (btn.dataset.view === 'calendar') renderCalendar();
      if (btn.dataset.view === 'admin' && adminAuthed) renderAdminContent();
    });
  });

  document.getElementById('cal-date').addEventListener('change', e => {
    calDate = e.target.value;
    renderCalendar();
  });

  document.getElementById('f-date').addEventListener('change', updateVisitRecap);
  document.getElementById('f-size').addEventListener('change', updateVisitRecap);
  document.getElementById('btn-submit').addEventListener('click', submitForm);

  // panel admina
  document.getElementById('btn-login').addEventListener('click', adminLogin);
  document.getElementById('adm-pass').addEventListener('keydown', e => { if(e.key==='Enter') adminLogin(); });
  document.getElementById('btn-logout').addEventListener('click', () => {
    adminAuthed = false;
    document.getElementById('admin-login').style.display = 'block';
    document.getElementById('admin-panel').classList.add('hidden');
  });

  // zakładki menu (Kawa / Herbata / Matcha / Deser)
  document.querySelectorAll('.ctab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.ctab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.menu-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.querySelector(`[data-panel="${tab.dataset.cat}"]`).classList.remove('hidden');
    });
  });
}

// renderuje przyciski godzin w sidebarze
function renderHours() {
  const wrap = document.getElementById('hours-wrap');
  wrap.innerHTML = HOURS.map(h =>
    `<button class="hour-pill ${selectedHour===h?'selected':''}" data-hour="${h}">${h}</button>`
  ).join('');
  wrap.querySelectorAll('.hour-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedHour = btn.dataset.hour;
      renderHours();
      updateVisitRecap();
    });
  });
}

// renderuje legendę stolików na dole sidebara
function renderLegend() {
  document.getElementById('table-legend').innerHTML = TABLES.map(t =>
    `<div class="px-3 py-2 rounded-sm text-center border" style="${t.capacity===2
      ? 'background:rgba(247,231,206,.1);border-color:rgba(247,231,206,.15)'
      : 'background:rgba(201,169,110,.1);border-color:rgba(201,169,110,.2)'}">
       <div class="text-[10px] font-light tracking-[.08em] text-cream/80">${t.label}</div>
       <div class="text-[9px] text-cream/40">${t.capacity} os. · ${t.desc}</div>
     </div>`
  ).join('');
}

// obsługuje wysyłanie formularza rezerwacji do serwera
function submitForm() {
  hideAlert();
  const name        = document.getElementById('f-name').value.trim();
  const phone       = document.getElementById('f-phone').value.trim();
  const size        = parseInt(document.getElementById('f-size').value);
  const date        = document.getElementById('f-date').value;
  const time        = selectedHour;
  const specialNotes = document.getElementById('f-notes').value.trim();

  if (!name || !phone || !date) {
    showAlert('error', 'Wypełnij wszystkie wymagane pola: imię, telefon i datę.');
    return;
  }

  const btn = document.getElementById('btn-submit');
  const lbl = document.getElementById('submit-label');
  btn.disabled = true;
  lbl.textContent = 'Rezerwuję…';
  btn.querySelector('.spin').style.display = 'block';

  setTimeout(() => {
    const table = findTable(size, date, time);
    if (!table) {
      showAlert('error', 'Brak dostępnych stolików na wybrany termin. Wybierz inną godzinę lub datę.');
      btn.disabled = false;
      lbl.textContent = 'Zarezerwuj stolik';
      btn.querySelector('.spin').style.display = 'none';
      return;
    }

    // łączy menu + alergeny + uwagi w jedno pole notes zapisywane w bazie
    const menuItems = Object.values(MENU).flat()
      .filter(i => cart[i.id] > 0)
      .map(i => `${i.name} ×${cart[i.id]}`)
      .join(', ');
    const allergenList   = ALLERGENS.filter(a => selAllergens.has(a.id)).map(a => a.label).join(', ');
    const allergenCustom = document.getElementById('u-allergen-custom').value.trim();
    const customOrder    = document.getElementById('u-custom').value.trim();

    let notesField = '';
    if (menuItems)                      notesField += `Zamówienie: ${menuItems}. `;
    if (customOrder)                    notesField += `Dodatkowe: ${customOrder}. `;
    if (allergenList || allergenCustom) notesField += `Alergeny: ${[allergenList, allergenCustom].filter(Boolean).join(', ')}. `;
    if (specialNotes)                   notesField += specialNotes;

    fetch('http://localhost:3000/api/reservations', {
      method:  'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        customer_name:    name,
        customer_phone:   phone,
        party_size:       size,
        reservation_date: date,
        reservation_time: time,
        notes:            notesField.trim(),
        table_id:         table.id,
        status:           'confirmed',
      }),
    })
    .then(r => r.json())
    .then(() => {
      showAlert('success', `✦ Rezerwacja potwierdzona — ${table.label}, ${date} o ${time}.`);
      toast(`Stolik zarezerwowany ✦ Do zobaczenia ${date}`);
      loadReservations();
      // reset formularza po sukcesie
      document.getElementById('f-name').value  = '';
      document.getElementById('f-phone').value = '';
      document.getElementById('f-notes').value = '';
      document.getElementById('u-custom').value = '';
      document.getElementById('u-allergen-custom').value = '';
      Object.keys(cart).forEach(k => cart[k] = 0);
      selAllergens.clear();
      renderMenu();
      renderAllergens();
      updateSummary();
    })
    .catch(() => {
      showAlert('error', 'Błąd połączenia z bazą danych. Sprawdź czy serwer jest uruchomiony.');
    })
    .finally(() => {
      btn.disabled = false;
      lbl.textContent = 'Zarezerwuj stolik';
      btn.querySelector('.spin').style.display = 'none';
    });

  }, 600);
}

// aktualizuje podsumowanie wizyty w sticky panelu po prawej
function updateVisitRecap() {
  const date = document.getElementById('f-date').value;
  const size = document.getElementById('f-size').value;
  document.getElementById('s-date').textContent =
    date ? new Date(date).toLocaleDateString('pl-PL',{day:'numeric',month:'long',year:'numeric'}) : '—';
  document.getElementById('s-time').textContent   = selectedHour || '—';
  document.getElementById('s-guests').textContent = size ? size + (size==='1' ? ' osoba' : ' osoby') : '—';
}

// renderuje karty pozycji menu z przyciskami ilości
function renderMenu() {
  Object.entries(MENU).forEach(([cat, items]) => {
    document.getElementById('items-' + cat).innerHTML = items.map(item => `
      <div class="card" data-id="${item.id}" onclick="toggleItem('${item.id}')">
        <div class="chk" id="chk-${item.id}"></div>
        <div class="flex-1 min-w-0">
          <div class="text-[14px] font-light text-green leading-tight">${item.name}</div>
          <div class="text-[11px] font-extralight text-[#6b7c6f] mt-0.5 leading-[1.6]">${item.desc}</div>
          <div class="font-display text-[15px] font-light text-green mt-1.5">${item.price.toFixed(2)} zł</div>
        </div>
        <div class="qty-wrap" id="qty-${item.id}">
          <button class="qty-btn" onclick="changeQty(event,'${item.id}',1)">+</button>
          <span class="text-[13px] font-light w-5 text-center" id="qv-${item.id}">1</span>
          <button class="qty-btn" onclick="changeQty(event,'${item.id}',-1)">−</button>
        </div>
      </div>`
    ).join('');
  });
}

// renderuje karty alergenów
function renderAllergens() {
  document.getElementById('allergen-grid').innerHTML = ALLERGENS.map(a => `
    <div class="acard" data-aid="${a.id}" onclick="toggleAllergen('${a.id}')">
      <div class="achk" id="achk-${a.id}"></div>
      <div class="text-[13px] font-light text-green">${a.label}</div>
    </div>`
  ).join('');
}

// zaznacza/odznacza pozycję menu i aktualizuje koszyk
function toggleItem(id) {
  const on = cart[id] > 0;
  cart[id] = on ? 0 : 1;
  document.querySelector(`[data-id="${id}"]`).classList.toggle('sel', !on);
  const qty = document.getElementById('qty-' + id);
  qty.classList.toggle('visible', !on);
  document.getElementById('qv-' + id).textContent = 1;
  updateSummary();
}

// zmienia ilość pozycji w koszyku (+ lub -)
function changeQty(e, id, d) {
  e.stopPropagation();
  cart[id] = Math.max(1, (cart[id] || 1) + d);
  document.getElementById('qv-' + id).textContent = cart[id];
  updateSummary();
}

// zaznacza/odznacza alergen
function toggleAllergen(id) {
  selAllergens.has(id) ? selAllergens.delete(id) : selAllergens.add(id);
  document.querySelector(`[data-aid="${id}"]`).classList.toggle('sel', selAllergens.has(id));
  updateAllergenRecap();
}

// aktualizuje sekcję alergenów w podsumowaniu
function updateAllergenRecap() {
  const labels = ALLERGENS.filter(a => selAllergens.has(a.id)).map(a => a.label).join(', ');
  const wrap   = document.getElementById('s-allerg-wrap');
  wrap.classList.toggle('hidden', !labels);
  document.getElementById('s-allerg').textContent = labels;
}

// aktualizuje sticky podsumowanie zamówienia (lista + suma)
function updateSummary() {
  const all      = Object.values(MENU).flat();
  const selected = all.filter(i => cart[i.id] > 0);

  document.getElementById('s-empty').classList.toggle('hidden', selected.length > 0);
  document.getElementById('s-list').classList.toggle('hidden',  selected.length === 0);
  document.getElementById('s-total').classList.toggle('hidden', selected.length === 0);

  document.getElementById('s-list').innerHTML = selected.map(i => `
    <div class="srow">
      <div class="font-light text-green">${i.name}${cart[i.id]>1?` <span class="text-[11px] text-[#6b7c6f]">×${cart[i.id]}</span>`:''}</div>
      <span class="font-display text-[15px]">${(i.price * cart[i.id]).toFixed(2)} zł</span>
    </div>`
  ).join('');

  const total = selected.reduce((sum, i) => sum + i.price * cart[i.id], 0);
  document.getElementById('s-price').textContent = `${total.toFixed(2)} zł`;
}

// kolory komórek kalendarza dla każdego stolika
const CAL_COLORS = ['#FEF9C3','#DCFCE7','#DBEAFE','#FCE7F3','#F3E8FF'];

// renderuje tabelę kalendarza dla wybranej daty
function renderCalendar() {
  const res  = reservations.filter(r => r.reservation_date === calDate && r.status !== 'cancelled');
  const meta = document.getElementById('cal-meta');
  if (meta) {
    const guests = res.reduce((a, r) => a + r.party_size, 0);
    meta.textContent = `${res.length} rezerwacji · ${guests} gości`;
  }

  const headers = TABLES.map(t =>
    `<th>${t.label}<br><span style="color:#9ca3af;font-weight:400;font-size:10px">${t.capacity} os.</span></th>`
  ).join('');

  const rows = ALL_HOURS.slice(1).map(hour => {
    const cells = TABLES.map((t, ti) => {
      const r  = res.find(x => x.table_id === t.id && x.reservation_time === hour);
      const bg = r ? CAL_COLORS[ti] : '#fff';
      return `<td style="background:${bg}">
        ${r ? `<div class="cal-entry">
          <div class="en">${r.customer_name.split(' ')[0]}</div>
          <div class="ep">${r.party_size} os.</div>
          ${r.notes ? `<div class="enotes">${r.notes.slice(0,20)}</div>` : ''}
        </div>` : ''}
      </td>`;
    }).join('');
    return `<tr><td class="hour-cell">${hour}</td>${cells}</tr>`;
  }).join('');

  document.getElementById('cal-table').innerHTML =
    `<thead><tr><th style="width:56px;color:#6b7280;font-weight:600">Godz.</th>${headers}</tr></thead><tbody>${rows}</tbody>`;
}

// sprawdza dane logowania admina (email + hasło)
function adminLogin() {
  const email = document.getElementById('adm-email').value;
  const pass  = document.getElementById('adm-pass').value;
  if (email === 'admin@cafe.pl' && pass === 'admin123') {
    adminAuthed = true;
    document.getElementById('login-err').classList.add('hidden');
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-panel').classList.remove('hidden');
    renderAdminContent();
  } else {
    document.getElementById('login-err').classList.remove('hidden');
  }
}

// renderuje zawartość aktywnej zakładki panelu admina
function renderAdminContent() {
  document.querySelectorAll('.adm-tab').forEach(btn => {
    const isActive = btn.dataset.atab === adminTab;
    btn.className = isActive
      ? 'adm-tab px-4 py-2 rounded-sm text-[10px] tracking-[.1em] uppercase font-light active bg-green text-cream'
      : 'adm-tab px-4 py-2 rounded-sm text-[10px] tracking-[.1em] uppercase font-light text-[#6b7c6f] hover:bg-green/5';
    btn.onclick = () => { adminTab = btn.dataset.atab; renderAdminContent(); };
  });

  const el = document.getElementById('adm-content');
  if (adminTab === 'reservations') el.innerHTML = renderResTab();
  else if (adminTab === 'stats')   el.innerHTML = renderStatsTab();
  else                             el.innerHTML = renderCustTab();

  bindAdminEvents();
}

// generuje HTML zakładki Rezerwacje z filtrami i kartami
function renderResTab() {
  const filters = ['all','pending','confirmed','completed','cancelled'];
  const labels  = {all:'Wszystkie', pending:'Oczekujące', confirmed:'Potwierdzone', completed:'Zakończone', cancelled:'Anulowane'};

  const fHtml = filters.map(s =>
    `<button class="sf ${statusFilter===s?'active':''}" data-sf="${s}">${labels[s]}</button>`
  ).join('');

  const list  = statusFilter === 'all' ? reservations : reservations.filter(r => r.status === statusFilter);

  const cards = list.map(r => {
    const t = TABLES.find(x => x.id === r.table_id) || {label:'?'};
    const statusBtns = [
      {st:'confirmed', label:'Potwierdź', style:'background:#F0FDF4;color:#15803D;border:1px solid #BBF7D0'},
      {st:'completed', label:'Zakończ',   style:'background:#EEF2FF;color:#3730A3;border:1px solid #C7D2FE'},
      {st:'cancelled', label:'Anuluj',    style:'background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA'},
    ];
    const btns = statusBtns
      .filter(b => b.st !== r.status)
      .map(b => `<button class="adm-action-btn adm-action" style="${b.style}" data-rid="${r.id}" data-st="${b.st}">${b.label}</button>`);
    btns.push(`<button class="adm-action-btn adm-del" style="background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb" data-rid="${r.id}">Usuń</button>`);

    return `<div class="res-card">
      <div style="flex:1;min-width:180px">
        <div style="font-weight:600;font-size:14px;color:#102C26;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${r.customer_name} ${badge(r.status)}
        </div>
        <div style="font-size:12px;color:#6b7280;line-height:2.2">
          <span style="color:#102C26;font-weight:500">Numer telefonu:</span> ${r.customer_phone}<br>
          <span style="color:#102C26;font-weight:500">Termin:</span> ${r.reservation_date} o ${r.reservation_time}<br>
          <span style="color:#102C26;font-weight:500">Stolik:</span> ${t.label} · ${r.party_size} os.
          ${r.notes ? `<br><span style="color:#102C26;font-weight:500">Notatka:</span> ${r.notes.slice(0,80)}${r.notes.length>80?'…':''}` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start">${btns.join('')}</div>
    </div>`;
  }).join('') || `<div class="text-center text-[#9ca3af] py-10 text-sm">Brak rezerwacji do wyświetlenia.</div>`;

  return `<div class="flex gap-2 flex-wrap mb-5">${fHtml}</div>
          <div class="flex flex-col gap-3">${cards}</div>`;
}

// generuje HTML zakładki Statystyki
function renderStatsTab() {
  const tod  = reservations.filter(r => r.reservation_date === TODAY);
  const all  = reservations;
  const stats = [
    {val: tod.filter(r=>r.status!=='cancelled').length,                          label:'Dzisiaj'},
    {val: tod.filter(r=>r.status!=='cancelled').reduce((a,r)=>a+r.party_size,0), label:'Goście dziś'},
    {val: all.filter(r=>r.status==='confirmed').length,                           label:'Potwierdzone'},
    {val: all.filter(r=>r.status==='cancelled').length,                           label:'Anulowane'},
  ];

  const cards = stats.map(s => `
    <div class="text-center p-5 border border-green/8 rounded-sm" style="background:#fafaf9">
      <div class="font-display text-[40px] font-light text-green mt-1">${s.val}</div>
      <div style="font-size:11px;color:#9ca3af;margin-top:4px;letter-spacing:.08em;text-transform:uppercase">${s.label}</div>
    </div>`
  ).join('');

  const maxR = Math.max(...TABLES.map(t => all.filter(r=>r.table_id===t.id&&r.status!=='cancelled').length), 1);
  const bars = TABLES.map(t => {
    const c   = all.filter(r => r.table_id===t.id && r.status!=='cancelled').length;
    const pct = Math.round((c / maxR) * 100);
    return `<div style="margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:13px">
        <span>${t.label} (${t.capacity} os.)</span><strong>${c} rez.</strong>
      </div>
      <div style="background:#f3f4f6;border-radius:999px;height:8px">
        <div style="background:#102C26;height:100%;border-radius:999px;width:${pct}%;transition:width .4s"></div>
      </div>
    </div>`;
  }).join('');

  return `<div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">${cards}</div>
          <h3 style="font-size:13px;font-weight:600;margin-bottom:14px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280">Obłożenie stolików</h3>${bars}`;
}

// generuje HTML zakładki Klienci
function renderCustTab() {
  const byPhone = {};
  reservations.filter(r => r.status !== 'cancelled').forEach(r => {
    if (!byPhone[r.customer_phone])
      byPhone[r.customer_phone] = {name:r.customer_name, phone:r.customer_phone, visits:0, last:r.reservation_date};
    byPhone[r.customer_phone].visits++;
    if (r.reservation_date > byPhone[r.customer_phone].last)
      byPhone[r.customer_phone].last = r.reservation_date;
  });

  const sorted = Object.values(byPhone).sort((a, b) => b.visits - a.visits);
  const cards  = sorted.map(c => `
    <div class="bg-white border border-green/8 rounded-sm px-5 py-4 flex justify-between items-center flex-wrap gap-3">
      <div>
        <div style="font-weight:600;font-size:14px;color:#102C26">${c.name}</div>
        <div style="font-size:12px;color:#9ca3af">${c.phone} · ostatnia wizyta: ${c.last}</div>
      </div>
      <span class="badge" style="background:#FEF9C3;color:#92400E">${c.visits} ${c.visits===1?'wizyta':'wizyty'}</span>
    </div>`
  ).join('') || `<div class="text-center text-[#9ca3af] py-10 text-sm">Brak danych o klientach.</div>`;

  return `<div class="flex flex-col gap-3">${cards}</div>`;
}

// podpina zdarzenia do przycisków akcji w panelu admina
function bindAdminEvents() {
  document.querySelectorAll('.sf').forEach(btn => {
    btn.addEventListener('click', () => { statusFilter = btn.dataset.sf; renderAdminContent(); });
  });
  document.querySelectorAll('.adm-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const {rid, st} = btn.dataset;
      btn.disabled = true;
      try {
        await fetch(`http://localhost:3000/api/reservations/${rid}`, {
          method:  'PATCH',
          headers: {'Content-Type':'application/json'},
          body:    JSON.stringify({status: st}),
        });
        await loadReservations();
      } catch(e) {
        toast('Błąd połączenia z serwerem.');
        btn.disabled = false;
      }
    });
  });
  document.querySelectorAll('.adm-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Usunąć tę rezerwację z bazy danych?')) return;
      btn.disabled = true;
      try {
        await fetch(`http://localhost:3000/api/reservations/${btn.dataset.rid}`, {
          method: 'DELETE',
        });
        await loadReservations();
      } catch(e) {
        toast('Błąd połączenia z serwerem.');
        btn.disabled = false;
      }
    });
  });
}

// sprawdza sesję — jeśli brak, przekierowuje do logowanie.html
function sprawdzSesje() {
  const sesja = JSON.parse(localStorage.getItem('cafe_konto_sesja') || 'null');
  if (!sesja) {
    window.location.href = 'logowanie.html';
    return false;
  }
  document.getElementById('nav-user-name').textContent = sesja.imie + ' ' + sesja.nazwisko;
  return true;
}

// punkt startowy — sprawdza sesję i inicjalizuje stronę
document.addEventListener('DOMContentLoaded', () => {
  if (!sprawdzSesje()) return;

  document.getElementById('btn-nav-logout').addEventListener('click', () => {
    localStorage.removeItem('cafe_konto_sesja');
    window.location.href = 'logowanie.html';
  });

  init();
});
