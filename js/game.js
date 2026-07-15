/* Green Rush — game orchestrator: renderer, states, player physics, input,
   camera direction, particles, power-ups, scoring, death cinematic. */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});
  const C = GR.CFG;

  GR.Game = class {
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.settings = settings;
      this.state = 'menu';
      this.callbacks = { onScore: null, onGameOver: null, onPower: null, onState: null, onTut: null };
      this.tut = null; // active tutorial state

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this._applyPixelRatio();

      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 700);
      this.camera.position.set(2.6, 1.7, -3.6);

      this.world = new GR.World(this.scene, settings.quality);
      this.spawner = new GR.Spawner(this.scene);

      /* player state */
      this.laneIdx = 1;
      this.px = 0;
      this.py = 0;
      this.velY = 0;
      this.grounded = true;
      this.slideT = 0;
      this.jumpBuffer = 0;
      this.slideBuffer = 0;
      this.speed = C.baseSpeed;
      this.dist = 0;
      this.score = 0;
      this.leaves = 0;
      this.magnetT = 0;
      this.shieldT = 0;
      this.boostT = 0;
      this.invulnT = 0;
      this.deathT = 0;
      this.shakeT = 0;
      this.timeScale = 1;
      this.menuOrbit = 0;
      this.spinPause = 0;
      this.camPos = new THREE.Vector3(2.6, 1.7, -3.6);
      this.camLook = new THREE.Vector3(0, 1.05, 0);
      this.fov = 62;
      this.customLookX = -0.75; // shifts the character off-center behind the editor panel

      this.avatar = null;
      this.animator = null;
      this.setAvatar(GR.Store.loadAvatar());

      this._buildEffects();
      this._bindInput();

      this._last = performance.now();
      this._raf = this._raf || null;
      const loop = (now) => {
        this._raf = requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - this._last) / 1000);
        this._last = now;
        this.update(dt);
      };
      this._raf = requestAnimationFrame(loop);
    }

    /* ---------------------------------------------------- avatar */
    setAvatar(cfg) {
      this._wantedCfg = cfg;
      let useCfg = cfg;
      if (cfg.runner === 'robot' && (!GR.RobotLib || !GR.RobotLib.ready())) {
        // model still downloading — stand in with clay, swap when it lands
        if (GR.RobotLib) {
          GR.RobotLib.load(() => {
            if (this._wantedCfg && this._wantedCfg.runner === 'robot') this.setAvatar(this._wantedCfg);
          });
        }
        useCfg = Object.assign({}, cfg, { runner: 'clay' });
      }
      const rotY = this.avatar ? this.avatar.group.rotation.y : 0;
      if (this.avatar) {
        this.scene.remove(this.avatar.group);
        this.avatar.dispose();
      }
      this.avatar = useCfg.runner === 'robot' ? GR.buildRobotAvatar(useCfg) : GR.buildAvatar(useCfg);
      this.avatar.group.position.set(this.px, this.py, 0);
      this.avatar.group.rotation.y = rotY;
      this.scene.add(this.avatar.group);

      const kind = this.avatar.kind || 'clay';
      if (!this.animator || this._animKind !== kind) {
        this.animator = kind === 'robot' ? new GR.RobotAnimator(this.avatar) : new GR.AvatarAnimator(this.avatar);
        this._animKind = kind;
        this.animator.setState(this.state === 'running' ? 'run' : 'idle');
      } else {
        this.animator.setAvatar(this.avatar);
      }
    }

    /* ---------------------------------------------------- effects */
    _buildEffects() {
      // dust + sparkle sprite pools
      const dustTex = (color) => {
        const { canvas, ctx } = GR.makeCanvas(32, 32);
        const g = ctx.createRadialGradient(16, 16, 2, 16, 16, 16);
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      };
      this.fx = [];
      // shared textures, per-sprite materials (each particle fades independently)
      this.fxKinds = {
        dust: { map: dustTex('rgba(228,238,220,0.55)'), blending: THREE.NormalBlending }, // soft smoke puffs
        gold: { map: dustTex('rgba(255,215,90,0.9)'), blending: THREE.AdditiveBlending },
      };
      for (let i = 0; i < 40; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fxKinds.dust.map, transparent: true, depthWrite: false }));
        sp.visible = false;
        this.scene.add(sp);
        this.fx.push({ sp, life: 0, maxLife: 1, vel: new THREE.Vector3() });
      }
      this.dustClock = 0;

      // shield bubble
      this.shieldMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 20, 14),
        new THREE.MeshStandardMaterial({ color: 0x7dffb5, transparent: true, opacity: 0.22, roughness: 0.15, depthWrite: false })
      );
      this.shieldMesh.visible = false;
      this.scene.add(this.shieldMesh);

      // magnet ring
      this.magnetRing = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.035, 8, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd54a, transparent: true, opacity: 0.7 })
      );
      this.magnetRing.rotation.x = Math.PI / 2;
      this.magnetRing.visible = false;
      this.scene.add(this.magnetRing);
    }

    _spawnFx(kind, x, y, z, count, spread, up) {
      let spawned = 0;
      for (const f of this.fx) {
        if (f.life > 0) continue;
        f.sp.material.map = this.fxKinds[kind].map;
        f.sp.material.blending = this.fxKinds[kind].blending;
        f.sp.material.opacity = 1;
        f.sp.visible = true;
        f.sp.position.set(x + GR.rand(-spread, spread), y + GR.rand(0, 0.1), z + GR.rand(-spread, spread));
        f.sp.scale.setScalar(GR.rand(0.15, 0.3));
        f.maxLife = f.life = GR.rand(0.3, 0.55);
        f.vel.set(GR.rand(-0.5, 0.5), GR.rand(0.8, 1.6) * up, GR.rand(0.5, 1.5));
        if (++spawned >= count) break;
      }
    }

    _updateFx(dt) {
      for (const f of this.fx) {
        if (f.life <= 0) continue;
        f.life -= dt;
        if (f.life <= 0) { f.sp.visible = false; continue; }
        f.sp.position.addScaledVector(f.vel, dt);
        f.sp.position.z += this.state === 'running' ? this.speed * dt * 0.4 : 0;
        const k = f.life / f.maxLife;
        f.sp.scale.setScalar(GR.lerp(0.45, 0.12, k));
        f.sp.material.opacity = k;
      }
    }

    /* ---------------------------------------------------- input */
    _bindInput() {
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const k = e.code;
        if (this.state === 'running') {
          if (k === 'ArrowLeft' || k === 'KeyA') this.moveLane(-1);
          else if (k === 'ArrowRight' || k === 'KeyD') this.moveLane(1);
          else if (k === 'ArrowUp' || k === 'KeyW' || k === 'Space') { e.preventDefault(); this.jump(); }
          else if (k === 'ArrowDown' || k === 'KeyS') this.slide();
        }
        if (k === 'Escape' || k === 'KeyP') {
          if (this.state === 'running') this.pause();
          else if (this.state === 'paused') this.resume();
        }
      });

      // touch swipes — track ONE finger by identifier; trigger as soon as the
      // dominant axis passes the threshold. A second resting finger neither
      // re-fires the gesture nor kills tracking.
      let tx = 0, ty = 0, touchId = null, fired = false;
      const opts = { passive: false };
      const findTouch = (list) => {
        for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId) return list[i];
        return null;
      };
      this.canvas.addEventListener('touchstart', (e) => {
        if (touchId !== null && findTouch(e.touches)) return; // already tracking a live finger
        const t = e.changedTouches[0];
        touchId = t.identifier;
        fired = false;
        tx = t.clientX; ty = t.clientY;
      }, opts);
      this.canvas.addEventListener('touchmove', (e) => {
        if (touchId === null || fired || this.state !== 'running') return;
        const t = findTouch(e.touches);
        if (!t) return;
        e.preventDefault();
        const dx = t.clientX - tx;
        const dy = t.clientY - ty;
        const TH = 26;
        if (Math.abs(dx) < TH && Math.abs(dy) < TH) return;
        fired = true;
        if (Math.abs(dx) > Math.abs(dy)) this.moveLane(dx > 0 ? 1 : -1);
        else if (dy < 0) this.jump();
        else this.slide();
      }, opts);
      const endTouch = (e) => {
        if (touchId !== null && findTouch(e.changedTouches)) touchId = null;
      };
      this.canvas.addEventListener('touchend', endTouch, opts);
      this.canvas.addEventListener('touchcancel', endTouch, opts);

      // drag-to-rotate in the customizer
      let dragging = false, lastX = 0;
      this.canvas.addEventListener('pointerdown', (e) => {
        if (this.state !== 'custom') return;
        dragging = true; lastX = e.clientX;
        this.spinPause = 2.5;
      });
      window.addEventListener('pointermove', (e) => {
        if (!dragging || this.state !== 'custom') return;
        this.avatar.group.rotation.y += (e.clientX - lastX) * 0.012;
        lastX = e.clientX;
        this.spinPause = 2.5;
      });
      window.addEventListener('pointerup', () => { dragging = false; });
    }

    moveLane(dir) {
      const n = GR.clamp(this.laneIdx + dir, 0, 2);
      if (n !== this.laneIdx) {
        this.laneIdx = n;
        GR.Audio.sfx('whoosh');
        if (this.tut && this.tut.step === 0) this.tut.laneMoves++;
      }
    }

    jump() {
      if (this.grounded) {
        this.velY = C.jumpVel;
        this.grounded = false;
        this.slideT = 0;
        this.slideBuffer = 0;
        this.animator.setState('jump');
        GR.Audio.sfx('jump');
        this._spawnFx('dust', this.px, 0.05, 0.3, 5, 0.25, 1);
      } else {
        this.jumpBuffer = 0.14;
      }
    }

    slide() {
      if (!this.grounded) {
        this.velY = -16;        // slam down…
        this.slideBuffer = 0.25; // …and slide on landing
        return;
      }
      this.slideT = C.slideTime;
      this.animator.setState('slide');
      GR.Audio.sfx('slide');
    }

    /* ---------------------------------------------------- state */
    setState(name) {
      this.state = name;
      if (this.callbacks.onState) this.callbacks.onState(name);
    }

    startRun(opts) {
      this.tut = opts && opts.tutorial
        ? { step: -1, timer: 0.8, laneMoves: 0, ob: null, waitTokens: false }
        : null;
      this.spawner.reset();
      this.spawner.auto = !this.tut;
      this.laneIdx = 1;
      this.px = 0; this.py = 0; this.velY = 0;
      this.grounded = true;
      this.slideT = 0;
      this.jumpBuffer = 0;
      this.slideBuffer = 0;
      this.speed = C.baseSpeed;
      this.dist = 0; this.score = 0; this.leaves = 0;
      this.magnetT = this.shieldT = this.boostT = this.invulnT = 0;
      this.deathT = 0;
      this.timeScale = 1;
      this.avatar.group.rotation.set(0, 0, 0);
      this.avatar.group.position.set(0, 0, 0);
      this.animator.setState('run');
      this.avatar.setFace('open');
      GR.Audio.setIntensity(1);
      this.setState('running');
    }

    pause() {
      if (this.state !== 'running') return;
      // wall-clock flicker effects must not freeze in an invisible phase
      this.avatar.rig.visible = true;
      this.shieldMesh.visible = this.shieldT > 0;
      this.setState('paused');
    }

    resume() {
      if (this.state !== 'paused') return;
      this._last = performance.now();
      this.setState('running');
    }

    enterCustomize() {
      this.avatar.group.rotation.y = 0;
      this.animator.setState('idle');
      this.setState('custom');
    }

    backToMenu() {
      this.avatar.group.rotation.set(0, 0, 0);
      this.avatar.group.position.set(0, 0, 0);
      this.px = 0; this.py = 0;
      this.timeScale = 1;
      this.deathT = 0;
      this.tut = null;
      this._tutPrompt(null);
      this.animator.setState('idle');
      GR.Audio.setIntensity(0);
      this.spawner.reset();
      this.setState('menu');
    }

    _die(obstacle) {
      GR.Audio.sfx('hit');
      GR.Audio.setIntensity(0);
      this.animator.setState('dead');
      this.timeScale = 0.35;
      this.shakeT = 0.6;
      this.deathT = 0.0001;
      this.setState('dead');
    }

    /* ---------------------------------------------------- main loop */
    update(rdt) {
      const st = this.state;
      const dt = rdt * this.timeScale;

      // world always breathes (menus included) — slow ambient scroll.
      // Frozen during death so obstacles/tokens don't detach from the road.
      const worldSpeed = st === 'running' ? this.speed : st === 'dead' ? 0 : 2.2;
      if (st !== 'paused') this.world.update(dt, worldSpeed);

      if (st === 'running') this._updateRun(dt);
      else if (st === 'dead') this._updateDeath(rdt, dt);
      else if (st === 'menu' || st === 'custom') this._updateMenus(dt);

      if (st !== 'paused') {
        this.animator.update(dt, {
          speed: this.speed,
          lean: st === 'running' ? GR.clamp((C.lanes[this.laneIdx] - this.px) * 0.9, -1, 1) : 0,
          velY: this.velY,
          onGround: this.grounded,
        });
        this._updateFx(dt);
      }

      this._updateCamera(rdt);
      this.renderer.render(this.scene, this.camera);
    }

    endTutorial() {
      if (!this.tut) return;
      this.tut = null;
      this.spawner.auto = true;
      GR.Store.setTutorialDone();
      this._tutPrompt(null);
    }

    _tutPrompt(text, opts) {
      if (this.callbacks.onTut) this.callbacks.onTut(text, opts || {});
    }

    /* scripted first-run lesson: steer → jump → slide → collect → go */
    _updateTutorial(dt, ev) {
      const t = this.tut;
      t.timer -= dt;
      const spawnAhead = -45;

      // forgiving hits: smash the prop and try that step again
      if (ev && ev.hit) {
        this.spawner.smash(ev.hit);
        this.shakeT = 0.25;
        GR.Audio.sfx('slide');
        t.ob = null;
        t.timer = 1.2;
        t.retry = true;
      }

      switch (t.step) {
        case -1: // settle in
          if (t.timer <= 0) {
            t.step = 0;
            t.laneMoves = 0;
            this._tutPrompt('Welcome to the valley! Press ◀ ▶ (or swipe) to switch lanes', { skip: true });
          }
          break;
        case 0:
          if (t.laneMoves >= 2) {
            t.step = 1;
            t.timer = 0.8;
            this._tutPrompt('Nice moves 🍃', { skip: true });
          }
          break;
        case 1: // jump lesson
          if (t.timer <= 0 && !t.ob) {
            this.spawner.spawnObstacle('crate', this.laneIdx, spawnAhead);
            t.ob = this.spawner.active[this.spawner.active.length - 1];
            this._tutPrompt(t.retry ? 'Almost! JUMP the crate — ▲ / Space / swipe up' : 'A crate! JUMP it — ▲ / Space / swipe up', { skip: true });
          }
          if (t.ob && (!t.ob.live || t.ob.z > 2)) {
            t.step = 2;
            t.timer = 1.0;
            t.ob = null;
            t.retry = false;
            this._tutPrompt('Cleared it! 🔥', { skip: true });
          }
          break;
        case 2: // slide lesson
          if (t.timer <= 0 && !t.ob) {
            this.spawner.spawnObstacle('gantry', this.laneIdx, spawnAhead);
            t.ob = this.spawner.active[this.spawner.active.length - 1];
            this._tutPrompt(t.retry ? 'So close! SLIDE under — ▼ / swipe down' : 'Low pipe! SLIDE under — ▼ / swipe down', { skip: true });
          }
          if (t.ob && (!t.ob.live || t.ob.z > 2)) {
            t.step = 3;
            t.timer = 1.0;
            t.ob = null;
            t.retry = false;
            this._tutPrompt('Smooth 😎', { skip: true });
          }
          break;
        case 3: // token lesson
          if (t.timer <= 0 && !t.waitTokens) {
            for (let i = 0; i < 5; i++) this.spawner.spawnToken(this.laneIdx, spawnAhead - i * 2.2);
            t.waitTokens = true;
            this._tutPrompt('Grab the golden leaves!', { skip: true });
          }
          if (t.waitTokens && this.spawner.tokens.length === 0) {
            t.step = 4;
            t.timer = 2.2;
            this._tutPrompt("That's everything — blaze on! 🍃", {});
          }
          break;
        case 4:
          if (t.timer <= 0) this.endTutorial();
          break;
      }
    }

    _updateRun(dt) {
      // speed ramp + distance (tutorial holds a gentle fixed pace)
      if (this.tut) this.speed = 8.5;
      else this.speed = Math.min(C.maxSpeed, this.speed + C.accel * dt);
      this.dist += this.speed * dt;

      // lane movement
      const targetX = C.lanes[this.laneIdx];
      this.px = GR.damp(this.px, targetX, C.laneDamp, dt);

      // vertical physics
      if (!this.grounded) {
        this.velY += C.gravity * dt;
        this.py += this.velY * dt;
        if (this.py <= 0) {
          this.py = 0;
          this.velY = 0;
          this.grounded = true;
          this._spawnFx('dust', this.px, 0.05, 0.3, 6, 0.3, 1);
          if (this.jumpBuffer > 0) { this.jumpBuffer = 0; this.jump(); }
          else if (this.slideBuffer > 0) { this.slideBuffer = 0; this.slide(); }
          else this.animator.setState('run');
        }
      }
      this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
      this.slideBuffer = Math.max(0, this.slideBuffer - dt);

      // slide timer
      if (this.slideT > 0) {
        this.slideT -= dt;
        if (this.slideT <= 0 && this.grounded) this.animator.setState('run');
      }

      // running dust
      this.dustClock -= dt;
      if (this.grounded && this.dustClock <= 0) {
        this.dustClock = 0.07;
        this._spawnFx('dust', this.px + GR.rand(-0.15, 0.15), 0.04, 0.35, 1, 0.1, 0.6);
      }

      // power-up timers
      this.magnetT = Math.max(0, this.magnetT - dt);
      this.shieldT = Math.max(0, this.shieldT - dt);
      this.boostT = Math.max(0, this.boostT - dt);
      this.invulnT = Math.max(0, this.invulnT - dt);

      // avatar transform
      this.avatar.group.position.set(this.px, this.py, 0);

      // collision box
      const sliding = this.slideT > 0;
      const pb = {
        x: this.px,
        y0: this.py,
        y1: this.py + (sliding ? C.playerBox.slideH : C.playerBox.standH),
        magnet: this.magnetT > 0,
      };

      const ev = this.spawner.update(dt, this.speed, this.dist, pb);
      const mult = this.boostT > 0 ? 2 : 1;

      if (ev.tokens > 0) {
        this.leaves += ev.tokens;
        this.score += ev.tokens * 15 * mult;
        GR.Audio.sfx('coin');
        this._spawnFx('gold', this.px, this.py + 1.0, 0, 3 * ev.tokens, 0.3, 1.2);
      }
      if (ev.power) {
        GR.Audio.sfx('power');
        if (ev.power === 'magnet') this.magnetT = C.magnetTime;
        else if (ev.power === 'shield') this.shieldT = C.shieldTime;
        else this.boostT = C.boostTime;
        if (this.callbacks.onPower) this.callbacks.onPower(ev.power);
        this._spawnFx('gold', this.px, this.py + 1.2, 0, 6, 0.4, 1.4);
      }
      if (this.tut) {
        // tutorial: hits are forgiven inside the lesson script
        this._updateTutorial(dt, ev);
      } else if (ev.hit && this.invulnT <= 0) {
        if (this.shieldT > 0) {
          this.shieldT = 0;
          this.invulnT = 1.2;
          this.spawner.smash(ev.hit);
          this.shakeT = 0.35;
          GR.Audio.sfx('shield');
          this._spawnFx('gold', this.px, this.py + 1.0, ev.hit.z, 8, 0.5, 1.5);
        } else {
          this._die(ev.hit);
          return;
        }
      }

      // shield / magnet visuals + invulnerability blink
      this.shieldMesh.visible = this.shieldT > 0;
      if (this.shieldMesh.visible) {
        this.shieldMesh.position.set(this.px, this.py + 0.95, 0);
        this.shieldMesh.material.opacity = 0.16 + Math.sin(performance.now() * 0.008) * 0.06;
        if (this.shieldT < 2) this.shieldMesh.visible = Math.floor(performance.now() / 130) % 2 === 0;
      }
      this.magnetRing.visible = this.magnetT > 0;
      if (this.magnetRing.visible) {
        this.magnetRing.position.set(this.px, 0.12, 0);
        this.magnetRing.rotation.z += dt * 4;
        this.magnetRing.material.opacity = this.magnetT < 2 ? 0.3 + Math.sin(performance.now() * 0.02) * 0.3 : 0.7;
      }
      this.avatar.rig.visible = this.invulnT <= 0 || Math.floor(performance.now() / 90) % 2 === 0;

      // score
      this.score += this.speed * dt * 1.15 * mult;
      if (this.callbacks.onScore) {
        this.callbacks.onScore({
          score: Math.floor(this.score),
          leaves: this.leaves,
          mult,
          dist: Math.floor(this.dist),
          speed: this.speed,
          magnetT: this.magnetT / C.magnetTime,
          shieldT: this.shieldT / C.shieldTime,
          boostT: this.boostT / C.boostTime,
        });
      }
    }

    _updateDeath(rdt, dt) {
      this.deathT += rdt;
      // clay tumbles forward; the robot has its own Death animation
      if (this.avatar.kind !== 'robot') {
        const k = Math.min(1, this.deathT / 0.6);
        this.avatar.group.rotation.x = GR.lerp(0, -1.35, GR.smoothstep(k));
        this.avatar.group.position.y = GR.lerp(this.py, 0.25, GR.smoothstep(k));
      }
      this.timeScale = GR.lerp(0.35, 0.08, Math.min(1, this.deathT / 1.2));
      this.shieldMesh.visible = false;
      this.magnetRing.visible = false;
      this.avatar.rig.visible = true;
      if (this.deathT > 1.5 && this.deathT - rdt <= 1.5) {
        const { stats, isNewBest } = GR.Store.addRun(Math.floor(this.score), this.leaves);
        if (isNewBest) GR.Audio.sfx('best');
        if (this.callbacks.onGameOver) {
          this.callbacks.onGameOver({
            score: Math.floor(this.score),
            leaves: this.leaves,
            dist: Math.floor(this.dist),
            best: stats.best,
            isNewBest,
          });
        }
      }
    }

    _updateMenus(dt) {
      this.menuOrbit += dt;
      this.shieldMesh.visible = false;
      this.magnetRing.visible = false;
      this.avatar.rig.visible = true;
      if (this.state === 'custom') {
        this.spinPause = Math.max(0, this.spinPause - dt);
        if (this.spinPause <= 0) this.avatar.group.rotation.y += dt * 0.35;
      }
    }

    /* ---------------------------------------------------- camera */
    _updateCamera(rdt) {
      const cam = this.camera;
      let tPos, tLook, tFov = 62;

      if (this.state === 'running' || this.state === 'paused') {
        const speedFrac = (this.speed - C.baseSpeed) / (C.maxSpeed - C.baseSpeed);
        tPos = new THREE.Vector3(this.px * 0.5, 3.3 + this.py * 0.35, 5.6);
        tLook = new THREE.Vector3(this.px * 0.75, 1.25 + this.py * 0.4, -7);
        tFov = 62 + speedFrac * 10;
      } else if (this.state === 'dead') {
        tPos = new THREE.Vector3(this.px * 0.3 + 1.6, 4.4, 7.4);
        tLook = new THREE.Vector3(this.px, 0.8, 0);
        tFov = 58;
      } else if (this.state === 'custom') {
        tPos = new THREE.Vector3(0, 1.25, -3.1);
        tLook = new THREE.Vector3(this.customLookX, 0.98, 0);
        tFov = 46;
      } else {
        // menu: gentle orbit around the character (framed right of the panel)
        const a = Math.sin(this.menuOrbit * 0.18) * 0.45 - 0.35;
        tPos = new THREE.Vector3(Math.sin(a) * 4.2, 1.7 + Math.sin(this.menuOrbit * 0.4) * 0.12, -Math.cos(a) * 4.2);
        tLook = new THREE.Vector3(1.15, 1.0, -0.6);
        tFov = 50;
      }

      const lag = this.state === 'running' ? 9 : 3.2;
      this.camPos.x = GR.damp(this.camPos.x, tPos.x, lag, rdt);
      this.camPos.y = GR.damp(this.camPos.y, tPos.y, lag, rdt);
      this.camPos.z = GR.damp(this.camPos.z, tPos.z, lag, rdt);
      this.camLook.x = GR.damp(this.camLook.x, tLook.x, lag, rdt);
      this.camLook.y = GR.damp(this.camLook.y, tLook.y, lag, rdt);
      this.camLook.z = GR.damp(this.camLook.z, tLook.z, lag, rdt);
      this.fov = GR.damp(this.fov, tFov, 4, rdt);

      cam.position.copy(this.camPos);
      if (this.shakeT > 0) {
        this.shakeT = Math.max(0, this.shakeT - rdt);
        const s = this.shakeT * 0.35;
        cam.position.x += GR.rand(-s, s);
        cam.position.y += GR.rand(-s, s);
      }
      cam.lookAt(this.camLook);
      if (Math.abs(cam.fov - this.fov) > 0.05) {
        cam.fov = this.fov;
        cam.updateProjectionMatrix();
      }
    }

    /* ---------------------------------------------------- misc */
    _applyPixelRatio() {
      const cap = this.settings.quality === 'high' ? 2 : 1.35;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    }

    setQuality(q) {
      this.settings.quality = q;
      this.world.setQuality(q);
      this._applyPixelRatio();
      this.resize(window.innerWidth, window.innerHeight);
    }

    resize(w, h) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  };
})();
