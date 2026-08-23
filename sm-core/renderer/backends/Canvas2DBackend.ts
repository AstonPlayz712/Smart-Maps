/**
 * Canvas2DBackend — the web draw surface for SmartMapsAE's own renderer.
 *
 * Implements `RenderBackend` against a plain 2D canvas, so the renderer's
 * layer logic runs unchanged in any browser (including an iOS WebView) with no
 * WebGL requirement and no third-party map library.
 *
 * Draw order matches the renderer's layer stack: vector → buildings → indoor
 * → POI → route → position, with internal debug last and only when enabled.
 */

import type { RenderBackend, RenderFrame } from '../MapRenderer';
import type { LngLat } from '../../tiles/types';

export interface Canvas2DTheme {
  background: string;
  road: string;
  water: string;
  buildingWall: string;
  buildingRoof: string;
  indoorFill: string;
  indoorStroke: string;
  poi: string;
  position: string;
  accuracy: string;
  debug: string;
  text: string;
}

const LIGHT: Canvas2DTheme = {
  background: '#eef2f9',
  road: 'rgba(22,33,58,0.28)',
  water: 'rgba(60,120,190,0.25)',
  buildingWall: 'rgba(22,33,58,0.13)',
  buildingRoof: 'rgba(22,33,58,0.22)',
  indoorFill: 'rgba(0,131,143,0.12)',
  indoorStroke: 'rgba(0,131,143,0.75)',
  poi: '#0277BD',
  position: '#0277BD',
  accuracy: 'rgba(2,119,189,0.18)',
  debug: '#1b7f4b',
  text: '#16213A'
};

const DARK: Canvas2DTheme = {
  background: '#0a0f1c',
  road: 'rgba(227,234,246,0.22)',
  water: 'rgba(79,195,247,0.18)',
  buildingWall: 'rgba(227,234,246,0.10)',
  buildingRoof: 'rgba(227,234,246,0.18)',
  indoorFill: 'rgba(128,222,234,0.12)',
  indoorStroke: 'rgba(128,222,234,0.75)',
  poi: '#4FC3F7',
  position: '#4FC3F7',
  accuracy: 'rgba(79,195,247,0.20)',
  debug: '#43d17f',
  text: '#E3EAF6'
};

export class Canvas2DBackend implements RenderBackend {
  readonly name = 'canvas2d';

  private ctx: CanvasRenderingContext2D | null;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private theme: Canvas2DTheme;

  constructor(private readonly canvas: HTMLCanvasElement, dark = false) {
    this.ctx = canvas.getContext('2d');
    this.theme = dark ? DARK : LIGHT;
    this.resize(canvas.clientWidth || 640, canvas.clientHeight || 480);
  }

  setTheme(dark: boolean): void {
    this.theme = dark ? DARK : LIGHT;
  }

  resize(width: number, height: number): void {
    this.dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.floor(width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  dispose(): void {
    this.ctx = null;
  }

  draw(frame: RenderFrame): void {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = this.theme.background;
    ctx.fillRect(0, 0, this.width, this.height);

    const project = this.projector(frame);

    // ── base vector ────────────────────────────────────────────────────────
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const { feature, path } of frame.roads) {
      if (path.length < 2) continue;
      ctx.beginPath();
      path.forEach((p, i) => {
        const s = project(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      if (feature.kind === 'water') {
        ctx.fillStyle = this.theme.water;
        ctx.fill();
      } else {
        ctx.strokeStyle = this.theme.road;
        ctx.lineWidth = feature.kind === 'road' ? 6 : 2;
        ctx.stroke();
      }
    }

    // ── 3D buildings: wall then lifted roof ────────────────────────────────
    for (const building of frame.buildings) {
      if (building.footprint.length < 3) continue;
      const lift = Math.min(60, building.heightM * 0.9 * this.metresToPixels(frame));
      ctx.beginPath();
      building.footprint.forEach((p, i) => {
        const s = project(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = this.theme.buildingWall;
      ctx.fill();

      ctx.beginPath();
      building.footprint.forEach((p, i) => {
        const s = project(p);
        if (i === 0) ctx.moveTo(s.x, s.y - lift);
        else ctx.lineTo(s.x, s.y - lift);
      });
      ctx.closePath();
      ctx.fillStyle = this.theme.buildingRoof;
      ctx.fill();
    }

    // ── indoor floor ───────────────────────────────────────────────────────
    if (frame.indoor) {
      ctx.globalAlpha = frame.indoor.transitioning ? 0.55 : 1;
      ctx.beginPath();
      frame.indoor.outline.forEach((p, i) => {
        const s = project(p);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.closePath();
      ctx.fillStyle = this.theme.indoorFill;
      ctx.fill();
      ctx.strokeStyle = this.theme.indoorStroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      for (const wall of frame.indoor.walls) {
        if (wall.length < 2) continue;
        ctx.beginPath();
        wall.forEach((p, i) => {
          const s = project(p);
          if (i === 0) ctx.moveTo(s.x, s.y);
          else ctx.lineTo(s.x, s.y);
        });
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── POI ────────────────────────────────────────────────────────────────
    ctx.fillStyle = this.theme.poi;
    for (const { poi, position } of frame.pois) {
      const s = project(position);
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = this.theme.text;
      ctx.fillText(poi.name, s.x + 7, s.y + 3);
      ctx.fillStyle = this.theme.poi;
    }

    // ── accuracy ring + position ───────────────────────────────────────────
    const centre = { x: this.width / 2, y: this.height / 2 };
    if (frame.accuracy?.visible) {
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, frame.accuracy.radiusPx, 0, Math.PI * 2);
      ctx.fillStyle = this.theme.accuracy;
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = this.theme.position;
    ctx.fill();

    // ── internal debug, only when the renderer enabled it ──────────────────
    if (frame.debug) {
      ctx.font = '10px ui-monospace, Menlo, monospace';
      ctx.fillStyle = this.theme.debug;
      frame.debug.readout.forEach((line, i) => {
        ctx.fillText(line, 10, 18 + i * 12);
      });
    }

    ctx.restore();
  }

  /** Pixels per metre at the frame's camera. */
  private metresToPixels(frame: RenderFrame): number {
    const latRad = (frame.camera.center.lat * Math.PI) / 180;
    const mpp = (156543.03392 * Math.cos(latRad)) / Math.pow(2, frame.camera.zoom);
    return mpp > 0 ? 1 / mpp : 0;
  }

  /** lng/lat → canvas pixels, about the camera centre, heading applied. */
  private projector(frame: RenderFrame): (p: LngLat) => { x: number; y: number } {
    const earth = 6371000;
    const centre = frame.camera.center;
    const cosLat = Math.cos((centre.lat * Math.PI) / 180);
    const scale = this.metresToPixels(frame);
    const rotation = (-frame.camera.bearingDeg * Math.PI) / 180;
    const cx = this.width / 2;
    const cy = this.height / 2;

    return (p: LngLat) => {
      const dx = ((p.lng - centre.lng) * Math.PI) / 180 * earth * cosLat;
      const dy = ((p.lat - centre.lat) * Math.PI) / 180 * earth;
      const rx = dx * Math.cos(rotation) - dy * Math.sin(rotation);
      const ry = dx * Math.sin(rotation) + dy * Math.cos(rotation);
      return { x: cx + rx * scale, y: cy - ry * scale };
    };
  }
}
