/* Монтажная схема щита: модули на DIN-рейках и провода между ними.
   Фаза — красная (3 фазы: коричневая, чёрная, серая), N — синий, PE — жёлто-зелёный.
   Цепочка ввода идёт последовательно, у каждого УЗО своя гребёнка и своя шина N. */
(function (root) {
  const MW = 34, MH = 112, PAD = 40, CH = 132, LANE = 6;
  const COL = { L: "#e53935", L1: "#8d4a1f", L2: "#263238", L3: "#9e9e9e", N: "#1e88e5", PE: "#d4b800" };
  const GROUP = ["#1565c0", "#2e7d32", "#ef6c00", "#7b1fa2", "#00796b", "#c62828", "#4e342e", "#283593"];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function wiringSvg(r) {
    const ph3 = r.phases === 3, rows = r.rows, n = rows.length, per = r.box.perRow;
    const W = PAD * 2 + per * MW;
    const chanTop = (k) => k * (MH + CH);
    const rowTop = (i) => CH + i * (MH + CH);
    const barsY = chanTop(n) + CH + 10;
    const H = barsY + 70;
    const Lname = (f) => (ph3 ? "L" + (f || 1) : "L");

    // раскладка модулей и клеммы: у каждого полюса верхняя и нижняя клемма
    const place = [];
    rows.forEach((row, i) => {
      let x = PAD;
      row.forEach((m) => { place.push({ m, row: i, x, w: m.w * MW }); x += m.w * MW; });
    });
    let relayN = 0;
    const poles = (p) => {
      const k = p.m.kind;
      if (k === "in") return ph3 ? ["L1", "L2", "L3"] : ["L", "N"];
      if (k === "meter" || k === "spd" || k === "fire") return ph3 ? ["L1", "L2", "L3", "N"] : ["L", "N"];
      if (k === "relay") return [ph3 ? "L" + (++relayN) : "L", "N"];
      if (k === "rcd" || k === "diff") return [Lname(p.m.phase), "N"];
      return [Lname(p.m.phase)];
    };
    place.forEach((p) => {
      p.c = poles(p);
      const step = p.w / p.c.length;
      p.term = {};
      p.c.forEach((c, j) => {
        const x = p.x + step * (j + 0.5);
        p.term[c] = { top: { x, y: rowTop(p.row) + 13, ch: p.row, seam: p.x }, bot: { x, y: rowTop(p.row) + MH - 13, ch: p.row + 1 } };
      });
    });

    // провода: ортогональные трассы по каналам между рядами, у каждого провода своя дорожка
    const lanes = {}, seams = {};
    let marginR = 0, marginL = 0;
    // в каналах под рядами сверху идут номера отходящих линий, поэтому дорожки начинаются ниже
    const laneY = (ch) => {
      lanes[ch] = (lanes[ch] || 0) + 1;
      const top = ch === 0 ? 16 : 54, cnt = Math.floor((CH - top - 12) / LANE);
      return chanTop(ch) + top + ((lanes[ch] - 1) % cnt) * LANE;
    };
    const wires = [];
    function route(a, b, color, left) {
      let pts;
      if (a.ch === b.ch) { const y = laneY(a.ch); pts = [a, { x: a.x, y }, { x: b.x, y }, b]; }
      else if (a.ch === b.ch + 1 && b.seam !== undefined) {
        const k = (seams[b.seam] = (seams[b.seam] || 0) + 1);
        const sx = b.seam - 2 - (k - 1) * 4, y1 = laneY(a.ch), y2 = laneY(b.ch);
        pts = [a, { x: a.x, y: y1 }, { x: sx, y: y1 }, { x: sx, y: y2 }, { x: b.x, y: y2 }, b];
      } else {
        const mx = left ? PAD - 12 - (marginL++) * 5 : W - PAD + 12 + (marginR++) * 5;
        const y1 = laneY(a.ch), y2 = b.ch >= n ? b.y - 14 - ((lanes.bar = (lanes.bar || 0) + 1) % 6) * 4 : laneY(b.ch);
        pts = [a, { x: a.x, y: y1 }, { x: mx, y: y1 }, { x: mx, y: y2 }, { x: b.x, y: y2 }, b];
      }
      wires.push({ pts, color });
    }

    // шины внизу: PE, общая N, по одной N на каждое УЗО
    const bars = [{ key: "PE", label: "PE", color: COL.PE }, { key: "N", label: "N", color: COL.N }];
    place.filter((p) => p.m.kind === "rcd").forEach((p) => bars.push({ key: "N" + p.m.group, label: "N · УЗО " + p.m.group, color: COL.N, ring: GROUP[(p.m.group - 1) % GROUP.length] }));
    const barW = Math.min(150, (W - PAD * 2 - (bars.length - 1) * 12) / bars.length);
    bars.forEach((b, i) => { b.x = PAD + i * (barW + 12); b.used = 0; });
    const barPt = (key) => {
      const b = bars.find((x) => x.key === key);
      const holes = Math.max(4, Math.floor(barW / 11));
      const x = b.x + 8 + (b.used++ % holes) * ((barW - 16) / (holes - 1));
      return { x, y: barsY, ch: n };
    };

    // вход кабеля сверху слева
    const conds = ph3 ? ["L1", "L2", "L3", "N", "PE"] : ["L", "N", "PE"];
    const src = {};
    conds.forEach((c, i) => { src[c] = { x: PAD + 6 + i * 8, y: 0, ch: 0 }; });
    const cableIn = conds.map((c, i) => ({ c, x: PAD + 6 + i * 8 }));

    // последовательная цепочка ввода и защиты
    place.filter((p) => ["in", "meter", "relay", "spd", "fire"].includes(p.m.kind)).forEach((p) => {
      p.c.forEach((c) => {
        const tap = p.m.kind === "spd" || (p.m.kind === "relay" && c === "N" && ph3);
        route(src[c], p.term[c].top, COL[c] || COL.L);
        if (!tap) src[c] = p.term[c].bot;
      });
      if (p.m.kind === "spd") route(p.term[p.c[0]].bot, barPt("PE"), COL.PE, true);
    });
    route(src.PE, barPt("PE"), COL.PE, true);
    route(src.N, barPt("N"), COL.N);

    // группы: УЗО → гребёнка над его автоматами; автоматы без УЗО — гребёнка от ввода
    // гребёнка: непрерывный отрезок автоматов одного питания в одном ряду; при переходе на новый ряд — перемычка
    // УЗО и первая гребёнка без УЗО питаются перемычками по верху: от верхней клеммы предыдущего аппарата
    const combs = [], lastByKey = {}, topFeed = {};
    const feedFrom = (c) => topFeed[c] || src[c];
    const setFeed = (c, t, row) => { topFeed[c] = { x: t.x, y: t.y, ch: row }; };
    let feed = null;
    place.forEach((p, idx) => {
      const k = p.m.kind;
      if (k === "rcd") {
        const L = Lname(p.m.phase);
        route(feedFrom(L), p.term[L].top, COL[L]);
        route(feedFrom("N"), p.term.N.top, COL.N);
        setFeed(L, p.term[L].top, p.row); setFeed("N", p.term.N.top, p.row);
        route(p.term.N.bot, barPt("N" + p.m.group), COL.N);
        feed = { from: p.term[L].bot, key: "g" + p.m.group };
        return;
      }
      if (k !== "br" && k !== "diff") return;
      const L = Lname(p.m.phase);
      const inGroup = k === "br" && r.mode === "rcd" && p.m.line && p.m.line.rcd && feed;
      const key = inGroup ? feed.key : "main" + L;
      const prev = place[idx - 1], last = lastByKey[key];
      if (last && last === combs[combs.length - 1] && last.row === p.row && prev && prev.m.kind === k) { last.to = p; }
      else {
        const t = last && last.to.term[L].top;
        const from = last ? { x: t.x, y: t.y, ch: last.row } : inGroup ? feed.from : feedFrom(L);
        route(from, p.term[L].top, COL[L]);
        const c = { key, row: p.row, from: p, to: p, color: COL[L] };
        combs.push(c); lastByKey[key] = c;
      }
      if (k === "diff") route(barPt("N"), p.term.N.top, COL.N);
    });

    // рисование
    let s = `<defs><linearGradient id="wrRail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9ced4"/><stop offset=".5" stop-color="#eef0f2"/><stop offset="1" stop-color="#b5bcc3"/></linearGradient></defs>`;
    s += `<rect width="${W}" height="${H}" fill="#f7f8fa"/>`;
    for (let i = 0; i < n; i++) {
      const y = rowTop(i) + MH / 2 - 14;
      s += `<rect x="${PAD - 16}" y="${y}" width="${W - PAD * 2 + 32}" height="28" rx="2" fill="url(#wrRail)" stroke="#9aa3ab" stroke-width=".8"/>`;
      for (let x = PAD - 8; x < W - PAD + 8; x += 30) s += `<rect x="${x}" y="${y + 9}" width="18" height="10" rx="5" fill="#fff" stroke="#9aa3ab" stroke-width=".6"/>`;
    }
    place.forEach((p) => { s += moduleSvg(p, rowTop(p.row)); });
    // гребёнки
    combs.forEach((c) => {
      const y = rowTop(c.row) + 4, x1 = c.from.x + 4, x2 = c.to.x + c.to.w - 4;
      s += `<rect x="${x1}" y="${y}" width="${x2 - x1}" height="7" rx="2" fill="${c.color}" stroke="#00000033" stroke-width=".8"/>`;
      for (let x = c.from.x; x < c.to.x + c.to.w; x += MW) s += `<rect x="${x + MW / 2 - 2}" y="${y + 5}" width="4" height="6" fill="${c.color}"/>`;
    });
    // провода с тёмной обводкой, чтобы читались поверх модулей
    wires.forEach((w) => {
      const d = w.pts.map((q) => `${Math.round(q.x * 10) / 10},${Math.round(q.y * 10) / 10}`).join(" ");
      s += `<polyline points="${d}" fill="none" stroke="#00000040" stroke-width="5.5" stroke-linejoin="round" stroke-linecap="round"/>`;
      s += `<polyline points="${d}" fill="none" stroke="${w.color}" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (w.color === COL.PE) s += `<polyline points="${d}" fill="none" stroke="#2e7d32" stroke-width="3.6" stroke-dasharray="6 6" stroke-linejoin="round"/>`;
      const e = w.pts[w.pts.length - 1];
      s += `<circle cx="${e.x}" cy="${e.y}" r="2.6" fill="#37474f"/>`;
    });
    // ввод кабеля
    s += `<rect x="${cableIn[0].x - 6}" y="0" width="${cableIn.length * 8 + 4}" height="8" rx="3" fill="#455a64"/>`;
    s += `<text x="${cableIn[cableIn.length - 1].x + 10}" y="12" font-size="11" fill="#455a64">ввод</text>`;
    // отходящие линии
    place.filter((p) => p.m.kind === "br" || p.m.kind === "diff").forEach((p) => {
      const L = Lname(p.m.phase), t = p.term[L].bot, y0 = t.y, y1 = rowTop(p.row) + MH + 16;
      s += `<line x1="${t.x}" y1="${y0}" x2="${t.x}" y2="${y1}" stroke="${COL[L]}" stroke-width="3" stroke-linecap="round" stroke-dasharray="1 0"/>`;
      s += `<path d="M${t.x - 4} ${y1 - 4}L${t.x} ${y1 + 2}L${t.x + 4} ${y1 - 4}" fill="none" stroke="${COL[L]}" stroke-width="2"/>`;
      s += `<circle cx="${p.x + p.w / 2}" cy="${y1 + 13}" r="9" fill="#1a2e44"/><text x="${p.x + p.w / 2}" y="${y1 + 17}" font-size="10.5" font-weight="700" text-anchor="middle" fill="#fff">${p.m.n}</text>`;
    });
    // шины
    bars.forEach((b) => {
      s += `<rect x="${b.x}" y="${barsY - 7}" width="${barW}" height="14" rx="3" fill="${b.color}" stroke="${b.ring || "#00000055"}" stroke-width="${b.ring ? 2 : 1}"/>`;
      const holes = Math.max(4, Math.floor(barW / 11));
      for (let i = 0; i < holes; i++) s += `<circle cx="${b.x + 8 + i * ((barW - 16) / (holes - 1))}" cy="${barsY}" r="3" fill="#e0e0e0" stroke="#555" stroke-width=".7"/>`;
      s += `<text x="${b.x + barW / 2}" y="${barsY + 24}" font-size="11" font-weight="700" text-anchor="middle" fill="${b.ring || "#37474f"}">${b.label}</text>`;
    });
    s += `<text x="${PAD - 16}" y="${H - 10}" font-size="10.5" fill="#607d8b">N и PE каждой линии — на свою шину; номера внизу — как на наклейках.</text>`;
    return `<svg class="wiring" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,'Segoe UI',Roboto,Arial,sans-serif" role="img" aria-label="Монтажная схема щита с проводами">${s}</svg>`;
  }

  // Модуль как настоящий: клеммы с винтами сверху и снизу, лицевая панель по типу аппарата.
  function moduleSvg(p, y) {
    const { m, x, w } = p, k = m.kind;
    let s = `<g><rect x="${x + 1}" y="${y}" width="${w - 2}" height="${MH}" rx="3" fill="#fbfbfb" stroke="#9aa3ab" stroke-width="1"/>`;
    s += `<rect x="${x + 1}" y="${y}" width="${w - 2}" height="24" rx="3" fill="#eceff1"/><rect x="${x + 1}" y="${y + MH - 24}" width="${w - 2}" height="24" rx="3" fill="#eceff1"/>`;
    Object.values(p.term).forEach((t) => [t.top, t.bot].forEach((q) => {
      s += `<circle cx="${q.x}" cy="${q.y}" r="5.5" fill="#d5dbe0" stroke="#5f6b75" stroke-width="1"/><path d="M${q.x - 3} ${q.y - 3}L${q.x + 3} ${q.y + 3}M${q.x + 3} ${q.y - 3}L${q.x - 3} ${q.y + 3}" stroke="#5f6b75" stroke-width="1"/>`;
    }));
    const cx = x + w / 2, cy = y + MH / 2;
    if (k === "relay") {
      s += `<rect x="${x + 5}" y="${cy - 17}" width="${w - 10}" height="20" rx="2" fill="#1b1b1b"/><text x="${cx}" y="${cy - 2}" font-size="13" font-weight="700" text-anchor="middle" fill="#ff3b30" font-family="monospace">230</text>`;
      s += `<text x="${cx}" y="${cy + 16}" font-size="7" text-anchor="middle" fill="#455a64">РЕЛЕ U</text>`;
    } else if (k === "meter") {
      s += `<rect x="${x + 10}" y="${cy - 18}" width="${w - 20}" height="22" rx="2" fill="#c5e1a5" stroke="#558b2f"/><text x="${cx}" y="${cy - 2}" font-size="12" text-anchor="middle" fill="#1b5e20" font-family="monospace">00000.0</text>`;
      s += `<text x="${cx}" y="${cy + 18}" font-size="8" text-anchor="middle" fill="#455a64">СЧЁТЧИК</text>`;
    } else if (k === "spd") {
      s += `<rect x="${x + 6}" y="${cy - 14}" width="${w - 12}" height="16" rx="2" fill="#81c784"/><text x="${cx}" y="${cy + 16}" font-size="8" text-anchor="middle" fill="#455a64">УЗИП</text>`;
    } else {
      const blue = k === "rcd" || k === "fire" || k === "diff";
      const tw = Math.min(16, w * 0.38);
      s += `<rect x="${cx - tw / 2}" y="${cy - 16}" width="${tw}" height="26" rx="3" fill="${blue ? "#1e88e5" : "#37474f"}"/><rect x="${cx - tw / 2 + 2}" y="${cy - 14}" width="${tw - 4}" height="10" rx="2" fill="#ffffff55"/>`;
      if (blue) s += `<rect x="${x + w - 13}" y="${cy - 16}" width="9" height="9" rx="1.5" fill="#fdd835" stroke="#795548" stroke-width=".6"/><text x="${x + w - 8.5}" y="${cy - 9}" font-size="7" font-weight="700" text-anchor="middle" fill="#3e2723">T</text>`;
      const lbl = k === "in" ? `${m.A}А` : k === "br" || k === "diff" ? `C${m.A}` : `${m.A}А`;
      s += `<text x="${cx}" y="${cy + 24}" font-size="${w > MW ? 11 : 9.5}" font-weight="800" text-anchor="middle" fill="#1a2e44">${lbl}</text>`;
      if (k === "rcd" || k === "fire") s += `<text x="${cx}" y="${y + 33}" font-size="7.5" text-anchor="middle" fill="#0d47a1">${k === "fire" ? "100 мА" : "30 мА"}</text>`;
      if (k === "in") s += `<text x="${cx}" y="${y + 33}" font-size="7.5" text-anchor="middle" fill="#455a64">ВВОД</text>`;
    }
    if (m.group) s += `<rect x="${x + 3}" y="${y + MH - 4}" width="${w - 6}" height="3" rx="1.5" fill="${GROUP[(m.group - 1) % GROUP.length]}"/>`;
    return s + `</g>`;
  }

  const api = { wiringSvg };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Wiring = api;
})(typeof window !== "undefined" ? window : globalThis);
