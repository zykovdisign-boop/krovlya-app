/* Расчётное ядро «Крыша без переделок». Все размеры в миллиметрах, углы в градусах.
   Работает и в браузере (window.RoofCore), и в Node (module.exports) для тестов. */
(function (root) {
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const BOARDS = [3000, 4000, 4500, 5000, 6000];

  /* Уклон: из любой пары (угол, процент, высота при заложении) */
  function slope({ angle, percent, rise, run }) {
    let a = angle;
    if (a == null && percent != null) a = deg(Math.atan(percent / 100));
    if (a == null && rise != null && run) a = deg(Math.atan(rise / run));
    const t = Math.tan(rad(a));
    return { angle: a, percent: t * 100, tg: t, k_len: 1 / Math.cos(rad(a)), rise: run ? run * t : null };
  }

  /* Опорный запил с глубиной d поперёк доски: отвесный рез, горизонтальная площадка, длина выреза по кромке.
     Координаты доски: x вдоль нижней кромки от начала запила, y вверх. */
  function notchOf(d, angle) {
    const a = rad(angle), s = Math.sin(a), c = Math.cos(a);
    const plumb = d / c, seat = d / s, along = d / (s * c);
    return { plumb, seat, along, pts: [[0, 0], [plumb * s, d], [along, 0]] };
  }

  /* Стропило двускатной крыши.
     run — заложение (от наружной грани мауэрлата до оси конька), over — свес по горизонтали,
     h — высота доски, d — глубина запила поперёк доски (остаток над запилом h − d), plate — ширина мауэрлата */
  function rafter({ run, angle, over = 0, h = 200, d = null, plate = 150, ridgeGap = 0 }) {
    const a = rad(angle), t = Math.tan(a), c = Math.cos(a);
    if (d == null) d = Math.round(h / 4);
    const rise = run * t;
    const lenRidge = (run - ridgeGap) / c;          // от вертикали запила до конькового реза, вдоль доски
    const lenOver = over / c;
    const lenBottom = lenRidge + lenOver;
    const boardLen = lenBottom + h * t;               // габарит доски: смещение резов по высоте
    const n = notchOf(d, angle);
    const seat = n.seat;                               // горизонтальная площадка запила
    const need = boardLen + 50;
    const board = BOARDS.find((b) => b >= need) || null;
    const warnings = [];
    if (d > h / 3 + 0.5) warnings.push("Запил глубже трети доски. Уменьшите глубину или подшейте опорный брусок.");
    if (seat > plate) warnings.push(`Площадка запила ${Math.round(seat)} мм шире мауэрлата ${plate} мм. Уменьшите глубину запила.`);
    if (!board) warnings.push("Длиннее 6 м: стропило придётся сращивать у опоры (глава 7.5).");
    const geo = {
      notch: n.pts,
      eave: [[-lenOver, 0], [-lenOver + h * t, h]],
      ridge: [[lenRidge, 0], [lenRidge + h * t, h]],
    };
    return {
      angle, run, over, h, d, plate,
      rise, rest: h - d, plumb: n.plumb, along: n.along,
      lenRidge, lenOver, lenBottom, boardLen, board, seat,
      plumbAngleToEdge: 90 - angle, seatAngleToEdge: angle,
      dMax: Math.floor(h / 3), warnings, geo,
    };
  }

  /* Конец стропила у конька. Координаты доски: x вдоль нижней кромки (0 = вертикаль опорного запила), y вверх.
     type: "board" — рез по отвесу в стык коньковой доске толщиной ridgeT (0 — пара стропил встык на оси);
           "beam" — стропила лежат на коньковой доске (прогоне): нижний упор по её грани, площадка, верхний рез по оси. */
  function ridgeEnd({ run, angle, h, type = "board", beamW = 150, dr = null, ridgeT = 50, d = null, plate = 150, over = 0 }) {
    const a = rad(angle), s = Math.sin(a), c = Math.cos(a), t = Math.tan(a);
    if (type === "wall") {              // односкатная: второй запил на верхней стене (run — между отвесами запилов) и свес за ней
      const n = notchOf(d == null ? Math.round(h / 4) : d, angle);
      const xN = run / c, xT = (run + plate + over) / c;
      return { type: "wall", pts: [[xN, 0], [xN + n.pts[1][0], n.pts[1][1]], [xN + n.along, 0], [xT, 0], [xT + h * t, h]],
        full: h / c, bottomEnd: xN, topEnd: xT + h * t, notch: n, overLen: over / c, warnings: [] };
    }
    if (type === "prop") {            // стропила подпирают конёк: рез по отвесу на оси, сверху гнездо под коньковую доску на ребре
      const half = Math.max(0, Number(ridgeT) || 0) / 2;
      if (dr == null || dr === "") dr = Math.round(h / 4);
      const tAxis = run / c;
      const B0 = [tAxis, 0];
      const u = (h - dr * c - half * s) / c;               // отвес у оси: от нижней кромки до площадки гнезда
      const B1 = [tAxis + u * s, u * c];
      const B2 = [B1[0] - half * c, B1[1] + half * s];      // площадка гнезда к грани доски
      const B3 = [B2[0] + dr * s, h];                       // отвес по грани доски до верхней кромки
      const warnings = [];
      if (half * 2 < 25) warnings.push("Коньковая доска тоньше 25 мм: гнездо не получится.");
      if (u * c < h / 2) warnings.push("Гнездо под конёк слишком глубокое: у оси остаётся меньше половины доски.");
      return { type: "prop", pts: [B0, B1, B2, B3], dr, seat: half, ridgeT: half * 2, lowerFace: u, upperFace: dr, full: h / c,
        bottomEnd: tAxis, topEnd: B3[0], warnings };
    }
    if (type !== "beam") {
      const gap = type === "butt" ? 0 : Math.max(0, Number(ridgeT) || 0) / 2;
      const tCut = (run - gap) / c;
      const warnings = gap * 2 > 0 && gap * 2 < 25 ? ["Коньковая доска тоньше 25 мм: стропилам не во что упереться."] : [];
      return { type: "board", gap, ridgeT: gap * 2, pts: [[tCut, 0], [tCut + h * t, h]], full: h / c, bottomEnd: tCut, topEnd: tCut + h * t, warnings };
    }
    const half = beamW / 2;
    const minDr = half * t;                               // мельче нельзя: площадка уйдёт ниже кромки
    if (dr == null || dr === "") dr = Math.max(Math.round(h / 4), Math.ceil(minDr + 10));
    const tb = (run - half) / c;
    const B0 = [tb, 0];
    const B1 = [tb + dr * s, dr * c];                     // вверх по отвесу на глубину запила
    const B2 = [B1[0] + half * c, B1[1] - half * s];      // по горизонтали до оси конька
    const up = (h - B2[1]) / c;
    const B3 = [B2[0] + up * s, h];                       // по отвесу до верхней кромки
    const warnings = [];
    if (dr < minDr) warnings.push(`Запил в коньке мельче ${Math.ceil(minDr)} мм: площадка не ляжет на прогон.`);
    if (dr > h / 3 + 0.5) warnings.push("Запил в коньке глубже трети доски: возьмите прогон уже или стропило выше.");
    const footX = B2[0] - B2[1] * t;                      // где верхний рез, продолженный вниз, пересекает нижнюю кромку
    return { type: "beam", pts: [B0, B1, B2, B3], dr, seat: half, lowerFace: dr, upperFace: up, full: h / c,
      bottomEnd: tb, topEnd: B3[0], foot: footX - tb, warnings };
  }

  /* Смета материалов и крепежа. Все размеры в мм, на выходе — группы позиций с количеством и единицами.
     Нормы расхода — типовые для частного дома; производитель конкретного материала может требовать иначе. */
  const COVER = {
    cpc: { name: "Цементно-песчаная черепица", batten: 330, battenSec: [50, 50] },
    ceramic: { name: "Керамическая черепица", batten: 330, battenSec: [50, 50] },
    metal: { name: "Металлочерепица", batten: 350, battenSec: [32, 100] },
    prof: { name: "Профнастил", batten: 400, battenSec: [32, 100] },
    soft: { name: "Мягкая кровля", batten: 300, battenSec: [32, 100] },
    falz: { name: "Фальцевая кровля", batten: 250, battenSec: [32, 100] },
  };
  function estimate(o) {
    const { W, L, angle, over = 500, form = "gable", material = "metal", step = 600, rafters, rafterLenTotal,
      hipLenTotal = 0, ridgeType = "butt", box = "gas", insulate = false, wallH = 3000, splices = 0, pairs, geo = null, wing = false } = o;
    const a = rad(angle), cs = Math.cos(a);
    const m = (x) => x / 1000;
    const Wo = W + 2 * over, Lo = L + 2 * over;
    const hip = form === "hip";
    const area = geo ? geo.area : (m(Wo) * m(Lo)) / cs;                 // м² кровли по скатам
    const Ls = geo ? geo.Ls : m((W / 2 + over) / cs);                   // длина ската по стропилу, м
    const eave = geo ? geo.eave : hip ? 2 * m(Lo) + 2 * m(Wo) : 2 * m(Lo);   // карниз, м
    const gableEdge = geo ? geo.rake : hip ? 0 : 4 * Ls;                // фронтонные кромки, м
    const ridge = geo ? geo.ridge : hip ? Math.max(m(L - W), 0) : m(Lo);     // конёк, м
    const hips = geo ? geo.hips : m(hipLenTotal);                       // рёбра вальм, м
    const valleys = geo ? geo.valleys : 0, wallJoint = geo ? geo.wallJoint : 0;
    const complex = hip || wing || valleys > 0;
    const cov = COVER[material] || COVER.metal;
    const waste = complex ? 1.2 : 1.08;
    const ceil = Math.ceil, r2 = (x) => Math.round(x * 100) / 100, fr = (x) => String(r2(x)).replace(".", ",");
    const g = [];
    const add = (group, key, name, qty, unit, note = "") => {
      let grp = g.find((x) => x.group === group);
      if (!grp) g.push((grp = { group, items: [] }));
      grp.items.push({ key, name, qty, unit, note });
    };
    // --- пиломатериал
    const counterLen = (area / m(step)) * 1.05;
    const battenLen = (area / m(cov.batten)) * 1.1;
    add("Пиломатериал", "rafters", "Стропила (по карте раскроя)", rafters, "шт.", `${fr(m(rafterLenTotal))} пог. м`);
    add("Пиломатериал", "counter", "Контробрешётка 50×50", ceil(counterLen / 3), "шт. по 3 м", `${Math.round(counterLen)} пог. м`);
    add("Пиломатериал", "batten", `Обрешётка ${cov.battenSec[0]}×${cov.battenSec[1]}`, ceil(battenLen / 6), "шт. по 6 м", `${Math.round(battenLen)} пог. м, шаг ${cov.batten} мм`);
    add("Пиломатериал", "fascia", "Лобовая доска 25×150", ceil((eave + gableEdge) * 1.05 / 6), "шт. по 6 м", `${fr(eave + gableEdge)} пог. м`);
    add("Пиломатериал", "wind", "Ветровые связи 25×100", hip ? 4 : 2 * ceil(m(L) / 6), "шт. по 6 м");
    if (material === "soft") add("Пиломатериал", "osb", "OSB-3 12 мм, 1250×2500", ceil((area * 1.08) / 3.125), "листов", `${fr(area * 1.08)} м²`);
    // --- кровля и доборы
    if (material === "cpc" || material === "ceramic") {
      add("Кровля", "tiles", cov.name, ceil(area * 10.5 * (hip ? 1.12 : 1.05)), "шт.", "≈10 шт./м²");
      add("Кровля", "ridgeTiles", "Коньковая черепица", ceil((ridge + hips) * 2.6), "шт.", "≈2,5 шт./м");
      add("Кровля", "aero", "Аэроэлемент конька", ceil((ridge + hips) / 5), "рулон 5 м");
      add("Кровля", "clips", "Кляммеры для черепицы", ceil(area * 10.5 * 0.4), "шт.", "нижний ряд, края, конёк");
    } else if (material === "soft") {
      add("Кровля", "shingles", cov.name, ceil((area * (hip ? 1.1 : 1.05)) / 3), "уп. по 3 м²");
      add("Кровля", "underlay", "Подкладочный ковёр", ceil(((angle < 18 ? area : (eave + ridge + hips) * 1) * 1.15) / 15), "рулон 15 м²", angle < 18 ? "по всей площади" : "карниз, конёк, рёбра");
      add("Кровля", "ridgeShingles", "Коньково-карнизная черепица", ceil((ridge + hips + eave) / 12), "уп. ≈12 м");
      add("Кровля", "mastic", "Битумная мастика", ceil(area / 40), "банка 3 кг");
    } else {
      add("Кровля", "sheets", cov.name, Math.round(area * waste), "м²", `площадь скатов ${Math.round(area)} м² + подрезка`);
    }
    if (material !== "cpc" && material !== "ceramic" && material !== "soft") {
      add("Доборные элементы", "ridgeStrip", "Коньковая планка", ceil((ridge + hips) / 1.9), "шт. по 2 м");
    }
    add("Доборные элементы", "eaveStrip", "Карнизная планка", ceil(eave / 1.9), "шт. по 2 м");
    add("Доборные элементы", "drip", "Капельник", ceil(eave / 1.9), "шт. по 2 м");
    if (gableEdge > 0) add("Доборные элементы", "gableStrip", "Ветровая (торцевая) планка", ceil(gableEdge / 1.9), "шт. по 2 м");
    if (valleys > 0) {
      if (material === "soft") add("Доборные элементы", "valleyCarpet", "Ендовный ковёр", ceil((valleys * 1.1) / 10), "рулон 10 м", `${fr(valleys)} пог. м ендов`);
      else add("Доборные элементы", "valleyStrip", "Ендовная планка (нижняя и верхняя)", ceil(valleys / 1.9) * 2, "шт. по 2 м", `${fr(valleys)} пог. м ендов`);
    }
    if (wallJoint > 0) add("Доборные элементы", "wallStrip", "Планка примыкания к стене", ceil((wallJoint * 1.1) / 1.9), "шт. по 2 м");
    add("Доборные элементы", "ridgeSeal", "Вентилируемый уплотнитель конька", ceil((ridge + hips) * 1.05), "пог. м");
    // --- пирог
    add("Кровельный пирог", "membrane", "Гидроветрозащитная мембрана", ceil((area * 1.15) / 75), "рулон 75 м²", `${Math.round(area * 1.15)} м² с нахлёстами`);
    add("Кровельный пирог", "membraneTape", "Лента для мембраны", ceil(area / 60), "рулон 25 м");
    if (insulate) {
      add("Кровельный пирог", "wool", "Утеплитель 200 мм (минвата)", r2(area * 0.2 * 1.05), "м³");
      add("Кровельный пирог", "vapor", "Пароизоляция", ceil((area * 1.15) / 70), "рулон 70 м²");
      add("Кровельный пирог", "vaporTape", "Двусторонняя лента для пароизоляции", ceil(area / 40), "рулон 25 м");
    }
    // --- водосток и снег
    const gutterRuns = hip ? 1 : 2;
    const pipes = Math.max(hip ? 4 : 2, ceil(eave / 10));
    add("Водосток и снегозадержание", "gutter", "Желоб", ceil(eave / 3), "шт. по 3 м", `${fr(eave)} пог. м`);
    add("Водосток и снегозадержание", "hooks", "Крюки желоба (длинные, до покрытия)", ceil(eave / 0.6) + gutterRuns * 2, "шт.", "шаг 600 мм");
    add("Водосток и снегозадержание", "funnel", "Воронки", pipes, "шт.");
    add("Водосток и снегозадержание", "pipe", "Водосточная труба", ceil((pipes * m(wallH) * 1.1) / 3), "шт. по 3 м", `${pipes} стояка по ${m(wallH)} м`);
    add("Водосток и снегозадержание", "elbows", "Колена трубы", pipes * 3, "шт.");
    add("Водосток и снегозадержание", "pipeClamps", "Хомуты трубы", pipes * Math.max(2, ceil(m(wallH) / 1.5)), "шт.");
    if (hip) add("Водосток и снегозадержание", "corners", "Угловые элементы желоба", 4 + (valleys > 0 ? 2 : 0), "шт.");
    else add("Водосток и снегозадержание", "caps", "Заглушки желоба", valleys > 0 ? 4 : form === "shed" ? 2 : 4, "шт.");
    if (!hip && valleys > 0) add("Водосток и снегозадержание", "innerCorners", "Внутренние углы желоба", 2, "шт.");
    const snowLen = hip || geo ? eave : 2 * m(Lo);
    add("Водосток и снегозадержание", "snow", "Снегозадержатель трубчатый", ceil(snowLen / 3), "секция 3 м");
    add("Водосток и снегозадержание", "snowBr", "Кронштейны снегозадержателя", ceil(snowLen / 0.9) + 2, "шт.");
    // --- крепёж
    const perim = 2 * m(W + L);
    if (box === "timber") {
      add("Крепёж", "slide", "Скользящие опоры стропил", rafters, "шт.", "брус садится — только скользящие");
      add("Крепёж", "slideScrews", "Саморезы по дереву 6×60 для опор", rafters * 6, "шт.");
    } else if (box === "frame") {
      add("Крепёж", "angles", "Уголки усиленные 90×90 (стропило–обвязка)", rafters * 2, "шт.", "с двух сторон стропила");
      add("Крепёж", "angleScrews", "Саморезы по дереву 5×50 для уголков", rafters * 2 * 10, "шт.");
      add("Крепёж", "strap", "Перфолента для привязки к стойкам каркаса", ceil((rafters / 2) * 1.2), "пог. м", "каждое второе стропило");
    } else {
      add("Крепёж", "studs", "Шпильки М12 для мауэрлата", ceil(perim / 1.1) + 4, "шт.", "шаг 1–1,1 м + углы");
      add("Крепёж", "nuts", "Гайки М12 + широкие шайбы", ceil(perim / 1.1) + 4, "компл.");
      add("Крепёж", "hydro", "Гидроизоляция под мауэрлат (2 слоя)", ceil((perim * 2 * 1.1) / 10), "рулон 10 м");
      add("Крепёж", "angles", "Уголки усиленные 90×90 (стропило–мауэрлат)", rafters * 2, "шт.", "с двух сторон стропила");
      add("Крепёж", "angleScrews", "Саморезы по дереву 5×50 для уголков", rafters * 2 * 10, "шт.");
      add("Крепёж", "strap", "Перфолента для привязки к стене", ceil(rafters / 2) * 1.2 > 0 ? ceil((rafters / 2) * 1.2) : 0, "пог. м", "каждое второе стропило");
    }
    if (ridgeType === "beam") {
      add("Крепёж", "ridgeAngles", "Уголки стропило–прогон", rafters, "шт.");
      add("Крепёж", "ridgePlates", "Пластины на коньковый стык", pairs * 2, "шт.");
    } else {
      add("Крепёж", "ridgePlates", "Накладки на коньковый стык (фанера 18 мм или пластины)", pairs * 2, "шт.", "с двух сторон");
    }
    add("Крепёж", "ridgeScrews", "Саморезы 5×70 для конькового узла", pairs * 16, "шт.");
    if (splices > 0) add("Крепёж", "spliceScrews", "Шурупы 8×200 для косых замков", splices * 2, "шт.", `${splices} сращиваний`);
    const counterNails = ceil(counterLen / 0.3);
    const battenNails = ceil((battenLen / m(step)) * 2);
    add("Крепёж", "nailsCounter", "Гвозди ершёные 3,5×90 (контробрешётка)", r2(counterNails * 0.0068), "кг", `${counterNails} шт.`);
    add("Крепёж", "nailsBatten", "Гвозди ершёные 3,5×90 (обрешётка)", r2(battenNails * 0.0068), "кг", `${battenNails} шт.`);
    add("Крепёж", "staples", "Скобы степлера 10 мм (мембрана)", ceil((area * 4) / 1000), "уп. 1000 шт.");
    add("Крепёж", "fasciaNails", "Гвозди 3×70 для лобовой доски и связей", r2((eave + gableEdge) * 6 * 0.004 + 0.3), "кг");
    if (material === "metal" || material === "prof") {
      add("Крепёж", "roofScrews", "Кровельные саморезы 4,8×35 с шайбой", ceil(area * (material === "metal" ? 8 : 7) * 1.05), "шт.", `≈${material === "metal" ? 8 : 7} на м²`);
      add("Крепёж", "flashScrews", "Кровельные саморезы 4,8×20 для доборов", ceil((ridge + hips + eave + gableEdge) * 4), "шт.");
    } else if (material === "falz") {
      add("Крепёж", "cleats", "Кляммеры фальцевые", ceil(area * 4), "шт.", "≈4 на м²");
      add("Крепёж", "cleatScrews", "Саморезы 4,2×35 для кляммеров", ceil(area * 8), "шт.");
    } else if (material === "soft") {
      add("Крепёж", "roofNails", "Гвозди ершёные оцинкованные 3×30", r2(area * 0.08), "кг", "≈80 г на м²");
      add("Крепёж", "osbScrews", "Саморезы 3,5×35 для OSB", ceil(((area * 1.08) / 3.125) * 30), "шт.");
    } else {
      add("Крепёж", "tileScrews", "Саморезы 4,5×60 для черепицы и конька", ceil((ridge + hips) * 2.6 + area * 1.5), "шт.");
    }
    add("Крепёж", "gutterScrews", "Саморезы для крюков и кронштейнов", (ceil(eave / 0.6) + ceil(snowLen / 0.9) + 4) * 3, "шт.");
    add("Крепёж", "antiseptic", "Антисептик-огнебиозащита", ceil((m(rafterLenTotal) * 0.5 + counterLen * 0.2 + battenLen * 0.25) / 6), "л", "≈ по расходу 250 г/м²");
    return { area, Ls, eave, ridge, valleys, groups: g };
  }

  /* Шаг и число стропильных пар по длине дома */
  function spacing({ length, step = 600 }) {
    const intervals = Math.ceil(length / step - 1e-9);
    return { intervals, pairs: intervals + 1, step: length / intervals, rafters: (intervals + 1) * 2 };
  }

  /* Крыша целиком: основной объём (односкатная, двускатная со смещённым коньком, вальмовая) и пристройка к длинной стене.
     План: x вдоль дома (0..L), y поперёк (0..W), y = 0 — передняя стена. Длины в мм, в geo — в метрах. */
  function roofModel(o) {
    const { W, L, H, form = "gable", over = 0, plate = 150, step = 600 } = o;
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const atanDeg = (rise, run) => deg(Math.atan(rise / run));
    const m = (x) => x / 1000;
    const warnings = [];
    const sp = spacing({ length: L, step });
    const xs = [];
    for (let i = 0; i <= sp.intervals; i++) xs.push(i * sp.step);
    const lim = Math.max(0, W / 2 - 500);
    const shift = form === "gable" ? clamp(Number(o.shift) || 0, -lim, lim) : 0;
    const slopes = [];
    if (form === "shed") {
      const run = W - plate;
      slopes.push({ key: "main", label: "Стропила", run, angle: atanDeg(H, run), end: "wall", side: "front", n: sp.pairs });
    } else if (form === "hip") {
      slopes.push({ key: "main", label: "Стропила", run: W / 2, angle: atanDeg(H, W / 2), end: "ridge", side: "both", n: sp.rafters });
    } else if (Math.abs(shift) < 1) {
      slopes.push({ key: "main", label: "Стропила", run: W / 2, angle: atanDeg(H, W / 2), end: "ridge", side: "both", n: sp.rafters });
    } else {
      slopes.push({ key: "front", label: "Скат 1 (перед)", run: W / 2 + shift, angle: atanDeg(H, W / 2 + shift), end: "ridge", side: "front", n: sp.pairs });
      slopes.push({ key: "back", label: "Скат 2 (зад)", run: W / 2 - shift, angle: atanDeg(H, W / 2 - shift), end: "ridge", side: "back", n: sp.pairs });
    }
    const slopeOn = (side) => slopes.find((s) => s.side === side || s.side === "both");
    const Wo = W + 2 * over, Lo = L + 2 * over;
    const geo = { area: 0, eave: 0, rake: 0, ridge: 0, hips: 0, valleys: 0, wallJoint: 0, Ls: 0 };
    if (form === "shed") {
      const a = slopes[0].angle, c = Math.cos(rad(a));
      geo.area = (m(Wo) * m(Lo)) / c; geo.eave = m(Lo); geo.rake = 2 * m(Wo / c) + m(Lo); geo.Ls = m(Wo / c);
    } else if (form === "hip") {
      const a = slopes[0].angle, c = Math.cos(rad(a));
      geo.area = (m(Wo) * m(Lo)) / c; geo.eave = 2 * m(Lo) + 2 * m(Wo); geo.ridge = Math.max(m(L - W), 0);
      geo.hips = 4 * m(hip({ run: W / 2, angle: a, over, step: sp.step }).hipWithOver); geo.Ls = m((W / 2 + over) / c);
    } else {
      const f = slopeOn("front"), b = slopeOn("back");
      const lf = (f.run + over) / Math.cos(rad(f.angle)), lb = (b.run + over) / Math.cos(rad(b.angle));
      geo.area = m(Lo) * (m(lf) + m(lb)); geo.eave = 2 * m(Lo); geo.rake = 2 * (m(lf) + m(lb)); geo.ridge = m(Lo); geo.Ls = m(Math.max(lf, lb));
    }
    // пристройка к длинной стене: свой конёк поперёк дома, ендовы на стыке со скатом
    let wing = null;
    const ex = { mainShort: [], valley: null, valleyJacks: [], wingHip: null, wingCommon: 0 };
    if (o.wing && o.wing.on && form !== "shed") {
      const wg = o.wing, side = wg.side === "back" ? "back" : "front";
      const ms = slopeOn(side);
      const w = clamp(Number(wg.w) || 3000, 1000, L), depth = clamp(Number(wg.depth) || 2000, 600, 12000);
      const xc = clamp(L / 2 + (Number(wg.pos) || 0), w / 2, L - w / 2);
      const kind = ["gable", "hip", "shed"].includes(wg.form) ? wg.form : "gable";
      const a = kind === "shed" ? clamp(Number(wg.angle) || 20, 5, 45) : ms.angle;
      const c = Math.cos(rad(a)), rw = w / 2;
      wing = { side, w, depth, xc, x1: xc - w / 2, x2: xc + w / 2, form: kind, angle: a, rw, mainRun: ms.run, mainAngle: ms.angle,
        rise: kind === "shed" ? depth * Math.tan(rad(a)) : rw * Math.tan(rad(a)) };
      if (kind === "shed") {
        const wsp = spacing({ length: w, step });
        slopes.push({ key: "wing", label: "Пристройка (навес)", run: depth, angle: a, end: "ledger", side, n: wsp.pairs, wing: true });
        geo.area += m(w + 2 * over) * m((depth + over) / c);
        geo.eave += m(w + 2 * over); geo.rake += 2 * m((depth + over) / c); geo.wallJoint += m(w);
      } else {
        if (rw > ms.run - 100) warnings.push("Пристройка шире основного ската: её конёк окажется выше основного. Уменьшите ширину пристройки.");
        const hipEnd = kind === "hip" && depth > rw;
        const fullLen = hipEnd ? depth - rw : depth;            // где у пристройки целые пары стропил
        const nFull = Math.max(0, Math.ceil(fullLen / step - 1e-9));
        slopes.push({ key: "wing", label: "Пристройка", run: rw, angle: a, end: "ridge", side, n: nFull * 2 + (hipEnd ? 1 : 0), wing: true });
        const v = hip({ run: rw, angle: a, over, step });
        ex.valley = { n: 2, len: v.hipWithOver, angle: v.hipAngle };
        ex.valleyJacks = v.jacks.map((j) => ({ n: 4, len: j.len }));
        const mc = Math.cos(rad(ms.angle));
        const inside = xs.filter((x) => x > wing.x1 + 1 && x < wing.x2 - 1);
        const byLen = {};
        inside.forEach((x) => { const e = Math.min(x - wing.x1, wing.x2 - x); const len = Math.round((ms.run - e) / mc); byLen[len] = (byLen[len] || 0) + 1; });
        ex.mainShort = Object.keys(byLen).map(Number).sort((p, q) => q - p).map((len) => ({ len, n: byLen[len] }));
        slopes.forEach((s) => { if (!s.wing && (s.side === side || s.side === "both")) s.n -= inside.length; });
        const wAreaPlan = m(w + 2 * over) * m(depth + over) - m(w) * m(over);
        geo.area += wAreaPlan / c;
        geo.valleys += 2 * m(v.hipWithOver);
        geo.eave += 2 * m(depth) - m(w);
        if (hipEnd) {
          const he = hip({ run: rw, angle: a, over, step });
          ex.wingHip = { hips: 2, len: he.hipWithOver, jacks: he.jacks.map((j) => ({ n: 4, len: j.withOver })) };
          geo.hips += 2 * m(he.hipWithOver); geo.eave += m(w + 2 * over); geo.ridge += m(depth);
        } else {
          geo.rake += 2 * m((rw + over) / c); geo.ridge += m(depth + over + rw);
        }
      }
    }
    return { W, L, H, form, over, shift, ridgeY: W / 2 + shift, sp, xs, slopes, wing, ex, geo, warnings };
  }

  /* Вальма под 45° в плане */
  function hip({ run, angle, over = 0, step = 600 }) {
    const t = Math.tan(rad(angle)), c = Math.cos(rad(angle));
    const rise = run * t;
    const planLen = run * Math.SQRT2;
    const hipLen = Math.hypot(planLen, rise);
    const hipOver = Math.hypot(over * Math.SQRT2, over * t);
    const hipAngle = deg(Math.atan(rise / planLen));
    const jacks = [];
    for (let i = 1; run - i * step > 50; i++) {
      jacks.push({ n: i, len: (run - i * step) / c, withOver: (run - i * step + over) / c });
    }
    return { rise, hipLen, hipWithOver: hipLen + hipOver, hipAngle, decrement: step / c, jacks };
  }

  /* Подбор сечения: изгиб + прогиб. Методика как в книге (глава 7). */
  const SECTIONS = [[50, 100], [50, 150], [50, 200], [50, 250], [75, 200], [100, 200], [75, 250], [100, 250]];
  const R = 13e6, E = 10e9;
  function checkSection(b, h, qDesign, l, lim) {
    b /= 1000; h /= 1000;
    const W = (b * h * h) / 6, I = (b * h ** 3) / 12;
    const M = (qDesign * l * l) / 8;
    const f = (5 * (qDesign / 1.4) * l ** 4) / (384 * E * I);
    return { sigma: M / W, f, okStrength: M / W <= R, okDeflection: f <= l / lim, util: Math.max((M / W) / R, f / (l / lim)) };
  }
  function pickSection(qDesign, l, lim, minH = 0) {
    const sorted = SECTIONS.filter((x) => x[1] >= minH).sort((x, y) => x[0] * x[1] - y[0] * y[1]);
    for (const [b, h] of sorted) {
      const r = checkSection(b, h, qDesign, l, lim);
      if (r.okStrength && r.okDeflection) return { b, h, label: `${b}×${h}`, util: r.util };
    }
    return null;
  }
  /* span — пролёт по горизонтали, мм; step — шаг, мм; roof — вес кровли с пирогом, кг/м²; snow — кг/м² */
  function rafterSection({ span, step = 600, roof = 50, snow = 180, angle = 35 }) {
    const l = span / 1000;
    const q = (roof / Math.cos(rad(angle)) + snow) * 9.81 * (step / 1000);
    const res = pickSection(q, l, 200, 150);          // тоньше 50×150 стропила не делаем (книга, глава 7)
    const half = pickSection(q, l / 2, 200, 150);
    return { section: res, withStrut: half, q };
  }
  function beamSection({ span, step = 600, load = 400 }) {
    const q = load * 9.81 * (step / 1000);
    return { section: pickSection(q, span / 1000, 250), q };
  }

  /* Контур кондуктора опорного запила в мм (координаты доски), для печати 1:1 */
  function jigOutline({ angle, h, d, len = 600, lip = 25 }) {
    const a = rad(angle);
    const back = 120;                       // заход шаблона за запил в сторону свеса
    const n = notchOf(d, angle);
    return {
      body: [[-back, 0], ...n.pts, [len, 0], [len, h + lip], [-back, h + lip]],
      edgeTop: [[-back, h], [len, h]],      // линия кромки доски: сюда упирается рейка
      rail: [[-back, h], [len, h], [len, h + lip], [-back, h + lip]],
      plumb: [[0, 0], [h * Math.tan(a), h]],
      width: len + back, height: h + lip, back,
    };
  }

  const api = { slope, rafter, notchOf, ridgeEnd, roofModel, estimate, spacing, hip, rafterSection, beamSection, checkSection, jigOutline, BOARDS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RoofCore = api;
})(typeof window !== "undefined" ? window : globalThis);
