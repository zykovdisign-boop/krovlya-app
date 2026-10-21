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
    name: "Мой дом", width: 8000, length: 10000, form: "gable", roof: "light", box: "gas", attic: "mansard",
    angle: 35, over: 500, step: 600, h: 200, b: 50, d: "", plate: 150, snow: 180, spanR: "", beamSpan: "",
  };
  const S = { projects: [], cur: null, prog: {}, paid: false, tab: "rafter", openList: null };
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
    const v = $("#view");
    v.innerHTML = `<h2>Проект</h2>
      <div class="card"><div class="grid">
        ${field("name", "Название", { full: true, text: true })}
        ${field("width", "Ширина дома, мм (поперёк конька)")}
        ${field("length", "Длина дома, мм (вдоль конька)")}
        ${field("form", "Форма крыши", { options: [["gable", "Двускатная"], ["hip", "Вальмовая"]] })}
        ${field("roof", "Кровля", { options: [["light", "Лёгкая: металл, мягкая, фальц"], ["heavy", "Тяжёлая: ЦПЧ, керамика"]] })}
        ${field("box", "Коробка", { options: [["gas", "Газобетон / пеноблок"], ["brick", "Кирпич"], ["timber", "Брус / бревно"], ["frame", "Каркас"]] })}
        ${field("attic", "Под крышей", { options: [["mansard", "Мансарда"], ["cold", "Холодный чердак"]] })}
      </div></div>
      <div class="card" id="advice"></div>`;
    bindFields(v, advice);
    advice();
  }
  function advice() {
    const p = P();
    const out = [];
    if (p.roof === "heavy" && (p.box === "timber" || p.box === "frame"))
      out.push(`<div class="warn">Тяжёлая черепица на ${p.box === "timber" ? "брусовом" : "каркасном"} доме: в книге (глава 2.8) объяснено, почему так делать не стоит. Выберите лёгкую кровлю или закажите расчёт.</div>`);
    if (p.box === "timber") out.push(`<p class="note">Брус садится: стропила крепите на скользящих опорах, стойки ставьте на компенсаторы усадки.</p>`);
    if (p.box === "gas") out.push(`<p class="note">Газобетон: нужен сплошной армопояс со шпильками и стропильная система без распора или с затяжкой внизу.</p>`);
    if (num(p.width, 0) / 2 > 6000) out.push(`<div class="warn">Пролёт больше 12 м без промежуточных опор: нужен расчёт конструктора.</div>`);
    $("#advice").innerHTML = `<h3>Что учесть</h3>${out.join("") || `<p class="note">Заполните данные: все калькуляторы возьмут их отсюда.</p>`}`;
  }

  /* ---------- вкладка: стропила ---------- */
  // буквы на схеме: какое поле проекта правит каждая
  const LETTERS = {
    A: { k: "h", t: "A — высота доски", u: "мм" },
    Q: { k: "angle", t: "Q — уклон", u: "°" },
    C: { k: "width", t: "C — заложение: от наружной грани мауэрлата до оси конька", u: "мм", get: (p) => num(p.width, 8000) / 2, set: (v) => v * 2 },
    D: { k: "over", t: "D — свес по горизонтали", u: "мм" },
    d: { k: "d", t: "d — глубина запила (пусто — четверть доски)", u: "мм", allowEmpty: true },
    M: { k: "plate", t: "M — ширина мауэрлата", u: "мм" },
  };
  function viewRafter() {
    const v = $("#view");
    v.innerHTML = `<h2>Стропила</h2>
      <div class="card bp-card"><div id="bp"></div><p class="bp-hint">Нажмите на букву, чтобы ввести размер</p></div>
      <div id="out"></div>
      <div class="card"><h3>Дом и шаг</h3><div class="grid">
        ${field("length", "Длина дома, мм")}
        ${field("step", "Шаг стропил, мм")}
      </div></div>`;
    bindFields(v, rafterOut);
    v.addEventListener("click", (e) => {
      const t = e.target.closest("[data-letter]");
      if (t) editLetter(t.dataset.letter);
    });
    rafterOut();
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
      else if (raw !== "" && !isNaN(raw) && Number(raw) > 0) p[def.k] = def.set ? def.set(Number(raw)) : Number(raw);
      save(); bg.remove(); rafterOut(); haptic();
    };
    bg.addEventListener("click", (e) => {
      if (e.target === bg) bg.remove();
      if (e.target.closest("[data-ok]")) done();
    });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") done(); });
  }
  function rafterCalc() {
    const p = P();
    const run = num(p.width, 8000) / 2;
    const r = C.rafter({ run, angle: num(p.angle, 35), over: num(p.over, 0), h: num(p.h, 200),
      d: p.d === "" ? null : num(p.d, null), plate: num(p.plate, 150) });
    const sp = C.spacing({ length: num(p.length, 10000), step: num(p.step, 600) });
    return { p, r, sp, run };
  }
  function rafterOut() {
    const { p, r, sp, run } = rafterCalc();
    $("#bp").innerHTML = blueprintSvg(r, run);
    const sl = C.slope({ angle: r.angle });
    let html = `<div class="card"><h3>Длина стропила</h3><div class="res">
        <span class="k">Уклон</span><span class="v">${fmt(r.angle, 1)}° · ${fmt(sl.percent)} %</span>
        <span class="k">H — высота конька над мауэрлатом</span><span class="v">${mm(r.rise)}</span>
        <hr><span class="k">По нижней кромке со свесом</span><span class="v big">${mm(r.lenBottom)}</span>
        <span class="k">Габарит доски с резами</span><span class="v">${mm(r.boardLen)}</span>
        <span class="k">Брать доску</span><span class="v">${r.board ? m(r.board) : "сращивать"}</span>
        <hr><span class="k">Стропильных пар</span><span class="v">${sp.pairs} (${sp.rafters} шт.)</span>
        <span class="k">Фактический шаг</span><span class="v">${mm(sp.step)}</span>
      </div>
      <button class="btn ghost" data-act="sendRafter" type="button">Отправить расчёт в чат</button></div>`;

    const rn = S.paid ? r : C.rafter({ run: 4000, angle: 35, over: 500, h: 200 });   // под замком — пример из книги
    const sinA = Math.sin((rn.angle * Math.PI) / 180);
    const layout = `<h3>Разметка доски</h3>${boardSvg(rn)}
      <div class="res">
        <span class="k">От торца свеса до запила (по нижней кромке)</span><span class="v">${mm(rn.lenOver)}</span>
        <span class="k">От запила до конькового реза</span><span class="v">${mm(rn.lenRidge)}</span>
        <span class="k">Угол торцевых резов к кромке</span><span class="v">${fmt(rn.plumbAngleToEdge, 1)}°</span>
        <span class="k">Запил: глубина / по кромке</span><span class="v">${mm(rn.d)} / ${mm(rn.d / sinA)}</span>
        <span class="k">Площадка на мауэрлате</span><span class="v">${mm(rn.seat)}</span>
      </div>
      ${rn.warnings.map((w) => `<div class="warn">${w}</div>`).join("")}
      <button class="btn" data-act="jig" type="button">Кондуктор 1:1 для печати (PDF)</button>
      <p class="note">Шаблон печатается на листах A4 в натуральную величину. На последнем листе контрольный квадрат 50 мм: проверьте его линейкой, прежде чем вырезать.</p>`;
    html += `<div class="card">${S.paid ? layout : `<div class="locked-body">${layout}</div>${lockHtml("Разметка и кондуктор", "Развёртка доски со всеми размерами, запил в увеличении и шаблон для печати 1:1.")}`}</div>`;

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
  const WH = "#ffffff", WD = "rgba(255,255,255,.55)", INKC = "#1d1d1b";
  const f0 = (v) => Math.round(v).toLocaleString("ru-RU");
  function ln(x1, y1, x2, y2, w = 1.4, c = WH, dash = "") {
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${c}" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  }
  function tick(x, y, c = WH, len = 5) {             // засечка размерной линии под 45°
    return ln(x - len * 0.7, y + len * 0.7, x + len * 0.7, y - len * 0.7, 1.2, c);
  }
  function dimLine(x1, y1, x2, y2, c = WH) {
    return ln(x1, y1, x2, y2, 1, c) + tick(x1, y1, c) + tick(x2, y2, c);
  }
  function txt(x, y, s, anchor = "middle", size = 11.5, fill = INKC, w = 600) {
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${size}" font-weight="${w}" text-anchor="${anchor}" fill="${fill}">${s}</text>`;
  }
  function tag(x, y, L, val, anchor = "middle", info = false) {   // буква-кнопка со значением
    const label = `${L} ${val}`;
    const wPx = 12 + label.length * 7;
    const x0 = anchor === "middle" ? x - wPx / 2 : anchor === "end" ? x - wPx : x;
    return `<g class="bp-tag${info ? " info" : ""}" ${info ? "" : `data-letter="${L}"`}>
      <rect x="${x0.toFixed(1)}" y="${(y - 13).toFixed(1)}" width="${wPx.toFixed(1)}" height="19" rx="9.5"/>
      <text x="${(x0 + wPx / 2).toFixed(1)}" y="${(y + 1).toFixed(1)}" text-anchor="middle">${label}</text></g>`;
  }

  /* --- схема-синька: узел стропила с буквами-размерами (схематично, не в масштабе) --- */
  function blueprintSvg(r, run) {
    const A = (25 * Math.PI) / 180, t = Math.tan(A), sn = Math.sin(A), cs = Math.cos(A);
    const P = [80, 168], th = 24;                        // угол мауэрлата, высота доски на схеме
    const yb = (x) => P[1] - (x - P[0]) * t;            // нижняя кромка стропила
    const xe = 24, xr = 300;                             // торец свеса, ось конька
    const dS = 13;                                       // глубина запила на схеме
    const V = [P[0], P[1] + dS], Hn = [P[0] + dS / t, P[1]];
    // нижняя кромка проходит через V; торцы — по отвесу
    const yb2 = (x) => V[1] - (x - V[0]) * t;
    const eb = [xe, yb2(xe)], rb = [xr, yb2(xr)];
    const etop = [xe, yb2(xe) - th / cs], rtop = [xr, yb2(xr) - th / cs];
    const rafter = `M${eb[0]},${eb[1].toFixed(1)} L${V[0]},${V[1]} L${P[0]},${P[1]} L${Hn[0].toFixed(1)},${Hn[1]} L${rb[0]},${rb[1].toFixed(1)} L${rtop[0]},${rtop[1].toFixed(1)} L${etop[0]},${etop[1].toFixed(1)} Z`;
    // мауэрлат со штриховкой
    const pw = 40, ph = 44;
    let hatch = "";
    for (let i = -ph; i < pw; i += 9) {
      const x1 = Math.max(0, i), y1 = Math.max(0, -i) ;
      const x2 = Math.min(pw, i + ph), y2 = Math.min(ph, pw - i);
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
      ${tag(330, (P[1] + rb[1]) / 2 + 4, "H", f0(r.rise), "end", true)}
      ${tag(mt[0] - 6, mt[1] - 10, "A", f0(r.h))}
      ${tag(P[0] + arcR + 44, P[1] + 18, "Q", `${fmt(r.angle, 1)}°`)}
      ${tag(P[0] - 6, P[1] + 40, "d", f0(r.d), "end")}${ln(P[0] - 8, P[1] + 30, P[0] - 1, P[1] + dS / 2 + 1, 0.8, WH)}
      ${tag(P[0] + pw / 2, P[1] + ph + 22, "M", f0(r.plate))}
    </svg>`;
  }

  /* --- развёртка доски для разметки + выносной круг запила --- */
  function boardSvg(r) {
    const a = (r.angle * Math.PI) / 180, s = Math.sin(a), c = Math.cos(a), t = Math.tan(a);
    const shift = r.h * t;                               // сдвиг верхней кромки на торцах, мм
    const total = r.lenOver + r.lenRidge + shift;
    const X0 = 20, X1 = 340, k = (X1 - X0) / total;     // масштаб по длине (по высоте схематично)
    const yB = 156, th = 40;
    const off = shift * k;
    const xE = X0, xV = X0 + r.lenOver * k, xR = xV + r.lenRidge * k;
    const nS = Math.max(7, (r.d / s) * k);
    const board = `M${xE},${yB} L${xV.toFixed(1)},${yB} L${(xV + nS * 0.3).toFixed(1)},${yB - 8} L${(xV + nS).toFixed(1)},${yB} L${xR.toFixed(1)},${yB} L${(xR + off).toFixed(1)},${yB - th} L${(xE + off).toFixed(1)},${yB - th} Z`;
    // выносной круг: запил в реальных пропорциях
    const cx = 252, cy = 240, R = 48;
    const span = r.d / s;
    const kk = (R * 1.2) / Math.max(span, 1);
    const nW = span * kk, pX = r.d * s * kk, pY = r.d * c * kk;
    const bx = cx - nW / 2, by = cy + 8;
    const D = INKC;
    const detail = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#fff" stroke="${D}" stroke-width="1.2"/>
      <polyline points="${cx - R + 5},${by} ${bx.toFixed(1)},${by} ${(bx + pX).toFixed(1)},${(by - pY).toFixed(1)} ${(bx + nW).toFixed(1)},${by} ${cx + R - 5},${by}" fill="none" stroke="${D}" stroke-width="1.8"/>
      ${dimLine(bx, by + 12, bx + nW, by + 12, D)}${ln(bx, by, bx, by + 15, 0.6, D)}${ln(bx + nW, by, bx + nW, by + 15, 0.6, D)}
      ${ln(bx - 5 * c, by - 5 * s, bx + pX - 5 * c, by - pY - 5 * s, 0.9, D)}${tick(bx - 5 * c, by - 5 * s, D, 4)}${tick(bx + pX - 5 * c, by - pY - 5 * s, D, 4)}`;
    const fa = fmt(r.plumbAngleToEdge, 0);
    return `<svg class="draw board" viewBox="0 0 360 296" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,Segoe UI,Roboto,sans-serif">
      <path d="${board}" fill="#f1e2c8" stroke="${D}" stroke-width="1.6" stroke-linejoin="round"/>
      ${ln(xE, yB - th - 2, xE, 34, 0.6, D)}${ln(xE + off, yB - th, xE + off, 34, 0.6, D)}${ln(xR + off, yB - th, xR + off, 34, 0.6, D)}
      ${dimLine(xE, 40, xE + off, 40, D)}${dimLine(xE + off, 40, xR + off, 40, D)}
      ${txt(xE + off / 2 + 2, 30, f0(shift), "start", 12)}${txt((xE + off + xR + off) / 2, 30, `${f0(r.lenBottom)} по кромке`, "middle", 13.5, INKC, 700)}
      ${ln(xV, yB - 10, xV, 64, 0.6, D)}
      ${dimLine(xE + off, 70, xV, 70, D)}${dimLine(xV, 70, xR + off, 70, D)}
      ${txt((xE + off + xV) / 2, 62, f0(r.lenOver - shift), "middle", 12)}${txt((xV + xR + off) / 2, 62, f0(r.lenRidge + shift), "middle", 13.5)}
      ${ln(xE, yB, xE, 182, 0.6, D)}${ln(xV, yB, xV, 182, 0.6, D)}${dimLine(xE, 178, xV, 178, D)}
      ${txt((xE + xV) / 2, 196, f0(r.lenOver), "middle", 13)}
      <path d="M${(xR + off - 20).toFixed(1)},${yB - th} A20,20 0 0 1 ${(xR + off - 20 * Math.sin(a) * 0.9).toFixed(1)},${(yB - th + 20 * Math.cos(a) * 0.9).toFixed(1)}" fill="none" stroke="${D}" stroke-width="0.9"/>
      ${txt(xR - 14, yB - th + 22, `${fa}°`, "end", 13)}
      <path d="M${(xE + off + 20).toFixed(1)},${yB - th} A20,20 0 0 0 ${(xE + off + 20 * Math.sin(a) * 0.9 - 6).toFixed(1)},${(yB - th + 18).toFixed(1)}" fill="none" stroke="${D}" stroke-width="0.9"/>
      <circle cx="${(xV + nS / 2).toFixed(1)}" cy="${yB - 3}" r="11" fill="none" stroke="${D}" stroke-width="1"/>
      ${ln(xV + nS / 2 + 7, yB + 6, cx - R * 0.72, cy - R * 0.7, 0.8, D)}
      ${detail}
      ${txt(cx - R + 10, cy - R / 2 + 4, `d ${f0(r.d)}`, "start", 12.5)}${txt(cx, by + 31, f0(span), "middle", 12.5)}
      ${txt(X0, 240, "Торцы режутся по отвесу:", "start", 11.5, "#6f6c66", 400)}
      ${txt(X0, 255, `угол ${fa}° к кромке доски.`, "start", 11.5, "#6f6c66", 400)}
      ${txt(X0, 276, "Размеры по нижней кромке —", "start", 11.5, "#6f6c66", 400)}
      ${txt(X0, 291, "той, где запил.", "start", 11.5, "#6f6c66", 400)}
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

  /* ---------- вкладка: сечения ---------- */
  function viewSection() {
    const p = P();
    const v = $("#view");
    const body = `<div class="card"><h3>Стропила</h3><div class="grid">
        ${field("spanR", "Пролёт стропила по горизонтали, мм", { ph: String(num(p.width, 8000) / 2) })}
        ${field("step", "Шаг, мм")}
        ${field("roof", "Кровля", { options: [["light", "Лёгкая (50 кг/м²)"], ["heavy", "Черепица (110 кг/м²)"]] })}
        ${field("snow", "Снег", { options: [["100", "Мало (100 кг/м²)"], ["180", "Средне (180 кг/м²)"], ["250", "Много (250 кг/м²)"], ["320", "Очень много (320 кг/м²)"]] })}
      </div><div id="outR"></div></div>
      <div class="card"><h3>Балки перекрытия</h3><div class="grid">
        ${field("beamSpan", "Пролёт балки между опорами, мм", { ph: String(num(p.width, 8000) / 2) })}
        ${field("attic", "Назначение", { options: [["mansard", "Жилая мансарда"], ["cold", "Холодный чердак"]] })}
      </div><div id="outB"></div></div>
      <p class="note" style="margin:0 4px 12px">Сосна 2 сорта, прогиб стропил до 1/200, балок до 1/250 пролёта. Пролёт стропила — расстояние по горизонтали между опорами. Для пролётов больше 6 м и необычных нагрузок нужен расчёт конструктора.</p>`;
    v.innerHTML = `<h2>Сечения</h2>` + (S.paid ? body : `<div class="card"><div class="locked-body">${body}</div>${lockHtml("Подбор сечений", "Сечение стропил и балок по пролёту, шагу, кровле и снегу — по методике книги.")}</div>`);
    if (S.paid) { bindFields(v, sectionOut); sectionOut(); }
  }
  function sectionOut() {
    const p = P();
    const span = num(p.spanR, num(p.width, 8000) / 2);
    const rs = C.rafterSection({ span, step: num(p.step, 600), roof: p.roof === "heavy" ? 110 : 50, snow: num(p.snow, 180), angle: num(p.angle, 35) });
    let h = `<div class="res" style="margin-top:12px"><span class="k">Сечение доски</span><span class="v big">${rs.section ? rs.section.label : "нужен расчёт"}</span></div>`;
    if (rs.withStrut && (!rs.section || rs.section.b * rs.section.h > rs.withStrut.b * rs.withStrut.h))
      h += `<p class="note">С подкосом или ригелем посередине пролёта хватит доски <b>${rs.withStrut.label}</b>.</p>`;
    if (num(p.step, 600) > 900) h += `<div class="warn">Шаг больше 900 мм: обрешётку 25 мм нужно заменить на более толстую.</div>`;
    $("#outR").innerHTML = h;
    const bs = C.beamSection({ span: num(p.beamSpan, num(p.width, 8000) / 2), step: num(p.step, 600), load: p.attic === "cold" ? 200 : 400 });
    $("#outB").innerHTML = `<div class="res" style="margin-top:12px"><span class="k">Сечение балки</span><span class="v big">${bs.section ? bs.section.label : "разбейте пролёт"}</span></div>
      ${!bs.section ? `<div class="warn">Больше 6 м из цельной доски не подобрать: поставьте прогон на внутреннюю стену или колонну.</div>` : ""}`;
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

  /* ---------- вкладка: ещё ---------- */
  function viewMore() {
    const v = $("#view");
    v.innerHTML = `<h2>Ещё</h2>
      <div class="card"><h3>Доступ</h3>
        <p>${S.paid ? "У вас полный доступ навсегда. Спасибо!" : `Бесплатно: уклон, длина стропил, шаг и первый чек-лист. Полный доступ открывает запил и кондуктор для печати, вальмы, подбор сечений и все ${(window.CHECKLISTS || []).length} чек-листов.`}</p>
        ${S.paid ? "" : `<button class="btn" data-act="buy" type="button">Полный доступ за ${CFG.PRICE_STARS || 350} ⭐</button>`}
      </div>
      ${S.paid ? "" : `<div class="card"><h3>Купили книгу?</h3><p class="note" style="margin-top:0">Введите код из письма с книгой.</p>
        <input id="code" type="text" placeholder="Например, ROOF-7K2P" autocapitalize="characters">
        <button class="btn ghost" data-act="redeem" type="button">Активировать код</button></div>`}
      <div class="card"><h3>Книга «Крыша без переделок»</h3>
        <p class="note" style="margin-top:0">Всё, что считает приложение, в книге объяснено с чертежами: почему такой запил, где сращивать, что ставится до покрытия.</p>
        ${CFG.BOOK_URL ? `<button class="btn ghost" data-act="book" type="button">Открыть книгу</button>` : ""}
        ${CFG.AUTHOR_CONTACT ? `<button class="btn ghost" data-act="author" type="button">Написать автору</button>` : ""}
      </div>
      ${!CFG.API_URL ? `<div class="card"><h3>Демо-режим</h3><p class="note" style="margin-top:0">Сервер не подключён. Переключите доступ для проверки.</p>
        <button class="btn ghost" data-act="demo" type="button">${S.paid ? "Выключить" : "Включить"} полный доступ</button></div>` : ""}`;
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
    const { p, r, sp } = rafterCalc();
    const text = `Стропила · ${p.name}\nШирина ${fmt(p.width)} мм, уклон ${fmt(r.angle, 1)}°, свес ${fmt(p.over)} мм\n` +
      `Высота конька: ${fmt(r.rise)} мм\nДлина до конька: ${fmt(r.lenRidge)} мм\nПо кромке со свесом: ${fmt(r.lenBottom)} мм\n` +
      `Доска: ${r.board ? fmt(r.board / 1000, 1) + " м" : "сращивать"}\nПар: ${sp.pairs} (${sp.rafters} шт.), шаг ${fmt(sp.step)} мм` +
      (S.paid ? `\nЗапил: ${fmt(r.d)} мм, площадка ${fmt(r.seat)} мм, рез ${fmt(r.plumbAngleToEdge, 1)}° к кромке` : "");
    if (CFG.API_URL && tg) {
      try { const res = await api("sendText", { text }); if (res.ok) return toast("Отправлено в чат"); } catch (_) {}
    }
    try { await navigator.clipboard.writeText(text); toast("Скопировано"); } catch (_) { toast("Не удалось отправить"); }
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "buy") buy();
    if (a === "redeem") redeem();
    if (a === "jig") makeJig();
    if (a === "sendRafter") sendRafter();
    if (a === "book") tg ? tg.openLink(CFG.BOOK_URL) : window.open(CFG.BOOK_URL);
    if (a === "author") tg ? tg.openTelegramLink("https://t.me/" + CFG.AUTHOR_CONTACT.replace("@", "")) : 0;
    if (a === "demo") { try { localStorage.setItem("demoPaid", S.paid ? "0" : "1"); } catch (_) {} checkAccess().then(render); }
  });

  /* ---------- навигация ---------- */
  const VIEWS = { project: viewProject, rafter: viewRafter, section: viewSection, check: viewCheck, more: viewMore };
  function render() {
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
    S.cur = (await store.get("current")) || S.projects[0].id;
    if (!S.projects.find((p) => p.id === S.cur)) S.cur = S.projects[0].id;
    await loadProg();
    render();
    await checkAccess();
    render();
  })();
})();
