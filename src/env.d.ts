/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  readonly LASTFM_API_KEY?: string;
  readonly LASTFM_USERNAME?: string;
  readonly PUBLIC_LASTFM_USERNAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /** Request-scoped Supabase client carrying the visitor's auth cookies. `null` when env vars are missing. */
    supabase: import('./lib/supabase').TypedSupabaseClient | null;
    /** Signed-in user, resolved only on admin routes and admin actions. */
    user: import('@supabase/supabase-js').User | null;
    /** True when `user` is listed in `public.admins`. */
    isAdmin: boolean;
    /** Memoized admin lookup so middleware and actions share one auth round-trip. */
    adminCheck?: Promise<{ user: import('@supabase/supabase-js').User | null; isAdmin: boolean }>;
    /** Memoized site content lookup shared across BaseLayout and page components. */
    siteContent?: Promise<import('./lib/site-content').SiteContentResult>;
  }
}

interface SakugaSpring {
  x: number;
  v: number;
  to: number;
  k: number;
  d: number;
  step(dt: number): number;
}

interface SakugaPalette {
  fill: string;
  shade: string;
  line: string;
  accent: string;
  ink: string;
  sfx: [string, string];
}

interface SakugaPoint {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SakugaFXApi {
  version: number;
  paused: boolean;
  readonly P: SakugaPalette;
  readonly calm: boolean;
  readonly now: number;
  TAU: number;
  clamp(v: number, a?: number, b?: number): number;
  lerp(a: number, b: number, t: number): number;
  rnd(a?: number, b?: number): number;
  Spring: new (x?: number, k?: number, d?: number) => SakugaSpring;
  advance(dt: number): void;
  later(ms: number, f: () => void): void;
  persist(draw: (k: number, t: number, dt: number) => void, layer?: unknown): { dead?: boolean };
  puff(x: number, y: number, opts?: { n?: number; size?: number; vx?: number; vy?: number; life?: number; spread?: number }): void;
  burst(x: number, y: number, opts?: { r?: number; spikes?: number; life?: number; layer?: unknown }): void;
  shards(x: number, y: number, opts?: { n?: number; speed?: number; size?: number; life?: number; dir?: number; arc?: number; grav?: number }): void;
  ring(x: number, y: number, opts?: { rx?: number; ry?: number; life?: number; w?: number }): void;
  splash(x: number, y: number, opts?: { w?: number; h?: number; life?: number }): void;
  slash(x: number, y: number, opts?: { len?: number; ang?: number; life?: number; thick?: number; col?: string }): void;
  lines(x: number, y: number, opts?: { n?: number; dir?: number; len?: number; spread?: number; life?: number }): void;
  ticks(x: number, y: number, opts?: { n?: number; r?: number; len?: number; dir?: number; life?: number; fan?: number }): void;
  donut(x: number, y: number, opts?: { r?: number; vx?: number; vy?: number; life?: number; tilt?: number }): void;
  wob(x: number, y: number, opts?: { dir?: number; r?: number; life?: number }): void;
  kira(x: number, y: number, opts?: { r?: number; life?: number; col?: string }): void;
  sfx(name: 'don' | 'gogo' | 'kachi' | 'pon' | 'shu' | 'zuza', x: number, y: number, opts?: { size?: number; rot?: number; life?: number; col?: string; edge?: string; dots?: boolean }): void;
  hollow(): { col: string; edge: string };
  dotted(): { dots: boolean; edge: string };
  readonly g: CanvasRenderingContext2D | null;
  blob(cs: number[][], lw?: number, _?: unknown, opts?: { lx?: number; arcs?: boolean; deep?: number }): void;
  at(el: Element, fx?: number, fy?: number): SakugaPoint;
  Base: { prototype: { backLayer(): unknown } };
}

interface SakugaToastElement extends HTMLElement {
  readonly open: boolean;
  show(text?: string): void;
  hide(): void;
}

interface SakugaTabsElement extends HTMLElement {
  selected: number;
  readonly value: string;
}

interface SakugaCheckboxElement extends HTMLElement {
  checked: boolean;
  disabled: boolean;
  readonly value: string;
}

interface SakugaButtonElement extends HTMLElement {
  disabled: boolean;
  readonly primary: boolean;
  impact(): void;
  done(hold?: number): void;
}

interface SakugaTooltipElement extends HTMLElement {
  readonly open: boolean;
  show(on?: boolean): void;
  hide(): void;
}

interface Window {
  SakugaFX?: SakugaFXApi;
}

interface HTMLElementTagNameMap {
  'sakuga-toast': SakugaToastElement;
  'sakuga-tabs': SakugaTabsElement;
  'sakuga-checkbox': SakugaCheckboxElement;
  'sakuga-button': SakugaButtonElement;
  'sakuga-tooltip': SakugaTooltipElement;
}

declare namespace astroHTML.JSX {
  interface IntrinsicElements {
    'sakuga-toast': HTMLAttributes & {
      duration?: string | number;
      message?: string;
    };
    'sakuga-tabs': HTMLAttributes & {
      label?: string;
      selected?: string | number;
    };
    'sakuga-checkbox': HTMLAttributes & {
      checked?: boolean | string;
      disabled?: boolean | string;
      name?: string;
      value?: string;
    };
    'sakuga-button': HTMLAttributes & {
      variant?: 'primary' | 'secondary';
      type?: 'button' | 'submit' | 'reset';
      disabled?: boolean | string;
    };
    'sakuga-tooltip': HTMLAttributes & {
      text?: string;
      label?: string;
    };
  }
}
