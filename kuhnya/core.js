/* Расчётное ядро «Кухня PRO» для сборщиков кухонь: стены, раскладка модулей, высоты, столешница, фурнитура, смета.
   Все размеры в миллиметрах. Работает в браузере и в Node (тесты). */
(function (root) {

  /* ========== СПРАВОЧНИКИ ========== */

  const STD = [150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];

  // row: base — нижний ряд (шкафы, техника, пеналы), upper — верхний, any — оба.
  // corpus — есть корпус для сборки; carry — несёт столешницу; tall — высокий (закрывает и верхний ряд).
  const MODULES = {
    base_door:    { t: "Нижний с дверцей", s: "Нижний", row: "base", def: 400, min: 150, max: 600, corpus: true, carry: true },
    base_drawers: { t: "Нижний с ящиками", s: "Ящики", row: "base", def: 600, min: 300, max: 1000, corpus: true, carry: true },
    base_sink:    { t: "Под мойку", s: "Мойка", row: "base", def: 600, min: 450, max: 1000, corpus: true, carry: true, sink: true },
    base_hob:     { t: "Под варочную, с ящиками", s: "Варочная", row: "base", def: 600, min: 450, max: 900, corpus: true, carry: true, hob: true },
    base_oven:    { t: "Духовка + варочная", s: "Духовка", row: "base", def: 600, min: 600, max: 600, corpus: true, carry: true, hob: true, oven: true },
    base_dw:      { t: "Посудомойка встроенная", s: "ПММ", row: "base", def: 600, min: 450, max: 600, carry: true, dw: true },
    base_bottle:  { t: "Бутылочница (карго)", s: "Карго", row: "base", def: 150, min: 100, max: 300, corpus: true, carry: true },
    base_corner:  { t: "Угловой нижний Г-образный", s: "Угол", row: "base", def: 900, min: 800, max: 1050, corpus: true, carry: true, corner: "l" },
    base_blind:   { t: "Угловой нижний глухой", s: "Угол", row: "base", def: 1000, min: 900, max: 1200, corpus: true, carry: true, corner: "blind" },
    stove:        { t: "Плита отдельностоящая", s: "Плита", row: "base", def: 600, min: 500, max: 600, hob: true, free: true },
    fridge:       { t: "Холодильник отдельностоящий", s: "Холод.", row: "base", def: 600, min: 550, max: 900, tall: true, free: true },
    tall:         { t: "Пенал", s: "Пенал", row: "base", def: 600, min: 300, max: 600, corpus: true, tall: true },
    tall_appl:    { t: "Пенал под духовку и СВЧ", s: "Пенал", row: "base", def: 600, min: 600, max: 600, corpus: true, tall: true, oven: true },
    tall_fridge:  { t: "Пенал под встроенный холодильник", s: "Холод.", row: "base", def: 600, min: 600, max: 600, corpus: true, tall: true, fridge: true },
    up_door:      { t: "Верхний с дверцей", s: "Верхний", row: "upper", def: 600, min: 150, max: 1000, corpus: true },
    up_dryer:     { t: "Верхний с сушкой", s: "Сушка", row: "upper", def: 600, min: 400, max: 900, corpus: true },
    up_lift:      { t: "Верхний с подъёмником", s: "Подъёмн.", row: "upper", def: 800, min: 400, max: 1200, corpus: true },
    up_hood:      { t: "Шкаф над встроенной вытяжкой", s: "Вытяжка", row: "upper", def: 600, min: 500, max: 900, corpus: true, hood: "built" },
    up_corner:    { t: "Угловой верхний Г-образный", s: "Угол", row: "upper", def: 600, min: 550, max: 700, corpus: true, corner: "l" },
    up_open:      { t: "Открытая полка", s: "Полка", row: "upper", def: 300, min: 150, max: 1000, corpus: true },
    hood:         { t: "Вытяжка каминная (без шкафа)", s: "Вытяжка", row: "upper", def: 600, min: 450, max: 1200, hood: "chimney" },
    filler:       { t: "Добор (планка)", s: "Добор", row: "any", def: 50, min: 10, max: 150, carry: true, filler: true },
    gap:          { t: "Пустое место", s: "", row: "any", def: 300, min: 10, max: 4000, gap: true },
  };
  const ROW_TYPES = (row) => Object.keys(MODULES).filter((k) => MODULES[k].row === row || MODULES[k].row === "any");

  const UTILS = {
    water:  { t: "Вода", s: "В", color: "#1565c0", h: 500 },
    sewer:  { t: "Канализация", s: "К", color: "#6d4c41", h: 350 },
    gas:    { t: "Газ", s: "Г", color: "#f9a825", h: 700 },
    socket: { t: "Розетка", s: "Р", color: "#e65100", h: 1100 },
    vent:   { t: "Вентканал", s: "Вк", color: "#00897b", h: 2300 },
  };
  const SHAPES = { line: { t: "Прямая", n: 1 }, corner: { t: "Угловая", n: 2 }, u: { t: "П-образная", n: 3 } };
  const HOBS = { electric: { t: "Электро", hood: 650 }, induction: { t: "Индукция", hood: 650 }, gas: { t: "Газ", hood: 750 } };
  const SHEETS = [3000, 3050, 4100, 4200];

  // Смета сборщика: ключ, позиция, единица, цена по умолчанию (₽). Количество считает works().
  const WORKS = [
    ["base", "Сборка и установка нижнего шкафа", "шт", 900],
    ["upper", "Сборка и навеска верхнего шкафа", "шт", 1000],
    ["corner", "Угловой модуль", "шт", 1500],
    ["tall", "Пенал: сборка и установка", "шт", 2000],
    ["drawer", "Ящик: направляющие и фасад", "шт", 300],
    ["lift", "Подъёмный механизм", "шт", 500],
    ["counter", "Столешница: подгонка и установка", "м", 700],
    ["joint90", "Стык столешницы через планку", "шт", 700],
    ["euro", "Евро-запил", "шт", 3000],
    ["cutSink", "Вырез под мойку", "шт", 1500],
    ["cutHob", "Вырез под варочную панель", "шт", 1200],
    ["sinkInst", "Установка мойки и смесителя, подключение", "шт", 2000],
    ["hobInst", "Установка варочной панели", "шт", 1000],
    ["oven", "Установка духового шкафа", "шт", 1000],
    ["dw", "Встройка и подключение посудомойки", "шт", 2500],
    ["fridgeB", "Встройка холодильника, навеска фасадов", "шт", 3000],
    ["hood", "Установка вытяжки", "шт", 2000],
    ["duct", "Воздуховод до вентканала", "шт", 1500],
    ["plinth", "Пристеночный плинтус", "м", 250],
    ["cocol", "Цоколь", "м", 250],
    ["handles", "Установка ручек", "шт", 80],
    ["filler", "Добор, подгонка по месту", "шт", 400],
    ["trip", "Выезд", "шт", 1000],
    ["trash", "Вывоз упаковки", "шт", 500],
  ];

  /* ========== ОБЪЕКТ ПО УМОЛЧАНИЮ ========== */

  let seq = 0;
  const uid = (p) => (p || "m") + Date.now().toString(36).slice(-4) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
  const mod = (type, w) => ({ id: uid("m"), type, w: w || MODULES[type].def });

  // blank — пустой объект без примера раскладки
  function newProject(name, blank) {
    const p = {
      id: uid("p"), name: name || "Кухня", shape: "corner", height: 2700, depth: 2600,
      walls: [
        { id: "A", len: 3000, align: "right", base: [mod("fridge"), mod("base_door", 400), mod("base_oven"), mod("base_drawers", 500), mod("base_corner")],
          upper: [mod("up_door", 400), mod("up_hood"), mod("up_door", 800), mod("up_corner")] },
        { id: "B", len: 2000, align: "left", base: [mod("base_sink"), mod("base_dw", 450), mod("filler", 50)], upper: [] },
        { id: "C", len: 2400, align: "left", base: [], upper: [] },
      ],
      openings: [{ id: uid("o"), kind: "window", wall: "B", from: 700, w: 1200, sill: 950, h: 1450 }],
      utils: [
        { id: uid("u"), kind: "water", wall: "B", x: 1100, h: 500 },
        { id: uid("u"), kind: "sewer", wall: "B", x: 1300, h: 350 },
        { id: uid("u"), kind: "socket", wall: "A", x: 300, h: 300 },
        { id: uid("u"), kind: "socket", wall: "A", x: 1800, h: 1100 },
        { id: uid("u"), kind: "socket", wall: "A", x: 1300, h: 2300 },
        { id: uid("u"), kind: "socket", wall: "A", x: 2300, h: 1100 },
        { id: uid("u"), kind: "socket", wall: "B", x: 1700, h: 300 },
        { id: uid("u"), kind: "vent", wall: "A", x: 2700, h: 2350 },
      ],
      h: { person: 168, counter: 900, thk: 38, caseH: 720, apron: 600, upperH: 720, depth: 600, upDepth: 300, hob: "induction", hoodH: 0 },
      counter: { joint: "90", sheet: 3000, sinkW: 560, sinkD: 480, hobW: 560, hobD: 490 },
      qty: {},
    };
    if (blank) { p.walls.forEach((w) => { w.base = []; w.upper = []; }); p.openings = []; p.utils = []; }
    return p;
  }

  /* ========== ВЫСОТЫ ========== */

  // Рекомендуемая высота столешницы по росту того, кто больше готовит.
  function counterByHeight(cm) {
    if (!cm) return 900;
    if (cm < 155) return 850;
    if (cm < 165) return 870;
    if (cm < 175) return 900;
    if (cm < 185) return 910;
    return 950;
  }

  function heights(p) {
    const h = p.h, H = Number(p.height) || 2700;
    const counter = Number(h.counter) || 900, thk = Number(h.thk) || 38, caseH = Number(h.caseH) || 720;
    const plinth = counter - thk - caseH;
    const upperBottom = counter + (Number(h.apron) || 600);
    const upperTop = upperBottom + (Number(h.upperH) || 720);
    const hob = HOBS[h.hob] || HOBS.electric;
    const hoodMin = hob.hood;
    const hoodH = Number(h.hoodH) || hoodMin; // каминная: от столешницы до низа вытяжки
    const r = { H, counter, thk, caseH, plinth, apron: upperBottom - counter, upperBottom, upperTop, upperH: upperTop - upperBottom,
      tallH: upperTop - plinth, topGap: H - upperTop, hoodMin, hoodH, rec: counterByHeight(Number(h.person)),
      socketH: counter + 150, warnings: [] };
    // встроенная вытяжка: шкаф над ней короче, чтобы низ вытяжки был не ниже нормы
    r.hoodBuilt = Math.max(r.apron, hoodMin);
    r.hoodCab = upperTop - counter - r.hoodBuilt;
    const w = r.warnings;
    if (plinth < 80) w.push(`Цоколь выходит ${plinth} мм: ножки так низко не опустить. Поднимите столешницу или возьмите корпуса ниже.`);
    if (plinth > 200) w.push(`Цоколь выходит ${plinth} мм — это много, ножки на пределе. Поставьте корпуса выше или опустите столешницу.`);
    if (counter < 820 || counter > 960) w.push(`Столешница на ${counter} мм — необычная высота, проверьте с хозяйкой.`);
    if (r.apron < 500) w.push(`Фартук ${r.apron} мм: верхние будут нависать над головой, а кухонный комбайн под ними не встанет. Нормально 550–650.`);
    if (r.apron > 700) w.push(`Фартук ${r.apron} мм: до верхних полок без табуретки не дотянуться. Нормально 550–650.`);
    if (r.topGap < 0) w.push(`Верхние шкафы не помещаются по высоте: упираются в потолок на ${-r.topGap} мм.`);
    else if (r.topGap < 30) w.push(`До потолка остаётся ${r.topGap} мм. Чтобы завести шкаф на шину, нужно поднять его на 15–20 мм — закладывайте хотя бы 30.`);
    if (r.hoodCab < 250) w.push(`Шкаф над встроенной вытяжкой выходит ${r.hoodCab} мм — мотор и гофра не поместятся. Возьмите верхние выше или фартук меньше.`);
    return r;
  }

  /* ========== РАСКЛАДКА ПО СТЕНАМ ========== */

  const W = (m) => Math.max(0, Number(m.w) || 0);
  const def = (m) => MODULES[m.type] || MODULES.gap;
  const activeWalls = (p) => p.walls.slice(0, (SHAPES[p.shape] || SHAPES.line).n);

  // Ставит модули подряд на участок lo..hi, обходя занятые места. align right — от правого края.
  function placeRow(items, lo, hi, align, blocked) {
    const right = align === "right";
    const mir = (a, b) => [lo + hi - b, lo + hi - a];
    const bl = blocked.map(([a, b]) => (right ? mir(a, b) : [a, b])).sort((u, v) => u[0] - v[0]);
    const seqItems = right ? items.slice().reverse() : items;
    let x = lo;
    const out = seqItems.map((m) => {
      const w = W(m);
      let moved = true;
      while (moved) { moved = false; for (const [a, b] of bl) if (w > 0 && x < b && x + w > a) { x = b; moved = true; } }
      const r = { m, x, w };
      x += w;
      return r;
    });
    const placed = out.map(({ m, x: px, w }) => Object.assign({}, m, { w, x: right ? lo + hi - px - w : px }));
    if (right) placed.reverse();
    return placed;
  }

  // Свободные куски участка lo..hi: всё, что не занято модулями и препятствиями.
  function freeGaps(placed, lo, hi, blocked) {
    const busy = placed.map((m) => [m.x, m.x + m.w]).concat(blocked).filter(([a, b]) => b > a).sort((u, v) => u[0] - v[0]);
    const gaps = [];
    let x = lo;
    busy.forEach(([a, b]) => { if (a > x && Math.min(a, hi) - x >= 1) gaps.push({ from: x, to: Math.min(a, hi), w: Math.min(a, hi) - x }); x = Math.max(x, b); });
    if (hi - x >= 1) gaps.push({ from: x, to: hi, w: hi - x });
    return gaps;
  }

  // Чем закрыть свободное место: шкафы по 600, остаток — шкаф поуже, мелочь — добор.
  function fillSuggest(g) {
    if (g < 15) return { mods: [], filler: 0, text: `зазор ${g} мм, уйдёт при выставлении` };
    if (g < 150) return { mods: [], filler: g, text: `добор ${g} мм` };
    const mods = Array(Math.floor(g / 600)).fill(600);
    let rest = g - mods.length * 600;
    if (rest >= 150) { const s = STD.filter((v) => v <= rest).pop(); mods.push(s); rest -= s; }
    const filler = rest >= 15 ? rest : 0;
    const text = (mods.length > 1 ? `шкафы ${mods.join(" + ")} мм` : `шкаф ${mods[0]} мм`) + (filler ? ` + добор ${filler} мм` : rest > 0 ? ` (зазор ${rest} мм)` : "");
    return { mods, filler, text };
  }

  const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

  function layout(p, hh) {
    const walls = activeWalls(p), D = Number(p.h.depth) || 600, UD = Number(p.h.upDepth) || 300;
    const res = [];
    let s0 = 0;
    walls.forEach((wl, i) => {
      const len = Number(wl.len) || 0;
      const prev = i > 0 ? walls[i - 1] : null;
      const prevBaseLast = prev && prev.base.length ? prev.base[prev.base.length - 1] : null;
      const prevUpLast = prev && prev.upper.length ? prev.upper[prev.upper.length - 1] : null;
      let startBase = 0, startUp = 0;
      if (prevBaseLast) startBase = prevBaseLast.type === "base_corner" ? W(prevBaseLast) : D;
      if (prevUpLast) startUp = prevUpLast.type === "up_corner" ? W(prevUpLast) : UD;
      if (prevBaseLast && def(prevBaseLast).tall) startUp = Math.max(startUp, D);
      const ops = (p.openings || []).filter((o) => o.wall === wl.id);
      const doorBl = ops.filter((o) => o.kind === "door").map((o) => [Number(o.from), Number(o.from) + Number(o.w)]);
      const base = placeRow(wl.base, startBase, len, wl.align, doorBl);
      const tallBl = base.filter((m) => def(m).tall).map((m) => [m.x, m.x + m.w]);
      const winBl = ops.filter((o) => Number(o.sill) < hh.upperTop && Number(o.sill) + Number(o.h) > hh.upperBottom).map((o) => [Number(o.from), Number(o.from) + Number(o.w)]);
      const upBl = tallBl.concat(winBl);
      const upper = placeRow(wl.upper, startUp, len, wl.align, upBl);
      const overOf = (row, lo) => Math.max(0, ...row.map((m) => m.x + m.w - len), ...row.map((m) => lo - m.x));
      res.push({
        id: wl.id, i, len, s0, align: wl.align, startBase, startUp, base, upper, ops,
        blockedBase: doorBl, blockedUp: upBl,
        gapsBase: freeGaps(base, startBase, len, doorBl).filter((g) => !(g.w < 1)),
        gapsUp: freeGaps(upper, startUp, len, upBl),
        overBase: overOf(base, startBase), overUp: overOf(upper, startUp),
        usedBase: base.reduce((a, m) => a + m.w, 0), usedUp: upper.reduce((a, m) => a + m.w, 0),
      });
      s0 += len;
    });
    return res;
  }

  /* ========== ПРОВЕРКИ РАЗМЕЩЕНИЯ ========== */

  const at = (wr, x) => wr.s0 + x; // положение вдоль всей кухни, через углы

  function checks(p, hh, L) {
    const warn = [], info = [];
    const name = (w) => `Стена ${w.id}`;
    const all = [];
    L.forEach((w) => w.base.forEach((m, k) => all.push({ w, m, k, a: at(w, m.x), b: at(w, m.x + m.w) })));
    L.forEach((w, i) => {
      if (w.overBase > 0) warn.push(`${name(w)}: нижний ряд не влезает на ${w.overBase} мм. Уберите модуль или возьмите уже.`);
      if (w.overUp > 0) warn.push(`${name(w)}: верхний ряд не влезает на ${w.overUp} мм${w.blockedUp.length ? " (учтены окно и пеналы)" : ""}.`);
      [["base", w.base], ["upper", w.upper]].forEach(([, row]) => row.forEach((m) => {
        const d = def(m);
        if (W(m) < d.min || W(m) > d.max) warn.push(`${name(w)}: «${d.t}» шириной ${W(m)} мм — так не бывает, обычно ${d.min}–${d.max}.`);
      }));
      // угловые модули — только последними, у угла со следующей стеной
      [["base", w.base], ["upper", w.upper]].forEach(([, row]) => row.forEach((m, k) => {
        if (!def(m).corner) return;
        if (i === L.length - 1) warn.push(`${name(w)}: угловой модуль есть, а следующей стены нет. Смените форму кухни или модуль.`);
        else if (k !== row.length - 1 || Math.abs(m.x + m.w - w.len) > 5) warn.push(`${name(w)}: угловой модуль должен стоять последним, вплотную к углу. Прижмите ряд к правому краю.`);
      }));
      // глухой угол: первый фасад на следующей стене бьётся о ручки
      const last = w.base[w.base.length - 1], nx = L[i + 1];
      if (last && last.type === "base_blind" && nx && nx.base[0] && nx.base[0].type !== "filler")
        warn.push(`Стена ${nx.id}: после глухого углового нужен добор 50–100 мм, иначе дверцы и ручки будут биться.`);
      if (nx && last && !def(last).corner && nx.base.length && Math.abs(last.x + last.w - w.len) <= 5 && nx.base[0] && nx.base[0].type !== "filler" && def(last).corpus && def(nx.base[0]).corpus)
        info.push(`Угол ${w.id}–${nx.id}: шкафы сходятся без углового модуля. Поставьте добор 50–70 мм на стене ${nx.id}, чтобы фасады открывались.`);
      // окна и двери
      w.ops.forEach((o) => {
        const f = Number(o.from), t = f + Number(o.w);
        if (o.kind === "window" && Number(o.sill) < hh.counter + 20 && w.base.some((m) => (def(m).carry || def(m).tall) && !def(m).filler && overlap(m.x, m.x + m.w, f, t) > 0))
          warn.push(`${name(w)}: подоконник на ${o.sill} мм, а столешница на ${hh.counter}. Столешница упрётся в откос — понадобится вырез или подоконник срезать.`);
        if (o.kind === "door" && w.base.some((m) => overlap(m.x, m.x + m.w, f, t) > 0)) warn.push(`${name(w)}: модули заходят на дверной проём.`);
        if (f < 0 || t > w.len) warn.push(`${name(w)}: ${o.kind === "door" ? "дверь" : "окно"} выходит за длину стены.`);
      });
    });
    // соседство техники
    L.forEach((w) => w.base.forEach((m, k) => {
      const d = def(m), pv = w.base[k - 1], nx = w.base[k + 1];
      const nb = [pv && Math.abs(pv.x + pv.w - m.x) <= 5 ? pv : null, nx && Math.abs(m.x + m.w - nx.x) <= 5 ? nx : null].filter(Boolean);
      if (d.hob && nb.some((x) => def(x).tall)) warn.push(`Стена ${w.id}: варочная вплотную к ${nb.find((x) => def(x).tall).type === "fridge" ? "холодильнику" : "пеналу"}. Боковина будет греться — оставьте между ними хотя бы 300 мм столешницы.`);
      if ((d.oven || m.type === "stove") && nb.some((x) => x.type === "fridge" || x.type === "tall_fridge")) warn.push(`Стена ${w.id}: духовка рядом с холодильником — он будет работать на износ. Разнесите или поставьте между ними шкаф.`);
    }));
    const sinks = all.filter((x) => def(x.m).sink), hobs = all.filter((x) => def(x.m).hob), dws = all.filter((x) => def(x.m).dw);
    if (!sinks.length) info.push("Мойки в раскладке нет — добавьте модуль «Под мойку».");
    sinks.forEach((s) => hobs.forEach((h) => {
      const gap = Math.max(h.a - s.b, s.a - h.b);
      if (gap < 300) warn.push(`Между мойкой и варочной ${Math.max(0, gap)} мм. Брызги летят на конфорки и некуда поставить кастрюлю — нужно хотя бы 300, лучше 400–900.`);
    }));
    dws.forEach((d) => {
      const dist = sinks.length ? Math.min(...sinks.map((s) => Math.max(d.a - s.b, s.a - d.b, 0))) : Infinity;
      if (dist > 600) warn.push(`Посудомойка далеко от мойки${isFinite(dist) ? ` (${dist} мм)` : ""}. Её шланги короткие: ставьте ПММ рядом с мойкой.`);
    });
    // вытяжка над варочной
    const hoodsAt = [];
    L.forEach((w) => w.upper.forEach((m) => { if (def(m).hood) hoodsAt.push({ w, m, a: at(w, m.x), b: at(w, m.x + m.w) }); }));
    hobs.forEach((h) => {
      const hd = hoodsAt.find((x) => x.w === h.w && overlap(x.m.x, x.m.x + x.m.w, h.m.x, h.m.x + h.m.w) >= Math.min(h.m.w, x.m.w) * 0.6);
      if (!hd) { warn.push(`Стена ${h.w.id}: над варочной нет вытяжки. Добавьте в верхний ряд «Шкаф над встроенной вытяжкой» или каминную вытяжку.`); return; }
      const hoodH = def(hd.m).hood === "built" ? hh.hoodBuilt : hh.hoodH;
      if (hoodH < hh.hoodMin) warn.push(`Вытяжка висит на ${hoodH} мм над столешницей. Над ${p.h.hob === "gas" ? "газовой" : "электрической"} плитой нужно не меньше ${hh.hoodMin} мм.`);
    });
    // коммуникации
    const U = (p.utils || []).map((u) => { const w = L.find((x) => x.id === u.wall); return w ? Object.assign({}, u, { w, s: at(w, Number(u.x)) }) : null; }).filter(Boolean);
    const near = (u, list) => (list.length ? Math.min(...list.map((x) => Math.max(x.a - u.s, u.s - x.b, 0))) : Infinity);
    U.filter((u) => u.kind === "water").forEach((u) => { const d = near(u, sinks); if (sinks.length && d > 1200) warn.push(`Вода в ${f1m(d)} от мойки. Гибкие подводки смесителя 0,5–0,8 м — придётся тянуть трубу за шкафами.`); });
    U.filter((u) => u.kind === "sewer").forEach((u) => {
      const d = near(u, sinks);
      if (sinks.length && d > 1000) warn.push(`Канализация в ${f1m(d)} от мойки. Трубу за шкафами ведите с уклоном 2–3 см на метр, проверьте, хватит ли высоты над полом.`);
      if (Number(u.h) > 450) warn.push(`Выход канализации на высоте ${u.h} мм — выше выхода сифона. Вода стоять будет, нужен насос или перенос трубы ниже.`);
    });
    const gas = U.filter((u) => u.kind === "gas");
    if (p.h.hob === "gas" && !gas.length) warn.push("Варочная газовая, а точки газа на замере нет. Отметьте её на плане.");
    gas.forEach((u) => { const d = near(u, hobs); if (hobs.length && d > 1000) warn.push(`Газ в ${f1m(d)} от варочной. Гибкий газовый шланг — не длиннее 1,5 м и не через шкаф насквозь; подключает газовая служба.`); });
    const sockets = U.filter((u) => u.kind === "socket");
    sockets.forEach((u) => {
      const h = Number(u.h);
      if (h > hh.counter && h < hh.upperBottom) {
        if (h - hh.counter < 100) warn.push(`Розетка на стене ${u.wall} на ${h} мм — всего ${h - hh.counter} мм над столешницей, плинтус её закроет. Нужно 150–250 мм над столешницей.`);
        const over = all.find((x) => x.w === u.w && (def(x.m).sink || def(x.m).hob) && Number(u.x) >= x.m.x && Number(u.x) <= x.m.x + x.m.w);
        if (over) warn.push(`Розетка на стене ${u.wall} (${u.x} мм) висит над ${def(over.m).sink ? "мойкой" : "варочной"}. Перенесите в сторону хотя бы на 300 мм.`);
      }
      if (h >= hh.counter - 60 && h <= hh.counter + 10) warn.push(`Розетка на стене ${u.wall} на ${h} мм попадает на уровень столешницы.`);
    });
    const need = all.filter((x) => def(x.m).dw || def(x.m).oven || x.m.type === "fridge" || x.m.type === "tall_fridge").length + hoodsAt.length + (p.h.hob === "gas" ? 0 : hobs.filter((x) => x.m.type !== "stove").length);
    if (sockets.length < need) info.push(`Техники с вилкой или кабелем: ${need}, а розеток на замере ${sockets.length}. Варочной и духовке нужна отдельная линия, остальным — розетки за шкафами.`);
    const vent = U.find((u) => u.kind === "vent");
    if (vent && hoodsAt.length) { const d = Math.min(...hoodsAt.map((x) => Math.max(x.a - vent.s, vent.s - x.b, 0))); if (d > 3000) warn.push(`От вытяжки до вентканала ${f1m(d)}. Больше 3 м и двух поворотов тяга падает вдвое.`); }
    return { warn, info };
  }
  const f1m = (mm) => (Math.round(mm / 100) / 10).toLocaleString("ru-RU") + " м";

  /* ========== СТОЛЕШНИЦА ========== */

  // Первый подходящий лист, самые длинные куски вперёд. kerf — пропил.
  function pack(lengths, sheet, kerf = 4) {
    const bins = [];
    lengths.map((l, i) => ({ l, i })).sort((a, b) => b.l - a.l).forEach((it) => {
      const fits = (x) => x.used + (x.items.length ? kerf : 0) + it.l <= sheet;
      let b = bins.find(fits);
      if (!b) { b = { items: [], used: 0 }; bins.push(b); }
      b.used += (b.items.length ? kerf : 0) + it.l;
      b.items.push(it.i);
    });
    return bins.map((b) => ({ items: b.items, used: b.used, waste: Math.max(0, sheet - b.used) }));
  }

  function counterCalc(p, hh, L) {
    const c = p.counter, D = Number(p.h.depth) || 600, sheet = Number(c.sheet) || 3000, ALLOW = 20;
    const runs = [];
    L.forEach((w) => {
      let cur = null;
      w.base.forEach((m) => {
        if (!def(m).carry || m.w <= 0) { cur = null; return; }
        if (cur && Math.abs(cur.x1 - m.x) <= 2) { cur.x1 = m.x + m.w; cur.mods.push(m); }
        else { cur = { w, x0: m.x, x1: m.x + m.w, mods: [m] }; runs.push(cur); }
      });
    });
    const joints = [];
    runs.forEach((r) => {
      const i = r.w.i;
      if (i > 0) {
        const pw = L[i - 1], pr = runs.filter((x) => x.w === pw).pop();
        if (pr && pr.x1 >= pw.len - 5 && r.x0 <= r.w.startBase + 5 && r === runs.find((x) => x.w === r.w)) { r.jStart = c.joint; pr.jEnd = c.joint; joints.push({ a: pw.id, b: r.w.id, kind: c.joint }); }
      }
    });
    const cutouts = [], pieces = [], warn = [];
    runs.forEach((r) => {
      const from = r.jStart ? (r.jStart === "euro" ? 0 : D) : r.x0;
      const to = r.jEnd ? r.w.len : r.x1;
      r.mods.forEach((m) => {
        const d = def(m);
        if (!d.sink && !d.hob) return;
        const cw = d.sink ? Number(c.sinkW) : m.w <= 450 ? 270 : Number(c.hobW), cd = d.sink ? Number(c.sinkD) : Number(c.hobD);
        const cx = m.x + m.w / 2;
        cutouts.push({ kind: d.sink ? "sink" : "hob", wall: r.w.id, x0: cx - cw / 2, x1: cx + cw / 2, w: cw, d: cd, front: Math.round((D - cd) / 2) });
        if (cw > m.w - 40) warn.push(`Стена ${r.w.id}: вырез под ${d.sink ? "мойку" : "варочную"} ${cw} мм почти во всю ширину модуля ${m.w}. Возьмите модуль шире или мойку/панель меньше.`);
        if (cd > D - 100) warn.push(`Вырез глубиной ${cd} мм в столешнице ${D} — до края останется меньше 50 мм, столешница треснет.`);
      });
      // разрезаем длинный кусок на листы по границам модулей, но не у мойки, варочной и ПММ
      const bad = new Set();
      r.mods.forEach((m) => { const d = def(m); if (d.sink || d.hob || d.dw) { bad.add(m.x); bad.add(m.x + m.w); } });
      const bounds = r.mods.map((m) => m.x + m.w).filter((x) => x > from + 300 && x < to - 300 && !bad.has(x));
      const splits = [];
      let s = from;
      while (to - s + ALLOW > sheet) {
        const cand = bounds.filter((x) => x > s + 300 && x - s + ALLOW <= sheet).pop();
        const cut = cand || s + sheet - ALLOW;
        if (!cand) warn.push(`Стена ${r.w.id}: кусок столешницы длиннее листа, а удобной границы модулей нет — стык пройдёт по шкафу на ${Math.round(cut)} мм.`);
        splits.push(cut); s = cut;
      }
      const pts = [from].concat(splits, [to]);
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k], b = pts[k + 1];
        pieces.push({ wall: r.w.id, from: a, to: b, len: b - a, cut: b - a + ALLOW,
          start: k === 0 ? (r.jStart ? "joint" : a <= 5 ? "wall" : "free") : "split",
          end: k === pts.length - 2 ? (r.jEnd ? "joint" : b >= r.w.len - 5 ? "wall" : "free") : "split" });
      }
      r.splits = splits; r.from = from; r.to = to;
    });
    // стыки не ближе 100 мм к вырезам
    cutouts.forEach((ct) => {
      const w = L.find((x) => x.id === ct.wall);
      const seams = [];
      runs.filter((r) => r.w === w).forEach((r) => { (r.splits || []).forEach((sx) => seams.push(sx)); if (r.jStart) seams.push(D); if (r.jEnd) seams.push(w.len - D); });
      seams.forEach((sx) => { if (sx > ct.x0 - 100 && sx < ct.x1 + 100) warn.push(`Стена ${ct.wall}: стык столешницы ближе 100 мм к вырезу под ${ct.kind === "sink" ? "мойку" : "варочную"}. Там столешница и лопнет — сдвиньте модуль или стык.`); });
    });
    const sheets = pack(pieces.map((x) => x.cut), sheet);
    const splitsN = runs.reduce((a, r) => a + (r.splits || []).length, 0);
    const freeEnds = pieces.filter((x) => x.start === "free").length + pieces.filter((x) => x.end === "free").length;
    const len = pieces.reduce((a, x) => a + x.len, 0);
    pieces.forEach((x) => { if (x.cut > sheet) warn.push(`Кусок ${x.cut} мм длиннее листа ${sheet} мм.`); });
    return { runs, pieces, sheets, joints, cutouts, splits: splitsN, freeEnds, len, chains: runs.length - joints.length, sheet, D, warn };
  }

  /* ========== ЦОКОЛЬ ========== */

  function cocolCalc(p, hh, L, ct) {
    const D = Number(p.h.depth) || 600, runs = [];
    L.forEach((w) => {
      let cur = null;
      w.base.forEach((m) => {
        const d = def(m), on = (d.corpus || d.dw || d.filler) && m.w > 0;
        if (!on) { cur = null; return; }
        if (cur && Math.abs(cur.x1 - m.x) <= 2) cur.x1 = m.x + m.w;
        else { cur = { w, x0: m.x, x1: m.x + m.w }; runs.push(cur); }
      });
    });
    let corners = 0;
    runs.forEach((r) => {
      const i = r.w.i;
      if (i > 0) {
        const pw = L[i - 1], pr = runs.filter((x) => x.w === pw).pop();
        if (pr && pr.x1 >= pw.len - 5 && r.x0 <= r.w.startBase + 5 && r === runs.find((x) => x.w === r.w)) { pr.cEnd = true; r.cStart = true; corners++; }
      }
    });
    // у внутреннего угла цоколь короче на глубину, на второй стене — длиннее на вылет Г-образного модуля
    const CO = D - 80; // плоскость цоколя от стены
    const parts = runs.map((r) => Math.max(0, (r.cEnd ? r.x1 - CO : r.x1) - (r.cStart ? CO : r.x0)));
    const total = parts.reduce((a, b) => a + b, 0);
    const bars = pack(parts.filter((x) => x > 0), 4000, 2);
    const ends = runs.reduce((a, r) => a + (!r.cStart && r.x0 > 5 ? 1 : 0) + (!r.cEnd && r.x1 < r.w.len - 5 ? 1 : 0), 0);
    const joins = parts.reduce((a, x) => a + Math.max(0, Math.ceil(x / 4000) - 1), 0);
    return { runs, total, bars: bars.length, corners, ends, joins, h: hh.plinth };
  }

  /* ========== ФУРНИТУРА ========== */

  const hingesFor = (h) => (h <= 900 ? 2 : h <= 1600 ? 3 : 4);
  const doorsFor = (w) => (w > 500 ? 2 : 1);

  // Что идёт на один модуль. h — результат heights().
  function partsOf(m, hh) {
    const d = def(m), w = W(m), z = { doors: 0, hinges: 0, cHinges: 0, drawers: 0, legs: 0, hangers: 0, conf: 0, shelves: 0, lifts: 0, cargo: 0, dryer: 0, wallFix: 0, handles: 0 };
    const upShelves = hh.upperH <= 720 ? 1 : hh.upperH <= 900 ? 2 : 3;
    switch (m.type) {
      case "base_door": z.doors = doorsFor(w); z.hinges = z.doors * hingesFor(hh.caseH); z.shelves = 1; break;
      case "base_drawers": z.drawers = 3; break;
      case "base_sink": z.doors = doorsFor(w); z.hinges = z.doors * hingesFor(hh.caseH); break;
      case "base_hob": z.drawers = 2; break;
      case "base_oven": z.drawers = 1; break;
      case "base_bottle": z.cargo = 1; z.handles = 1; break;
      case "base_corner": z.doors = 2; z.hinges = 2; z.cHinges = 2; z.shelves = 1; break;
      case "base_blind": z.doors = 1; z.hinges = hingesFor(hh.caseH); z.shelves = 1; break;
      case "tall": { const c = doorsFor(w), lo = hh.tallH - hh.upperH; z.doors = 2 * c; z.hinges = c * (hingesFor(lo) + hingesFor(hh.upperH)); z.shelves = 4; z.wallFix = 2; break; }
      case "tall_appl": z.doors = 1; z.hinges = hingesFor(hh.upperH); z.drawers = 1; z.shelves = 2; z.wallFix = 2; break;
      case "tall_fridge": z.wallFix = 2; break;
      case "up_door": z.doors = doorsFor(w); z.hinges = z.doors * hingesFor(hh.upperH); z.shelves = upShelves; break;
      case "up_dryer": z.doors = doorsFor(w); z.hinges = z.doors * hingesFor(hh.upperH); z.dryer = 1; break;
      case "up_lift": z.lifts = 1; z.handles = 1; z.shelves = 1; break;
      case "up_hood": z.doors = doorsFor(w); z.hinges = z.doors * 2; break;
      case "up_corner": z.doors = 2; z.hinges = 2; z.cHinges = 2; z.shelves = upShelves; break;
      case "up_open": z.shelves = 1; break;
    }
    if (d.corpus) {
      if (d.row === "upper") { z.hangers = 2; z.conf = d.corner ? 12 : 8; }
      else if (d.tall) { z.legs = 4; z.conf = 12; }
      else { z.legs = d.corner === "l" || w >= 800 ? 6 : 4; z.conf = d.corner === "l" ? 12 : 8; }
    }
    z.handles += z.doors + z.drawers;
    if (d.corner === "l") z.handles -= 1; // складной фасад открывают за одну ручку
    return z;
  }

  function hardware(p, hh, L, ct, cc) {
    const sum = {}, add = (k, v) => { sum[k] = (sum[k] || 0) + v; };
    let ties = 0, rail = 0, anchors = 0, railRuns = 0;
    const cnt = { dw: 0, sink: 0, hob: 0, oven: 0, fridgeB: 0, hood: 0, hoodBuilt: 0 };
    L.forEach((w) => {
      [w.base, w.upper].forEach((row) => {
        row.forEach((m, k) => {
          const z = partsOf(m, hh);
          Object.keys(z).forEach((key) => add(key, z[key]));
          const prev = row[k - 1];
          if (prev && def(prev).corpus && def(m).corpus && Math.abs(prev.x + prev.w - m.x) <= 2) ties += def(prev).tall && def(m).tall ? 4 : 2;
          const d = def(m);
          if (d.dw) cnt.dw++;
          if (d.sink) cnt.sink++;
          if (d.hob && m.type !== "stove") cnt.hob++;
          if (d.oven) cnt.oven++;
          if (d.fridge) cnt.fridgeB++;
          if (d.hood) { cnt.hood++; if (d.hood === "built") cnt.hoodBuilt++; }
        });
      });
      // шина под верхние: по непрерывным участкам корпусов
      let run = 0;
      const flush = () => { if (run > 0) { rail += run; anchors += Math.ceil(run / 400) + 1; railRuns++; } run = 0; };
      w.upper.forEach((m, k) => {
        const prev = w.upper[k - 1];
        if (!def(m).corpus) { flush(); return; }
        if (prev && def(prev).corpus && Math.abs(prev.x + prev.w - m.x) > 2) flush();
        run += m.w;
      });
      flush();
    });
    const buy = [];
    const B = (g, name, qty, unit = "шт") => { if (qty > 0) buy.push({ g, name, qty, unit }); };
    const F = "Фурнитура", K = "Крепёж", S = "Столешница", Z = "Цоколь", T = "Техника и прочее";
    B(F, "Петли накладные с доводчиком", sum.hinges);
    B(F, "Петли для складного углового фасада", sum.cHinges);
    B(F, "Направляющие для ящиков, пара", sum.drawers);
    B(F, "Подъёмный механизм для фасада", sum.lifts);
    B(F, "Механизм карго (бутылочница)", sum.cargo);
    B(F, "Сушка для посуды", sum.dryer);
    B(F, "Ручки", sum.handles);
    B(F, "Полкодержатели", sum.shelves * 4);
    B(F, `Ножки регулируемые, под цоколь ${hh.plinth} мм`, sum.legs);
    B(K, "Навесы для верхних шкафов", sum.hangers);
    B(K, "Шина монтажная, планка 2 м", Math.ceil(rail / 2000));
    B(K, "Анкер или дюбель для шины 8×80", anchors);
    B(K, "Конфирматы 7×50", sum.conf);
    B(K, "Стяжки межсекционные", ties);
    B(K, "Уголок крепления пенала к стене", sum.wallFix);
    const thk = hh.thk;
    B(S, `Столешница ${ct.sheet}×${ct.D}×${thk}`, ct.sheets.length);
    const j90 = ct.joints.filter((j) => j.kind === "90").length, jEuro = ct.joints.filter((j) => j.kind === "euro").length;
    B(S, "Планка соединительная угловая 90°", j90);
    B(S, "Планка соединительная прямая", ct.splits);
    B(S, "Стяжки для евро-запила", jEuro * 3);
    B(S, "Планка торцевая", ct.freeEnds);
    const plinthLen = ct.pieces.reduce((a, x) => a + x.len, 0);
    B(S, "Плинтус для столешницы, 3 м", Math.ceil(plinthLen / 3000));
    B(S, "Уголок внутренний для плинтуса", ct.joints.length);
    B(S, "Заглушки плинтуса, пара", ct.chains);
    B(S, "Герметик санитарный (силикон)", ct.pieces.length ? 1 + Math.ceil((ct.joints.length + ct.splits + cnt.sink) / 2) : 0);
    B(S, "Скотч алюминиевый для торцов выреза", ct.cutouts.length ? 1 : 0);
    B(Z, `Цоколь h ${hh.plinth} мм, планка 4 м`, cc.bars);
    B(Z, "Уголок цоколя внутренний 90°", cc.corners);
    B(Z, "Соединитель цоколя прямой", cc.joins);
    B(Z, "Заглушка цоколя торцевая", cc.ends);
    B(Z, "Клипсы цоколя", Math.round(sum.legs / 2));
    B(Z, "Решётка вентиляционная в цоколь", cnt.fridgeB);
    B(T, "Пароизоляционная лента для ПММ", cnt.dw);
    B(T, "Гофра воздуховода и хомуты, комплект", cnt.hood && (p.utils || []).some((u) => u.kind === "vent") ? cnt.hood : 0);
    return { buy, sum, cnt, rail, ties, anchors, railRuns, plinthLen };
  }

  /* ========== СМЕТА ========== */

  function works(p, L, ct, cc, hw) {
    const q = {};
    const add = (k, v) => { q[k] = (q[k] || 0) + v; };
    L.forEach((w) => [w.base, w.upper].forEach((row) => row.forEach((m) => {
      const d = def(m);
      if (!d.corpus) { if (d.filler) add("filler", 1); return; }
      if (d.corner) add("corner", 1);
      else if (d.tall) add("tall", 1);
      else if (d.row === "upper") add("upper", 1);
      else add("base", 1);
    })));
    add("drawer", hw.sum.drawers || 0);
    add("lift", hw.sum.lifts || 0);
    add("counter", Math.round(ct.len / 100) / 10);
    add("joint90", ct.joints.filter((j) => j.kind === "90").length + ct.splits);
    add("euro", ct.joints.filter((j) => j.kind === "euro").length);
    add("cutSink", ct.cutouts.filter((x) => x.kind === "sink").length);
    add("cutHob", ct.cutouts.filter((x) => x.kind === "hob").length);
    add("sinkInst", hw.cnt.sink);
    add("hobInst", hw.cnt.hob);
    add("oven", hw.cnt.oven);
    add("dw", hw.cnt.dw);
    add("fridgeB", hw.cnt.fridgeB);
    add("hood", hw.cnt.hood);
    add("duct", hw.cnt.hood && (p.utils || []).some((u) => u.kind === "vent") ? 1 : 0);
    add("plinth", Math.round(hw.plinthLen / 100) / 10);
    add("cocol", Math.round(cc.total / 100) / 10);
    add("handles", hw.sum.handles || 0);
    add("trip", 1);
    add("trash", 1);
    return WORKS.map(([k, t, unit, price]) => ({ k, t, unit, price, auto: q[k] || 0 }));
  }

  // Итог сметы: цены мастера prices[k], ручные количества fix[k] (пусто — авто).
  function estimate(rows, prices, fix) {
    const items = rows.map((r) => {
      const price = prices && prices[r.k] !== undefined && prices[r.k] !== "" ? Number(prices[r.k]) : r.price;
      const qty = fix && fix[r.k] !== undefined && fix[r.k] !== "" ? Number(fix[r.k]) : r.auto;
      return Object.assign({}, r, { price, qty, sum: Math.round(price * qty) });
    });
    return { items, total: items.reduce((a, x) => a + x.sum, 0) };
  }

  /* ========== ПЛАН ========== */

  // Координаты плана в мм: стена A — верх слева направо, B — правая сверху вниз, C — низ справа налево.
  function roomSize(p) {
    const w = activeWalls(p);
    return { w: Number(w[0].len) || 0, h: w.length > 1 ? Number(w[1].len) || 0 : Number(p.depth) || 2500 };
  }
  function wallToPlan(p, wallId, off, d = 0) {
    const R = roomSize(p);
    if (wallId === "B") return { x: R.w - d, y: off };
    if (wallId === "C") return { x: R.w - off, y: R.h - d };
    return { x: off, y: d };
  }
  function planToWall(p, x, y) {
    const R = roomSize(p), ws = activeWalls(p);
    const cl = (v, a, b) => Math.max(a, Math.min(b, v));
    const cands = ws.map((w) => {
      const len = Number(w.len) || 0;
      let off, px, py;
      if (w.id === "B") { off = cl(y, 0, len); px = R.w; py = off; }
      else if (w.id === "C") { off = cl(R.w - x, 0, len); px = R.w - off; py = R.h; }
      else { off = cl(x, 0, len); px = off; py = 0; }
      return { wall: w.id, x: Math.round(off / 10) * 10, d: Math.hypot(x - px, y - py) };
    });
    return cands.sort((a, b) => a.d - b.d)[0];
  }

  /* ========== ВСЁ ВМЕСТЕ ========== */

  function fullCalc(p) {
    const hh = heights(p);
    const L = layout(p, hh);
    const ck = checks(p, hh, L);
    const ct = counterCalc(p, hh, L);
    const cc = cocolCalc(p, hh, L, ct);
    const hw = hardware(p, hh, L, ct, cc);
    const wk = works(p, L, ct, cc, hw);
    const fills = [];
    L.forEach((w) => {
      [["нижний", w.gapsBase], ["верхний", w.gapsUp.filter((g) => g.w >= 150)]].forEach(([row, gaps]) => gaps.forEach((g) => fills.push(Object.assign({ wall: w.id, row }, g, fillSuggest(Math.round(g.w))))));
    });
    return { h: hh, walls: L, counter: ct, cocol: cc, buy: hw.buy, hw, works: wk, fills,
      warnings: hh.warnings.concat(ck.warn, ct.warn), info: ck.info };
  }

  const API = {
    STD, MODULES, ROW_TYPES, UTILS, SHAPES, HOBS, SHEETS, WORKS,
    newProject, mod, uid, counterByHeight, heights, placeRow, freeGaps, fillSuggest, layout, checks,
    pack, counterCalc, cocolCalc, partsOf, hardware, works, estimate, fullCalc,
    activeWalls, roomSize, wallToPlan, planToWall,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.KuhnyaCore = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
