// Tutor3D — Three.js runtime for AI-generated tutor animations.
// Plain script; requires globalThis.THREE (vendored bundle) and TutorAnim core.
(() => {
  const { easings, applyTweens, timelineDuration } = globalThis.TutorAnim;
  const activeScenes = [];

  function createScene3D({ span = 6, width = 640, height = 400 } = {}) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.setClearColor(0x0f172a);
    renderer.domElement.style.maxWidth = "100%";
    renderer.domElement.style.borderRadius = "8px";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, span * 40);
    camera.position.set(span * 1.5, span * 1.1, span * 1.9);

    scene.add(new THREE.AmbientLight(0x8899bb, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(5, 10, 7);
    scene.add(sun);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.7;
    controls.target.set(0, span * 0.1, 0);
    controls.addEventListener("start", () => { controls.autoRotate = false; });

    const tweens = [];
    const updaters = [];
    let time = 0;
    let speed = 1;
    let playing = true;
    let alive = true;
    let lastNow = null;

    function render() {
      applyTweens(tweens, time);
      for (const u of updaters) u();
      controls.update();
      renderer.render(scene, camera);
    }

    function tick(now) {
      if (!alive) return;
      const dt = lastNow == null ? 0 : (now - lastNow) / 1000;
      lastNow = now;
      if (playing) {
        time += dt * speed;
        const total = timelineDuration(tweens);
        if (total > 0 && time >= total) {
          time = total;
          playing = false;
          playBtn.textContent = "▶";
        }
      }
      render();
      requestAnimationFrame(tick);
    }

    // --- controls bar (same UX as the 2D engine) ---
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:inline-block;font-family:system-ui;width:100%";
    const bar = document.createElement("div");
    bar.style.cssText = "display:flex;gap:6px;align-items:center;margin-top:6px";
    const btnStyle = "background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;padding:2px 10px;cursor:pointer";
    const playBtn = document.createElement("button");
    playBtn.textContent = "⏸";
    playBtn.style.cssText = btnStyle;
    playBtn.onclick = () => {
      const total = timelineDuration(tweens);
      if (!playing && total > 0 && time >= total) time = 0;
      playing = !playing;
      playBtn.textContent = playing ? "⏸" : "▶";
    };
    const replayBtn = document.createElement("button");
    replayBtn.textContent = "↺";
    replayBtn.style.cssText = btnStyle;
    replayBtn.onclick = () => {
      time = 0;
      playing = true;
      playBtn.textContent = "⏸";
    };
    const speedSel = document.createElement("select");
    speedSel.style.cssText = btnStyle;
    for (const s of [0.5, 1, 2]) {
      const o = document.createElement("option");
      o.value = s;
      o.textContent = `${s}×`;
      if (s === 1) o.selected = true;
      speedSel.appendChild(o);
    }
    speedSel.onchange = () => { speed = Number(speedSel.value); };
    const hint = document.createElement("span");
    hint.textContent = "drag to rotate";
    hint.style.cssText = "color:#64748b;font-size:12px;margin-left:auto";
    bar.append(playBtn, replayBtn, speedSel, hint);
    wrap.append(renderer.domElement, bar);
    (document.getElementById("stage") || document.body).appendChild(wrap);

    requestAnimationFrame(tick);
    // First-frame fallback: rAF doesn't fire in hidden tabs.
    setTimeout(render, 0);

    function material(color, extra = {}) {
      return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra });
    }
    function alphaExtra(opacity) {
      return opacity != null && opacity < 1 ? { transparent: true, opacity } : {};
    }

    const api = {
      scene, camera, renderer, controls,
      add(obj) { scene.add(obj); return obj; },
      axes({ len = span } = {}) {
        const mk = (dir, color) => {
          scene.add(new THREE.ArrowHelper(
            new THREE.Vector3(...dir).normalize(), new THREE.Vector3(0, 0, 0),
            len, color, len * 0.05, len * 0.03
          ));
        };
        mk([1, 0, 0], 0xef4444);
        mk([0, 1, 0], 0x22c55e);
        mk([0, 0, 1], 0x3b82f6);
        api.label("x", { x: len * 1.1, y: 0, z: 0, size: 0.5 });
        api.label("y", { x: 0, y: len * 1.1, z: 0, size: 0.5 });
        api.label("z", { x: 0, y: 0, z: len * 1.1, size: 0.5 });
      },
      grid() {
        const g = new THREE.GridHelper(span * 2, span * 2, 0x475569, 0x1e293b);
        scene.add(g);
        return g;
      },
      sphere({ x = 0, y = 0, z = 0, r = 0.3, color = "#38bdf8", opacity } = {}) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), material(color, alphaExtra(opacity)));
        m.position.set(x, y, z);
        scene.add(m);
        return m;
      },
      box({ x = 0, y = 0, z = 0, w = 1, h = 1, d = 1, color = "#38bdf8", opacity } = {}) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(color, alphaExtra(opacity)));
        m.position.set(x, y, z);
        scene.add(m);
        return m;
      },
      arrow({ from = [0, 0, 0], to = [1, 1, 0], color = "#f59e0b" } = {}) {
        const helper = new THREE.ArrowHelper(
          new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 1, color, 0.25, 0.15
        );
        scene.add(helper);
        const handle = {
          from: { x: from[0], y: from[1], z: from[2] },
          to: { x: to[0], y: to[1], z: to[2] },
          helper,
        };
        updaters.push(() => {
          const o = new THREE.Vector3(handle.from.x, handle.from.y, handle.from.z);
          const t = new THREE.Vector3(handle.to.x, handle.to.y, handle.to.z);
          const d = t.sub(o);
          const len = Math.max(d.length(), 1e-6);
          helper.position.copy(o);
          helper.setDirection(d.normalize());
          helper.setLength(len, Math.min(0.3, len * 0.25), Math.min(0.18, len * 0.15));
        });
        return handle;
      },
      curve3d(fn, { t0 = 0, t1 = 1, color = "#38bdf8", segments = 240, progress = 1 } = {}) {
        const pts = [];
        for (let i = 0; i <= segments; i++) {
          const t = t0 + ((t1 - t0) * i) / segments;
          const [x, y, z] = fn(t);
          pts.push(new THREE.Vector3(x, y, z));
        }
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }));
        scene.add(line);
        const handle = { progress, line };
        updaters.push(() => {
          const p = Math.max(0, Math.min(1, handle.progress));
          geo.setDrawRange(0, Math.max(2, Math.round(p * (segments + 1))));
        });
        return handle;
      },
      surface(fn, { xmin = -3, xmax = 3, zmin = -3, zmax = 3, color = "#38bdf8", opacity = 0.85, steps = 40 } = {}) {
        const geo = new THREE.PlaneGeometry(xmax - xmin, zmax - zmin, steps, steps);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const cx = (xmin + xmax) / 2;
        const cz = (zmin + zmax) / 2;
        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i) + cx;
          const z = pos.getZ(i) + cz;
          pos.setX(i, x);
          pos.setZ(i, z);
          pos.setY(i, fn(x, z));
        }
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, material(color, { ...alphaExtra(opacity), side: THREE.DoubleSide }));
        scene.add(m);
        return m;
      },
      label(text, { x = 0, y = 0, z = 0, size = 0.6, color = "#e2e8f0" } = {}) {
        const c = document.createElement("canvas");
        c.width = 512;
        c.height = 128;
        const g = c.getContext("2d");
        g.font = "48px system-ui";
        g.fillStyle = color;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(text, 256, 64);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(c), transparent: true, depthTest: false,
        }));
        sprite.scale.set(size * 4, size, 1);
        sprite.position.set(x, y, z);
        scene.add(sprite);
        return sprite;
      },
      tween(target, props, duration, { delay = 0, easing = "easeInOut" } = {}) {
        tweens.push({ target, props, duration, delay, easing: easings[easing] || easings.easeInOut });
        return api;
      },
      params(schema = {}) {
        const values = {};
        let paramsBar = wrap.querySelector(".tutor3d-params");
        if (!paramsBar) {
          paramsBar = document.createElement("div");
          paramsBar.className = "tutor3d-params";
          paramsBar.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-top:6px";
          wrap.appendChild(paramsBar);
        }
        for (const key in schema) {
          const { label = key, min = 0, max = 1, step = 0.1, default: def = min } = schema[key];
          values[key] = def;
          const row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;color:#94a3b8";
          const text = document.createElement("span");
          text.textContent = label;
          text.style.cssText = "min-width:120px";
          const input = document.createElement("input");
          input.type = "range";
          input.min = min;
          input.max = max;
          input.step = step;
          input.value = def;
          input.style.cssText = "flex:1";
          const valueLabel = document.createElement("span");
          valueLabel.textContent = def;
          valueLabel.style.cssText = "min-width:40px;text-align:right;color:#e2e8f0";
          input.oninput = () => {
            values[key] = Number(input.value);
            valueLabel.textContent = input.value;
          };
          row.append(text, input, valueLabel);
          paramsBar.appendChild(row);
        }
        return values;
      },
    };

    activeScenes.push({
      dispose() {
        alive = false;
        wrap.remove();
        renderer.dispose();
      },
    });
    return api;
  }

  function disposeAll() {
    while (activeScenes.length) activeScenes.pop().dispose();
  }

  globalThis.Tutor3D = { createScene3D, disposeAll };
  globalThis.createScene3D = createScene3D;
})();
