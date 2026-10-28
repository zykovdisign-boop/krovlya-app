/* Мини-приложение «Кухня PRO» для сборщиков кухонь */
(function () {
  const C = window.KuhnyaCore;
  const CFG = window.APP_CONFIG || {};
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  const $ = (s, el = document) => el.querySelector(s);
  const f0 = (v) => Math.round(v).toLocaleString("ru-RU");
  const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString("ru-RU");
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = (v) => Number(String(v).replace(",", ".")) || 0;
  if (tg) { tg.ready(); tg.expand(); }

  /* ---------- хранилище ---------- */
  const cloud = tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") ? tg.CloudStorage : null;
  const store = {
    get: (k) => new Promise((res) => { if (cloud) cloud.getItem(k, (e, v) => res(e ? null : v || null)); else { try { res(localStorage.getItem(k)); } catch (_) { res(null); } } }),
    set: (k, v) => new Promise((res) => { if (cloud) cloud.setItem(k, v, () => res()); else { try { localStorage.setItem(k, v); } catch (_) {} res(); } }),
  };

  const S = { projects: [], cur: null, tab: "zamer", wall: "A", dwall: "A", smView: "smeta", smAll: false, tipView: "checks", openList: null,
    paid: false, until: null, plans: null, prices: {}, prog: {} };
  const P = () => S.projects.find((p) => p.id === S.cur) || S.projects[0];
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => {
    store.set("kuhnya_projects", JSON.stringify(S.projects)); store.set("kuhnya_current", S.cur || "");
    store.set("kuhnya_prices", JSON.stringify(S.prices)); store.set("kuhnya_prog", JSON.stringify(S.prog));
  }, 300); };
  const calc = () => C.fullCalc(P());

  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2600); }
  const haptic = () => tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred("light");
  const ask = (text) => new Promise((res) => (tg && tg.showConfirm ? tg.showConfirm(text, res) : res(window.confirm(text))));
  const copy = (t, ok) => { if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast(ok), () => toast("Не удалось скопировать")); else toast("Не удалось скопировать"); };

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
  const seg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, t]) => `<button type="button" ${attr}="${v}" class="${v === cur ? "on" : ""}">${t}</button>`).join("")}</div>`;
  const opts = (list, cur) => list.map(([v, t]) => `<option value="${v}" ${String(v) === String(cur) ? "selected" : ""}>${t}</option>`).join("");
  const numIn = (attr, v, extra = "") => `<input ${attr} type="number" inputmode="numeric" value="${v}" ${extra}>`;
  const wallOpts = (p, cur) => opts(C.activeWalls(p).map((w) => [w.id, w.id]), cur);
  const warnHtml = (list, cls = "warn") => list.map((w) => `<div class="${cls}">${w}</div>`).join("");

  function plansHtml() {
    const plans = S.plans || CFG.PLANS;
    if (!plans) return "";
    return Object.entries(plans).map(([k, p]) => `<button class="plan${k === "year" ? " best" : ""}" data-plan="${k}" type="button">
      <span class="plan-n">${p.label}<small>${p.days ? p.days + " " + plural(p.days, "день", "дня", "дней") : "без ограничений"}</small></span>
      <span class="plan-p">⭐ ${p.stars}<small>${p.rub} ₽</small></span></button>`).join("");
  }
  function accessHtml() {
    return `<h3>Доступ</h3><p class="note" style="margin-top:0">${S.paid ? (S.until ? `Полный доступ до ${untilStr()}.` : "Полный доступ навсегда. Спасибо!") : "Бесплатно: замер, раскладка модулей с проверкой, высоты, закупка фурнитуры, первый чек-лист и первые советы. Полный доступ открывает развёртку стен с размерами, раскрой столешницы, смету для заказчика, все чек-листы, советы и узлы."}</p>
      ${S.paid && !S.until ? "" : `<div class="plans">${plansHtml()}</div><p class="note">Оплата звёздами Telegram. Новый срок добавляется к оставшемуся.</p>`}
      <div class="code-row"><input data-code type="text" placeholder="Код доступа" autocapitalize="characters" aria-label="Код доступа">
        <button class="btn" data-act="code" type="button">Ввести</button></div>`;
  }
  const lockHtml = (title, desc) => `<div class="lock"><b>${title}</b><span>${desc}</span><button class="btn" data-goto="zamer" type="button">Получить доступ</button></div>`;
  const locked = (html, title, desc) => (S.paid ? html : `<div class="locked-body">${html}</div>${lockHtml(title, desc)}`);

  /* ---------- вкладка: замер ---------- */
  function viewZamer() {
    const p = P(), ws = C.activeWalls(p);
    const wallNames = { A: "Стена A", B: "Стена B, за углом", C: "Стена C" };
    $("#view").innerHTML = `<h2>Замер</h2>
      <div class="card"><h3>Объект</h3>
        <label class="f full">Название или адрес<input data-pname type="text" value="${esc(p.name)}"></label>
        <p class="sub" style="margin:12px 0 6px">Форма кухни</p>
        ${seg("data-shape", Object.entries(C.SHAPES).map(([k, v]) => [k, v.t]), p.shape)}
        <div class="grid">
          ${ws.map((w) => `<label class="f">${wallNames[w.id]}, мм${numIn(`data-wlen="${w.id}"`, w.len)}</label>`).join("")}
          ${p.shape === "line" ? `<label class="f">До стены напротив, мм${numIn('data-pnum="depth"', p.depth)}</label>` : ""}
          <label class="f">Высота потолка, мм${numIn('data-pnum="height"', p.height)}</label>
        </div>
        <p class="note">Стены идут по часовой стрелке, если стоять лицом к кухне: A, за правым углом B, дальше C. Расстояния на стене — от её левого края.</p>
      </div>
      <div class="card"><h3>План</h3>
        <div id="pe"></div>
        <p class="note">Точки коммуникаций двигайте пальцем — они прилипают к ближайшей стене. Размер кухни меняется за синий угол.</p>
      </div>
      <div class="card"><h3>Окна и двери</h3>
        ${(p.openings || []).map((o) => `<div class="item" data-op="${o.id}">
          <div class="head"><b>${o.kind === "door" ? "Дверь" : "Окно"}</b><select data-osel="wall" aria-label="Стена">${wallOpts(p, o.wall)}</select><button type="button" class="x" data-odel="${o.id}" aria-label="Удалить">×</button></div>
          <div class="grid">
            <label class="f">От левого края${numIn('data-ok="from"', o.from)}</label>
            <label class="f">Ширина${numIn('data-ok="w"', o.w)}</label>
            <label class="f">Низ от пола${numIn('data-ok="sill"', o.sill)}</label>
            <label class="f">Высота${numIn('data-ok="h"', o.h)}</label>
          </div></div>`).join("")}
        <div class="addrow"><button type="button" data-addop="window">+ Окно</button><button type="button" data-addop="door">+ Дверь</button></div>
      </div>
      <div class="card"><h3>Коммуникации</h3>
        ${(p.utils || []).map((u) => { const t = C.UTILS[u.kind]; return `<div class="item" data-ut="${u.id}">
          <div class="head"><span class="dot" style="background:${t.color}"></span><b>${t.t}</b><select data-usel="wall" aria-label="Стена">${wallOpts(p, u.wall)}</select><button type="button" class="x" data-udel="${u.id}" aria-label="Удалить">×</button></div>
          <div class="grid"><label class="f">От левого края${numIn('data-uk="x"', u.x)}</label><label class="f">Высота от пола${numIn('data-uk="h"', u.h)}</label></div></div>`; }).join("")}
        <div class="addrow">${Object.entries(C.UTILS).map(([k, v]) => `<button type="button" data-addut="${k}">+ ${v.t}</button>`).join("")}</div>
      </div>
      <div class="card" id="zCheck"></div>
      <div class="card">${accessHtml()}</div>
      <p class="note" style="margin:0 4px 16px">Приложение помогает посчитать и проверить раскладку. Газ подключает только газовая служба, электрику — электрик.</p>`;
    mountPlan();
    zCheck();
  }

  function zCheck() {
    const r = calc(), el = $("#zCheck");
    if (!el) return;
    const n = r.warnings.length;
    el.innerHTML = `<h3>Проверка</h3><p class="note" style="margin-top:0">${n ? `${n} ${plural(n, "замечание", "замечания", "замечаний")} по раскладке и коммуникациям.` : "По замеру и раскладке замечаний нет."}</p>
      ${warnHtml(r.warnings.slice(0, 3))}${n > 3 ? `<p class="note">…и ещё ${n - 3}</p>` : ""}<button class="btn" data-goto="mods" type="button">К модулям</button>`;
  }

  /* ---------- план ---------- */
  const MOD_FILL = (d, m) => (d.sink ? "#bbdefb" : d.hob ? "#ffccbc" : d.tall ? "#cfd8dc" : d.dw ? "#e1f5fe" : d.filler ? "#d7ccc8" : "#efebe9");
  function planOverlay(p, room) {
    return (fs, K) => {
      const r = calc(), D = Number(p.h.depth) || 600, UD = Number(p.h.upDepth) || 300, k = K / 1000;
      const ox = room.rect.x * K, oy = room.rect.y * K;
      const pt = (wall, off, d) => { const q = C.wallToPlan(p, wall, off, d); return [ox + q.x * k, oy + q.y * k]; };
      const box = (wall, a, b, d0, d1, attrs) => { const [x1, y1] = pt(wall, a, d0), [x2, y2] = pt(wall, b, d1); return `<rect x="${Math.min(x1, x2)}" y="${Math.min(y1, y2)}" width="${Math.abs(x2 - x1)}" height="${Math.abs(y2 - y1)}" ${attrs}/>`; };
      let s = "";
      r.walls.forEach((w) => {
        const [a1, a2] = pt(w.id, 0, 0), [b1, b2] = pt(w.id, w.len, 0);
        s += `<line x1="${a1}" y1="${a2}" x2="${b1}" y2="${b2}" stroke="#455a64" stroke-width="${fs * 0.4}" stroke-linecap="square"/>`;
        w.base.forEach((m) => {
          const d = C.MODULES[m.type] || {};
          if (d.gap || !m.w) return;
          s += box(w.id, m.x, m.x + m.w, 0, m.type === "fridge" ? Math.max(D, 650) : D, `fill="${MOD_FILL(d, m)}" stroke="#8d6e63" stroke-width="${fs * 0.08}"`);
          if (m.w * k > fs * 1.6 && d.s) { const [cx, cy] = pt(w.id, m.x + m.w / 2, D / 2); s += `<text x="${cx}" y="${cy + fs * 0.2}" font-size="${fs * 0.55}" text-anchor="middle" fill="#5d4037">${esc(d.s)}</text>`; }
        });
        w.upper.forEach((m) => {
          const d = C.MODULES[m.type] || {};
          if (d.gap || !m.w || m.type === "hood") return;
          s += box(w.id, m.x, m.x + m.w, 0, UD, `fill="none" stroke="#5c6bc0" stroke-width="${fs * 0.07}" stroke-dasharray="${fs * 0.25} ${fs * 0.15}"`);
        });
        w.ops.forEach((o) => {
          const [x1, y1] = pt(w.id, Number(o.from), 0), [x2, y2] = pt(w.id, Number(o.from) + Number(o.w), 0);
          s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.kind === "door" ? "#a1887f" : "#4fc3f7"}" stroke-width="${fs * 0.55}"/>`;
        });
      });
      return s;
    };
  }

  let editor = null;
  function mountPlan() {
    const p = P(), el = $("#pe");
    if (!el) return;
    const R = C.roomSize(p);
    const room = { id: "k", name: "Кухня", rect: { x: 0, y: 0, w: R.w / 1000, h: R.h / 1000 }, fill: "#fffdf8" };
    let last = Object.assign({}, room.rect);
    const pts = (p.utils || []).map((u) => ({ id: u.id, label: C.UTILS[u.kind].s, color: C.UTILS[u.kind].color, x: 0, y: 0, u }));
    const sync = () => pts.forEach((pt) => { const q = C.wallToPlan(p, pt.u.wall, Number(pt.u.x), 0); pt.x = room.rect.x + q.x / 1000; pt.y = room.rect.y + q.y / 1000; });
    sync();
    editor = PlanEditor.mount(el, {
      getRooms: () => [room], getPoints: () => pts, overlay: planOverlay(p, room),
      onChange: () => {
        const r = room.rect;
        if (r.w !== last.w || r.h !== last.h) {
          const ws = C.activeWalls(p);
          ws[0].len = Math.round(r.w * 100) * 10;
          if (p.shape === "line") p.depth = Math.round(r.h * 100) * 10; else ws[1].len = Math.round(r.h * 100) * 10;
          if (ws[2] && ws[2].len > ws[0].len) ws[2].len = ws[0].len;
          document.querySelectorAll("[data-wlen]").forEach((i) => { const w = p.walls.find((x) => x.id === i.dataset.wlen); if (w) i.value = w.len; });
          const dp = $('[data-pnum="depth"]'); if (dp) dp.value = p.depth;
        } else if (r.x === last.x && r.y === last.y) {
          pts.forEach((pt) => { const q = C.planToWall(p, (pt.x - r.x) * 1000, (pt.y - r.y) * 1000); pt.u.wall = q.wall; pt.u.x = q.x; });
          (p.utils || []).forEach((u) => {
            const it = $(`[data-ut="${u.id}"]`); if (!it) return;
            $('[data-usel="wall"]', it).value = u.wall; $('[data-uk="x"]', it).value = u.x;
          });
        }
        last = Object.assign({}, r);
        sync(); save(); editor.render(); zCheck();
      },
    });
  }

  /* ---------- вкладка: модули ---------- */
  // короткие имена для строки модуля: на 375 px полное название не влезает
  const SHORT = { base_door: "Дверца", base_drawers: "Ящики", base_sink: "Мойка", base_hob: "Варочная", base_oven: "Духовка", base_dw: "Посудомойка", base_bottle: "Карго",
    base_corner: "Угол Г", base_blind: "Угол глухой", stove: "Плита", fridge: "Холодильник", tall: "Пенал", tall_appl: "Пенал техн.", tall_fridge: "Пенал холод.",
    up_door: "Дверца", up_dryer: "Сушка", up_lift: "Подъёмник", up_hood: "Над вытяжкой", up_corner: "Угол Г", up_open: "Полка", hood: "Вытяжка", filler: "Добор", gap: "Пусто" };
  function viewMods() {
    const p = P(), ws = C.activeWalls(p);
    if (!ws.find((w) => w.id === S.wall)) S.wall = ws[0].id;
    const wl = p.walls.find((w) => w.id === S.wall), h = p.h;
    const hasChimney = ws.some((w) => w.upper.some((m) => m.type === "hood"));
    const rowHtml = (row) => `<div id="row_${row}">${wl[row].map((m, i) => `<div class="mrow" data-row="${row}" data-i="${i}">
        <select data-mt aria-label="Модуль">${opts(C.ROW_TYPES(row).map((k) => [k, SHORT[k] || C.MODULES[k].t]), m.type)}</select>
        ${numIn("data-mw", m.w, 'aria-label="Ширина, мм"')}
        <button type="button" data-mv="-1" aria-label="Левее">‹</button><button type="button" data-mv="1" aria-label="Правее">›</button><button type="button" data-mdel aria-label="Удалить">×</button>
      </div>`).join("") || `<p class="note">Пусто.</p>`}</div>
      <div class="row-add"><select data-addmod="${row}" aria-label="Добавить модуль"><option value="">+ Добавить модуль…</option>${opts(C.ROW_TYPES(row).map((k) => [k, C.MODULES[k].t]), "")}</select>
        <button type="button" data-fill="${row}">Заполнить</button></div>
      <div class="fit" id="fit_${row}"></div>`;
    $("#view").innerHTML = `<h2>Модули</h2>
      <div class="card"><h3>Высоты</h3>
        <div class="grid">
          <label class="f">Рост хозяйки, см${numIn('data-hh="person"', h.person)}</label>
          <label class="f">Столешница от пола, мм${numIn('data-hh="counter"', h.counter)}</label>
          <label class="f">Толщина столешницы<select data-hhs="thk">${opts([[26, "26 мм"], [28, "28 мм"], [38, "38 мм"], [40, "40 мм"]], h.thk)}</select></label>
          <label class="f">Глубина столешницы<select data-hhs="depth">${opts([[600, "600 мм"], [650, "650 мм"]], h.depth)}</select></label>
          <label class="f">Корпус нижних, мм${numIn('data-hh="caseH"', h.caseH)}</label>
          <label class="f">Фартук, мм${numIn('data-hh="apron"', h.apron)}</label>
          <label class="f">Верхние шкафы<select data-hhs="upperH">${opts([[720, "720 мм"], [900, "900 мм"], [960, "960 мм"]], h.upperH)}</select></label>
          <label class="f">Варочная<select data-hhs="hob">${opts(Object.entries(C.HOBS).map(([k, v]) => [k, v.t]), h.hob)}</select></label>
          ${hasChimney ? `<label class="f full">Каминная вытяжка: низ над столешницей, мм${numIn('data-hh="hoodH"', h.hoodH || "", 'placeholder="по норме"')}</label>` : ""}
        </div>
        <div class="res" id="hRes" style="margin-top:12px"></div>
      </div>
      ${ws.length > 1 ? seg("data-wall", ws.map((w) => [w.id, `Стена ${w.id}`]), S.wall) : ""}
      <div class="card">
        <h3>Стена ${wl.id} · ${f0(wl.len)} мм</h3>
        ${seg("data-align", [["left", "От левого края"], ["right", "От правого края"]], wl.align || "left")}
        <div class="elev-wrap" id="prev"></div>
        <div class="row-head"><h3>Нижний ряд</h3><span>слева направо, ширина в мм</span></div>${rowHtml("base")}
        <div class="row-head"><h3>Верхний ряд</h3><span>пеналы и окна обходит сам</span></div>${rowHtml("upper")}
      </div>
      <div class="card" id="checks"></div>`;
    modsOut();
  }

  function modsOut() {
    const p = P(), r = calc(), hh = r.h, w = r.walls.find((x) => x.id === S.wall);
    const hasBuilt = r.walls.some((x) => x.upper.some((m) => m.type === "up_hood"));
    const el = $("#hRes");
    if (el) el.innerHTML = `
      <span class="k">По росту столешница</span><span class="v">${hh.rec} мм</span>
      <span class="k">Цоколь, ножки</span><span class="v">${hh.plinth} мм</span>
      <span class="k">Низ верхних от пола</span><span class="v">${hh.upperBottom} мм</span>
      <span class="k">Верх верхних и пеналов</span><span class="v">${hh.upperTop} мм</span>
      <span class="k">До потолка</span><span class="v">${hh.topGap} мм</span>
      <span class="k">Корпус пенала</span><span class="v">${hh.tallH} мм</span>
      ${hasBuilt ? `<span class="k">Шкаф над вытяжкой</span><span class="v">${hh.hoodCab} мм</span>` : ""}
      <span class="k">Вытяжка над столешницей</span><span class="v">от ${hh.hoodMin} мм</span>
      <span class="k">Розетки над столешницей</span><span class="v">${hh.counter + 150}–${hh.counter + 250} мм</span>`;
    const pv = $("#prev");
    if (pv && w) pv.innerHTML = Elev.wallSvg(r, p, w.id, { dims: false, cls: "elev-mini" });
    if (w) ["base", "upper"].forEach((row) => {
      const f = $(`#fit_${row}`);
      if (!f) return;
      const over = row === "base" ? w.overBase : w.overUp, used = row === "base" ? w.usedBase : w.usedUp;
      const start = row === "base" ? w.startBase : w.startUp;
      const fills = r.fills.filter((x) => x.wall === w.id && x.row === (row === "base" ? "нижний" : "верхний"));
      const free = fills.reduce((a, x) => a + x.w, 0);
      // длина занятых окнами и пеналами мест, пересечения не считаем дважды
      let bl = 0, edge = start;
      (row === "base" ? w.blockedBase : w.blockedUp).slice().sort((u, v) => u[0] - v[0]).forEach(([x0, x1]) => { const a = Math.max(x0, edge), b = Math.min(x1, w.len); if (b > a) { bl += b - a; edge = b; } });
      let s = `Занято <b>${f0(used)}</b> из ${f0(w.len - start - bl)} мм${start ? ` (${f0(start)} мм у угла занято соседней стеной)` : ""}${bl ? `, ${f0(bl)} мм закрывают ${row === "base" ? "двери" : "окна, двери и пеналы"}` : ""}. `;
      if (over > 0) s += `<span class="bad">Не влезает на ${f0(over)} мм.</span>`;
      else if (!fills.length) s += `<span class="ok">Всё по месту.</span>`;
      else s += `Свободно ${f0(free)} мм: ` + fills.map((x) => `${x.text}${fills.length > 1 ? ` (${f0(x.from)}–${f0(x.to)})` : ""}`).join("; ") + ".";
      f.innerHTML = s;
    });
    const ck = $("#checks");
    if (ck) ck.innerHTML = `<h3>Проверка</h3>${r.warnings.length || r.info.length ? warnHtml(r.warnings) + warnHtml(r.info, "info") : `<p class="note" style="margin-top:0">Всё сходится: модули влезают, высоты в норме, техника стоит правильно.</p>`}`;
  }

  // Закрывает свободные места ряда: стандартный шкаф + добор. Идёт справа налево, чтобы индексы не съезжали.
  function fillRow(row) {
    const p = P(), wl = p.walls.find((w) => w.id === S.wall);
    const r = calc(), w = r.walls.find((x) => x.id === S.wall);
    const fills = r.fills.filter((x) => x.wall === S.wall && x.row === (row === "base" ? "нижний" : "верхний")).sort((a, b) => b.from - a.from);
    if (!fills.length) return toast("Свободного места нет");
    fills.forEach((g) => {
      const placed = row === "base" ? w.base : w.upper;
      const idx = placed.filter((m) => m.x < g.from).length;
      const add = [];
      g.mods.forEach((mw) => add.push(C.mod(row === "base" ? "base_door" : "up_door", mw)));
      if (g.filler) add.push(C.mod("filler", g.filler));
      if (wl.align === "right" && add.length > 1) add.reverse();
      wl[row].splice(idx, 0, ...add);
    });
    save(); render(false); toast("Заполнил: проверьте типы шкафов");
  }

  /* ---------- вкладка: чертёж ---------- */
  function viewDraw() {
    const p = P(), c = p.counter;
    $("#view").innerHTML = `<h2>Чертёж</h2>
      <div class="card"><h3>Столешница</h3>
        ${seg("data-joint", [["90", "Стык через планку"], ["euro", "Евро-запил"]], c.joint)}
        <div class="grid">
          <label class="f">Длина листа<select data-csel="sheet">${opts(C.SHEETS.map((x) => [x, `${f0(x)} мм`]), c.sheet)}</select></label><span></span>
          <label class="f">Вырез мойки, ширина${numIn('data-cn="sinkW"', c.sinkW)}</label>
          <label class="f">Вырез мойки, глубина${numIn('data-cn="sinkD"', c.sinkD)}</label>
          <label class="f">Вырез варочной, ширина${numIn('data-cn="hobW"', c.hobW)}</label>
          <label class="f">Вырез варочной, глубина${numIn('data-cn="hobD"', c.hobD)}</label>
        </div>
        <p class="note">Размеры выреза берите с шаблона или из паспорта мойки и панели. Для варочной в модуле 450 мм вырез считается под домино, 270 мм.</p>
      </div>
      <div class="card" id="drawBody"></div>`;
    drawOut();
  }

  function drawOut() {
    const p = P(), r = calc(), ws = C.activeWalls(p), ct = r.counter;
    if (!ws.find((w) => w.id === S.dwall)) S.dwall = ws[0].id;
    const endName = { wall: "в стену", free: "свободный торец", joint: ct.joints[0] && ct.joints[0].kind === "euro" ? "евро-запил" : "стык 90°", split: "прямой стык" };
    const body = `${ws.length > 1 ? seg("data-dwall", ws.map((w) => [w.id, `Стена ${w.id}`]), S.dwall) : ""}
      <h3>Развёртка стены ${S.dwall}</h3><p class="sub">Размеры в мм. Цветные точки — коммуникации: от левого края / высота. Нажмите, чтобы увеличить</p>
      <div class="elev-wrap">${Elev.wallSvg(r, p, S.dwall)}</div>
      <h3 style="margin-top:16px">Столешница сверху</h3><p class="sub">Красные линии — стыки. Номера кусков совпадают со списком</p>
      <div class="elev-wrap">${Elev.counterSvg(r, p)}</div>
      <div class="pieces" style="margin-top:8px">${ct.pieces.map((pc, i) => `<div class="bi"><span>${i + 1}. Стена ${pc.wall}<small>слева ${endName[pc.start]}, справа ${endName[pc.end]}</small></span><b>${f0(pc.len)} мм</b></div>`).join("") || `<p class="note">Столешницы нет: в нижнем ряду нет шкафов под неё.</p>`}</div>
      ${ct.cutouts.length ? `<h3 style="margin-top:14px">Вырезы</h3><div class="pieces">${ct.cutouts.map((x) => { const pc = ct.pieces.findIndex((q) => q.wall === x.wall && x.x0 >= q.from && x.x1 <= q.to); return `<div class="bi"><span>${x.kind === "sink" ? "Мойка" : "Варочная"} ${x.w}×${x.d}<small>кусок ${pc + 1}: от левого торца ${f0(x.x0 - (ct.pieces[pc] || { from: 0 }).from)} мм, от переднего края ${x.front} мм</small></span><b>${x.wall}</b></div>`; }).join("")}</div>` : ""}
      ${ct.sheets.length ? `<h3 style="margin-top:14px">Раскрой: ${ct.sheets.length} ${plural(ct.sheets.length, "лист", "листа", "листов")} по ${f0(ct.sheet)} мм</h3><p class="sub">В каждом куске +20 мм на подрезку по месту</p><div class="elev-wrap">${Elev.sheetsSvg(r)}</div>` : ""}
      <h3 style="margin-top:14px">Цоколь</h3><div class="res">
        <span class="k">Высота</span><span class="v">${r.cocol.h} мм</span>
        <span class="k">Длина</span><span class="v">${f1(r.cocol.total / 1000)} м · ${r.cocol.bars} ${plural(r.cocol.bars, "планка", "планки", "планок")} по 4 м</span></div>
      ${warnHtml(ct.warn)}
      <button class="btn" data-act="copyCut" type="button">Скопировать раскрой</button>`;
    const el = $("#drawBody");
    if (el) el.innerHTML = locked(body, "Чертежи стен и раскрой", "Развёртка каждой стены с размерами, столешница с вырезами и раскрой листов.");
  }

  function cutText() {
    const p = P(), r = calc(), ct = r.counter;
    const end = { wall: "в стену", free: "торец", joint: "угловой стык", split: "прямой стык" };
    let s = `Столешница · ${p.name}\nЛист ${ct.sheet}×${ct.D}×${r.h.thk}, ${p.counter.joint === "euro" ? "евро-запил" : "стык через планку"}\n\n`;
    s += ct.pieces.map((pc, i) => `${i + 1}. Стена ${pc.wall}: ${pc.len} мм (пилить ${pc.cut}), слева ${end[pc.start]}, справа ${end[pc.end]}`).join("\n");
    if (ct.cutouts.length) s += "\n\nВырезы:\n" + ct.cutouts.map((x) => { const k = ct.pieces.findIndex((q) => q.wall === x.wall && x.x0 >= q.from && x.x1 <= q.to); return `— ${x.kind === "sink" ? "мойка" : "варочная"} ${x.w}×${x.d}: кусок ${k + 1}, от левого торца ${Math.round(x.x0 - (ct.pieces[k] || { from: 0 }).from)} мм, от переднего края ${x.front} мм`; }).join("\n");
    s += `\n\nЛистов: ${ct.sheets.length}\n` + ct.sheets.map((sh, i) => `Лист ${i + 1}: ${sh.items.map((k) => `№${k + 1} ${ct.pieces[k].cut}`).join(" + ")}, остаток ${sh.waste}`).join("\n");
    return s;
  }

  /* ---------- вкладка: смета и закупка ---------- */
  function viewSmeta() {
    $("#view").innerHTML = `<h2>Смета</h2>${seg("data-sm", [["smeta", "Работы"], ["buy", "Закупка"]], S.smView)}<div id="smBody"></div>`;
    if (S.smView === "buy") return buyOut();
    const p = P(), r = calc(), e = C.estimate(r.works, S.prices, p.qty);
    const rows = e.items.filter((x) => S.smAll || x.auto > 0 || (p.qty[x.k] !== undefined && p.qty[x.k] !== ""));
    const body = `${rows.map((x) => `<div class="sm-row" data-k="${x.k}"><div class="n${x.qty ? "" : " off"}">${x.t}</div>
        <div class="sm-line"><input data-qty="${x.k}" type="number" inputmode="decimal" placeholder="${x.auto}" value="${p.qty[x.k] !== undefined ? p.qty[x.k] : ""}" aria-label="Количество">
        <span>${x.unit} ×</span><input data-price="${x.k}" type="number" inputmode="numeric" value="${x.price}" aria-label="Цена"><b data-sum="${x.k}">${f0(x.sum)} ₽</b></div></div>`).join("")}
      <button type="button" class="linkbtn" data-act="smAll" style="margin-top:10px">${S.smAll ? "Скрыть пустые позиции" : "Показать все позиции"}</button>
      <div class="total" style="margin-top:14px"><span>Итого для заказчика</span><b id="smTotal">${f0(e.total)} ₽</b></div>
      <button class="btn" data-act="copySmeta" type="button">Скопировать смету</button>
      <button class="btn ghost" data-act="resetQty" type="button">Вернуть количества по раскладке</button>`;
    $("#smBody").innerHTML = `<div class="card">${locked(body, "Смета для заказчика", "Количества по раскладке, ваши цены и готовый текст для заказчика.")}</div>
      <p class="note" style="margin:0 4px 16px">Количество считается по модулям само. Впишите своё число, чтобы заменить, или сотрите — вернётся расчётное. Цены запоминаются для всех объектов.</p>`;
  }
  function smetaOut() {
    const p = P(), e = C.estimate(calc().works, S.prices, p.qty);
    e.items.forEach((x) => { const b = $(`[data-sum="${x.k}"]`); if (b) b.textContent = `${f0(x.sum)} ₽`; });
    const t = $("#smTotal"); if (t) t.textContent = `${f0(e.total)} ₽`;
  }
  function smetaText() {
    const p = P(), e = C.estimate(calc().works, S.prices, p.qty);
    return `Смета на сборку кухни · ${p.name}\n\n` + e.items.filter((x) => x.qty > 0).map((x) => `${x.t}: ${f1(x.qty)} ${x.unit} × ${f0(x.price)} ₽ = ${f0(x.sum)} ₽`).join("\n") + `\n\nИтого: ${f0(e.total)} ₽`;
  }
  function buyOut() {
    const r = calc(), groups = [...new Set(r.buy.map((b) => b.g))];
    $("#smBody").innerHTML = `${groups.map((g) => `<div class="card"><h3>${g}</h3>${r.buy.filter((b) => b.g === g).map((b) => `<div class="bi"><span>${b.name}</span><b>${b.qty} ${b.unit}</b></div>`).join("")}</div>`).join("") || `<div class="card"><p class="note" style="margin:0">Добавьте модули — здесь появится список.</p></div>`}
      <button class="btn" data-act="copyBuy" type="button">Скопировать список</button>
      <p class="note" style="margin:10px 4px 16px">Петли считаются по высоте фасада: до 900 мм — две, до 1600 — три. Крепёж, который идёт в коробках с корпусами, проверьте при приёмке.</p>`;
  }
  function buyText() {
    const r = calc(), p = P();
    return `Закупка · ${p.name}\n` + [...new Set(r.buy.map((b) => b.g))].map((g) => `— ${g} —\n` + r.buy.filter((b) => b.g === g).map((b) => `${b.name}: ${b.qty} ${b.unit}`).join("\n")).join("\n\n");
  }

  /* ---------- вкладка: советы, чек-листы, узлы ---------- */
  const FREE_TIPS = 6, FREE_LISTS = ["k01"];
  function viewTips() {
    const tips = window.TIPS || [], draws = window.DRAWINGS || [], lists = window.CHECKLISTS || [];
    if (S.tipView === "checks" && S.openList) return viewList(S.openList);
    const prog = S.prog[S.cur] || {};
    let body = "";
    if (S.tipView === "checks") {
      const total = lists.reduce((a, c) => a + c.items.length, 0), done = lists.reduce((a, c) => a + (prog[c.id] || []).length, 0);
      body = `<div class="card"><div class="res"><span class="k">Пройдено по объекту</span><span class="v">${done} из ${total}</span></div><div class="bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div></div>
        <div class="card">${lists.map((c, i) => { const d = (prog[c.id] || []).length, lk = !S.paid && !FREE_LISTS.includes(c.id);
          return `<div class="cl-item" data-list="${c.id}"><div class="t">${i + 1}. ${c.title}${c.noReturn ? '<span class="nr">точка невозврата</span>' : ""}<small>${lk ? "🔒 полный доступ" : `${d} из ${c.items.length}`}</small><div class="bar"><i style="width:${(d / c.items.length) * 100}%"></i></div></div><span style="color:var(--hint)">›</span></div>`; }).join("")}</div>`;
    } else if (S.tipView === "tips") {
      body = tips.map((t, i) => { const lk = !S.paid && i >= FREE_TIPS; return `<div class="tip ${t.kind}${lk ? " locked" : ""}"><div class="tip-kind">${t.kind === "hack" ? "Лайфхак" : "Ошибка"} · ${t.title}</div>
        <div class="tip-text">${lk ? "Откройте полный доступ, чтобы прочитать." : t.text}</div><div class="tip-src">${t.topic}</div></div>`; }).join("") + (S.paid ? "" : `<button class="btn" data-goto="zamer" type="button">Открыть все ${tips.length} советов</button>`);
    } else {
      body = `<div class="card">${draws.map((d) => `<div class="cl-item" data-draw="${d.file}" data-free="${d.free ? 1 : 0}"><div class="t">${d.title}<small>${d.free || S.paid ? d.sub : "🔒 полный доступ"}</small></div><span style="color:var(--hint)">›</span></div>`).join("")}</div>`;
    }
    $("#view").innerHTML = `<h2>Советы</h2>${seg("data-ts", [["checks", "Чек-листы"], ["tips", `Советы (${tips.length})`], ["draw", `Узлы (${draws.length})`]], S.tipView)}<div style="margin-top:12px">${body}</div>`;
  }
  function viewList(id) {
    const c = (window.CHECKLISTS || []).find((x) => x.id === id);
    if (!c) { S.openList = null; return viewTips(); }
    const prog = S.prog[S.cur] || (S.prog[S.cur] = {}), set = new Set(prog[id] || []);
    $("#view").innerHTML = `<button class="back" type="button" data-back>‹ Все чек-листы</button><h2>${c.title}</h2>
      ${c.noReturn ? `<div class="warn" style="margin-bottom:12px">Распиленную столешницу не вернуть. Пройдите список целиком до первого пропила.</div>` : ""}
      <div class="card">${c.items.map((t, i) => `<label class="chk ${set.has(i) ? "done" : ""}"><input type="checkbox" data-ci="${i}" ${set.has(i) ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>`;
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
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    const y = window.scrollY;
    if (S.tab === "zamer") viewZamer();
    else if (S.tab === "mods") viewMods();
    else if (S.tab === "draw") viewDraw();
    else if (S.tab === "smeta") viewSmeta();
    else if (S.tab === "tips") viewTips();
    window.scrollTo(0, top ? 0 : y);
  }

  /* ---------- события ---------- */
  const rowItem = (el) => { const r = el.closest("[data-row]"); if (!r) return null; const wl = P().walls.find((w) => w.id === S.wall); return { wl, row: r.dataset.row, i: Number(r.dataset.i), list: wl[r.dataset.row] }; };

  document.addEventListener("click", (e) => {
    const p = P(), T = (s) => e.target.closest(s);
    let el;
    if ((el = T("[data-tab]"))) { S.tab = el.dataset.tab; S.openList = null; render(); haptic(); return; }
    if ((el = T("[data-goto]"))) { S.tab = el.dataset.goto; render(); return; }
    if ((el = T("[data-shape]"))) { p.shape = el.dataset.shape; save(); render(false); haptic(); return; }
    if ((el = T("[data-wall]"))) { S.wall = el.dataset.wall; render(false); haptic(); return; }
    if ((el = T("[data-dwall]"))) { S.dwall = el.dataset.dwall; drawOut(); haptic(); return; }
    if ((el = T("[data-align]"))) { p.walls.find((w) => w.id === S.wall).align = el.dataset.align; save(); render(false); haptic(); return; }
    if ((el = T("[data-joint]"))) { p.counter.joint = el.dataset.joint; save(); render(false); haptic(); return; }
    if ((el = T("[data-sm]"))) { S.smView = el.dataset.sm; render(false); haptic(); return; }
    if ((el = T("[data-ts]"))) { S.tipView = el.dataset.ts; S.openList = null; render(false); haptic(); return; }
    if ((el = T("[data-back]"))) { S.openList = null; render(); return; }
    if ((el = T("[data-list]"))) {
      if (!S.paid && !FREE_LISTS.includes(el.dataset.list)) { toast("Этот чек-лист — в полном доступе"); return; }
      S.openList = el.dataset.list; render(); return;
    }
    if ((el = T("[data-draw]"))) {
      if (el.dataset.free !== "1" && !S.paid) { toast("Узел откроется в полном доступе"); return; }
      fetch(el.dataset.draw).then((x) => x.text()).then(openZoom).catch(() => toast("Не удалось открыть чертёж"));
      return;
    }
    if ((el = T("svg.elev, svg.elev-mini, svg.ctop, svg.sheets"))) { if (!el.closest(".locked-body")) openZoom(el.outerHTML); return; }
    if ((el = T("[data-mv]"))) {
      const it = rowItem(el), j = it.i + Number(el.dataset.mv);
      if (j < 0 || j >= it.list.length) return;
      [it.list[it.i], it.list[j]] = [it.list[j], it.list[it.i]];
      save(); render(false); haptic(); return;
    }
    if ((el = T("[data-mdel]"))) { const it = rowItem(el); it.list.splice(it.i, 1); save(); render(false); haptic(); return; }
    if ((el = T("[data-fill]"))) { fillRow(el.dataset.fill); return; }
    if ((el = T("[data-addop]"))) {
      const w = C.activeWalls(p)[0];
      p.openings.push(el.dataset.addop === "door" ? { id: C.uid("o"), kind: "door", wall: w.id, from: 0, w: 800, sill: 0, h: 2050 } : { id: C.uid("o"), kind: "window", wall: w.id, from: Math.max(0, Math.round((w.len - 1200) / 2)), w: 1200, sill: 900, h: 1400 });
      save(); render(false); haptic(); return;
    }
    if ((el = T("[data-odel]"))) { p.openings = p.openings.filter((o) => o.id !== el.dataset.odel); save(); render(false); haptic(); return; }
    if ((el = T("[data-addut]"))) {
      const k = el.dataset.addut, w = C.activeWalls(p)[0];
      p.utils.push({ id: C.uid("u"), kind: k, wall: w.id, x: Math.round(w.len / 2 / 10) * 10, h: k === "socket" ? Number(p.h.counter) + 200 : C.UTILS[k].h });
      save(); render(false); haptic(); return;
    }
    if ((el = T("[data-udel]"))) { p.utils = p.utils.filter((u) => u.id !== el.dataset.udel); save(); render(false); haptic(); return; }
    if ((el = T("[data-plan]"))) { buyPrompt(el.dataset.plan); return; }
    if ((el = T("[data-act]"))) {
      const a = el.dataset.act;
      if (a === "copyBuy") copy(buyText(), "Список скопирован");
      else if (a === "copyCut") { if (S.paid) copy(cutText(), "Раскрой скопирован"); }
      else if (a === "copySmeta") { if (S.paid) copy(smetaText(), "Смета скопирована"); }
      else if (a === "smAll") { S.smAll = !S.smAll; render(false); }
      else if (a === "resetQty") { p.qty = {}; save(); render(false); toast("Количества — по раскладке"); }
      else if (a === "code") { const inp = $("[data-code]"); if (inp && inp.value.trim()) { if (!CFG.API_URL) { toast("Коды заработают, когда подключим бота"); return; } api("redeem", { code: inp.value.trim().toUpperCase() }).then((r) => { if (r.ok) { checkAccess().then(() => render()); toast(r.msg || "Код активирован"); } else toast(r.error || "Код не подошёл"); }).catch(() => toast("Ошибка сети")); } }
      return;
    }
    if (T(".project-chip")) { showProjectSheet(); return; }
  });

  document.addEventListener("change", (e) => {
    const p = P(), el = e.target;
    if (el.dataset.addmod !== undefined) {
      if (!el.value) return;
      const wl = p.walls.find((w) => w.id === S.wall);
      wl[el.dataset.addmod].push(C.mod(el.value));
      save(); render(false); haptic(); return;
    }
    if (el.dataset.mt !== undefined) {
      const it = rowItem(el), m = it.list[it.i], d = C.MODULES[el.value];
      m.type = el.value;
      if (m.w < d.min || m.w > d.max) m.w = d.def;
      save(); render(false); return;
    }
    if (el.dataset.osel) { const o = p.openings.find((x) => x.id === el.closest("[data-op]").dataset.op); o.wall = el.value; save(); render(false); return; }
    if (el.dataset.usel) { const u = p.utils.find((x) => x.id === el.closest("[data-ut]").dataset.ut); u.wall = el.value; save(); render(false); return; }
    if (el.dataset.hhs) { p.h[el.dataset.hhs] = el.dataset.hhs === "hob" ? el.value : Number(el.value); save(); render(false); return; }
    if (el.dataset.csel) { p.counter[el.dataset.csel] = Number(el.value); save(); drawOut(); return; }
    if (el.dataset.ci !== undefined) {
      const id = S.openList, prog = S.prog[S.cur] || (S.prog[S.cur] = {}), set = new Set(prog[id] || []), i = Number(el.dataset.ci);
      el.checked ? set.add(i) : set.delete(i);
      el.closest(".chk").classList.toggle("done", el.checked);
      prog[id] = [...set].sort((a, b) => a - b);
      save(); haptic();
      const c = window.CHECKLISTS.find((x) => x.id === id);
      if (c && set.size === c.items.length) toast("Этап пройден ✓");
    }
  });

  document.addEventListener("input", (e) => {
    const p = P(), el = e.target;
    if (el.dataset.pname !== undefined) { p.name = el.value; $("#projectName").textContent = p.name || "—"; save(); return; }
    if (el.dataset.wlen) { p.walls.find((w) => w.id === el.dataset.wlen).len = num(el.value); save(); mountPlan(); zCheck(); return; }
    if (el.dataset.pnum) { p[el.dataset.pnum] = num(el.value); save(); mountPlan(); zCheck(); return; }
    if (el.dataset.ok) { const o = p.openings.find((x) => x.id === el.closest("[data-op]").dataset.op); o[el.dataset.ok] = num(el.value); save(); if (editor) editor.render(); zCheck(); return; }
    if (el.dataset.uk) { const u = p.utils.find((x) => x.id === el.closest("[data-ut]").dataset.ut); u[el.dataset.uk] = num(el.value); save(); mountPlan(); zCheck(); return; }
    if (el.dataset.hh) { p.h[el.dataset.hh] = num(el.value); save(); modsOut(); return; }
    if (el.dataset.mw !== undefined) { const it = rowItem(el); it.list[it.i].w = num(el.value); save(); modsOut(); return; }
    if (el.dataset.cn) { p.counter[el.dataset.cn] = num(el.value); save(); drawOut(); return; }
    if (el.dataset.price) { S.prices[el.dataset.price] = el.value === "" ? "" : num(el.value); save(); smetaOut(); return; }
    if (el.dataset.qty) { if (el.value === "") delete p.qty[el.dataset.qty]; else p.qty[el.dataset.qty] = num(el.value); save(); smetaOut(); return; }
  });

  /* ---------- проекты ---------- */
  function showProjectSheet() {
    const bg = document.createElement("div"); bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>Объекты</h3>
      ${S.projects.map((p) => `<div class="cl-item" data-proj="${p.id}"><div class="t"><b>${esc(p.name || "Без названия")}</b><small>${C.SHAPES[p.shape].t} · ${C.activeWalls(p).map((w) => f0(w.len)).join(" + ")} мм</small></div>${p.id === S.cur ? "✓" : ""}</div>`).join("")}
      <button class="btn ghost" data-act="newProj" type="button">+ Новый объект</button>
      <button class="btn ghost" data-act="demoProj" type="button">+ Пример угловой кухни</button>
      ${S.projects.length > 1 ? `<button class="btn ghost" data-act="delProj" type="button" style="color:var(--hot)">Удалить «${esc(P().name)}»</button>` : ""}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", (e) => {
      e.stopPropagation();
      const proj = e.target.closest("[data-proj]");
      const pick = (np) => { if (np) S.projects.push(np); S.cur = (np || {}).id || S.cur; save(); render(); bg.remove(); };
      if (proj) { S.cur = proj.dataset.proj; S.openList = null; pick(null); return; }
      const a = e.target.closest("[data-act]");
      if (a && a.dataset.act === "newProj") { pick(C.newProject("Новая кухня", true)); return; }
      if (a && a.dataset.act === "demoProj") { pick(C.newProject("Пример")); return; }
      if (a && a.dataset.act === "delProj") {
        ask(`Удалить объект «${P().name}» со всеми замерами?`).then((ok) => { if (!ok) return; S.projects = S.projects.filter((x) => x.id !== S.cur); delete S.prog[S.cur]; S.cur = S.projects[0].id; save(); render(); bg.remove(); });
        return;
      }
      if (e.target === bg) bg.remove();
    });
  }

  /* ---------- init ---------- */
  async function init() {
    const [projStr, curStr, priceStr, progStr] = await Promise.all(["kuhnya_projects", "kuhnya_current", "kuhnya_prices", "kuhnya_prog"].map(store.get));
    try { if (projStr) S.projects = JSON.parse(projStr) || []; } catch (_) {}
    try { if (priceStr) S.prices = JSON.parse(priceStr) || {}; } catch (_) {}
    try { if (progStr) S.prog = JSON.parse(progStr) || {}; } catch (_) {}
    if (!S.projects.length) S.projects = [C.newProject("Пример")];
    // старые сохранения: добираем поля, которых не было
    S.projects.forEach((p) => { const d = C.newProject(p.name, true); ["openings", "utils", "qty"].forEach((k) => { if (!p[k]) p[k] = d[k]; }); p.h = Object.assign(d.h, p.h); p.counter = Object.assign(d.counter, p.counter); });
    S.cur = curStr && S.projects.some((p) => p.id === curStr) ? curStr : S.projects[0].id;
    render();
    await checkAccess();
    if (S.paid) render(false);
  }
  init();
})();
