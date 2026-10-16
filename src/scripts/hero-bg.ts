/* Живой фон первого экрана вместо видео: конструкционная сетка с мятными крестиками,
   пунктирные маршруты согласования и импульсы-заявки, которые сходятся к знаку X.
   Рисуется на <canvas data-hero-canvas>. Работает только когда экран видим;
   при prefers-reduced-motion — один статичный кадр. */

const XPATH = 'M 60.34 17 C 57.09 22.33 48.58 25.87 39.06 25.87 L 54.88 0 L 70.75 0 Z M 54.88 57.76 L 42.72 37.87 C 41.32 35.6 38.49 34.17 35.38 34.17 C 32.27 34.17 29.42 35.6 28.03 37.87 L 15.87 57.76 L 0.01 57.76 L 10.41 40.76 C 13.67 35.44 22.18 31.88 31.69 31.88 L 39.06 31.88 C 48.58 31.88 57.09 35.44 60.34 40.76 L 70.75 57.76 Z M 15.87 0 L 31.69 25.87 C 22.18 25.87 13.67 22.33 10.41 17 L 0.01 0 Z';
const MINT = '34, 242, 207';

type Pt = { x: number; y: number };
type Route = { pts: Pt[]; len: number; segs: number[]; next: number; flash: number };
type Pulse = { r: Route; d: number; v: number };
type Tag = { x: number; y: number; text: string; t: number };

// мини-события у узлов: заявки, которые уходят по маршруту
const TAGS = {
  ru: ['Счёт № 1284 · 184 500 ₽', 'Закупка № 311 · согласована', 'Отпуск · согласован', 'Заявка на оплату', 'Timesheet · 8 ч', 'Авансовый отчёт', 'Передача дел · принята', 'Invoice Tracker · оплачен'],
  en: ['Invoice No. 1284 · $2,200', 'Purchase No. 311 · approved', 'Leave · approved', 'Payment request', 'Timesheet · 8 h', 'Expense report', 'Handover · accepted', 'Invoice Tracker · paid'],
};

