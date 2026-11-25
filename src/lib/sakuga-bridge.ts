/**
 * Bridge between DWNVRS native M3 controls and the shared window.SakugaFX canvas/clock.
 * All effects respect prefers-reduced-motion via fx.calm and use self-terminating springs.
 */

interface SpringRunOptions {
  low?: number;
  initialS?: number;
  pop?: number;
  tilt?: number;
  wide?: number;
  k?: number;
  d?: number;
  hold?: boolean;
}

interface ActiveSpringState {
  s: SakugaSpring;
  pop: SakugaSpring;
  tilt: SakugaSpring;
  wide: number;
  handle: { dead?: boolean };
}

interface NavClickSnapshot {
  wasActive: boolean;
  prevActiveX: number | null;
}

const activeSprings = new WeakMap<HTMLElement, ActiveSpringState>();
const buttonBackLayers = new WeakMap<HTMLElement, unknown>();
const inputKeyCounts = new WeakMap<HTMLElement, number>();
const filterSnapshot = new WeakMap<HTMLElement, { wasPressed: boolean; prevActiveX: number | null }>();
const navSnapshot = new WeakMap<HTMLElement, NavClickSnapshot>();

let paletteApplied = false;
let initialized = false;
let heldElement: HTMLElement | null = null;
let measureCanvasCtx: CanvasRenderingContext2D | null = null;

/**
 * Return the shared SakugaFX API and synchronize its canvas palette to Dark M3 once.
 */
export function getSakugaFx(): SakugaFXApi | null {
  if (typeof window === 'undefined') return null;
  const fx = window.SakugaFX;
  if (!fx) return null;
  if (!paletteApplied) {
    paletteApplied = true;
    Object.assign(fx.P, {
      fill: '#f4efff',
      shade: '#c8b6ff',
      line: '#8c52ff',
      accent: '#ff5fa8',
      ink: '#141218',
      sfx: ['#141218', '#f4efff'],
    });
  }
  return fx;
}

function isControlDisabled(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.disabled) return true;
  }
  return el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('disabled');
}

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCanvasCtx) return measureCanvasCtx;
  const canvas = document.createElement('canvas');
  measureCanvasCtx = canvas.getContext('2d');
  return measureCanvasCtx;
}

function releaseHeldSpring() {
  if (!heldElement) return;
  const state = activeSprings.get(heldElement);
  if (state) {
    state.s.to = 1;
  }
  heldElement = null;
}

/**
 * Run a volume-preserving spring transform on a native element on the shared SakugaFX clock.
 * Stops and cleans up inline styles automatically once settled.
 */
