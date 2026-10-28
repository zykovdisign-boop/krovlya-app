/* Редактор плана дома (общий с «Сантехник PRO», правки переносить в обе копии): комнаты-прямоугольники, перетаскивание, размер за угол, точки (стояк, щит).
   Не зависит от сантехники — подключается и в электрике. Координаты в метрах, шаг 0,1 м. */
(function () {
  const STICK = 0.3, K = 100; // K: метры → единицы SVG (см)
  const r1 = (v) => Math.round(v * 10) / 10;
  const fm = (v) => (Math.round(v * 10) / 10).toLocaleString("ru-RU");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function bounds(rooms, points) {
    const xs = [], ys = [];
    rooms.forEach((r) => { if (r.rect) { xs.push(r.rect.x, r.rect.x + r.rect.w); ys.push(r.rect.y, r.rect.y + r.rect.h); } });
    points.forEach((p) => { xs.push(p.x); ys.push(p.y); });
    if (!xs.length) return { x: 0, y: 0, w: 8, h: 6 };
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  }
  function viewBox(rooms, points) {
    const b = bounds(rooms, points), m = 0.9;
    const w = Math.max(6, b.w + 2 * m), h = Math.max(4, b.h + 2 * m);
    return { x: (b.x - m - (w - b.w - 2 * m) / 2) * K, y: (b.y - m - (h - b.h - 2 * m) / 2) * K, w: w * K, h: h * K };
  }

  // Подпись в комнате: имя, размеры, доп. строка. Шрифт подстраивается под размер плана и комнаты.
  function roomSvg(r, fs) {
    const { x, y, w, h } = r.rect;
    return `<rect data-room="${r.id}" style="cursor:move" x="${x * K}" y="${y * K}" width="${w * K}" height="${h * K}" fill="${r.fill || "#ffffff"}" stroke="#37474f" stroke-width="${fs * 0.2}"/>`;
  }
  // Подписи рисуются поверх трасс, с белой обводкой, и не ловят касания.
  function labelSvg(r, fs, sel) {
    const { x, y, w, h } = r.rect, X = x * K, Y = y * K, W = w * K, H = h * K;
    const f = Math.min(fs, W / 7, H / 3.2);
    let s = `<g pointer-events="none" paint-order="stroke" stroke="#fff" stroke-width="${f * 0.22}" stroke-linejoin="round">`;
    if (sel) s += `<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="none" stroke="#0277bd" stroke-width="${fs * 0.3}"/>`;
    s += `<text x="${X + W / 2}" y="${Y + H / 2 - f * 0.25}" font-size="${f}" font-weight="700" text-anchor="middle" fill="#263238">${esc(r.name)}</text>`;
    s += `<text x="${X + W / 2}" y="${Y + H / 2 + f * 0.95}" font-size="${f * 0.78}" text-anchor="middle" fill="#607d8b">${fm(w)} × ${fm(h)} м</text>`;
    if (r.note) s += `<text x="${X + W / 2}" y="${Y + H / 2 + f * 2}" font-size="${f * 0.72}" text-anchor="middle" fill="${r.noteColor || "#607d8b"}">${esc(r.note)}</text>`;
    s += `</g>`;
    if (sel) {
      s += `<circle data-handle="${r.id}" cx="${X + W}" cy="${Y + H}" r="${fs * 1.5}" fill="transparent" style="cursor:nwse-resize"/>`;
      s += `<circle cx="${X + W}" cy="${Y + H}" r="${fs * 0.55}" fill="#0277bd" stroke="#fff" stroke-width="${fs * 0.15}" pointer-events="none"/>`;
    }
    return s;
  }
  function pointSvg(p, fs) {
    const X = p.x * K, Y = p.y * K;
    return `<g data-point="${p.id}" style="cursor:move"><circle cx="${X}" cy="${Y}" r="${fs * 1.6}" fill="transparent"/>
      <circle cx="${X}" cy="${Y}" r="${fs * 0.7}" fill="${p.color || "#1565c0"}" stroke="#fff" stroke-width="${fs * 0.18}"/>
      <text x="${X + fs}" y="${Y - fs * 0.9}" font-size="${fs * 0.85}" font-weight="700" fill="${p.color || "#1565c0"}">${esc(p.label)}</text></g>`;
  }
  function gridSvg(vb, fs) {
    let s = "";
    for (let x = Math.ceil(vb.x / 50) * 50; x <= vb.x + vb.w; x += 50) s += `<line x1="${x}" y1="${vb.y}" x2="${x}" y2="${vb.y + vb.h}" stroke="${x % 100 ? "#eef2f6" : "#dfe6ee"}" stroke-width="${fs * 0.06}"/>`;
    for (let y = Math.ceil(vb.y / 50) * 50; y <= vb.y + vb.h; y += 50) s += `<line x1="${vb.x}" y1="${y}" x2="${vb.x + vb.w}" y2="${y}" stroke="${y % 100 ? "#eef2f6" : "#dfe6ee"}" stroke-width="${fs * 0.06}"/>`;
    return s;
  }
  // Масштабная линейка 1 м в левом нижнем углу.
  function scaleSvg(vb, fs) {
    const x = vb.x + fs, y = vb.y + vb.h - fs;
    return `<g pointer-events="none"><line x1="${x}" y1="${y}" x2="${x + K}" y2="${y}" stroke="#455a64" stroke-width="${fs * 0.15}"/>
      <line x1="${x}" y1="${y - fs * 0.35}" x2="${x}" y2="${y + fs * 0.35}" stroke="#455a64" stroke-width="${fs * 0.15}"/>
      <line x1="${x + K}" y1="${y - fs * 0.35}" x2="${x + K}" y2="${y + fs * 0.35}" stroke="#455a64" stroke-width="${fs * 0.15}"/>
      <text x="${x + K / 2}" y="${y - fs * 0.6}" font-size="${fs * 0.75}" text-anchor="middle" fill="#455a64">1 м</text></g>`;
  }

  // Статичная картинка плана. overlay(fs, K) — функция, рисующая трассы поверх комнат.
  function svg(o) {
    const rooms = (o.rooms || []).filter((r) => r.rect), points = o.points || [];
    const vb = o.vb || viewBox(rooms, points);
    const fs = Math.max(vb.w, vb.h * 1.4) / 34;
    const body = gridSvg(vb, fs) + rooms.map((r) => roomSvg(r, fs)).join("") + (o.overlay ? `<g pointer-events="none">${o.overlay(fs, K)}</g>` : "")
      + rooms.map((r) => labelSvg(r, fs, r.id === o.sel)).join("") + points.map((p) => pointSvg(p, fs)).join("") + scaleSvg(vb, fs);
    return `<svg class="${o.cls || "plan-svg"}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system,'Segoe UI',Roboto,Arial,sans-serif" role="img" aria-label="План дома">${body}</svg>`;
  }

  // Прилипание к краям других комнат: возвращает поправку, если ближе STICK.
  function stick(vals, targets) {
    let best = null;
    vals.forEach((v) => targets.forEach((t) => { const d = t - v; if (Math.abs(d) < STICK && (best === null || Math.abs(d) < Math.abs(best))) best = d; }));
    return best || 0;
  }

  /* Интерактивный редактор.
     o.getRooms() → [{ id, name, rect, fill, note }] — rect меняется на месте
     o.getPoints() → [{ id, label, x, y, color }] — x, y меняются на месте
     o.overlay(fs, K) — трассы; o.onChange() — после каждого изменения; o.onSelect(id) */
  function mount(el, o) {
    let sel = null, drag = null, vb = null;
    el.innerHTML = `<div class="pe-wrap"></div><div class="pe-panel"></div>`;
    const wrap = el.querySelector(".pe-wrap"), panel = el.querySelector(".pe-panel");

    function draw(keepVb) {
      const rooms = o.getRooms().filter((r) => r.rect), points = o.getPoints();
      if (!keepVb || !vb) vb = viewBox(rooms, points);
      wrap.innerHTML = svg({ rooms, points, vb, sel, overlay: o.overlay, cls: "plan-svg edit" });
    }
    function drawPanel() {
      const r = o.getRooms().find((x) => x.id === sel);
      if (!r || !r.rect) { panel.innerHTML = `<p class="note" style="margin:6px 2px 0">Нажмите на комнату, чтобы задать точные размеры.</p>`; return; }
      panel.innerHTML = `<div class="pe-sel"><b>${esc(r.name)}</b>
        <label class="f">Ширина, м<input data-pe="w" type="number" inputmode="decimal" step="0.1" min="0.5" value="${fm(r.rect.w).replace(",", ".")}"></label>
        <label class="f">Длина, м<input data-pe="h" type="number" inputmode="decimal" step="0.1" min="0.5" value="${fm(r.rect.h).replace(",", ".")}"></label>
        <button type="button" class="pe-rot" data-pe-rot aria-label="Повернуть комнату">⟲</button></div>`;
    }
    function render() { draw(false); drawPanel(); }

    const toPlan = (e) => {
      const s = wrap.querySelector("svg"), pt = s.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(s.getScreenCTM().inverse());
      return { x: p.x / K, y: p.y / K };
    };

    wrap.addEventListener("pointerdown", (e) => {
      const h = e.target.closest("[data-handle]"), g = e.target.closest("[data-room]"), pt = e.target.closest("[data-point]");
      if (!h && !g && !pt) { if (sel) { sel = null; draw(true); drawPanel(); if (o.onSelect) o.onSelect(null); } return; }
      e.preventDefault();
      const start = toPlan(e);
      if (pt) { const P = o.getPoints().find((x) => x.id === pt.dataset.point); drag = { kind: "point", P, start, ox: P.x, oy: P.y }; }
      else {
        const id = (h || g).dataset.handle || (h || g).dataset.room;
        const r = o.getRooms().find((x) => x.id === id);
        drag = { kind: h ? "size" : "move", r, start, o: Object.assign({}, r.rect), moved: false, sx: e.clientX, sy: e.clientY };
      }
      try { wrap.setPointerCapture(e.pointerId); } catch (_) { /* указатель уже отпущен */ }
    });
    wrap.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (Math.abs(e.clientX - (drag.sx || e.clientX)) + Math.abs(e.clientY - (drag.sy || e.clientY)) > 4) drag.moved = true;
      if (drag.kind !== "point" && !drag.moved) return;
      const p = toPlan(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
      const others = o.getRooms().filter((x) => x.rect && (!drag.r || x.id !== drag.r.id));
      const ex = others.flatMap((x) => [x.rect.x, x.rect.x + x.rect.w]), ey = others.flatMap((x) => [x.rect.y, x.rect.y + x.rect.h]);
      if (drag.kind === "point") {
        let nx = drag.ox + dx, ny = drag.oy + dy;
        nx += stick([nx], ex); ny += stick([ny], ey);
        drag.P.x = r1(nx); drag.P.y = r1(ny);
      } else if (drag.kind === "move") {
        let nx = drag.o.x + dx, ny = drag.o.y + dy;
        nx += stick([nx, nx + drag.o.w], ex); ny += stick([ny, ny + drag.o.h], ey);
        drag.r.rect.x = r1(nx); drag.r.rect.y = r1(ny);
      } else {
        let rx = drag.o.x + drag.o.w + dx, ry = drag.o.y + drag.o.h + dy;
        rx += stick([rx], ex); ry += stick([ry], ey);
        drag.r.rect.w = r1(Math.max(0.5, rx - drag.o.x)); drag.r.rect.h = r1(Math.max(0.5, ry - drag.o.y));
      }
      draw(true);
    });
    const end = () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.kind !== "point" && !d.moved) { sel = d.r.id; if (o.onSelect) o.onSelect(sel); draw(true); drawPanel(); return; }
      if (d.r && d.kind !== "point") sel = d.r.id;
      render(); if (o.onChange) o.onChange();
    };
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);

    panel.addEventListener("input", (e) => {
      const k = e.target.dataset.pe, r = o.getRooms().find((x) => x.id === sel);
      if (!k || !r) return;
      const v = Number(String(e.target.value).replace(",", "."));
      if (!(v >= 0.5 && v <= 50)) return;
      r.rect[k] = r1(v); draw(false); if (o.onChange) o.onChange();
    });
    panel.addEventListener("click", (e) => {
      if (!e.target.closest("[data-pe-rot]")) return;
      const r = o.getRooms().find((x) => x.id === sel);
      if (!r) return;
      const { w, h } = r.rect; r.rect.w = h; r.rect.h = w;
      render(); if (o.onChange) o.onChange();
    });

    render();
    return { render, select(id) { sel = id; render(); } };
  }

  window.PlanEditor = { svg, mount, viewBox, K };
})();
