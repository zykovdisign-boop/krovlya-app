/* Мини-приложение «Крыша без переделок» */
(function () {
  const C = window.RoofCore;
  const CFG = window.APP_CONFIG || {};
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  const $ = (s, el = document) => el.querySelector(s);
  const fmt = (v, d = 0) => (v == null || isNaN(v) ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: d, minimumFractionDigits: d }));
  const mm = (v) => `${fmt(v)} мм`;
  const m = (v) => `${fmt(v / 1000, 2)} м`;

  if (tg) { tg.ready(); tg.expand(); }

  /* ---------- хранилище: облако Telegram или localStorage ---------- */
  const cloud = tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") ? tg.CloudStorage : null;
  const store = {
    get(k) {
      return new Promise((res) => {
        if (cloud) cloud.getItem(k, (e, v) => res(e ? null : v || null));
        else { try { res(localStorage.getItem(k)); } catch (_) { res(null); } }
      });
    },
    set(k, v) {
      return new Promise((res) => {
        if (cloud) cloud.setItem(k, v, () => res());
        else { try { localStorage.setItem(k, v); } catch (_) {} res(); }
      });
    },
  };

  const DEFAULT = {
    name: "Мой дом", width: 8000, length: 10000, height: 2800, over: 500, form: "gable", material: "metal", box: "gas",
    step: 600, h: 200, b: 50, d: "", plate: 150, snow: 180, ridge: "butt", beamW: 150, dr: "",
  };
  // материалы из книги (глава 2): вес с пирогом для расчёта, минимальный уклон
  const MATERIALS = [
    { k: "cpc", t: "Цементно-песчаная черепица", w: 45, min: 22, heavy: true },
    { k: "ceramic", t: "Керамическая черепица", w: 50, min: 22, heavy: true },
    { k: "metal", t: "Металлочерепица", w: 5, min: 14 },
    { k: "prof", t: "Профнастил", w: 5, min: 8 },
    { k: "soft", t: "Мягкая кровля", w: 18, min: 12 },
    { k: "falz", t: "Фальцевая кровля", w: 6, min: 12 },
  ];
  const rad = (d) => (d * Math.PI) / 180;
  const materialOf = (p) => MATERIALS.find((m) => m.k === p.material) || MATERIALS[2];
  const heightOf = (p) => num(p.height, (num(p.width, 8000) / 2) * Math.tan(rad(num(p.angle, 35))));
  const angleOf = (p) => (Math.atan(heightOf(p) / (num(p.width, 8000) / 2)) * 180) / Math.PI;
  const S = { projects: [], cur: null, prog: {}, paid: false, tab: "project", openList: null };
  const P = () => S.projects.find((p) => p.id === S.cur) || S.projects[0];
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      store.set("projects", JSON.stringify(S.projects));
      store.set("current", S.cur || "");
    }, 400);
  }
  const saveProg = () => store.set("prog_" + S.cur, JSON.stringify(S.prog[S.cur] || {}));

  /* ---------- API (Apps Script) ---------- */
  async function api(action, payload = {}) {
    if (!CFG.API_URL) throw new Error("no-api");
    const body = JSON.stringify({ action, initData: tg ? tg.initData : "", ...payload });
    const r = await fetch(CFG.API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body });
    return r.json();
  }
  async function checkAccess() {
    if (!CFG.API_URL) {
      const q = new URLSearchParams(location.search).get("paid");
      let demo = null; try { demo = localStorage.getItem("demoPaid"); } catch (_) {}
      S.paid = q === "1" || demo === "1";
    } else {
      try { const r = await api("access"); S.paid = !!r.paid; } catch (_) { /* оставляем как было */ }
    }
    const b = $("#accessBadge");
    b.textContent = S.paid ? "полный доступ" : "бесплатно";
    b.classList.toggle("paid", S.paid);
  }

  function toast(t) {
    const el = $("#toast"); el.textContent = t; el.classList.add("show");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }
  const haptic = (t = "light") => tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(t);

  function lockHtml(title, text) {
    return `<div class="lock"><b>${title}</b><span>${text}</span>
      <button class="btn" data-act="buy" type="button">Открыть полный доступ</button></div>`;
  }

  /* ---------- поля ввода ---------- */
  function field(k, label, opts = {}) {
    const p = P();
    const v = p[k] ?? "";
    const cls = opts.full ? "f full" : "f";
    if (opts.options) {
      return `<label class="${cls}">${label}<select data-k="${k}">${opts.options
        .map(([val, t]) => `<option value="${val}" ${String(v) === String(val) ? "selected" : ""}>${t}</option>`).join("")}</select></label>`;
    }
    return `<label class="${cls}">${label}<input data-k="${k}" type="${opts.text ? "text" : "number"}" inputmode="${opts.text ? "text" : "decimal"}"
      value="${v}" placeholder="${opts.ph || ""}"></label>`;
  }
  function bindFields(root, onChange) {
    root.querySelectorAll("[data-k]").forEach((el) => {
      el.addEventListener("input", () => {
        const k = el.dataset.k;
        const raw = el.value.replace(",", ".");
        P()[k] = el.tagName === "SELECT" || el.type === "text" ? el.value : raw === "" ? "" : Number(raw);
        if (k === "name") $("#projectName").textContent = P().name || "—";
        save(); onChange && onChange();
      });
    });
  }
  const num = (v, d) => (v === "" || v == null || isNaN(v) ? d : Number(v));

  /* ---------- вкладка: проект ---------- */
  function viewProject() {
    if (S.projMode === "est") return viewEstimate();
    const v = $("#view");
    const p = P();
    v.innerHTML = `<h2>Проект</h2>${projSeg("params")}
      <div class="card"><h3>Основание</h3><div class="grid">
        ${field("name", "Название", { full: true, text: true })}
        ${field("width", "Ширина, мм (поперёк конька)")}
        ${field("length", "Длина, мм (вдоль конька)")}
        ${field("box", "Стены", { options: [["gas", "Газобетон / пеноблок"], ["brick", "Кирпич"], ["timber", "Брус / бревно"], ["frame", "Каркас"]], full: true })}
      </div></div>
      <div class="card"><h3>Крыша</h3><div class="grid">
        <label class="f">Высота конька над мауэрлатом, мм<input data-height type="number" inputmode="decimal" value="${Math.round(heightOf(p))}"></label>
        ${field("over", "Свес по горизонтали, мм")}
        ${field("form", "Тип крыши", { options: [["gable", "Двускатная"], ["hip", "Вальмовая"]] })}
        ${field("material", "Кровельный материал", { options: MATERIALS.map((m) => [m.k, m.t]) })}
      </div><div id="slopeInfo"></div></div>
      <div class="card" id="advice"></div>`;
    bindFields(v, projectOut);
    $("[data-height]", v).addEventListener("input", (e) => {
      const raw = Number(String(e.target.value).replace(",", "."));
      if (raw > 0) { P().height = raw; save(); projectOut(); }
    });
    projectOut();
  }
  function projectOut() {
    const p = P();
    const mat = materialOf(p);
    const ang = angleOf(p);
    const okSlope = ang >= mat.min;
    $("#slopeInfo").innerHTML = `<div class="res" style="margin-top:12px">
        <span class="k">Уклон получается</span><span class="v big" style="color:${okSlope ? "inherit" : "var(--accent)"}">${fmt(ang, 1)}°</span>
        <span class="k">Минимум для материала</span><span class="v">${mat.min}°</span>
        <span class="k">Вес кровли</span><span class="v">${mat.w} кг/м²</span></div>
      ${okSlope ? "" : `<div class="warn">Уклон меньше минимального для «${mat.t}». Поднимите конёк хотя бы до ${f0((num(p.width, 8000) / 2) * Math.tan(rad(mat.min)))} мм или выберите другой материал.</div>`}`;
    const out = [];
    if (mat.heavy && (p.box === "timber" || p.box === "frame"))
      out.push(`<div class="warn">${mat.t} на ${p.box === "timber" ? "брусовом" : "каркасном"} доме: в книге (глава 2.8) объяснено, почему так делать не стоит. Выберите лёгкую кровлю.</div>`);
    if (p.box === "timber") out.push(`<p class="note">Брус садится: стропила крепите на скользящих опорах, стойки ставьте на компенсаторы усадки.</p>`);
    if (p.box === "gas") out.push(`<p class="note">Газобетон: нужен сплошной армопояс со шпильками и система без распора или с затяжкой внизу.</p>`);
    if (num(p.width, 0) / 2 > 6000) out.push(`<div class="warn">Пролёт больше 12 м без промежуточных опор: нужен расчёт конструктора.</div>`);
    if (ang > 50) out.push(`<p class="note">Уклон круче 50°: крыша будет высокой и парусной, проверьте, этого ли вы хотите.</p>`);
    $("#advice").innerHTML = `<h3>Что учесть</h3>${out.join("") || `<p class="note">Всё в порядке. Дальше — вкладка «Стропила».</p>`}`;
  }

  function projSeg(mode) {
    return `<div class="seg" style="margin-bottom:12px"><button type="button" data-pm="params" class="${mode === "params" ? "on" : ""}">Параметры</button><button type="button" data-pm="est" class="${mode === "est" ? "on" : ""}">Смета</button></div>`;
  }
  function viewEstimate() {
    const v = $("#view");
    const p = P();
      v.innerHTML = `<h2>Проект</h2>${projSeg("est")}
      <div class="card"><div class="grid">
        <label class="f full"><span><input type="checkbox" data-ins ${p.insulate ? "checked" : ""} style="width:auto;margin-right:8px;vertical-align:-2px">Утепляю скаты (мансарда)</span></label>
        ${field("wallH", "Высота стен до карниза, мм", { ph: "3000" })}
        ${field("step", "Шаг стропил, мм")}
      </div><p class="note">Цены впишите сами — они меняются, а количество посчитано по вашей крыше. Нормы расхода типовые: сверьте с инструкцией производителя материала.</p></div>
      <div id="estBody"></div>`;
    const draw = () => { $("#estBody").innerHTML = S.paid ? estimateHtml(p) : `<div class="card"><div class="locked-body">${estimateHtml({ ...DEFAULT, height: 2801, prices: {} }, true)}</div>${lockHtml("Смета", "Все материалы и крепёж: стропила, обрешётка, кровля, доборы, мембрана, водосток, уголки, шпильки, саморезы, гвозди, скобы.")}</div>`; };
    bindFields(v, draw);
    $("[data-ins]", v).addEventListener("change", (e) => { P().insulate = e.target.checked; save(); draw(); });
    v.addEventListener("input", (e) => {
      const inp = e.target.closest("[data-price]");
      if (!inp) return;
      const pp = P(); pp.prices = pp.prices || {};
      const val = Number(String(inp.value).replace(",", "."));
      if (inp.value === "" || isNaN(val)) delete pp.prices[inp.dataset.price]; else pp.prices[inp.dataset.price] = val;
      save(); updateEstTotals();
    });
    v.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-bought]");
      if (!cb) return;
      const pp = P(); pp.bought = pp.bought || {};
      if (cb.checked) pp.bought[cb.dataset.bought] = true; else delete pp.bought[cb.dataset.bought];
      save(); updateEstTotals(); haptic();
    });
    draw();
  }

  /* ---------- вкладка: карта стропил ---------- */
  function mapCalc(p) {
    const { r, ridge, gab, board, sp, run } = rafterCalc(false, p);
    const W = num(p.width, 8000), L = num(p.length, 10000), over = num(p.over, 0);
    const sec = C.rafterSection({ span: run, step: num(p.step, 600), roof: materialOf(p).heavy ? 110 : 50, snow: num(p.snow, 180), angle: r.angle });
    const s = sec.section || { b: 50, h: 200, label: "50×200" };
    const vol = (len, n, b = s.b, h = s.h) => (len / 1000) * (b / 1000) * (h / 1000) * n;
    const parts = [];
    const stdLen = (x) => C.BOARDS.find((b) => b >= x + 50) || null;
    if (p.form === "hip") {
      const hp = C.hip({ run, angle: r.angle, over, step: sp.step });
      const xs = [];
      for (let i = 0; i <= sp.intervals; i++) xs.push(i * sp.step);
      const common = xs.filter((x) => x >= run - 1 && x <= L - run + 1).length;
      parts.push({ name: "Стропила рядовые", n: common * 2 + 2, len: gab, sec: s.label, note: "включая 2 центральных на вальмах" });
      parts.push({ name: "Накосные стропила (спаренные)", n: 8, len: hp.hipWithOver + 100, sec: s.label, note: "4 угла × 2 доски" });
      hp.jacks.forEach((j) => parts.push({ name: `Нарожник №${j.n}`, n: 8, len: j.withOver + 150, sec: s.label }));
      if (ridge.type === "beam") parts.push({ name: "Коньковый прогон", n: 1, len: Math.max(L - 2 * run, 0), sec: "по расчёту" });
    } else {
      parts.push({ name: "Стропила", n: sp.rafters, len: gab, sec: s.label, note: `${sp.pairs} пар` });
      if (ridge.type === "beam") parts.push({ name: "Коньковый прогон", n: 1, len: L + 2 * over, sec: "по расчёту" });
    }
    const perim = 2 * (W + L);
    if (p.box !== "timber" && p.box !== "frame")       // на брусе роль мауэрлата играет верхний венец, на каркасе — обвязка
      parts.push({ name: "Мауэрлат 150×150", n: Math.ceil(perim / 6000) + 1, len: 6000, sec: "150×150", b: 150, h: 150, note: `периметр ${fmt(perim / 1000, 1)} м + запас на замки` });
    let total = 0;
    parts.forEach((q) => {
      q.board = q.len === 6000 ? 6000 : q.len <= 6000 ? stdLen(q.len) : null;
      const b = q.b || s.b, h = q.h || s.h;
      q.vol = q.sec === "по расчёту" ? 0 : vol(q.board || q.len, q.n, b, h);
      total += q.vol;
    });
    return { r, sp, run, W, L, over, parts, total, sec: s, secOk: !!sec.section };
  }
  function viewMap() {
    const v = $("#view");
    const p = P();
    const m = mapCalc(p);
    const plan = planSvg(p, m);
    const list = (mm2) => `<table class="parts"><tr><th>Деталь</th><th>Шт.</th><th>Длина</th><th>Доска</th></tr>
      ${mm2.parts.map((q) => `<tr><td>${q.name}${q.note ? `<small>${q.note}</small>` : ""}</td><td>${q.n}</td><td>${f0(q.len)}</td><td>${q.board ? fmt(q.board / 1000, 1) + " м" : q.len > 6000 ? "сращивать" : "—"}<small>${q.sec}</small></td></tr>`).join("")}
      </table>
      <div class="res" style="margin-top:10px"><span class="k">Лес всего (с запасом бери +10 %)</span><span class="v big">${fmt(mm2.total, 2)} м³</span></div>
      ${mm2.secOk ? "" : `<div class="warn">Сечение 50×200 взято условно: при таком пролёте нужен подкос или расчёт.</div>`}
      <button class="btn ghost" data-act="sendMap" type="button">Отправить карту в чат</button>`;
    const sample = mapCalc({ ...DEFAULT, height: 2801 });
    v.innerHTML = `<h2>Карта стропил</h2>
      <div class="card"><h3>План сверху</h3><p class="sub">${p.form === "hip" ? "Вальмовая" : "Двускатная"} · ${fmt(m.W / 1000, 1)} × ${fmt(m.L / 1000, 1)} м · шаг ${f0(m.sp.step)} мм. Нажмите, чтобы увеличить</p><div id="planBox">${plan}</div></div>
      <div class="card"><h3>Что пилить</h3><div id="cutBox">${S.paid ? list(m) : `<div class="locked-body">${list(sample)}</div>${lockHtml("Карта раскроя", "Все детали крыши с количеством, длинами, сечением и объёмом леса.")}`}</div></div>
      <div class="card"><h3>Шаг и снег</h3><div class="grid">
        ${field("step", "Шаг стропил, мм")}
        ${field("snow", "Снег", { options: [["100", "Мало"], ["180", "Средне"], ["250", "Много"], ["320", "Очень много"]] })}
      </div></div>`;
    bindFields(v, () => {                              // перерисовываем только план и список, поля не теряют фокус
      const p2 = P(), m2 = mapCalc(p2);
      $("#planBox").innerHTML = planSvg(p2, m2);
      if (S.paid) $("#cutBox").innerHTML = list(m2);
    });
    v.addEventListener("click", (e) => { const z = e.target.closest("svg.plan"); if (z) openZoom(z.outerHTML); });
  }

  /* ---------- смета ---------- */
  function estimateCalc(p) {
    const m = mapCalc(p);
    const rafterParts = m.parts.filter((q) => /^Стропила|^Накосные|^Нарожник/.test(q.name));
    const rafters = rafterParts.reduce((a, q) => a + q.n, 0);
    const rafterLenTotal = rafterParts.reduce((a, q) => a + q.n * q.len, 0);
    const splices = rafterParts.filter((q) => q.len > 6000).reduce((a, q) => a + q.n, 0);
    const hp = p.form === "hip" ? C.hip({ run: m.run, angle: m.r.angle, over: m.over, step: m.sp.step }) : null;
    const ridge = C.ridgeEnd({ run: m.run, angle: m.r.angle, h: m.r.h, type: p.ridge || "butt" });
    return C.estimate({
      W: m.W, L: m.L, angle: m.r.angle, over: m.over, form: p.form, material: p.material, step: m.sp.step,
      rafters, rafterLenTotal, hipLenTotal: hp ? hp.hipWithOver * 4 : 0, ridgeType: ridge.type, box: p.box,
      insulate: !!p.insulate, wallH: num(p.wallH, 3000), splices, pairs: Math.ceil(rafters / 2),
    });
  }
  function estimateHtml(p, sample = false) {
    const e = estimateCalc(p);
    const prices = p.prices || {}, bought = p.bought || {};
    const q = (x) => (Number.isInteger(x) ? f0(x) : fmt(x, 2));
    const rows = e.groups.map((g) => `<div class="card"><h3>${g.group}</h3><table class="parts est">
      ${g.items.map((it) => `<tr data-row="${it.key}" class="${bought[it.key] ? "bought" : ""}"><td class="cb"><input type="checkbox" data-bought="${it.key}" ${bought[it.key] ? "checked" : ""} ${sample ? "disabled" : ""} aria-label="Куплено"></td><td>${it.name}${it.note ? `<small>${it.note}</small>` : ""}</td>
        <td class="qty">${q(it.qty)}<small>${it.unit}</small></td>
        <td class="pr"><input data-price="${it.key}" data-qty="${it.qty}" type="number" inputmode="decimal" placeholder="цена" value="${prices[it.key] ?? ""}" ${sample ? "disabled" : ""}></td>
        <td class="sum" data-sum="${it.key}"></td></tr>`).join("")}
      </table><div class="res"><span class="k">Итого по разделу</span><span class="v" data-gsum="${g.group}">—</span></div></div>`).join("");
    setTimeout(updateEstTotals, 0);
    return `<div class="card"><div class="res">
        <span class="k">Площадь кровли по скатам</span><span class="v">${fmt(e.area, 1)} м²</span>
        <span class="k">Карниз / конёк</span><span class="v">${fmt(e.eave, 1)} / ${fmt(e.ridge, 1)} м</span>
        <hr><span class="k">Итого по смете</span><span class="v big" id="estTotal">—</span>
        <span class="k">Куплено</span><span class="v" id="estBought">—</span>
        <span class="k">Осталось купить</span><span class="v" id="estLeft">—</span>
      </div>
      <div class="bar"><i id="estBar" style="width:0%"></i></div>
      ${sample ? "" : `<button class="btn" data-act="printEst" type="button">Версия для печати (PDF)</button>
      <button class="btn ghost" data-act="sendEst" type="button">Отправить смету в чат текстом</button>`}</div>${rows}`;
  }
  function updateEstTotals() {
    let total = 0, filled = 0, boughtSum = 0, nItems = 0, nBought = 0;
    const groups = {};
    document.querySelectorAll("[data-price]").forEach((inp) => {
      const key = inp.dataset.price;
      const price = Number(String(inp.value).replace(",", "."));
      const qty = Number(inp.dataset.qty);
      const cell = document.querySelector(`[data-sum="${key}"]`);
      const cb = document.querySelector(`[data-bought="${key}"]`);
      const isB = cb && cb.checked;
      const row = document.querySelector(`[data-row="${key}"]`);
      if (row) row.classList.toggle("bought", !!isB);
      nItems++; if (isB) nBought++;
      const grp = inp.closest(".card").querySelector("[data-gsum]").dataset.gsum;
      groups[grp] = groups[grp] || 0;
      if (inp.value !== "" && !isNaN(price)) {
        const s = price * qty; total += s; groups[grp] += s; filled++;
        if (isB) boughtSum += s;
        if (cell) cell.textContent = f0(s);
      } else if (cell) cell.textContent = "";
    });
    document.querySelectorAll("[data-gsum]").forEach((el) => { el.textContent = groups[el.dataset.gsum] ? `${f0(groups[el.dataset.gsum])} ₽` : "—"; });
    const set = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    set("#estTotal", filled ? `${f0(total)} ₽` : "впишите цены");
    set("#estBought", `${nBought} из ${nItems}${filled ? ` · ${f0(boughtSum)} ₽` : ""}`);
    set("#estLeft", `${nItems - nBought} поз.${filled ? ` · ${f0(total - boughtSum)} ₽` : ""}`);
    const bar = $("#estBar"); if (bar) bar.style.width = `${nItems ? (nBought / nItems) * 100 : 0}%`;
  }
  async function sendEst() {
    const p = P(), e = estimateCalc(p), prices = p.prices || {}, bought = p.bought || {};
    let total = 0;
    const lines = e.groups.map((g) => `— ${g.group} —\n` + g.items.map((it) => {
      const pr = prices[it.key];
      const s = pr != null ? pr * it.qty : null;
      if (s) total += s;
      return `${bought[it.key] ? "✅" : "⬜"} ${it.name}: ${Number.isInteger(it.qty) ? it.qty : fmt(it.qty, 2)} ${it.unit}${s ? ` = ${f0(s)} ₽` : ""}`;
    }).join("\n")).join("\n\n");
    const text = `Смета · ${p.name}\nКровля ${fmt(e.area, 1)} м², ${materialOf(p).t}\n\n${lines}${total ? `\n\nИтого: ${f0(total)} ₽` : ""}`;
    if (CFG.API_URL && tg) {
      try { const res = await api("sendText", { text: text.slice(0, 4000) }); if (res.ok) return toast("Смета в чате"); } catch (_) {}
    }
    try { await navigator.clipboard.writeText(text); toast("Скопировано"); } catch (_) { toast("Не удалось отправить"); }
  }
  /* смета для печати: A4, таблица с квадратиками «куплено», рисуется на canvas (кириллица без встраивания шрифтов) */
  async function printEst() {
    if (!window.jspdf) return toast("Не загрузилась библиотека PDF. Проверьте интернет.");
    const p = P(), e = estimateCalc(p), prices = p.prices || {}, bought = p.bought || {};
    const PX = 6, PW = 210, PH = 297, MX = 14, top0 = 16, bottom = PH - 14;
    const cols = { cb: MX, name: MX + 9, qty: 128, unit: 131, price: 160, sum: PW - MX };   // мм
    const pages = [];
    let cv, g, y;
    const font = (sz, w = 400) => `${w} ${sz * PX}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    const newPage = () => {
      cv = document.createElement("canvas"); cv.width = PW * PX; cv.height = PH * PX;
      g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      g.fillStyle = "#1d1d1b"; g.textBaseline = "alphabetic";
      pages.push(cv); y = top0;
    };
    const text = (t, x, yy, sz, opt = {}) => {
      g.font = font(sz, opt.w || 400); g.fillStyle = opt.c || "#1d1d1b"; g.textAlign = opt.a || "left";
      g.fillText(t, x * PX, yy * PX);
    };
    const wrap = (t, maxMm, sz) => {
      g.font = font(sz); const words = String(t).split(" "); const lines = []; let cur = "";
      for (const w of words) { const tryS = cur ? cur + " " + w : w; if (g.measureText(tryS).width / PX > maxMm && cur) { lines.push(cur); cur = w; } else cur = tryS; }
      if (cur) lines.push(cur); return lines;
    };
    const hline = (yy, c = "#d9d5cc", w = 0.25) => { g.strokeStyle = c; g.lineWidth = w * PX; g.beginPath(); g.moveTo(MX * PX, yy * PX); g.lineTo((PW - MX) * PX, yy * PX); g.stroke(); };
    const q = (x) => (Number.isInteger(x) ? f0(x) : fmt(x, 2));
    newPage();
    // шапка
    text("Смета на кровлю", MX, y + 6, 6.5, { w: 800 }); y += 12;
    text(`${p.name} · ${p.form === "hip" ? "вальмовая" : "двускатная"} · ${fmt(num(p.width, 0) / 1000, 1)} × ${fmt(num(p.length, 0) / 1000, 1)} м · уклон ${fmt(angleOf(p), 1)}°`, MX, y, 3.6, { c: "#444" }); y += 5.5;
    text(`${materialOf(p).t} · площадь скатов ${fmt(e.area, 1)} м² · ${new Date().toLocaleDateString("ru-RU")}`, MX, y, 3.6, { c: "#444" }); y += 7;
    let total = 0, boughtSum = 0, nB = 0, nAll = 0;
    for (const grp of e.groups) {
      if (y > bottom - 20) newPage();
      text(grp.group.toUpperCase(), MX, y + 4, 3.4, { w: 700, c: "#b8322a" }); y += 6;
      hline(y, "#1d1d1b", 0.35); y += 1;
      text("Наименование", cols.name, y + 3.6, 2.8, { c: "#888" }); text("Кол-во", cols.qty, y + 3.6, 2.8, { c: "#888", a: "right" });
      text("Цена", cols.price, y + 3.6, 2.8, { c: "#888", a: "right" }); text("Сумма", cols.sum, y + 3.6, 2.8, { c: "#888", a: "right" }); y += 5;
      for (const it of grp.items) {
        const lines = wrap(it.name, cols.qty - cols.name - 16, 3.4);
        const noteLines = it.note ? wrap(it.note, cols.qty - cols.name - 16, 2.7) : [];
        const hRow = 2.2 + lines.length * 4.4 + noteLines.length * 3.4 + 1.6;
        if (y + hRow > bottom) { newPage(); }
        const pr = prices[it.key];
        const sum = pr != null ? pr * it.qty : null;
        const isB = !!bought[it.key];
        nAll++; if (isB) nB++;
        if (sum) { total += sum; if (isB) boughtSum += sum; }
        // квадратик
        g.strokeStyle = "#1d1d1b"; g.lineWidth = 0.35 * PX; g.strokeRect(cols.cb * PX, (y + 1.6) * PX, 4.2 * PX, 4.2 * PX);
        if (isB) { g.lineWidth = 0.6 * PX; g.beginPath(); g.moveTo((cols.cb + 0.8) * PX, (y + 3.8) * PX); g.lineTo((cols.cb + 1.8) * PX, (y + 5) * PX); g.lineTo((cols.cb + 3.6) * PX, (y + 2.2) * PX); g.stroke(); }
        let yy = y + 5;
        lines.forEach((ln) => { text(ln, cols.name, yy, 3.4, { c: isB ? "#888" : "#1d1d1b" }); yy += 4.4; });
        noteLines.forEach((ln) => { text(ln, cols.name, yy - 0.6, 2.7, { c: "#888" }); yy += 3.4; });
        text(q(it.qty), cols.qty, y + 5, 3.4, { a: "right", w: 600 });
        text(it.unit, cols.unit, y + 5, 2.8, { c: "#666" });
        text(pr != null ? f0(pr) : "______", cols.price, y + 5, 3.2, { a: "right", c: pr != null ? "#1d1d1b" : "#bbb" });
        text(sum ? f0(sum) : "", cols.sum, y + 5, 3.4, { a: "right", w: 600 });
        y += hRow; hline(y);
      }
      y += 4;
    }
    if (y > bottom - 26) newPage();
    hline(y, "#1d1d1b", 0.5); y += 7;
    text("Итого по смете", MX, y, 4.2, { w: 700 }); text(total ? `${f0(total)} ₽` : "впишите цены", cols.sum, y, 4.6, { w: 800, a: "right" }); y += 6.5;
    text(`Куплено: ${nB} из ${nAll} позиций`, MX, y, 3.4); text(total ? `${f0(boughtSum)} ₽` : "", cols.sum, y, 3.4, { a: "right" }); y += 5.5;
    text(`Осталось купить: ${nAll - nB}`, MX, y, 3.4); text(total ? `${f0(total - boughtSum)} ₽` : "", cols.sum, y, 3.4, { a: "right" }); y += 8;
    text("Количество посчитано по размерам крыши с типовым запасом. Сверьте нормы расхода с инструкцией производителя.", MX, y, 2.7, { c: "#888" });
    // номера страниц
    pages.forEach((c, i) => { g = c.getContext("2d"); text(`Крыша без переделок · смета · лист ${i + 1} из ${pages.length}`, PW / 2, PH - 7, 2.6, { c: "#999", a: "center" }); });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    pages.forEach((c, i) => { if (i) doc.addPage(); doc.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, PW, PH, undefined, "FAST"); });
    const fname = `smeta_${(p.name || "krysha").replace(/[^\wа-яё]+/gi, "_")}.pdf`;
    if (CFG.API_URL && tg) {
      try {
        toast("Отправляю PDF в чат…");
        const res = await api("sendDoc", { filename: fname, caption: `Смета: ${p.name}. Печать на A4.`, data: doc.output("datauristring").split(",")[1] });
        if (res.ok) { toast("Смета в чате с ботом"); haptic("medium"); return; }
      } catch (_) { /* скачаем файлом */ }
    }
    doc.save(fname);
  }
  function planSvg(p, m) {
    const Wm = m.W, Lm = m.L, ov = m.over, run = m.run;
    const VW = 1000, pad = 70;
    const k = Math.min((VW - 2 * pad) / (Lm + 2 * ov), 560 / (Wm + 2 * ov));
    const ox = pad + ov * k, oy = 50 + ov * k;
    const X = (x) => ox + x * k, Y = (y) => oy + y * k;
    const H = Y(Wm + ov) + 80;
    let g = `<rect x="${X(-ov)}" y="${Y(-ov)}" width="${(Lm + 2 * ov) * k}" height="${(Wm + 2 * ov) * k}" fill="none" stroke="${BLUE}" stroke-width="2" stroke-dasharray="6 6"/>
      <rect x="${X(0)}" y="${Y(0)}" width="${Lm * k}" height="${Wm * k}" fill="#f6f2ea" stroke="${INKC}" stroke-width="2.5"/>`;
    const n = m.sp.intervals;
    const raf = (x1, y1, x2, y2, c = "#c99a5b", w = 5) => `<line x1="${X(x1).toFixed(1)}" y1="${Y(y1).toFixed(1)}" x2="${X(x2).toFixed(1)}" y2="${Y(y2).toFixed(1)}" stroke="${c}" stroke-width="${w}"/>`;
    if (p.form === "hip") {
      for (let i = 0; i <= n; i++) {
        const x = i * m.sp.step;
        if (x >= run - 1 && x <= Lm - run + 1) { g += raf(x, -ov, x, Wm / 2) + raf(x, Wm + ov, x, Wm / 2); }
        else { const d = Math.min(x, Lm - x); if (d > 30) { g += raf(x, -ov, x, d, "#ddc193", 4) + raf(x, Wm + ov, x, Wm - d, "#ddc193", 4); } }
      }
      for (let y = m.sp.step; y < Wm - 1; y += m.sp.step) {
        const d = Math.min(y, Wm - y);
        g += raf(-ov, y, d, y, "#ddc193", 4) + raf(Lm + ov, y, Lm - d, y, "#ddc193", 4);
      }
      g += raf(-ov, Wm / 2, run, Wm / 2) + raf(Lm + ov, Wm / 2, Lm - run, Wm / 2);
      [[0, 0, run, Wm / 2], [0, Wm, run, Wm / 2], [Lm, 0, Lm - run, Wm / 2], [Lm, Wm, Lm - run, Wm / 2]].forEach(([a, b, c2, d]) => { g += raf(a, b, c2, d, "#8a4b2a", 9); });
      g += raf(run, Wm / 2, Lm - run, Wm / 2, INKC, 4);
    } else {
      for (let i = 0; i <= n; i++) {
        const x = i * m.sp.step;
        g += raf(x, -ov, x, Wm + ov);
        if (i % 2 === 0 || i === n) g += `<text x="${X(x).toFixed(1)}" y="${(Y(-ov) - 12).toFixed(1)}" font-size="22" text-anchor="middle" fill="#6f6c66">${i + 1}</text>`;
      }
      g += raf(-ov, Wm / 2, Lm + ov, Wm / 2, INKC, 4);
    }
    g += arrowDim([X(0), Y(Wm + ov)], [X(Lm), Y(Wm + ov)], `${f0(Lm)}`, 34, { fs: 26 });
    g += arrowDim([X(-ov), Y(0)], [X(-ov), Y(Wm)], `${f0(Wm)}`, 30, { fs: 26 });
    return `<svg class="draw plan" viewBox="0 0 ${VW} ${H.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">${g}</svg>`;
  }

  /* ---------- вкладка: книга ---------- */
  function viewBook() {
    const v = $("#view");
    const toc = (window.CHECKLISTS || []).filter((c) => c.chapter <= 15).map((c) => `<div class="list-row"><span>Глава ${c.chapter}</span><span style="text-align:right">${c.title}</span></div>`).join("");
    v.innerHTML = `<h2>Книга</h2>
      <div class="card book-hero"><div class="book-kicker">Инструкция кровельщика</div>
        <div class="book-title">Крыша без переделок</div>
        <p>Как самому выбрать, рассчитать и собрать крышу, которую не придётся переделывать. 94 страницы, 36 чертежей узлов, чек-листы на каждый этап.</p>
        ${CFG.BOOK_URL ? `<button class="btn" data-act="book" type="button">Купить книгу</button>` : `<p class="note">Ссылка на покупку появится здесь.</p>`}
      </div>
      <div class="card"><h3>Доступ к приложению</h3>
        <p>${S.paid ? "У вас полный доступ навсегда. Спасибо!" : "Бесплатно: проект, уклон и длина стропил, план сверху, первый чек-лист, часть советов. Полный доступ открывает разметку доски и кондуктор, карту раскроя, сечения, все чек-листы, советы и чертежи."}</p>
        ${S.paid ? "" : `<button class="btn" data-act="buy" type="button">Полный доступ за ${CFG.PRICE_STARS || 350} ⭐</button>
          <p class="note">Купили книгу? Введите код из письма:</p>
          <input id="code" type="text" placeholder="ROOF-XXXXXX или промокод" autocapitalize="characters">
          <button class="btn ghost" data-act="redeem" type="button">Активировать код</button>`}
      </div>
      <div class="card"><h3>Содержание</h3>${toc}<div class="list-row"><span>Приложения</span><span style="text-align:right">Словарь, таблицы, бланки, сводный чек-лист</span></div></div>
      ${CFG.AUTHOR_CONTACT ? `<div class="card"><button class="btn ghost" data-act="author" type="button">Написать автору</button></div>` : ""}
      ${!CFG.API_URL ? `<div class="card"><h3>Демо-режим</h3><p class="note" style="margin-top:0">Сервер не подключён. Переключите доступ для проверки.</p>
        <button class="btn ghost" data-act="demo" type="button">${S.paid ? "Выключить" : "Включить"} полный доступ</button></div>` : ""}`;
  }

  /* ---------- вкладка: советы и чертежи ---------- */
  const FREE_TIPS = 6;
  function viewTips() {
    const v = $("#view");
    const tips = window.TIPS || [];
    const draws = window.DRAWINGS || [];
    const tipHtml = (t, i) => {
      const locked = !S.paid && i >= FREE_TIPS;
      return `<div class="tip ${t.kind}${locked ? " locked" : ""}"><div class="tip-kind">${t.kind === "hack" ? "Лайфхак" : "Ошибка"}${t.title ? ` · ${t.title}` : ""}</div>
        <div class="tip-text">${locked ? "Откройте полный доступ, чтобы прочитать." : t.text}</div><div class="tip-src">${t.ch ? `Глава ${t.ch}` : "Введение"}</div></div>`;
    };
    v.innerHTML = `<h2>Советы и чертежи</h2>
      <div class="seg" id="tipSeg"><button type="button" class="on" data-ts="tips">Советы (${tips.length})</button><button type="button" data-ts="draw">Чертежи (${draws.length})</button></div>
      <div id="tipBody" style="margin-top:12px"></div>`;
    const show = (w) => {
      v.querySelectorAll("[data-ts]").forEach((b) => b.classList.toggle("on", b.dataset.ts === w));
      $("#tipBody").innerHTML = w === "tips"
        ? tips.map(tipHtml).join("") + (S.paid ? "" : `<button class="btn" data-act="buy" type="button">Открыть все ${tips.length} советов</button>`)
        : `<div class="card">${draws.map((d) => `<div class="cl-item" data-draw="${d.file}" data-free="${d.free ? 1 : 0}"><div class="t">${d.title}<small>${d.free || S.paid ? "открыть" : "🔒 полный доступ"}</small></div><span style="color:var(--hint)">›</span></div>`).join("")}</div>`;
    };
    v.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-ts]");
      if (b) return show(b.dataset.ts);
      const d = e.target.closest("[data-draw]");
      if (d) {
        if (d.dataset.free !== "1" && !S.paid) return buy();
        try { openZoom(await (await fetch(d.dataset.draw)).text()); } catch (_) { toast("Не удалось открыть чертёж"); }
      }
    });
    show("tips");
  }

  /* ---------- вкладка: стропила ---------- */
  // буквы на схеме: какое поле проекта правит каждая. Уклон можно задать углом Q или высотой H.
  const LETTERS = {
    A: { k: "h", t: "A — высота доски", u: "мм" },
    Q: { k: "height", t: "Q — уклон. Высота конька H пересчитается сама", u: "°",
      get: (p) => Math.round(angleOf(p) * 10) / 10,
      set: (v, p) => Math.round((num(p.width, 8000) / 2) * Math.tan(rad(Math.min(v, 75)))) },
    H: { k: "height", t: "H — высота конька над мауэрлатом. Уклон Q пересчитается сам", u: "мм",
      get: (p) => Math.round(heightOf(p)) },
    C: { k: "width", t: "C — заложение: от наружной грани мауэрлата до оси конька", u: "мм", get: (p) => num(p.width, 8000) / 2, set: (v) => v * 2 },
    D: { k: "over", t: "D — свес по горизонтали", u: "мм" },
    d: { k: "d", t: "d — глубина опорного запила (пусто — четверть доски)", u: "мм", allowEmpty: true },
    M: { k: "plate", t: "M — ширина мауэрлата", u: "мм" },
  };
  const RIDGES = [["butt", "Встык"], ["beam", "На прогон"]];

  function viewRafter() {
    const v = $("#view");
    const p = P();
    v.innerHTML = `<h2>Стропила</h2>
      <div class="card bp-card"><div id="bp"></div><p class="bp-hint">Нажмите на букву, чтобы ввести размер. Уклон задаётся буквой Q или H.</p></div>
      <div class="card"><h3>Соединение в коньке</h3>
        <div class="seg" id="ridgeSeg">${RIDGES.map(([k, t]) => `<button type="button" data-ridge="${k}" class="${(p.ridge || "butt") === k ? "on" : ""}">${t}</button>`).join("")}</div>
        <div id="ridgeFields" class="grid" style="margin-top:10px;${(p.ridge || "butt") === "beam" ? "" : "display:none"}">
          ${field("beamW", "Ширина прогона, мм", { ph: "150" })}
          ${field("dr", "Запил в коньке, мм", { ph: "авто" })}
        </div>
        <p class="note" id="ridgeNote"></p>
      </div>
      <div id="out"></div>
      <div class="card"><h3>Сращивание доски</h3><p class="sub">Рекомендация автора: косой замок с двумя упорами. Нажмите на чертёж, чтобы увеличить</p><div id="splice"></div>
        <p class="note">Стык располагают над опорой или рядом с ней. Крепёж — два шурупа или болта навстречу друг другу, через упоры, как показано стрелками.</p></div>`;
    bindFields(v, rafterOut);
    v.addEventListener("click", (e) => {
      const t = e.target.closest("[data-letter]");
      if (t) return editLetter(t.dataset.letter);
      const z = e.target.closest("svg.board");
      if (z) return openZoom(z.outerHTML);
      const rb = e.target.closest("[data-ridge]");
      if (rb) {
        P().ridge = rb.dataset.ridge; save();
        v.querySelectorAll("[data-ridge]").forEach((b) => b.classList.toggle("on", b === rb));
        $("#ridgeFields").style.display = rb.dataset.ridge === "beam" ? "" : "none";
        rafterOut(); haptic();
      }
    });
    rafterOut();
  }
  function secLabel(p, run, r) {
    const sec = C.rafterSection({ span: run, step: num(p.step, 600), roof: materialOf(p).heavy ? 110 : 50, snow: num(p.snow, 180), angle: r.angle });
    if (!sec.section) return sec.withStrut ? `с подкосом ${sec.withStrut.label}` : "нужен расчёт";
    return sec.withStrut && sec.withStrut.b * sec.withStrut.h < sec.section.b * sec.section.h ? `${sec.section.label} (с подкосом ${sec.withStrut.label})` : sec.section.label;
  }
  function fitSvg(svg) {        // длинные чертежи — 1500 px с прокруткой, компактные — по ширине экрана
    const vb = (svg.match(/viewBox="([^"]+)"/) || [])[1];
    const [, , w, h] = vb ? vb.split(/\s+/).map(Number) : [0, 0, 1, 1];
    const wide = w / h > 2.6;
    return svg.replace(/^(<svg[^>]*?)\s*class="[^"]*"/, "$1").replace(/^(<svg[^>]*?)\s(width|height)="[^"]*"/, "$1").replace(/^(<svg[^>]*?)\s(width|height)="[^"]*"/, "$1")
      .replace("<svg", `<svg class="zoomed" style="width:${wide ? "1500px" : "100%"};max-width:${wide ? "none" : "900px"}"`);
  }
  function openZoom(svg) {
    const bg = document.createElement("div");
    bg.className = "zoom";
    bg.innerHTML = `<div class="zoom-bar"><span>Прокрутите в сторону · удобнее держать телефон горизонтально</span><button type="button" data-close>Закрыть</button></div>
      <div class="zoom-body">${fitSvg(svg)}</div>`;
    document.body.appendChild(bg);
    if (tg && tg.BackButton) { tg.BackButton.show(); tg.BackButton.onClick(function cl() { bg.remove(); tg.BackButton.hide(); tg.BackButton.offClick(cl); }); }
    bg.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) { bg.remove(); if (tg && tg.BackButton) tg.BackButton.hide(); } });
  }
  function editLetter(L) {
    const def = LETTERS[L];
    if (!def) return;
    const p = P();
    const cur = def.get ? def.get(p) : p[def.k];
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>${def.t}</h3>
      <input id="letterIn" type="number" inputmode="decimal" value="${cur === "" || cur == null ? "" : cur}" placeholder="${def.allowEmpty ? "авто" : ""}">
      <button class="btn" type="button" data-ok>Готово, ${def.u}</button></div>`;
    document.body.appendChild(bg);
    const inp = $("#letterIn", bg);
    setTimeout(() => inp.focus(), 50);
    const done = () => {
      const raw = inp.value.replace(",", ".").trim();
      if (raw === "" && def.allowEmpty) p[def.k] = "";
      else if (raw !== "" && !isNaN(raw) && Number(raw) > 0) p[def.k] = def.set ? def.set(Number(raw), p) : Number(raw);
      save(); bg.remove(); rafterOut(); haptic();
    };
    bg.addEventListener("click", (e) => {
      if (e.target === bg) bg.remove();
      if (e.target.closest("[data-ok]")) done();
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); });
  }
  function rafterCalc(sample = false, pp = null) {
    const p = sample ? { ...DEFAULT, height: 2801, ridge: P().ridge } : pp || P();
    const run = num(p.width, 8000) / 2;
    const r = C.rafter({ run, angle: angleOf(p), over: num(p.over, 0), h: num(p.h, 200),
      d: p.d === "" ? null : num(p.d, null), plate: num(p.plate, 150) });
    const ridge = C.ridgeEnd({ run, angle: r.angle, h: r.h, type: p.ridge || "butt", beamW: num(p.beamW, 150), dr: p.dr === "" ? null : num(p.dr, null) });
    const xmin = -r.lenOver, xmax = Math.max(...ridge.pts.map((q) => q[0]));
    const gab = xmax - xmin;
    const board = C.BOARDS.find((b) => b >= gab + 50) || null;
    const sp = C.spacing({ length: num(p.length, 10000), step: num(p.step, 600) });
    return { p, r, ridge, gab, board, sp, run };
  }
  function rafterOut() {
    const { p, r, ridge, gab, board, sp, run } = rafterCalc();
    $("#bp").innerHTML = blueprintSvg(r, run);
    $("#splice").innerHTML = spliceSvg(r.h);
    $("#ridgeNote").textContent = ridge.type === "beam"
      ? "Стропило опирается на коньковый прогон: нижний упор в грань прогона, площадка на прогоне, верхний рез по оси конька — встык с парным стропилом."
      : "Пара стропил сходится на оси конька резами по отвесу. Стык закрывают накладками с двух сторон или пластинами.";
    const sl = C.slope({ angle: r.angle });
    let html = `<div class="card"><h3>Длина стропила</h3><div class="res">
        <span class="k">Уклон</span><span class="v">${fmt(r.angle, 1)}° · ${fmt(sl.percent)} %</span>
        <span class="k">H — высота конька над мауэрлатом</span><span class="v">${mm(r.rise)}</span>
        <hr><span class="k">Габарит доски с резами</span><span class="v big">${mm(gab)}</span>
        <span class="k">Брать доску</span><span class="v">${board ? m(board) : "сращивать"}</span>
        <span class="k">Сечение доски</span><span class="v">${S.paid ? secLabel(p, run, r) : "🔒"}</span>
        <hr><span class="k">Стропильных пар</span><span class="v">${sp.pairs} (${sp.rafters} шт.)</span>
        <span class="k">Фактический шаг</span><span class="v">${mm(sp.step)}</span>
      </div>
      <button class="btn ghost" data-act="sendRafter" type="button">Отправить расчёт в чат</button></div>`;

    const smp = S.paid ? { r, ridge } : rafterCalc(true);     // под замком — пример из книги
    const rr = smp.r, rg = smp.ridge;
    const warns = rr.warnings.concat(rg.warnings);
    const layout = `<h3>Разметка доски</h3><p class="sub">Нажмите на чертёж, чтобы увеличить</p>${boardSvg(rr, rg)}
      <div class="res">
        <span class="k">От торца свеса до запила (по низу)</span><span class="v">${mm(rr.lenOver)}</span>
        <span class="k">Угол торцевых резов к кромке</span><span class="v">${fmt(rr.plumbAngleToEdge, 1)}°</span>
        <span class="k">Опорный запил: глубина / площадка</span><span class="v">${mm(rr.d)} / ${mm(rr.seat)}</span>
        ${rg.type === "beam" ? `<span class="k">Запил в коньке: упор / площадка</span><span class="v">${mm(rg.lowerFace)} / ${mm(rg.seat)}</span>` : ""}
      </div>
      ${warns.map((w) => `<div class="warn">${w}</div>`).join("")}
      <button class="btn" data-act="jig" type="button">Кондуктор 1:1 для печати (PDF)</button>
      <p class="note">Шаблон печатается на листах A4 в натуральную величину. На последнем листе контрольный квадрат 50 мм: проверьте его линейкой, прежде чем вырезать.</p>`;
    html += `<div class="card">${S.paid ? layout : `<div class="locked-body">${layout}</div>${lockHtml("Разметка и кондуктор", "Развёртка доски со всеми размерами, запилы на мауэрлате и в коньке, шаблон для печати 1:1.")}`}</div>`;

    if (p.form === "hip") {
      const hp = S.paid ? C.hip({ run, angle: r.angle, over: num(p.over, 0), step: sp.step }) : C.hip({ run: 4000, angle: 35, over: 500, step: 588 });
      const hipHtml = `<h3>Вальма</h3><div class="res">
          <span class="k">Накосное стропило</span><span class="v">${mm(hp.hipLen)}</span>
          <span class="k">Накосное со свесом</span><span class="v">${mm(hp.hipWithOver)}</span>
          <span class="k">Уклон накосного</span><span class="v">${fmt(hp.hipAngle, 1)}°</span>
          <span class="k">Нарожники короче на</span><span class="v">${mm(hp.decrement)}</span></div>
        <h3 style="margin-top:12px">Нарожники (без свеса / со свесом)</h3>
        ${hp.jacks.map((j) => `<div class="list-row"><span>№ ${j.n}</span><span>${mm(j.len)} / ${mm(j.withOver)}</span></div>`).join("")}
        <p class="note">Верх нарожника режется двойным углом: по вертикали под уклоном ${fmt(r.angle, 1)}° и в плане под 45°. Накосное стропило делайте спаренным.</p>`;
      html += `<div class="card">${S.paid ? hipHtml : `<div class="locked-body">${hipHtml}</div>${lockHtml("Вальма", "Длина накосного стропила и нарожников по порядку.")}`}</div>`;
    }
    $("#out").innerHTML = html;
  }

  /* --- общие примитивы чертежей --- */
  const WH = "#ffffff", WD = "rgba(255,255,255,.55)", INKC = "#1d1d1b", RED = "#e0262b", BLUE = "#1a9be0";
  const f0 = (v) => Math.round(v).toLocaleString("ru-RU");
  function ln(x1, y1, x2, y2, w = 1.4, c = WH, dash = "") {
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  }
  function tick(x, y, c = WH, len = 5) {
    return ln(x - len * 0.7, y + len * 0.7, x + len * 0.7, y - len * 0.7, 1.2, c);
  }
  function dimLine(x1, y1, x2, y2, c = WH) {
    return ln(x1, y1, x2, y2, 1, c) + tick(x1, y1, c) + tick(x2, y2, c);
  }
  function tag(x, y, L, val, anchor = "middle") {
    const label = `${L} ${val}`;
    const wPx = 12 + label.length * 7;
    const x0 = anchor === "middle" ? x - wPx / 2 : anchor === "end" ? x - wPx : x;
    return `<g class="bp-tag" data-letter="${L}">
      <rect x="${x0.toFixed(1)}" y="${(y - 13).toFixed(1)}" width="${wPx.toFixed(1)}" height="19" rx="9.5"/>
      <text x="${(x0 + wPx / 2).toFixed(1)}" y="${(y + 1).toFixed(1)}" text-anchor="middle">${label}</text></g>`;
  }
  /* размер-стрелка в стиле чертежей автора: линия со стрелками на концах и числом вдоль неё */
  function arrowDim(p1, p2, label, off = 0, opt = {}) {
    const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy * off, ny = ux * off;
    const a = [p1[0] + nx, p1[1] + ny], b = [p2[0] + nx, p2[1] + ny];
    const hs = opt.head || 14, hw = hs * 0.42;
    const head = (q, sx, sy) => `<polygon points="${q[0]},${q[1]} ${(q[0] - sx * hs - sy * hw).toFixed(1)},${(q[1] - sy * hs + sx * hw).toFixed(1)} ${(q[0] - sx * hs + sy * hw).toFixed(1)},${(q[1] - sy * hs - sx * hw).toFixed(1)}" fill="${INKC}"/>`;
    let ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    const fs = opt.fs || 26;
    const sg = off === 0 ? -1 : Math.sign(off);
    const lo = opt.labelOff == null ? fs * 0.75 : opt.labelOff;
    const nnx = -uy, nny = ux;                              // единичная нормаль
    const tx = (a[0] + b[0]) / 2 + nnx * sg * lo, ty = (a[1] + b[1]) / 2 + nny * sg * lo + fs * 0.35;
    const ext = opt.ext === false ? "" : (Math.abs(off) > 2 ? ln(p1[0], p1[1], a[0] + nx * 0.15, a[1] + ny * 0.15, 0.8, "#999") + ln(p2[0], p2[1], b[0] + nx * 0.15, b[1] + ny * 0.15, 0.8, "#999") : "");
    return `${ext}<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke="${INKC}" stroke-width="2.4"/>
      ${head(a, -ux, -uy)}${head(b, ux, uy)}
      <text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${fs}" text-anchor="middle" fill="${INKC}" paint-order="stroke" stroke="#fff" stroke-width="6" transform="rotate(${ang.toFixed(1)} ${tx.toFixed(1)} ${(ty - fs * 0.35).toFixed(1)})">${label}</text>`;
  }

  /* --- схема-синька: узел стропила с буквами-размерами (схематично, не в масштабе) --- */
  function blueprintSvg(r, run) {
    const A = rad(25), t = Math.tan(A), sn = Math.sin(A), cs = Math.cos(A);
    const P = [80, 168], th = 24;
    const xe = 24, xr = 300;
    const dS = 13;
    const V = [P[0], P[1] + dS], Hn = [P[0] + dS / t, P[1]];
    const yb2 = (x) => V[1] - (x - V[0]) * t;
    const eb = [xe, yb2(xe)], rb = [xr, yb2(xr)];
    const etop = [xe, yb2(xe) - th / cs], rtop = [xr, yb2(xr) - th / cs];
    const rafter = `M${eb[0]},${eb[1].toFixed(1)} L${V[0]},${V[1]} L${P[0]},${P[1]} L${Hn[0].toFixed(1)},${Hn[1]} L${rb[0]},${rb[1].toFixed(1)} L${rtop[0]},${rtop[1].toFixed(1)} L${etop[0]},${etop[1].toFixed(1)} Z`;
    const pw = 40, ph = 44;
    let hatch = "";
    for (let i = -ph; i < pw; i += 9) {
      const x1 = Math.max(0, i), y1 = Math.max(0, -i);
      const x2 = Math.min(pw, i + ph);
      hatch += ln(P[0] + x1, P[1] + ph - y1, P[0] + x2, P[1] + ph - (x2 - i), 0.8, WD);
    }
    const plate = `<rect x="${P[0]}" y="${P[1]}" width="${pw}" height="${ph}" fill="none" stroke="${WH}" stroke-width="1.6"/>${hatch}`;
    const yBase = 238;
    const mid = 176, mb = [mid, yb2(mid)], mt = [mid - th * sn, yb2(mid) - th * cs];
    const arcR = 48;
    const arc = `<path d="M${P[0] + arcR},${P[1]} A${arcR},${arcR} 0 0 0 ${(P[0] + arcR * cs).toFixed(1)},${(P[1] - arcR * sn).toFixed(1)}" fill="none" stroke="${WH}" stroke-width="1"/>`;
    return `<svg class="bp" viewBox="0 0 360 266" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
      ${plate}
      <path d="${rafter}" fill="#5c9fd6" fill-opacity=".55" stroke="${WH}" stroke-width="1.8" stroke-linejoin="round"/>
      <polyline points="${V.join(",")} ${P.join(",")} ${Hn[0].toFixed(1)},${Hn[1]}" fill="none" stroke="#ffe08a" stroke-width="2.8"/>
      ${ln(P[0], P[1], 344, P[1], 0.9, WD, "4 3")}
      ${ln(xr, rtop[1] - 8, xr, yBase + 6, 0.9, WD, "8 3 2 3")}
      ${arc}
      ${ln(xe, etop[1], xe, yBase + 5, 0.8, WD)}${ln(P[0], P[1] + ph, P[0], yBase + 5, 0.8, WD)}
      ${dimLine(xe, yBase, P[0], yBase)}${dimLine(P[0], yBase, xr, yBase)}
      ${ln(xr + 4, rb[1], 342, rb[1], 0.8, WD)}${dimLine(336, P[1], 336, rb[1])}
      ${dimLine(mb[0], mb[1], mt[0], mt[1])}
      ${tag((xe + P[0]) / 2 + 4, yBase + 20, "D", f0(r.over))}
      ${tag((P[0] + xr) / 2, yBase + 20, "C", f0(run))}
      ${tag(330, (P[1] + rb[1]) / 2 + 4, "H", f0(r.rise), "end")}
      ${tag(mt[0] - 6, mt[1] - 10, "A", f0(r.h))}
      ${tag(P[0] + arcR + 44, P[1] + 18, "Q", `${fmt(r.angle, 1)}°`)}
      ${tag(P[0] - 6, P[1] + 40, "d", f0(r.d), "end")}${ln(P[0] - 8, P[1] + 30, P[0] - 1, P[1] + dS / 2 + 1, 0.8, WH)}
      ${tag(P[0] + pw / 2, P[1] + ph + 22, "M", f0(r.plate))}
    </svg>`;
  }

  /* --- развёртка доски в стиле чертежей автора: красный контур, голубой габарит, чёрные размеры --- */
  function boardSvg(r, ridge) {
    const a = rad(r.angle), s = Math.sin(a), c = Math.cos(a), t = Math.tan(a);
    const h = r.h, d = r.d;
    const E0 = [-r.lenOver, 0], E1 = [-r.lenOver + h * t, h];
    const V = [0, 0], Pn = [d * s, d * c], Hn = [d / s, 0];
    const RP = ridge.pts;
    const xmin = E0[0], xmax = Math.max(...RP.map((q) => q[0]));
    // по краям — истинный масштаб (углы честные), середина доски сжата
    const W = 1000, M = 34;
    const xA = Math.max(Hn[0], h * t) + 0.5 * h, xB = Math.min(...RP.map((q) => q[0])) - 0.7 * h;
    const leftMM = xA - xmin, rightMM = xmax - xB;
    let k = 150 / h;
    const avail = W - 2 * M - 170;
    if ((leftMM + rightMM) * k > avail) k = avail / (leftMM + rightMM);
    const midPx = W - 2 * M - (leftMM + rightMM) * k;
    const X = (x) => (x <= xA ? M + (x - xmin) * k : x >= xB ? M + leftMM * k + midPx + (x - xB) * k : M + leftMM * k + ((x - xA) / (xB - xA)) * midPx);
    const top = 100, yb = top + h * k;
    const Y = (y) => yb - y * k;
    const S2 = (q) => [X(q[0]), Y(q[1])];
    const outline = [E0, V, Pn, Hn, ...RP, E1].map(S2).map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ");
    const plTop = [h * t, h];
    const ang = fmt(90 - r.angle, 0);
    const arcAt = (q, a1, a2, R = 46) => {
      const [x, y] = S2(q);
      const p1 = [x + R * Math.cos(a1), y - R * Math.sin(a1)], p2 = [x + R * Math.cos(a2), y - R * Math.sin(a2)];
      return `<path d="M${p1[0].toFixed(1)},${p1[1].toFixed(1)} A${R},${R} 0 0 ${a2 > a1 ? 0 : 1} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}" fill="none" stroke="${INKC}" stroke-width="2"/>`;
    };
    const lastTop = RP[RP.length - 1];
    let ridgeDims = "";
    if (ridge.type === "beam") {
      const [B0, B1, B2, B3] = RP;
      const foot = [B0[0] + ridge.foot, 0];
      ridgeDims = arrowDim(S2(B0), S2(B1), f0(ridge.lowerFace), -22, { side: -1, fs: 22, head: 11 })
        + arrowDim(S2(B1), S2(B2), f0(ridge.seat), -16, { side: -1, fs: 22, head: 11 })
        + arrowDim(S2(foot), S2(B3), f0(ridge.full), 34, { side: 1, fs: 24 })
        + arrowDim(S2(B0), S2(foot), f0(ridge.foot), 26, { side: 1, fs: 20, head: 10 })
        + `<line x1="${X(foot[0]).toFixed(1)}" y1="${Y(0).toFixed(1)}" x2="${X(B2[0]).toFixed(1)}" y2="${Y(B2[1]).toFixed(1)}" stroke="${BLUE}" stroke-width="2" stroke-dasharray="5 6"/>`;
    } else {
      ridgeDims = arrowDim(S2(RP[0]), S2(RP[1]), f0(ridge.full), 34, { side: 1, fs: 24 });
    }
    return `<svg class="draw board" viewBox="0 0 ${W} ${yb + 160}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
      <rect x="${X(xmin)}" y="${Y(h)}" width="${(X(xmax) - X(xmin)).toFixed(1)}" height="${(h * k).toFixed(1)}" fill="none" stroke="${BLUE}" stroke-width="2" stroke-dasharray="4 6"/>
      <line x1="${X(Pn[0]).toFixed(1)}" y1="${Y(Pn[1]).toFixed(1)}" x2="${X(plTop[0]).toFixed(1)}" y2="${Y(h).toFixed(1)}" stroke="${BLUE}" stroke-width="2" stroke-dasharray="4 6"/>
      <polygon points="${outline}" fill="#fff" fill-opacity=".001" stroke="${RED}" stroke-width="3" stroke-linejoin="miter"/>
      ${arcAt(E0, 0, a > 0 ? Math.PI / 2 - a : 0)}
      ${arcAt(lastTop, Math.PI, Math.PI + (Math.PI / 2 - a))}
      <text x="${(X(E0[0]) + 70).toFixed(1)}" y="${(Y(0) - 22).toFixed(1)}" font-size="24" fill="${INKC}">${ang}°</text>
      <text x="${(X(lastTop[0]) - 74).toFixed(1)}" y="${(Y(h) + 44).toFixed(1)}" font-size="24" fill="${INKC}" text-anchor="end">${ang}°</text>
      ${arrowDim(S2([xmin, h]), S2(E1), f0(h * t), -30, { side: -1, fs: 20, head: 10 })}
      ${arrowDim(S2(E1), S2(plTop), f0(r.lenOver), -30, { side: -1 })}
      ${arrowDim(S2([E1[0] - 6 * c / k, E1[1]]), S2(V), f0(Math.hypot(E1[0], E1[1])), 0, { side: -1, ext: false })}
      ${arrowDim(S2(V), S2(Pn), f0(d), -22, { side: -1, fs: 22, head: 11 })}
      ${arrowDim(S2(Pn), S2(Hn), f0(r.seat), -18, { side: -1, fs: 22, head: 11 })}
      ${arrowDim(S2(E0), S2(V), f0(r.lenOver), 40, { side: 1 })}
      ${arrowDim(S2(V), S2(Hn), f0(d / s), 40, { side: 1, fs: 22 })}
      ${arrowDim(S2(Hn), S2(RP[0]), f0(RP[0][0] - Hn[0]), 40, { side: 1 })}
      ${arrowDim(S2([xmin, 0]), S2([xmax, 0]), `доска ${f0(xmax - xmin)}`, 100, { side: 1, fs: 28 })}
      ${ridgeDims}
    </svg>`;
  }

  /* --- сращивание доски: косой замок с упорами (узел автора). Размеры 80/30/20/300 для доски от 180 мм --- */
  function spliceSvg(h) {
    const big = h >= 180;
    const lo = big ? 80 : Math.round(h * 0.4), step = big ? 20 : Math.round(h * 0.1), shelf = 30, L = big ? 300 : Math.round(h * 1.5);
    const k = 1.35, M = 40, top = 70;
    const x0 = 330;                                      // начало замка, мм от левого края картинки
    const X = (x) => M + x * k, Y = (y) => top + (h - y) * k;
    const total = x0 * 2 + shelf * 2 + L;
    const xA = x0, xB = x0 + shelf, xC = xB + L, xD = xC + shelf;
    const joint = [[xA, 0], [xA, lo], [xB, lo], [xB, lo - step], [xC, h - lo + step], [xC, h - lo], [xD, h - lo], [xD, h]];
    const pts = (arr) => arr.map((q) => `${X(q[0]).toFixed(1)},${Y(q[1]).toFixed(1)}`).join(" ");
    const blue = [[0, 0], ...joint, [0, h]];
    const red = [...joint, [total, h], [total, 0]];
    const H2 = Y(0) + 90;
    const dash = (p1, p2) => {
      const dx = p2[0] - p1[0], dy = p2[1] - p1[1], L2 = Math.hypot(dx, dy), ux = dx / L2, uy = dy / L2;
      return `<line x1="${p1[0]}" y1="${p1[1]}" x2="${p2[0] - ux * 18}" y2="${p2[1] - uy * 18}" stroke="${INKC}" stroke-width="4" stroke-dasharray="12 8"/>
        <polygon points="${p2[0]},${p2[1]} ${p2[0] - ux * 26 - uy * 11},${p2[1] - uy * 26 + ux * 11} ${p2[0] - ux * 26 + uy * 11},${p2[1] - uy * 26 - ux * 11}" fill="${INKC}"/>`;
    };
    const sl = (y) => (y - (lo - step)) / (h - 2 * lo + 2 * step);
    const onSlant = (fr) => [X(xB + L * fr), Y(lo - step + (h - 2 * lo + 2 * step) * fr)];
    const s1 = onSlant(0.12), s2 = onSlant(0.85);
    return `<svg class="draw board" viewBox="0 0 ${M * 2 + total * k} ${H2 + 10}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
      <polygon points="${pts(blue)}" fill="#fff" fill-opacity=".001" stroke="${BLUE}" stroke-width="3"/>
      <polygon points="${pts(red)}" fill="#fff" fill-opacity=".001" stroke="${RED}" stroke-width="3"/>
      ${dash([s1[0] - 60, top - 60], [s1[0] + 4, s1[1] - 6])}
      ${dash([s2[0] + 50, Y(0) + 60], [s2[0] - 4, s2[1] + 8])}
      ${arrowDim([X(xA), Y(0)], [X(xA), Y(lo)], `${lo} мм`, -34, { fs: 34, head: 16 })}
      ${arrowDim([X(xA), Y(lo)], [X(xB), Y(lo)], `${shelf}`, -24, { fs: 32, head: 12 })}
      ${arrowDim([X(xB), Y(lo)], [X(xB), Y(lo - step)], `${step}`, -22, { fs: 32, head: 10 })}
      ${arrowDim([X(xB), Y(lo - step)], [X(xC), Y(h - lo + step)], `${L} мм`, 28, { fs: 34, head: 16 })}
      <text x="${X(total / 2)}" y="${H2}" font-size="30" text-anchor="middle" fill="#6f6c66">доска ${h} мм${big ? "" : " (размеры пересчитаны от высоты доски)"}</text>
    </svg>`;
  }

  /* ---------- кондуктор: PDF 1:1 ---------- */
  async function makeJig() {
    if (!window.jspdf) { toast("Не загрузилась библиотека PDF. Проверьте интернет."); return; }
    const { r } = rafterCalc();
    const J = C.jigOutline({ angle: r.angle, h: r.h, d: r.d, len: 300 });
    const PX = 8;                                   // пикселей на мм
    const PW = 210, PH = 297, MAR = 10, OVL = 10;
    const usable = PW - 2 * MAR, step = usable - OVL;
    const pages = Math.max(1, Math.ceil((J.width - OVL) / step));
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    if (J.height > PH - 24) { toast("Доска слишком высокая для листа A4: разметьте запил по размерам с экрана"); return; }
    const top = Math.min(45, Math.max(18, PH - 8 - J.height));   // отступ сверху под подписи, мм
    const toPage = (x, y, i) => [(x + J.back - i * step + MAR) * PX, (top + J.height - y) * PX];
    for (let i = 0; i < pages; i++) {
      const cv = document.createElement("canvas");
      cv.width = PW * PX; cv.height = PH * PX;
      const g = cv.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      g.save();
      g.beginPath(); g.rect(MAR * PX, 0, usable * PX, PH * PX); g.clip();
      // рейка
      g.fillStyle = "#d9d5cc";
      g.beginPath(); J.rail.forEach((q, k) => { const [x, y] = toPage(q[0], q[1], i); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.fill();
      // контур шаблона
      g.strokeStyle = "#000"; g.lineWidth = 0.5 * PX;
      g.beginPath(); J.body.forEach((q, k) => { const [x, y] = toPage(q[0], q[1], i); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); g.stroke();
      // кромка доски и вертикаль запила
      g.setLineDash([3 * PX, 2 * PX]); g.lineWidth = 0.3 * PX; g.strokeStyle = "#666";
      [J.edgeTop, J.plumb].forEach((ln) => { g.beginPath(); const a = toPage(ln[0][0], ln[0][1], i), b = toPage(ln[1][0], ln[1][1], i); g.moveTo(...a); g.lineTo(...b); g.stroke(); });
      g.setLineDash([]);
      // подписи на шаблоне
      g.fillStyle = "#000"; g.font = `${4.2 * PX}px sans-serif`;
      const lab = toPage(-J.back + 8, r.h * 0.45, i);
      g.fillText(`ОПОРНЫЙ ЗАПИЛ · доска ${r.h} мм`, lab[0], lab[1]);
      g.fillText(`${fmt(r.angle, 1)}° · d = ${Math.round(r.d)} мм`, lab[0], lab[1] + 6 * PX);
      const rl = toPage(-J.back + 8, r.h + 8, i);
      g.font = `${3.4 * PX}px sans-serif`; g.fillText("упорная рейка к кромке стропила", rl[0], rl[1]);
      g.restore();
      // метки склейки
      g.strokeStyle = "#999"; g.lineWidth = 0.2 * PX;
      if (i > 0) { g.beginPath(); g.moveTo((MAR + OVL) * PX, 16 * PX); g.lineTo((MAR + OVL) * PX, (PH - 15) * PX); g.stroke(); }
      g.fillStyle = "#000"; g.font = `${4 * PX}px sans-serif`;
      g.fillText(`Кондуктор опорного запила · лист ${i + 1} из ${pages}`, MAR * PX, 8 * PX);
      g.font = `${3.2 * PX}px sans-serif`; g.fillStyle = "#555";
      g.fillText(i === 0 ? "Печать в масштабе 100 %, без «подогнать под страницу»." : `Наложите на лист ${i} по вертикальной линии слева и склейте.`, MAR * PX, 13.5 * PX);
      if (i === pages - 1) {
        const qx = Math.max(MAR + OVL + 5, J.width + MAR - i * step + 10);
        const sq = Math.min(50, PW - MAR - qx);
        if (sq >= 50) {
          g.strokeStyle = "#000"; g.lineWidth = 0.3 * PX;
          g.strokeRect(qx * PX, (top + 20) * PX, 50 * PX, 50 * PX);
          g.fillStyle = "#000"; g.font = `${3.2 * PX}px sans-serif`;
          g.fillText("50 × 50 мм", qx * PX, (top + 78) * PX);
          g.fillText("проверьте линейкой", qx * PX, (top + 83) * PX);
        }
      }
      if (i) doc.addPage();
      doc.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, PW, PH, undefined, "FAST");
    }
    const fname = `kondutor_${r.h}mm_${Math.round(r.angle)}deg.pdf`;
    if (CFG.API_URL && tg) {
      try {
        toast("Отправляю PDF в чат…");
        const b64 = doc.output("datauristring").split(",")[1];
        const res = await api("sendDoc", { filename: fname, caption: `Кондуктор опорного запила: доска ${r.h} мм, уклон ${fmt(r.angle, 1)}°, запил ${Math.round(r.d)} мм. Печать 100 %.`, data: b64 });
        if (res.ok) { toast("PDF в чате с ботом"); haptic("medium"); return; }
      } catch (_) { /* упадём на скачивание */ }
    }
    doc.save(fname);
  }

  /* ---------- вкладка: чек-листы ---------- */
  const FREE_LISTS = ["ch01"];
  function viewCheck() {
    const v = $("#view");
    const prog = S.prog[S.cur] || (S.prog[S.cur] = {});
    if (S.openList) return viewList(S.openList);
    const all = window.CHECKLISTS || [];
    const total = all.reduce((a, c) => a + c.items.length, 0);
    const done = all.reduce((a, c) => a + (prog[c.id] || []).length, 0);
    v.innerHTML = `<h2>Чек-листы</h2>
      <div class="card"><div class="res"><span class="k">Пройдено по проекту</span><span class="v">${done} из ${total}</span></div>
      <div class="bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div></div>
      <div class="card">${all.map((c) => {
        const d = (prog[c.id] || []).length, locked = !S.paid && !FREE_LISTS.includes(c.id);
        return `<div class="cl-item" data-list="${c.id}"><div class="t">${c.chapter <= 15 ? `Глава ${c.chapter}. ` : ""}${c.title}${c.noReturn ? '<span class="nr">точка невозврата</span>' : ""}
          <small>${locked ? "🔒 полный доступ" : `${d} из ${c.items.length}`}</small><div class="bar"><i style="width:${(d / c.items.length) * 100}%"></i></div></div><span style="color:var(--hint)">›</span></div>`;
      }).join("")}</div>`;
    v.querySelectorAll("[data-list]").forEach((el) => el.addEventListener("click", () => {
      const id = el.dataset.list;
      if (!S.paid && !FREE_LISTS.includes(id)) { buy(); return; }
      S.openList = id; viewList(id);
    }));
  }
  function viewList(id) {
    const c = (window.CHECKLISTS || []).find((x) => x.id === id);
    const prog = S.prog[S.cur] || (S.prog[S.cur] = {});
    const set = new Set(prog[id] || []);
    const v = $("#view");
    v.innerHTML = `<button class="back" type="button">‹ Все чек-листы</button><h2>${c.title}</h2>
      ${c.noReturn ? `<div class="warn" style="margin-bottom:12px">Перед этим этапом стоит точка невозврата: пройдите список целиком, прежде чем закрывать предыдущую работу.</div>` : ""}
      <div class="card">${c.items.map((t, i) => `<label class="chk ${set.has(i) ? "done" : ""}"><input type="checkbox" data-i="${i}" ${set.has(i) ? "checked" : ""}><span>${t}</span></label>`).join("")}</div>
      <p class="note" style="margin:0 4px 12px">Подробности — в главе ${c.chapter <= 15 ? c.chapter : "«Приложения»"} книги.</p>`;
    $(".back", v).addEventListener("click", () => { S.openList = null; viewCheck(); });
    v.querySelectorAll("input[data-i]").forEach((el) => el.addEventListener("change", () => {
      const i = Number(el.dataset.i);
      el.checked ? set.add(i) : set.delete(i);
      el.closest(".chk").classList.toggle("done", el.checked);
      prog[id] = [...set].sort((a, b) => a - b);
      saveProg(); haptic();
      if (set.size === c.items.length) toast("Этап пройден ✓");
    }));
  }

  /* ---------- проекты ---------- */
  function projectSheet() {
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>Проекты</h3>
      ${S.projects.map((p) => `<div class="cl-item" data-id="${p.id}"><div class="t">${p.name || "Без названия"}<small>${fmt(p.width / 1000, 1)} × ${fmt(p.length / 1000, 1)} м · ${p.form === "hip" ? "вальмовая" : "двускатная"}</small></div>${p.id === S.cur ? "✓" : ""}</div>`).join("")}
      <button class="btn" data-sheet="new" type="button">Новый проект</button>
      ${S.projects.length > 1 ? `<button class="btn ghost" data-sheet="del" type="button">Удалить текущий</button>` : ""}</div>`;
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.addEventListener("click", async (e) => {
      if (e.target === bg) return close();
      const row = e.target.closest("[data-id]");
      if (row) { S.cur = row.dataset.id; await loadProg(); save(); close(); render(); return; }
      const act = e.target.dataset.sheet;
      if (act === "new") {
        const p = { ...DEFAULT, id: "p" + Date.now().toString(36), name: `Проект ${S.projects.length + 1}` };
        S.projects.push(p); S.cur = p.id; S.prog[p.id] = {}; save(); close(); S.tab = "project"; render();
      }
      if (act === "del") {
        const ok = tg ? await new Promise((r) => tg.showConfirm("Удалить проект и его чек-листы?", r)) : confirm("Удалить проект?");
        if (!ok) return;
        S.projects = S.projects.filter((p) => p.id !== S.cur); S.cur = S.projects[0].id; await loadProg(); save(); close(); render();
      }
    });
  }
  async function loadProg() {
    if (S.prog[S.cur]) return;
    const raw = await store.get("prog_" + S.cur);
    try { S.prog[S.cur] = raw ? JSON.parse(raw) : {}; } catch (_) { S.prog[S.cur] = {}; }
  }

  /* ---------- действия ---------- */
  async function buy() {
    if (!CFG.API_URL || !tg) { toast("Оплата работает внутри Telegram после подключения бота"); return; }
    try {
      const r = await api("invoice");
      if (!r.link) throw new Error(r.error || "нет ссылки");
      tg.openInvoice(r.link, async (status) => {
        if (status === "paid") { toast("Оплата прошла, открываю доступ…"); setTimeout(async () => { await checkAccess(); render(); }, 1500); }
      });
    } catch (e) { toast("Не удалось открыть оплату. Попробуйте позже."); }
  }
  async function redeem() {
    const code = ($("#code") || {}).value || "";
    if (!code.trim()) return toast("Введите код");
    if (!CFG.API_URL) return toast("Коды работают после подключения бота");
    try {
      const r = await api("redeem", { code: code.trim().toUpperCase() });
      if (r.paid) { await checkAccess(); toast("Код принят, доступ открыт"); render(); }
      else toast(r.error || "Код не подошёл");
    } catch (_) { toast("Не удалось проверить код"); }
  }
  async function sendRafter() {
    const { p, r, sp, ridge, gab, board } = rafterCalc();
    const text = `Стропила · ${p.name}\nШирина ${fmt(p.width)} мм, уклон ${fmt(r.angle, 1)}°, свес ${fmt(p.over)} мм\n` +
      `Высота конька: ${fmt(r.rise)} мм\nДлина до конька: ${fmt(r.lenRidge)} мм\nГабарит доски с резами: ${fmt(gab)} мм\n` +
      `Доска: ${board ? fmt(board / 1000, 1) + " м" : "сращивать"}\nПар: ${sp.pairs} (${sp.rafters} шт.), шаг ${fmt(sp.step)} мм` +
      (S.paid ? `\nЗапил: ${fmt(r.d)} мм, площадка ${fmt(r.seat)} мм, рез ${fmt(r.plumbAngleToEdge, 1)}° к кромке` +
        (ridge.type === "beam" ? `\nКонёк на прогон: упор ${fmt(ridge.lowerFace)} мм, площадка ${fmt(ridge.seat)} мм` : "\nКонёк: встык по отвесу") : "");
    if (CFG.API_URL && tg) {
      try { const res = await api("sendText", { text }); if (res.ok) return toast("Отправлено в чат"); } catch (_) {}
    }
    try { await navigator.clipboard.writeText(text); toast("Скопировано"); } catch (_) { toast("Не удалось отправить"); }
  }

  async function sendMap() {
    const p = P(), m = mapCalc(p);
    const text = `Карта стропил · ${p.name}\n${p.form === "hip" ? "Вальмовая" : "Двускатная"}, ${fmt(m.W)}×${fmt(m.L)} мм, уклон ${fmt(m.r.angle, 1)}°, шаг ${fmt(m.sp.step)} мм\n\n` +
      m.parts.map((q) => `${q.name}: ${q.n} шт. × ${fmt(q.len)} мм${q.board ? ` (доска ${fmt(q.board / 1000, 1)} м)` : ""}, ${q.sec}`).join("\n") +
      `\n\nЛес всего: ${fmt(m.total, 2)} м³ (+10 % запас)`;
    if (CFG.API_URL && tg) {
      try { const res = await api("sendText", { text }); if (res.ok) return toast("Отправлено в чат"); } catch (_) {}
    }
    try { await navigator.clipboard.writeText(text); toast("Скопировано"); } catch (_) { toast("Не удалось отправить"); }
  }

  document.addEventListener("click", (e) => {
    const pm = e.target.closest("[data-pm]");
    if (pm) { S.projMode = pm.dataset.pm; freshView(); viewProject(); window.scrollTo(0, 0); return; }
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "buy") buy();
    if (a === "redeem") redeem();
    if (a === "jig") makeJig();
    if (a === "sendRafter") sendRafter();
    if (a === "sendMap") sendMap();
    if (a === "sendEst") sendEst();
    if (a === "printEst") printEst();
    if (a === "book") tg ? tg.openLink(CFG.BOOK_URL) : window.open(CFG.BOOK_URL);
    if (a === "author") tg ? tg.openTelegramLink("https://t.me/" + CFG.AUTHOR_CONTACT.replace("@", "")) : 0;
    if (a === "demo") { try { localStorage.setItem("demoPaid", S.paid ? "0" : "1"); } catch (_) {} checkAccess().then(render); }
  });

  /* ---------- навигация ---------- */
  const VIEWS = { project: viewProject, rafter: viewRafter, map: viewMap, book: viewBook, check: viewCheck, tips: viewTips };
  function freshView() {           // новый контейнер — старые обработчики событий не копятся
    const old = $("#view"), nw = old.cloneNode(false);
    old.replaceWith(nw);
  }
  function render() {
    freshView();
    $("#projectName").textContent = P().name || "—";
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    VIEWS[S.tab]();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabs button").forEach((b) => b.addEventListener("click", () => { S.tab = b.dataset.tab; S.openList = null; render(); haptic(); }));
  $("#projectChip").addEventListener("click", projectSheet);

  /* ---------- старт ---------- */
  (async function init() {
    try { S.projects = JSON.parse((await store.get("projects")) || "[]"); } catch (_) { S.projects = []; }
    if (!S.projects.length) S.projects = [{ ...DEFAULT, id: "p1" }];
    S.projects.forEach((p) => {
      if (p.height == null || p.height === "") p.height = Math.round(heightOf(p));
      if (!p.material) p.material = p.roof === "heavy" ? "cpc" : "metal";
    });
    S.cur = (await store.get("current")) || S.projects[0].id;
    if (!S.projects.find((p) => p.id === S.cur)) S.cur = S.projects[0].id;
    await loadProg();
    render();
    await checkAccess();
    render();
  })();
})();
