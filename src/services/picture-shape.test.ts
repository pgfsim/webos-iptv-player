// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/platform', () => ({ isWebOS: () => true }));

import { correctedWindow, PictureShapeFix, type VideoOutputEntry } from './picture-shape';

const SCREEN = { x: 0, y: 0, width: 1920, height: 1080 };

function stretchedFilm(overrides: Partial<VideoOutputEntry> = {}): VideoOutputEntry {
  return {
    context: 'm1',
    connected: true,
    width: 1920,
    height: 800,
    displayOutput: { x: 0, y: 0, width: 3840, height: 2160 },
    videoInfo: { pixelAspectRatio: { width: 20, height: 27 } },
    ...overrides,
  };
}

describe('correctedWindow', () => {
  it('shows a film flagged to stretch to 16:9 at its real shape, centered', () => {
    expect(correctedWindow(stretchedFilm(), SCREEN)).toEqual({ x: 0, y: 140, width: 1920, height: 800 });
  });

  it('fits the real shape inside a smaller video window', () => {
    expect(correctedWindow(stretchedFilm(), { x: 100, y: 50, width: 960, height: 540 }))
      .toEqual({ x: 100, y: 120, width: 960, height: 400 });
  });

  it('leaves a picture already shown at its real shape alone', () => {
    const shown = stretchedFilm({ displayOutput: { x: 0, y: 280, width: 3840, height: 1600 } });
    expect(correctedWindow(shown, SCREEN)).toBeNull();
  });

  it('leaves square pixels and genuinely wide pixels alone', () => {
    expect(correctedWindow(stretchedFilm({ videoInfo: { pixelAspectRatio: { width: 1, height: 1 } } }), SCREEN)).toBeNull();
    expect(correctedWindow(stretchedFilm({ width: 1440, height: 1080, videoInfo: { pixelAspectRatio: { width: 4, height: 3 } } }), SCREEN)).toBeNull();
  });

  it('leaves standard-definition pictures alone', () => {
    expect(correctedWindow(stretchedFilm({ width: 720, height: 480, videoInfo: { pixelAspectRatio: { width: 8, height: 9 } } }), SCREEN)).toBeNull();
  });

  it('ignores a disconnected or unknown picture', () => {
    expect(correctedWindow(stretchedFilm({ connected: false }), SCREEN)).toBeNull();
    expect(correctedWindow(stretchedFilm({ videoInfo: null }), SCREEN)).toBeNull();
  });
});

describe('PictureShapeFix', () => {
  let calls: Array<{ uri: string; payload: Record<string, unknown> }>;
  let statusCallback: ((message: string) => void) | null;

  beforeEach(() => {
    calls = [];
    statusCallback = null;
    class FakeBridge {
      onservicecallback: ((message: string) => void) | null = null;
      call(uri: string, payload: string): void {
        calls.push({ uri, payload: JSON.parse(payload) });
        if (uri.endsWith('/getStatus')) statusCallback = message => this.onservicecallback?.(message);
        else this.onservicecallback?.(JSON.stringify({ returnValue: true }));
      }
      cancel(): void {}
    }
    (window as unknown as { PalmServiceBridge: unknown }).PalmServiceBridge = FakeBridge;
  });

  afterEach(() => {
    delete (window as unknown as { PalmServiceBridge?: unknown }).PalmServiceBridge;
    vi.restoreAllMocks();
  });

  function video(): HTMLVideoElement {
    const el = document.createElement('video') as HTMLVideoElement & { mediaId?: string };
    el.mediaId = 'm1';
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1920, height: 1080 }) as DOMRect;
    return el;
  }

  const windowCalls = () => calls.filter(call => call.uri.endsWith('/display/setDisplayWindow'));
  const sendStatus = (entry: VideoOutputEntry) =>
    statusCallback!(JSON.stringify({ returnValue: true, video: [entry] }));

  it('corrects the playing video and logs it once', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    new PictureShapeFix(video(), true).start();
    expect(calls[0].payload).toEqual({ subscribe: true });
    sendStatus(stretchedFilm());
    sendStatus(stretchedFilm());
    expect(windowCalls()).toHaveLength(2);
    expect(windowCalls()[0].payload).toMatchObject({
      context: 'm1',
      fullScreen: false,
      sourceInput: { x: 0, y: 0, width: 1920, height: 800 },
      displayOutput: { x: 0, y: 140, width: 1920, height: 800 },
    });
    const events = logSpy.mock.calls.filter(args => args.includes('event=playback.picture_shape.corrected'));
    expect(events).toHaveLength(1);
  });

  it('stops re-correcting a TV that keeps resetting the window', () => {
    new PictureShapeFix(video(), true).start();
    for (let i = 0; i < 10; i++) sendStatus(stretchedFilm());
    expect(windowCalls()).toHaveLength(5);
  });

  it('ignores another app\'s video and does nothing while off', () => {
    const fix = new PictureShapeFix(video(), false);
    fix.start();
    sendStatus(stretchedFilm());
    sendStatus(stretchedFilm({ context: 'other' }));
    expect(windowCalls()).toHaveLength(0);
    fix.setEnabled(true);
    expect(windowCalls()).toHaveLength(1);
  });

  it('gives the whole window back when switched off', () => {
    const fix = new PictureShapeFix(video(), true);
    fix.start();
    sendStatus(stretchedFilm());
    fix.setEnabled(false);
    expect(windowCalls()[1].payload).toMatchObject({ displayOutput: { x: 0, y: 0, width: 1920, height: 1080 } });
  });
});
