/* Мини-приложение «Сантехник PRO» */
(function () {
  const C = window.SantehCore;
  const CFG = window.APP_CONFIG || {};
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  const $ = (s, el = document) => el.querySelector(s);
  const f0 = (v) => Math.round(v).toLocaleString("ru-RU");
  const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString("ru-RU");
  const sq = (s) => String(s).replace(".", ",");
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  if (tg) { tg.ready(); tg.expand(); }

  /* ---------- хранилище ---------- */
  const cloud = tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") ? tg.CloudStorage : null;
  const store = {
    get: (k) => new Promise((res) => { if (cloud) cloud.getItem(k, (e, v) => res(e ? null : v || null)); else { try { res(localStorage.getItem(k)); } catch (_) { res(null); } } }),
    set: (k, v) => new Promise((res) => { if (cloud) cloud.setItem(k, v, () => res()); else { try { localStorage.setItem(k, v); } catch (_) {} res(); } }),
  };
  const uid = () => Math.random().toString(36).slice(2, 9);

  const defaultRooms = () => [
    C.newRoom("bathroom", "Ванная", "r" + uid()),
    C.newRoom("toilet", "Туалет", "r" + uid()),
    C.newRoom("kitchen", "Кухня", "r" + uid()),
    C.newRoom("room", "Комната 1", "r" + uid()),
    C.newRoom("room", "Комната 2", "r" + uid()),
  ];

  const newProject = (name = "Квартира") => ({
    id: "p" + uid(), name, mode: "simple",
    pipe: "ppr20", hotPipe: "ppr20", heatPipe: "ppr25",
    circulation: false, hotTemp: 55, coldTemp: 10,
    hasHeating: false, boiler: "gas", radiator: "al500", walls: "medium",
    tFlow: 80, tReturn: 60, tRoom: 22, floors: 1, system: "twoTube",
    rooms: defaultRooms(), fixtures: [], plan: null,
  });

  const S = { projects: [], cur: null, tab: "object", roomView: "list", paid: false, until: null, plans: null };
  const P = () => S.projects.find((p) => p.id === S.cur) || S.projects[0];
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { store.set("santeh_projects", JSON.stringify(S.projects)); store.set("santeh_current", S.cur || ""); }, 300); };

  const calc = () => C.fullCalc(P());

  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2600); }
  const haptic = () => tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred("light");

  /* ---------- бот: доступ, оплата ---------- */
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
      try { const r = await api("access"); S.paid = !!r.paid; S.until = r.until || null; if (Array.isArray(r.plans)) S.plans = Object.fromEntries(r.plans.map((x) => [x.k, Object.assign({}, (CFG.PLANS || {})[x.k], { stars: x.stars, days: x.days })])); } catch (_) {}
    }
    const b = $("#accessBadge");
    if (S.paid) { b.textContent = S.until ? `до ${untilStr()}` : "полный доступ"; b.classList.add("paid"); }
    else { b.textContent = "бесплатно"; b.classList.remove("paid"); }
  }

  /* ---------- UI helpers ---------- */
  const seg = (key, opts, cur) => `<div class="seg">${opts.map(([v, t]) => `<button type="button" data-set="${key}:${v}" class="${v === cur ? "on" : ""}">${t}</button>`).join("")}</div>`;
  const tgl = (key, label, sub, checked) => `<label class="tgl"><input type="checkbox" data-tgl="${key}" ${checked ? "checked" : ""}><span>${label}${sub ? `<small>${sub}</small>` : ""}</span></label>`;

  function plansHtml() {
    const plans = S.plans || CFG.PLANS;
    if (!plans) return "";
    return Object.entries(plans).map(([k, p]) => `<button class="plan${k === "year" ? " best" : ""}" data-plan="${k}" type="button">
      <span class="plan-n">${p.label}<small>${p.days ? p.days + " " + plural(p.days, "день", "дня", "дней") : "без ограничений"}</small></span>
      <span class="plan-p">⭐ ${p.stars}<small>${p.rub} ₽</small></span></button>`).join("");
  }

  // Диаметр подбирает расчёт, пользователь выбирает только материал; значение — младший типоразмер группы.
  const MATERIALS = [["ppr20", "ППР"], ["mpx16", "Металлопласт"], ["pex16", "PEX"]];
  const matOptions = (cur) => MATERIALS.map(([k, t]) => `<option value="${k}" ${(C.PIPES[cur] || C.PIPES.ppr20).group === C.PIPES[k].group ? "selected" : ""}>${t}</option>`).join("");
  const f2 = (v) => (Math.round(v * 100) / 100).toLocaleString("ru-RU");

  /* ---------- вкладка: объект ---------- */
  function viewObject() {
    const p = P();
    const simple = p.mode !== "expert";
    $("#view").innerHTML = `<h2>Объект</h2>
      <div class="card"><h3>Режим</h3>
        ${seg("mode", [["simple", "Простой"], ["expert", "Эксперт"]], p.mode || "simple")}
        <p class="note" style="margin-top:0">${simple ? "Укажите комнаты и приборы — трубы и разводку приложение подберёт само." : "Можно вручную указать каждую точку водоразбора и длину."}</p></div>
      <div class="card"><h3>Водоснабжение</h3>
        <p class="sub" style="margin:0 0 6px">Горячая вода</p>
        ${seg("hotSource", [["central", "Центральная"], ["local", "Свой нагреватель"]], p.hotSource || "central")}
        <div class="grid">
          <label class="f">Жильцов<input data-num="people" type="number" inputmode="numeric" min="1" value="${p.people || C.defaultPeople(p.rooms)}"></label>
          <span></span>
          <label class="f">Материал ХВС<select data-sel="pipe">${matOptions(p.pipe)}</select></label>
          <label class="f">Материал ГВС<select data-sel="hotPipe">${matOptions(p.hotPipe)}</select></label>
          <label class="f">ГВС, °C<input data-num="hotTemp" type="number" inputmode="numeric" value="${p.hotTemp}"></label>
          <label class="f">ХВС, °C<input data-num="coldTemp" type="number" inputmode="numeric" value="${p.coldTemp}"></label>
        </div>
        ${tgl("circulation", "Циркуляция ГВС", "горячая вода сразу из крана, без слива холодной", p.circulation)}
      </div>
      <div class="card"><h3>Отопление</h3>
        ${tgl("hasHeating", "Считать отопление", "водяное: радиаторы или тёплый пол", p.hasHeating)}
        ${p.hasHeating ? `
        <div class="grid">
          <label class="f">Котёл<select data-sel="boiler">${Object.entries(C.BOILERS).map(([k, v]) => `<option value="${k}" ${p.boiler === k ? "selected" : ""}>${v.t}</option>`).join("")}</select></label>
          <label class="f">Радиаторы<select data-sel="radiator">${Object.entries(C.RADIATORS).map(([k, v]) => `<option value="${k}" ${p.radiator === k ? "selected" : ""}>${v.t}</option>`).join("")}</select></label>
          <label class="f">Стены<select data-sel="walls">${Object.entries(C.HEAT_LOSS).map(([k, v]) => `<option value="${k}" ${p.walls === k ? "selected" : ""}>${v.t} (${v.wm2} Вт/м²)</option>`).join("")}</select></label>
          <label class="f">Этажей<input data-num="floors" type="number" inputmode="numeric" value="${p.floors}" min="1" max="5"></label>
          <label class="f">Подача, °C<input data-num="tFlow" type="number" inputmode="numeric" value="${p.tFlow}"></label>
          <label class="f">Обратка, °C<input data-num="tReturn" type="number" inputmode="numeric" value="${p.tReturn}"></label>
        </div>
        ${seg("system", [["twoTube", "Двухтрубная"], ["oneTube", "Однотрубная"], ["floor", "Тёплый пол"]], p.system)}
        <label class="f">Трубы отопления<select data-sel="heatPipe">${Object.entries(C.PIPES).filter(([, v]) => v.group === "ppr" || v.group === "mpx" || v.group === "cu").map(([k, v]) => `<option value="${k}" ${p.heatPipe === k ? "selected" : ""}>${v.t} (Ø${v.di})</option>`).join("")}</select></label>
        ` : ""}
      </div>
      <div class="card" id="objResult"></div>
      <div class="card">${accessHtml()}</div>
      <p class="note" style="margin:0 4px 16px">Приложение помогает рассчитать и подобрать сантехнику. Монтаж и подключение выполняет квалифицированный специалист.</p>`;
    showResult();
  }

  function showResult() {
    const r = calc();
    const w = r.water;
    let html = `<h3>Итог</h3><div class="res">
      <span class="k">Точек водоразбора</span><span class="v">${w.fixtures.length}</span>
      <span class="k">Расчётный расход ХВС</span><span class="v">${f2(w.qCold)} л/с</span>
      <span class="k">Расчётный расход ГВС</span><span class="v">${f2(w.qHot)} л/с</span>
      ${w.local ? `<span class="k">Ввод (ХВС + на нагрев)</span><span class="v">${f2(w.qTot)} л/с · ${w.vvodPipe.t}</span>` : ""}
      <span class="k">Труба ХВС</span><span class="v">${w.coldPipe.t}</span>
      <span class="k">Труба ГВС</span><span class="v">${w.hotPipe.t}</span>
      ${w.local ? `<span class="k">Мощность, если нагреватель проточный</span><span class="v">${w.boilerPower} кВт</span>` : ""}`;
    if (w.circ) html += `<span class="k">Циркуляция</span><span class="v">${w.circPipe ? w.circPipe.t : "—"}</span>`;
    if (r.heating) {
      html += `<hr><span class="k">Теплопотери</span><span class="v big">${f0(r.heating.totalHeat)} Вт</span>
        <span class="k">Котёл</span><span class="v">${r.heating.boilerPower} кВт</span>
        <span class="k">Радиаторов</span><span class="v">${r.heating.rooms.length}</span>`;
    }
    html += `</div><p class="note">Расход — по СП 30.13330: сколько приборов реально откроют одновременно при ${w.people} ${plural(w.people, "жильце", "жильцах", "жильцах")}. Трубы подобраны так, чтобы скорость воды была не больше 1,5 м/с.</p>`;
    r.warnings.forEach((w) => { html += `<div class="warn">${w}</div>`; });
    const el = $("#objResult");
    if (el) el.innerHTML = html;
  }

  /* ---------- вкладка: комнаты ---------- */
  const ROOM_ADD = [["bathroom", "Ванная"], ["shower", "Душевая"], ["toilet", "Туалет"], ["kitchen", "Кухня"], ["laundry", "Постирочная"], ["boiler", "Котельная"], ["outdoor", "Улица"]];

  const roomSeg = () => `<div class="seg"><button type="button" data-rv="list" class="${S.roomView === "list" ? "on" : ""}">Список</button><button type="button" data-rv="plan" class="${S.roomView === "plan" ? "on" : ""}">План дома</button></div>`;

  function viewRooms() {
    const p = P();
    if (p.mode === "expert") return viewFixtures();
    if (S.roomView === "plan") return viewPlan();
    const living = p.rooms.filter((r) => r.type === "room").length;
    $("#view").innerHTML = `<h2>Комнаты</h2>${roomSeg()}
      <div class="card"><div class="stepper"><span>Жилых комнат</span>
        <button type="button" data-step="-1" aria-label="Убрать">−</button><b>${living}</b><button type="button" data-step="1" aria-label="Добавить">+</button></div>
        <div class="addrow">${ROOM_ADD.map(([t, n]) => `<button type="button" data-addroom="${t}">+ ${n}</button>`).join("")}</div></div>
      <div id="roomList"></div>
      <div class="card" id="roomSum"></div>
      <p class="note" style="margin:0 4px 16px">Отметьте приборы в каждой комнате. Расстояние — примерная длина трубы от стояка/коллектора.</p>`;
    roomsOut();
  }

  function roomsOut() {
    const p = P(), r = calc();
    const w = r.water;
    const fromPlan = Object.fromEntries(C.applyPlan(p).filter((x) => x.rect && p.plan && p.plan.on).map((x) => [x.id, x]));
    $("#roomList").innerHTML = p.rooms.map((rm) => {
      const pl = fromPlan[rm.id];
      const rt = C.ROOM_TYPES[rm.type] || C.ROOM_TYPES.room;
      const keys = Object.keys(rm.items);
      const on = keys.filter((k) => rm.items[k].on);
      return `<div class="room" data-room="${rm.id}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-size:20px">${rt.icon || "🏠"}</span>
          <input class="ln-name" data-rk="name" value="${esc(rm.name)}" style="flex:1;border:0;background:none;font-weight:600;font-size:15px;padding:4px 0" aria-label="Название">
          <button class="ln-del" data-delroom="${rm.id}" type="button" style="border:0;background:none;color:var(--hint);font-size:22px;padding:4px 8px;min-width:40px;min-height:40px" aria-label="Удалить">×</button>
        </div>
        <div class="appl">${keys.map((k) => { const fx = C.FIXTURES[k]; if (!fx) return ""; return `<button type="button" class="ap ${rm.items[k].on ? "on" : ""}" data-ap="${k}" aria-pressed="${rm.items[k].on}">${fx.icon || ""} ${fx.t}</button>`; }).join("")}</div>
        ${pl ? `<p class="from-plan">По плану: до стояка <b>${f1(pl.dist)} м</b>${p.hasHeating ? `, площадь <b>${f1(pl.area)} м²</b>` : ""} <button type="button" data-rv="plan">изменить</button></p>`
        : (rm.type === "room" || p.hasHeating) ? `<div class="grid" style="margin-top:10px">
          <label class="f">До стояка, м<input data-rk="dist" type="number" inputmode="numeric" value="${rm.dist}"></label>
          ${p.hasHeating ? `<label class="f">Площадь, м²<input data-rk="area" type="number" inputmode="numeric" value="${rm.area}"></label>` : ""}
        </div>` : `<label class="dist">До стояка<input data-rk="dist" type="number" inputmode="numeric" value="${rm.dist}"> м</label>`}
        <div class="pipe-specs" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
          ${on.map((k) => { const fx = C.FIXTURES[k]; const line = w.fixtures.find((l) => l.type === k && l.room === rm.name); return `<span class="chip">${fx.icon} ${fx.t} <b>${f1((line ? line.q : fx.q) * 60)} л/мин</b></span>`; }).join("")}
        </div>
      </div>`;
    }).join("");
    roomSum(r);
  }

  function roomSum(r) {
    const w = r.water;
    let html = `<h3>Водоснабжение</h3><div class="res">
      <span class="k">Точек</span><span class="v">${w.fixtures.length}</span>
      <span class="k">Расход ХВС / ГВС</span><span class="v">${f2(w.qCold)} / ${f2(w.qHot)} л/с</span>
      <span class="k">ХВС</span><span class="v">${w.coldPipe.t}</span>
      <span class="k">ГВС</span><span class="v">${w.hotPipe.t}</span></div>`;
    if (r.heating) {
      html += `<h3 style="margin-top:12px">Отопление</h3><div class="res">
        <span class="k">Теплопотери</span><span class="v">${f0(r.heating.totalHeat)} Вт</span>
        <span class="k">Котёл</span><span class="v">${r.heating.boilerPower} кВт</span></div>`;
      html += r.heating.rooms.map((rm) => `<div class="rad-card">
        <div class="name">${esc(rm.name)}</div>
        <div class="info">${f0(rm.qRoom)} Вт → <b>${rm.radLabel}</b></div>
        <div class="heat-bar"><div style="width:${Math.min(100, rm.qRoom / (r.heating.totalHeat || 1) * 100 * r.heating.rooms.length)}%"></div></div>
      </div>`).join("");
    }
    r.warnings.forEach((w) => { html += `<div class="warn">${w}</div>`; });
    html += `<button class="btn" data-goto="schema" type="button">Схема разводки</button>`;
    const el = $("#roomSum");
    if (el) el.innerHTML = html;
  }

  /* ---------- план дома ---------- */
  const WET = ["bathroom", "shower", "toilet", "kitchen", "laundry"];
  const ROOM_FILL = { bathroom: "#e3f2fd", shower: "#e3f2fd", toilet: "#e3f2fd", laundry: "#e3f2fd", kitchen: "#fff8e1", boiler: "#fbe9e7", outdoor: "#e8f5e9", room: "#ffffff" };
  const roomOn = (rm) => Object.keys(rm.items || {}).filter((k) => rm.items[k].on && C.FIXTURES[k]);

  function ensurePlan(p) {
    if (!p.plan) p.plan = { on: true, riser: null };
    C.autoLayout(p.rooms);
    if (!p.plan.riser) {
      const wet = p.rooms.find((r) => WET.includes(r.type) && r.rect) || p.rooms.find((r) => r.rect);
      p.plan.riser = wet ? { x: wet.rect.x, y: wet.rect.y } : { x: 0, y: 0 };
    }
  }

  // Комнаты для рисунка: заливка по типу, подпись — длина трубы или секции радиатора.
  function planRooms(p, heat) {
    const calcRooms = C.applyPlan(Object.assign({}, p, { plan: Object.assign({}, p.plan, { on: true }) }));
    const hr = heat ? Object.fromEntries(heat.rooms.map((x) => [x.name, x])) : {};
    return calcRooms.filter((r) => r.rect).map((r) => {
      const n = roomOn(r).length, h = hr[r.name];
      const parts = [];
      if (n) parts.push(`${f1(r.dist)} м трубы`);
      if (h && h.sections) parts.push(`${h.sections} секц.`);
      return { id: r.id, name: r.name, rect: r.rect, fill: ROOM_FILL[r.type] || "#fff", note: parts.join(" · "), noteColor: n ? "#1565c0" : "#c62828" };
    });
  }

  // Трассы ХВС (синяя) и ГВС (красная) от стояка к каждой мокрой комнате, точка на конце — приборы.
  function planOverlay(p) {
    const riser = p.plan.riser;
    return (fs, K) => p.rooms.filter((rm) => rm.rect && roomOn(rm).length).map((rm) => {
      const on = roomOn(rm), hot = on.some((k) => C.FIXTURES[k].hot);
      const pts = C.routePath(rm.rect, riser);
      const line = (off, color) => `<polyline points="${pts.map((q) => `${q.x * K + off},${q.y * K + off}`).join(" ")}" fill="none" stroke="${color}" stroke-width="${fs * 0.22}" stroke-linejoin="round" stroke-linecap="round" opacity=".9"/>`;
      const end = pts[pts.length - 1];
      return line(-fs * 0.18, "#1565c0") + (hot ? line(fs * 0.18, "#e53935") : "")
        + `<circle cx="${end.x * K}" cy="${end.y * K}" r="${fs * 0.42}" fill="#fff" stroke="#1565c0" stroke-width="${fs * 0.15}" pointer-events="none"/>`;
    }).join("");
  }
  const riserPoint = (p) => ({ id: "riser", label: "Стояк", color: "#1565c0",
    get x() { return p.plan.riser.x; }, set x(v) { p.plan.riser.x = v; },
    get y() { return p.plan.riser.y; }, set y(v) { p.plan.riser.y = v; } });

  let editor = null;
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
        ${tgl("planOn", "Брать длины труб с плана", "путь по стенам от стояка + 1 м на подводки к приборам", p.plan.on)}
        <div id="pe"></div>
        <p class="note">Двигайте комнаты пальцем, размер меняется за синий угол. Точку «Стояк» поставьте туда, откуда идёт вода: стояк, ввод в дом или коллектор.</p>
        <input type="file" id="planFile" accept="image/*" hidden>
      </div>
      <div class="card" id="roomSum"></div>`;
    editor = PlanEditor.mount($("#pe"), {
      getRooms: () => planRooms(p, calc().heating),
      getPoints: () => [riserPoint(p)],
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
      const image = await shrinkPhoto(file);
      const r = await api("planPhoto", { image });
      if (!r.ok) return toast(r.error || "Не получилось распознать");
      const rooms = C.roomsFromRecognized(r.rooms);
      if (!rooms.length) return toast("Не нашёл на фото комнат. Нужен план с размерами");
      if (!(await ask(`Нашёл ${rooms.length} ${plural(rooms.length, "помещение", "помещения", "помещений")}. Заменить ими текущие комнаты?`))) return;
      p.rooms = rooms;
      p.plan = { on: true, riser: r.riser ? { x: r.riser.x, y: r.riser.y } : null };
      save(); render(false);
      toast("Готово. Проверьте размеры и поправьте, если что-то не так");
    } catch (_) {
      toast("Ошибка сети, попробуйте ещё раз");
    } finally {
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  /* ---------- вкладка: эксперт — точки ---------- */
  function viewFixtures() {
    const p = P(), r = calc();
    const w = r.water;
    $("#view").innerHTML = `<h2>Точки водоразбора</h2>
      ${(p.fixtures || []).map((f, i) => { const fx = C.FIXTURES[f.type] || C.FIXTURES.sink; return `<div class="pipe-line" data-fi="${i}">
        <div class="head"><span class="icon">${fx.icon}</span><span class="name">${esc(f.name || fx.t)}</span>
          <span class="badge-t ${fx.hot ? "badge-hot" : "badge-cold"}">${fx.hot ? "ГВС" : "ХВС"}</span>
          <button data-delf="${i}" type="button" style="border:0;background:none;color:var(--hint);font-size:20px;padding:4px 8px;min-width:40px;min-height:40px">×</button></div>
        <div class="grid"><label class="f">Расход, л/с<input data-fk="q" type="number" inputmode="decimal" step="0.01" value="${f.q || fx.q}"></label>
          <label class="f">Длина, м<input data-fk="len" type="number" inputmode="numeric" value="${f.len || 5}"></label></div>
      </div>`; }).join("")}
      <div class="card"><h3>Добавить</h3>
        <div class="addrow">${Object.entries(C.FIXTURES).map(([k, v]) => `<button type="button" data-addf="${k}">${v.icon} ${v.t}</button>`).join("")}</div></div>
      <div class="card" id="roomSum"></div>`;
    roomSum(r);
  }

  /* ---------- вкладка: схема ---------- */
  function viewSchema() {
    const r = calc();
    const w = r.water;
    const p = P();
    const hasPlan = p.mode !== "expert" && p.plan && p.plan.on && p.rooms.some((rm) => rm.rect);
    const planPic = hasPlan ? `<h3>План разводки</h3><p class="sub">Синяя — холодная, красная — горячая. Нажмите, чтобы увеличить</p>
      ${PlanEditor.svg({ rooms: planRooms(p, r.heating), points: [riserPoint(p)], overlay: planOverlay(p), cls: "plan-svg static" })}
