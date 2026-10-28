/* Монтажная схема «Сантехник PRO»: узел ввода, коллекторы ХВС и ГВС с отводами на приборы,
   нагреватель и циркуляция, котёл с обвязкой и радиаторы. Строится из результата SantehCore.fullCalc. */
(function (root) {
  const INK = "#37474f", MUTE = "#78909c";
  const COL = { cold: "#1565c0", hot: "#e53935", circ: "#ff8a65", sup: "#c62828", ret: "#42a5f5" };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const t = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.fs || 11}" font-weight="${o.b ? 700 : 400}" text-anchor="${o.a || "middle"}" fill="${o.c || INK}">${esc(s)}</text>`;

  // труба: тёмная обводка + цвет, как провода в электрике
  const pipe = (pts, c, w = 6, dash) => {
    const d = pts.map((p) => p.join(",")).join(" ");
    return `<polyline points="${d}" fill="none" stroke="#00000040" stroke-width="${w + 2}" stroke-linejoin="round" stroke-linecap="round"/>`
      + `<polyline points="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  };
  const valve = (x, y) => `<path d="M${x - 10} ${y - 8}L${x + 10} ${y + 8}L${x + 10} ${y - 8}L${x - 10} ${y + 8}z" fill="#fff" stroke="${INK}" stroke-width="1.6"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y - 16}" stroke="${INK}" stroke-width="2"/><rect x="${x - 8}" y="${y - 20}" width="16" height="5" rx="2" fill="#e53935"/>`;
  const valveV = (x, y) => `<path d="M${x - 8} ${y - 10}L${x + 8} ${y + 10}L${x - 8} ${y + 10}L${x + 8} ${y - 10}z" fill="#fff" stroke="${INK}" stroke-width="1.5"/><rect x="${x + 6}" y="${y - 3}" width="12" height="5" rx="2" fill="#e53935"/>`;
  const check = (x, y, dir = 1) => `<rect x="${x - 13}" y="${y - 11}" width="26" height="22" rx="3" fill="#fff" stroke="${INK}" stroke-width="1.6"/><path d="M${x - 6 * dir} ${y - 6}L${x + 5 * dir} ${y}L${x - 6 * dir} ${y + 6}z" fill="${INK}"/><line x1="${x + 7 * dir}" y1="${y - 7}" x2="${x + 7 * dir}" y2="${y + 7}" stroke="${INK}" stroke-width="2.2"/>`;
  const strainer = (x, y) => `<rect x="${x - 13}" y="${y - 9}" width="26" height="18" rx="3" fill="#fff" stroke="${INK}" stroke-width="1.6"/><path d="M${x - 3} ${y + 9}L${x + 8} ${y + 27}" stroke="${INK}" stroke-width="11" stroke-linecap="round"/><path d="M${x - 3} ${y + 9}L${x + 8} ${y + 27}" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/>`;
  const meter = (x, y) => `<rect x="${x - 19}" y="${y - 15}" width="38" height="30" rx="6" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="9" fill="#e3f2fd" stroke="${INK}" stroke-width="1.2"/>` + t(x, y + 4, "м³", { fs: 9, b: true });
  const reducer = (x, y) => `<rect x="${x - 17}" y="${y - 15}" width="34" height="30" rx="5" fill="#fff" stroke="${INK}" stroke-width="1.6"/>` + t(x, y + 5, "Р", { fs: 14, b: true });
  const gauge = (x, y) => `<line x1="${x}" y1="${y}" x2="${x}" y2="${y - 20}" stroke="${INK}" stroke-width="3"/><circle cx="${x}" cy="${y - 31}" r="11" fill="#fff" stroke="${INK}" stroke-width="1.6"/><line x1="${x}" y1="${y - 31}" x2="${x + 6}" y2="${y - 37}" stroke="#e53935" stroke-width="1.8"/>`;
  const fine = (x, y) => `<rect x="${x - 14}" y="${y - 30}" width="28" height="60" rx="8" fill="#fff" stroke="${INK}" stroke-width="1.6"/><line x1="${x - 6}" y1="${y - 20}" x2="${x - 6}" y2="${y + 20}" stroke="${MUTE}" stroke-dasharray="3 3"/><line x1="${x + 6}" y1="${y - 20}" x2="${x + 6}" y2="${y + 20}" stroke="${MUTE}" stroke-dasharray="3 3"/>`;
  const pump = (x, y, dir = "r") => {
    const tri = dir === "r" ? `M${x - 6} ${y - 8}L${x + 9} ${y}L${x - 6} ${y + 8}z` : `M${x + 6} ${y - 8}L${x - 9} ${y}L${x + 6} ${y + 8}z`;
    return `<circle cx="${x}" cy="${y}" r="15" fill="#fff" stroke="${INK}" stroke-width="1.6"/><path d="${tri}" fill="${INK}"/>`;
  };
  const tank = (x, y) => `<rect x="${x - 20}" y="${y - 62}" width="40" height="62" rx="18" fill="#fff" stroke="${INK}" stroke-width="1.6"/><rect x="${x - 19}" y="${y - 28}" width="38" height="27" rx="11" fill="#bbdefb"/><path d="M${x - 20} ${y - 30}Q${x} ${y - 20} ${x + 20} ${y - 30}" fill="none" stroke="${INK}" stroke-width="1.2"/>`;
  const relief = (x, y) => `<rect x="${x - 10}" y="${y - 26}" width="20" height="18" rx="3" fill="#fff" stroke="${INK}" stroke-width="1.5"/><path d="M${x} ${y - 8}V${y}" stroke="${INK}" stroke-width="2.5"/><path d="M${x + 10} ${y - 17}h10" stroke="${INK}" stroke-width="2.5"/>`;
  const radiator = (x, y, n, maxW = 98, h = 52) => {
    const shown = Math.min(n, 14), sw = Math.min(7, maxW / shown);
    let s = `<rect x="${x}" y="${y}" width="${shown * sw}" height="${h}" rx="3" fill="#fafafa" stroke="${INK}" stroke-width="1.6"/>`;
    for (let i = 1; i < shown; i++) s += `<line x1="${x + i * sw}" y1="${y + 3}" x2="${x + i * sw}" y2="${y + h - 3}" stroke="${INK}" stroke-width=".9"/>`;
    return { s, w: shown * sw };
  };
  const flow = (x, y, dir) => {
    const p = { r: `M${x - 5} ${y - 5}L${x + 5} ${y}L${x - 5} ${y + 5}`, l: `M${x + 5} ${y - 5}L${x - 5} ${y}L${x + 5} ${y + 5}`, d: `M${x - 5} ${y - 5}L${x} ${y + 5}L${x + 5} ${y - 5}`, u: `M${x - 5} ${y + 5}L${x} ${y - 5}L${x + 5} ${y + 5}` }[dir];
    return `<path d="${p}" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  };
  const num = (x, y, n) => `<circle cx="${x}" cy="${y}" r="9" fill="${INK}"/>` + t(x, y + 4, n, { fs: 10, b: true, c: "#fff" });
  const title = (y, s, sub) => t(16, y, s, { a: "start", fs: 15, b: true }) + (sub ? t(16, y + 17, sub, { a: "start", fs: 11, c: MUTE }) : "");

  // узел ввода: кран, фильтр, счётчик, обратный клапан, редуктор, манометр, тонкий фильтр. Возвращает x конца.
  function inlet(y, c, label) {
    let s = `<rect x="10" y="${y - 40}" width="22" height="80" fill="#ece7dd" stroke="${MUTE}" stroke-width="1"/>` + t(21, y + 54, label, { fs: 10, c: MUTE });
    const parts = [[68, valve], [126, strainer], [188, meter], [246, check], [302, reducer], [356, gauge], [410, fine]];
    s += pipe([[0, y], [450, y]], c);
    parts.forEach(([x, f], i) => { s += f(x, y); s += num(x, y + (i === 1 ? 44 : 34), i + 1); });
    return { s, end: 450 };
  }
  const INLET_LEGEND = ["1 кран   2 фильтр грубой очистки   3 счётчик   4 обратный клапан", "5 редуктор на 3 бар   6 манометр   7 фильтр тонкой очистки"];

  // коллектор с отводами: возвращает svg и нижнюю границу
  function collector(y, xIn, list, c, pipeT, W) {
    const S = 74, x0 = 44, n = list.length;
    const x1 = Math.max(xIn + 20, x0 + (n - 1) * S + 40);
    let s = `<rect x="${x0 - 14}" y="${y - 11}" width="${x1 - x0 + 28}" height="22" rx="8" fill="${c}" stroke="#00000055" stroke-width="1"/>`;
    list.forEach((f, i) => {
      const x = x0 + i * S, [fx, room] = String(f.name).split(" · ");
      s += pipe([[x, y + 10], [x, y + 86]], c, 4.5);
      s += valveV(x, y + 40) + flow(x, y + 70, "d");
      s += t(x, y + 104, fx, { fs: 10.5, b: true }) + t(x, y + 118, room || f.room || "", { fs: 10, c: MUTE });
      s += t(x, y + 132, `${Math.round(f.len * 10) / 10} м`, { fs: 9.5, c });
    });
    s += t(x0 - 14, y - 18, `Коллектор · ${pipeT} · отводов ${list.length}`, { a: "start", fs: 10.5, c, b: true });
    return { s, bottom: y + 140, x1: Math.min(x1, W) };
  }

  function montageSvg(r, p) {
    const w = r.water, cold = w.fixtures, hot = w.hotFixtures, local = w.local;
    const W = Math.max(760, 44 + Math.max(cold.length, hot.length, 1) * 74 + 120);
    let s = "", y = 30;

    // холодная вода
    s += title(y, "Холодная вода", `ввод ${w.vvodPipe.t} · разводка ${w.coldPipe.t}`);
    y += 70;
    const ci = inlet(y, COL.cold, "ввод");
    s += ci.s;
    const teeX = 490;
    s += pipe([[ci.end, y], [teeX, y], [teeX, y + 70]], COL.cold);
    const cc = collector(y + 80, teeX, cold, COL.cold, w.coldPipe.t, W);
    s += cc.s;
    s += lines(16, cc.bottom + 10, INLET_LEGEND);
    let yHot = cc.bottom + 60;

    // горячая вода
    if (hot.length) {
      if (local) {
        // нагреватель справа от узла ввода: холодная заходит снизу через обратный и предохранительный клапан
        const bx = W - 130, by = y - 46;
        s += pipe([[teeX, y], [bx - 40, y], [bx - 40, by + 150], [bx + 20, by + 150]], COL.cold);
        s += check(bx - 40, y + 40, 1) + relief(bx - 40, by + 150 - 0);
        s += `<rect x="${bx}" y="${by}" width="90" height="170" rx="40" fill="#fff" stroke="${INK}" stroke-width="1.8"/>`;
        s += t(bx + 45, by + 80, "Бойлер", { b: true, fs: 12 }) + t(bx + 45, by + 96, "нагреватель", { fs: 10, c: MUTE });
        s += t(bx - 26, by + 186, "предохр. клапан", { fs: 9.5, c: MUTE, a: "end" });
        // горячая сверху вниз к коллектору ГВС
        s += pipe([[bx + 45, by], [bx + 45, by - 16], [W - 18, by - 16], [W - 18, yHot + 80]], COL.hot);
        s += title(yHot, "Горячая вода", `разводка ${w.hotPipe.t}${w.circ ? ", с циркуляцией" : ""}`);
        const hc = collector(yHot + 80, teeX, hot, COL.hot, w.hotPipe.t, W);
        s += pipe([[W - 18, yHot + 80], [hc.x1 + 14, yHot + 80]], COL.hot);
        s += hc.s;
        if (w.circ) {
          const ry = hc.bottom + 24;
          s += pipe([[26, yHot + 80], [12, yHot + 80], [12, ry], [W - 6, ry], [W - 6, by + 100], [bx + 90, by + 100]], COL.circ, 4.5, "10 5");
          s += pump(W / 2, ry, "r") + check(W / 2 + 70, ry, 1) + t(W / 2 + 35, ry + 32, "насос и обратный клапан циркуляции", { fs: 10, c: MUTE });
          yHot = ry + 60;
        } else yHot = hc.bottom + 20;
      } else {
        s += title(yHot, "Горячая вода", `центральная · разводка ${w.hotPipe.t}`);
        const hy = yHot + 70, hi = inlet(hy, COL.hot, "ввод ГВС");
        s += hi.s + pipe([[hi.end, hy], [teeX, hy], [teeX, hy + 70]], COL.hot);
        const hc = collector(hy + 80, teeX, hot, COL.hot, w.hotPipe.t, W);
        s += hc.s;
        if (w.circ) {
          const ry = hc.bottom + 20;
          s += pipe([[26, hy + 80], [12, hy + 80], [12, ry], [260, ry]], COL.circ, 4.5, "10 5") + check(140, ry, -1);
          s += t(270, ry + 4, "в стояк обратки ГВС", { a: "start", fs: 10, c: MUTE });
          yHot = ry + 50;
        } else yHot = hc.bottom + 20;
      }
    }

    // отопление
    let H = yHot;
    if (r.heating) {
      const h = r.heating, Y = yHot + 10;
      const sys = h.system === "floor" ? "тёплый пол" : h.system === "oneTube" ? "однотрубная" : "двухтрубная";
      s += title(Y, "Отопление", `${h.boilerType.t} ${h.boilerPower} кВт · ${sys} · ${h.pipe.t}`);
      const top = Y + 50, sup = top + 24, ret = top + 210;
      s += `<rect x="16" y="${top}" width="104" height="170" rx="8" fill="#fff" stroke="${INK}" stroke-width="1.8"/>` + t(68, top + 80, "Котёл", { b: true, fs: 13 }) + t(68, top + 98, `${h.boilerPower} кВт`, { fs: 11, c: MUTE });
      // подача: группа безопасности, кран
      s += pipe([[120, sup], [W - 20, sup]], COL.sup);
      s += pipe([[170, sup], [170, sup - 26]], COL.sup, 4) + `<rect x="154" y="${sup - 46}" width="32" height="20" rx="3" fill="#fff" stroke="${INK}" stroke-width="1.5"/>` + gauge(162, sup - 46) + num(196, sup - 36, 1);
      s += valve(220, sup) + num(220, sup + 24, 2);
      // обратка: кран, фильтр, бак, насос, кран
      s += pipe([[W - 20, ret], [120, ret], [120, top + 150]], COL.ret);
      s += valve(300, ret) + num(300, ret + 24, 7) + strainer(250, ret) + num(250, ret + 48, 6);
      s += pipe([[205, ret], [205, ret - 18]], COL.ret, 4) + tank(205, ret - 18) + num(232, ret - 60, 5);
      s += pump(165, ret, "l") + num(165, ret + 28, 4) + valve(138, ret) + num(138, ret - 26, 3);
      s += flow(260, sup, "r") + flow(W - 60, ret, "l");
      const rooms = h.rooms, x0 = 360, span = W - 40 - x0, step = rooms.length ? span / rooms.length : span;
      rooms.forEach((rm, i) => {
        const cx = x0 + i * step + step / 2;
        if (h.system === "floor") {
          const lw = Math.min(step - 16, 70), lx = cx - lw / 2, ly = sup + 50;
          let d = `M${lx} ${ly}`, down = true;
          for (let x = lx; x < lx + lw; x += 10) { const yy = down ? ly + 80 : ly; d += `L${x} ${yy}L${Math.min(x + 10, lx + lw)} ${yy}`; down = !down; }
          s += pipe([[cx - lw / 2, sup], [cx - lw / 2, ly]], COL.sup, 3.5) + pipe([[cx + lw / 2, ly + 80], [cx + lw / 2, ret]], COL.ret, 3.5);
          s += `<path d="${d}" fill="none" stroke="${COL.sup}" stroke-width="2.4" stroke-linejoin="round"/>`;
          s += t(cx, ret + 30, rm.name, { fs: 10.5, b: true }) + t(cx, ret + 44, `${rm.area} м²`, { fs: 10, c: MUTE });
          return;
        }
        const maxW = Math.max(28, step - 40), secs = Math.max(1, rm.sections || 4);
        const rad = radiator(0, 0, secs, maxW);
        const rx = cx - rad.w / 2, ry = sup + 62;
        s += radiator(rx, ry, secs, maxW).s;
        if (h.system === "oneTube") {
          s += pipe([[rx - 10, ret], [rx - 10, ry + 8], [rx, ry + 8]], COL.sup, 3.5) + pipe([[rx + rad.w, ry + 44], [rx + rad.w + 10, ry + 44], [rx + rad.w + 10, ret]], COL.ret, 3.5);
          s += `<line x1="${rx - 10}" y1="${ret - 12}" x2="${rx + rad.w + 10}" y2="${ret - 12}" stroke="${COL.circ}" stroke-width="3"/>` + t(cx, ret - 18, "байпас", { fs: 9, c: MUTE });
        } else {
          s += pipe([[rx - 12, sup], [rx - 12, ry + 8], [rx, ry + 8]], COL.sup, 3.5) + pipe([[rx + rad.w, ry + 44], [rx + rad.w + 12, ry + 44], [rx + rad.w + 12, ret]], COL.ret, 3.5);
        }
        s += valveV(rx - 12, ry - 18) + `<rect x="${rx - 22}" y="${ry - 6}" width="20" height="9" rx="3" fill="#eceff1" stroke="${INK}" stroke-width="1"/>`;
        s += t(cx, ret + 30, rm.name, { fs: 10.5, b: true }) + t(cx, ret + 44, rm.sections ? `${rm.sections} секц.` : rm.radLabel, { fs: 10, c: MUTE });
      });
      s += lines(16, ret + 74, ["1 группа безопасности: манометр, клапан 3 бар, воздухоотводчик", "2, 3, 7 краны   4 насос   5 расширительный бак   6 фильтр"]);
      H = ret + 110;
    }
    H += 10;
    return `<svg class="montage" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,'Segoe UI',Roboto,Arial,sans-serif" role="img" aria-label="Монтажная схема водоснабжения и отопления"><rect width="${W}" height="${H}" fill="#fbfcfd"/>${s}</svg>`;
  }
  function lines(x, y, arr) {
    return arr.map((s, i) => t(x, y + i * 15, s, { a: "start", fs: 10.5, c: MUTE })).join("");
  }

  const api = { montageSvg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Montage = api;
})(typeof window !== "undefined" ? window : globalThis);
