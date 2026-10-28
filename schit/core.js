/* Расчётное ядро «Щит без ошибок». Медь, скрытая проводка, 230/400 В. Работает в браузере (window.ShieldCore) и в Node (тесты). */
(function (root) {
  const U1 = 230, U3 = 400, RHO = 0.0175;                 // В, В, Ом·мм²/м (медь)
  const BREAKERS = [6, 10, 13, 16, 20, 25, 32, 40, 50, 63];
  const RCDS = [25, 40, 63];
  // сечение медного кабеля → наибольший автомат, который его защищает (с запасом для скрытой проводки в пучке)
  const CABLE_MAX = [[1.5, 10], [2.5, 16], [4, 25], [6, 32], [10, 40], [16, 63]];
  const BOXES = [[12, 12], [18, 18], [24, 12], [36, 12], [48, 12], [54, 18], [72, 18], [96, 24]];   // модулей всего, модулей в ряду

  /* Шаблоны линий. rcd — нужно ли УЗО 30 мА, wet — влажная зона (своё УЗО), min — наименьшие автомат и сечение по практике */
  const PRESETS = {
    light: { t: "Освещение", p: 600, len: 20, rcd: false, minA: 10, minS: 1.5 },
    sockets: { t: "Розетки", p: 2500, len: 25, rcd: true, minA: 16, minS: 2.5 },
    kitchen: { t: "Розетки кухни", p: 3500, len: 15, rcd: true, minA: 16, minS: 2.5 },
    stove: { t: "Варочная панель", p: 7000, len: 10, rcd: true, minA: 32, minS: 6 },
    oven: { t: "Духовой шкаф", p: 3500, len: 10, rcd: true, minA: 16, minS: 2.5 },
    washer: { t: "Стиральная машина", p: 2200, len: 12, rcd: true, wet: true, minA: 16, minS: 2.5 },
    dish: { t: "Посудомоечная машина", p: 2000, len: 12, rcd: true, minA: 16, minS: 2.5 },
    boiler: { t: "Водонагреватель", p: 2000, len: 12, rcd: true, wet: true, minA: 16, minS: 2.5 },
    bath: { t: "Ванная: розетки", p: 1500, len: 12, rcd: true, wet: true, minA: 16, minS: 2.5 },
    floor: { t: "Тёплый пол", p: 1500, len: 15, rcd: true, wet: true, minA: 16, minS: 2.5 },
    ac: { t: "Кондиционер", p: 2500, len: 15, rcd: false, minA: 16, minS: 2.5 },
    heater: { t: "Котёл / насосы", p: 300, len: 10, rcd: true, minA: 10, minS: 1.5 },
    outdoor: { t: "Улица / гараж", p: 2000, len: 30, rcd: true, wet: true, minA: 16, minS: 2.5 },
    custom: { t: "Своя линия", p: 1000, len: 15, rcd: true, minA: 10, minS: 1.5 },
  };

  const up = (list, v) => list.find((x) => x >= v - 1e-9) || null;

  /* Одна линия: ток, автомат, кабель, падение напряжения */
  function line(l) {
    const pr = PRESETS[l.type] || PRESETS.custom;
    const p = Math.max(0, Number(l.p) || pr.p), len = Math.max(0, Number(l.len) || pr.len);
    const I = p / U1;
    const warnings = [];
    let A = up(BREAKERS, Math.max(I, pr.minA));
    if (!A) { A = 63; warnings.push("Нагрузка больше 63 А на одну фазу: нужна трёхфазная линия."); }
    const drop = (S) => (200 * len * I * RHO) / (S * U1);             // %, две жилы
    const userS = Number(l.S) || 0;
    if (userS) {                                                     // сечение задал пользователь: автомат подбираем под кабель
      const row = CABLE_MAX.find(([s]) => s >= userS - 1e-9) || CABLE_MAX[CABLE_MAX.length - 1];
      const maxA = row[1];
      if (A > maxA) {
        warnings.push(`Кабель ${fmtS(userS)} держит автомат не больше ${maxA} А, а нагрузке нужно ${A} А. Возьмите кабель толще или разделите нагрузку на две линии.`);
        A = maxA;
      }
      if (drop(userS) > 3) warnings.push(`На ${len} м кабель ${fmtS(userS)} даёт падение напряжения ${drop(userS).toFixed(1).replace(".", ",")} % — больше 3 %. Лучше взять толще.`);
      return { id: l.id, type: l.type, name: l.name || pr.t, room: l.room, p, len, I, A, S: userS, drop: drop(userS), rcd: l.rcd != null ? !!l.rcd : pr.rcd, wet: !!pr.wet, warnings, userS: true };
    }
    let si = CABLE_MAX.findIndex(([s, max]) => s >= pr.minS && max >= A);
    if (si < 0) si = CABLE_MAX.length - 1;
    const sByA = CABLE_MAX[si][0];
    while (drop(CABLE_MAX[si][0]) > 3 && si < CABLE_MAX.length - 1) si++;
    const S = CABLE_MAX[si][0];
    if (S > sByA) warnings.push(`Длинная линия: кабель взят ${fmtS(S)} вместо ${fmtS(sByA)}, чтобы напряжение не просело больше 3 %.`);
    if (drop(S) > 5) warnings.push("Падение напряжения больше 5 %: сократите длину или вынесите нагрузку в отдельный щиток.");
    return { id: l.id, type: l.type, name: l.name || pr.t, room: l.room, p, len, I, A, S, drop: drop(S), rcd: l.rcd != null ? !!l.rcd : pr.rcd, wet: !!pr.wet, warnings };
  }
  const fmtS = (s) => String(s).replace(".", ",") + " мм²";

  /* Раскладка по фазам: самые мощные линии по очереди на наименее загруженную фазу */
  function balance(lines, phases) {
    const load = [0, 0, 0];
    const ph = {};
    if (phases !== 3) { lines.forEach((l) => { ph[l.id] = 1; load[0] += l.p; }); return { ph, load }; }
    [...lines].sort((a, b) => b.p - a.p).forEach((l) => {
      const k = load.indexOf(Math.min(...load));
      ph[l.id] = k + 1; load[k] += l.p;
    });
    return { ph, load };
  }

  /* Весь щит: линии, УЗО, ввод, модули, бокс, закупка */
  function shield(o) {
    const phases = o.phases === 3 ? 3 : 1;
    const house = o.kind === "house";
    const lines = (o.lines || []).map(line);
    const { ph, load } = balance(lines, phases);
    lines.forEach((l) => { l.phase = ph[l.id]; });
    const warnings = [];
    const power = Number(o.power) || (phases === 3 ? 15 : 7);   // кВт, выделенная мощность
    const inI = phases === 3 ? (power * 1000) / (Math.sqrt(3) * U3) : (power * 1000) / U1;
    const inA = up(BREAKERS, inI) || 63;
    if (inI > 63) warnings.push(`${power} кВт на ${phases === 3 ? "три фазы" : "одну фазу"} — больше 63 А. ${phases === 3 ? "Нужен ввод через трансформаторы тока, это проект энергосети." : "Для такой мощности нужен трёхфазный ввод."}`);
    const total = lines.reduce((a, l) => a + l.p, 0);
    const ks = lines.length > 8 ? 0.45 : lines.length > 4 ? 0.55 : 0.8;   // одновременность для жилья
    const calc = (total * ks) / 1000;
    if (calc > power) warnings.push(`Расчётная нагрузка ${calc.toFixed(1).replace(".", ",")} кВт больше выделенной ${power} кВт: вводной автомат может отключаться, когда всё включено сразу.`);
    if (phases === 3) {
      const mx = Math.max(...load), mn = Math.min(...load);
      if (mx > 0 && (mx - mn) / mx > 0.3) warnings.push("Фазы нагружены неравномерно больше чем на 30 %: перенесите мощные линии вручную.");
    }

    // группы УЗО: отдельно по фазам, влажные зоны отдельно, не больше 4 линий и 63 А на одно УЗО
    const groups = [];
    const mode = o.rcdMode === "diff" ? "diff" : "rcd";
    if (mode === "rcd") {
      for (let f = 1; f <= phases; f++) {
        for (const wet of [true, false]) {
          let cur = null;
          lines.filter((l) => l.rcd && l.phase === f && l.wet === wet).forEach((l) => {
            const need = (cur ? cur.load + l.I : l.I) * 0.8;
            if (!cur || cur.lines.length >= 4 || need > 40) { cur = { phase: f, wet, lines: [], load: 0 }; groups.push(cur); }
            cur.lines.push(l); cur.load += l.I;
          });
        }
      }
      groups.forEach((g) => { g.A = up(RCDS, Math.max(g.load * 0.8, ...g.lines.map((l) => l.A))) || 63; });
    }

    // порядок модулей: ввод, защита, группы УЗО со своими автоматами, линии без УЗО
    const mods = [];
    const add = (kind, w, label, extra = {}) => mods.push(Object.assign({ kind, w, label }, extra));
    add("in", phases === 3 ? 3 : 2, `Ввод ${phases === 3 ? "3P" : "2P"} ${inA} А`, { A: inA });
    if (o.meter) add("meter", phases === 3 ? 7 : 6, "Счётчик");
    if (o.spd) add("spd", phases === 3 ? 4 : 2, "УЗИП");
    if (o.relay !== false) for (let f = 0; f < phases; f++) add("relay", 2, phases === 3 ? `Реле напр. L${f + 1}` : "Реле напряжения");
    if (house && o.fireRcd !== false) add("fire", phases === 3 ? 4 : 2, `УЗО ${up(RCDS, inA) || 63} А 100 мА`, { A: up(RCDS, inA) || 63 });
    let n = 0;
    if (mode === "rcd") {
      groups.forEach((g, gi) => {
        add("rcd", 2, `УЗО ${g.A} А 30 мА`, { A: g.A, group: gi + 1, phase: g.phase });
        g.lines.forEach((l) => add("br", 1, l.name, { A: l.A, n: ++n, phase: l.phase, line: l }));
      });
      lines.filter((l) => !l.rcd).forEach((l) => add("br", 1, l.name, { A: l.A, n: ++n, phase: l.phase, line: l }));
    } else {
      lines.forEach((l) => add(l.rcd ? "diff" : "br", l.rcd ? 2 : 1, l.name, { A: l.A, n: ++n, phase: l.phase, line: l }));
    }
    const used = mods.reduce((a, m) => a + m.w, 0);
    const need = Math.ceil(used * 1.2);
    const box = BOXES.find(([t]) => t >= need) || BOXES[BOXES.length - 1];
    if (need > box[0]) warnings.push("Модулей больше, чем в самом большом боксе: нужен второй щит.");
    // раскладка по рядам: модуль не разрывается между рядами
    const rows = [[]];
    let fill = 0;
    mods.forEach((m) => {
      if (fill + m.w > box[1]) { rows.push([]); fill = 0; }
      rows[rows.length - 1].push(m); fill += m.w;
    });

    // закупка
    const buy = [];
    const cnt = (arr, key) => arr.reduce((a, x) => ((a[key(x)] = (a[key(x)] || 0) + 1), a), {});
    buy.push({ g: "Ввод и защита", name: `Автомат вводной ${phases === 3 ? "3P" : "2P"} C${inA}`, qty: 1, unit: "шт." });
    if (o.relay !== false) buy.push({ g: "Ввод и защита", name: `Реле напряжения ${Math.max(inA, 40)} А`, qty: phases, unit: "шт." });
    if (o.spd) buy.push({ g: "Ввод и защита", name: `УЗИП ${phases === 3 ? "4P" : "2P"} класс II`, qty: 1, unit: "шт." });
    if (house && o.fireRcd !== false) buy.push({ g: "Ввод и защита", name: `УЗО противопожарное ${phases === 3 ? "4P" : "2P"} ${up(RCDS, inA) || 63} А 100 мА`, qty: 1, unit: "шт." });
    if (mode === "rcd") Object.entries(cnt(groups, (g) => g.A)).forEach(([A, q]) => buy.push({ g: "УЗО и автоматы", name: `УЗО 2P ${A} А 30 мА тип A`, qty: q, unit: "шт." }));
    const brs = lines.filter((l) => mode === "rcd" || !l.rcd);
    Object.entries(cnt(brs, (l) => l.A)).sort((a, b) => a[0] - b[0]).forEach(([A, q]) => buy.push({ g: "УЗО и автоматы", name: `Автомат 1P C${A}`, qty: q, unit: "шт." }));
    if (mode === "diff") Object.entries(cnt(lines.filter((l) => l.rcd), (l) => l.A)).sort((a, b) => a[0] - b[0])
      .forEach(([A, q]) => buy.push({ g: "УЗО и автоматы", name: `Дифавтомат 1P+N C${A} 30 мА тип A`, qty: q, unit: "шт." }));
    const cable = {};
    lines.forEach((l) => { cable[l.S] = (cable[l.S] || 0) + l.len * 1.1 + 1.5; });   // +10 % и по 0,75 м на разделку с двух концов
    Object.keys(cable).map(Number).sort((a, b) => a - b).forEach((S) =>
      buy.push({ g: "Кабель", name: `ВВГнг(А)-LS 3×${String(S).replace(".", ",")}`, qty: Math.ceil(cable[S] / 5) * 5, unit: "м" }));
    buy.push({ g: "Щит", name: `Бокс на ${box[0]} модулей (${Math.ceil(box[0] / box[1])} ряда по ${box[1]})`, qty: 1, unit: "шт." });
    buy.push({ g: "Щит", name: `Шина нулевая N на ${up([6, 8, 12, 14, 16, 20, 24], lines.length + 2) || lines.length + 2} отверстий`, qty: phases === 3 && lines.length > 12 ? 2 : 1, unit: "шт." });
    if (mode === "rcd" && groups.length) {
      const holes = up([4, 6, 8, 12], Math.max(...groups.map((g) => g.lines.length)) + 1) || 12;
      buy.push({ g: "Щит", name: `Шина нулевая N на ${holes} отверстий — своя на каждое УЗО`, qty: groups.length, unit: "шт." });
    }
    buy.push({ g: "Щит", name: `Шина PE на ${up([6, 8, 12, 14, 16, 20, 24], lines.length + 2) || lines.length + 2} отверстий`, qty: 1, unit: "шт." });
    buy.push({ g: "Щит", name: "Шина гребёнчатая 1P на 12 модулей", qty: rows.length, unit: "шт." });
    buy.push({ g: "Щит", name: "Наконечники НШВИ, маркировка проводов", qty: 1, unit: "компл." });

    return { phases, house, power, inA, inI, total, ks, calc, load, lines, groups, mods, used, need, box: { modules: box[0], perRow: box[1] }, rows, buy, warnings, mode };
  }

  /* ---------- простой режим: комнаты и приборы → линии ---------- */
  // прибор: шаблон линии, средняя мощность и добавка к длине по комнате (от входа в комнату до точки), м
  const APPL = {
    light: { t: "Свет", preset: "light", p: 200, add: 8 },
    sockets: { t: "Розетки", preset: "sockets", p: 2000, add: 12 },
    ksockets: { t: "Розетки у столешницы", preset: "kitchen", p: 3500, add: 6 },
    stove: { t: "Варочная панель", preset: "stove", p: 7000, add: 3 },
    oven: { t: "Духовой шкаф", preset: "oven", p: 3500, add: 3 },
    dish: { t: "Посудомоечная машина", preset: "dish", p: 2000, add: 3 },
    washer: { t: "Стиральная машина", preset: "washer", p: 2200, add: 3 },
    bsockets: { t: "Розетки", preset: "bath", p: 1500, add: 4 },
    boiler: { t: "Водонагреватель", preset: "boiler", p: 2000, add: 3 },
    floor: { t: "Тёплый пол", preset: "floor", p: 1500, add: 4 },
    ac: { t: "Кондиционер", preset: "ac", p: 2500, add: 4 },
    heater: { t: "Котёл / насосы", preset: "heater", p: 300, add: 3 },
    outdoor: { t: "Розетки", preset: "outdoor", p: 2000, add: 10 },
  };
  // тип комнаты: что включено по умолчанию и что можно добавить
  const ROOMS = {
    room: { t: "Комната", on: ["light", "sockets"], opt: ["ac", "floor"] },
    kitchen: { t: "Кухня", on: ["light", "ksockets", "stove", "oven", "dish"], opt: ["sockets", "ac", "floor"] },
    bath: { t: "Ванная", on: ["light", "bsockets", "washer"], opt: ["boiler", "floor"] },
    hall: { t: "Коридор", on: ["light", "sockets"], opt: [] },
    outdoor: { t: "Улица / гараж", on: ["light", "outdoor"], opt: ["heater"] },
    boilerRoom: { t: "Котельная", on: ["light", "heater"], opt: ["boiler", "sockets"] },
  };
  function newRoom(type, name, id) {
    const r = ROOMS[type] || ROOMS.room;
    const items = {};
    r.on.forEach((k) => { items[k] = { on: true }; });
    r.opt.forEach((k) => { items[k] = { on: false }; });
    return { id: id || type + Math.random().toString(36).slice(2, 7), type, name: name || r.t, dist: 10, items };
  }
  /* Свет — по 2–3 комнаты на линию (до 1,5 кВт), остальное — своя линия на каждый прибор */
  function fromRooms(rooms) {
    const lines = [];
    let cur = null, n = 0;
    (rooms || []).forEach((rm) => {
      const it = rm.items || {};
      const dist = Math.max(1, Number(rm.dist) || 10);
      if (it.light && it.light.on) {
        const p = Number(it.light.p) || APPL.light.p;
        if (!cur || cur.rooms.length >= 3 || cur.p + p > 1500 || (Number(it.light.S) || 0) !== cur.S) {
          cur = { id: "light-" + (++n), type: "light", rooms: [], p: 0, len: 0, S: Number(it.light.S) || 0 };
          lines.push(cur);
        }
        cur.rooms.push(rm.name); cur.p += p; cur.len = Math.max(cur.len, dist + APPL.light.add) + (cur.rooms.length > 1 ? 4 : 0);
      }
      Object.keys(APPL).filter((k) => k !== "light" && it[k] && it[k].on).forEach((k) => {
        const a = APPL[k];
        lines.push({ id: rm.id + ":" + k, type: a.preset, room: rm.name, name: `${a.t} · ${rm.name}`,
          p: Number(it[k].p) || a.p, len: dist + a.add, S: Number(it[k].S) || 0 });
      });
    });
    return lines.map((l) => (l.type === "light" ? { id: l.id, type: "light", name: "Свет · " + l.rooms.join(", "), p: l.p, len: l.len, S: l.S } : l));
  }

  /* ---------- план дома ---------- */
  // Координаты в метрах, шаг 0,1. rect = { x, y, w, h }; p.plan = { on, shield: { x, y } }.
  const r1 = (v) => Math.round(v * 10) / 10;
  const AREA = { room: 16, kitchen: 10, bath: 5, hall: 6, outdoor: 20, boilerRoom: 6 };

  // Раскладывает рядами комнаты без прямоугольника, нарисованные не трогает.
  function autoLayout(rooms) {
    const placed = rooms.filter((r) => r.rect), todo = rooms.filter((r) => !r.rect);
    if (!todo.length) return rooms;
    let y = placed.length ? Math.max(...placed.map((r) => r.rect.y + r.rect.h)) + 0.5 : 0;
    const total = todo.reduce((a, r) => a + (AREA[r.type] || 12), 0);
    const rowW = Math.max(6, Math.sqrt(total) * 1.6);
    let x = 0, rowH = 0;
    todo.forEach((r) => {
      const area = AREA[r.type] || 12;
      const w = r1(Math.max(1.2, Math.sqrt(area * 1.3))), h = r1(Math.max(1.2, area / w));
      if (x > 0 && x + w > rowW) { x = 0; y = r1(y + rowH); rowH = 0; }
      r.rect = { x: r1(x), y: r1(y), w, h };
      x += w; rowH = Math.max(rowH, h);
    });
    return rooms;
  }
  // Трасса кабеля по стенам: от щита по горизонтали, потом по вертикали до ближайшей точки комнаты.
  function routePath(rect, from) {
    const e = { x: Math.min(Math.max(from.x, rect.x), rect.x + rect.w), y: Math.min(Math.max(from.y, rect.y), rect.y + rect.h) };
    return [{ x: from.x, y: from.y }, { x: e.x, y: from.y }, e];
  }
  // До комнаты: путь по трассе + 1 м подъёма от щита к потолку. Разводку внутри комнаты учитывает APPL.add.
  function cableDist(rect, from) {
    const p = routePath(rect, from);
    const len = Math.abs(p[1].x - p[0].x) + Math.abs(p[2].y - p[1].y);
    return Math.max(1, Math.round((len + 1) * 2) / 2);
  }
  // Комнаты с длинами до щита из плана; проект не меняет.
  function applyPlan(p) {
    const plan = p.plan;
    if (!plan || !plan.on || !plan.shield) return p.rooms || [];
    return (p.rooms || []).map((rm) => (rm.rect ? Object.assign({}, rm, { dist: cableDist(rm.rect, plan.shield) }) : rm));
  }
  // Помещения, распознанные по фото (типы сантехнические, общие для ботов), → комнаты электрики.
  function roomsFromRecognized(list) {
    const map = { bathroom: "bath", shower: "bath", laundry: "bath", toilet: "hall", kitchen: "kitchen", boiler: "boilerRoom" };
    return (list || []).filter((r) => r && r.w > 0 && r.h > 0).map((r) => {
      const name = String(r.name || "").slice(0, 40);
      const type = map[r.type] || (/коридор|прихож|холл|тамбур|кладов|гардероб/i.test(name) ? "hall" : "room");
      const rm = newRoom(type, name || ROOMS[type].t);
      rm.rect = { x: r1(Math.max(0, r.x || 0)), y: r1(Math.max(0, r.y || 0)), w: r1(Math.min(30, r.w)), h: r1(Math.min(30, r.h)) };
      return rm;
    });
  }

  const api = { line, balance, shield, fromRooms, newRoom, ROOMS, APPL, PRESETS, BREAKERS, CABLE_MAX,
    autoLayout, routePath, cableDist, applyPlan, roomsFromRecognized };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ShieldCore = api;
})(typeof window !== "undefined" ? window : globalThis);
