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

const activeSprings = new WeakMap<HTMLElement, ActiveSpringState>();
const buttonBackLayers = new WeakMap<HTMLElement, unknown>();
const inputKeyCounts = new WeakMap<HTMLElement, number>();
const filterSnapshot = new WeakMap<HTMLElement, { wasPressed: boolean; prevActiveX: number | null }>();
const navSnapshot = new WeakMap<HTMLElement, boolean>();

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

/**
 * Initialize delegated Sakuga VFX choreography for all DWNVRS interactive controls.
 */
export function initSakugaVfx(): void {
  if (typeof document === 'undefined' || initialized) return;
  if (!getSakugaFx()) return;
  initialized = true;

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 && e.pointerType !== 'touch') return;
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const fx = getSakugaFx();
      if (!fx || fx.calm) return;

      const btn = target.closest<HTMLElement>('.btn');
      if (btn && !isControlDisabled(btn)) {
        const tier = getButtonTier(btn);
        if (!tier) return;

        releaseHeldSpring();
        heldElement = btn;

        if (tier === 'accent') {
          animateElementSpring(btn, { hold: true, low: 0.78, wide: 0.28 });
          const c = fx.at(btn);
          fx.ticks(c.x, c.y - c.h / 2 - 6, { dir: -Math.PI / 2, n: 3, r: 4, len: 12, fan: 0.48 });
          fx.wob(c.x - c.w / 2 - 6, c.y, { dir: -1, r: 9, life: 0.28 });
          fx.wob(c.x + c.w / 2 + 6, c.y, { dir: 1, r: 9, life: 0.28 });
        } else if (tier === 'danger') {
          animateElementSpring(btn, { hold: true, low: 0.84, wide: 0.22 });
        } else {
          animateElementSpring(btn, { hold: true, low: 0.86, wide: 0.22 });
        }
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
        navSnapshot.set(navLink, navLink.getAttribute('aria-current') === 'page');
      }
    },
    true,
  );

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const fx = getSakugaFx();
    if (!fx || fx.calm) return;

    const btn = target.closest<HTMLElement>('.btn');
    if (btn && !isControlDisabled(btn)) {
      const tier = getButtonTier(btn);
      if (tier) {
        const c = fx.at(btn);
        heldElement = null;
        if (tier === 'accent') {
          const backLayer = getButtonBackLayer(btn);
          animateElementSpring(btn, { initialS: 0.78, pop: 1.12, tilt: -3, wide: 0.28 });
          fx.burst(c.x, c.y, { r: 68, spikes: 13, life: 0.42, layer: backLayer });
          fx.shards(c.x, c.y, { n: 7, speed: 220, size: 7, life: 0.78, arc: Math.PI * 2, grav: 320 });
          fx.puff(c.x - c.w / 2 - 4, c.y - c.h * 0.35, { size: 11, n: 5, vx: -34, vy: -22, life: 0.78 });
          fx.puff(c.x + c.w / 2 + 4, c.y + c.h * 0.35, { size: 10, n: 4, vx: 32, vy: 12, life: 0.72 });
          fx.sfx('don', c.x + 8, Math.max(window.scrollY + 42, c.y - Math.max(52, c.h / 2 + 34)), {
            size: 126,
            rot: -0.1,
            life: 0.92,
          });
          fx.later(170, () => {
            if (!btn.isConnected) return;
            const d = fx.at(btn);
            fx.donut(d.x + 6, d.y - d.h * 0.65, { r: 22, vx: 20, vy: -44, life: 1.05 });
            fx.later(80, () => fx.donut(d.x + 42, d.y - d.h * 0.75, { r: 14, vx: 28, vy: -34, life: 0.9 }));
          });
        } else if (tier === 'danger') {
          animateElementSpring(btn, { initialS: 0.84, pop: 1.08, wide: 0.22 });
          fx.slash(c.x, c.y, { len: 96, ang: -0.4, thick: 11, life: 0.38 });
          fx.shards(c.x, c.y, { n: 5, speed: 190, size: 6, life: 0.65, arc: Math.PI * 2, grav: 280 });
          fx.ticks(c.x + c.w / 2 - 4, c.y - c.h / 2 - 2, { dir: -0.85, n: 3, r: 5, len: 14, fan: 0.38, life: 0.42 });
        } else {
          animateElementSpring(btn, { initialS: 0.86, pop: 1.07, wide: 0.22 });
          fx.ticks(c.x + c.w / 2 - 6, c.y - c.h / 2 - 2, { dir: -0.95, n: 3, r: 5, len: 13, fan: 0.36, life: 0.4 });
          fx.puff(c.x - c.w / 2 - 4, c.y + 4, { size: 8, n: 4, vx: -16, vy: -10, life: 0.55 });
        }
        return;
      }
    }

    const chip = target.closest<HTMLElement>('.chip-filter');
    if (chip && !isControlDisabled(chip)) {
      const snap = filterSnapshot.get(chip);
      filterSnapshot.delete(chip);
      const nowPressed = chip.getAttribute('aria-pressed') === 'true';
      const c = fx.at(chip);

      if (!snap?.wasPressed || !nowPressed) {
        const dir = snap?.prevActiveX !== null && snap?.prevActiveX !== undefined && Math.abs(c.x - snap.prevActiveX) > 4
          ? (c.x >= snap.prevActiveX ? 1 : -1)
          : 1;
        animateElementSpring(chip, { initialS: 0.84, pop: 1.08, wide: 0.22 });
        fx.ticks(c.x, c.y - c.h / 2 - 6, { dir: -Math.PI / 2, n: 3, r: 4, len: 12, fan: 0.42, life: 0.42 });
        fx.puff(c.x - dir * (c.w / 2 + 8), c.y, { size: 7, n: 4, vx: -dir * 18, vy: -10, life: 0.58 });
        fx.lines(c.x - dir * (c.w / 2 + 4), c.y, {
          n: 4,
          dir: dir > 0 ? Math.PI : 0,
          len: 28,
          spread: 8,
          life: 0.28,
        });
        fx.sfx('kachi', c.x + 4, Math.max(window.scrollY + 34, c.y - 38), {
          size: 72,
          rot: -0.08,
          life: 0.72,
          ...fx.hollow(),
        });
      } else {
        fx.ticks(c.x, c.y - c.h / 2 - 4, { dir: -Math.PI / 2, n: 3, r: 4, len: 9, fan: 0.38, life: 0.32 });
      }
      return;
    }

    const moveBtn = target.closest<HTMLElement>('[data-fav-move]');
    if (moveBtn && !isControlDisabled(moveBtn)) {
      const dir = moveBtn.dataset.favMove === 'up' ? -1 : 1;
      const c = fx.at(moveBtn);
      fx.ticks(c.x, c.y + dir * 10, {
        dir: dir < 0 ? -Math.PI / 2 : Math.PI / 2,
        n: 3,
        r: 4,
        len: 10,
        fan: 0.4,
        life: 0.36,
      });
      fx.puff(c.x, c.y - dir * 8, { size: 5.5, n: 3, vy: -dir * 14, life: 0.42 });
      return;
    }

    const favOrCard = target.closest<HTMLElement>('[data-fav-trigger], a.card-filled, [data-home-lfm-pill]');
    if (favOrCard) {
      const c = fx.at(favOrCard);
      const cornerX = c.x + c.w / 2 - 14;
      const cornerY = c.y - c.h / 2 + 12;
      fx.kira(cornerX, cornerY, { r: 11, life: 0.55 });
      fx.ticks(cornerX, cornerY, { dir: -0.85, n: 3, r: 6, len: 12, fan: 0.4, life: 0.4 });
      if (favOrCard.hasAttribute('data-fav-trigger')) {
        fx.ring(c.x, c.y, { rx: 24, ry: 7, life: 0.42, w: 3.5 });
      }
      return;
    }

    const navLink = target.closest<HTMLElement>('[data-desktop-nav] [data-nav-id], [data-mobile-nav] [data-nav-id]');
    if (navLink) {
      const wasActive = navSnapshot.get(navLink) ?? false;
      navSnapshot.delete(navLink);
      if (!wasActive) {
        const c = fx.at(navLink);
        fx.ticks(c.x, c.y - c.h / 2 - 4, { dir: -Math.PI / 2, n: 3, r: 4, len: 10, fan: 0.4, life: 0.34 });
      }
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