function animateElementSpring(el: HTMLElement, opts: SpringRunOptions = {}) {
  const fx = getSakugaFx();
  if (!fx || fx.calm) return;

  const existing = activeSprings.get(el);
  if (existing) {
    existing.handle.dead = true;
    activeSprings.delete(el);
  }

  const s = new fx.Spring(opts.initialS ?? 1, opts.k ?? 520, opts.d ?? 15);
  s.to = opts.hold ? (opts.low ?? 0.82) : 1;
  const pop = new fx.Spring(opts.pop ?? 1, 300, 12);
  pop.to = 1;
  const tilt = new fx.Spring(opts.tilt ?? 0, 260, 10);
  tilt.to = 0;

  const state: ActiveSpringState = {
    s,
    pop,
    tilt,
    wide: opts.wide ?? 0.28,
    handle: {},
  };

  el.dataset.sakugaSpring = 'active';
  el.style.willChange = 'transform';

  state.handle = fx.persist((_k, _t, dt) => {
    if (!el.isConnected || fx.calm) {
      state.handle.dead = true;
      activeSprings.delete(el);
      el.style.transform = '';
      el.style.willChange = '';
      delete el.dataset.sakugaSpring;
      return;
    }

    const y = state.s.step(dt);
    const p = state.pop.step(dt);
    const r = state.tilt.step(dt);
    const settled =
      state.s.to === 1 &&
      Math.abs(y - 1) < 0.001 &&
      Math.abs(state.s.v) < 0.01 &&
      Math.abs(p - 1) < 0.001 &&
      Math.abs(state.pop.v) < 0.01 &&
      Math.abs(r) < 0.02 &&
      Math.abs(state.tilt.v) < 0.05;

    if (settled) {
      el.style.transform = '';
      el.style.willChange = '';
      delete el.dataset.sakugaSpring;
      state.handle.dead = true;
      activeSprings.delete(el);
      return;
    }

    const sx = (1 + (1 - y) * state.wide) * p;
    const sy = y * p;
    el.style.transform = `rotate(${r.toFixed(2)}deg) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
  });

  activeSprings.set(el, state);
}

function getButtonTier(el: HTMLElement): 'accent' | 'danger' | 'standard' | null {
  if (!el.classList.contains('btn')) return null;
  if (el.classList.contains('btn-accent')) return 'accent';
  if (el.classList.contains('btn-danger')) return 'danger';
  if (el.classList.contains('btn-outlined') || el.classList.contains('btn-tonal') || el.classList.contains('btn-filled')) {
    return 'standard';
  }
  return null;
}

function getButtonBackLayer(btn: HTMLElement): unknown {
  const fx = getSakugaFx();
  if (!fx) return undefined;
  let layer = buttonBackLayers.get(btn);
  if (!layer) {
    layer = fx.Base.prototype.backLayer.call({ root: btn });
    buttonBackLayers.set(btn, layer);
  }
  return layer;
}

/**
 * Trigger Sakuga VFX when the hero lanyard ID card snaps back or is tapped on touch.
 */
export function triggerLanyardSakuga(
  cardEl: HTMLElement,
  mode: 'release' | 'tap',
  dx = 0,
  dy = 0,
): void {
  const fx = getSakugaFx();
  if (!fx || fx.calm) return;

  if (mode === 'tap') {
    const c = fx.at(cardEl, 1, 0);
    fx.ticks(c.x - 10, c.y + 8, { dir: -0.9, n: 3, r: 5, len: 12, fan: 0.4, life: 0.4 });
    fx.puff(c.x - 14, c.y + 12, { size: 6.5, n: 3, vx: 12, vy: -14, life: 0.48 });
    return;
  }

  const dist = Math.hypot(dx, dy);
  if (dist <= 35) return;

  const c = fx.at(cardEl);
  const snapAngle = Math.atan2(-dy, -dx);
  const side = dx >= 0 ? 1 : -1;

  fx.lines(c.x, c.y, { n: 6, dir: snapAngle, len: 48, spread: 24, life: 0.32 });
  fx.puff(c.x + side * (c.w * 0.35), c.y + c.h * 0.25, {
    size: 9,
    n: 4,
    vx: -dx * 0.25,
    vy: -16,
    life: 0.6,
  });

  if (dist > 95) {
    fx.sfx('shu', c.x, Math.max(window.scrollY + 42, c.y - c.h * 0.3), {
      size: 92,
      rot: -0.1,
      life: 0.72,
      ...fx.hollow(),
    });
    fx.shards(c.x, c.y, {
      n: 4,
      speed: 170,
      size: 5,
      life: 0.6,
      dir: snapAngle,
      arc: 1.4,
      grav: 280,
    });
  }
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t * t * t;
const easeBack = (t: number): number => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;

function viewportTicks(
  fx: SakugaFXApi,
  vx: number,
  vy: number,
  opts: { n?: number; r?: number; len?: number; dir?: number; life?: number; fan?: number } = {},
): void {
  const { n = 3, r = 16, len = 9, dir = -0.9, life = 0.4, fan = 0.42 } = opts;
  let handle: { dead?: boolean } = {};
  handle = fx.persist((_k, t) => {
    const g = fx.g;
    if (!g || fx.calm || t >= life) {
      handle.dead = true;
      return;
    }
    const k = t / life;
    const a = easeOut(clamp01(k / 0.5));
    const b = easeIn(clamp01((k - 0.4) / 0.6));
    g.translate(window.scrollX, window.scrollY);
    g.fillStyle = fx.P.accent;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const an = dir + (i - (n - 1) / 2) * fan;
      const r0 = r + len * b * 1.25;
      const r1 = r + len * a * 1.25;
      const hw = 0.07 + 2.2 / (r1 + 8);
      if (r1 - r0 < 0.6) continue;
      g.moveTo(vx + Math.cos(an) * r0, vy + Math.sin(an) * r0);
      g.lineTo(vx + Math.cos(an - hw) * r1, vy + Math.sin(an - hw) * r1);
      g.lineTo(vx + Math.cos(an + hw) * r1, vy + Math.sin(an + hw) * r1);
      g.closePath();
    }
    g.fill();
  });
}

function viewportPuff(
  fx: SakugaFXApi,
  vx: number,
  vy: number,
  opts: { n?: number; size?: number; vx?: number; vy?: number; life?: number; spread?: number } = {},
): void {
  const { n = 5, size = 13, vx: velX = 0, vy: velY = -18, life = 0.8, spread = 1 } = opts;
  const lobes = Array.from({ length: n }, (_, i) => ({
    a: (i / n) * fx.TAU + fx.rnd(0.6),
    d: fx.rnd(0.25, 0.9) * size * spread,
    r: fx.rnd(0.55, 1) * size,
    ph: fx.rnd(fx.TAU),
    sp: fx.rnd(0.6, 1.3),
  }));
  lobes.unshift({ a: 0, d: 0, r: size, ph: 0, sp: 1 });
  let handle: { dead?: boolean } = {};
  handle = fx.persist((_k, t) => {
    const g = fx.g;
    if (!g || fx.calm || t >= life) {
      handle.dead = true;
      return;
    }
    const k = t / life;
    const grow = easeBack(clamp01(t / 0.22));
    const die = 1 - easeIn(clamp01((k - 0.55) / 0.45));
    const px = vx + velX * easeOut(k) * life;
    const py = vy + velY * easeOut(k) * life;
    g.translate(window.scrollX, window.scrollY);
    fx.blob(
      lobes.map((l) => [
        px + Math.cos(l.a + t * 0.9 * l.sp) * l.d * (0.5 + easeOut(k) * 0.9),
        py + Math.sin(l.a + t * 0.9 * l.sp) * l.d * (0.5 + easeOut(k) * 0.9) - easeOut(k) * 5 * l.sp,
        l.r * grow * die * (1 + Math.sin(t * 9 + l.ph) * 0.05),
      ]),
      1.5,
      true,
      { lx: 0.5, arcs: size > 6.5, deep: 1.5 },
    );
  });
}

function viewportLines(
  fx: SakugaFXApi,
  vx: number,
  vy: number,
  opts: { n?: number; dir?: number; len?: number; spread?: number; life?: number } = {},
): void {
  const { n = 7, dir = Math.PI, len = 46, spread = 26, life = 0.3 } = opts;
  const strokes = Array.from({ length: n }, () => ({
    o: fx.rnd(-spread, spread),
    l: len * fx.rnd(0.5, 1.3),
    d: fx.rnd(0, 0.25),
    w: fx.rnd(1, 2.6),
  }));
  let handle: { dead?: boolean } = {};
  handle = fx.persist((_k, t) => {
    const g = fx.g;
    if (!g || fx.calm || t >= life) {
      handle.dead = true;
      return;
    }
    const k = t / life;
    g.translate(window.scrollX, window.scrollY);
    g.strokeStyle = fx.P.line;
    for (const s of strokes) {
      const kk = clamp01((k - s.d) / (1 - s.d));
      if (kk <= 0) continue;
      const a = easeOut(kk);
      const b = easeIn(kk);
      const px = vx - Math.sin(dir) * s.o;
      const py = vy + Math.cos(dir) * s.o;
      g.lineWidth = s.w * (1 - b);
      g.beginPath();
      g.moveTo(px + Math.cos(dir) * s.l * b * 1.4, py + Math.sin(dir) * s.l * b * 1.4);
      g.lineTo(px + Math.cos(dir) * s.l * (0.2 + a * 1.2), py + Math.sin(dir) * s.l * (0.2 + a * 1.2));
      g.stroke();
    }
  });
}

function viewportKira(
  fx: SakugaFXApi,
  vx: number,
  vy: number,
  opts: { r?: number; life?: number; col?: string } = {},
): void {
  const { r = 9, life = 0.6, col } = opts;
  let handle: { dead?: boolean } = {};
  handle = fx.persist((_k, t) => {
    const g = fx.g;
    if (!g || fx.calm || t >= life) {
      handle.dead = true;
      return;
    }
    const k = t / life;
    const s = r * Math.sin(k * Math.PI) ** 0.6;
    if (s <= 0.2) return;
    const q = s * 0.16;
    g.translate(vx + window.scrollX, vy + window.scrollY);
    g.rotate(Math.sin(t * 3) * 0.2);
    const p = new Path2D();
    p.moveTo(0, -s);
    p.quadraticCurveTo(q, -q, s * 0.7, 0);
    p.quadraticCurveTo(q, q, 0, s);
    p.quadraticCurveTo(-q, q, -s * 0.7, 0);
    p.quadraticCurveTo(-q, -q, 0, -s);
    g.save();
    g.fillStyle = col || fx.P.fill;
    g.fill(p);
    g.restore();
    g.strokeStyle = fx.P.accent;
    g.lineWidth = 2;
    g.stroke(p);
  });
}

interface DesktopNavController {
  onClick: (link: HTMLElement, wasActive: boolean) => void;
}

/**
 * Spring-driven desktop navbar pill indicator matching Sakuga tabs physics while staying
 * viewport-pinned inside the sticky header.
 */
function initDesktopNavSakuga(fx: SakugaFXApi): DesktopNavController | null {
  const desktopNav = document.querySelector<HTMLElement>('[data-desktop-nav]');
  const indicator = desktopNav?.querySelector<HTMLElement>('[data-nav-indicator]') ?? null;
  if (!desktopNav || !indicator) return null;

  const getActiveLink = () =>
    desktopNav.querySelector<HTMLElement>('.nav-pill[aria-current="page"]') ??
    desktopNav.querySelector<HTMLElement>('.nav-pill[data-nav-id]');

  const sx = new fx.Spring(0, 320, 23);
  const sw = new fx.Spring(0, 320, 26);
  const pop = new fx.Spring(1, 380, 14);

  let handle: { dead?: boolean } = {};
  let running = false;
  let ready = false;
  let activeLink: HTMLElement | null = null;
  let pendingBurst = false;
  let slideDir = 1;

  const resetVisuals = () => {
    handle.dead = true;
    running = false;
    pendingBurst = false;
    ready = false;
    desktopNav.removeAttribute('data-sakuga-nav');
    indicator.style.transform = '';
    indicator.style.width = '';
    indicator.style.willChange = '';
  };

  const applyIndicator = (x: number, w: number, p: number) => {
    const sxScale = 1 + (1 - p) * 0.18;
    const syScale = p;
    indicator.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0) scale(${sxScale.toFixed(4)}, ${syScale.toFixed(4)})`;
    indicator.style.width = `${w.toFixed(2)}px`;
  };

  const fireLandingVfx = (target: HTMLElement, dir: number) => {
    if (fx.calm || !target.isConnected) return;
    pop.x = 0.92;
    pop.v = -1.2;
    pop.to = 1;
    animateElementSpring(target, { initialS: 0.9, pop: 1.06, wide: 0.16, k: 460, d: 14 });

    const b = target.getBoundingClientRect();
    if (b.width <= 0) return;

    const cx = b.left + b.width * 0.5;
    const cy = b.top + b.height * 0.5;
    const trailX = dir > 0 ? b.left - 8 : b.right + 8;

    viewportTicks(fx, cx, b.bottom + 5, { dir: Math.PI / 2, n: 3, r: 4, len: 13, fan: 0.48, life: 0.44 });
    viewportPuff(fx, trailX, cy + 4, { size: 7.5, n: 4, vx: -dir * 22, vy: 12, life: 0.62 });
    viewportLines(fx, dir > 0 ? b.left - 2 : b.right + 2, cy, {
      n: 4,
      dir: dir > 0 ? Math.PI : 0,
      len: 30,
      spread: 10,
      life: 0.28,
    });

    fx.later(80, () => {
      if (!target.isConnected || fx.calm) return;
      const nb = target.getBoundingClientRect();
      if (nb.width <= 0) return;
      viewportPuff(fx, dir > 0 ? nb.left - 16 : nb.right + 16, nb.top + nb.height * 0.5 + 12, {
        size: 5.5,
        n: 3,
        vx: -dir * 14,
        vy: 10,
        life: 0.48,
      });
    });
  };

  const snapTo = (link: HTMLElement | null) => {
    if (!link || fx.calm || desktopNav.offsetWidth === 0 || link.offsetWidth === 0) {
      resetVisuals();
      return;
    }
    activeLink = link;
    sx.x = sx.to = link.offsetLeft;
    sx.v = 0;
    sw.x = sw.to = link.offsetWidth;
    sw.v = 0;
    pop.x = pop.to = 1;
    pop.v = 0;
    pendingBurst = false;
    handle.dead = true;
    running = false;
    ready = true;
    desktopNav.dataset.sakugaNav = 'ready';
    indicator.style.willChange = '';
    indicator.style.transform = `translate3d(${sx.to}px, 0, 0)`;
    indicator.style.width = `${sw.to}px`;
  };

  const ensureLoop = () => {
    if (running || fx.calm) return;
    running = true;
    indicator.style.willChange = 'transform, width';
    handle = fx.persist((_k, _t, dt) => {
      if (!desktopNav.isConnected || fx.calm || desktopNav.offsetWidth === 0) {
        resetVisuals();
        return;
      }

      const x = sx.step(dt);
      const baseW = sw.step(dt);
      const p = pop.step(dt);
      const stretch = Math.min(46, Math.abs(sx.v) * 0.06);
      const w = Math.max(8, baseW + stretch);
      const drawX = x - (sx.v < 0 ? 0 : stretch);

      if (pendingBurst && Math.abs(x - sx.to) < 3) {
        pendingBurst = false;
        if (activeLink) fireLandingVfx(activeLink, slideDir);
      }

      const settled =
        !pendingBurst &&
        Math.abs(x - sx.to) < 0.25 &&
        Math.abs(sx.v) < 0.5 &&
        Math.abs(baseW - sw.to) < 0.25 &&
        Math.abs(sw.v) < 0.5 &&
        Math.abs(p - 1) < 0.002 &&
        Math.abs(pop.v) < 0.01;

      if (settled) {
        indicator.style.transform = `translate3d(${sx.to}px, 0, 0)`;
        indicator.style.width = `${sw.to}px`;
        indicator.style.willChange = '';
        handle.dead = true;
        running = false;
        return;
      }

      applyIndicator(drawX, w, p);
    });
  };

  const slideTo = (link: HTMLElement, withBurst: boolean) => {
    if (fx.calm || desktopNav.offsetWidth === 0 || link.offsetWidth === 0) return;
    if (!ready) {
      snapTo(link);
      if (withBurst) {
        const b = link.getBoundingClientRect();
        animateElementSpring(link, { initialS: 0.9, pop: 1.06, wide: 0.16, k: 460, d: 14 });
        if (b.width > 0) {
          viewportTicks(fx, b.left + b.width * 0.5, b.bottom + 5, { dir: Math.PI / 2, n: 3, r: 4, len: 12, fan: 0.44, life: 0.4 });
        }
      }
      return;
    }

    const targetX = link.offsetLeft;
    const targetW = link.offsetWidth;
    slideDir = Math.sign(targetX - sx.to) || 1;
    activeLink = link;
    sx.to = targetX;
    sw.to = targetW;
    pendingBurst = withBurst && Math.abs(targetX - sx.x) > 4;

    if (withBurst && !pendingBurst) {
      const b = link.getBoundingClientRect();
      animateElementSpring(link, { initialS: 0.9, pop: 1.06, wide: 0.16, k: 460, d: 14 });
      if (b.width > 0) {
        viewportTicks(fx, b.left + b.width * 0.5, b.bottom + 5, { dir: Math.PI / 2, n: 3, r: 4, len: 11, fan: 0.42, life: 0.36 });
      }
    }

    ensureLoop();
  };

  snapTo(getActiveLink());
  document.fonts?.ready.then(() => {
    if (!fx.calm && desktopNav.isConnected && !running) {
      snapTo(getActiveLink());
    }
  });

  const mutationObserver = new MutationObserver(() => {
    if (fx.calm) {
      resetVisuals();
      return;
    }
    const nextActive = getActiveLink();
    if (!nextActive || nextActive === activeLink) return;
    slideTo(nextActive, false);
  });
  mutationObserver.observe(desktopNav, {
    attributes: true,
    attributeFilter: ['aria-current'],
    subtree: true,
  });

  new ResizeObserver(() => {
    if (!desktopNav.isConnected) return;
    if (fx.calm || desktopNav.offsetWidth === 0) {
      resetVisuals();
      return;
    }
    const target = getActiveLink();
    if (!target) return;
    if (running) {
      sx.to = target.offsetLeft;
      sw.to = target.offsetWidth;
    } else {
      snapTo(target);
    }
  }).observe(desktopNav);

  const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduceMq.addEventListener('change', (ev) => {
    if (ev.matches) {
      resetVisuals();
    } else {
      window.setTimeout(() => {
        if (!fx.calm && desktopNav.isConnected) snapTo(getActiveLink());
      }, 0);
    }
  });

  return {
    onClick(link: HTMLElement, wasActive: boolean) {
      if (fx.calm) return;
      if (wasActive && link === activeLink) {
        const b = link.getBoundingClientRect();
        animateElementSpring(link, { initialS: 0.9, pop: 1.05, wide: 0.16, k: 480, d: 14 });
        if (b.width > 0) {
          viewportTicks(fx, b.left + b.width * 0.5, b.bottom + 5, { dir: Math.PI / 2, n: 3, r: 4, len: 10, fan: 0.4, life: 0.34 });
        }
        return;
      }
      slideTo(link, true);
    },
  };
}

/**
 * Initialize delegated Sakuga VFX choreography for all DWNVRS interactive controls.
 */
export function initSakugaVfx(): void {
  if (typeof document === 'undefined' || initialized) return;
  const fx = getSakugaFx();
  if (!fx) return;
  initialized = true;

  const desktopNavCtrl = initDesktopNavSakuga(fx);

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const curFx = getSakugaFx();
      if (!curFx || curFx.calm) return;

      const btn = target.closest<HTMLElement>('.btn');
      if (btn && !isControlDisabled(btn)) {
        const tier = getButtonTier(btn);
        if (!tier) return;

        releaseHeldSpring();
        heldElement = btn;

        if (tier === 'accent') {
          animateElementSpring(btn, { hold: true, low: 0.78, wide: 0.28 });
          if (btn.closest('header')) {
            const b = btn.getBoundingClientRect();
            viewportTicks(curFx, b.left + b.width * 0.5, b.bottom + 4, { dir: Math.PI / 2, n: 3, r: 4, len: 12, fan: 0.48 });
          } else {
            const c = curFx.at(btn);
            curFx.ticks(c.x, c.y - c.h / 2 - 6, { dir: -Math.PI / 2, n: 3, r: 4, len: 12, fan: 0.48 });
            curFx.wob(c.x - c.w / 2 - 6, c.y, { dir: -1, r: 9, life: 0.28 });
            curFx.wob(c.x + c.w / 2 + 6, c.y, { dir: 1, r: 9, life: 0.28 });
          }
        } else if (tier === 'danger') {
          animateElementSpring(btn, { hold: true, low: 0.84, wide: 0.22 });
        } else {
          animateElementSpring(btn, { hold: true, low: 0.86, wide: 0.22 });
        }
        return;
      }

      const navPress = target.closest<HTMLElement>(
        '[data-desktop-nav] .nav-pill, [data-mobile-nav] [data-nav-id], header [data-brand-link]',
      );
      if (navPress) {
        releaseHeldSpring();
        const springTarget = navPress.closest('[data-mobile-nav]')
          ? (navPress.querySelector<HTMLElement>('.state-layer') ?? navPress)
          : navPress;
        heldElement = springTarget;
        animateElementSpring(springTarget, { hold: true, low: 0.9, wide: 0.16 });
      }
    },
    { passive: true },
  );

  document.addEventListener('pointerup', releaseHeldSpring, { passive: true });
  document.addEventListener('pointercancel', releaseHeldSpring, { passive: true });
  window.addEventListener('blur', releaseHeldSpring);

  // Capture phase snapshots prior state before component handlers mutate aria-pressed / aria-current.
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const chip = target.closest<HTMLElement>('.chip-filter');
      if (chip) {
        const wasPressed = chip.getAttribute('aria-pressed') === 'true';
        const group = chip.parentElement;
        const activeSibling = group?.querySelector<HTMLElement>('.chip-filter[aria-pressed="true"]');
        let prevActiveX: number | null = null;
        if (activeSibling && activeSibling !== chip) {
          const r = activeSibling.getBoundingClientRect();
          prevActiveX = r.left + window.scrollX + r.width * 0.5;
        }
        filterSnapshot.set(chip, { wasPressed, prevActiveX });
      }

      const navLink = target.closest<HTMLElement>('[data-desktop-nav] [data-nav-id], [data-mobile-nav] [data-nav-id]');
      if (navLink) {
        const wasActive = navLink.getAttribute('aria-current') === 'page';
        const group = navLink.closest('[data-desktop-nav], [data-mobile-nav]');
        const activeSibling = group?.querySelector<HTMLElement>('[data-nav-id][aria-current="page"]');
        let prevActiveX: number | null = null;
        if (activeSibling && activeSibling !== navLink) {
          const r = activeSibling.getBoundingClientRect();
          prevActiveX = r.left + r.width * 0.5;
        }
        navSnapshot.set(navLink, { wasActive, prevActiveX });
      }
    },
    true,
  );

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const curFx = getSakugaFx();
    if (!curFx || curFx.calm) return;

    const btn = target.closest<HTMLElement>('.btn');
    if (btn && !isControlDisabled(btn)) {
      const tier = getButtonTier(btn);
      if (tier) {
        const inHeader = Boolean(btn.closest('header'));
        const c = curFx.at(btn);
        heldElement = null;
        if (tier === 'accent') {
          const backLayer = getButtonBackLayer(btn);
          animateElementSpring(btn, { initialS: 0.78, pop: 1.12, tilt: -3, wide: 0.28 });
          curFx.burst(c.x, c.y, { r: 68, spikes: 13, life: 0.42, layer: backLayer });
          curFx.shards(c.x, c.y, { n: 7, speed: 220, size: 7, life: 0.78, arc: Math.PI * 2, grav: 320 });
          if (inHeader) {
            const b = btn.getBoundingClientRect();
            viewportPuff(curFx, b.left - 4, b.bottom - 2, { size: 9, n: 4, vx: -26, vy: 12, life: 0.68 });
            viewportTicks(curFx, b.right - 8, b.bottom + 4, { dir: 0.9, n: 3, r: 4, len: 13, fan: 0.4, life: 0.42 });
          } else {
            curFx.puff(c.x - c.w / 2 - 4, c.y - c.h * 0.35, { size: 11, n: 5, vx: -34, vy: -22, life: 0.78 });
            curFx.puff(c.x + c.w / 2 + 4, c.y + c.h * 0.35, { size: 10, n: 4, vx: 32, vy: 12, life: 0.72 });
            curFx.sfx('don', c.x + 8, Math.max(window.scrollY + 42, c.y - Math.max(52, c.h / 2 + 34)), {
              size: 126,
              rot: -0.1,
              life: 0.92,
            });
            curFx.later(170, () => {
              if (!btn.isConnected) return;
              const d = curFx.at(btn);
              curFx.donut(d.x + 6, d.y - d.h * 0.65, { r: 22, vx: 20, vy: -44, life: 1.05 });
              curFx.later(80, () => curFx.donut(d.x + 42, d.y - d.h * 0.75, { r: 14, vx: 28, vy: -34, life: 0.9 }));
            });
          }
        } else if (tier === 'danger') {
          animateElementSpring(btn, { initialS: 0.84, pop: 1.08, wide: 0.22 });
          curFx.slash(c.x, c.y, { len: 96, ang: -0.4, thick: 11, life: 0.38 });
          curFx.shards(c.x, c.y, { n: 5, speed: 190, size: 6, life: 0.65, arc: Math.PI * 2, grav: 280 });
          if (inHeader) {
            const b = btn.getBoundingClientRect();
            viewportTicks(curFx, b.right - 8, b.bottom + 4, { dir: 0.85, n: 3, r: 4, len: 13, fan: 0.38, life: 0.42 });
          } else {
            curFx.ticks(c.x + c.w / 2 - 4, c.y - c.h / 2 - 2, { dir: -0.85, n: 3, r: 5, len: 14, fan: 0.38, life: 0.42 });
          }
        } else {
          animateElementSpring(btn, { initialS: 0.86, pop: 1.07, wide: 0.22 });
          if (inHeader) {
            const b = btn.getBoundingClientRect();
            viewportTicks(curFx, b.right - 10, b.bottom + 4, { dir: 0.95, n: 3, r: 4, len: 12, fan: 0.36, life: 0.4 });
            viewportPuff(curFx, b.left - 4, b.bottom - 2, { size: 7.5, n: 4, vx: -16, vy: 10, life: 0.55 });
          } else {
            curFx.ticks(c.x + c.w / 2 - 6, c.y - c.h / 2 - 2, { dir: -0.95, n: 3, r: 5, len: 13, fan: 0.36, life: 0.4 });
            curFx.puff(c.x - c.w / 2 - 4, c.y + 4, { size: 8, n: 4, vx: -16, vy: -10, life: 0.55 });
          }
        }
        return;
      }
    }

    const chip = target.closest<HTMLElement>('.chip-filter');
    if (chip && !isControlDisabled(chip)) {
      const snap = filterSnapshot.get(chip);
      filterSnapshot.delete(chip);
      const nowPressed = chip.getAttribute('aria-pressed') === 'true';
      const c = curFx.at(chip);

      if (!snap?.wasPressed || !nowPressed) {
        const dir = snap?.prevActiveX !== null && snap?.prevActiveX !== undefined && Math.abs(c.x - snap.prevActiveX) > 4
          ? (c.x >= snap.prevActiveX ? 1 : -1)
          : 1;
        animateElementSpring(chip, { initialS: 0.84, pop: 1.08, wide: 0.22 });
        curFx.ticks(c.x, c.y - c.h / 2 - 6, { dir: -Math.PI / 2, n: 3, r: 4, len: 12, fan: 0.42, life: 0.42 });
        curFx.puff(c.x - dir * (c.w / 2 + 8), c.y, { size: 7, n: 4, vx: -dir * 18, vy: -10, life: 0.58 });
        curFx.lines(c.x - dir * (c.w / 2 + 4), c.y, {
          n: 4,
          dir: dir > 0 ? Math.PI : 0,
          len: 28,
          spread: 8,
          life: 0.28,
        });
        curFx.sfx('kachi', c.x + 4, Math.max(window.scrollY + 34, c.y - 38), {
          size: 72,
          rot: -0.08,
          life: 0.72,
          ...curFx.hollow(),
        });
      } else {
        curFx.ticks(c.x, c.y - c.h / 2 - 4, { dir: -Math.PI / 2, n: 3, r: 4, len: 9, fan: 0.38, life: 0.32 });
      }
      return;
    }

    const moveBtn = target.closest<HTMLElement>('[data-fav-move]');
    if (moveBtn && !isControlDisabled(moveBtn)) {
      const dir = moveBtn.dataset.favMove === 'up' ? -1 : 1;
      const c = curFx.at(moveBtn);
      curFx.ticks(c.x, c.y + dir * 10, {
        dir: dir < 0 ? -Math.PI / 2 : Math.PI / 2,
        n: 3,
        r: 4,
        len: 10,
        fan: 0.4,
        life: 0.36,
      });
      curFx.puff(c.x, c.y - dir * 8, { size: 5.5, n: 3, vy: -dir * 14, life: 0.42 });
      return;
    }

    const favOrCard = target.closest<HTMLElement>('[data-fav-trigger], a.card-filled, [data-home-lfm-pill]');
    if (favOrCard) {
      const c = curFx.at(favOrCard);
      const cornerX = c.x + c.w / 2 - 14;
      const cornerY = c.y - c.h / 2 + 12;
      curFx.kira(cornerX, cornerY, { r: 11, life: 0.55 });
      curFx.ticks(cornerX, cornerY, { dir: -0.85, n: 3, r: 6, len: 12, fan: 0.4, life: 0.4 });
      if (favOrCard.hasAttribute('data-fav-trigger')) {
        curFx.ring(c.x, c.y, { rx: 24, ry: 7, life: 0.42, w: 3.5 });
      }
      return;
    }

    const desktopNavLink = target.closest<HTMLElement>('[data-desktop-nav] [data-nav-id]');
    if (desktopNavLink) {
      const snap = navSnapshot.get(desktopNavLink);
      navSnapshot.delete(desktopNavLink);
      heldElement = null;
      desktopNavCtrl?.onClick(desktopNavLink, snap?.wasActive ?? false);
      return;
    }

    const mobileNavLink = target.closest<HTMLElement>('[data-mobile-nav] [data-nav-id]');
    if (mobileNavLink) {
      const snap = navSnapshot.get(mobileNavLink);
      navSnapshot.delete(mobileNavLink);
      heldElement = null;
      const anchor = mobileNavLink.querySelector<HTMLElement>('.state-layer') ?? mobileNavLink;
      const b = anchor.getBoundingClientRect();
      const cx = b.left + b.width * 0.5;
      const cy = b.top + b.height * 0.5;
      animateElementSpring(anchor, { initialS: 0.84, pop: 1.09, wide: 0.24, k: 480, d: 14 });
      if (!snap?.wasActive) {
        const dir = snap?.prevActiveX !== null && snap?.prevActiveX !== undefined && Math.abs(cx - snap.prevActiveX) > 4
          ? (cx >= snap.prevActiveX ? 1 : -1)
          : 1;
        viewportTicks(curFx, cx, b.top - 5, { dir: -Math.PI / 2, n: 3, r: 4, len: 12, fan: 0.46, life: 0.42 });
        viewportPuff(curFx, dir > 0 ? b.left - 4 : b.right + 4, cy, { size: 6.5, n: 3, vx: -dir * 16, vy: -12, life: 0.52 });
        viewportLines(curFx, dir > 0 ? b.left - 2 : b.right + 2, cy, { n: 3, dir: dir > 0 ? Math.PI : 0, len: 24, spread: 8, life: 0.26 });
      } else {
        viewportTicks(curFx, cx, b.top - 5, { dir: -Math.PI / 2, n: 3, r: 4, len: 9, fan: 0.36, life: 0.34 });
      }
      return;
    }

    const brandLink = target.closest<HTMLElement>('header [data-brand-link]');
    if (brandLink) {
      heldElement = null;
      const b = brandLink.getBoundingClientRect();
      animateElementSpring(brandLink, { initialS: 0.88, pop: 1.07, wide: 0.2 });
      viewportKira(curFx, b.left + 18, b.bottom - 2, { r: 10, life: 0.55 });
      viewportTicks(curFx, b.left + b.width * 0.5, b.bottom + 4, { dir: Math.PI / 2, n: 3, r: 4, len: 11, fan: 0.42, life: 0.38 });
    }
  });

  document.addEventListener('focusin', (e) => {
    const field = e.target instanceof HTMLElement && e.target.classList.contains('field-input') ? e.target : null;
    if (!field) return;
    const fx = getSakugaFx();
    if (!fx || fx.calm) return;
    const c = fx.at(field, 1, 0);
    fx.ticks(c.x - 6, c.y - 2, { dir: -1.0, n: 3, r: 4, len: 12, fan: 0.36, life: 0.4 });
  });

  document.addEventListener('input', (e) => {
    const field = e.target;
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
    if (!field.classList.contains('field-input')) return;
    const fx = getSakugaFx();
    if (!fx || fx.calm) return;

    const count = (inputKeyCounts.get(field) ?? 0) + 1;
    inputKeyCounts.set(field, count);
    if (count % 3 !== 1) return;

    const ctx = getMeasureCtx();
    if (!ctx) return;

    const cs = getComputedStyle(field);
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;

    const caretPos = field.selectionStart ?? field.value.length;
    const beforeCaret = field.value.slice(0, caretPos);
    const lastLine = beforeCaret.includes('\n') ? beforeCaret.slice(beforeCaret.lastIndexOf('\n') + 1) : beforeCaret;
    const shown = field instanceof HTMLInputElement && field.type === 'password' ? '•'.repeat(lastLine.length) : lastLine;

    const c = fx.at(field, 0, 0.5);
    const x = c.x + 18 + Math.min(Math.max(0, c.w - 38), ctx.measureText(shown).width);
    const y = field instanceof HTMLTextAreaElement ? c.y - c.h * 0.2 : c.y + 8;

    fx.puff(x, y, { size: 4.5, n: 2, vy: -18, vx: fx.rnd(-8, 8), life: 0.38 });
  });
}