// детерминированный «случай», чтобы рисунок не прыгал при перезагрузке
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initHeroBg(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const xPath = new Path2D(XPATH);
  let W = 0, H = 0, dpr = 1, cell = 64, hub: Pt = { x: 0, y: 0 }, xScale = 3;
  let routes: Route[] = [];
  let crosses: { x: number; y: number; ph: number }[] = [];
  let pulses: Pulse[] = [];
  let ripples: { t: number }[] = [];
  let tags: Tag[] = [];
  const labels = document.documentElement.lang === 'en' ? TAGS.en : TAGS.ru;
  const withTags = canvas.dataset.tags !== 'off'; // на странице цен справа карточка — плашки выключены
  let tagIdx = 0, tagCooldown = 1.2;
  let mx = 0.5, my = 0.5, px = 0, py = 0; // курсор и сглаженный параллакс
  let running = false, raf = 0, last = 0, time = 0;

  const build = () => {
    const r = canvas.getBoundingClientRect();
    W = r.width; H = r.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const mobile = W < 768;
    cell = mobile ? 44 : W < 1200 ? 56 : 64;
    // узел-хаб со знаком X: справа на десктопе, внизу справа на телефоне
    const snap = (v: number) => Math.round(v / cell) * cell;
    // знак — в свободном месте справа, ниже самой длинной строки заголовка
    hub = { x: snap(W * (mobile ? 0.8 : 0.82)), y: snap(H * (mobile ? 0.93 : 0.68)) };
    xScale = (mobile ? 120 : W < 1200 ? 190 : 250) / 70.75;
    const rand = rng(20261016);
    const cols = Math.ceil(W / cell) + 1, rows = Math.ceil(H / cell) + 1;
    crosses = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (rand() < 0.06) crosses.push({ x: i * cell, y: j * cell, ph: rand() * Math.PI * 2 });
    // маршруты: из узлов по краям сетки к хабу, ломаные «как дорожки» — сначала по горизонтали, потом по вертикали
    routes = [];
    const n = mobile ? 9 : 16;
    for (let k = 0; k < n; k++) {
      let s: Pt;
      for (let tries = 0; ; tries++) {
        s = { x: Math.floor(rand() * cols) * cell, y: Math.floor(rand() * rows) * cell };
        const far = Math.hypot(s.x - hub.x, s.y - hub.y) > cell * 4;
        const notUnderText = mobile || s.x > W * 0.42 || rand() < 0.25; // под текстом слева маршрутов меньше
        if ((far && notUnderText) || tries > 40) break;
      }
      const hFirst = rand() < 0.5;
      const mid = hFirst ? { x: hub.x, y: s.y } : { x: s.x, y: hub.y };
      // небольшой «излом» в середине пути, чтобы маршруты не были одинаковыми
      const jog = Math.round((rand() - 0.5) * 4) * cell;
      const pts = hFirst
        ? [s, { x: s.x + (hub.x - s.x) / 2 + jog, y: s.y }, { x: s.x + (hub.x - s.x) / 2 + jog, y: (s.y + hub.y) / 2 }, { x: hub.x, y: (s.y + hub.y) / 2 }, hub]
        : [s, { x: s.x, y: mid.y }, hub];
      const clean = pts.map((p) => ({ x: Math.round(p.x / cell) * cell, y: Math.round(p.y / cell) * cell }));
      clean[clean.length - 1] = hub;
      const segs: number[] = [];
      let len = 0;
      for (let i = 1; i < clean.length; i++) { const d = Math.abs(clean[i].x - clean[i - 1].x) + Math.abs(clean[i].y - clean[i - 1].y); segs.push(d); len += d; }
      routes.push({ pts: clean, len, segs, next: rand() * 4, flash: 0 });
    }
    pulses = [];
    // для статичного кадра — импульсы уже в пути
    if (reduce) routes.forEach((r, i) => pulses.push({ r, d: r.len * ((i * 0.37) % 0.9 + 0.05), v: 0 }));
  };

  const pointAt = (r: Route, d: number): Pt => {
    let acc = 0;
    for (let i = 0; i < r.segs.length; i++) {
      if (d <= acc + r.segs[i]) {
        const a = r.pts[i], b = r.pts[i + 1], t = r.segs[i] ? (d - acc) / r.segs[i] : 0;
        return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      acc += r.segs[i];
    }
    return r.pts[r.pts.length - 1];
  };

  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(px, py);

    // сетка
    ctx.strokeStyle = 'rgba(255,255,255,0.065)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W + cell; x += cell) { ctx.moveTo(x + 0.5, -cell); ctx.lineTo(x + 0.5, H + cell); }
    for (let y = 0; y <= H + cell; y += cell) { ctx.moveTo(-cell, y + 0.5); ctx.lineTo(W + cell, y + 0.5); }
    ctx.stroke();

    // мятные крестики на пересечениях
    for (const c of crosses) {
      const a = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(time * 0.8 + c.ph));
      ctx.strokeStyle = `rgba(${MINT},${a})`;
      ctx.beginPath(); ctx.moveTo(c.x - 4, c.y); ctx.lineTo(c.x + 4, c.y); ctx.moveTo(c.x, c.y - 4); ctx.lineTo(c.x, c.y + 4); ctx.stroke();
    }

    // свечение за знаком X
    const breathe = 1 + 0.04 * Math.sin(time * 0.9) + Math.min(0.12, ripples.length * 0.02);
    const gr = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, 70.75 * xScale * 1.6 * breathe);
    gr.addColorStop(0, `rgba(${MINT},0.22)`);
    gr.addColorStop(0.45, `rgba(${MINT},0.07)`);
    gr.addColorStop(1, `rgba(${MINT},0)`);
    ctx.fillStyle = gr;
    ctx.fillRect(hub.x - 400, hub.y - 400, 800, 800);

    // маршруты — пунктир
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = -time * 14;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    for (const r of routes) {
      ctx.beginPath(); ctx.moveTo(r.pts[0].x, r.pts[0].y);
      for (let i = 1; i < r.pts.length; i++) ctx.lineTo(r.pts[i].x, r.pts[i].y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // узлы-источники: точка и вспышка при отправке заявки
    for (const r of routes) {
      const s = r.pts[0];
      ctx.fillStyle = `rgba(${MINT},0.75)`;
      ctx.beginPath(); ctx.arc(s.x, s.y, 2.6, 0, Math.PI * 2); ctx.fill();
      if (r.flash > 0) {
        ctx.strokeStyle = `rgba(${MINT},${r.flash * 0.6})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, 3 + (1 - r.flash) * 14, 0, Math.PI * 2); ctx.stroke();
      }
    }

    // импульсы: яркая голова и затухающий хвост вдоль маршрута
    for (const p of pulses) {
      const tail = 70;
      for (let k = 0; k < 10; k++) {
        const d = p.d - (tail * k) / 10;
        if (d < 0) break;
        const q = pointAt(p.r, d);
        ctx.fillStyle = `rgba(${MINT},${0.5 * (1 - k / 10)})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, 2.2 * (1 - k / 14), 0, Math.PI * 2); ctx.fill();
      }
      const h = pointAt(p.r, p.d);
      ctx.shadowColor = `rgba(${MINT},0.9)`; ctx.shadowBlur = 12;
      ctx.fillStyle = '#c9fff5';
      ctx.beginPath(); ctx.arc(h.x, h.y, 2.8, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // кольца от «пришедших» заявок
    for (const rp of ripples) {
      ctx.strokeStyle = `rgba(${MINT},${0.45 * (1 - rp.t)})`;
      ctx.beginPath(); ctx.arc(hub.x, hub.y, 40 + rp.t * 150, 0, Math.PI * 2); ctx.stroke();
    }

    // мини-события: плашка появляется у узла, поднимается и гаснет
    ctx.font = '500 12px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
    ctx.textBaseline = 'middle';
    for (const tg of tags) {
      const a = tg.t < 0.15 ? tg.t / 0.15 : tg.t > 0.75 ? (1 - tg.t) / 0.25 : 1;
      const y = tg.y - 26 - tg.t * 14;
      const w = ctx.measureText(tg.text).width + 34;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(12,12,12,0.92)';
      ctx.strokeStyle = `rgba(${MINT},0.35)`;
      ctx.beginPath(); ctx.roundRect(tg.x - 12, y - 13, w, 26, 13); ctx.fill(); ctx.stroke();
      ctx.fillStyle = `rgb(${MINT})`;
      ctx.beginPath(); ctx.arc(tg.x + 2, y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#e6e6e6';
      ctx.fillText(tg.text, tg.x + 12, y + 0.5);
      ctx.globalAlpha = 1;
    }

    // знак X
    ctx.save();
    ctx.translate(hub.x - (70.75 * xScale) / 2, hub.y - (57.77 * xScale) / 2);
    ctx.scale(xScale, xScale);
    ctx.fillStyle = `rgba(${MINT},0.10)`;
    ctx.fill(xPath);
    ctx.lineWidth = 1.2 / xScale;
    ctx.strokeStyle = `rgba(${MINT},0.55)`;
    ctx.stroke(xPath);
    ctx.restore();

    ctx.restore();
  };

  const step = (now: number) => {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now; time += dt;
    // параллакс за курсором
    px += ((0.5 - mx) * 24 - px) * 0.06;
    py += ((0.5 - my) * 16 - py) * 0.06;
    for (const r of routes) {
      r.flash = Math.max(0, r.flash - dt * 1.6);
      r.next -= dt;
      if (r.next <= 0) {
        pulses.push({ r, d: 0, v: 110 + Math.random() * 90 }); r.flash = 1; r.next = 2.5 + Math.random() * 5;
        // иногда у отправившего узла всплывает плашка-событие (не под текстом слева и не у краёв)
        const s0 = r.pts[0];
        const free = tags.every((tg) => Math.abs(tg.x - s0.x) > 260 || Math.abs(tg.y - s0.y) > 56);
        if (withTags && free && tagCooldown <= 0 && tags.length < (W < 768 ? 0 : 3) && s0.x > W * 0.5 && s0.x < W - 230 && s0.y > 110 && s0.y < H * 0.78) {
          tags.push({ x: s0.x, y: s0.y, text: labels[tagIdx++ % labels.length], t: 0 });
          tagCooldown = 1.6;
        }
      }
    }
    for (const p of pulses) p.d += p.v * dt;
    pulses = pulses.filter((p) => {
      if (p.d < p.r.len) return true;
      ripples.push({ t: 0 });
      return false;
    });
    ripples.forEach((rp) => (rp.t += dt * 0.9));
    tagCooldown -= dt;
    tags.forEach((tg) => (tg.t += dt / 3.2));
    tags = tags.filter((tg) => tg.t < 1);
    ripples = ripples.filter((rp) => rp.t < 1);
    draw();
    if (running) raf = requestAnimationFrame(step);
  };

  const start = () => { if (running || reduce) return; running = true; last = 0; raf = requestAnimationFrame(step); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  build();
  draw();
  canvas.classList.add('is-ready');

  new ResizeObserver(() => { build(); draw(); }).observe(canvas);
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !document.hidden) start(); else stop(); }, { threshold: 0 }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else if (visible) start(); });
  window.addEventListener('pointermove', (e) => { mx = e.clientX / window.innerWidth; my = e.clientY / window.innerHeight; }, { passive: true });
}

document.querySelectorAll<HTMLCanvasElement>('[data-hero-canvas]').forEach(initHeroBg);
