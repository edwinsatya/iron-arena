const STEP = 1000 / 60;
const MAX_CATCH_UP = 4;

/**
 * Fixed 60 Hz simulation loop driven by requestAnimationFrame (PLAN §4.9). The sim always runs
 * at 60 ticks per second; on 120/144 Hz screens we simply draw more often.
 */
export class FixedStepLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  ticks = 0;
  fps = 60;
  private fpsFrames = 0;
  private fpsTime = 0;

  constructor(
    private tick: () => void,
    private render: (dtMs: number) => void,
  ) {}

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.fpsTime = this.last;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number) => {
    if (!this.running) return;
    const dt = Math.min(now - this.last, 250);
    this.acc += dt;
    this.last = now;
    let n = 0;
    while (this.acc >= STEP && n < MAX_CATCH_UP) {
      this.tick();
      this.ticks++;
      this.acc -= STEP;
      n++;
    }
    if (n === MAX_CATCH_UP) this.acc = 0; // badly behind: drop the debt (time sync handles the rest)
    this.render(dt);
    this.fpsFrames++;
    if (now - this.fpsTime >= 500) {
      this.fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsTime));
      this.fpsFrames = 0;
      this.fpsTime = now;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
