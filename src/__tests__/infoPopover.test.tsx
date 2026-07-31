/** @jest-environment jsdom */
import { buildInfoPopover } from '../content/debugLogs';

/**
 * Reported live: on a short browser window, the ⓘ popover's Settings button
 * rendered below the bottom of the viewport and was unreachable — the panel
 * is `position: fixed` (so page scroll never reaches it) and had no height
 * bound or internal scroll of its own, so its content could render past the
 * viewport edge with nothing able to bring it back except zooming out.
 */
describe('info popover — stays reachable on a short viewport', () => {
  beforeEach(() => {
    (globalThis as unknown as { chrome: unknown }).chrome = {
      runtime: { sendMessage: jest.fn() },
      storage: { local: { set: jest.fn().mockResolvedValue(undefined) } },
    };
  });

  function mountChip(): { chip: HTMLElement; panel: HTMLElement } {
    document.body.innerHTML = '';
    const host = document.createElement('span');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    buildInfoPopover(shadow, '1.1.1', false);
    const chip = shadow.querySelector('.chip') as HTMLElement;
    const panel = shadow.querySelector('.panel') as HTMLElement;
    return { chip, panel };
  }

  it('bounds the panel to a max-height instead of letting it render off-screen', () => {
    // A short-ish window — chip sits near the top, but there's still less
    // room below it than the panel's content would naturally need.
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    const { chip, panel } = mountChip();
    jest
      .spyOn(chip, 'getBoundingClientRect')
      .mockReturnValue({ top: 80, bottom: 100, left: 100, right: 300, width: 200, height: 20 } as DOMRect);

    chip.click();

    expect(panel.hidden).toBe(false);
    const top = parseFloat(panel.style.top); // rect.bottom(100) + 6 = 106
    const maxHeight = parseFloat(panel.style.maxHeight);
    // Must fit within what's actually left below the chip (innerHeight - top - margin),
    // not some fixed/unbounded value that could exceed the viewport.
    expect(maxHeight).toBeCloseTo(300 - top - 8, 0);
    expect(maxHeight).toBeGreaterThan(0);
  });

  it('never collapses to an unusably small or negative height on a very short window', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 100 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    const { chip, panel } = mountChip();
    jest
      .spyOn(chip, 'getBoundingClientRect')
      .mockReturnValue({ top: 90, bottom: 95, left: 50, right: 150, width: 100, height: 5 } as DOMRect);

    chip.click();

    const maxHeight = parseFloat(panel.style.maxHeight);
    expect(maxHeight).toBeGreaterThanOrEqual(80);
  });

  it('positions well within the viewport on an ordinary window (regression check)', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1400 });
    const { chip, panel } = mountChip();
    jest
      .spyOn(chip, 'getBoundingClientRect')
      .mockReturnValue({ top: 40, bottom: 60, left: 1100, right: 1200, width: 100, height: 20 } as DOMRect);

    chip.click();

    const top = parseFloat(panel.style.top);
    const maxHeight = parseFloat(panel.style.maxHeight);
    expect(top).toBeCloseTo(66, 0);
    expect(maxHeight).toBeCloseTo(900 - 66 - 8, 0);
  });
});