` : `<p class="sub">Нарисуйте <button type="button" class="linkbtn" data-rv="plan">план дома</button> — длины труб посчитаются по нему, а здесь появится разводка по комнатам.</p>`;
    const body = (x) => `${planPic}<h3 style="margin-top:16px">Монтажная схема</h3>
      <p class="sub">Узел ввода, коллекторы с отводами на каждый прибор${r.heating ? ", котёл и радиаторы" : ""}. Нажмите, чтобы увеличить</p>
      <div class="montage-wrap">${Montage.montageSvg(r, p)}</div>
      <div class="res" style="margin-top:12px">
        <span class="k">Труб ХВС</span><span class="v">${f0(x.coldLen)} м · ${x.coldPipe.t}</span>
        <span class="k">Труб ГВС</span><span class="v">${f0(x.hotLen)} м · ${x.hotPipe.t}</span>
        ${x.circ ? `<span class="k">Циркуляция</span><span class="v">${f0(x.circLen)} м</span>` : ""}
      </div>
      ${r.heating ? `<h3 style="margin-top:16px">Отопление</h3><div class="res">
        <span class="k">Труб</span><span class="v">${f0(r.heating.totalLen)} м · ${r.heating.pipe.t}</span>
        <span class="k">Система</span><span class="v">${r.heating.system === "twoTube" ? "Двухтрубная" : r.heating.system === "oneTube" ? "Однотрубная" : "Тёплый пол"}</span>
      </div>` : ""}
      <button class="btn" data-act="copyBuy" type="button">Скопировать закупку</button>`;
    $("#view").innerHTML = `<h2>Схема</h2><div class="card">${S.paid ? body(w) : `<div class="locked-body">${body(w)}</div>${lockHtml("Схема разводки", "Схема водоснабжения, отопления и полный список закупки.")}`}</div>`;
  }


  /* ---------- вкладка: советы и чертежи ---------- */
  const FREE_TIPS = 6;
  function viewTips() {
    const tips = window.TIPS || [], draws = window.DRAWINGS || [];
    if (!S.tipView) S.tipView = "tips";
    const tipHtml = (t, i) => {
      const locked = !S.paid && i >= FREE_TIPS;
      return `<div class="tip ${t.kind}${locked ? " locked" : ""}"><div class="tip-kind">${t.kind === "hack" ? "Лайфхак" : "Ошибка"} · ${t.title}</div>
        <div class="tip-text">${locked ? "Откройте полный доступ, чтобы прочитать." : t.text}</div><div class="tip-src">${t.topic}</div></div>`;
    };
    const body = S.tipView === "tips"
      ? tips.map(tipHtml).join("") + (S.paid ? "" : `<button class="btn" data-goto="object" type="button">Открыть все ${tips.length} советов</button>`)
      : `<div class="card">${draws.map((d) => `<div class="cl-item" data-draw="${d.file}" data-free="${d.free ? 1 : 0}"><div class="t">${d.title}<small>${d.free || S.paid ? d.sub : "🔒 полный доступ"}</small></div><span style="color:var(--hint)">›</span></div>`).join("")}</div>`;
    $("#view").innerHTML = `<h2>Советы и чертежи</h2>
      <div class="seg"><button type="button" data-ts="tips" class="${S.tipView === "tips" ? "on" : ""}">Советы (${tips.length})</button><button type="button" data-ts="draw" class="${S.tipView === "draw" ? "on" : ""}">Чертежи (${draws.length})</button></div>
      <div style="margin-top:12px">${body}</div>`;
  }

  // Длинные чертежи — 1500 px с прокруткой, компактные — по ширине экрана.
  function fitSvg(svg) {
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
    const [, , w, h] = vb ? vb.split(/\s+/).map(Number) : [0, 0, 1, 1];
    const wide = w / h > 2.6;
    return svg.replace(/^(<svg[^>]*?)\s*class="[^"]*"/, "$1").replace(/^(<svg[^>]*?)\s(width|height)="[^"]*"/, "$1").replace(/^(<svg[^>]*?)\s(width|height)="[^"]*"/, "$1")
      .replace("<svg", `<svg class="zoomed" style="width:${wide ? "1500px" : "100%"};max-width:${wide ? "none" : "900px"}"`);
  }
  function openZoom(svg) {
    const bg = document.createElement("div");
    bg.className = "zoom";
    bg.innerHTML = `<div class="zoom-bar"><span>Удобнее держать телефон горизонтально</span><button type="button" data-close>Закрыть</button></div>
      <div class="zoom-body">${fitSvg(svg)}</div>`;
    document.body.appendChild(bg);
    const close = () => { bg.remove(); if (tg && tg.BackButton) { tg.BackButton.hide(); tg.BackButton.offClick(close); } };
    if (tg && tg.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(close); }
    bg.addEventListener("click", (e) => { e.stopPropagation(); if (e.target.closest("[data-close]")) close(); });
  }

  /* ---------- вкладка: закупка ---------- */
  function viewBuy() {
    const r = calc();
    const groups = [...new Set(r.buy.map((b) => b.g))];
    $("#view").innerHTML = `<h2>Закупка</h2>
      ${groups.map((g) => `<div class="card"><h3>${g}</h3>${r.buy.filter((b) => b.g === g).map((b) => `<div class="bi"><span>${b.name}</span><b>${b.qty} ${b.unit}</b></div>`).join("")}</div>`).join("")}
      <button class="btn" data-act="copyBuy" type="button">Скопировать список</button>
      <p class="note" style="margin:10px 4px 16px">Длины труб посчитаны по расстояниям до стояка + 10 %. Фитинги — ориентировочно, уточняйте по месту.</p>`;
  }

  function buyText() {
    const r = calc(), p = P();
    return `Закупка · ${p.name}\n` + [...new Set(r.buy.map((b) => b.g))].map((g) => `— ${g} —\n` + r.buy.filter((b) => b.g === g).map((b) => `${b.name}: ${b.qty} ${b.unit}`).join("\n")).join("\n\n");
  }

  /* ---------- доступ ---------- */
  function accessHtml() {
    return `<p class="note" style="margin-top:0">${S.paid ? (S.until ? `Полный доступ до ${untilStr()}.` : "Полный доступ навсегда. Спасибо!") : "Бесплатно: комнаты, план дома, трубы, закупка и первые советы. Полный доступ открывает план по фото, схему разводки, все советы и чертежи."}</p>
      ${S.paid && !S.until ? "" : `<div class="plans">${plansHtml()}</div><p class="note">Оплата звёздами Telegram. Новый срок добавляется к оставшемуся.</p>`}
      <div class="code-row"><input data-code type="text" placeholder="Код доступа" autocapitalize="characters" aria-label="Код доступа">
        <button class="btn" data-act="code" type="button">Ввести</button></div>`;
  }
  function lockHtml(title, desc) {
    return `<div class="lock"><b>${title}</b><span>${desc}</span><button class="btn" data-goto="object" type="button">Получить доступ</button></div>`;
  }
  async function buyPrompt(plan) {
    if (!CFG.API_URL || !tg) return toast("Оплата работает в приложении из Telegram");
    try {
      const inv = await api("invoice", { plan });
      if (!inv.ok) return toast(inv.error || "Не удалось создать счёт");
      tg.openInvoice(inv.link, (st) => { if (st === "paid") { toast("Оплата прошла, открываю доступ…"); setTimeout(async () => { await checkAccess(); render(false); }, 1500); } });
    } catch (_) { toast("Не удалось создать счёт"); }
  }

  /* ---------- рендер ---------- */
  function render(top = true) {
    $("#projectName").textContent = P().name || "—";
    const lb = document.querySelector('.tabs button[data-tab="rooms"]');
    if (lb) lb.lastChild.textContent = P().mode === "expert" ? "Точки" : "Комнаты";
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    if (S.tab === "object") viewObject();
    else if (S.tab === "rooms") viewRooms();
    else if (S.tab === "schema") viewSchema();
    else if (S.tab === "buy") viewBuy();
    else if (S.tab === "tips") viewTips();
    if (top) window.scrollTo(0, 0);
  }

  const setFlag = (p, k, v) => { if (k === "planOn") p.plan.on = v; else p[k] = v; };

  /* ---------- события ---------- */
  document.addEventListener("click", (e) => {
    const p = P();
    const tab = e.target.closest("[data-tab]");
    if (tab) { S.tab = tab.dataset.tab; render(); haptic(); return; }
    const st = e.target.closest("[data-set]");
    if (st) { const [k, v] = st.dataset.set.split(":"); p[k] = k === "phases" || k === "floors" ? Number(v) : v; save(); render(false); haptic(); return; }
    const go = e.target.closest("[data-goto]");
    if (go) { S.tab = go.dataset.goto; render(); return; }
    const ts = e.target.closest("[data-ts]");
    if (ts) { S.tipView = ts.dataset.ts; render(false); haptic(); return; }
    const dw = e.target.closest("[data-draw]");
    if (dw) {
      if (dw.dataset.free !== "1" && !S.paid) { toast("Чертёж откроется в полном доступе"); return; }
      fetch(dw.dataset.draw).then((x) => x.text()).then(openZoom).catch(() => toast("Не удалось открыть чертёж"));
      return;
    }
    const rv = e.target.closest("[data-rv]");
    if (rv) { S.roomView = rv.dataset.rv; S.tab = "rooms"; render(); haptic(); return; }
    const zm = e.target.closest("svg.plan-svg.static, svg.montage");
    if (zm) { openZoom(zm.outerHTML); return; }
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
    if (ap) { const rm = p.rooms.find((r) => r.id === ap.closest("[data-room]").dataset.room); rm.items[ap.dataset.ap].on = !rm.items[ap.dataset.ap].on; save(); render(false); haptic(); return; }
    const af = e.target.closest("[data-addf]");
    if (af) { const fx = C.FIXTURES[af.dataset.addf]; if (!p.fixtures) p.fixtures = []; p.fixtures.push({ type: af.dataset.addf, name: fx.t, q: fx.q, len: 5 }); save(); render(false); haptic(); return; }
    const df = e.target.closest("[data-delf]");
    if (df) { p.fixtures.splice(Number(df.dataset.delf), 1); save(); render(false); haptic(); return; }
    const tglEl = e.target.closest("[data-tgl]");
    if (tglEl) { const inp = tglEl.querySelector("input") || tglEl; setFlag(p, tglEl.dataset.tgl || inp.dataset.tgl, inp.checked); save(); render(false); haptic(); return; }
    const plan = e.target.closest("[data-plan]");
    if (plan) { buyPrompt(plan.dataset.plan); return; }
    const act = e.target.closest("[data-act]");
    if (act) {
      if (act.dataset.act === "planPhoto") {
        if (!S.paid) { toast("Распознавание по фото — в полном доступе"); S.tab = "object"; render(); return; }
        if (!CFG.API_URL) { toast("Распознавание по фото заработает, когда подключим бота"); return; }
        $("#planFile").click(); return;
      }
      if (act.dataset.act === "planReset") {
        ask("Разложить комнаты заново? Нарисованный план собьётся.").then((ok) => { if (!ok) return; p.rooms.forEach((r) => { delete r.rect; }); p.plan.riser = null; save(); render(false); });
        return;
      }
      if (act.dataset.act === "copyBuy") { const t = buyText(); if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast("Список скопирован")); else toast("Не удалось скопировать"); }
      else if (act.dataset.act === "code") { const inp = $("[data-code]"); if (inp && inp.value.trim()) { api("redeem", { code: inp.value.trim().toUpperCase() }).then((r) => { if (r.ok) { checkAccess(); render(); toast(r.msg || "Код активирован"); } else toast(r.error || "Код не подошёл"); }).catch(() => toast("Ошибка сети")); } }
      return;
    }
    const chip = e.target.closest(".project-chip");
    if (chip) { showProjectSheet(); return; }
  });

  document.addEventListener("change", (e) => {
    if (e.target.id === "planFile" && e.target.files && e.target.files[0]) { planFromPhoto(e.target.files[0]); e.target.value = ""; }
  });

  document.addEventListener("input", (e) => {
    const p = P(), el = e.target;
    const roomEl = el.closest("[data-room]");
    if (roomEl && el.dataset.rk) {
      const rm = p.rooms.find((r) => r.id === roomEl.dataset.room);
      if (el.dataset.rk === "name") rm.name = el.value;
      else rm[el.dataset.rk] = Number(el.value) || 0;
      save(); showResult(); return;
    }
    const fi = el.closest("[data-fi]");
    if (fi && el.dataset.fk) {
      const idx = Number(fi.dataset.fi);
      p.fixtures[idx][el.dataset.fk] = el.value === "" ? "" : Number(String(el.value).replace(",", "."));
      save(); showResult(); return;
    }
    if (el.dataset.num) { p[el.dataset.num] = Number(el.value) || 0; save(); showResult(); return; }
    if (el.dataset.sel) { p[el.dataset.sel] = el.value; save(); showResult(); return; }
    if (el.dataset.tgl) { setFlag(p, el.dataset.tgl, el.checked); save(); render(false); return; }
  });

  /* ---------- проекты ---------- */
  function showProjectSheet() {
    const bg = document.createElement("div"); bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>Проекты</h3>
      ${S.projects.map((p) => `<div class="cl-item" data-proj="${p.id}"><div class="t"><b>${esc(p.name)}</b><small>${p.hasHeating ? "Вода + отопление" : "Водоснабжение"}</small></div></div>`).join("")}
      <button class="btn ghost" data-act="newProj" type="button">+ Новый проект</button></div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", (e) => {
      const proj = e.target.closest("[data-proj]");
      if (proj) { S.cur = proj.dataset.proj; save(); render(); bg.remove(); return; }
      if (e.target.closest("[data-act='newProj']")) { const np = newProject("Новый"); S.projects.push(np); S.cur = np.id; save(); render(); bg.remove(); return; }
      if (e.target === bg) bg.remove();
    });
  }

  /* ---------- init ---------- */
  async function init() {
    const [projStr, curStr] = await Promise.all([store.get("santeh_projects"), store.get("santeh_current")]);
    if (projStr) try { S.projects = JSON.parse(projStr); } catch (_) {}
    if (curStr) S.cur = curStr;
    if (!S.projects.length) S.projects = [newProject()];
    S.projects.forEach((p) => { if (!p.mode) p.mode = "simple"; if (!p.rooms) p.rooms = defaultRooms(); });
    S.cur = S.cur || S.projects[0].id;
    render();
    checkAccess();
  }
  init();
})();
