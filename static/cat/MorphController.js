// ============================================================================
// MorphController — safe, named access to morph targets (blendshapes).
// ----------------------------------------------------------------------------
// · Discovers every morphTarget across all meshes by name.
// · `set(name, value, {instant})` silently no-ops if the target is missing.
// · `update(dt)` eases current → target so triggers don't snap.
// · `blink(dt)` manages its own timer and drives `eye_blink` smoothly.
// ============================================================================
export class MorphController {
  constructor(root) {
    this.keepClosed = false;   // asleep → eyes stay shut
    /** @type {Map<string, Array<{mesh, index, current, target}>>} */
    this.targets = new Map();

    root.traverse((obj) => {
      if (!obj.isMesh || !obj.morphTargetDictionary) return;
      for (const [name, index] of Object.entries(obj.morphTargetDictionary)) {
        if (!this.targets.has(name)) this.targets.set(name, []);
        this.targets.get(name).push({ mesh: obj, index, current: 0, target: 0 });
      }
    });

    // Canonical names → whatever the artist called them ("Blink_L", "EyesClosed",
    // "JawOpen", ...). Every matching target is driven, so L/R pairs both move.
    const ALIASES = {
      eye_blink:  /blink|eyes?.?clos|eyelid/i,
      mouth_open: /mouth.?open|jaw.?open|^open$|meow/i,
      tongue_out: /tongue/i,
    };
    for (const [canon, re] of Object.entries(ALIASES)) {
      if (this.targets.has(canon)) continue;
      const lists = [...this.targets].filter(([n]) => re.test(n)).flatMap(([, l]) => l);
      if (lists.length) this.targets.set(canon, lists);
    }

    // Blink state
    this._blinkTimer   = 2 + Math.random() * 2;
    this._blinkElapsed = 0;
  }

  has(name) { return this.targets.has(name); }

  /** Set a morph target toward `value` (0..1). Returns false if missing. */
  set(name, value, { instant = false } = {}) {
    const list = this.targets.get(name);
    if (!list) return false;
    for (const t of list) {
      t.target = Math.max(0, Math.min(1, value));
      if (instant) { t.current = t.target; t.mesh.morphTargetInfluences[t.index] = t.target; }
    }
    return true;
  }

  /** Ease all morph values toward their targets. Call once per frame. */
  update(dt) {
    const k = Math.min(1, dt * 14);   // ~14 Hz ease
    const seen = new Set();           // aliases share entries — ease each once
    for (const list of this.targets.values()) {
      for (const t of list) {
        if (seen.has(t)) continue;
        seen.add(t);
        if (Math.abs(t.current - t.target) < 0.001) { t.current = t.target; continue; }
        t.current += (t.target - t.current) * k;
        t.mesh.morphTargetInfluences[t.index] = t.current;
      }
    }
  }

  /** Autonomous blink cycle. Call once per frame. */
  blink(dt) {
    if (!this.has('eye_blink')) return;
    if (this.keepClosed) { this.set('eye_blink', 1); return; }

    this._blinkTimer -= dt;
    if (this._blinkTimer <= 0 && this._blinkElapsed <= 0) {
      this._blinkElapsed = 0.14;                    // whole blink lasts 140 ms
      this._blinkTimer   = 3 + Math.random() * 4;   // next blink in 3–7 s
    }
    if (this._blinkElapsed > 0) {
      this._blinkElapsed -= dt;
      const t = 1 - Math.max(0, this._blinkElapsed) / 0.14;  // 0..1
      // Sine curve: 0 → 1 → 0
      this.set('eye_blink', Math.sin(t * Math.PI), { instant: true });
    }
  }
}