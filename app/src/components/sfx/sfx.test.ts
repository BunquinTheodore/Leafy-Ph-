import { describe, expect, it, vi } from "vitest";
import { SfxGate, soundForTarget } from "./mapping";
import { MASTER_VOLUME, SOUND_DEFS, playSound } from "./synth";

function el(html: string): Element {
  const host = document.createElement("div");
  host.innerHTML = html;
  const target = host.firstElementChild;
  if (!target) throw new Error("no element");
  return target;
}

describe("soundForTarget", () => {
  it("maps buttons, links and role=button to click", () => {
    expect(soundForTarget(el("<button>x</button>"), "pointerdown")).toBe("click");
    expect(soundForTarget(el('<a href="/x">x</a>'), "pointerdown")).toBe("click");
    expect(soundForTarget(el('<div role="button">x</div>'), "pointerdown")).toBe("click");
  });

  it("finds the interactive ancestor of an inner element", () => {
    const button = el("<button><span>label</span></button>");
    expect(soundForTarget(button.querySelector("span"), "pointerdown")).toBe("click");
  });

  it("honors data-sfx overrides and none", () => {
    expect(soundForTarget(el('<button data-sfx="toggle">x</button>'), "pointerdown")).toBe(
      "toggle",
    );
    expect(soundForTarget(el('<button data-sfx="success">x</button>'), "pointerdown")).toBe(
      "success",
    );
    expect(soundForTarget(el('<button data-sfx="none">x</button>'), "pointerdown")).toBeNull();
  });

  it("ignores disabled controls and plain text", () => {
    expect(soundForTarget(el("<button disabled>x</button>"), "pointerdown")).toBeNull();
    expect(soundForTarget(el("<p>text</p>"), "pointerdown")).toBeNull();
    expect(soundForTarget(null, "pointerdown")).toBeNull();
  });

  it("plays hover sounds only for primary controls", () => {
    expect(soundForTarget(el('<button class="btn btn-primary">x</button>'), "pointerover")).toBe(
      "hover",
    );
    expect(soundForTarget(el('<button data-sfx-hover="">x</button>'), "pointerover")).toBe("hover");
    expect(soundForTarget(el("<button>plain</button>"), "pointerover")).toBeNull();
  });
});

describe("SfxGate", () => {
  it("throttles repeats of the same sound", () => {
    const gate = new SfxGate();
    expect(gate.allow("click", 1000)).toBe(true);
    expect(gate.allow("click", 1030)).toBe(false);
    expect(gate.allow("click", 1100)).toBe(true);
  });

  it("throttles hover harder than click", () => {
    const gate = new SfxGate();
    expect(gate.allow("hover", 0)).toBe(true);
    expect(gate.allow("hover", 200)).toBe(false);
    expect(gate.allow("hover", 400)).toBe(true);
  });

  it("tracks sounds independently", () => {
    const gate = new SfxGate();
    gate.allow("click", 0);
    expect(gate.allow("success", 1)).toBe(true);
  });

  it("limits a burst across all sounds", () => {
    const gate = new SfxGate();
    const results = ["click", "toggle", "success", "error", "delete", "panel"].map((name, i) =>
      gate.allow(name as never, i),
    );
    expect(results.filter(Boolean).length).toBeLessThan(6);
  });
});

function fakeContext() {
  const oscillators: Array<{
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    frequency: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    type: string;
    connect: ReturnType<typeof vi.fn>;
  }> = [];
  const gains: Array<{
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
  }> = [];
  const ctx = {
    currentTime: 0,
    sampleRate: 44100,
    destination: {},
    createOscillator: vi.fn(() => {
      const osc = {
        type: "sine",
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => {
      const gain = {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      gains.push(gain);
      return gain;
    }),
    createBiquadFilter: vi.fn(() => ({
      type: "lowpass",
      frequency: { value: 0, setValueAtTime: vi.fn() },
      Q: { value: 0 },
      connect: vi.fn(),
    })),
    createBuffer: vi.fn((_c: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
  };
  return { ctx, oscillators, gains };
}

describe("synth", () => {
  it("keeps UI sounds under 250ms and scan sounds under 600ms", () => {
    for (const [name, def] of Object.entries(SOUND_DEFS)) {
      const limit = name.startsWith("scan") ? 0.6 : 0.25;
      expect(def.duration, name).toBeLessThanOrEqual(limit);
    }
  });

  it("defaults the master volume to about 25%", () => {
    expect(MASTER_VOLUME).toBeCloseTo(0.25, 2);
  });

  it("schedules oscillators and stops them", () => {
    const { ctx, oscillators } = fakeContext();
    playSound(ctx as unknown as AudioContext, "click");
    expect(oscillators.length).toBeGreaterThan(0);
    for (const osc of oscillators) {
      expect(osc.start).toHaveBeenCalled();
      expect(osc.stop).toHaveBeenCalled();
    }
  });

  it("scales the peak gain by the master volume and the sound level", () => {
    const { ctx, gains } = fakeContext();
    playSound(ctx as unknown as AudioContext, "click", 1);
    const peaks = gains.flatMap((g) =>
      g.gain.linearRampToValueAtTime.mock.calls.map((call) => call[0] as number),
    );
    expect(Math.max(...peaks)).toBeLessThanOrEqual(MASTER_VOLUME + 1e-9);
    expect(Math.max(...peaks)).toBeGreaterThan(0);
  });

  it("plays nothing at zero volume", () => {
    const { ctx, oscillators } = fakeContext();
    playSound(ctx as unknown as AudioContext, "success", 0);
    expect(oscillators).toHaveLength(0);
  });
});
