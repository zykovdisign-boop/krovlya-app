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

  /* Стропило двускатной крыши.
     run — заложение (от наружной грани мауэрлата до оси конька), over — свес по горизонтали,
     h — высота доски, d — глубина запила, plate — ширина мауэрлата, ridgeGap — отступ от оси (половина прогона и т.п.) */
  function rafter({ run, angle, over = 0, h = 200, d = null, plate = 150, ridgeGap = 0 }) {
    const a = rad(angle), s = Math.sin(a), c = Math.cos(a), t = Math.tan(a);
    if (d == null) d = Math.round(h / 4);
    const rise = run * t;
    const lenRidge = (run - ridgeGap) / c;          // по нижней кромке от вертикали запила до конькового реза
    const lenOver = over / c;
    const lenBottom = lenRidge + lenOver;
    const lenTop = lenBottom;                          // резы параллельны, длины кромок равны
    const boardLen = lenBottom + h * t;               // габарит доски: смещение резов по высоте
    const seat = d / t;                                // горизонтальная площадка запила
    const need = boardLen + 50;
    const board = BOARDS.find((b) => b >= need) || null;
    const warnings = [];
    if (d > h / 3 + 0.5) warnings.push("Запил глубже трети доски. Уменьшите глубину или подшейте опорный брусок.");
    if (seat > plate) warnings.push(`Площадка запила ${Math.round(seat)} мм шире мауэрлата ${plate} мм. Уменьшите глубину запила.`);
    if (!board) warnings.push("Длиннее 6 м: стропило придётся сращивать у опоры (глава 7.5).");
    // точки для чертежа в координатах доски: x вдоль нижней кромки (0 = вертикаль запила), y вверх от нижней кромки
    const geo = {
      notch: [[0, 0], [d * s, d * c], [d / s, 0]],
      eave: [[-lenOver, 0], [-lenOver + h * t, h]],
      ridge: [[lenRidge, 0], [lenRidge + h * t, h]],
    };
    return {
      angle, run, over, h, d, plate,
      rise, ridgeOverPlate: rise - d,
      lenRidge, lenOver, lenBottom, boardLen, board, seat,
      plumbAngleToEdge: 90 - angle, seatAngleToEdge: angle,
      dMax: Math.floor(h / 3), warnings, geo,
    };
  }

  /* Шаг и число стропильных пар по длине дома */
  function spacing({ length, step = 600 }) {
    const intervals = Math.ceil(length / step - 1e-9);
    return { intervals, pairs: intervals + 1, step: length / intervals, rafters: (intervals + 1) * 2 };
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
    const a = rad(angle), s = Math.sin(a), c = Math.cos(a);
    const back = 120;                       // заход шаблона за запил в сторону свеса
    return {
      body: [[-back, 0], [0, 0], [d * s, d * c], [d / s, 0], [len, 0], [len, h + lip], [-back, h + lip]],
      edgeTop: [[-back, h], [len, h]],      // линия кромки доски: сюда упирается рейка
      rail: [[-back, h], [len, h], [len, h + lip], [-back, h + lip]],
      plumb: [[0, 0], [h * Math.tan(a), h]],
      width: len + back, height: h + lip, back,
    };
  }

  const api = { slope, rafter, spacing, hip, rafterSection, beamSection, checkSection, jigOutline, BOARDS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.RoofCore = api;
})(typeof window !== "undefined" ? window : globalThis);
