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
    step: 600, h: 200, b: 50, d: "", plate: 150, snow: 180, ridge: "board", ridgeT: 50, beamW: 150, dr: "", notchV: 2, shift: 0, beamStep: 600, attic: "warm",
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
  const FORMS = [["shed", "Односкатная"], ["gable", "Двускатная"], ["hip", "Вальмовая"]];
  const formName = (p) => (FORMS.find((f) => f[0] === (p.form || "gable")) || FORMS[1])[1].toLowerCase();
  const wingOf = (p) => (p.wing && p.wing.on ? p.wing : null);
  function modelOf(p) {
    return C.roofModel({ W: num(p.width, 8000), L: num(p.length, 10000), H: heightOf(p), form: p.form || "gable",
      over: num(p.over, 0), plate: num(p.plate, 150), step: num(p.step, 600), shift: num(p.shift, 0), wing: wingOf(p) });
  }
  const angleOf = (p) => modelOf(p).slopes[0].angle;
  const S = { projects: [], cur: null, prog: {}, paid: false, until: null, tab: "project", openList: null };
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
  const untilStr = () => new Date(S.until).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  async function checkAccess() {
    if (!CFG.API_URL) {
      const q = new URLSearchParams(location.search).get("paid");
      let demo = null; try { demo = localStorage.getItem("demoPaid"); } catch (_) {}
      S.paid = q === "1" || demo === "1";
    } else {
      try { const r = await api("access"); S.paid = !!r.paid; S.until = r.until || null; } catch (_) { /* оставляем как было */ }
    }
    const b = $("#accessBadge");
    b.textContent = S.paid ? (S.until ? "доступ до " + untilStr() : "полный доступ") : "бесплатно";
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
      <div class="card"><h3>Форма крыши</h3>
        <div class="seg" id="formSeg">${FORMS.map(([k, t]) => `<button type="button" data-form="${k}" class="${(p.form || "gable") === k ? "on" : ""}">${t}</button>`).join("")}</div>
        <div id="formPlan" class="mini-plan"></div>
        <div id="formCtl"></div>
        <div id="wingCard" class="wing-box"></div></div>
      <div class="card"><h3>Высота и материал</h3><div class="grid">
          <label class="f"><span id="hLabel"></span><input data-height type="number" inputmode="decimal" value="${Math.round(heightOf(p))}"></label>
          ${field("over", "Свес по горизонтали, мм")}
          ${field("material", "Кровельный материал", { options: MATERIALS.map((m) => [m.k, m.t]), full: true })}
        </div><div id="slopeInfo"></div></div>
      <div class="card" id="advice"></div>
      <div class="card"><h3>Проект в PDF</h3>
        <p class="note" style="margin-top:0">План крыши, разметка всех стропил, детали, балки перекрытия и количество материалов — одним файлом для печати.</p>
        <button class="btn" data-act="projPdf" type="button">Собрать PDF проекта</button></div>`;
    bindFields(v, () => projectOut());
    v.querySelectorAll("[data-k='width'],[data-k='length']").forEach((el) => el.addEventListener("change", () => projectOut(true)));
    $("[data-height]", v).addEventListener("input", (e) => {
      const raw = Number(String(e.target.value).replace(",", "."));
      if (raw > 0) { P().height = raw; save(); projectOut(); }
    });
    v.addEventListener("click", (e) => {
      const fb = e.target.closest("[data-form]");
      if (fb) {
        const pp = P(); pp.form = fb.dataset.form; save();
        v.querySelectorAll("[data-form]").forEach((b) => b.classList.toggle("on", b === fb));
        projectOut(true); haptic(); return;
      }
      const wb = e.target.closest("[data-wset]");
      if (wb) { const [k, val] = wb.dataset.wset.split(":"); P().wing[k] = val; save(); projectOut(true); haptic(); }
    });
    v.addEventListener("input", (e) => {
      const sl = e.target.closest("[data-slider]");
      if (!sl) return;
      const pp = P(), key = sl.dataset.slider, val = Number(sl.value);
      if (key === "shift") pp.shift = val; else pp.wing[key] = val;
      const lab = v.querySelector(`[data-sval="${key}"]`);
      if (lab) lab.textContent = sliderText(key, val, pp);
      save(); projectOut();
    });
    v.addEventListener("change", (e) => {
      const cb = e.target.closest("[data-wing-on]");
      if (!cb) return;
      const pp = P();
      pp.wing = Object.assign({ side: "front", form: "gable", w: Math.round(num(pp.length, 10000) * 0.35 / 100) * 100, depth: 2000, pos: 0, angle: 20 }, pp.wing || {}, { on: cb.checked });
      save(); projectOut(true); haptic();
    });
    projectOut(true);
  }
  function sliderText(key, val, p) {
    if (key === "shift") return val === 0 ? "посередине" : `${f0(Math.abs(val))} мм ${val > 0 ? "к заднему скату" : "к переднему скату"}`;
    if (key === "pos") return val === 0 ? "по центру стены" : `${f0(Math.abs(val))} мм ${val > 0 ? "вправо" : "влево"}`;
    if (key === "angle") return `${val}°`;
    return `${f0(val)} мм`;
  }
  function slider(key, label, min, max, step, val, p) {
    const v = Math.min(max, Math.max(min, val));
    return `<label class="sl"><span>${label}<b data-sval="${key}">${sliderText(key, v, p)}</b></span>
      <input type="range" data-slider="${key}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`;
  }
  function formCtlHtml(p) {
    const W = num(p.width, 8000);
    if (p.form === "gable") {
      const lim = Math.max(0, Math.floor((W / 2 - 500) / 50) * 50);
      return slider("shift", "Конёк", -lim, lim, 50, num(p.shift, 0), p) +
        `<p class="note" style="margin-top:4px">Сдвиньте конёк, если скаты разные: стропила каждого ската посчитаются отдельно.</p>`;
    }
    if (p.form === "shed") return `<p class="note">Высокая стена — задняя, скат на переднюю. Задайте перепад высоты стен по верху мауэрлатов.</p>`;
    return `<p class="note">Вальмы под 45° в плане, конёк посередине.</p>`;
  }
  function wingHtml(p) {
    if (p.form === "shed") return `<h3>Пристройка</h3><p class="note" style="margin-top:0">Пристройку можно добавить к двускатной или вальмовой крыше.</p>`;
    const w = wingOf(p), L = num(p.length, 10000);
    let h = `<h3>Пристройка</h3><label class="tgl"><input type="checkbox" data-wing-on ${w ? "checked" : ""}><span>Есть пристройка: крыло буквой «Г», эркер, крыша над балконом</span></label>`;
    if (!w) return h;
    const ww = Math.min(num(w.w, 3000), L), lim = Math.max(0, Math.floor((L - ww) / 2 / 50) * 50);
    const seg = (k, opts) => `<div class="seg" style="margin-top:10px">${opts.map(([val, t]) => `<button type="button" data-wset="${k}:${val}" class="${w[k] === val ? "on" : ""}">${t}</button>`).join("")}</div>`;
    h += seg("side", [["front", "Спереди"], ["back", "Сзади"]]);
    h += seg("form", [["gable", "Двускатная"], ["hip", "С вальмой"], ["shed", "Навес"]]);
    h += slider("w", "Ширина вдоль стены", 1000, L, 100, ww, p);
    h += slider("depth", "Вынос от стены", 600, 8000, 100, num(w.depth, 2000), p);
    h += slider("pos", "Сдвиг вдоль стены", -lim, lim, 50, num(w.pos, 0), p);
    if (w.form === "shed") h += slider("angle", "Уклон навеса", 5, 45, 1, num(w.angle, 20), p);
    return h;
  }
  function projectOut(rebuild = false) {
    const p = P();
    if (rebuild) {
      $("#formCtl").innerHTML = formCtlHtml(p);
      $("#wingCard").innerHTML = wingHtml(p);
      $("#hLabel").textContent = p.form === "shed" ? "Перепад высоты стен, мм" : "Высота конька над мауэрлатом, мм";
    }
    const M = modelOf(p);
    $("#formPlan").innerHTML = planSvg(p, M, { mini: true });
    const mat = materialOf(p);
    const rows = M.slopes.map((s) => `<span class="k">${M.slopes.length > 1 ? `Уклон: ${s.label.toLowerCase()}` : "Уклон получается"}</span><span class="v ${M.slopes.length > 1 ? "" : "big"}" style="color:${s.angle >= mat.min ? "inherit" : "var(--accent)"}">${fmt(s.angle, 1)}°</span>`).join("");
    const minA = Math.min(...M.slopes.map((s) => s.angle));
    const okSlope = minA >= mat.min;
    const flat = M.slopes.find((s) => s.angle === minA);
    $("#slopeInfo").innerHTML = `<div class="res" style="margin-top:12px">${rows}
        <span class="k">Минимум для материала</span><span class="v">${mat.min}°</span>
        <span class="k">Вес кровли</span><span class="v">${mat.w} кг/м²</span></div>
      ${okSlope ? "" : `<div class="warn">${flat.label}: уклон меньше минимального для «${mat.t}». ${flat.wing ? "Сделайте пристройку круче" : `Поднимите ${p.form === "shed" ? "верхнюю стену" : "конёк"} хотя бы до ${f0(heightOf(p) * Math.tan(rad(mat.min)) / Math.tan(rad(minA)))} мм`} или выберите другой материал.</div>`}`;
    const out = M.warnings.map((w) => `<div class="warn">${w}</div>`);
    if (mat.heavy && (p.box === "timber" || p.box === "frame"))
      out.push(`<div class="warn">${mat.t} на ${p.box === "timber" ? "брусовом" : "каркасном"} доме: в книге (глава 2.8) объяснено, почему так делать не стоит. Выберите лёгкую кровлю.</div>`);
    if (p.box === "timber") out.push(`<p class="note">Брус садится: стропила крепите на скользящих опорах, стойки ставьте на компенсаторы усадки.</p>`);
    if (p.box === "gas") out.push(`<p class="note">Газобетон: нужен сплошной армопояс со шпильками и система без распора или с затяжкой внизу.</p>`);
    if (Math.max(...M.slopes.map((s) => s.run)) > 6000) out.push(`<div class="warn">Заложение стропила больше 6 м без промежуточных опор: нужен расчёт конструктора.</div>`);
    if (Math.max(...M.slopes.map((s) => s.angle)) > 50) out.push(`<p class="note">Уклон круче 50°: крыша будет высокой и парусной, проверьте, этого ли вы хотите.</p>`);
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

  /* ---------- вкладка: карта стропил и балок ---------- */
  function mapCalc(p) {
    const M = modelOf(p);
    const W = num(p.width, 8000), L = num(p.length, 10000), over = num(p.over, 0);
    const mainSl = M.slopes.filter((s) => !s.wing);
    const maxRun = Math.max(...mainSl.map((s) => s.run));
    const sec = C.rafterSection({ span: maxRun, step: num(p.step, 600), roof: materialOf(p).heavy ? 110 : 50, snow: num(p.snow, 180), angle: mainSl[0].angle });
    const s = sec.section || { b: 50, h: 200, label: "50×200" };
    const vol = (len, n, b = s.b, h = s.h) => (len / 1000) * (b / 1000) * (h / 1000) * n;
    const parts = [];
    const lensNote = (arr) => "длины: " + arr.map((q) => `${f0(q.len)}${q.n > 1 ? ` ×${q.n}` : ""}`).join(", ");
    const listRow = (name, arr, extra = 0) => {
      if (!arr.length) return;
      parts.push({ name, n: arr.reduce((a, q) => a + q.n, 0), len: Math.max(...arr.map((q) => q.len)) + extra, sec: s.label, note: lensNote(arr), raf: true });
    };
    const main = rafterCalc(false, p, mainSl[0].key);
    const short = M.ex.mainShort.reduce((a, q) => a + q.n, 0);
    if (p.form === "hip") {
      const run = W / 2;
      const hp = C.hip({ run, angle: mainSl[0].angle, over, step: M.sp.step });
      const common = M.xs.filter((x) => x >= run - 1 && x <= L - run + 1).length;
      parts.push({ name: "Стропила рядовые", n: common * 2 + 2 - short, len: main.gab, sec: s.label, note: "включая 2 центральных на вальмах", raf: true });
      parts.push({ name: "Накосные стропила (спаренные)", n: 8, len: hp.hipWithOver + 100, sec: s.label, note: "4 угла × 2 доски", raf: true });
      hp.jacks.forEach((j) => parts.push({ name: `Нарожник №${j.n}`, n: 8, len: j.withOver + 150, sec: s.label, raf: true }));
    } else {
      mainSl.forEach((sl) => {
        const rc = sl.key === mainSl[0].key ? main : rafterCalc(false, p, sl.key);
        parts.push({ name: mainSl.length > 1 ? `Стропила: ${sl.label.toLowerCase()}` : "Стропила", n: sl.n, len: rc.gab, sec: s.label,
          note: p.form === "shed" ? "по одному в ряду" : mainSl.length > 1 ? `${sl.n} шт.` : `${M.sp.pairs - Math.ceil(short / 2)} пар`, raf: true });
      });
    }
    listRow("Укороченные стропила у ендов", M.ex.mainShort, 100);
    const ridgeLen = p.form === "hip" ? Math.max(L - W, 0) : L + 2 * over;
    if (p.form !== "shed") {
      if (main.ridge.type === "beam") parts.push({ name: "Коньковая доска (прогон)", n: 1, len: ridgeLen, sec: "по расчёту" });
      else if (main.ridge.ridgeT > 0) parts.push({ name: "Коньковая доска", n: 1, len: ridgeLen, sec: `${f0(main.ridge.ridgeT)}×${f0(s.h + 50)}`, b: main.ridge.ridgeT, h: s.h + 50 });
    }
    const wing = M.wing, wsl = M.slopes.find((q) => q.wing);
    if (wing && wsl) {
      const wr = rafterCalc(false, p, "wing");
      parts.push({ name: wing.form === "shed" ? "Стропила навеса" : "Стропила пристройки", n: wsl.n, len: wr.gab, sec: s.label, raf: true,
        note: wing.form === "shed" ? "верх на опорном брусе у стены" : "" });
      if (M.ex.valley) parts.push({ name: "Ендовные стропила (спаренные)", n: 4, len: M.ex.valley.len + 100, sec: s.label, note: "2 ендовы × 2 доски", raf: true });
      listRow("Нарожники у ендов (пристройка)", M.ex.valleyJacks, 150);
      if (M.ex.wingHip) {
        parts.push({ name: "Накосные пристройки (спаренные)", n: 4, len: M.ex.wingHip.len + 100, sec: s.label, note: "2 угла × 2 доски", raf: true });
        listRow("Нарожники вальмы пристройки", M.ex.wingHip.jacks, 150);
      }
      if (wing.form === "shed") {
        parts.push({ name: "Опорный брус навеса на стене", n: 1, len: wing.w + 2 * over, sec: "50×150", b: 50, h: 150 });
        parts.push({ name: "Балка навеса по столбам", n: 1, len: wing.w + 2 * over, sec: "по расчёту" });
      } else if (main.ridge.type === "beam" || main.ridge.ridgeT > 0) {
        parts.push({ name: "Коньковая доска пристройки", n: 1, len: wing.form === "hip" ? wing.depth : wing.depth + over + wing.rw, sec: main.ridge.type === "beam" ? "по расчёту" : `${f0(main.ridge.ridgeT)}×${f0(s.h + 50)}`, b: main.ridge.ridgeT, h: s.h + 50 });
      }
    }
    const perim = 2 * (W + L) + (wing && wing.form !== "shed" ? 2 * wing.depth : 0);
    if (p.box !== "timber" && p.box !== "frame")       // на брусе роль мауэрлата играет верхний венец, на каркасе — обвязка
      parts.push({ name: "Мауэрлат 150×150", n: Math.ceil(perim / 6000) + 1, len: 6000, sec: "150×150", b: 150, h: 150, note: `периметр ${fmt(perim / 1000, 1)} м + запас на замки` });
    let total = 0;
    const stdLen = (x) => C.BOARDS.find((b) => b >= x + 50) || null;
    parts.forEach((q) => {
      q.board = q.len === 6000 ? 6000 : q.len <= 6000 ? stdLen(q.len) : null;
      const b = q.b || s.b, h = q.h || s.h;
      q.vol = q.sec === "по расчёту" ? 0 : vol(q.board || q.len, q.n, b, h);
      total += q.vol;
    });
    return { M, r: main.r, sp: M.sp, run: main.run, W, L, over, parts, total, sec: s, secOk: !!sec.section, beams: beamsCalc(p, M) };
  }
  /* балки перекрытия: пролёт по короткой стороне, шаг по длинной */
  function beamsCalc(p, M) {
    const step = num(p.beamStep, 600), load = p.attic === "cold" ? 200 : 400;
    const list = [];
    const mk = (name, span, along, key) => {
      const sp = C.spacing({ length: along, step });
      const sec = C.beamSection({ span, step: sp.step, load }).section;
      const half = sec ? null : C.beamSection({ span: span / 2, step: sp.step, load }).section;
      list.push({ key, name, n: sp.pairs, len: span, along, step: sp.step, sec: sec ? sec.label : null, half: half ? half.label : null });
    };
    mk("Балки основного дома", M.W, M.L, "main");
    const w = M.wing;
    if (w && w.form !== "shed") {
      if (w.depth <= w.w) mk("Балки пристройки", w.depth, w.w, "wingAcross");
      else mk("Балки пристройки", w.w, w.depth, "wingAlong");
    }
    return { list, step, load };
  }
  function viewMap() {
    const v = $("#view");
    const p = P();
    const layer = S.mapLayer || "rafters";
    const m = mapCalc(p);
    const cutList = (mm2) => `<table class="parts"><tr><th>Деталь</th><th>Шт.</th><th>Длина</th><th>Доска</th></tr>
      ${mm2.parts.map((q) => `<tr><td>${q.name}${q.note ? `<small>${q.note}</small>` : ""}</td><td>${q.n}</td><td>${f0(q.len)}</td><td>${q.board ? fmt(q.board / 1000, 1) + " м" : q.len > 6000 ? "сращивать" : "—"}<small>${q.sec}</small></td></tr>`).join("")}
      </table>
      <div class="res" style="margin-top:10px"><span class="k">Лес всего (с запасом бери +10 %)</span><span class="v big">${fmt(mm2.total, 2)} м³</span></div>
      ${mm2.secOk ? "" : `<div class="warn">Сечение 50×200 взято условно: при таком пролёте нужен подкос или расчёт.</div>`}
      <button class="btn ghost" data-act="sendMap" type="button">Отправить карту в чат</button>`;
    const beamList = (b) => `<table class="parts"><tr><th>Деталь</th><th>Шт.</th><th>Длина</th><th>Сечение</th></tr>
      ${b.list.map((q) => `<tr><td>${q.name}<small>шаг ${f0(q.step)} мм по осям</small></td><td>${q.n}</td><td>${f0(q.len)}</td><td>${q.sec || "нужна опора"}${q.half ? `<small>с опорой посередине ${q.half}</small>` : ""}</td></tr>`).join("")}
      </table>
      ${b.list.some((q) => !q.sec) ? `<div class="warn">Пролёт велик для цельной доски: нужна несущая стена или прогон посередине (глава 6).</div>` : ""}
      <p class="note">Длина — по наружным граням стен. Балки опирают на стену не меньше чем на 150 мм, торцы в кладке обрабатывают и изолируют.</p>`;
    const sample = mapCalc({ ...DEFAULT, height: 2801 });
    const lock = (html, sampleHtml, title, text) => (S.paid ? html : `<div class="locked-body">${sampleHtml}</div>${lockHtml(title, text)}`);
    v.innerHTML = `<h2>Карта</h2>
      <div class="seg" id="mapSeg" style="margin-bottom:12px"><button type="button" data-layer="rafters" class="${layer === "rafters" ? "on" : ""}">Стропила</button><button type="button" data-layer="beams" class="${layer === "beams" ? "on" : ""}">Балки перекрытия</button></div>
      <div class="card"><h3>План сверху</h3><p class="sub" id="planSub"></p><div id="planBox"></div></div>
      ${layer === "rafters"
        ? `<div class="card"><h3>Что пилить</h3><div id="cutBox">${lock(cutList(m), cutList(sample), "Карта раскроя", "Все детали крыши с количеством, длинами, сечением и объёмом леса.")}</div></div>
          <div class="card"><h3>Шаг и снег</h3><div class="grid">
            ${field("step", "Шаг стропил, мм")}
            ${field("snow", "Снег", { options: [["100", "Мало"], ["180", "Средне"], ["250", "Много"], ["320", "Очень много"]] })}
          </div></div>`
        : `<div class="card"><h3>Балки</h3><div id="cutBox">${lock(beamList(m.beams), beamList(sample.beams), "Балки перекрытия", "Раскладка, количество, длины и сечение балок под ваш пролёт.")}</div></div>
          <div class="card"><h3>Нагрузка и шаг</h3><div class="grid">
            ${field("beamStep", "Шаг балок, мм", { ph: "600" })}
            ${field("attic", "Над перекрытием", { options: [["warm", "Мансарда, жилое"], ["cold", "Холодный чердак"]] })}
          </div></div>`}`;
    const draw = () => {
      const p2 = P(), m2 = mapCalc(p2);
      $("#planBox").innerHTML = planSvg(p2, m2.M, { layer, beams: m2.beams });
      $("#planSub").textContent = layer === "rafters"
        ? `${FORMS.find((f) => f[0] === (p2.form || "gable"))[1]}${m2.M.wing ? " с пристройкой" : ""} · ${fmt(m2.W / 1000, 1)} × ${fmt(m2.L / 1000, 1)} м · шаг ${f0(m2.sp.step)} мм. Нажмите, чтобы увеличить`
        : `Балки ${m2.beams.list.map((q) => `${q.n} шт. по ${fmt(q.len / 1000, 2)} м`).join(" + ")} · шаг ${f0(m2.beams.list[0].step)} мм. Нажмите, чтобы увеличить`;
      if (S.paid) $("#cutBox").innerHTML = layer === "rafters" ? cutList(m2) : beamList(m2.beams);
    };
    bindFields(v, draw);                                  // перерисовываем только план и список, поля не теряют фокус
    draw();
    v.addEventListener("click", (e) => {
      const lb = e.target.closest("[data-layer]");
      if (lb) { S.mapLayer = lb.dataset.layer; freshView(); viewMap(); haptic(); return; }
      const z = e.target.closest("svg.plan"); if (z) openZoom(z.outerHTML);
    });
  }

  /* ---------- смета ---------- */
  function estimateCalc(p) {
    const m = mapCalc(p), M = m.M;
    const rafterParts = m.parts.filter((q) => q.raf);
    const rafters = rafterParts.reduce((a, q) => a + q.n, 0);
    const rafterLenTotal = rafterParts.reduce((a, q) => a + q.n * q.len, 0);
    const splices = rafterParts.filter((q) => q.len > 6000).reduce((a, q) => a + q.n, 0);
    return C.estimate({
      W: m.W, L: m.L, angle: M.slopes[0].angle, over: m.over, form: p.form, material: p.material, step: M.sp.step,
      rafters, rafterLenTotal, ridgeType: rafterCalc(false, p, M.slopes[0].key).ridge.type, box: p.box,
      insulate: !!p.insulate, wallH: num(p.wallH, 3000), splices, pairs: Math.ceil(rafters / 2), geo: M.geo, wing: !!M.wing,
    });
  }
  function estimateHtml(p, sample = false) {
    const e = estimateCalc(p);
    const prices = p.prices || {}, bought = p.bought || {};
    const q = (x) => (Number.isInteger(x) ? f0(x) : fmt(x, 2));
    const rows = e.groups.map((g) => `<div class="card"><h3>${g.group}</h3>
      ${g.items.map((it) => `<div class="er${bought[it.key] ? " bought" : ""}" data-row="${it.key}">
        <input class="er-cb" type="checkbox" data-bought="${it.key}" ${bought[it.key] ? "checked" : ""} ${sample ? "disabled" : ""} aria-label="Куплено">
        <div class="er-name">${it.name}${it.note ? `<small>${it.note}</small>` : ""}</div>
        <div class="er-qty"><b>${q(it.qty)}</b> ${it.unit}</div>
        <label class="er-price"><input data-price="${it.key}" data-qty="${it.qty}" type="number" inputmode="decimal" placeholder="цена за ед." value="${prices[it.key] ?? ""}" ${sample ? "disabled" : ""}><span>₽</span></label>
        <div class="er-sum" data-sum="${it.key}"></div>
      </div>`).join("")}
      <div class="res" style="margin-top:8px"><span class="k">Итого по разделу</span><span class="v" data-gsum="${g.group}">—</span></div></div>`).join("");
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
    text(`${p.name} · ${formName(p)} · ${fmt(num(p.width, 0) / 1000, 1)} × ${fmt(num(p.length, 0) / 1000, 1)} м · уклон ${fmt(angleOf(p), 1)}°`, MX, y, 3.6, { c: "#444" }); y += 5.5;
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
  /* План сверху для любой формы. Перед дома (y = 0) внизу. layer: "rafters" | "beams"; mini — эскиз на вкладке «Проект» */
  function planSvg(p, M, opt = {}) {
    const W = M.W, L = M.L, ov = M.over, w = M.wing, mini = !!opt.mini, layer = opt.layer || "rafters";
    const fw = w && w.side === "front" ? w.depth : 0, bw = w && w.side === "back" ? w.depth : 0;
    const xMin = -ov, xMax = L + ov, yMin = -ov - fw, yMax = W + ov + bw;
    const VW = 1000, pad = mini ? 30 : 90, maxH = mini ? 480 : 1000, top = mini ? 24 : 50;
    const k = Math.min((VW - 2 * pad) / (xMax - xMin), maxH / (yMax - yMin));
    const ox = (VW - (xMax - xMin) * k) / 2;
    const X = (x) => ox + (x - xMin) * k, Y = (y) => top + (yMax - y) * k;
    const VH = Y(yMin) + (mini ? 24 : 96);
    const wy = (v) => (w && w.side === "back" ? W + v : -v);          // v — расстояние от стены наружу
    const lw = mini ? 0.55 : 1;
    const ln2 = (x1, y1, x2, y2, c, wd, dash = "") => `<line x1="${X(x1).toFixed(1)}" y1="${Y(y1).toFixed(1)}" x2="${X(x2).toFixed(1)}" y2="${Y(y2).toFixed(1)}" stroke="${c}" stroke-width="${(wd * lw).toFixed(1)}"${dash ? ` stroke-dasharray="${dash}"` : ""} stroke-linecap="round"/>`;
    const rect = (x1, y1, x2, y2, attrs) => `<rect x="${X(Math.min(x1, x2)).toFixed(1)}" y="${Y(Math.max(y1, y2)).toFixed(1)}" width="${(Math.abs(x2 - x1) * k).toFixed(1)}" height="${(Math.abs(y2 - y1) * k).toFixed(1)}" ${attrs}/>`;
    const RAF = layer === "beams" ? "#e6dccb" : "#c99a5b", JACK = layer === "beams" ? "#eee6d8" : "#ddc193", HIP = "#8a4b2a", VAL = "#3d6fa3";
    const rw0 = mini ? 3.5 : 5, jw = mini ? 2.5 : 4;
    let g = "";
    // свесы и стены
    g += rect(-ov, -ov, L + ov, W + ov, `fill="none" stroke="${BLUE}" stroke-width="2" stroke-dasharray="6 6"`);
    if (w) g += rect(w.x1 - ov, wy(0), w.x2 + ov, wy(w.depth + ov), `fill="none" stroke="${BLUE}" stroke-width="2" stroke-dasharray="6 6"`);
    if (w) g += rect(w.x1, wy(0), w.x2, wy(w.depth), w.form === "shed" ? `fill="#fbf9f4" stroke="${INKC}" stroke-width="1.5" stroke-dasharray="8 6"` : `fill="#f6f2ea" stroke="${INKC}" stroke-width="2.5"`);
    g += rect(0, 0, L, W, `fill="#f6f2ea" stroke="${INKC}" stroke-width="2.5"`);
    // основной объём
    const step = M.sp.step;
    const inWing = (x, side) => w && w.form !== "shed" && w.side === side && x > w.x1 + 1 && x < w.x2 - 1;
    const eOf = (x) => Math.min(x - w.x1, w.x2 - x);
    if (M.form === "shed") {
      M.xs.forEach((x) => { g += ln2(x, -ov, x, W + ov, RAF, rw0); });
      if (!mini) g += `<text x="${X(L / 2).toFixed(1)}" y="${(Y(W) + 30).toFixed(1)}" font-size="22" text-anchor="middle" fill="#6f6c66">высокая стена</text>`;
    } else if (M.form === "hip") {
      const run = W / 2;
      M.xs.forEach((x) => {
        if (x >= run - 1 && x <= L - run + 1) {
          g += ln2(x, inWing(x, "front") ? eOf(x) : -ov, x, W / 2, RAF, rw0) + ln2(x, inWing(x, "back") ? W - eOf(x) : W + ov, x, W / 2, RAF, rw0);
        } else {
          const d = Math.min(x, L - x);
          if (d > 30) g += ln2(x, -ov, x, d, JACK, jw) + ln2(x, W + ov, x, W - d, JACK, jw);
        }
      });
      for (let y = step; y < W - 1; y += step) {
        const d = Math.min(y, W - y);
        g += ln2(-ov, y, d, y, JACK, jw) + ln2(L + ov, y, L - d, y, JACK, jw);
      }
      g += ln2(-ov, W / 2, run, W / 2, RAF, rw0) + ln2(L + ov, W / 2, L - run, W / 2, RAF, rw0);
      [[-ov, -ov, run, W / 2], [-ov, W + ov, run, W / 2], [L + ov, -ov, L - run, W / 2], [L + ov, W + ov, L - run, W / 2]].forEach(([a, b, c2, d]) => { g += ln2(a, b, c2, d, HIP, 9); });
      g += ln2(run, W / 2, L - run, W / 2, INKC, 4);
    } else {
      const ry = M.ridgeY;
      M.xs.forEach((x) => {
        g += ln2(x, inWing(x, "front") ? eOf(x) : -ov, x, ry, RAF, rw0);
        g += ln2(x, inWing(x, "back") ? W - eOf(x) : W + ov, x, ry, RAF, rw0);
      });
      g += ln2(-ov, ry, L + ov, ry, INKC, 4);
    }
    // пристройка
    if (w) {
      if (w.form === "shed") {
        const sp2 = C.spacing({ length: w.w, step });
        for (let i = 0; i <= sp2.intervals; i++) { const x = w.x1 + i * sp2.step; g += ln2(x, wy(0), x, wy(w.depth + ov), RAF, rw0); }
        g += ln2(w.x1 - ov, wy(w.depth), w.x2 + ov, wy(w.depth), HIP, 6);
      } else {
        const hipEnd = w.form === "hip" && w.depth > w.rw;
        const fullLen = hipEnd ? w.depth - w.rw : w.depth, n = Math.ceil(fullLen / step - 1e-9);
        for (let j = 1; j <= n; j++) { const v = (j * fullLen) / n; g += ln2(w.x1 - ov, wy(v), w.x2 + ov, wy(v), RAF, rw0); }
        for (let v2 = step; v2 < w.rw - 30; v2 += step) { g += ln2(w.x1 + v2, wy(-v2), w.xc, wy(-v2), JACK, jw) + ln2(w.x2 - v2, wy(-v2), w.xc, wy(-v2), JACK, jw); }
        if (hipEnd) {
          const vr = w.depth - w.rw;
          for (let dx = step; dx < w.rw - 30; dx += step) {
            g += ln2(w.xc - dx, wy(w.depth + ov), w.xc - dx, wy(vr + dx), JACK, jw) + ln2(w.xc + dx, wy(w.depth + ov), w.xc + dx, wy(vr + dx), JACK, jw);
          }
          g += ln2(w.xc, wy(w.depth + ov), w.xc, wy(vr), RAF, rw0);
          g += ln2(w.x1 - ov, wy(w.depth + ov), w.xc, wy(vr), HIP, 9) + ln2(w.x2 + ov, wy(w.depth + ov), w.xc, wy(vr), HIP, 9);
          g += ln2(w.xc, wy(-w.rw), w.xc, wy(vr), INKC, 4);
        } else {
          g += ln2(w.xc, wy(-w.rw), w.xc, wy(w.depth + ov), INKC, 4);
        }
        g += ln2(w.x1 - ov, wy(ov), w.xc, wy(-w.rw), VAL, 8) + ln2(w.x2 + ov, wy(ov), w.xc, wy(-w.rw), VAL, 8);
      }
    }
    // балки перекрытия
    if (layer === "beams" && opt.beams) {
      opt.beams.list.forEach((b) => {
        const sp2 = C.spacing({ length: b.along, step: b.step });
        for (let i = 0; i <= sp2.intervals; i++) {
          const t = i * sp2.step;
          if (b.key === "main") g += ln2(t, 0, t, W, HIP, 6);
          else if (b.key === "wingAcross") g += ln2(w.x1 + t, wy(0), w.x1 + t, wy(w.depth), HIP, 6);
          else g += ln2(w.x1, wy(t), w.x2, wy(t), HIP, 6);
        }
      });
    }
    // размеры
    if (!mini) {
      g += arrowDim([X(0), Y(yMin)], [X(L), Y(yMin)], f0(L), 40, { fs: 26 });
      g += arrowDim([X(xMin), Y(W)], [X(xMin), Y(0)], f0(W), 30, { fs: 26 });
      if (M.form === "gable" && Math.abs(M.shift) > 0) g += arrowDim([X(xMax), Y(M.ridgeY)], [X(xMax), Y(0)], f0(M.ridgeY), -30, { fs: 22 });
      if (w) {
        const vEnd = wy(w.depth);
        g += arrowDim([X(w.x1), Y(vEnd)], [X(w.x2), Y(vEnd)], f0(w.w), w.side === "front" ? -30 : 30, { fs: 22 });
        g += arrowDim([X(w.x2 + ov), Y(Math.max(wy(0), vEnd))], [X(w.x2 + ov), Y(Math.min(wy(0), vEnd))], f0(w.depth), -30, { fs: 22 });
      }
      g += `<text x="${(X(0) + 8).toFixed(1)}" y="${(Y(0) - 10).toFixed(1)}" font-size="20" fill="#8a8780">перед</text>`;
      if (layer === "rafters") {
        const lg = (x, c, wd, t) => `<line x1="${x}" y1="${VH - 22}" x2="${x + 34}" y2="${VH - 22}" stroke="${c}" stroke-width="${wd}"/><text x="${x + 42}" y="${VH - 15}" font-size="20" fill="#6f6c66">${t}</text>`;
        g += lg(40, RAF, 5, "стропила") + lg(200, INKC, 4, "конёк") + (M.form === "hip" || (w && w.form === "hip") ? lg(330, HIP, 8, "накосные") : "") + (w && w.form !== "shed" ? lg(500, VAL, 8, "ендовы") : "");
      }
    }
    return `<svg class="draw plan" viewBox="0 0 ${VW} ${VH.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">${g}</svg>`;
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
        <p>${S.paid ? (S.until ? `Пробный полный доступ до ${untilStr()}. Если приложение пригодилось, расскажите, чего не хватает.` : "У вас полный доступ навсегда. Спасибо!") : "Бесплатно: проект, уклон и длина стропил, план сверху, первый чек-лист, часть советов. Полный доступ открывает разметку доски и кондуктор, карту раскроя, сечения, все чек-листы, советы и чертежи."}</p>
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
  // буквы на схеме: что правит каждая. Для выбранного ската (S.slope): C — заложение, Q — уклон, H — высота
  const curSlope = (p) => { const M = modelOf(p); return { M, sl: M.slopes.find((s) => s.key === S.slope) || M.slopes[0] }; };
  const LETTERS = {
    A: { k: "h", t: "A — высота доски", u: "мм" },
    Q: { t: "Q — уклон ската. Высота пересчитается сама", u: "°",
      get: (p) => Math.round(curSlope(p).sl.angle * 10) / 10,
      apply: (v, p) => {
        const { M, sl } = curSlope(p), tg2 = Math.tan(rad(Math.min(v, 75)));
        if (sl.wing && sl.end === "ledger") p.wing.angle = v;
        else if (sl.wing) p.height = Math.round(M.wing.mainRun * tg2);
        else p.height = Math.round(sl.run * tg2);
      } },
    H: { t: "H — высота конька над мауэрлатом. Уклон пересчитается сам", u: "мм",
      get: (p) => { const { sl } = curSlope(p); return Math.round(sl.wing ? sl.run * Math.tan(rad(sl.angle)) : heightOf(p)); },
      apply: (v, p) => {
        const { sl } = curSlope(p);
        if (sl.wing && sl.end === "ledger") p.wing.angle = Math.round(deg(Math.atan(v / sl.run)) * 10) / 10;
        else if (sl.wing) toast("Высоту конька пристройки задают её ширина и уклон основного ската");
        else p.height = v;
      } },
    C: { t: "C — заложение: от наружной грани мауэрлата до оси конька", u: "мм",
      get: (p) => Math.round(curSlope(p).sl.run),
      apply: (v, p) => {
        const { M, sl } = curSlope(p);
        if (sl.wing) { if (sl.end === "ledger") p.wing.depth = v; else p.wing.w = 2 * v; }
        else if (p.form === "shed") p.width = v + num(p.plate, 150);
        else if (sl.side === "both") p.width = 2 * v;
        else {
          const other = M.slopes.find((s) => !s.wing && s.key !== sl.key).run;
          p.width = v + other; p.shift = sl.key === "front" ? (v - other) / 2 : (other - v) / 2;
        }
      } },
    D: { k: "over", t: "D — свес по горизонтали", u: "мм" },
    R: { k: "d", t: "R — остаток доски над запилом, поперёк доски (пусто — запил на четверть доски)", u: "мм", allowEmpty: true,
      get: (p) => (p.d === "" || p.d == null ? "" : num(p.h, 200) - p.d), set: (v, p) => Math.max(0, num(p.h, 200) - v) },
    M: { k: "plate", t: "M — ширина мауэрлата", u: "мм" },
  };
  const RIDGES = [["prop", "Подпирают"], ["board", "В стык"], ["beam", "Опираются"]];
  const deg = (r) => (r * 180) / Math.PI;

  function viewRafter() {
    const v = $("#view");
    const p = P();
    const M = modelOf(p);
    if (!M.slopes.find((s) => s.key === S.slope)) S.slope = M.slopes[0].key;
    const sl = M.slopes.find((s) => s.key === S.slope);
    const tabs = M.slopes.length > 1 ? `<div class="seg" id="slopeSeg" style="margin-bottom:12px">${M.slopes.map((s) => `<button type="button" data-slope="${s.key}" class="${s.key === S.slope ? "on" : ""}">${s.wing ? "Пристройка" : s.key === "front" ? "Скат 1" : s.key === "back" ? "Скат 2" : "Основные"}</button>`).join("")}</div>` : "";
    const ridgeCard = sl.end === "ridge"
      ? `<div class="card"><h3>Соединение в коньке</h3>
        <div class="seg" id="ridgeSeg">${RIDGES.map(([k, t]) => `<button type="button" data-ridge="${k}" class="${(p.ridge || "board") === k ? "on" : ""}">${t}</button>`).join("")}</div>
        <p class="note" id="ridgeName" style="margin-top:8px"></p>
        <div class="grid" style="margin-top:10px">
          <div data-rshow="beam">${field("beamW", "Толщина конька (доска или прогон), мм", { ph: "150" })}</div>
          <div data-rshow="board prop">${field("ridgeT", "Толщина коньковой доски, мм", { ph: "50" })}</div>
          <div data-rshow="beam prop">${field("dr", "Глубина гнезда по отвесу, мм", { ph: "авто" })}</div>
        </div>
        <p class="note" id="ridgeNote"></p></div>`
      : `<div class="card"><h3>Верхний конец</h3><p class="note" style="margin-top:0">${sl.end === "wall"
        ? "Односкатная: стропило садится вторым запилом на верхнюю стену, такой же формы, как нижний, и выходит за неё на свес D."
        : "Навес: верх стропила режется по отвесу и упирается в опорный брус на стене, низ садится запилом на балку по столбам."}</p><p class="note" id="ridgeNote" style="display:none"></p></div>`;
    v.innerHTML = `<h2>Стропила</h2>${tabs}
      <div class="card bp-card"><div id="bp"></div><p class="bp-hint">Нажмите на букву, чтобы ввести размер. Уклон задаётся буквой Q или H.</p></div>
      ${ridgeCard}
      <div id="out"></div>
      <div class="card"><h3>Сращивание доски</h3><p class="sub">Рекомендация автора: косой замок с двумя упорами. Нажмите на чертёж, чтобы увеличить</p><div id="splice"></div>
        <p class="note">Стык располагают над опорой или рядом с ней. Крепёж — два шурупа или болта навстречу друг другу, через упоры, как показано стрелками.</p></div>`;
    bindFields(v, rafterOut);
    v.addEventListener("click", (e) => {
      const sb = e.target.closest("[data-slope]");
      if (sb) { S.slope = sb.dataset.slope; freshView(); viewRafter(); haptic(); return; }
      const t = e.target.closest("[data-letter]");
      if (t) return editLetter(t.dataset.letter);
      const z = e.target.closest("svg.board");
      if (z) return openZoom(z.outerHTML);
      const rb = e.target.closest("[data-ridge]");
      if (rb) {
        P().ridge = rb.dataset.ridge; save();
        v.querySelectorAll("[data-ridge]").forEach((b) => b.classList.toggle("on", b === rb));
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
    const title = L === "H" && p.form === "shed" && !curSlope(p).sl.wing ? "H — перепад высоты стен по верху мауэрлатов. Уклон пересчитается сам"
      : L === "C" && p.form === "shed" && !curSlope(p).sl.wing ? "C — между запилами: от наружной грани нижней стены до внутренней грани верхней" : def.t;
    const bg = document.createElement("div");
    bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>${title}</h3>
      <input id="letterIn" type="number" inputmode="decimal" value="${cur === "" || cur == null ? "" : cur}" placeholder="${def.allowEmpty ? "авто" : ""}">
      <button class="btn" type="button" data-ok>Готово, ${def.u}</button></div>`;
    document.body.appendChild(bg);
    const inp = $("#letterIn", bg);
    setTimeout(() => inp.focus(), 50);
    const done = () => {
      const raw = inp.value.replace(",", ".").trim();
      if (raw === "" && def.allowEmpty) p[def.k] = "";
      else if (raw !== "" && !isNaN(raw) && Number(raw) > 0) {
        if (def.apply) def.apply(Number(raw), p);
        else p[def.k] = def.set ? def.set(Number(raw), p) : Number(raw);
      }
      save(); bg.remove(); rafterOut(); haptic();
    };
    bg.addEventListener("click", (e) => {
      if (e.target === bg) bg.remove();
      if (e.target.closest("[data-ok]")) done();
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); });
  }
  function rafterCalc(sample = false, pp = null, key = null) {
    const p = sample ? { ...DEFAULT, height: 2801, ridge: P().ridge } : pp || P();
    const M = modelOf(p);
    const sl = M.slopes.find((s) => s.key === (key || S.slope)) || M.slopes[0];
    const run = sl.run;
    const r = C.rafter({ run, angle: sl.angle, over: num(p.over, 0), h: num(p.h, 200),
      d: p.d === "" ? null : num(p.d, null), plate: num(p.plate, 150) });
    const type = sl.end === "wall" ? "wall" : sl.end === "ledger" ? "board" : p.ridge || "board";
    const ridge = C.ridgeEnd({ run, angle: r.angle, h: r.h, type, ridgeT: sl.end === "ledger" ? 0 : num(p.ridgeT, 50), beamW: num(p.beamW, 150),
      dr: p.dr === "" ? null : num(p.dr, null), d: r.d, plate: num(p.plate, 150), over: num(p.over, 0) });
    const xmin = -r.lenOver, xmax = Math.max(...ridge.pts.map((q) => q[0]));
    const gab = xmax - xmin;
    const board = C.BOARDS.find((b) => b >= gab + 50) || null;
    return { p, r, ridge, gab, board, sp: M.sp, run, M, sl };
  }
  function rafterOut() {
    const { p, r, ridge, gab, board, run, M, sl } = rafterCalc();
    $("#bp").innerHTML = blueprintSvg(r, run);
    $("#splice").innerHTML = spliceSvg(r.h);
    document.querySelectorAll("[data-rshow]").forEach((el) => { el.style.display = el.dataset.rshow.split(" ").includes(p.ridge || "board") ? "" : "none"; });
    const rn = $("#ridgeName");
    if (rn) rn.textContent = { prop: "Стропила подпирают конёк", board: "Стропила в стык с коньком", beam: "Стропила опираются на конёк" }[p.ridge || "board"];
    $("#ridgeNote").textContent = ridge.type === "beam"
      ? "Конёк под стропилами: гнездо снизу — упор в грань конька, площадка лежит на нём, верхний рез по оси, встык с парным стропилом."
      : ridge.type === "prop"
        ? `Пара стропил сходится на оси резами по отвесу, сверху в гнёзда встаёт коньковая доска на ребре. Площадка гнезда — половина толщины доски: ${f0(ridge.seat)} мм.`
      : ridge.type === "wall" ? ""
      : ridge.ridgeT > 0
        ? `Коньковая доска стоит на ребре между стропилами, стропила упираются в неё резом по отвесу. Рез отступает от оси на половину толщины: ${f0(ridge.gap)} мм.`
        : "Толщина 0: пара стропил сходится на оси конька резами по отвесу, стык закрывают накладками.";
    const sl0 = C.slope({ angle: r.angle });
    let html = `<div class="card"><h3>Длина стропила${M.slopes.length > 1 ? ` · ${sl.label.toLowerCase()}` : ""}</h3><div class="res">
        <span class="k">Уклон</span><span class="v">${fmt(r.angle, 1)}° · ${fmt(sl0.percent)} %</span>
        <span class="k">${p.form === "shed" && !sl.wing ? "H — перепад высоты стен" : "H — высота конька над мауэрлатом"}</span><span class="v">${mm(r.rise)}</span>
        <hr><span class="k">Габарит доски с резами</span><span class="v big">${mm(gab)}</span>
        <span class="k">Брать доску</span><span class="v">${board ? m(board) : "сращивать"}</span>
        <span class="k">Сечение доски</span><span class="v">${S.paid ? secLabel(p, run, r) : "🔒"}</span>
        <hr><span class="k">Стропил такого вида</span><span class="v">${sl.n} шт.</span>
        <span class="k">Фактический шаг</span><span class="v">${mm(M.sp.step)}</span>
      </div>
      <button class="btn ghost" data-act="sendRafter" type="button">Отправить расчёт в чат</button></div>`;

    const smp = S.paid ? { r, ridge } : rafterCalc(true);     // под замком — пример из книги
    const rr = smp.r, rg = smp.ridge;
    const warns = rr.warnings.concat(rg.warnings);
    const layout = `<h3>Разметка доски</h3><p class="sub">Нажмите на чертёж, чтобы увеличить</p>${boardSvg(rr, rg)}
      <div class="res">
        <span class="k">От торца свеса до запила (по низу)</span><span class="v">${mm(rr.lenOver)}</span>
        <span class="k">Угол торцевых резов к кромке</span><span class="v">${fmt(rr.plumbAngleToEdge, 1)}°</span>
        <span class="k">Опорный запил: глубина поперёк / остаток доски</span><span class="v">${mm(rr.d)} / ${mm(rr.rest)}</span>
        <span class="k">Отвесный рез / площадка / по кромке</span><span class="v">${f0(rr.plumb)} / ${f0(rr.seat)} / ${mm(rr.along)}</span>
        ${rg.type === "beam" ? `<span class="k">Гнездо в коньке: упор / площадка</span><span class="v">${mm(rg.lowerFace)} / ${mm(rg.seat)}</span>` : ""}
        ${rg.type === "prop" ? `<span class="k">Гнездо под конёк: отвес / площадка</span><span class="v">${mm(rg.upperFace)} / ${mm(rg.seat)}</span><span class="k">Рез у оси по отвесу</span><span class="v">${mm(rg.lowerFace)}</span>` : ""}
        ${rg.type === "wall" ? `<span class="k">Между запилами (по низу)</span><span class="v">${mm(rg.bottomEnd)}</span><span class="k">Свес за верхней стеной</span><span class="v">${mm(rg.overLen)}</span>` : ""}
      </div>
      ${warns.map((w) => `<div class="warn">${w}</div>`).join("")}
      <button class="btn" data-act="jig" type="button">Кондуктор 1:1 для печати (PDF)</button>
      <p class="note">Шаблон печатается на листах A4 в натуральную величину. На последнем листе контрольный квадрат 50 мм: проверьте его линейкой, прежде чем вырезать.</p>`;
    html += `<div class="card">${S.paid ? layout : `<div class="locked-body">${layout}</div>${lockHtml("Разметка и кондуктор", "Развёртка доски со всеми размерами, запилы на мауэрлате и в коньке, шаблон для печати 1:1.")}`}</div>`;

    const hipCard = (title, hp, ang) => `<h3>${title}</h3><div class="res">
          <span class="k">Накосное стропило</span><span class="v">${mm(hp.hipLen)}</span>
          <span class="k">Накосное со свесом</span><span class="v">${mm(hp.hipWithOver)}</span>
          <span class="k">Уклон накосного</span><span class="v">${fmt(hp.hipAngle, 1)}°</span>
          <span class="k">Нарожники короче на</span><span class="v">${mm(hp.decrement)}</span></div>
        <h3 style="margin-top:12px">Нарожники (без свеса / со свесом)</h3>
        ${hp.jacks.map((j) => `<div class="list-row"><span>№ ${j.n}</span><span>${mm(j.len)} / ${mm(j.withOver)}</span></div>`).join("")}
        <p class="note">Верх нарожника режется двойным углом: по вертикали под уклоном ${fmt(ang, 1)}° и в плане под 45°. Накосное стропило делайте спаренным.</p>`;
    const lockCard = (inner, sampleInner, t, d) => `<div class="card">${S.paid ? inner : `<div class="locked-body">${sampleInner}</div>${lockHtml(t, d)}`}</div>`;
    const sampleHip = C.hip({ run: 4000, angle: 35, over: 500, step: 588 });
    if (p.form === "hip" && !sl.wing) {
      const hp = C.hip({ run: W2(p), angle: r.angle, over: num(p.over, 0), step: M.sp.step });
      html += lockCard(hipCard("Вальма", hp, r.angle), hipCard("Вальма", sampleHip, 35), "Вальма", "Длина накосного стропила и нарожников по порядку.");
    }
    if (sl.wing && M.ex.valley) {
      const v2 = C.hip({ run: M.wing.rw, angle: M.wing.angle, over: num(p.over, 0), step: M.sp.step });
      const valley = `<h3>Ендовы</h3><div class="res">
          <span class="k">Ендовное стропило со свесом</span><span class="v">${mm(v2.hipWithOver)}</span>
          <span class="k">Уклон ендовы</span><span class="v">${fmt(v2.hipAngle, 1)}°</span>
          <span class="k">Ендов</span><span class="v">2 шт., спаренные</span></div>
        <h3 style="margin-top:12px">Нарожники у ендовы, без свеса</h3>
        ${v2.jacks.map((j) => `<div class="list-row"><span>№ ${j.n} · 4 шт.</span><span>${mm(j.len)}</span></div>`).join("")}
        ${M.ex.mainShort.length ? `<h3 style="margin-top:12px">Укороченные стропила основного ската</h3>${M.ex.mainShort.map((q) => `<div class="list-row"><span>${q.n} шт.</span><span>${mm(q.len)}</span></div>`).join("")}` : ""}
        <p class="note">Ендова считается как накосное стропило с заложением в половину ширины пристройки. Низ нарожников режется двойным углом под ендову.</p>`;
      html += lockCard(valley, hipCard("Ендовы", sampleHip, 35), "Ендовы", "Длина ендовных стропил, нарожников и укороченных стропил.");
      if (M.ex.wingHip) {
        const he = C.hip({ run: M.wing.rw, angle: M.wing.angle, over: num(p.over, 0), step: M.sp.step });
        html += lockCard(hipCard("Вальма пристройки", he, M.wing.angle), hipCard("Вальма", sampleHip, 35), "Вальма пристройки", "Накосные и нарожники вальмы пристройки.");
      }
    }
    $("#out").innerHTML = html;
  }
  const W2 = (p) => num(p.width, 8000) / 2;

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
      ${(() => { const rem = th - dS * cs, Q2 = [P[0] - sn * rem, P[1] - cs * rem];
        return dimLine(P[0], P[1], Q2[0], Q2[1], "#ffe08a") + tag(Q2[0] - 4, Q2[1] - 8, "R", f0(r.rest), "end"); })()}
      ${tag(P[0] + pw / 2, P[1] + ph + 22, "M", f0(r.plate))}
    </svg>`;
  }

  /* --- развёртка доски в стиле чертежей автора: красный контур, голубой габарит, чёрные размеры --- */
  function boardSvg(r, ridge) {
    const a = rad(r.angle), s = Math.sin(a), c = Math.cos(a), t = Math.tan(a);
    const h = r.h;
    const E0 = [-r.lenOver, 0], E1 = [-r.lenOver + h * t, h];
    const [V, Pn, Hn] = r.geo.notch;
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
    } else if (ridge.type === "prop") {
      const [B0, B1, B2, B3] = RP;
      ridgeDims = arrowDim(S2(B0), S2(B1), f0(ridge.lowerFace), 34, { side: 1, fs: 22 })
        + arrowDim(S2(B1), S2(B2), f0(ridge.seat), 16, { side: 1, fs: 22, head: 11 })
        + arrowDim(S2(B2), S2(B3), f0(ridge.upperFace), -22, { side: -1, fs: 22, head: 11 });
    } else if (ridge.type === "wall") {
      const [N0, N1, N2, T0, T1] = RP;
      ridgeDims = arrowDim(S2(N0), S2(N1), f0(ridge.notch.plumb), -22, { side: -1, fs: 22, head: 11 })
        + arrowDim(S2(N1), S2(N2), f0(ridge.notch.seat), -18, { side: -1, fs: 22, head: 11 })
        + arrowDim(S2(N2), S2(T0), f0(T0[0] - N2[0]), 40, { side: 1, fs: 22 })
        + arrowDim(S2(T0), S2(T1), f0(ridge.full), 34, { side: 1, fs: 24 });
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
      ${arrowDim(S2(V), S2(Pn), f0(r.plumb), -22, { side: -1, fs: 22, head: 11 })}
      ${arrowDim(S2(Pn), S2(Hn), f0(r.seat), -18, { side: -1, fs: 22, head: 11 })}
      ${arrowDim(S2(E0), S2(V), f0(r.lenOver), 40, { side: 1 })}
      ${arrowDim(S2(V), S2(Hn), f0(r.along), 40, { side: 1, fs: 22 })}
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
      g.fillText(`${fmt(r.angle, 1)}° · запил ${Math.round(r.d)} мм поперёк, остаток ${Math.round(r.rest)} мм`, lab[0], lab[1] + 6 * PX);
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
        const res = await api("sendDoc", { filename: fname, caption: `Кондуктор опорного запила: доска ${r.h} мм, уклон ${fmt(r.angle, 1)}°, запил ${Math.round(r.d)} мм поперёк доски (остаток ${Math.round(r.rest)} мм). Печать 100 %.`, data: b64 });
        if (res.ok) { toast("PDF в чате с ботом"); haptic("medium"); return; }
      } catch (_) { /* упадём на скачивание */ }
    }
    doc.save(fname);
  }

  /* ---------- проект в PDF: исходные данные, план, разметка стропил, детали, балки, материалы ---------- */
  function svgImage(svg, wPx) {
    const vb = ((svg.match(/viewBox="([^"]+)"/) || [])[1] || "0 0 1000 600").split(/\s+/).map(Number);
    const hPx = Math.round((wPx * vb[3]) / vb[2]);
    const s2 = svg.replace(/^<svg([^>]*?)\sclass="[^"]*"/, "<svg$1").replace("<svg", `<svg width="${wPx}" height="${hPx}"`);
    return new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res({ im, w: wPx, h: hPx });
      im.onerror = rej;
      im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s2);
    });
  }
  async function projectPdf() {
    if (!S.paid) return buy();
    if (!window.jspdf) return toast("Не загрузилась библиотека PDF. Проверьте интернет.");
    toast("Собираю PDF проекта…");
    const p = P(), mc = mapCalc(p), M = mc.M, e = estimateCalc(p), mat = materialOf(p);
    const PX = 6, PW = 210, PH = 297, MX = 14, bottom = PH - 16, CW = PW - 2 * MX;
    const pages = [];
    let cv, g, y;
    const font = (sz, w = 400) => `${w} ${sz * PX}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    const newPage = () => {
      cv = document.createElement("canvas"); cv.width = PW * PX; cv.height = PH * PX;
      g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      pages.push(cv); y = 16;
    };
    const text = (t, x, yy, sz, opt = {}) => {
      g.font = font(sz, opt.w || 400); g.fillStyle = opt.c || "#1d1d1b"; g.textAlign = opt.a || "left";
      g.fillText(String(t), x * PX, yy * PX);
    };
    const wrap = (t, maxMm, sz) => {
      g.font = font(sz); const words = String(t).split(" "); const lines = []; let cur = "";
      for (const w of words) { const s2 = cur ? cur + " " + w : w; if (g.measureText(s2).width / PX > maxMm && cur) { lines.push(cur); cur = w; } else cur = s2; }
      if (cur) lines.push(cur); return lines;
    };
    const hline = (yy, c = "#d9d5cc", w = 0.25) => { g.strokeStyle = c; g.lineWidth = w * PX; g.beginPath(); g.moveTo(MX * PX, yy * PX); g.lineTo((PW - MX) * PX, yy * PX); g.stroke(); };
    const need = (h) => { if (y + h > bottom) newPage(); };
    const h1 = (t) => { need(30); text(t, MX, y + 6, 6, { w: 800 }); y += 12; };
    const h2 = (t) => { need(24); text(t.toUpperCase(), MX, y + 4, 3.3, { w: 700, c: "#b8322a" }); y += 6; hline(y, "#1d1d1b", 0.35); y += 5; };
    const kv = (k, v) => { need(6); text(k, MX, y, 3.4, { c: "#555" }); text(v, PW - MX, y, 3.4, { a: "right", w: 600 }); y += 5.6; };
    const note = (t) => { wrap(t, CW, 2.9).forEach((l) => { need(5); text(l, MX, y, 2.9, { c: "#777" }); y += 4.2; }); };
    const img = async (svg, minMm = 80) => {             // не влезает — уменьшаем под остаток листа, если его хватает
      const { im, h } = await svgImage(svg, CW * PX);
      let hMm = h / PX, wMm = CW;
      const fit = () => { const av = bottom - y; if (hMm > av) { wMm *= av / hMm; hMm = av; } };
      if (hMm > bottom - y) { if (bottom - y < minMm) newPage(); fit(); }
      g.drawImage(im, (MX + (CW - wMm) / 2) * PX, y * PX, wMm * PX, hMm * PX); y += hMm + 4;
    };
    const row = (cells, opt = {}) => {                     // таблица: название | шт. | длина | доска
      const lines = wrap(cells[0], 96, 3.3), sub = cells[4] ? wrap(cells[4], 96, 2.7) : [];
      const hR = 1.5 + lines.length * 4.3 + sub.length * 3.4 + 1.2;
      need(hR);
      let yy = y + 4;
      lines.forEach((l) => { text(l, MX, yy, 3.3, { w: opt.head ? 700 : 400, c: opt.head ? "#888" : "#1d1d1b" }); yy += 4.3; });
      sub.forEach((l) => { text(l, MX, yy - 0.6, 2.7, { c: "#888" }); yy += 3.4; });
      text(cells[1], 128, y + 4, 3.3, { a: "right", w: opt.head ? 700 : 600, c: opt.head ? "#888" : "#1d1d1b" });
      text(cells[2], 158, y + 4, 3.3, { a: "right", c: opt.head ? "#888" : "#1d1d1b" });
      text(cells[3], PW - MX, y + 4, 3.3, { a: "right", c: opt.head ? "#888" : "#1d1d1b" });
      y += hR; hline(y);
    };
    const boxName = { gas: "газобетон / пеноблок", brick: "кирпич", timber: "брус / бревно", frame: "каркас" }[p.box] || "";
    const formLabel = FORMS.find((f) => f[0] === (p.form || "gable"))[1];
    const r0 = rafterCalc(false, p, M.slopes[0].key);
    const ridgeName = p.form === "shed" ? "нет, верх на стене" : r0.ridge.type === "prop" ? `стропила подпирают конёк ${f0(r0.ridge.ridgeT)} мм` : r0.ridge.type === "beam" ? "стропила опираются на конёк"
      : r0.ridge.ridgeT > 0 ? `в стык коньковой доске ${f0(r0.ridge.ridgeT)} мм` : "пара встык на оси";

    newPage();
    text("Проект крыши", MX, y + 7, 7.5, { w: 800 }); y += 14;
    text(`${p.name} · ${new Date().toLocaleDateString("ru-RU")} · «Крыша без переделок»`, MX, y, 3.6, { c: "#555" }); y += 9;
    h2("Исходные данные");
    kv("Дом по наружным граням", `${fmt(mc.W / 1000, 2)} × ${fmt(mc.L / 1000, 2)} м`);
    kv("Стены", boxName);
    kv("Форма крыши", formLabel + (M.form === "gable" && Math.abs(M.shift) > 0 ? `, конёк смещён на ${f0(Math.abs(M.shift))} мм` : ""));
    if (M.wing) kv("Пристройка", `${M.wing.side === "front" ? "спереди" : "сзади"}, ${{ gable: "двускатная", hip: "с вальмой", shed: "навес" }[M.wing.form]}, ${fmt(M.wing.w / 1000, 2)} × ${fmt(M.wing.depth / 1000, 2)} м`);
    kv(p.form === "shed" ? "Перепад высоты стен" : "Высота конька над мауэрлатом", mm(heightOf(p)));
    M.slopes.forEach((s) => kv(`Уклон: ${s.label.toLowerCase()}`, `${fmt(s.angle, 1)}°`));
    kv("Свес по горизонтали", mm(mc.over));
    kv("Кровля", mat.t);
    kv("Шаг стропил", mm(M.sp.step));
    kv("Сечение стропил", mc.sec.label);
    kv("Конёк", ridgeName);
    kv("Площадь кровли по скатам", `${fmt(e.area, 1)} м²`);
    y += 3;
    need(90); h2("План крыши");
    await img(planSvg(p, M, { layer: "rafters" }));
    M.warnings.forEach((w) => note("Внимание: " + w));

    newPage();
    h1("Разметка стропил");
    for (const sl of M.slopes) {
      const rc = rafterCalc(false, p, sl.key);
      h2(`${sl.label} · ${sl.n} шт.`);
      await img(boardSvg(rc.r, rc.ridge));
      kv("Габарит доски с резами", mm(rc.gab));
      kv("Брать доску", rc.board ? m(rc.board) : "сращивать");
      kv("Уклон / угол резов к кромке", `${fmt(rc.r.angle, 1)}° / ${fmt(rc.r.plumbAngleToEdge, 1)}°`);
      kv("Опорный запил: глубина поперёк / остаток", `${mm(rc.r.d)} / ${mm(rc.r.rest)}`);
      kv("Отвесный рез / площадка / по кромке", `${f0(rc.r.plumb)} / ${f0(rc.r.seat)} / ${mm(rc.r.along)}`);
      if (rc.ridge.type === "beam") kv("Гнездо в коньке: упор / площадка", `${mm(rc.ridge.lowerFace)} / ${mm(rc.ridge.seat)}`);
      if (rc.ridge.type === "prop") kv("Гнездо под конёк: отвес / площадка; рез у оси", `${mm(rc.ridge.upperFace)} / ${mm(rc.ridge.seat)}; ${mm(rc.ridge.lowerFace)}`);
      y += 4;
    }
    note("Все запилы размечайте по кондуктору: вкладка «Стропила» → «Кондуктор 1:1 для печати».");

    newPage();
    h1("Детали и балки");
    h2("Стропильная система");
    row(["Деталь", "Шт.", "Длина, мм", "Доска / сечение"], { head: true });
    mc.parts.forEach((q) => row([q.name, String(q.n), f0(q.len), `${q.board ? fmt(q.board / 1000, 1) + " м · " : q.len > 6000 ? "сращивать · " : ""}${q.sec}`, q.note]));
    y += 2; kv("Лес всего (+10 % запас)", `${fmt(mc.total, 2)} м³`); y += 4;
    need(90); h2(`Балки перекрытия · ${p.attic === "cold" ? "холодный чердак" : "мансарда"}`);
    await img(planSvg(p, M, { layer: "beams", beams: mc.beams }));
    row(["Деталь", "Шт.", "Длина, мм", "Сечение"], { head: true });
    mc.beams.list.forEach((q) => row([q.name, String(q.n), f0(q.len), q.sec || "нужна опора", `шаг ${f0(q.step)} мм${q.half ? `; с опорой посередине ${q.half}` : ""}`]));

    newPage();
    h1("Материалы");
    note("Количество посчитано по размерам крыши с типовым запасом. Сверьте нормы расхода с инструкцией производителя.");
    y += 3;
    for (const grp of e.groups) {
      h2(grp.group);
      grp.items.forEach((it) => row([it.name, Number.isInteger(it.qty) ? f0(it.qty) : fmt(it.qty, 2), "", it.unit, it.note]));
      y += 3;
    }
    pages.forEach((c, i) => { g = c.getContext("2d"); text(`Крыша без переделок · проект «${p.name}» · лист ${i + 1} из ${pages.length}`, PW / 2, PH - 7, 2.6, { c: "#999", a: "center" }); });
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    pages.forEach((c, i) => { if (i) doc.addPage(); doc.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, PW, PH, undefined, "FAST"); });
    const fname = `proekt_${(p.name || "krysha").replace(/[^\wа-яё]+/gi, "_")}.pdf`;
    if (CFG.API_URL && tg) {
      try {
        toast("Отправляю PDF в чат…");
        const res = await api("sendDoc", { filename: fname, caption: `Проект крыши: ${p.name}. План, стропила, детали, балки, материалы.`, data: doc.output("datauristring").split(",")[1] });
        if (res.ok) { toast("Проект в чате с ботом"); haptic("medium"); return; }
      } catch (_) { /* скачаем файлом */ }
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
      ${S.projects.map((p) => `<div class="cl-item" data-id="${p.id}"><div class="t">${p.name || "Без названия"}<small>${fmt(p.width / 1000, 1)} × ${fmt(p.length / 1000, 1)} м · ${formName(p)}${wingOf(p) ? " с пристройкой" : ""}</small></div>${p.id === S.cur ? "✓" : ""}</div>`).join("")}
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
      if (r.paid) { await checkAccess(); toast(S.until ? "Код принят, доступ до " + untilStr() : "Код принят, доступ открыт"); render(); }
      else toast(r.error || "Код не подошёл");
    } catch (_) { toast("Не удалось проверить код"); }
  }
  async function sendRafter() {
    const { p, r, sp, ridge, gab, board, sl, M } = rafterCalc();
    const text = `Стропила · ${p.name}${M.slopes.length > 1 ? ` · ${sl.label.toLowerCase()}` : ""}\nЗаложение ${fmt(sl.run)} мм, уклон ${fmt(r.angle, 1)}°, свес ${fmt(p.over)} мм\n` +
      `Высота конька: ${fmt(r.rise)} мм\nДлина до конька: ${fmt(r.lenRidge)} мм\nГабарит доски с резами: ${fmt(gab)} мм\n` +
      `Доска: ${board ? fmt(board / 1000, 1) + " м" : "сращивать"}\nСтропил такого вида: ${sl.n} шт., шаг ${fmt(sp.step)} мм` +
      (S.paid ? `\nЗапил: ${fmt(r.d)} мм поперёк доски, остаток ${fmt(r.rest)} мм; отвес ${fmt(r.plumb)}, площадка ${fmt(r.seat)}, по кромке ${fmt(r.along)} мм; рез ${fmt(r.plumbAngleToEdge, 1)}° к кромке` +
        (ridge.type === "beam" ? `\nСтропила опираются на конёк: упор ${fmt(ridge.lowerFace)} мм, площадка ${fmt(ridge.seat)} мм`
          : ridge.type === "prop" ? `\nСтропила подпирают конёк ${fmt(ridge.ridgeT)} мм: гнездо ${fmt(ridge.upperFace)} × ${fmt(ridge.seat)} мм, рез у оси ${fmt(ridge.lowerFace)} мм`
          : ridge.ridgeT > 0 ? `\nВ стык коньковой доске ${fmt(ridge.ridgeT)} мм: рез по отвесу в ${fmt(ridge.gap)} мм от оси` : "\nКонёк: пара встык по отвесу на оси") : "");
    if (CFG.API_URL && tg) {
      try { const res = await api("sendText", { text }); if (res.ok) return toast("Отправлено в чат"); } catch (_) {}
    }
    try { await navigator.clipboard.writeText(text); toast("Скопировано"); } catch (_) { toast("Не удалось отправить"); }
  }

  async function sendMap() {
    const p = P(), m = mapCalc(p);
    const text = `Карта стропил · ${p.name}\n${formName(p)}${m.M.wing ? " с пристройкой" : ""}, ${fmt(m.W)}×${fmt(m.L)} мм, уклон ${m.M.slopes.map((s) => fmt(s.angle, 1) + "°").join(" / ")}, шаг ${fmt(m.sp.step)} мм\n\n` +
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
    if (a === "projPdf") projectPdf();
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
      if (p.notchV !== 2) {                 // раньше d был высотой отвесного реза, теперь глубина поперёк доски
        if (p.d !== "" && p.d != null) p.d = Math.round(p.d * Math.cos(rad(angleOf(p))));
        if (!p.ridge || p.ridge === "butt") { p.ridge = "board"; p.ridgeT = 0; }
        p.notchV = 2;
        save();
      }
    });
    S.cur = (await store.get("current")) || S.projects[0].id;
    if (!S.projects.find((p) => p.id === S.cur)) S.cur = S.projects[0].id;
    await loadProg();
    render();
    await checkAccess();
    render();
  })();
})();
