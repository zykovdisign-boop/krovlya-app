/* Мини-приложение «Щит без ошибок» */
(function () {
  const C = window.ShieldCore;
  const CFG = window.APP_CONFIG || {};
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  const $ = (s, el = document) => el.querySelector(s);
  const f0 = (v) => Math.round(v).toLocaleString("ru-RU");
  const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString("ru-RU");
  const sq = (s) => String(s).replace(".", ",");
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (tg) { tg.ready(); tg.expand(); }

  /* ---------- хранилище: облако Telegram или localStorage ---------- */
  const cloud = tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") ? tg.CloudStorage : null;
  const store = {
    get: (k) => new Promise((res) => { if (cloud) cloud.getItem(k, (e, v) => res(e ? null : v || null)); else { try { res(localStorage.getItem(k)); } catch (_) { res(null); } } }),
    set: (k, v) => new Promise((res) => { if (cloud) cloud.setItem(k, v, () => res()); else { try { localStorage.setItem(k, v); } catch (_) {} res(); } }),
  };
  const uid = () => Math.random().toString(36).slice(2, 9);
  const defaultRooms = () => [["kitchen", "Кухня"], ["bath", "Ванная"], ["hall", "Коридор"], ["room", "Комната 1"], ["room", "Комната 2"]].map(([t, n]) => C.newRoom(t, n, "r" + uid()));
  const newProject = (name = "Квартира") => ({
    id: "p" + uid(), name, mode: "simple", kind: "flat", phases: 1, power: 11, rcdMode: "rcd", relay: true, fireRcd: true, spd: false, meter: false,
    rooms: defaultRooms(), lines: [],
  });
  const linesOf = (p) => (p.mode === "expert" ? p.lines : C.fromRooms(C.applyPlan(p)));
  const S = { projects: [], cur: null, tab: "object", roomView: "list", paid: false, until: null, plans: null };
  const P = () => S.projects.find((p) => p.id === S.cur) || S.projects[0];
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { store.set("schit_projects", JSON.stringify(S.projects)); store.set("schit_current", S.cur || ""); }, 300); };
  const calc = () => { const p = P(); return C.shield(Object.assign({}, p, { lines: linesOf(p) })); };

  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2600); }
  const haptic = () => tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred("light");
  /* ---------- бот на Apps Script: доступ, оплата, коды ---------- */
  async function api(action, payload = {}) {
    if (!CFG.API_URL) throw new Error("no-api");
    const r = await fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(Object.assign({ action, initData: tg ? tg.initData : "" }, payload)) });
    return r.json();
  }
  const untilStr = () => new Date(S.until).toLocaleDateString("ru-RU");
  async function checkAccess() {
    if (!CFG.API_URL) {
      let demo = null; try { demo = localStorage.getItem("demoPaid"); } catch (_) {}
      S.paid = new URLSearchParams(location.search).get("paid") === "1" || demo === "1";
    } else {
      try { const r = await api("access"); S.paid = !!r.paid; S.until = r.until || null; if (r.plans) S.plans = r.plans; } catch (_) { /* оставляем как было */ }
    }
    const b = $("#accessBadge");
    b.textContent = S.paid ? (S.until ? "до " + new Date(S.until).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "полный доступ") : "бесплатно";
    b.classList.toggle("paid", S.paid);
  }
  const plansList = () => (CFG.PLANS || []).map((pl) => { const srv = (S.plans || []).find((q) => q.k === pl.k); return Object.assign({}, pl, srv ? { stars: srv.stars } : {}); });
  const plansHtml = () => plansList().map((pl) => `<button type="button" class="plan${pl.k === "year" ? " best" : ""}" data-plan="${pl.k}">
      <span class="plan-n">${pl.t}<small>${pl.note}</small></span><span class="plan-p">${f0(pl.rub)} ₽<small>${f0(pl.stars)} ⭐</small></span></button>`).join("");
  async function buy(plan) {
    if (!CFG.API_URL || !tg) return toast("Оплата работает внутри Telegram после подключения бота");
    try {
      const r = await api("invoice", { plan });
      if (!r.link) return toast(r.error || "Не удалось открыть оплату");
      tg.openInvoice(r.link, (status) => { if (status === "paid") { toast("Оплата прошла, открываю доступ…"); setTimeout(async () => { await checkAccess(); render(false); }, 1500); } });
    } catch (_) { toast("Не удалось открыть оплату. Попробуйте позже."); }
  }
  async function redeem(code) {
    code = String(code || "").trim().toUpperCase();
    if (!code) return toast("Введите код");
    if (!CFG.API_URL) return toast("Коды работают после подключения бота");
    try {
      const r = await api("redeem", { code });
      if (r.paid) { await checkAccess(); toast(S.until ? "Код принят, доступ до " + untilStr() : "Код принят, доступ открыт"); render(false); document.querySelectorAll(".sheet-bg").forEach((x) => x.remove()); }
      else toast(r.error || "Код не подошёл");
    } catch (_) { toast("Не удалось проверить код"); }
  }
  const lockHtml = (t, d) => `<div class="lock"><b>${t}</b><span>${d}</span><button class="btn" data-act="buy" type="button">Открыть полный доступ</button></div>`;
  const seg = (key, opts, val) => `<div class="seg">${opts.map(([v, t]) => `<button type="button" data-set="${key}:${v}" class="${String(val) === String(v) ? "on" : ""}">${t}</button>`).join("")}</div>`;
  const tgl = (key, label, hint, val) => `<label class="tgl"><input type="checkbox" data-flag="${key}" ${val ? "checked" : ""}><span>${label}${hint ? `<small>${hint}</small>` : ""}</span></label>`;

  /* ---------- вкладка: объект ---------- */
  function viewObject() {
    const p = P();
    const simple = p.mode !== "expert";
    $("#view").innerHTML = `<h2>Объект</h2>
      <div class="card"><h3>Режим</h3>
        ${seg("mode", [["simple", "Простой"], ["expert", "Эксперт"]], simple ? "simple" : "expert")}
        <p class="note" style="margin-top:0">${simple ? "Укажите комнаты и отметьте приборы — линии, автоматы и кабель приложение подберёт само." : "Линии, автоматы, кабель и защиту можно править вручную."}</p></div>
      <div class="card"><h3>Что подключаем</h3>
        ${seg("kind", [["flat", "Квартира"], ["house", "Частный дом"]], p.kind)}
        ${seg("phases", [[1, "1 фаза, 230 В"], [3, "3 фазы, 400 В"]], p.phases)}
        <div class="grid">
          <label class="f">Название<input data-k="name" type="text" value="${esc(p.name)}"></label>
          <label class="f">Выделенная мощность, кВт<input data-k="power" type="number" inputmode="decimal" value="${p.power}"></label>
        </div></div>
      ${simple ? "" : `<div class="card"><h3>Защита</h3>
        ${seg("rcdMode", [["rcd", "УЗО на группу"], ["diff", "Дифавтомат на линию"]], p.rcdMode)}
        ${tgl("relay", "Реле напряжения", "защищает технику от скачков и обрыва нуля", p.relay)}
        ${p.kind === "house" ? tgl("fireRcd", "Противопожарное УЗО 100 мА на вводе", "для частного дома", p.fireRcd) : ""}
        ${tgl("spd", "УЗИП", "если дом питается от воздушной линии", p.spd)}
        ${tgl("meter", "Счётчик в этом щите", "", p.meter)}
      </div>`}
      <div class="card" id="objOut"></div>
      <div class="card"><h3>Доступ</h3>${accessHtml()}</div>
      <p class="note" style="margin:0 4px 16px">Приложение помогает рассчитать и собрать щит. Подключение, проверку и сдачу выполняет электрик с допуском, по ПУЭ и инструкциям производителей аппаратов.</p>
      ${!CFG.API_URL ? `<div class="card"><h3>Демо-режим</h3><button class="btn ghost" data-act="demo" type="button">${S.paid ? "Выключить" : "Включить"} полный доступ</button></div>` : ""}`;
    objOut();
  }
  function objOut() {
    const r = calc();
    $("#objOut").innerHTML = `<h3>Итог</h3><div class="res">
        <span class="k">Вводной автомат</span><span class="v big">${r.phases === 3 ? "3P" : "2P"} C${r.inA}</span>
        <span class="k">Подключено линий</span><span class="v">${r.lines.length}</span>
        <span class="k">Сумма мощностей</span><span class="v">${f1(r.total / 1000)} кВт</span>
        <span class="k">Расчётная нагрузка (× ${sq(r.ks)})</span><span class="v">${f1(r.calc)} кВт</span>
        <span class="k">Бокс</span><span class="v">${r.box.modules} ${plural(r.box.modules, "модуль", "модуля", "модулей")}</span>
      </div>
      ${r.phases === 3 ? `<div class="loadbar">${r.load.map((w, i) => `<div><span class="ph ph${i + 1}">L${i + 1}</span><b>${f1(w / 1000)} кВт</b></div>`).join("")}</div>` : ""}
      ${r.warnings.map((w) => `<div class="warn">${w}</div>`).join("")}`;
  }

  /* ---------- вкладка: линии ---------- */
  function viewLines() {
    if (P().mode !== "expert") return viewRooms();
    $("#view").innerHTML = `<h2>Линии</h2><div id="lnList"></div>
      <button class="btn" data-act="addLine" type="button">+ Добавить линию</button>
      <p class="note" style="margin:10px 4px 16px">Автомат и кабель подбираются сами: по мощности, по длине (падение напряжения не больше 3 %) и по типу линии. Медь, скрытая проводка.</p>`;
    linesOut();
  }
  function linesOut() {
    const r = calc();
    const num = new Map(r.mods.filter((m) => m.n).map((m) => [m.line.id, m.n]));
    $("#lnList").innerHTML = r.lines.map((l) => `<div class="ln" data-id="${l.id}">
        <div class="ln-head"><span class="ln-n">${num.get(l.id) || ""}</span><input class="ln-name" data-lk="name" value="${esc(l.name)}" aria-label="Название линии">
          ${r.phases === 3 ? `<span class="ph ph${l.phase}">L${l.phase}</span>` : ""}<button class="ln-del" data-del="${l.id}" type="button" aria-label="Удалить линию">×</button></div>
        <div class="grid">
          <label class="f">Мощность, Вт<input data-lk="p" type="number" inputmode="numeric" value="${l.p}"></label>
          <label class="f">Длина кабеля, м<input data-lk="len" type="number" inputmode="numeric" value="${l.len}"></label>
        </div>
        <div class="ln-res" data-res="${l.id}">${lineChips(l, r)}</div>
        <label class="tgl"><input type="checkbox" data-lrcd ${l.rcd ? "checked" : ""}><span>Защита УЗО 30 мА</span></label>
        ${l.warnings.map((w) => `<div class="warn">${w}</div>`).join("")}
      </div>`).join("") || `<div class="card"><p class="note" style="margin:0">Линий пока нет. Добавьте свет, розетки и мощные приборы.</p></div>`;
  }
  const lineChips = (l, r) => `<span class="chip">Автомат <b>C${l.A}</b></span><span class="chip">Кабель <b>3×${sq(l.S)}</b></span>
    <span class="chip ${l.drop > 3 ? "bad" : ""}">ΔU <b>${sq(l.drop.toFixed(1))} %</b></span><span class="chip">Ток <b>${sq(l.I.toFixed(1))} А</b></span>
    ${l.rcd ? `<span class="chip rcd">${r.mode === "diff" ? "дифавтомат" : "УЗО"} 30 мА</span>` : ""}`;
  function addLineSheet() {
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>Какую линию добавить</h3><div class="presets">${Object.entries(C.PRESETS).map(([k, v]) =>
      `<button type="button" data-preset="${k}">${v.t}<small>${f1(v.p / 1000)} кВт · ${v.minA} А</small></button>`).join("")}</div></div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-preset]");
      if (b) { P().lines.push({ id: uid(), type: b.dataset.preset }); save(); bg.remove(); render(); window.scrollTo(0, document.body.scrollHeight); haptic(); return; }
      if (e.target === bg) bg.remove();
    });
  }

  /* ---------- простой режим: комнаты ---------- */
  const ROOM_ADD = [["kitchen", "Кухня"], ["bath", "Ванная"], ["hall", "Коридор"], ["outdoor", "Улица / гараж"], ["boilerRoom", "Котельная"]];
  const roomSeg = () => `<div class="seg"><button type="button" data-rv="list" class="${S.roomView === "list" ? "on" : ""}">Список</button><button type="button" data-rv="plan" class="${S.roomView === "plan" ? "on" : ""}">План дома</button></div>`;
  function viewRooms() {
    const p = P();
    if (S.roomView === "plan") return viewPlan();
    const living = p.rooms.filter((r) => r.type === "room").length;
    $("#view").innerHTML = `<h2>Комнаты</h2>${roomSeg()}
      <div class="card"><div class="stepper"><span>Жилых комнат</span>
        <button type="button" data-step="-1" aria-label="Убрать комнату">−</button><b>${living}</b><button type="button" data-step="1" aria-label="Добавить комнату">+</button></div>
        <div class="addrow">${ROOM_ADD.map(([t, n]) => `<button type="button" data-addroom="${t}">+ ${n}</button>`).join("")}</div></div>
      <div id="roomList"></div>
      <div class="card" id="roomSum"></div>
      <p class="note" style="margin:0 4px 16px">Мощность и кабель можно не знать: возьмём средние значения. «Уточнить» — если знаете точно, например мощность плиты из паспорта.</p>`;
    roomsOut();
  }
  function roomsOut() {
    const p = P(), r = calc();
    const fromPlan = Object.fromEntries(C.applyPlan(p).filter((x) => x.rect && p.plan && p.plan.on).map((x) => [x.id, x.dist]));
    $("#roomList").innerHTML = p.rooms.map((rm) => {
      const def = C.ROOMS[rm.type] || C.ROOMS.room;
      const keys = def.on.concat(def.opt).filter((k) => rm.items[k]);
      const on = keys.filter((k) => rm.items[k].on);
      return `<div class="room" data-room="${rm.id}">
        <div class="ln-head"><input class="ln-name" data-rk="name" value="${esc(rm.name)}" aria-label="Название комнаты">
          <button class="ln-del" data-delroom="${rm.id}" type="button" aria-label="Удалить комнату">×</button></div>
        <div class="appl">${keys.map((k) => `<button type="button" class="ap ${rm.items[k].on ? "on" : ""}" data-ap="${k}" aria-pressed="${rm.items[k].on}">${C.APPL[k].t}</button>`).join("")}</div>
        ${fromPlan[rm.id] !== undefined ? `<p class="from-plan">По плану до щита <b>${f1(fromPlan[rm.id])} м</b> <button type="button" data-rv="plan">изменить</button></p>`
        : `<label class="dist">До щита примерно<input data-rk="dist" type="number" inputmode="numeric" value="${rm.dist}"> м</label>`}
        ${on.length ? `<details class="more"><summary>Уточнить мощность и кабель</summary>${on.map((k) => `<div class="more-row" data-apk="${k}">
          <span>${C.APPL[k].t}</span>
          <input data-apv="p" type="number" inputmode="numeric" placeholder="${C.APPL[k].p} Вт" value="${rm.items[k].p || ""}" aria-label="Мощность, Вт">
          <select data-apv="S" aria-label="Сечение кабеля"><option value="">кабель авто</option>${[1.5, 2.5, 4, 6, 10].map((x) => `<option value="${x}" ${Number(rm.items[k].S) === x ? "selected" : ""}>${sq(x)} мм²</option>`).join("")}</select>
        </div>`).join("")}</details>` : ""}
        <div class="ln-res" data-roomres="${rm.id}">${roomChips(rm, r)}</div>
      </div>`;
    }).join("");
    roomSum(r);
  }
  function roomChips(rm, r) {
    const mine = r.lines.filter((l) => l.room === rm.name || (l.type === "light" && l.name.split(/[·,]/).map((x) => x.trim()).includes(rm.name)));
    return mine.map((l) => `<span class="chip ${l.warnings.length ? "bad" : ""}">${l.type === "light" ? "Свет" : esc(l.name.split(" · ")[0])} <b>C${l.A} · 3×${sq(l.S)}</b></span>`).join("")
      + mine.flatMap((l) => l.warnings).map((w) => `<div class="warn">${w}</div>`).join("");
  }
  function roomSum(r) {
    $("#roomSum").innerHTML = `<h3>Получилось</h3><div class="res">
        <span class="k">Линий в щите</span><span class="v">${r.lines.length}</span>
        <span class="k">Вводной автомат</span><span class="v">${r.phases === 3 ? "3P" : "2P"} C${r.inA}</span>
        <span class="k">Бокс</span><span class="v">${r.box.modules} ${plural(r.box.modules, "модуль", "модуля", "модулей")}</span></div>
      ${r.warnings.map((w) => `<div class="warn">${w}</div>`).join("")}
      <button class="btn" data-goto="shield" type="button">Посмотреть щит</button>`;
  }
  function roomRefresh(rm) {
    const r = calc(), el = $(`[data-roomres="${rm.id}"]`);
    if (el) el.innerHTML = roomChips(rm, r);
    roomSum(r);
  }

  /* ---------- план дома ---------- */
  const ROOM_FILL = { room: "#ffffff", kitchen: "#fff8e1", bath: "#e3f2fd", hall: "#f5f5f5", outdoor: "#e8f5e9", boilerRoom: "#fbe9e7" };
  const CABLE = "#ef6c00";
  const roomOn = (rm) => Object.keys(rm.items || {}).filter((k) => rm.items[k].on);

  function ensurePlan(p) {
    if (!p.plan) p.plan = { on: true, shield: null };
    C.autoLayout(p.rooms);
    if (!p.plan.shield) {
      const hall = p.rooms.find((r) => r.type === "hall" && r.rect) || p.rooms.find((r) => r.rect);
      p.plan.shield = hall ? { x: hall.rect.x, y: Math.round((hall.rect.y + hall.rect.h / 2) * 10) / 10 } : { x: 0, y: 0 };
    }
  }
  // Подпись в комнате: сколько линий и сколько кабеля до щита.
  function planRooms(p) {
    const r = calc(), dist = Object.fromEntries(C.applyPlan(Object.assign({}, p, { plan: Object.assign({}, p.plan, { on: true }) })).map((x) => [x.id, x.dist]));
    return p.rooms.filter((rm) => rm.rect).map((rm) => {
      const n = r.lines.filter((l) => l.room === rm.name || (l.type === "light" && l.name.split(/[·,]/).map((x) => x.trim()).includes(rm.name))).length;
      return { id: rm.id, name: rm.name, rect: rm.rect, fill: ROOM_FILL[rm.type] || "#fff",
        note: n ? `${n} ${plural(n, "линия", "линии", "линий")} · ${f1(dist[rm.id])} м` : "", noteColor: CABLE };
    });
  }
  function planOverlay(p) {
    return (fs, K) => p.rooms.filter((rm) => rm.rect && roomOn(rm).length).map((rm) => {
      const pts = C.routePath(rm.rect, p.plan.shield), end = pts[pts.length - 1];
      return `<polyline points="${pts.map((q) => `${q.x * K},${q.y * K}`).join(" ")}" fill="none" stroke="${CABLE}" stroke-width="${fs * 0.2}" stroke-dasharray="${fs * 0.6} ${fs * 0.3}" stroke-linejoin="round" opacity=".9"/>`
        + `<circle cx="${end.x * K}" cy="${end.y * K}" r="${fs * 0.35}" fill="${CABLE}"/>`;
    }).join("");
  }
  const shieldPoint = (p) => ({ id: "shield", label: "Щит", color: "#1a2e44",
    get x() { return p.plan.shield.x; }, set x(v) { p.plan.shield.x = v; },
    get y() { return p.plan.shield.y; }, set y(v) { p.plan.shield.y = v; } });

  function viewPlan() {
    const p = P();
    ensurePlan(p);
    save();
    $("#view").innerHTML = `<h2>Комнаты</h2>${roomSeg()}
      <div class="card">
        <div class="plan-tools">
          <button type="button" data-act="planPhoto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="3.5"/></svg>По фото плана${S.paid ? "" : " · 🔒"}</button>
          <button type="button" data-act="planReset"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8M3 3v5h5"/></svg>Разложить заново</button>
        </div>
        <label class="tgl"><input type="checkbox" data-planon ${p.plan.on ? "checked" : ""}><span>Брать длины кабеля с плана<small>путь по стенам от щита + 1 м подъёма к потолку</small></span></label>
        <div id="pe"></div>
        <p class="note">Двигайте комнаты пальцем, размер меняется за синий угол. Точку «Щит» поставьте туда, где он будет висеть.</p>
        <input type="file" id="planFile" accept="image/*" hidden>
      </div>
      <div class="card" id="roomSum"></div>`;
    PlanEditor.mount($("#pe"), {
      getRooms: () => planRooms(p),
      getPoints: () => [shieldPoint(p)],
      overlay: planOverlay(p),
      onChange: () => { save(); roomSum(calc()); },
    });
    roomSum(calc());
  }

  // Сжимает фото до 1600 px по длинной стороне: меньше трафика, распознаётся так же.
  function shrinkPhoto(file) {
    return new Promise((res, rej) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("img")); };
      img.src = url;
    });
  }
  const ask = (text) => new Promise((res) => (tg && tg.showConfirm ? tg.showConfirm(text, res) : res(window.confirm(text))));

  async function planFromPhoto(file) {
    const p = P(), btn = document.querySelector('[data-act="planPhoto"]');
    const label = btn ? btn.innerHTML : "";
    try {
      if (btn) { btn.disabled = true; btn.textContent = "Смотрю план… до минуты"; }
      const r = await api("planPhoto", { image: await shrinkPhoto(file) });
      if (!r.ok) return toast(r.error === "unknown action" ? "Распознавание заработает после обновления бота" : r.error || "Не получилось распознать");
      const rooms = C.roomsFromRecognized(r.rooms);
      if (!rooms.length) return toast("Не нашёл на фото комнат. Нужен план с размерами");
      if (!(await ask(`Нашёл ${rooms.length} ${plural(rooms.length, "помещение", "помещения", "помещений")}. Заменить ими текущие комнаты?`))) return;
      p.rooms = rooms;
      p.plan = { on: true, shield: null };
      save(); render(false);
      toast("Готово. Проверьте размеры, приборы в комнатах и место щита");
    } catch (_) {
      toast("Ошибка сети, попробуйте ещё раз");
    } finally {
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  /* ---------- рисунок щита ---------- */
  const KIND = {
    in:    { bg: "#1a2e44", fg: "#fff",    accent: "#4fc3f7", top: "ВВОД" },
    meter: { bg: "#f5f7fa", fg: "#1a2e44", accent: "#90a4ae", top: "СЧЁТЧИК" },
    relay: { bg: "#eceff4", fg: "#2c3e50", accent: "#78909c", top: "РЕЛЕ U" },
    spd:   { bg: "#ede7f6", fg: "#4a148c", accent: "#b39ddb", top: "УЗИП" },
    fire:  { bg: "#fff3e0", fg: "#bf360c", accent: "#ffab91", top: "ПУЗ" },
    rcd:   { bg: "#e3f2fd", fg: "#0d47a1", accent: "#64b5f6", top: "УЗО" },
    br:    { bg: "#ffffff", fg: "#1a2e44", accent: "#b0bec5", top: "" },
    diff:  { bg: "#e8f5e9", fg: "#1b5e20", accent: "#81c784", top: "ДИФ" },
  };
  const GROUP = ["#1565c0", "#2e7d32", "#ef6c00", "#7b1fa2", "#00796b", "#c62828", "#4e342e", "#283593"];
  function panelSvg(r) {
    const W = 1000, pad = 24, gap = 6;
    const mw = (W - 2 * pad) / r.box.perRow;
    const mh = 140, lblZone = 64, rowH = mh + lblZone + 16, topY = 24;
    const H = topY + r.rows.length * rowH + 8;
    const defs = `<defs>
      <linearGradient id="rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cdd2d8"/><stop offset=".5" stop-color="#e8ebee"/><stop offset="1" stop-color="#b8bfc6"/></linearGradient>
      <linearGradient id="toggle" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#546e7a"/><stop offset="1" stop-color="#37474f"/></linearGradient>
      <linearGradient id="toggleH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#78909c"/><stop offset="1" stop-color="#546e7a"/></linearGradient>
      <filter id="ds" x="-4%" y="-4%" width="108%" height="108%"><feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity=".08"/></filter>
    </defs>`;
    let svg = defs, grp = 0;
    r.rows.forEach((row, ri) => {
      const ry = topY + ri * rowH;
      svg += `<rect x="${pad - 6}" y="${ry + mh / 2 - 10}" width="${W - 2 * pad + 12}" height="20" rx="2" fill="url(#rail)"/>`;
      svg += `<line x1="${pad - 6}" y1="${ry + mh / 2}" x2="${W - pad + 6}" y2="${ry + mh / 2}" stroke="#a0a8b0" stroke-width=".6" stroke-dasharray="4 3"/>`;
      let x = pad;
      row.forEach((m) => {
        const w = m.w * mw - gap, k = KIND[m.kind] || KIND.br, cx = x + gap / 2 + w / 2;
        const mx = x + gap / 2, my = ry;
        if (m.kind === "rcd") grp = m.group;
        const gc = m.kind === "rcd" || (m.kind === "br" && m.line && m.line.rcd && r.mode === "rcd") ? GROUP[(grp - 1) % GROUP.length] : null;
        svg += `<rect x="${mx}" y="${my}" width="${w}" height="${mh}" rx="4" fill="${k.bg}" filter="url(#ds)"/>`;
        if (gc) svg += `<rect x="${mx}" y="${my}" width="3" height="${mh}" rx="1.5" fill="${gc}"/>`;
        svg += `<rect x="${mx}" y="${my}" width="${w}" height="${mh}" rx="4" fill="none" stroke="${gc || "#c5cdd5"}" stroke-width="${gc ? 1.8 : .8}"/>`;
        if (k.top) {
          const tfs = m.w > 2 ? 13 : m.w > 1 ? 11 : 10;
          svg += `<text x="${cx}" y="${my + 16}" font-size="${tfs}" font-weight="600" text-anchor="middle" fill="${k.fg}" letter-spacing=".8" opacity=".7">${k.top}</text>`;
        }
        const tgW = Math.min(18, w * 0.3), tgH = 32, tgX = cx - tgW / 2, tgY = my + mh / 2 - tgH / 2 + 4;
        svg += `<rect x="${tgX}" y="${tgY}" width="${tgW}" height="${tgH}" rx="2.5" fill="url(#toggle)"/>`;
        svg += `<rect x="${tgX + 1.5}" y="${tgY + 1.5}" width="${tgW - 3}" height="${tgH * 0.4}" rx="1.5" fill="url(#toggleH)"/>`;
        svg += `<line x1="${tgX}" y1="${tgY + tgH * 0.45}" x2="${tgX + tgW}" y2="${tgY + tgH * 0.45}" stroke="#263238" stroke-width=".5" opacity=".3"/>`;
        const rating = m.kind === "relay" ? "63А" : m.kind === "spd" ? "II" : m.kind === "meter" ? "" : m.kind === "br" || m.kind === "diff" ? `C${m.A}` : `${m.A}А`;
        if (rating) {
          const rfs = m.w > 1 ? 20 : 17;
          svg += `<text x="${cx}" y="${my + mh - 10}" font-size="${rfs}" font-weight="800" text-anchor="middle" fill="${k.fg}">${rating}</text>`;
        }
        const belowY = my + mh + 4;
        if (m.n) {
          svg += `<circle cx="${cx}" cy="${belowY + 12}" r="12" fill="#1a2e44"/>`;
          svg += `<text x="${cx}" y="${belowY + 16.5}" font-size="14" font-weight="700" text-anchor="middle" fill="#fff">${m.n}</text>`;
        }
        const lbl = m.line ? m.line.name : m.label || "";
        if (lbl) {
          const maxPx = w - 6, fs = m.w > 1 ? 11 : 9.5, lh = fs + 2, lines = [];
          let cur = "";
          lbl.split(/\s+/).forEach((wd) => { const t = cur ? cur + " " + wd : wd; if (t.length * fs * 0.52 > maxPx && cur) { lines.push(cur); cur = wd; } else cur = t; });
          if (cur) lines.push(cur);
          const ly = belowY + (m.n ? 30 : 6);
          lines.slice(0, 3).forEach((l, i) => { svg += `<text x="${cx}" y="${ly + i * lh}" font-size="${fs}" text-anchor="middle" fill="#607d8b">${esc(l)}</text>`; });
        }
        if (m.phase && r.phases === 3 && m.kind !== "in" && m.kind !== "meter") {
          const phFill = { 1: "#6d4c41", 2: "#37474f", 3: "#78909c" }[m.phase] || "#607d8b";
          const phy = belowY + lblZone - 14;
          svg += `<rect x="${cx - 14}" y="${phy - 10}" width="28" height="14" rx="3" fill="${phFill}" opacity=".15"/>`;
          svg += `<text x="${cx}" y="${phy}" font-size="10" font-weight="700" text-anchor="middle" fill="${phFill}">L${m.phase}</text>`;
        }
        x += m.w * mw;
      });
    });
    return `<svg class="panel" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,'Segoe UI',Roboto,Arial,sans-serif" role="img" aria-label="Схема щита по модулям">${svg}</svg>`;
  }
  function legendHtml(r) {
    return `<table class="legend"><tr><th>№</th><th>Линия</th><th>Автомат</th><th>Кабель</th>${r.phases === 3 ? "<th>Фаза</th>" : ""}</tr>
      ${r.mods.filter((m) => m.n).map((m) => `<tr><td><b>${m.n}</b></td><td>${esc(m.line.name)}<small>${f1(m.line.p / 1000)} кВт · ${m.line.len} м${m.line.rcd ? ` · ${r.mode === "diff" ? "диф" : "УЗО " + groupOf(r, m.line)}` : ""}</small></td>
        <td>C${m.A}</td><td>3×${sq(m.line.S)}</td>${r.phases === 3 ? `<td>L${m.phase}</td>` : ""}</tr>`).join("")}</table>`;
  }
  const groupOf = (r, l) => { const i = r.groups.findIndex((g) => g.lines.includes(l)); return i < 0 ? "" : `№${i + 1}`; };

  /* ---------- вкладка: щит ---------- */
  function viewShield() {
    const r = calc();
    const sample = C.shield(newProject());
    const body = (x) => `<div class="res">
        <span class="k">Бокс</span><span class="v big">${x.box.modules} мод.</span>
        <span class="k">Занято модулей</span><span class="v">${x.used} из ${x.box.modules}</span>
        <span class="k">Рядов по ${x.box.perRow}</span><span class="v">${x.rows.length}</span>
        ${x.mode === "rcd" ? `<span class="k">УЗО 30 мА</span><span class="v">${x.groups.length} шт.</span>` : ""}
      </div>
      <div style="margin-top:12px">${panelSvg(x)}</div>
      <p class="note">Цветная полоска под автоматами — к какому УЗО они подключены. Цифры — номера линий, как в таблице и на наклейках.</p>
      ${legendHtml(x)}
      <button class="btn" data-act="stickers" type="button">Наклейки на автоматы (PDF)</button>
      <button class="btn ghost" data-act="schemePdf" type="button">Схема щита и закупка (PDF)</button>`;
    $("#view").innerHTML = `<h2>Щит</h2><div class="card">${S.paid ? body(r) : `<div class="locked-body">${body(sample)}</div>${lockHtml("Сборка щита", "Рисунок щита по модулям, таблица линий, наклейки на автоматы и схема для печати.")}`}</div>`;
  }

  /* ---------- вкладка: закупка ---------- */
  function viewBuy() {
    const r = calc();
    const groups = [...new Set(r.buy.map((b) => b.g))];
    $("#view").innerHTML = `<h2>Закупка</h2>
      ${groups.map((g) => `<div class="card"><h3>${g}</h3>${r.buy.filter((b) => b.g === g).map((b) => `<div class="bi"><span>${b.name}</span><b>${b.qty} ${b.unit}</b></div>`).join("")}</div>`).join("")}
      <button class="btn" data-act="copyBuy" type="button">Скопировать список</button>
      <p class="note" style="margin:10px 4px 16px">Кабель посчитан по длинам линий + 10 % и по 1,5 м на разделку, округлён до 5 м. Длины до розеток и светильников внутри комнат добавьте сами.</p>`;
  }
  function buyText(r) {
    const p = P();
    return `Закупка · ${p.name}\n` + [...new Set(r.buy.map((b) => b.g))].map((g) => `— ${g} —\n` + r.buy.filter((b) => b.g === g).map((b) => `${b.name}: ${b.qty} ${b.unit}`).join("\n")).join("\n\n");
  }

  /* ---------- PDF: наклейки и схема ---------- */
  function pdfKit() {
    const PX = 8, PW = 210, PH = 297;
    const pages = [];
    let cv, g;
    const page = () => { cv = document.createElement("canvas"); cv.width = PW * PX; cv.height = PH * PX; g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height); pages.push(cv); return g; };
    const text = (t, x, y, sz, o = {}) => { g.font = `${o.w || 400} ${sz * PX}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`; g.fillStyle = o.c || "#111"; g.textAlign = o.a || "left"; g.fillText(String(t), x * PX, y * PX); };
    const wrap = (t, maxMm, sz, w = 400) => { g.font = `${w} ${sz * PX}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`; const out = []; let cur = ""; String(t).split(" ").forEach((wd) => { const s = cur ? cur + " " + wd : wd; if (g.measureText(s).width / PX > maxMm && cur) { out.push(cur); cur = wd; } else cur = s; }); if (cur) out.push(cur); return out; };
    const save = async (fname) => {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "mm", format: "a4" });
      pages.forEach((c, i) => { if (i) doc.addPage(); doc.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, PW, PH, undefined, "FAST"); });
      doc.save(fname);
    };
    return { PX, PW, PH, page, text, wrap, save, get g() { return g; } };
  }
  async function makeStickers() {
    if (!S.paid) return buyPrompt();
    if (!window.jspdf) return toast("Не загрузилась библиотека PDF. Проверьте интернет.");
    const r = calc(), k = pdfKit();
    const MOD = 17.5, LH = 24, M = 12, maxMods = 10;              // ширина модуля, высота наклейки, поля, модулей в полосе
    let g = k.page(), y = 20;
    k.text("Наклейки на автоматы · " + P().name, M, 12, 4.4, { w: 700 });
    k.text("Печать в масштабе 100 %. Ширина одного модуля 17,5 мм — проверьте линейкой. Режьте по пунктиру.", M, 17, 2.8, { c: "#666" });
    y = 24;
    for (const row of r.rows) {
      let strip = [], w = 0;
      const flush = () => {
        if (!strip.length) return;
        if (y + LH + 6 > k.PH - 10) { g = k.page(); y = 14; }
        let x = M;
        g.setLineDash([2 * k.PX, 1.5 * k.PX]); g.strokeStyle = "#999"; g.lineWidth = 0.25 * k.PX;
        strip.forEach((m) => {
          const wmm = m.w * MOD;
          g.strokeRect(x * k.PX, y * k.PX, wmm * k.PX, LH * k.PX);
          const head = m.n ? `${m.n}` : (KIND[m.kind] || {}).top || "";
          k.text(head, x + wmm / 2, y + 5, m.n ? 4.2 : 2.6, { a: "center", w: 800 });
          const name = m.line ? m.line.name : m.label;
          k.wrap(name, wmm - 2, 2.3).slice(0, 4).forEach((ln, i) => k.text(ln, x + wmm / 2, y + 9.5 + i * 3, 2.3, { a: "center" }));
          const rating = m.kind === "br" || m.kind === "diff" ? `C${m.A}` : m.A ? `${m.A} А` : "";
          if (rating) k.text(rating, x + wmm / 2, y + LH - 2, 2.8, { a: "center", w: 700 });
          x += wmm;
        });
        g.setLineDash([]);
        y += LH + 6; strip = []; w = 0;
      };
      row.forEach((m) => { if (w + m.w > maxMods) flush(); strip.push(m); w += m.w; });
      flush();
    }
    g.strokeStyle = "#000"; g.lineWidth = 0.3 * k.PX; g.strokeRect(M * k.PX, y * k.PX, 50 * k.PX, 50 * k.PX);
    k.text("контрольный квадрат 50 × 50 мм", M, y + 55, 2.8, { c: "#666" });
    await k.save(`naklejki_${(P().name || "shchit").replace(/[^\wа-яё]+/gi, "_")}.pdf`);
    toast("Наклейки готовы");
  }
  function svgImage(svg, wPx) {
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1].split(/\s+/).map(Number);
    const hPx = Math.round((wPx * vb[3]) / vb[2]);
    const s2 = svg.replace(/^<svg([^>]*?)\sclass="[^"]*"/, "<svg$1").replace("<svg", `<svg width="${wPx}" height="${hPx}"`);
    return new Promise((res, rej) => { const im = new Image(); im.onload = () => res({ im, h: hPx }); im.onerror = rej; im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s2); });
  }
  async function makeScheme() {
    if (!S.paid) return buyPrompt();
    if (!window.jspdf) return toast("Не загрузилась библиотека PDF. Проверьте интернет.");
    const r = calc(), p = P(), k = pdfKit(), M = 14, CW = 182;
    let g = k.page(), y = 18;
    const need = (h) => { if (y + h > k.PH - 14) { g = k.page(); y = 16; } };
    k.text("Щит · " + p.name, M, y, 6, { w: 800 }); y += 8;
    k.text(`${p.kind === "house" ? "Частный дом" : "Квартира"} · ${r.phases === 3 ? "3 фазы, 400 В" : "1 фаза, 230 В"} · ${p.power} кВт · ввод ${r.phases === 3 ? "3P" : "2P"} C${r.inA} · бокс ${r.box.modules} мод. · ${new Date().toLocaleDateString("ru-RU")}`, M, y, 3.2, { c: "#555" }); y += 6;
    const { im, h } = await svgImage(panelSvg(r), CW * k.PX);
    let hMm = h / k.PX, wMm = CW;
    if (hMm > 150) { wMm *= 150 / hMm; hMm = 150; }
    g.drawImage(im, (M + (CW - wMm) / 2) * k.PX, y * k.PX, wMm * k.PX, hMm * k.PX); y += hMm + 8;
    const row = (cells, xs, sz = 3.2, o = {}) => { need(6); cells.forEach((c, i) => k.text(c, xs[i], y, sz, Object.assign({ a: i === 1 ? "left" : i === 0 ? "left" : "left" }, o))); y += 5.4; g.strokeStyle = "#ddd"; g.lineWidth = 0.2 * k.PX; g.beginPath(); g.moveTo(M * k.PX, (y - 3.6) * k.PX); g.lineTo((M + CW) * k.PX, (y - 3.6) * k.PX); g.stroke(); };
    const xs = [M, M + 10, M + 112, M + 132, M + 158];
    k.text("ЛИНИИ", M, y, 3.4, { w: 700, c: "#1d5fd1" }); y += 6;
    row(["№", "Линия", "Автомат", "Кабель", r.phases === 3 ? "Фаза" : "ΔU"], xs, 3, { c: "#888" });
    r.mods.filter((m) => m.n).forEach((m) => row([String(m.n), `${m.line.name} · ${f1(m.line.p / 1000)} кВт · ${m.line.len} м${m.line.rcd ? (r.mode === "diff" ? " · диф" : " · УЗО " + groupOf(r, m.line)) : ""}`, `C${m.A}`, `3×${sq(m.line.S)}`, r.phases === 3 ? `L${m.phase}` : `${sq(m.line.drop.toFixed(1))} %`], xs));
    y += 4;
    k.text("ЗАКУПКА", M, y, 3.4, { w: 700, c: "#1d5fd1" }); y += 6;
    r.buy.forEach((b) => { need(6); k.text(b.name, M, y, 3.2); k.text(`${b.qty} ${b.unit}`, M + CW, y, 3.2, { a: "right", w: 700 }); y += 5.4; });
    y += 4; need(14);
    k.wrap("Расчёт — помощь электрику. Подключение и проверку выполняет специалист с допуском по ПУЭ. Сечения даны для меди при скрытой прокладке.", CW, 2.8).forEach((l) => { k.text(l, M, y, 2.8, { c: "#777" }); y += 4; });
    await k.save(`shchit_${(p.name || "shchit").replace(/[^\wа-яё]+/gi, "_")}.pdf`);
    toast("Схема готова");
  }
  function accessHtml() {
    return `<p class="note" style="margin-top:0">${S.paid ? (S.until ? `Полный доступ до ${untilStr()}.` : "Полный доступ навсегда. Спасибо!") : "Бесплатно: объект, линии с автоматами и кабелем, закупка. Полный доступ открывает рисунок щита, наклейки на автоматы и схему для печати."}</p>
      ${S.paid && !S.until ? "" : `<div class="plans">${plansHtml()}</div><p class="note">Оплата звёздами Telegram. Новый срок добавляется к оставшемуся.</p>`}
      <div class="code-row"><input data-code type="text" placeholder="Код доступа, например MONTH-XXXXXX" autocapitalize="characters" aria-label="Код доступа">
      <button class="btn ghost" data-act="redeem" type="button">Ввести</button></div>`;
  }
  function buyPrompt() {
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>Полный доступ</h3>${accessHtml()}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", (e) => { if (e.target === bg) bg.remove(); });
  }

  /* ---------- проекты ---------- */
  function projectSheet() {
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>Объекты</h3>
      ${S.projects.map((p) => `<div class="cl-item" data-id="${p.id}"><div class="t">${esc(p.name || "Без названия")}<small>${p.kind === "house" ? "дом" : "квартира"} · ${p.phases} ф · ${p.lines.length} линий</small></div>${p.id === S.cur ? "✓" : ""}</div>`).join("")}
      <button class="btn" data-sheet="new" type="button">Новый объект</button>
      ${S.projects.length > 1 ? `<button class="btn ghost" data-sheet="del" type="button">Удалить текущий</button>` : ""}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", async (e) => {
      if (e.target === bg) return bg.remove();
      const row = e.target.closest("[data-id]");
      if (row) { S.cur = row.dataset.id; save(); bg.remove(); render(); return; }
      const a = e.target.dataset.sheet;
      if (a === "new") { const p = newProject(`Объект ${S.projects.length + 1}`); S.projects.push(p); S.cur = p.id; save(); bg.remove(); S.tab = "object"; render(); }
      if (a === "del") {
        const ok = tg ? await new Promise((r) => tg.showConfirm("Удалить объект?", r)) : confirm("Удалить объект?");
        if (!ok) return;
        S.projects = S.projects.filter((p) => p.id !== S.cur); S.cur = S.projects[0].id; save(); bg.remove(); render();
      }
    });
  }

  /* ---------- события ---------- */
  document.addEventListener("click", async (e) => {
    const p = P();
    const st = e.target.closest("[data-set]");
    if (st) {
      const [k, v] = st.dataset.set.split(":");
      if (k === "mode" && v === "expert" && p.mode !== "expert") {
        p.lines = C.fromRooms(C.applyPlan(p)).map((l) => ({ id: uid(), type: l.type, name: l.name, p: l.p, len: l.len, S: l.S || undefined }));
        toast("Линии собраны из комнат — теперь их можно править");
      }
      p[k] = k === "phases" ? Number(v) : v; save(); render(false); haptic(); return;
    }
    const go = e.target.closest("[data-goto]");
    if (go) { S.tab = go.dataset.goto; render(); return; }
    const rv = e.target.closest("[data-rv]");
    if (rv) { S.roomView = rv.dataset.rv; render(); haptic(); return; }
    const stp = e.target.closest("[data-step]");
    if (stp) {
      if (stp.dataset.step === "1") p.rooms.push(C.newRoom("room", `Комната ${p.rooms.filter((r) => r.type === "room").length + 1}`, "r" + uid()));
      else { const i = p.rooms.map((r) => r.type).lastIndexOf("room"); if (i >= 0) p.rooms.splice(i, 1); }
      save(); render(false); haptic(); return;
    }
    const ar = e.target.closest("[data-addroom]");
    if (ar) { p.rooms.push(C.newRoom(ar.dataset.addroom, null, "r" + uid())); save(); render(false); haptic(); return; }
    const dr = e.target.closest("[data-delroom]");
    if (dr) { p.rooms = p.rooms.filter((r) => r.id !== dr.dataset.delroom); save(); render(false); haptic(); return; }
    const ap = e.target.closest("[data-ap]");
    if (ap) { const rm = p.rooms.find((r) => r.id === ap.closest("[data-room]").dataset.room); const it = rm.items[ap.dataset.ap]; it.on = !it.on; save(); render(false); haptic(); return; }
    const del = e.target.closest("[data-del]");
    if (del) { p.lines = p.lines.filter((l) => l.id !== del.dataset.del); save(); linesOut(); haptic(); return; }
    const pl = e.target.closest("[data-plan]");
    if (pl) { buy(pl.dataset.plan); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "redeem") { const inp = b.parentElement.querySelector("[data-code]"); return redeem(inp && inp.value); }
    if (a === "planPhoto") {
      if (!S.paid) { toast("Распознавание по фото — в полном доступе"); S.tab = "object"; render(); return; }
      if (!CFG.API_URL) { toast("Распознавание по фото работает в приложении из Telegram"); return; }
      $("#planFile").click(); return;
    }
    if (a === "planReset") {
      if (!(await ask("Разложить комнаты заново? Нарисованный план собьётся."))) return;
      p.rooms.forEach((r) => { delete r.rect; }); p.plan.shield = null; save(); render(false); return;
    }
    if (a === "addLine") addLineSheet();
    if (a === "buy") buyPrompt();
    if (a === "stickers") makeStickers();
    if (a === "schemePdf") makeScheme();
    if (a === "copyBuy") { try { await navigator.clipboard.writeText(buyText(calc())); toast("Список скопирован"); } catch (_) { toast("Не удалось скопировать"); } }
    if (a === "demo") { try { localStorage.setItem("demoPaid", S.paid ? "0" : "1"); } catch (_) {} await checkAccess(); render(false); }
  });
  document.addEventListener("input", (e) => {
    const p = P(), el = e.target;
    const roomEl = el.closest("[data-room]");
    if (roomEl && (el.dataset.rk || el.dataset.apv)) {
      const rm = p.rooms.find((r) => r.id === roomEl.dataset.room);
      if (el.dataset.rk) rm[el.dataset.rk] = el.dataset.rk === "name" ? el.value : Number(el.value) || 0;
      else { const k = el.closest("[data-apk]").dataset.apk; rm.items[k][el.dataset.apv] = el.value === "" ? "" : Number(String(el.value).replace(",", ".")); }
      save(); roomRefresh(rm); return;
    }
    if (el.dataset.k) {
      p[el.dataset.k] = el.type === "number" ? Number(el.value.replace(",", ".")) || 0 : el.value;
      if (el.dataset.k === "name") $("#projectName").textContent = p.name || "—";
      save(); if ($("#objOut")) objOut(); return;
    }
    const card = el.closest(".ln");
    if (card && el.dataset.lk) {
      const l = p.lines.find((x) => x.id === card.dataset.id);
      l[el.dataset.lk] = el.dataset.lk === "name" ? el.value : Number(el.value) || 0;
      save();
      const r = calc(), rl = r.lines.find((x) => x.id === l.id);
      $(`[data-res="${l.id}"]`).innerHTML = lineChips(rl, r);
    }
  });
  document.addEventListener("change", (e) => {
    const p = P(), el = e.target;
    if (el.id === "planFile" && el.files && el.files[0]) { planFromPhoto(el.files[0]); el.value = ""; return; }
    if (el.hasAttribute("data-planon")) { p.plan.on = el.checked; save(); render(false); haptic(); return; }
    if (el.dataset.flag) { p[el.dataset.flag] = el.checked; save(); objOut(); haptic(); return; }
    if (el.hasAttribute("data-lrcd")) { const l = p.lines.find((x) => x.id === el.closest(".ln").dataset.id); l.rcd = el.checked; save(); linesOut(); haptic(); return; }
    if (el.closest(".ln") && el.dataset.lk && el.dataset.lk !== "name") linesOut();
  });

  /* ---------- навигация ---------- */
  const VIEWS = { object: viewObject, lines: viewLines, shield: viewShield, buy: viewBuy };
  function render(top = true) {
    $("#projectName").textContent = P().name || "—";
    const lb = $('.tabs button[data-tab="lines"]');
    lb.lastChild.textContent = P().mode === "expert" ? "Линии" : "Комнаты";
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    const y = window.scrollY;
    VIEWS[S.tab]();
    window.scrollTo(0, top ? 0 : y);
  }
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; render(); haptic(); }));
  $("#projectChip").addEventListener("click", projectSheet);

  (async function init() {
    try { S.projects = JSON.parse((await store.get("schit_projects")) || "[]"); } catch (_) { S.projects = []; }
    if (!S.projects.length) S.projects = [newProject()];
    S.projects.forEach((p) => { if (!p.mode) p.mode = p.lines && p.lines.length ? "expert" : "simple"; if (!p.rooms) p.rooms = defaultRooms(); });
    S.cur = (await store.get("schit_current")) || S.projects[0].id;
    if (!S.projects.find((p) => p.id === S.cur)) S.cur = S.projects[0].id;
    await checkAccess();
    render();
  })();
})();
