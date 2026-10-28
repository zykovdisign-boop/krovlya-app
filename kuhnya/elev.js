/* Чертежи «Кухня PRO»: развёртка стены со шкафами и размерами, столешница сверху с вырезами, раскрой листов.
   Строится из результата KuhnyaCore.fullCalc. Размеры в мм, в браузере и в Node. */
(function (root) {
  const INK = "#37474f", MUTE = "#78909c", WALL = "#f6f4ef", CASE = "#ffffff", TOP = "#a1887f", COC = "#90a4ae", GLASS = "#cfd8dc";
  const UT = { water: ["#1565c0", "В"], sewer: ["#6d4c41", "К"], gas: ["#f9a825", "Г"], socket: ["#e65100", "Р"], vent: ["#00897b", "Вк"] };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const n0 = (v) => String(Math.round(v));
  const FONT = `font-family="-apple-system,'Segoe UI',Roboto,Arial,sans-serif"`;

  function kit(fs) {
    const sw = fs * 0.07;
    const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${(o.k || 1) * fs}" font-weight="${o.b ? 700 : 400}" text-anchor="${o.a || "middle"}" fill="${o.c || INK}"${o.rot ? ` transform="rotate(${o.rot} ${x} ${y})"` : ""}>${esc(s)}</text>`;
    const rect = (x, y, w, h, o = {}) => (w > 0 && h > 0 ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.fill || CASE}" stroke="${o.c || INK}" stroke-width="${sw * (o.sw || 1)}"${o.dash ? ` stroke-dasharray="${fs * 0.3} ${fs * 0.2}"` : ""}${o.rx ? ` rx="${o.rx}"` : ""}/>` : "");
    const line = (x1, y1, x2, y2, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${o.c || INK}" stroke-width="${sw * (o.sw || 1)}"${o.dash ? ` stroke-dasharray="${fs * 0.3} ${fs * 0.2}"` : ""}/>`;
    // размерная цепочка: засечки-штрихи, подписи над линией
    const chainH = (pts, y, o = {}) => {
      pts = [...new Set(pts.map(Math.round))].sort((a, b) => a - b);
      if (pts.length < 2) return "";
      let s = line(pts[0], y, pts[pts.length - 1], y, { sw: 0.8 });
      pts.forEach((x) => { s += line(x - fs * 0.25, y + fs * 0.25, x + fs * 0.25, y - fs * 0.25, { sw: 1.4 }) + line(x, y - fs * 0.45, x, y + fs * 0.45, { sw: 0.6, c: MUTE }); });
      for (let i = 0; i < pts.length - 1; i++) {
        const d = pts[i + 1] - pts[i], k = d < fs * 2.2 ? 0.62 : 0.78;
        if (d >= fs * 1.1) s += t((pts[i] + pts[i + 1]) / 2, y - fs * 0.3, n0(d), { k, b: o.b });
      }
      return s;
    };
    const chainV = (pts, x, o = {}) => {
      pts = [...new Set(pts.map(Math.round))].sort((a, b) => a - b);
      if (pts.length < 2) return "";
      let s = line(x, pts[0], x, pts[pts.length - 1], { sw: 0.8 });
      pts.forEach((y) => { s += line(x - fs * 0.25, y + fs * 0.25, x + fs * 0.25, y - fs * 0.25, { sw: 1.4 }) + line(x - fs * 0.45, y, x + fs * 0.45, y, { sw: 0.6, c: MUTE }); });
      for (let i = 0; i < pts.length - 1; i++) {
        const d = pts[i + 1] - pts[i], k = d < fs * 2.2 ? 0.62 : 0.78, cy = (pts[i] + pts[i + 1]) / 2;
        if (d >= fs * 1.1) s += t(x - fs * 0.3, cy, n0(d), { k, b: o.b, rot: -90 });
      }
      return s;
    };
    return { t, rect, line, chainH, chainV, sw };
  }

  const MOD = (m) => (typeof window !== "undefined" && window.KuhnyaCore ? window.KuhnyaCore : root.KuhnyaCore || (typeof require !== "undefined" ? require("./core.js") : null)).MODULES[m.type] || {};

  /* ---------- развёртка стены ---------- */
  function wallSvg(r, p, id, o = {}) {
    const w = r.walls.find((x) => x.id === id);
    if (!w) return "";
    const C = r.h, len = w.len, H = C.H, dims = o.dims !== false;
    const fs = Math.max(len, H) / 36;
    const K = kit(fs), { t, rect, line } = K;
    const Y = (h) => H - h;
    const mL = dims ? fs * 2.5 : fs * 0.8, mR = dims ? fs * 5.6 : fs * 0.8, mT = dims ? fs * 4.4 : fs * 2, mB = dims ? fs * 5 : fs * 1.6;
    let s = rect(0, 0, len, H, { fill: WALL, sw: 1.6 });
    // зона чужих шкафов у угла
    const hatch = (x0, x1, y0, y1, label) => (x1 - x0 > 1 ? rect(x0, y0, x1 - x0, y1 - y0, { fill: "url(#kh)", c: MUTE, sw: 0.6, dash: 1 }) + (x1 - x0 > fs * 2 ? t((x0 + x1) / 2, (y0 + y1) / 2, label, { k: 0.6, c: MUTE }) : "") : "");
    s += hatch(0, w.startBase, Y(C.counter), H, "угол");
    s += hatch(0, w.startUp, Y(C.upperTop), Y(C.upperBottom), "угол");
    // окна и двери
    w.ops.forEach((op) => {
      const x = Number(op.from), ww = Number(op.w), y1 = Y(Number(op.sill)), y0 = Y(Number(op.sill) + Number(op.h));
      if (op.kind === "window") {
        s += rect(x, y0, ww, y1 - y0, { fill: "#e3f2fd", sw: 1.2 }) + rect(x + fs * 0.3, y0 + fs * 0.3, ww - fs * 0.6, y1 - y0 - fs * 0.6, { fill: "none", sw: 0.7 })
          + line(x + ww / 2, y0 + fs * 0.3, x + ww / 2, y1 - fs * 0.3, { sw: 0.7 }) + rect(x - fs * 0.3, y1, ww + fs * 0.6, fs * 0.25, { fill: "#fff", sw: 0.8 });
        s += t(x + ww / 2, y0 + fs * 1.2, `окно ${n0(ww)}×${n0(op.h)}`, { k: 0.6, c: MUTE }) + t(x + ww / 2, y0 + fs * 2, `низ ${n0(op.sill)}`, { k: 0.6, c: MUTE });
      } else {
        s += rect(x, y0, ww, y1 - y0, { fill: "#fff", sw: 1.2 }) + t(x + ww / 2, y0 + fs * 1.2, `дверь ${n0(ww)}`, { k: 0.6, c: MUTE });
      }
    });
    // нижний ряд
    const handleH = (cx, y) => line(cx - fs * 0.6, y, cx + fs * 0.6, y, { sw: 2.2, c: "#78909c" });
    const handleV = (x, cy) => line(x, cy - fs * 0.6, x, cy + fs * 0.6, { sw: 2.2, c: "#78909c" });
    const doors = (x, y, ww, hh, n, hUp) => {
      let z = rect(x, y, ww, hh, { fill: CASE });
      if (n === 2) z += line(x + ww / 2, y, x + ww / 2, y + hh, { sw: 0.8 });
      const hy = hUp ? y + hh - fs * 1.1 : y + fs * 1.1;
      if (n === 2) z += handleV(x + ww / 2 - fs * 0.5, hy) + handleV(x + ww / 2 + fs * 0.5, hy);
      else if (n === 1) z += handleV(x + ww - fs * 0.6, hy);
      return z;
    };
    const drawers = (x, y, ww, hh, n) => {
      let z = rect(x, y, ww, hh, { fill: CASE });
      const fr = n === 3 ? [0.22, 0.36, 0.42] : n === 2 ? [0.4, 0.6] : [1];
      let yy = y;
      fr.forEach((f, i) => { if (i) z += line(x, yy, x + ww, yy, { sw: 0.8 }); z += handleH(x + ww / 2, yy + fs * 0.7); yy += hh * f; });
      return z;
    };
    const dn = (ww) => (ww > 500 ? 2 : 1);
    const cTop = Y(C.counter), cBot = Y(C.counter - C.thk), caseTop = Y(C.plinth + C.caseH), caseBot = Y(C.plinth);
    w.base.forEach((m) => {
      const x = m.x, ww = m.w, d = MOD(m), lab = (yy, txt) => (ww > fs * 1.6 ? t(x + ww / 2, yy, txt, { k: 0.58, c: MUTE }) : "");
      if (d.gap) { s += rect(x, cTop, ww, H - cTop, { fill: "none", c: MUTE, dash: 1, sw: 0.6 }); return; }
      if (m.type === "fridge") {
        const top = Y(Math.min(1900, C.upperTop - 50));
        s += rect(x + fs * 0.15, top, ww - fs * 0.3, H - top, { fill: "#fafafa", rx: fs * 0.4 }) + line(x + fs * 0.15, top + (H - top) * 0.36, x + ww - fs * 0.15, top + (H - top) * 0.36, { sw: 0.8 });
        s += handleV(x + ww - fs * 0.7, top + (H - top) * 0.25) + handleV(x + ww - fs * 0.7, top + (H - top) * 0.48) + lab(top + (H - top) * 0.7, "холодильник");
        return;
      }
      if (m.type === "stove") {
        const top = Y(850);
        s += rect(x, top, ww, H - top, { fill: "#fafafa" }) + rect(x + fs * 0.5, top + fs * 1.6, ww - fs, (H - top) * 0.5, { fill: GLASS, sw: 0.7 });
        for (let i = 0; i < 4; i++) s += `<circle cx="${x + ww * (0.2 + i * 0.2)}" cy="${top + fs * 0.7}" r="${fs * 0.22}" fill="${INK}"/>`;
        s += rect(x, top - fs * 0.25, ww, fs * 0.25, { fill: "#263238" }) + lab(H - fs * 0.6, "плита");
        return;
      }
      if (d.filler) { s += rect(x, cBot, ww, caseBot - cBot, { fill: "#cfd8dc", sw: 0.6 }) + rect(x, caseBot, ww, H - caseBot, { fill: COC, sw: 0.6 }); return; }
      s += rect(x, caseBot, ww, H - caseBot, { fill: COC, sw: 0.6 });
      if (d.tall) {
        const top = Y(C.upperTop);
        if (m.type === "tall_appl") {
          const ov0 = Y(C.plinth + 820), ov1 = Y(C.plinth + 820 + 600);
          s += rect(x, top, ww, caseBot - top, { fill: CASE }) + drawers(x, ov0, ww, caseBot - ov0, 1) + rect(x, ov1, ww, ov0 - ov1, { fill: "#eceff1" }) + rect(x + fs * 0.4, ov1 + fs * 1.4, ww - fs * 0.8, (ov0 - ov1) * 0.55, { fill: GLASS, sw: 0.7 });
          const mw1 = ov1 - fs * 0.2, mw0 = mw1 - 380;
          s += rect(x, mw0, ww, mw1 - mw0, { fill: "#eceff1" }) + rect(x + fs * 0.4, mw0 + fs * 0.4, ww * 0.62, mw1 - mw0 - fs * 0.8, { fill: GLASS, sw: 0.7 });
          if (mw0 - top > fs) s += doors(x, top, ww, mw0 - top, 1, true);
          s += lab(ov0 - fs * 0.5, "духовка");
        } else {
          const split = Y(C.upperTop - C.upperH);
          s += doors(x, split, ww, caseBot - split, m.type === "tall_fridge" ? 1 : dn(ww)) + doors(x, top, ww, split - top, m.type === "tall_fridge" ? 1 : dn(ww), true);
          s += lab((split + caseBot) / 2, m.type === "tall_fridge" ? "холодильник" : "пенал");
        }
        return;
      }
      const ch = caseBot - caseTop;
      if (d.dw) s += rect(x, caseTop, ww, ch, { fill: CASE }) + handleH(x + ww / 2, caseTop + fs * 0.7) + lab(caseTop + ch * 0.6, "ПММ");
      else if (m.type === "base_drawers") s += drawers(x, caseTop, ww, ch, 3);
      else if (m.type === "base_hob") s += drawers(x, caseTop, ww, ch, 2);
      else if (m.type === "base_oven") {
        const oy = caseTop + ch * 0.18;
        s += rect(x, caseTop, ww, ch, { fill: "#eceff1" }) + rect(x + fs * 0.4, oy + fs * 1.2, ww - fs * 0.8, ch * 0.42, { fill: GLASS, sw: 0.7 }) + handleH(x + ww / 2, oy + fs * 0.5);
        s += line(x, caseTop + ch * 0.8, x + ww, caseTop + ch * 0.8, { sw: 0.8 }) + handleH(x + ww / 2, caseTop + ch * 0.8 + fs * 0.6) + lab(caseTop + ch * 0.12, "духовка");
      } else if (m.type === "base_bottle") s += rect(x, caseTop, ww, ch, { fill: CASE }) + handleH(x + ww / 2, caseTop + fs * 0.7);
      else if (d.corner === "l") s += doors(x, caseTop, ww, ch, 2) + lab(caseTop + ch * 0.75, "угловой");
      else s += doors(x, caseTop, ww, ch, d.corner === "blind" ? 1 : dn(ww));
      if (d.sink) s += lab(caseTop + ch * 0.75, "мойка");
      if (d.corner === "blind") s += rect(x, caseTop, ww * 0.45, ch, { fill: "url(#kh)", c: MUTE, sw: 0.5 });
    });
    // столешница
    const runs = r.counter.runs.filter((x) => x.w.id === id);
    runs.forEach((rn) => {
      const a = rn.jStart ? 0 : rn.from, b = rn.to;
      s += rect(a, cTop, b - a, cBot - cTop, { fill: TOP, sw: 0.8 });
      (rn.splits || []).forEach((x) => { s += line(x, cTop - fs * 0.2, x, cBot + fs * 0.2, { c: "#d84315", sw: 1.6 }); });
      if (rn.jStart) s += line(r.counter.D, cTop - fs * 0.2, r.counter.D, cBot + fs * 0.2, { c: "#d84315", sw: 1.6 });
    });
    r.counter.cutouts.filter((c) => c.wall === id).forEach((c) => {
      if (c.kind === "sink") s += rect(c.x0 + fs * 0.2, cBot, c.w - fs * 0.4, 190, { fill: "#eceff1", dash: 1, sw: 0.8 }) + rect((c.x0 + c.x1) / 2 - fs * 0.15, cTop - 260, fs * 0.3, 260, { fill: "#b0bec5", sw: 0.6 }) + rect((c.x0 + c.x1) / 2 - fs * 0.15, cTop - 260, fs * 1.6, fs * 0.3, { fill: "#b0bec5", sw: 0.6 });
      else s += rect(c.x0, cTop - fs * 0.22, c.w, fs * 0.22, { fill: "#212121", sw: 0.5 });
    });
    // верхний ряд
    const uTop = Y(C.upperTop), uBot = Y(C.upperBottom);
    w.upper.forEach((m) => {
      const x = m.x, ww = m.w, d = MOD(m), lab = (yy, txt) => (ww > fs * 1.6 ? t(x + ww / 2, yy, txt, { k: 0.58, c: MUTE }) : "");
      if (d.gap) { s += rect(x, uTop, ww, uBot - uTop, { fill: "none", c: MUTE, dash: 1, sw: 0.6 }); return; }
      if (d.filler) { s += rect(x, uTop, ww, uBot - uTop, { fill: "#cfd8dc", sw: 0.6 }); return; }
      if (m.type === "hood") {
        const hb = Y(C.counter + C.hoodH), dome = Math.min(150, (hb - uTop) * 0.4);
        s += `<path d="M${x} ${hb}L${x + ww} ${hb}L${x + ww * 0.68} ${hb - dome}L${x + ww * 0.32} ${hb - dome}z" fill="#eceff1" stroke="${INK}" stroke-width="${K.sw}"/>`;
        s += rect(x + ww * 0.35, 0, ww * 0.3, hb - dome, { fill: "#eceff1" }) + lab(hb + fs * 0.9, "вытяжка");
        return;
      }
      if (d.hood === "built") {
        const hb = Y(C.counter + C.hoodBuilt);
        s += doors(x, uTop, ww, hb - uTop - fs * 0.45, dn(ww), false) + rect(x, hb - fs * 0.45, ww, fs * 0.45, { fill: "#90a4ae", sw: 0.8 }) + lab(hb + fs * 0.9, "вытяжка");
        return;
      }
      if (m.type === "up_open") {
        s += rect(x, uTop, ww, uBot - uTop, { fill: "#fbfaf7" }) + line(x, (uTop + uBot) / 2, x + ww, (uTop + uBot) / 2, { sw: 1 });
        return;
      }
      if (m.type === "up_lift") { s += rect(x, uTop, ww, uBot - uTop, { fill: CASE }) + handleH(x + ww / 2, uBot - fs * 0.7) + lab(uTop + fs * 1.2, "подъёмник"); return; }
      s += doors(x, uTop, ww, uBot - uTop, d.corner === "l" ? 2 : dn(ww), true);
      if (m.type === "up_dryer") s += lab(uTop + fs * 1.2, "сушка");
      if (d.corner) s += lab(uTop + fs * 1.2, "угловой");
    });
    // коммуникации
    (p.utils || []).filter((u) => u.wall === id).forEach((u) => {
      const [c, l] = UT[u.kind] || UT.socket, x = Number(u.x), y = Y(Number(u.h));
      s += `<circle cx="${x}" cy="${y}" r="${fs * 0.55}" fill="${c}" stroke="#fff" stroke-width="${K.sw * 1.5}"/>` + t(x, y + fs * 0.22, l, { k: 0.55, b: true, c: "#fff" });
      if (dims) s += t(x, y + fs * 1.25, `${n0(x)} / ${n0(u.h)}`, { k: 0.52, c, b: true });
    });
    s += line(-mL, H, len + mR * 0.6, H, { sw: 2.2 });
    // размеры
    if (dims) {
      const bp = [0, w.startBase || 0, len].concat(...w.base.map((m) => [m.x, m.x + m.w]));
      s += K.chainH(bp, H + fs * 1.6) + K.chainH([0, len], H + fs * 3.4, { b: true });
      const up = w.upper.length ? [0, w.startUp || 0, len].concat(...w.upper.map((m) => [m.x, m.x + m.w])) : [];
      if (up.length) s += K.chainH(up, -fs * 1.2);
      const vx = len + fs * 1.6;
      s += K.chainV([Y(0), Y(C.plinth), Y(C.counter), Y(C.upperBottom), Y(C.upperTop), Y(H)], vx);
      s += K.chainV([Y(0), Y(H)], len + fs * 3.6, { b: true });
    }
    s += t(-mL + fs * 0.4, -mT + fs * 1.1, `Стена ${id} · ${n0(len)} мм`, { a: "start", b: true, k: 0.95 });
    const vb = [-mL, -mT, len + mL + mR, H + mT + mB];
    const defs = `<defs><pattern id="kh" width="${fs * 0.5}" height="${fs * 0.5}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${fs * 0.5}" height="${fs * 0.5}" fill="#eef0f2"/><line x1="0" y1="0" x2="0" y2="${fs * 0.5}" stroke="#cfd8dc" stroke-width="${fs * 0.12}"/></pattern></defs>`;
    return `<svg class="${o.cls || "elev"}" viewBox="${vb.map(Math.round).join(" ")}" xmlns="http://www.w3.org/2000/svg" ${FONT} role="img" aria-label="Развёртка стены ${id}">${defs}<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="#fff"/>${s}</svg>`;
  }

  /* ---------- столешница сверху ---------- */
  function counterSvg(r, p) {
    const core = (typeof window !== "undefined" && window.KuhnyaCore) || (typeof require !== "undefined" ? require("./core.js") : null);
    const R = core.roomSize(p), ct = r.counter, D = ct.D, walls = r.walls;
    const fs = Math.max(R.w, R.h) / 30;
    const K = kit(fs), { t, rect, line } = K;
    let s = "";
    // стены
    const wl = { A: [[0, 0], [R.w, 0]], B: [[R.w, 0], [R.w, R.h]], C: [[R.w, R.h], [R.w - (walls[2] ? walls[2].len : 0), R.h]] };
    walls.forEach((w) => { const [a, b] = wl[w.id]; s += line(a[0], a[1], b[0], b[1], { sw: 5, c: "#455a64" }); });
    // куски: прямоугольник по стене from..to глубиной D
    const box = (wall, a, b, d0, d1) => {
      const p1 = core.wallToPlan(p, wall, a, d0), p2 = core.wallToPlan(p, wall, b, d1);
      return { x: Math.min(p1.x, p2.x), y: Math.min(p1.y, p2.y), w: Math.abs(p2.x - p1.x), h: Math.abs(p2.y - p1.y) };
    };
    ct.pieces.forEach((pc, i) => {
      const b = box(pc.wall, pc.from, pc.to, 0, D);
      s += rect(b.x, b.y, b.w, b.h, { fill: "#d7ccc8", sw: 1.2 });
      // подпись туда, где нет выреза
      const cuts = ct.cutouts.filter((c) => c.wall === pc.wall);
      const lo = pc.from + fs * 2.4 + (pc.start === "joint" && pc.from < D ? D : 0), hi = pc.to - fs * 2.4 - (pc.end === "joint" ? D : 0), mid = (pc.from + pc.to) / 2;
      const room = (x) => Math.min(...cuts.map((c) => Math.max(c.x0 - x, x - c.x1)), 1e9);
      let at = mid;
      for (let x = lo; x <= hi; x += 50) if (room(x) > room(at) + 1 || (Math.abs(room(x) - room(at)) <= 1 && Math.abs(x - mid) < Math.abs(at - mid))) at = x;
      const q = core.wallToPlan(p, pc.wall, at, D / 2), vert = pc.wall === "B";
      s += t(q.x + (vert ? fs * 0.3 : 0), q.y + (vert ? 0 : fs * 0.3), `${i + 1}: ${n0(pc.len)}`, { b: true, k: 0.85, rot: vert ? -90 : 0 });
    });
    ct.joints.forEach((j) => {
      const b = walls.find((w) => w.id === j.b), pnt1 = core.wallToPlan(p, b.id, D, 0), pnt2 = core.wallToPlan(p, b.id, D, D);
      s += line(pnt1.x, pnt1.y, pnt2.x, pnt2.y, { c: "#d84315", sw: 2.6 });
      const mid = core.wallToPlan(p, b.id, D / 2, D / 2);
      s += t(mid.x, mid.y + fs * 0.3, j.kind === "euro" ? "евро" : "90°", { k: 0.6, c: "#d84315", b: true });
    });
    ct.runs.forEach((rn) => (rn.splits || []).forEach((x) => {
      const q1 = core.wallToPlan(p, rn.w.id, x, 0), q2 = core.wallToPlan(p, rn.w.id, x, D);
      s += line(q1.x, q1.y, q2.x, q2.y, { c: "#d84315", sw: 2.6 });
    }));
    ct.cutouts.forEach((c) => {
      const b = box(c.wall, c.x0, c.x1, c.front, c.front + c.d);
      s += rect(b.x, b.y, b.w, b.h, { fill: c.kind === "sink" ? "#e3f2fd" : "#424242", rx: c.kind === "sink" ? fs * 0.5 : fs * 0.15, sw: 1 });
      const cx = b.x + b.w / 2, cy = b.y + b.h / 2, vert = c.wall === "B";
      s += t(cx, cy + fs * 0.25, `${c.w}×${c.d}`, { k: 0.6, b: true, c: c.kind === "sink" ? INK : "#fff", rot: vert ? -90 : 0 });
    });
    // габариты стен
    walls.forEach((w) => {
      const a = core.wallToPlan(p, w.id, 0, -fs * 1.4), b = core.wallToPlan(p, w.id, w.len, -fs * 1.4), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      s += line(a.x, a.y, b.x, b.y, { sw: 0.7, c: MUTE }) + t(mx + (w.id === "B" ? fs * 0.6 : 0), my + (w.id === "C" ? fs * 1.1 : w.id === "A" ? -fs * 0.3 : fs * 0.3), `${w.id}: ${n0(w.len)}`, { k: 0.7, c: MUTE, b: true, rot: w.id === "B" ? 90 : 0 });
    });
    const m = fs * 3;
    return `<svg class="ctop" viewBox="${-m} ${-m} ${R.w + 2 * m} ${R.h + 2 * m}" xmlns="http://www.w3.org/2000/svg" ${FONT} role="img" aria-label="Столешница сверху"><rect x="${-m}" y="${-m}" width="${R.w + 2 * m}" height="${R.h + 2 * m}" fill="#fff"/>${s}</svg>`;
  }

  /* ---------- раскрой листов ---------- */
  function sheetsSvg(r) {
    const ct = r.counter, L = ct.sheet, fs = L / 34, rowH = fs * 2.6, gap = fs * 1.4;
    const K = kit(fs), { t, rect } = K;
    let s = "";
    ct.sheets.forEach((sh, i) => {
      const y = i * (rowH + gap) + fs * 1.4;
      s += t(0, y - fs * 0.35, `Лист ${i + 1}: ${n0(L)} мм, остаток ${n0(sh.waste)}`, { a: "start", k: 0.8, b: true });
      s += rect(0, y, L, rowH, { fill: "url(#kw)", sw: 1 });
      let x = 0;
      sh.items.forEach((k) => {
        const pc = ct.pieces[k];
        s += rect(x, y, pc.cut, rowH, { fill: "#d7ccc8", sw: 1 }) + t(x + pc.cut / 2, y + rowH / 2 + fs * 0.3, `${k + 1}: ${n0(pc.cut)}`, { k: 0.8, b: true });
        x += pc.cut + 4;
      });
    });
    const H = ct.sheets.length * (rowH + gap) + fs * 0.6;
    return `<svg class="sheets" viewBox="${-fs * 0.5} 0 ${L + fs} ${H}" xmlns="http://www.w3.org/2000/svg" ${FONT} role="img" aria-label="Раскрой столешницы"><defs><pattern id="kw" width="${fs * 0.6}" height="${fs * 0.6}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="${fs}" height="${fs}" fill="#fafafa"/><line x1="0" y1="0" x2="0" y2="${fs}" stroke="#e0e0e0" stroke-width="${fs * 0.15}"/></pattern></defs>${s}</svg>`;
  }

  const api = { wallSvg, counterSvg, sheetsSvg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Elev = api;
})(typeof window !== "undefined" ? window : globalThis);
