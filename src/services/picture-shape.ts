import { isLunaAvailable, lunaRequest, type LunaRequestHandle, type LunaResponse } from './luna';
import { isWebOS } from '../utils/platform';
import { createLogger } from '../utils/logger';

const log = createLogger('PictureShape');

const VIDEO_OUTPUT = 'luna://com.webos.service.videooutput';
// Below this width a non-square pixel shape is usually genuine (SD broadcasts).
const MIN_CORRECTED_WIDTH = 1280;
const SHAPE_TOLERANCE = 0.02;
// The TV redraws the window on some layout changes; cap re-corrections so a
// pipeline that keeps resetting it cannot loop.
const MAX_CORRECTIONS = 5;
const CORRECTION_WINDOW_MS = 10 * 1000;

export interface Rect { x: number; y: number; width: number; height: number; }

export interface VideoOutputEntry {
  context?: string;
  connected?: boolean;
  width?: number;
  height?: number;
  displayOutput?: Rect;
  videoInfo?: { pixelAspectRatio?: { width?: number; height?: number } } | null;
}

interface VideoOutputStatus extends LunaResponse {
  video?: VideoOutputEntry[];
}

type VideoWithMediaId = HTMLVideoElement & { mediaId?: string };

function positive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * The window that shows the decoded picture at its real shape inside `area`,
 * or null when the stream needs no correction or already has it. Only HD
 * pictures flagged with pixels taller than wide are corrected: that flag is
 * how a badly re-encoded film asks the TV to stretch it to 16:9.
 */
export function correctedWindow(entry: VideoOutputEntry, area: Rect): Rect | null {
  const par = entry.videoInfo?.pixelAspectRatio;
  const { width, height, displayOutput } = entry;
  if (!entry.connected || !positive(width) || !positive(height) || width < MIN_CORRECTED_WIDTH) return null;
  if (!par || !positive(par.width) || !positive(par.height) || par.width >= par.height) return null;
  if (!positive(area.width) || !positive(area.height)) return null;
  const shape = width / height;
  if (displayOutput && positive(displayOutput.width) && positive(displayOutput.height)
      && Math.abs(displayOutput.width / displayOutput.height - shape) / shape <= SHAPE_TOLERANCE) {
    return null;
  }
  const fitWidth = Math.min(area.width, area.height * shape);
  const fitHeight = fitWidth / shape;
  return {
    x: Math.round(area.x + (area.width - fitWidth) / 2),
    y: Math.round(area.y + (area.height - fitHeight) / 2),
    width: Math.round(fitWidth),
    height: Math.round(fitHeight),
  };
}

/** Keeps native webOS video at its real shape while the setting is on. */
export class PictureShapeFix {
  private subscription: LunaRequestHandle | null = null;
  private last: VideoOutputEntry | null = null;
  private corrected: string | null = null;
  private corrections: number[] = [];
  private reported = new Set<string>();

  constructor(private video: HTMLVideoElement, private enabled: boolean) {}

  start(): void {
    if (this.subscription || !isWebOS() || !isLunaAvailable()) return;
    this.subscription = lunaRequest<VideoOutputStatus>(VIDEO_OUTPUT, {
      method: 'getStatus',
      parameters: { subscribe: true },
      onSuccess: status => this.onStatus(status),
      onFailure: error => log.warn('Video output status unavailable', 'event=playback.picture_shape.unavailable',
        `reason=${String(error.errorText ?? error.errorCode ?? 'unknown')}`),
    });
  }

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      if (this.last) this.check(this.last);
    } else {
      this.restore();
    }
  }

  private onStatus(status: VideoOutputStatus): void {
    const mediaId = (this.video as VideoWithMediaId).mediaId;
    if (!mediaId || !status.video) return;
    const entry = status.video.find(item => item.context === mediaId);
    if (!entry) return;
    if (this.corrected && this.corrected !== mediaId) {
      this.corrected = null;
      this.corrections = [];
    }
    this.last = entry;
    if (this.enabled) this.check(entry);
  }

  private area(): Rect {
    const r = this.video.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }

  private check(entry: VideoOutputEntry): void {
    const target = correctedWindow(entry, this.area());
    if (!target || !entry.context) return;
    const now = Date.now();
    this.corrections = this.corrections.filter(at => now - at < CORRECTION_WINDOW_MS);
    if (this.corrections.length >= MAX_CORRECTIONS) return;
    this.corrections.push(now);
    this.corrected = entry.context;
    this.setWindow(entry, target, true);
  }

  private restore(): void {
    const entry = this.last;
    if (!entry || !entry.context || this.corrected !== entry.context) return;
    this.corrected = null;
    this.setWindow(entry, this.area(), false);
  }

  private setWindow(entry: VideoOutputEntry, displayOutput: Rect, correcting: boolean): void {
    const context = entry.context!;
    const input = { x: 0, y: 0, width: entry.width!, height: entry.height! };
    lunaRequest(`${VIDEO_OUTPUT}/display`, {
      method: 'setDisplayWindow',
      parameters: { context, fullScreen: false, originalInput: input, sourceInput: input, displayOutput },
      onSuccess: () => {
        if (!correcting || this.reported.has(context)) return;
        this.reported.add(context);
        const par = entry.videoInfo?.pixelAspectRatio;
        log.info('Showing video at its real shape', 'event=playback.picture_shape.corrected',
          `size=${input.width}x${input.height}`, `pixelShape=${par?.width}:${par?.height}`);
      },
      onFailure: error => log.warn('Picture shape change failed', 'event=playback.picture_shape.failed',
        `reason=${String(error.errorText ?? error.errorCode ?? 'unknown')}`),
    });
  }
}
