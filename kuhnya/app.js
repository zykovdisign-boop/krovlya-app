/* Мини-приложение «Кухня PRO»: пошаговая сборка кухни по чек-листам */
(function () {
  const CFG = window.APP_CONFIG || {};
  const STAGES = window.STAGES || [];
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null;
  const $ = (s, el = document) => el.querySelector(s);
  const plural = (n, a, b, c) => { const m = n % 100, k = n % 10; return m > 10 && m < 20 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 9);
  if (tg) { tg.ready(); tg.expand(); }

  /* ---------- хранилище ---------- */
  const cloud = tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") ? tg.CloudStorage : null;
  const store = {
    get: (k) => new Promise((res) => { if (cloud) cloud.getItem(k, (e, v) => res(e ? null : v || null)); else { try { res(localStorage.getItem(k)); } catch (_) { res(null); } } }),
    set: (k, v) => new Promise((res) => { if (cloud) cloud.setItem(k, v, () => res()); else { try { localStorage.setItem(k, v); } catch (_) {} res(); } }),
  };

  const newObj = (name) => ({ id: "o" + uid(), name: name || "Кухня", addr: "", note: "", done: {} });
  const BOOK = window.BOOK || [];
  const S = { objs: [], cur: null, tab: "book", step: null, bookView: "chapters", chapter: null, part: null, partFrom: null, read: [], paid: false, until: null, plans: null };
  const O = () => S.objs.find((o) => o.id === S.cur) || S.objs[0];
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { store.set("kuhnya_objs", JSON.stringify(S.objs)); store.set("kuhnya_cur", S.cur || ""); store.set("kuhnya_read", JSON.stringify(S.read)); }, 300); };

  function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("show"), 2600); }
  const haptic = () => tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred("light");
  const ask = (text) => new Promise((res) => (tg && tg.showConfirm ? tg.showConfirm(text, res) : res(window.confirm(text))));

  /* ---------- прогресс ---------- */
  const stageOf = (id) => STAGES.find((s) => s.id === id);
  const doneOf = (st, o = O()) => (o.done[st.id] || []).length;
  const stepDone = (st, o = O()) => doneOf(st, o) === st.checks.length;
  const stageProg = (sg, o = O()) => ({ all: sg.steps.reduce((a, st) => a + st.checks.length, 0), d: sg.steps.reduce((a, st) => a + doneOf(st, o), 0), steps: sg.steps.filter((st) => stepDone(st, o)).length });
  const isFree = (sg, i) => sg.id === "build" && i < (window.FREE_STEPS || 0);
  const canOpen = (sg, i) => S.paid || isFree(sg, i);

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
  function plansHtml() {
    const plans = S.plans || CFG.PLANS;
    if (!plans) return "";
    return Object.entries(plans).map(([k, p]) => `<button class="plan${k === "year" ? " best" : ""}" data-plan="${k}" type="button">
      <span class="plan-n">${p.label}<small>${p.days ? p.days + " " + plural(p.days, "день", "дня", "дней") : "без ограничений"}</small></span>
      <span class="plan-p">⭐ ${p.stars}<small>${p.rub} ₽</small></span></button>`).join("");
  }
  function accessHtml() {
    const n = STAGES.reduce((a, s) => a + s.steps.length, 0);
    const free = BOOK.filter((c) => c.free).length;
    return `<h3>Доступ</h3><p class="note" style="margin-top:0">${S.paid ? (S.until ? `Полный доступ до ${untilStr()}.` : "Полный доступ навсегда. Спасибо!") : `Бесплатно: первые ${free} главы книги, первые ${window.FREE_STEPS} шагов сборки, два узла и шесть советов. Полный доступ открывает всю книгу (${BOOK.length} глав), все ${n} ${plural(n, "шаг", "шага", "шагов")} сборки и подключения техники, все узлы и советы.`}</p>
      ${S.paid && !S.until ? "" : `<div class="plans">${plansHtml()}</div><p class="note">Оплата звёздами Telegram. Новый срок добавляется к оставшемуся.</p>`}
      <div class="code-row"><input data-code type="text" placeholder="Код доступа" autocapitalize="characters" aria-label="Код доступа">
        <button class="btn" data-act="code" type="button">Ввести</button></div>`;
  }
  async function buyPrompt(plan) {
    if (!CFG.API_URL || !tg) return toast("Оплата работает в приложении из Telegram");
    try {
      const inv = await api("invoice", { plan });
      if (!inv.ok) return toast(inv.error || "Не удалось создать счёт");
      tg.openInvoice(inv.link, (st) => { if (st === "paid") { toast("Оплата прошла, открываю доступ…"); setTimeout(async () => { await checkAccess(); render(false); }, 1500); } });
    } catch (_) { toast("Не удалось создать счёт"); }
  }

  /* ---------- этап: список шагов ---------- */
  function viewStage(sg) {
    const p = stageProg(sg);
    const next = sg.steps.findIndex((st) => !stepDone(st));
    $("#view").innerHTML = `<h2>${sg.title}</h2>
      <div class="card"><div class="res"><span class="k">${esc(O().name)}</span><span class="v">${p.steps} из ${sg.steps.length} ${plural(sg.steps.length, "шага", "шагов", "шагов")}</span></div>
        <div class="bar"><i style="width:${p.all ? (p.d / p.all) * 100 : 0}%"></i></div>
        ${next >= 0 ? `<button class="btn" data-open="${next}" type="button">${p.d ? "Продолжить" : "Начать"}: ${esc(sg.steps[next].title)}</button>` : `<p class="note">Этап пройден целиком ✓</p>`}</div>
      <div class="card">${sg.steps.map((st, i) => { const d = doneOf(st), ok = canOpen(sg, i), full = d === st.checks.length;
        return `<div class="cl-item" data-open="${i}"><span class="num${full ? " ok" : ""}">${full ? "✓" : i + 1}</span>
          <div class="t">${esc(st.title)}<small>${ok ? `${d} из ${st.checks.length}` : "🔒 полный доступ"}</small>${ok && d && !full ? `<div class="bar"><i style="width:${(d / st.checks.length) * 100}%"></i></div>` : ""}</div><span style="color:var(--hint)">›</span></div>`; }).join("")}</div>
      ${S.paid ? "" : `<p class="note" style="margin:0 4px 16px">Первые ${window.FREE_STEPS} шагов сборки открыты бесплатно, остальные — в полном доступе на вкладке «Объект».</p>`}`;
  }

  /* ---------- шаг ---------- */
  function viewStep(sg, i) {
    const st = sg.steps[i], set = new Set(O().done[st.id] || []);
    const draw = st.draw && (window.DRAWINGS || []).find((d) => d.file === st.draw);
    const ch = BOOK.findIndex((c) => c.steps.includes(st.id));
    $("#view").innerHTML = `<button class="back" type="button" data-back>‹ ${sg.title}</button>
      <p class="sub" style="margin:0 4px 2px">Шаг ${i + 1} из ${sg.steps.length}</p><h2>${esc(st.title)}</h2>
      <div class="card"><p class="step-text">${esc(st.text)}</p>
        ${draw ? `<button class="draw-link" type="button" data-draw="${draw.file}" data-free="1">📐 Узел: ${esc(draw.title)}</button>` : ""}
        ${ch >= 0 ? `<button class="draw-link" type="button" data-chapter="${ch}">📖 Глава ${ch + 1}: ${esc(BOOK[ch].title)}</button>` : ""}</div>
      ${(st.need || []).length ? `<div class="card"><h3>Что понадобится</h3><ul class="bk-list need">${st.need.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${(st.how || []).length ? `<div class="card"><h3>Порядок работы</h3><ol class="how">${st.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>` : ""}
      ${partsOf(st).length ? `<div class="card"><h3>Фурнитура в этом шаге</h3><p class="note" style="margin:-4px 0 8px">Нажмите, чтобы узнать, как она выглядит и как ставится</p><div class="chips">${partsOf(st).map((p) => `<button type="button" class="chip-btn" data-part="${p.id}">🔩 ${esc(p.name)}</button>`).join("")}</div></div>` : ""}
      <div class="card"><h3>Проверьте</h3>${st.checks.map((t, k) => `<label class="chk ${set.has(k) ? "done" : ""}"><input type="checkbox" data-ci="${k}" ${set.has(k) ? "checked" : ""}><span>${esc(t)}</span></label>`).join("")}</div>
      <div class="tip err"><div class="tip-kind">Частая ошибка</div><div class="tip-text">${esc(st.err)}</div></div>
      <div class="step-nav">
        <button class="btn ghost" type="button" data-go="${i - 1}" ${i ? "" : "disabled"}>‹ Назад</button>
        <button class="btn" type="button" data-go="${i + 1}">${i + 1 < sg.steps.length ? "Дальше ›" : "К этапу"}</button>
      </div>`;
  }

  /* ---------- справочник фурнитуры ---------- */
  const PARTS = window.PARTS || [];
  const partsOf = (st) => (st.parts || []).map((id) => PARTS.find((p) => p.id === id)).filter(Boolean);
  // Где фурнитура встречается в шагах — чтобы из справочника вернуться к работе.
  const stepsWithPart = (id) => STAGES.flatMap((sg) => sg.steps.map((st, i) => ({ sg, st, i })).filter((x) => (x.st.parts || []).includes(id)));
  function viewPart(id) {
    const p = PARTS.find((x) => x.id === id);
    if (!p) { S.part = null; return viewBook(); }
    const d = p.draw && (window.DRAWINGS || []).find((x) => x.file === p.draw);
    const used = stepsWithPart(p.id);
    $("#view").innerHTML = `<button class="back" type="button" data-back>‹ ${S.partFrom ? "К шагу" : "Справочник"}</button>
      <h2>${esc(p.name)}</h2><p class="sub" style="margin:-6px 4px 12px">Ещё называют: ${esc(p.aka)}</p>
      <div class="card book"><h3 class="bk-h">Как выглядит</h3><p class="bk-p">${esc(p.look)}</p>
        <h3 class="bk-h">Где стоит</h3><p class="bk-p">${esc(p.where)}</p>
        ${d ? `<button class="draw-link" type="button" data-draw="${d.file}" data-free="1">📐 Схема: ${esc(d.title)}</button>` : ""}</div>
      <div class="card"><h3>Как ставить</h3><ol class="how">${p.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></div>
      <div class="tip err"><div class="tip-kind">Частая ошибка</div><div class="tip-text">${esc(p.err)}</div></div>
      ${used.length ? `<div class="card"><h3>Где встречается</h3>${used.map((u) => `<div class="cl-item" data-gostep="${u.sg.id}:${u.i}"><div class="t">${esc(u.st.title)}<small>${u.sg.title}</small></div><span style="color:var(--hint)">›</span></div>`).join("")}</div>` : ""}`;
  }

  /* ---------- книга: главы, узлы, советы ---------- */
  const FREE_TIPS = 6;
  const chapterOpen = (i) => S.paid || BOOK[i].free;
  function viewBook() {
    if (S.bookView === "chapters" && S.chapter !== null) return viewChapter(S.chapter);
    if (S.bookView === "parts" && S.part !== null) return viewPart(S.part);
    const tips = window.TIPS || [], draws = window.DRAWINGS || [];
    let body = "";
    if (S.bookView === "chapters") {
      const next = BOOK.findIndex((c) => !S.read.includes(c.id));
      body = `<div class="card"><div class="res"><span class="k">Прочитано</span><span class="v">${S.read.length} из ${BOOK.length}</span></div>
          <div class="bar"><i style="width:${(S.read.length / BOOK.length) * 100}%"></i></div>
          <p class="note">Прочитайте книгу целиком до первого выезда. На объекте открывайте главу из шага, к которому она относится.</p>
          ${next >= 0 ? `<button class="btn" data-chapter="${next}" type="button">${S.read.length ? "Читать дальше" : "Начать"}: ${esc(BOOK[next].title)}</button>` : ""}</div>
        <div class="card">${BOOK.map((c, i) => {
          const rd = S.read.includes(c.id), n = c.steps.length;
          const sub = !chapterOpen(i) ? "🔒 полный доступ" : c.free && !S.paid ? "бесплатно" : n ? `${n} ${plural(n, "шаг", "шага", "шагов")} в приложении` : "подготовка";
          return `<div class="cl-item" data-chapter="${i}"><span class="num${rd ? " ok" : ""}">${rd ? "✓" : i + 1}</span><div class="t">${esc(c.title)}<small>${sub}</small></div><span style="color:var(--hint)">›</span></div>`; }).join("")}</div>`;
    } else if (S.bookView === "parts") {
      body = `<p class="sub" style="margin:0 4px 12px">Чем собирается кухня и как это ставить. Для тех, кто держит конфирмат в руках первый раз</p>
        ${[["mebel", "Мебельный крепёж и фурнитура", "🔩"], ["tech", "Сантехника и техника", "🚰"]].map(([g, title, ic]) => `<h3 style="margin:14px 4px 8px">${title}</h3><div class="card">${PARTS.filter((p) => (p.g || "mebel") === g).map((p) => `<div class="cl-item" data-part="${p.id}"><span class="num">${ic}</span><div class="t">${esc(p.name)}<small>${esc(p.aka)}</small></div><span style="color:var(--hint)">›</span></div>`).join("")}</div>`).join("")}`;
    } else if (S.bookView === "nodes") {
      body = `<p class="sub" style="margin:0 4px 12px">Схемы с размерами и отступами. Нажмите, чтобы открыть</p>
        <div class="card">${draws.map((d) => `<div class="cl-item" data-draw="${d.file}" data-free="${d.free ? 1 : 0}"><div class="t">${d.title}<small>${d.free || S.paid ? d.sub : "🔒 полный доступ"}</small></div><span style="color:var(--hint)">›</span></div>`).join("")}</div>`;
    } else {
      body = tips.map((t, i) => { const lk = !S.paid && i >= FREE_TIPS; return `<div class="tip ${t.kind}${lk ? " locked" : ""}"><div class="tip-kind">${t.kind === "hack" ? "Лайфхак" : "Ошибка"} · ${t.title}</div>
        <div class="tip-text">${lk ? "Откройте полный доступ, чтобы прочитать." : t.text}</div><div class="tip-src">${t.topic}</div></div>`; }).join("")
        + (S.paid ? "" : `<button class="btn" data-tab="obj" type="button">Открыть все ${tips.length} советов</button>`);
    }
    $("#view").innerHTML = `<h2>Кухня без переделок</h2>${seg("data-bv", [["chapters", "Главы"], ["parts", "Крепёж"], ["nodes", "Узлы"], ["tips", "Советы"]], S.bookView)}<div style="margin-top:12px">${body}</div>`;
  }
  const seg = (attr, opts, cur) => `<div class="seg">${opts.map(([v, t]) => `<button type="button" ${attr}="${v}" class="${v === cur ? "on" : ""}">${t}</button>`).join("")}</div>`;

  // Шаги приложения, о которых рассказывает глава: «build:3» → этап и номер.
  const stepRef = (id) => { for (const sg of STAGES) { const i = sg.steps.findIndex((st) => st.id === id); if (i >= 0) return { sg, i, st: sg.steps[i] }; } return null; };
  function viewChapter(i) {
    const c = BOOK[i];
    if (!S.read.includes(c.id)) { S.read.push(c.id); save(); }
    const block = (b) => {
      if (b.h) return `<h3 class="bk-h">${esc(b.h)}</h3>`;
      if (b.p) return `<p class="bk-p">${esc(b.p)}</p>`;
      if (b.warn) return `<div class="warn">${esc(b.warn)}</div>`;
      if (b.list) return `<ul class="bk-list">${b.list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`;
      if (b.draw) { const d = (window.DRAWINGS || []).find((x) => x.file === b.draw); return d ? `<button class="draw-link" type="button" data-draw="${d.file}" data-free="1">📐 Узел: ${esc(d.title)}</button>` : ""; }
      return "";
    };
    const refs = c.steps.map(stepRef).filter(Boolean);
    $("#view").innerHTML = `<button class="back" type="button" data-back>‹ Все главы</button>
      <p class="sub" style="margin:0 4px 2px">Глава ${i + 1} из ${BOOK.length}</p><h2>${esc(c.title)}</h2>
      <div class="card book">${c.body.map(block).join("")}</div>
      ${refs.length ? `<div class="card"><h3>Шаги в приложении</h3>${refs.map((r) => `<div class="cl-item" data-gostep="${r.sg.id}:${r.i}"><span class="num${stepDone(r.st) ? " ok" : ""}">${stepDone(r.st) ? "✓" : r.i + 1}</span><div class="t">${esc(r.st.title)}<small>${r.sg.title}</small></div><span style="color:var(--hint)">›</span></div>`).join("")}</div>` : ""}
      <div class="step-nav">
        <button class="btn ghost" type="button" data-chapter="${i - 1}" ${i ? "" : "disabled"}>‹ Назад</button>
        <button class="btn" type="button" data-chapter="${i + 1 < BOOK.length ? i + 1 : "end"}">${i + 1 < BOOK.length ? "Следующая глава ›" : "К главам"}</button>
      </div>`;
  }

  /* ---------- объект ---------- */
  function viewObj() {
    const o = O();
    $("#view").innerHTML = `<h2>Объект</h2>
      <div class="card"><div class="grid">
        <label class="f full">Название<input data-of="name" type="text" value="${esc(o.name)}"></label>
        <label class="f full">Адрес, заказчик<input data-of="addr" type="text" value="${esc(o.addr)}" placeholder="ул. Ленина 5, кв. 12, Ирина"></label>
        <label class="f full">Заметки<textarea data-of="note" rows="4" placeholder="Что докупить, что пришло с браком, что обещали заказчику">${esc(o.note)}</textarea></label></div></div>
      <div class="card"><h3>Ход работ</h3><div class="res">${STAGES.map((sg) => { const p = stageProg(sg); return `<span class="k">${sg.title}</span><span class="v">${p.steps} из ${sg.steps.length}</span>`; }).join("")}</div>
        <button class="btn ghost" data-act="copyReport" type="button">Скопировать отчёт для заказчика</button>
        <button class="btn ghost" data-act="resetObj" type="button">Снять все отметки</button></div>
      <div class="card">${accessHtml()}</div>`;
  }
  function reportText() {
    const o = O();
    let s = `Сборка кухни · ${o.name}${o.addr ? `\n${o.addr}` : ""}\n`;
    STAGES.forEach((sg) => {
      const p = stageProg(sg);
      s += `\n${sg.title}: ${p.steps} из ${sg.steps.length} шагов\n` + sg.steps.map((st) => `${stepDone(st) ? "✓" : doneOf(st) ? "…" : "—"} ${st.title}`).join("\n") + "\n";
    });
    if (o.note) s += `\nЗаметки: ${o.note}`;
    return s;
  }

  /* ---------- узел на весь экран ---------- */
  function openZoom(svg) {
    const bg = document.createElement("div");
    bg.className = "zoom";
    const sized = svg.replace(/^(<svg[^>]*?)\s(width|height)="[^"]*"/, "$1").replace(/^(<svg[^>]*?)\s(width|height)="[^"]*"/, "$1").replace("<svg", `<svg class="zoomed" style="width:100%;max-width:900px"`);
    bg.innerHTML = `<div class="zoom-bar"><span>Удобнее держать телефон горизонтально</span><button type="button" data-close>Закрыть</button></div><div class="zoom-body">${sized}</div>`;
    document.body.appendChild(bg);
    const close = () => { bg.remove(); if (tg && tg.BackButton) { tg.BackButton.offClick(close); syncBack(); } };
    if (tg && tg.BackButton) { tg.BackButton.offClick(goBack); tg.BackButton.show(); tg.BackButton.onClick(close); }
    bg.addEventListener("click", (e) => { e.stopPropagation(); if (e.target.closest("[data-close]")) close(); });
  }

  /* ---------- рендер ---------- */
  const goBack = () => {
    if (S.part !== null && S.partFrom) { const f = S.partFrom; S.part = null; S.partFrom = null; S.tab = f.tab; S.step = f.step; render(); return; }
    S.step = null; S.chapter = null; S.part = null; render();
  };
  function syncBack() {
    if (!tg || !tg.BackButton) return;
    tg.BackButton.offClick(goBack);
    if (S.step !== null || S.chapter !== null || S.part !== null) { tg.BackButton.show(); tg.BackButton.onClick(goBack); } else tg.BackButton.hide();
  }
  function render(top = true) {
    $("#projectName").textContent = O().name || "—";
    document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === S.tab));
    const y = window.scrollY, sg = stageOf(S.tab);
    if (sg) { if (S.step !== null) viewStep(sg, S.step); else viewStage(sg); }
    else if (S.tab === "book") viewBook();
    else viewObj();
    syncBack();
    window.scrollTo(0, top ? 0 : y);
  }

  /* ---------- события ---------- */
  document.addEventListener("click", (e) => {
    const T = (s) => e.target.closest(s);
    let el;
    if ((el = T("[data-tab]"))) { S.tab = el.dataset.tab; S.step = null; S.chapter = null; S.part = null; S.partFrom = null; render(); haptic(); return; }
    if ((el = T("[data-bv]"))) { S.bookView = el.dataset.bv; S.chapter = null; S.part = null; S.partFrom = null; render(); haptic(); return; }
    if ((el = T("[data-part]"))) {
      S.partFrom = stageOf(S.tab) && S.step !== null ? { tab: S.tab, step: S.step } : null;
      S.tab = "book"; S.bookView = "parts"; S.part = el.dataset.part; S.chapter = null; S.step = null; render(); haptic(); return;
    }
    if ((el = T("[data-chapter]"))) {
      if (el.dataset.chapter === "end") { goBack(); return; }
      const i = Number(el.dataset.chapter);
      if (!chapterOpen(i)) { toast("Эта глава — в полном доступе"); return; }
      S.tab = "book"; S.bookView = "chapters"; S.chapter = i; S.step = null; S.part = null; S.partFrom = null; render(); haptic(); return;
    }
    if ((el = T("[data-gostep]"))) {
      const [stage, n] = el.dataset.gostep.split(":"), i = Number(n);
      if (!canOpen(stageOf(stage), i)) { toast("Этот шаг — в полном доступе"); return; }
      S.tab = stage; S.step = i; S.chapter = null; S.part = null; S.partFrom = null; render(); haptic(); return;
    }
    if ((el = T("[data-open]"))) {
      const sg = stageOf(S.tab), i = Number(el.dataset.open);
      if (!canOpen(sg, i)) { toast("Этот шаг — в полном доступе"); return; }
      S.step = i; render(); haptic(); return;
    }
    if (T("[data-back]")) { goBack(); return; }
    if ((el = T("[data-go]"))) {
      const sg = stageOf(S.tab), i = Number(el.dataset.go);
      if (i >= sg.steps.length) { goBack(); return; }
      if (!canOpen(sg, i)) { toast("Дальше — в полном доступе"); S.tab = "obj"; S.step = null; render(); return; }
      S.step = i; render(); haptic(); return;
    }
    if ((el = T("[data-draw]"))) {
      if (el.dataset.free !== "1" && !S.paid) { toast("Узел откроется в полном доступе"); return; }
      fetch(el.dataset.draw).then((x) => x.text()).then(openZoom).catch(() => toast("Не удалось открыть узел"));
      return;
    }
    if ((el = T("[data-plan]"))) { buyPrompt(el.dataset.plan); return; }
    if ((el = T("[data-act]"))) {
      const a = el.dataset.act;
      if (a === "copyReport") { if (navigator.clipboard) navigator.clipboard.writeText(reportText()).then(() => toast("Отчёт скопирован"), () => toast("Не удалось скопировать")); }
      else if (a === "resetObj") ask("Снять все отметки по этому объекту?").then((ok) => { if (ok) { O().done = {}; save(); render(false); } });
      else if (a === "code") { const inp = $("[data-code]"); if (inp && inp.value.trim()) { if (!CFG.API_URL) { toast("Коды заработают, когда подключим бота"); return; } api("redeem", { code: inp.value.trim().toUpperCase() }).then((r) => { if (r.ok) { checkAccess().then(() => render(false)); toast(r.msg || "Код активирован"); } else toast(r.error || "Код не подошёл"); }).catch(() => toast("Ошибка сети")); } }
      return;
    }
    if (T(".project-chip")) { showObjSheet(); return; }
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.ci === undefined) return;
    const sg = stageOf(S.tab), st = sg.steps[S.step], o = O(), set = new Set(o.done[st.id] || []), k = Number(el.dataset.ci);
    el.checked ? set.add(k) : set.delete(k);
    el.closest(".chk").classList.toggle("done", el.checked);
    o.done[st.id] = [...set].sort((a, b) => a - b);
    save(); haptic();
    if (set.size === st.checks.length) toast(S.step + 1 < sg.steps.length ? "Шаг пройден ✓ Жмите «Дальше»" : "Этап пройден ✓");
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset.of) return;
    O()[el.dataset.of] = el.value;
    if (el.dataset.of === "name") $("#projectName").textContent = el.value || "—";
    save();
  });

  function showObjSheet() {
    const total = STAGES.reduce((a, sg) => a + sg.steps.length, 0);
    const bg = document.createElement("div"); bg.className = "sheet-bg";
    bg.innerHTML = `<div class="sheet"><h3>Объекты</h3>
      ${S.objs.map((o) => { const d = STAGES.reduce((a, sg) => a + stageProg(sg, o).steps, 0);
        return `<div class="cl-item" data-obj="${o.id}"><div class="t"><b>${esc(o.name || "Без названия")}</b><small>${o.addr ? esc(o.addr) + " · " : ""}шагов ${d} из ${total}</small></div>${o.id === S.cur ? "✓" : ""}</div>`; }).join("")}
      <button class="btn ghost" data-act="newObj" type="button">+ Новый объект</button>
      ${S.objs.length > 1 ? `<button class="btn ghost" data-act="delObj" type="button" style="color:var(--hot)">Удалить «${esc(O().name)}»</button>` : ""}</div>`;
    document.body.appendChild(bg);
    bg.addEventListener("click", (e) => {
      e.stopPropagation();
      const ob = e.target.closest("[data-obj]"), a = e.target.closest("[data-act]");
      if (ob) { S.cur = ob.dataset.obj; S.step = null; save(); render(); bg.remove(); return; }
      if (a && a.dataset.act === "newObj") { const o = newObj(`Кухня ${S.objs.length + 1}`); S.objs.push(o); S.cur = o.id; S.tab = "obj"; S.step = null; save(); render(); bg.remove(); return; }
      if (a && a.dataset.act === "delObj") { ask(`Удалить объект «${O().name}» со всеми отметками?`).then((ok) => { if (!ok) return; S.objs = S.objs.filter((x) => x.id !== S.cur); S.cur = S.objs[0].id; S.step = null; save(); render(); bg.remove(); }); return; }
      if (e.target === bg) bg.remove();
    });
  }

  /* ---------- init ---------- */
  async function init() {
    const [objStr, curStr, readStr] = await Promise.all([store.get("kuhnya_objs"), store.get("kuhnya_cur"), store.get("kuhnya_read")]);
    try { if (objStr) S.objs = JSON.parse(objStr) || []; } catch (_) {}
    try { if (readStr) S.read = JSON.parse(readStr) || []; } catch (_) {}
    // кто уже начал сборку, сразу попадает в шаги; новичок — в книгу
    if (S.objs.some((o) => Object.keys(o.done || {}).length)) S.tab = "build";
    if (!S.objs.length) S.objs = [newObj("Кухня")];
    S.objs.forEach((o) => { if (!o.done) o.done = {}; });
    S.cur = curStr && S.objs.some((o) => o.id === curStr) ? curStr : S.objs[0].id;
    render();
    await checkAccess();
    render(false);
  }
  init();
})();
