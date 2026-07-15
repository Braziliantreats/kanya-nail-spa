/* Green Rush — R0-BUD: the CC0 "Robot Expressive" model (Tomás Laulhé, via
   three.js examples) as a second playable runner. One shared instance —
   loaded once, re-tinted per config. Implements the same avatar/animator
   interface as the clay characters. */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});

  GR.ROBOT_URL = window.GR_ROBOT_URL || 'vendor/models/robot.glb';

  /* ------------------------------------------------ loader / library */
  GR.RobotLib = {
    gltf: null,
    loading: false,
    failed: false,
    _onReady: [],

    ready() {
      return !!this.gltf;
    },

    load(cb) {
      if (this.gltf) { if (cb) cb(); return; }
      if (cb) this._onReady.push(cb);
      if (this.loading || this.failed) return;
      this.loading = true;
      new THREE.GLTFLoader().load(
        GR.ROBOT_URL,
        (gltf) => {
          this.loading = false;
          this._prepare(gltf);
          this.gltf = gltf;
          for (const fn of this._onReady) fn();
          this._onReady.length = 0;
        },
        undefined,
        (err) => {
          console.warn('R0-BUD failed to load:', err);
          this.loading = false;
          this.failed = true;
        }
      );
    },

    _prepare(gltf) {
      const scene = gltf.scene;
      // the raw rest pose sprawls — apply one frame of Idle before measuring
      const idle = gltf.animations.find((c) => /idle/i.test(c.name)) || gltf.animations[0];
      const mixer = new THREE.AnimationMixer(scene);
      if (idle) {
        mixer.clipAction(idle).play();
        mixer.update(0.03);
        scene.updateMatrixWorld(true);
      }
      // normalize: feet on y=0, ~1.72 units tall, facing -Z
      const box = new THREE.Box3().setFromObject(scene);
      const h = box.max.y - box.min.y;
      const s = 1.72 / h;
      scene.scale.setScalar(s);
      scene.position.y = -box.min.y * s;
      scene.rotation.y = Math.PI;
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);

      this.mats = { primary: [], accent: [], rest: [] };
      scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m || m.userData.grSeen) continue;
          m.userData.grSeen = true;
          const name = (m.name || '').toLowerCase();
          if (/main/.test(name)) this.mats.primary.push(m);
          else if (/grey|gray/.test(name)) this.mats.accent.push(m);
          else this.mats.rest.push(m);
        }
      });

      this.clips = {};
      for (const clip of gltf.animations) this.clips[clip.name] = clip;
    },

    findClip(patterns) {
      for (const p of patterns) {
        for (const name in this.clips) {
          if (p.test(name)) return this.clips[name];
        }
      }
      return null;
    },

    tint(primary, accent) {
      if (!this.gltf) return;
      for (const m of this.mats.primary) m.color.set(primary);
      for (const m of this.mats.accent) m.color.set(accent);
    },
  };

  /* ------------------------------------------------ avatar interface */
  GR.buildRobotAvatar = function (cfg) {
    const lib = GR.RobotLib;
    const group = new THREE.Group();
    const rig = new THREE.Group();
    group.add(rig);
    rig.add(lib.gltf.scene);
    lib.tint(cfg.robotPrimary, cfg.robotAccent);

    return {
      kind: 'robot',
      group,
      rig,
      cfg,
      hipsBaseY: 0.84,
      sway: [],
      setFace() { /* R0-BUD emotes through animation clips instead */ },
      dispose() {
        // shared model — detach, never destroy
        rig.remove(lib.gltf.scene);
      },
    };
  };

  /* ------------------------------------------------ animator */
  GR.RobotAnimator = class {
    constructor(avatar) {
      this.state = 'idle';
      this.t = 0;
      this.emoteT = GR.rand(5, 9);
      this.setAvatar(avatar);
    }

    setAvatar(avatar) {
      this.av = avatar;
      const lib = GR.RobotLib;
      this.mixer = new THREE.AnimationMixer(lib.gltf.scene);
      const mk = (clip, once) => {
        if (!clip) return null;
        const a = this.mixer.clipAction(clip);
        if (once) {
          a.setLoop(THREE.LoopOnce, 1);
          a.clampWhenFinished = true;
        }
        return a;
      };
      this.actions = {
        idle: mk(lib.findClip([/^idle$/i, /idle/i])),
        run: mk(lib.findClip([/^run/i, /walk/i])),
        jump: mk(lib.findClip([/^jump/i]), true),
        dead: mk(lib.findClip([/death|die/i]), true),
        wave: mk(lib.findClip([/wave/i]), true),
        dance: mk(lib.findClip([/dance/i])),
      };
      this.current = null;
      this._play('idle');
    }

    _play(name, fade) {
      const next = this.actions[name] || this.actions.idle;
      if (!next || next === this.current) return;
      if (this.current) this.current.fadeOut(fade || 0.18);
      next.reset().fadeIn(fade || 0.18).play();
      this.current = next;
    }

    setState(name) {
      if (this.state === name) return;
      this.state = name;
      if (name === 'run') this._play('run');
      else if (name === 'jump') this._play('jump', 0.1);
      else if (name === 'dead') this._play('dead', 0.12);
      else if (name === 'slide') this._play('run', 0.1); // squash handled in update
      else this._play('idle', 0.25);
    }

    update(dt, opts) {
      opts = opts || {};
      this.t += dt;
      const speed = opts.speed || 0;

      if (this.state === 'run' && this.actions.run) {
        this.actions.run.timeScale = GR.clamp(0.6 + speed * 0.055, 0.8, 2.1);
      }
      // one-shot jump finished mid-air → glide back into run cycle
      if (this.state === 'jump' && this.actions.jump && !this.actions.jump.isRunning()) {
        this._play('run', 0.2);
      }
      // idle emotes: an occasional friendly wave
      if (this.state === 'idle') {
        this.emoteT -= dt;
        if (this.emoteT <= 0 && this.actions.wave) {
          this.emoteT = GR.rand(7, 12);
          const wave = this.actions.wave;
          const idle = this.actions.idle;
          wave.reset().fadeIn(0.2).play();
          setTimeout(() => { if (this.state === 'idle') { wave.fadeOut(0.3); if (idle) idle.reset().fadeIn(0.3).play(); } }, (wave.getClip().duration - 0.3) * 1000);
        }
      }

      this.mixer.update(dt);

      // slide: cartoon squash (no clip for it)
      const rig = this.av.rig;
      const squash = this.state === 'slide';
      rig.scale.y = GR.damp(rig.scale.y, squash ? 0.52 : 1, 14, dt);
      rig.rotation.x = GR.damp(rig.rotation.x, squash ? 0.25 : 0, 12, dt);
      // lane lean
      const lean = opts.lean || 0;
      rig.rotation.z = GR.damp(rig.rotation.z, -lean * 0.25, 10, dt);
    }
  };
})();
