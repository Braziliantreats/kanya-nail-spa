/* Green Rush — obstacle & pickup spawner: pattern templates, object pooling,
   collisions, magnet attraction. Entities scroll toward +z past the player. */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});
  const C = GR.CFG;

  /* hitboxes: y0..y1 vertical span, hw half-width, hd half-depth */
  const DEFS = {
    crate:   { kind: 'jump',  hw: 0.52, y0: 0,    y1: 1.0,  hd: 0.5 },
    barrel:  { kind: 'jump',  hw: 0.62, y0: 0,    y1: 0.88, hd: 0.42 },
    barrier: { kind: 'jump',  hw: 0.88, y0: 0,    y1: 0.9,  hd: 0.16 },
    rack:    { kind: 'slide', hw: 1.0,  y0: 1.06, y1: 2.4,  hd: 0.28 },
    gantry:  { kind: 'slide', hw: 1.02, y0: 1.05, y1: 2.6,  hd: 0.22 },
    stack:   { kind: 'block', hw: 0.55, y0: 0,    y1: 2.05, hd: 0.5 },
    tractor: { kind: 'block', hw: 0.92, y0: 0,    y1: 2.2,  hd: 1.25 },
    van:     { kind: 'block', hw: 0.98, y0: 0,    y1: 2.25, hd: 1.5 },
  };

  /* ---------------------------------------------------- prop textures */
  function crateTexture() {
    const { canvas, ctx } = GR.makeCanvas(256, 256);
    ctx.fillStyle = '#a8763e';
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? '#9c6d38' : '#b07f45';
      ctx.fillRect(0, i * 64, 256, 60);
      ctx.fillStyle = 'rgba(60,35,15,0.5)';
      ctx.fillRect(0, i * 64 + 60, 256, 4);
    }
    ctx.strokeStyle = '#7a5228';
    ctx.lineWidth = 14;
    ctx.strokeRect(7, 7, 242, 242);
    ctx.globalAlpha = 0.75;
    GR.drawLeaf(ctx, 128, 148, 52, '#2c5e34', 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2c5e34';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('KAYA FARMS', 128, 220);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function stripeTexture() {
    const { canvas, ctx } = GR.makeCanvas(128, 64);
    ctx.fillStyle = '#e8ddc8';
    ctx.fillRect(0, 0, 128, 64);
    ctx.fillStyle = '#e2762c';
    for (let x = -64; x < 128; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, 64); ctx.lineTo(x + 22, 0); ctx.lineTo(x + 44, 0); ctx.lineTo(x + 22, 64);
      ctx.closePath(); ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function duckSignTexture() {
    const { canvas, ctx } = GR.makeCanvas(256, 128);
    ctx.fillStyle = '#f2c94c';
    ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#1f1f23';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 118);
    ctx.fillStyle = '#1f1f23';
    ctx.font = 'bold 56px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DUCK!', 128, 84);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function vanTexture() {
    const { canvas, ctx } = GR.makeCanvas(256, 128);
    ctx.fillStyle = '#3e8e7e';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#f4f1ea';
    ctx.font = 'bold 34px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('KAYA', 128, 52);
    ctx.fillText('EXPRESS', 128, 92);
    GR.drawLeaf(ctx, 38, 66, 26, '#bfe8c4', 0);
    GR.drawLeaf(ctx, 218, 66, 26, '#bfe8c4', 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function x2Texture() {
    const { canvas, ctx } = GR.makeCanvas(128, 128);
    ctx.fillStyle = '#f7b32b';
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, GR.TAU);
    ctx.fill();
    ctx.fillStyle = '#7a4c12';
    ctx.font = 'bold 60px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('×2', 64, 86);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ==================================================================== */
  GR.Spawner = class {
    constructor(scene) {
      this.scene = scene;
      this.pools = {};       // type → [entity]
      this.active = [];      // live obstacles
      this.tokens = [];      // live tokens
      this.powers = [];      // live power-ups
      this.tokenPool = [];
      this.powerPools = { magnet: [], shield: [], boost: [] };
      this.gapLeft = 30;     // distance until next pattern
      this.auto = true;      // pattern auto-spawning (off during the tutorial)
      this.t = 0;

      /* shared materials */
      this.mats = {
        crate: GR.toonMat({ map: crateTexture() }),
        wood: GR.toonMat({ color: 0x8a6b48 }),
        stripe: GR.toonMat({ map: stripeTexture() }),
        metal: new THREE.MeshStandardMaterial({ color: 0x9aa3ab, roughness: 0.5, metalness: 0.5 }),
        barrel: GR.toonMat({ color: 0x3f7d4a }),
        dark: GR.toonMat({ color: 0x23262b }),
        tractor: GR.toonMat({ color: 0x4c8c3c }),
        tractorAccent: GR.toonMat({ color: 0xe9c24c }),
        van: GR.toonMat({ color: 0x3e8e7e }),
        vanDecal: new THREE.MeshBasicMaterial({ map: vanTexture() }),
        duck: new THREE.MeshBasicMaterial({ map: duckSignTexture() }),
        herb: GR.toonMat({ color: 0x2f6b34 }),
        rope: GR.toonMat({ color: 0xd8cba8 }),
        white: GR.toonMat({ color: 0xf4f1ea }),
        red: GR.toonMat({ color: 0xd64545 }),
        gold: new THREE.MeshStandardMaterial({ color: 0xe9b64c, roughness: 0.3, metalness: 0.7 }),
        bubble: new THREE.MeshStandardMaterial({ color: 0x7dffb5, roughness: 0.2, transparent: true, opacity: 0.4 }),
        x2: new THREE.MeshBasicMaterial({ map: x2Texture(), transparent: true, side: THREE.DoubleSide }),
      };
      this.leafTex = GR.leafTexture(128, '#ffd54a', null);
      this.glowTex = (function () {
        const { canvas, ctx } = GR.makeCanvas(64, 64);
        const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,220,110,0.85)');
        g.addColorStop(1, 'rgba(255,220,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      })();
      this.tokenMat = new THREE.MeshBasicMaterial({ map: this.leafTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.1 });
      this.glowMat = new THREE.SpriteMaterial({ map: this.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    }

    /* ------------------------------------------------ entity builders */
    _cast(g) {
      g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      return g;
    }

    _build(type) {
      const M = this.mats;
      const g = new THREE.Group();
      if (type === 'crate') {
        const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.0, 1.0), M.crate);
        box.position.y = 0.5;
        g.add(box);
      } else if (type === 'barrel') {
        for (const sx of [-0.3, 0.3]) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.85, 14), M.barrel);
          b.position.set(sx, 0.425, 0);
          g.add(b);
          for (const ry of [0.15, 0.6]) {
            const ring = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.02, 6, 18), M.metal);
            ring.rotation.x = Math.PI / 2;
            ring.position.set(sx, ry, 0);
            g.add(ring);
          }
        }
      } else if (type === 'barrier') {
        const plank = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.36, 0.1), M.stripe);
        plank.position.y = 0.68;
        g.add(plank);
        for (const sx of [-0.75, 0.75]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.86, 0.1), M.wood);
          leg.position.set(sx, 0.43, 0);
          g.add(leg);
        }
      } else if (type === 'rack') {
        for (const sx of [-1.0, 1.0]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), M.wood);
          post.position.set(sx, 1.2, 0);
          g.add(post);
        }
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.1, 0.1), M.wood);
        bar.position.y = 2.35;
        g.add(bar);
        for (let i = 0; i < 4; i++) {
          const x = GR.lerp(-0.8, 0.8, i / 3);
          const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.4, 5), M.rope);
          rope.position.set(x, 2.1, 0);
          g.add(rope);
          const bundle = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 7), M.herb);
          bundle.rotation.x = Math.PI;
          bundle.position.set(x, 1.62, 0);
          g.add(bundle);
        }
      } else if (type === 'gantry') {
        for (const sx of [-1.05, 1.05]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 10), M.metal);
          post.position.set(sx, 1.3, 0);
          g.add(post);
        }
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.3, 12), M.metal);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.y = 1.42;
        g.add(pipe);
        const valve = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.03, 6, 14), M.red);
        valve.position.set(0.5, 1.42, 0.14);
        g.add(valve);
        const sign = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.45, 0.05), M.duck);
        sign.position.y = 2.15;
        g.add(sign);
      } else if (type === 'stack') {
        for (let i = 0; i < 2; i++) {
          const box = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.0, 1.0), M.crate);
          box.position.y = 0.5 + i * 1.0;
          box.rotation.y = i * 0.22;
          g.add(box);
        }
      } else if (type === 'tractor') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 2.1), M.tractor);
        body.position.y = 0.95;
        g.add(body);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 1.0), M.tractorAccent);
        cab.position.set(0, 1.75, 0.35);
        g.add(cab);
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 8), M.dark);
        pipe.position.set(0.45, 1.7, -0.75);
        g.add(pipe);
        const wheelGeoB = new THREE.CylinderGeometry(0.55, 0.55, 0.3, 14);
        const wheelGeoS = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
        for (const [sx, sz, big] of [[-0.75, 0.65, true], [0.75, 0.65, true], [-0.7, -0.75, false], [0.7, -0.75, false]]) {
          const w = new THREE.Mesh(big ? wheelGeoB : wheelGeoS, M.dark);
          w.rotation.z = Math.PI / 2;
          w.position.set(sx, big ? 0.55 : 0.34, sz);
          g.add(w);
        }
      } else if (type === 'van') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.5, 2.9), M.van);
        body.position.y = 1.15;
        g.add(body);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.5, 2.7), M.white);
        roof.position.y = 2.0;
        g.add(roof);
        for (const sx of [-0.86, 0.86]) {
          const decal = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.0), M.vanDecal);
          decal.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2;
          decal.position.set(sx, 1.25, 0);
          g.add(decal);
        }
        for (const [sx, sz] of [[-0.7, 0.95], [0.7, 0.95], [-0.7, -0.95], [0.7, -0.95]]) {
          const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.24, 12), M.dark);
          w.rotation.z = Math.PI / 2;
          w.position.set(sx, 0.32, sz);
          g.add(w);
        }
      }
      return this._cast(g);
    }

    _buildToken() {
      const g = new THREE.Group();
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.62), this.tokenMat);
      g.add(leaf);
      const glow = new THREE.Sprite(this.glowMat);
      glow.scale.set(1.1, 1.1, 1);
      g.add(glow);
      return g;
    }

    _buildPower(type) {
      const M = this.mats;
      const g = new THREE.Group();
      if (type === 'magnet') {
        const horse = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.09, 8, 18, Math.PI), M.red);
        horse.rotation.z = Math.PI;
        g.add(horse);
        for (const sx of [-0.28, 0.28]) {
          const tip = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), M.white);
          tip.position.set(sx, 0.32, 0);
          g.add(tip);
        }
      } else if (type === 'shield') {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), M.bubble);
        g.add(orb);
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), this.tokenMat);
        g.add(leaf);
      } else {
        const disc = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), M.x2);
        g.add(disc);
      }
      // no castShadow: transparent pickups would throw solid shadow blobs
      return g;
    }

    /* ------------------------------------------------ pooling */
    _getObstacle(type) {
      const pool = (this.pools[type] = this.pools[type] || []);
      let e = pool.find((x) => !x.live);
      if (!e) {
        e = { type, group: this._build(type), live: false };
        pool.push(e);
        this.scene.add(e.group);
      }
      return e;
    }

    _getToken() {
      let t = this.tokenPool.find((x) => !x.live);
      if (!t) {
        t = { group: this._buildToken(), live: false };
        this.tokenPool.push(t);
        this.scene.add(t.group);
      }
      return t;
    }

    _getPower(type) {
      const pool = this.powerPools[type];
      let p = pool.find((x) => !x.live);
      if (!p) {
        p = { type, group: this._buildPower(type), live: false };
        pool.push(p);
        this.scene.add(p.group);
      }
      return p;
    }

    /* ------------------------------------------------ spawn API */
    spawnObstacle(type, lane, z) {
      const e = this._getObstacle(type);
      const def = DEFS[type];
      e.live = true;
      e.lane = lane;
      e.x = C.lanes[lane];
      e.z = z;
      e.def = def;
      e.group.position.set(e.x, 0, z);
      e.group.visible = true;
      this.active.push(e);
    }

    spawnToken(lane, z, y) {
      const t = this._getToken();
      t.live = true;
      t.x = C.lanes[lane];
      t.y = y || 1.05;
      t.z = z;
      t.group.position.set(t.x, t.y, z);
      t.group.visible = true;
      this.tokens.push(t);
    }

    spawnPower(type, lane, z) {
      const p = this._getPower(type);
      p.live = true;
      p.x = C.lanes[lane];
      p.y = 1.15;
      p.z = z;
      p.group.position.set(p.x, p.y, z);
      p.group.visible = true;
      this.powers.push(p);
    }

    /* ------------------------------------------------ patterns */
    _pattern(diff) {
      const Z = C.spawnZ;
      const lane = GR.randi(0, 2);
      const other = (lane + GR.randi(1, 2)) % 3;
      const jumpType = () => GR.pick(['crate', 'barrel', 'barrier']);
      const slideType = () => GR.pick(['rack', 'gantry']);
      const blockType = () => GR.pick(['stack', 'tractor', 'van']);
      const line = (ln, z0, n, dz) => { for (let i = 0; i < n; i++) this.spawnToken(ln, z0 - i * dz); };
      const arc = (ln, zc) => {
        for (let i = 0; i < 5; i++) {
          const k = i / 4;
          this.spawnToken(ln, zc + 2.4 - k * 4.8, 0.9 + Math.sin(k * Math.PI) * 1.35);
        }
      };

      const patterns = [
        // 0: single jump + coin arc
        () => { this.spawnObstacle(jumpType(), lane, Z); arc(lane, Z); return 16; },
        // 1: token river + maybe power
        () => {
          line(lane, Z, 8, 2.3);
          if (Math.random() < 0.4) this.spawnPower(GR.pick(['magnet', 'shield', 'boost']), lane, Z - 8 * 2.3);
          return 26;
        },
        // 2: slide bar with treats underneath
        () => { this.spawnObstacle(slideType(), lane, Z); line(lane, Z + 1.5, 4, 1.8); return 16; },
        // 3: two-lane jump, tokens on the free lane
        () => {
          const free = 3 - lane - other;
          this.spawnObstacle(jumpType(), lane, Z);
          this.spawnObstacle(jumpType(), other, Z);
          line(free, Z + 3, 5, 2.2);
          return 20;
        },
        // 4: blocker weave
        () => {
          const l0 = lane;
          const seq = [l0, (l0 + 1) % 3, (l0 + 2) % 3];
          seq.forEach((ln, i) => {
            this.spawnObstacle(blockType(), ln, Z - i * 13);
            line((ln + 1) % 3, Z - i * 13 + 4, 3, 2.0);
          });
          return 13 * 3 + 8;
        },
        // 5: wall with one gap
        () => {
          const free = GR.randi(0, 2);
          for (let ln = 0; ln < 3; ln++) if (ln !== free) this.spawnObstacle(blockType(), ln, Z);
          line(free, Z + 4, 5, 2.0);
          return 22;
        },
        // 6: jump then slide, same lane (spaced past a max-speed jump arc)
        () => {
          this.spawnObstacle(jumpType(), lane, Z);
          this.spawnObstacle(slideType(), lane, Z - 22);
          arc(lane, Z);
          line(lane, Z - 20.5, 3, 1.6);
          return 34;
        },
        // 7: barrier fence across two lanes + arcs
        () => {
          this.spawnObstacle('barrier', lane, Z);
          this.spawnObstacle('barrier', other, Z);
          arc(lane, Z);
          return 15;
        },
        // 8: power alley
        () => {
          this.spawnPower(GR.pick(['magnet', 'shield', 'boost']), lane, Z);
          line(lane, Z + 5, 3, 2.0);
          return 14;
        },
        // 9: dense mixed gauntlet (late game)
        () => {
          const free = GR.randi(0, 2);
          for (let ln = 0; ln < 3; ln++) if (ln !== free) this.spawnObstacle(blockType(), ln, Z);
          this.spawnObstacle(slideType(), free, Z - 9);
          line(free, Z - 7.5, 4, 1.8);
          this.spawnObstacle(jumpType(), free, Z - 18);
          arc(free, Z - 18);
          return 34;
        },
      ];

      let weights;
      if (diff < 0.15) weights = [3, 3, 2, 1, 0, 0, 0, 1, 1, 0];
      else if (diff < 0.45) weights = [3, 2, 3, 2, 1, 2, 2, 2, 1, 0];
      else weights = [2, 1, 2, 2, 3, 3, 3, 2, 1, 3];
      let total = 0;
      for (const w of weights) total += w;
      let r = Math.random() * total, idx = 0;
      for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) { idx = i; break; } }
      return patterns[idx]();
    }

    reset() {
      for (const e of this.active) { e.live = false; e.group.visible = false; }
      for (const t of this.tokens) { t.live = false; t.group.visible = false; }
      for (const p of this.powers) { p.live = false; p.group.visible = false; }
      this.active.length = this.tokens.length = this.powers.length = 0;
      this.gapLeft = 35;
    }

    /* hide an obstacle (shield smash) */
    smash(e) {
      e.live = false;
      e.group.visible = false;
      const i = this.active.indexOf(e);
      if (i >= 0) this.active.splice(i, 1);
    }

    /* player = { x, y0, y1, magnet } ; returns frame events */
    update(dt, speed, dist, player) {
      this.t += dt;
      const events = { tokens: 0, power: null, hit: null };
      const diff = GR.clamp(dist / 2600, 0, 1);
      const move = speed * dt;

      // spawn cadence
      if (this.auto) {
        this.gapLeft -= move;
        if (this.gapLeft <= 0) {
          const len = this._pattern(diff);
          this.gapLeft = len + GR.lerp(20, 7, diff) + GR.rand(0, 6);
        }
      }

      const pb = C.playerBox;

      // obstacles
      for (let i = this.active.length - 1; i >= 0; i--) {
        const e = this.active[i];
        const zPrev = e.z;
        e.z += move;
        e.group.position.z = e.z;
        if (e.z - e.def.hd > C.killZ) {
          e.live = false;
          e.group.visible = false;
          this.active.splice(i, 1);
          continue;
        }
        // collision — swept over this frame's z travel so thin obstacles
        // (barrier, gantry) can't tunnel through the player on a slow frame
        const win = e.def.hd + pb.hd;
        if (
          e.z > -win && zPrev < win &&
          Math.abs(e.x - player.x) < e.def.hw + pb.hw &&
          player.y0 < e.def.y1 - 0.05 &&
          player.y1 > e.def.y0 + 0.05
        ) {
          events.hit = e;
        }
      }

      // tokens
      for (let i = this.tokens.length - 1; i >= 0; i--) {
        const t = this.tokens[i];
        t.z += move;
        if (t.z > C.killZ) {
          t.live = false;
          t.group.visible = false;
          this.tokens.splice(i, 1);
          continue;
        }
        // magnet pull
        if (player.magnet) {
          const dx = player.x - t.x, dy = 1.0 - t.y, dz = 0 - t.z;
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d < 7) {
            const k = Math.min(1, dt * (16 - d * 1.5) / Math.max(d, 0.001) * 2);
            t.x += dx * k; t.y += dy * k; t.z += dz * k;
          }
        }
        t.group.position.set(t.x, t.y + Math.sin(this.t * 3 + i) * 0.06, t.z);
        t.group.rotation.y += dt * 3.2;
        // scale in near the fog wall so the additive glow doesn't pop at the horizon
        t.group.scale.setScalar(GR.clamp((t.z + 178) / 25, 0.001, 1));
        // collect
        const py = (player.y0 + player.y1) / 2;
        if (Math.abs(t.z) < 0.8 && Math.abs(t.x - player.x) < 0.8 && t.y > player.y0 - 0.4 && t.y < player.y1 + 0.5) {
          events.tokens++;
          t.live = false;
          t.group.visible = false;
          this.tokens.splice(i, 1);
        }
      }

      // power-ups
      for (let i = this.powers.length - 1; i >= 0; i--) {
        const p = this.powers[i];
        p.z += move;
        if (p.z > C.killZ) {
          p.live = false;
          p.group.visible = false;
          this.powers.splice(i, 1);
          continue;
        }
        p.group.position.set(p.x, p.y + Math.sin(this.t * 2.6 + i * 2) * 0.12, p.z);
        p.group.rotation.y += dt * 2.2;
        p.group.scale.setScalar(GR.clamp((p.z + 178) / 25, 0.001, 1));
        if (Math.abs(p.z) < 0.9 && Math.abs(p.x - player.x) < 0.85 && p.y > player.y0 - 0.5 && p.y < player.y1 + 0.6) {
          events.power = p.type;
          p.live = false;
          p.group.visible = false;
          this.powers.splice(i, 1);
        }
      }

      return events;
    }
  };
})();
