/* Расчётное ядро «Сантехник PRO». Водоснабжение + отопление. Работает в браузере и в Node. */
(function (root) {

  /* ========== СПРАВОЧНИКИ ========== */

  // Трубы: материал → [наружный Ø мм, стенка мм, внутр. Ø мм, Ц за м ₽ (ориентир), макс °C]
  const PIPES = {
    ppr20: { t: "ППР 20", d: 20, s: 2.8, di: 14.4, maxT: 95, group: "ppr" },
    ppr25: { t: "ППР 25", d: 25, s: 3.5, di: 18, maxT: 95, group: "ppr" },
    ppr32: { t: "ППР 32", d: 32, s: 4.4, di: 23.2, maxT: 95, group: "ppr" },
    mpx16: { t: "МП 16", d: 16, s: 2, di: 12, maxT: 95, group: "mpx" },
    mpx20: { t: "МП 20", d: 20, s: 2, di: 16, maxT: 95, group: "mpx" },
    mpx26: { t: "МП 26", d: 26, s: 3, di: 20, maxT: 95, group: "mpx" },
    pex16: { t: "PEX 16", d: 16, s: 2, di: 12, maxT: 80, group: "pex" },
    pex20: { t: "PEX 20", d: 20, s: 2, di: 16, maxT: 80, group: "pex" },
    cu15: { t: "Медь 15", d: 15, s: 1, di: 13, maxT: 250, group: "cu" },
    cu18: { t: "Медь 18", d: 18, s: 1, di: 16, maxT: 250, group: "cu" },
    cu22: { t: "Медь 22", d: 22, s: 1, di: 20, maxT: 250, group: "cu" },
  };

  // Приборы-потребители воды: л/с, температура ГВС, одновременность
  const FIXTURES = {
    sink:      { t: "Раковина", q: 0.12, hot: true, icon: "🚰" },
    kitchen:   { t: "Мойка кухня", q: 0.15, hot: true, icon: "🍽" },
    shower:    { t: "Душ", q: 0.2, hot: true, icon: "🚿" },
    bath:      { t: "Ванна", q: 0.3, hot: true, icon: "🛁" },
    toilet:    { t: "Унитаз", q: 0.1, hot: false, icon: "🚽" },
    bidet:     { t: "Биде", q: 0.08, hot: true, icon: "🚿" },
    washer:    { t: "Стиралка", q: 0.2, hot: false, icon: "🫧" },
    dish:      { t: "Посудомойка", q: 0.1, hot: false, icon: "🍽" },
    garden:    { t: "Полив", q: 0.3, hot: false, icon: "🌱" },
  };

  // Радиаторы: тепловая мощность одной секции при ΔT 70 (90/20), Вт
  const RADIATORS = {
    al500:    { t: "Алюминий 500", qSec: 185, secW: 80 },
    al350:    { t: "Алюминий 350", qSec: 138, secW: 80 },
    bm500:    { t: "Биметалл 500", qSec: 180, secW: 80 },
    bm350:    { t: "Биметалл 350", qSec: 135, secW: 80 },
    steel22:  { t: "Стальной 22 тип", qSec: 0, panelW: 1.63 },
    floor:    { t: "Тёплый пол", qSec: 0, floorW: 80 },
  };

  // Теплопотери: Вт/м² при разных стенах и окнах (упрощённый метод)
  const HEAT_LOSS = {
    new:    { t: "Новый дом / утеплён", wm2: 60 },
    medium: { t: "Панель / кирпич", wm2: 100 },
    old:    { t: "Старый / холодный", wm2: 150 },
  };

  // Котлы
  const BOILERS = {
    gas:      { t: "Газовый", eff: 0.92 },
    gasCond:  { t: "Конденсационный газ.", eff: 1.05 },
    electric: { t: "Электрокотёл", eff: 0.99 },
    solid:    { t: "Твердотопливный", eff: 0.82 },
    pellet:   { t: "Пеллетный", eff: 0.88 },
  };

  /* ========== ВОДОСНАБЖЕНИЕ ========== */

  function waterCalc(project) {
    const fixtures = project.fixtures || [];
    const pipe = PIPES[project.pipe || "ppr20"] || PIPES.ppr20;
    const hotPipe = PIPES[project.hotPipe || project.pipe || "ppr20"] || PIPES.ppr20;
    const circ = !!project.circulation;
    const hotTemp = project.hotTemp || 55;
    const coldTemp = project.coldTemp || 10;

    const cold = [], hot = [];
    let totalQ = 0, hotQ = 0;
    fixtures.forEach((f) => {
      const fx = FIXTURES[f.type] || FIXTURES.sink;
      const q = f.q || fx.q;
      totalQ += q;
      cold.push({ name: f.name || fx.t, room: f.room || "", type: f.type, q, len: f.len || 5 });
      if (fx.hot) {
        hotQ += q;
        hot.push({ name: f.name || fx.t, room: f.room || "", type: f.type, q, len: f.hotLen || f.len || 5 });
      }
    });

    // Расчётные расходы по СП 30.13330: вероятность одновременной работы приборов при числе жильцов people.
    const people = Math.max(1, Number(project.people) || 3);
    const q0 = fixtures.length ? Math.max(...cold.map((c) => c.q)) : 0;
    const q0h = hot.length ? Math.max(...hot.map((c) => c.q)) * 0.7 : 0;
    const qTot = designQ(cold.length, people, NORM.tot, q0, totalQ);
    const qCold = designQ(cold.length, people, NORM.cold, q0 * 0.7, totalQ);
    const qHot = designQ(hot.length, people, NORM.hot, q0h, hotQ);
    const local = project.hotSource === "local";
    const simQ = local ? qTot : qCold;
    const coldPipe = pickPipe(qCold, "ppr", pipe.group);
    const hotPipeSize = pickPipe(qHot, "ppr", hotPipe.group);
    const vvodPipe = local ? pickPipe(qTot, "ppr", pipe.group) : coldPipe;

    const coldLen = cold.reduce((a, c) => a + c.len, 0);
    const hotLen = hot.reduce((a, c) => a + c.len, 0);
    const circLen = circ ? hotLen * 2 : 0;
    const circPipe = circ ? pickPipe(0.05, "ppr", hotPipe.group) : null;

    const boilerPower = Math.ceil(qHot * (hotTemp - coldTemp) * 4.186);

    const buy = [];
    buy.push({ g: "Трубы ХВС", name: coldPipe.t, qty: Math.ceil(coldLen * 1.1), unit: "м" });
    buy.push({ g: "Трубы ГВС", name: hotPipeSize.t, qty: Math.ceil(hotLen * 1.1), unit: "м" });
    if (circ && circPipe) buy.push({ g: "Циркуляция", name: circPipe.t, qty: Math.ceil(circLen * 1.1), unit: "м" });
    if (circ) buy.push({ g: "Циркуляция", name: "Насос циркуляционный 25-40", qty: 1, unit: "шт." });

    const fittings = (fixtures.length * 3) + Math.ceil(coldLen / 3);
    buy.push({ g: "Фитинги ХВС", name: `Комплект фитингов ${coldPipe.t}`, qty: fittings, unit: "шт." });
    buy.push({ g: "Фитинги ГВС", name: `Комплект фитингов ${hotPipeSize.t}`, qty: Math.ceil(fittings * 0.8), unit: "шт." });

    const warnings = [];
    if (simQ > 1.5) warnings.push("Расчётный расход больше 1,5 л/с — на вводе нужна труба больше 32 мм, проверьте с проектировщиком.");
    if (hotTemp > 65) warnings.push("Температура ГВС выше 65 °C увеличивает накипь. Рекомендуется 55-60 °C.");

    return {
      fixtures: cold, hotFixtures: hot,
      totalQ, hotQ, simQ, qTot, qCold, qHot, people, local,
      coldPipe, hotPipe: hotPipeSize, circPipe, vvodPipe,
      coldLen, hotLen, circLen,
      boilerPower, circ,
      buy, warnings,
    };
  }

  // Норма расхода на жильца в час наибольшего водопотребления, л/ч (СП 30.13330, квартиры с ваннами).
  const NORM = { tot: 15.6, cold: 5.6, hot: 10 };

  // Расчётный секундный расход q = 5·q0·α, α — по N·P (приближение таблицы Б.1 СП 30.13330).
  // Не больше, чем если бы все приборы открыли разом.
  function designQ(n, people, qHr, q0, qSum) {
    if (!n || !q0) return 0;
    const P = Math.min(1, (qHr * people) / (q0 * 3600 * n));
    const NP = n * P;
    const alpha = NP <= 0.015 ? 0.2 : 0.2 + 0.777 * Math.pow(NP - 0.015, 0.686);
    return Math.min(5 * q0 * alpha, qSum);
  }

  // Наименьшая труба группы, в которой скорость не больше 1,5 м/с (СП 30.13330).
  function pickPipe(q, defaultGroup, group) {
    const g = group || defaultGroup;
    const speed = 1.5;
    const area = q / 1000 / speed;
    const di = Math.sqrt(area * 4 / Math.PI) * 1000;
    const options = Object.values(PIPES).filter((p) => p.group === g).sort((a, b) => a.di - b.di);
    return options.find((p) => p.di >= di) || options[options.length - 1];
  }

  /* ========== ОТОПЛЕНИЕ ========== */

  function heatingCalc(project) {
    const rooms = project.rooms || [];
    const boilerType = BOILERS[project.boiler || "gas"] || BOILERS.gas;
    const radType = RADIATORS[project.radiator || "al500"] || RADIATORS.al500;
    const wallType = HEAT_LOSS[project.walls || "medium"] || HEAT_LOSS.medium;
    const tFlow = project.tFlow || 80;
    const tReturn = project.tReturn || 60;
    const tRoom = project.tRoom || 22;
    const pipe = PIPES[project.heatPipe || "ppr25"] || PIPES.ppr25;
    const floors = project.floors || 1;
    const system = project.system || "twoTube";

    const dt = ((tFlow + tReturn) / 2) - tRoom;
    const dt70 = 70;
    const kCorrect = dt / dt70;

    let totalHeat = 0;
    const roomResults = rooms.map((rm) => {
      const area = rm.area || 15;
      const qRoom = area * wallType.wm2;
      totalHeat += qRoom;

      let sections = 0, radLabel = "";
      if (radType.qSec > 0) {
        const qActual = radType.qSec * kCorrect;
        sections = Math.ceil(qRoom / qActual);
        radLabel = `${radType.t}, ${sections} секц.`;
      } else if (radType.panelW) {
        const watt = qRoom;
        const panelLen = Math.ceil(watt / (radType.panelW * kCorrect * 500 / 1000));
        sections = 1;
        radLabel = `${radType.t}, ${panelLen * 100} мм`;
      } else if (radType.floorW) {
        sections = 0;
        radLabel = `Тёплый пол ${area} м², шаг ${area > 20 ? 200 : 150} мм`;
      }

      return {
        name: rm.name || "Комната",
        area, qRoom, sections, radLabel,
        len: rm.len || 10,
      };
    });

    const boilerPower = Math.ceil(totalHeat / (boilerType.eff * 1000));
    const pumpHead = floors > 1 ? 6 : 4;
    const totalLen = roomResults.reduce((a, r) => a + r.len * (system === "twoTube" ? 2 : 1.3), 0);

    const buy = [];
    buy.push({ g: "Котёл", name: `${boilerType.t} ${boilerPower} кВт`, qty: 1, unit: "шт." });
    buy.push({ g: "Трубы", name: pipe.t, qty: Math.ceil(totalLen * 1.15), unit: "м" });
    buy.push({ g: "Насос", name: `Насос циркуляционный 25-${pumpHead * 10}`, qty: 1, unit: "шт." });
    buy.push({ g: "Расширительный бак", name: `Бак ${Math.max(6, Math.ceil(totalHeat / 5000))} л`, qty: 1, unit: "шт." });
    buy.push({ g: "Группа безопасности", name: "Манометр + клапан + воздухоотводчик", qty: 1, unit: "шт." });

    roomResults.forEach((r) => {
      if (r.radLabel) buy.push({ g: "Радиаторы", name: `${r.name}: ${r.radLabel}`, qty: 1, unit: "компл." });
    });

    const fittings = roomResults.length * 4 + Math.ceil(totalLen / 4);
    buy.push({ g: "Фитинги", name: `Комплект фитингов ${pipe.t}`, qty: fittings, unit: "шт." });
    buy.push({ g: "Запорная арматура", name: "Кран шаровый", qty: roomResults.length * 2 + 2, unit: "шт." });
    buy.push({ g: "Термоголовки", name: "Термоголовка на радиатор", qty: roomResults.length, unit: "шт." });

    const warnings = [];
    if (boilerPower > 50) warnings.push("Мощность больше 50 кВт — проверьте расчёт, возможно нужен каскад котлов.");
    if (totalHeat > 30000 && system === "oneTube") warnings.push("Однотрубная система при нагрузке больше 30 кВт: последние радиаторы будут холоднее. Рассмотрите двухтрубную.");
    if (tFlow > pipe.maxT) warnings.push(`Труба ${pipe.t} не рассчитана на ${tFlow} °C. Выберите трубу с выше допуском.`);

    return {
      rooms: roomResults, totalHeat, boilerPower, boilerType,
      pipe, system, tFlow, tReturn, tRoom, dt, kCorrect,
      totalLen, pumpHead, floors, wallType, radType,
      buy, warnings,
    };
  }

  /* ========== КОМНАТЫ — ПРОСТОЙ РЕЖИМ ========== */

  const ROOM_TYPES = {
    bathroom: { t: "Ванная", fixtures: ["bath", "sink", "toilet", "washer"], icon: "🚿" },
    shower:   { t: "Душевая", fixtures: ["shower", "sink", "toilet"], icon: "🚿" },
    toilet:   { t: "Туалет", fixtures: ["toilet", "sink"], icon: "🚽" },
    kitchen:  { t: "Кухня", fixtures: ["kitchen", "dish"], icon: "🍽" },
    laundry:  { t: "Постирочная", fixtures: ["washer", "sink"], icon: "🫧" },
    boiler:   { t: "Котельная", fixtures: [], icon: "🔥" },
    room:     { t: "Жилая комната", fixtures: [], icon: "🏠" },
    outdoor:  { t: "Улица", fixtures: ["garden"], icon: "🌱" },
  };

  function newRoom(type, name, id) {
    const rt = ROOM_TYPES[type] || ROOM_TYPES.room;
    const items = {};
    (rt.fixtures || []).forEach((k) => { items[k] = { on: true }; });
    Object.keys(FIXTURES).forEach((k) => { if (!items[k]) items[k] = { on: false }; });
    return { id: id || "r" + Math.random().toString(36).slice(2, 7), type, name: name || rt.t, area: type === "room" ? 18 : 8, dist: 10, items };
  }

  function fromRooms(rooms) {
    const fixtures = [];
    rooms.forEach((rm) => {
      Object.keys(rm.items).forEach((k) => {
        if (!rm.items[k].on) return;
        const fx = FIXTURES[k];
        if (!fx) return;
        fixtures.push({
          type: k,
          name: `${fx.t} · ${rm.name}`,
          room: rm.name,
          q: rm.items[k].q || fx.q,
          len: rm.dist || 10,
          hotLen: rm.dist || 10,
        });
      });
    });
    return fixtures;
  }

  /* ========== ПЛАН ДОМА ========== */
  // Координаты плана в метрах, шаг 0,1 м. rect = { x, y, w, h } — левый верхний угол и размеры.
  const r1 = (v) => Math.round(v * 10) / 10;

  // Раскладывает комнаты без прямоугольника рядами, не трогая уже нарисованные.
  function autoLayout(rooms) {
    const placed = rooms.filter((r) => r.rect);
    let y = placed.length ? Math.max(...placed.map((r) => r.rect.y + r.rect.h)) + (placed.length ? 0.5 : 0) : 0;
    const todo = rooms.filter((r) => !r.rect);
    if (!todo.length) return rooms;
    const total = todo.reduce((a, r) => a + (r.area || 8), 0);
    const rowW = Math.max(6, Math.sqrt(total) * 1.6);
    let x = 0, rowH = 0;
    todo.forEach((r) => {
      const area = r.area || 8;
      const w = r1(Math.max(1.2, Math.sqrt(area * 1.3)));
      const h = r1(Math.max(1.2, area / w));
      if (x > 0 && x + w > rowW) { x = 0; y = r1(y + rowH); rowH = 0; }
      r.rect = { x: r1(x), y: r1(y), w, h };
      x += w; rowH = Math.max(rowH, h);
    });
    return rooms;
  }

  // Ближайшая к стояку точка стены комнаты: туда приходит труба.
  function entryPoint(rect, riser) {
    return {
      x: Math.min(Math.max(riser.x, rect.x), rect.x + rect.w),
      y: Math.min(Math.max(riser.y, rect.y), rect.y + rect.h),
    };
  }

  // Трасса трубы по стенам: сначала по горизонтали, потом по вертикали, затем внутрь комнаты к прибору.
  function routePath(rect, riser) {
    const e = entryPoint(rect, riser);
    const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
    const inside = { x: r1(e.x + (cx - e.x) * 0.5), y: r1(e.y + (cy - e.y) * 0.5) };
    return [{ x: riser.x, y: riser.y }, { x: e.x, y: riser.y }, e, inside];
  }

  // Длина трубы от стояка до приборов комнаты: путь по трассе + подъёмы/опуски к приборам 1 м.
  function routeLen(rect, riser) {
    const p = routePath(rect, riser);
    let len = 0;
    for (let i = 1; i < p.length; i++) len += Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].y - p[i - 1].y);
    return Math.max(1, Math.round((len + 1) * 2) / 2);
  }

  // Дополняет комнаты длинами и площадями с плана, если план включён.
  function applyPlan(project) {
    const plan = project.plan;
    if (!plan || !plan.on || !plan.riser) return project.rooms || [];
    return (project.rooms || []).map((rm) => rm.rect
      ? Object.assign({}, rm, { dist: routeLen(rm.rect, plan.riser), area: r1(rm.rect.w * rm.rect.h) })
      : rm);
  }

  // Комнаты из распознанного плана (ответ бота) → комнаты проекта. Типы вне списка становятся жилыми.
  function roomsFromRecognized(list) {
    return (list || []).filter((r) => r && r.w > 0 && r.h > 0).map((r) => {
      const type = ROOM_TYPES[r.type] ? r.type : "room";
      const rm = newRoom(type, String(r.name || ROOM_TYPES[type].t).slice(0, 40));
      rm.rect = { x: r1(Math.max(0, r.x || 0)), y: r1(Math.max(0, r.y || 0)), w: r1(Math.min(30, r.w)), h: r1(Math.min(30, r.h)) };
      rm.area = r1(rm.rect.w * rm.rect.h);
      return rm;
    });
  }

  /* ========== ПОЛНЫЙ РАСЧЁТ ========== */

  // Жильцов по умолчанию: жилые комнаты + 1, но не меньше двух.
  const defaultPeople = (rooms) => Math.max(2, (rooms || []).filter((r) => r.type === "room").length + 1);

  function fullCalc(project) {
    const planRooms = applyPlan(project);
    project = Object.assign({}, project, { rooms: planRooms });
    const fixtures = project.mode === "expert"
      ? (project.fixtures || [])
      : fromRooms(project.rooms || []);

    const people = Number(project.people) || defaultPeople(project.rooms);
    const waterProject = Object.assign({}, project, { fixtures, people });
    const water = waterCalc(waterProject);

    let heating = null;
    if (project.hasHeating) {
      const heatRooms = (project.rooms || [])
        .filter((r) => r.type === "room" || r.type === "kitchen" || r.area > 0)
        .map((r) => ({ name: r.name, area: r.area || 15, len: r.dist || 10 }));
      heating = heatingCalc(Object.assign({}, project, { rooms: heatRooms }));
    }

    const buy = [...water.buy];
    if (heating) buy.push(...heating.buy);

    const warnings = [...water.warnings];
    if (heating) warnings.push(...heating.warnings);

    return { water, heating, buy, warnings };
  }

  /* ========== ЭКСПОРТ ========== */
  const API = {
    PIPES, FIXTURES, RADIATORS, HEAT_LOSS, BOILERS, ROOM_TYPES,
    waterCalc, heatingCalc, fullCalc,
    newRoom, fromRooms, pickPipe, designQ, defaultPeople,
    autoLayout, entryPoint, routePath, routeLen, applyPlan, roomsFromRecognized,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SantehCore = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
