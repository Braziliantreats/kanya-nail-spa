/* Green Rush — DOM UI: splash, menu, customizer, HUD, pause, game over */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});

  const TABS = () => {
    const C = GR.CATALOG;
    return [
      { id: 'body', label: 'Body', sections: [
        { type: 'swatch', label: 'Skin Tone', key: 'skin', values: C.skins },
        { type: 'chips', label: 'Build', key: 'build', values: C.builds },
        { type: 'chips', label: 'Height', key: 'height', values: C.heights },
      ]},
      { id: 'hair', label: 'Hair', sections: [
        { type: 'chips', label: 'Style', key: 'hairStyle', values: C.hairStyles },
        { type: 'swatch', label: 'Color', key: 'hairColor', values: C.hairColors },
      ]},
      { id: 'face', label: 'Face', sections: [
        { type: 'chips', label: 'Eyes', key: 'eyeStyle', values: C.eyeStyles },
        { type: 'swatch', label: 'Eye Color', key: 'eyeColor', values: C.eyeColors },
        { type: 'chips', label: 'Brows', key: 'brow', values: C.brows },
        { type: 'chips', label: 'Mouth', key: 'mouth', values: C.mouthStyles },
        { type: 'chips', label: 'Facial Hair', key: 'facialHair', values: C.facialHair },
        { type: 'toggles', items: [{ key: 'freckles', label: 'Freckles' }, { key: 'blush', label: 'Blush' }] },
      ]},
      { id: 'top', label: 'Top', sections: [
        { type: 'chips', label: 'Style', key: 'top', values: C.tops },
        { type: 'swatch', label: 'Color', key: 'topColor', values: C.topColors },
        { type: 'chips', label: 'Pattern', key: 'pattern', values: C.patterns },
      ]},
      { id: 'bottom', label: 'Bottom', sections: [
        { type: 'chips', label: 'Style', key: 'bottom', values: C.bottoms },
        { type: 'swatch', label: 'Color', key: 'bottomColor', values: C.bottomColors },
      ]},
      { id: 'kicks', label: 'Kicks', sections: [
        { type: 'swatch', label: 'Sneaker Color', key: 'shoeColor', values: C.shoeColors },
      ]},
      { id: 'extras', label: 'Extras', sections: [
        { type: 'chips', label: 'Hat', key: 'hat', values: C.hats },
        { type: 'swatch', label: 'Hat Color', key: 'hatColor', values: C.hatColors },
        { type: 'chips', label: 'Glasses', key: 'glassesStyle', values: C.glasses },
        { type: 'chips', label: 'Accessory', key: 'extra', values: C.extras },
      ]},
    ];
  };

  GR.UI = class {
    constructor(game, settings) {
      this.game = game;
      this.settings = settings;
      this.cfg = GR.Store.loadAvatar();
      this.$ = (id) => document.getElementById(id);
      this._hud = { score: -1, leaves: -1, mult: -1 };

      this._drawLogos();
      this._wireSplash();
      this._wireMenu();
      this._wireHud();
      this._wirePause();
      this._wireOver();
      this._buildCustomizer();
      this._wireCallbacks();
      this._refreshStats();
      this.show('splash');
    }

    /* ---------------------------------------------------- helpers */
    show(name) {
      document.querySelectorAll('.screen').forEach((el) => el.classList.remove('visible'));
      if (name) {
        const el = this.$(`screen-${name}`);
        if (el) el.classList.add('visible');
      }
      this.$('hud').classList.toggle('visible', name === 'hud');
      document.body.dataset.screen = name || 'none';
    }

    _leafCanvas(size, color) {
      const { canvas, ctx } = GR.makeCanvas(size, size);
      GR.drawLeaf(ctx, size / 2, size * 0.6, size * 0.33, color, 0);
      return canvas;
    }

    _drawLogos() {
      for (const el of document.querySelectorAll('.leaf-logo')) {
        const size = parseInt(el.dataset.size || '84', 10);
        const c = this._leafCanvas(size * 2, el.dataset.color || '#46d97a');
        c.style.width = size + 'px';
        c.style.height = size + 'px';
        el.appendChild(c);
      }
    }

    /* ---------------------------------------------------- splash */
    _wireSplash() {
      this.$('btn-enter').addEventListener('click', () => {
        GR.Audio.init();
        GR.Audio.resume();
        GR.Audio.setMusic(this.settings.music);
        GR.Audio.setSfx(this.settings.sfx);
        GR.Audio.sfx('click');
        this.show('menu');
      });
    }

    /* ---------------------------------------------------- menu */
    _wireMenu() {
      this.$('btn-run').addEventListener('click', () => {
        GR.Audio.sfx('click');
        this.game.startRun();
        this.show('hud');
        this._runHint();
      });
      // keep the customizer camera framing in sync with the CSS breakpoint,
      // live across rotations/resizes
      const mq = window.matchMedia('(max-width: 760px)');
      const applyLook = () => { this.game.customLookX = mq.matches ? 0 : -0.75; };
      applyLook();
      if (mq.addEventListener) mq.addEventListener('change', applyLook);
      this.$('btn-custom').addEventListener('click', () => {
        GR.Audio.sfx('click');
        applyLook();
        this.game.enterCustomize();
        this.show('custom');
      });
      this._buildToggles(this.$('menu-toggles'));
    }

    _buildToggles(root) {
      root.innerHTML = '';
      const mk = (label, get, set) => {
        const b = document.createElement('button');
        b.className = 'toggle';
        const paint = () => {
          b.classList.toggle('on', get());
          b.innerHTML = `<span class="dot"></span>${label}`;
        };
        b.addEventListener('click', () => {
          set(!get());
          GR.Store.saveSettings(this.settings);
          GR.Audio.sfx('click');
          this._syncToggles();
        });
        paint();
        b.dataset.paint = '1';
        b._paint = paint;
        root.appendChild(b);
      };
      mk('Music', () => this.settings.music, (v) => { this.settings.music = v; GR.Audio.setMusic(v); });
      mk('Sound FX', () => this.settings.sfx, (v) => { this.settings.sfx = v; GR.Audio.setSfx(v); });
      mk('High Quality', () => this.settings.quality === 'high', (v) => {
        this.settings.quality = v ? 'high' : 'low';
        this.game.setQuality(this.settings.quality);
      });
    }

    _syncToggles() {
      document.querySelectorAll('.toggle').forEach((b) => b._paint && b._paint());
    }

    _refreshStats() {
      const s = GR.Store.getStats();
      this.$('menu-best').textContent = s.best.toLocaleString();
      this.$('menu-leaves').textContent = s.leaves.toLocaleString();
    }

    /* ---------------------------------------------------- HUD */
    _wireHud() {
      this.$('btn-pause').addEventListener('click', () => this.game.pause());
      const icon = this._leafCanvas(44, '#ffd54a');
      icon.classList.add('hud-leaf-icon');
      this.$('hud-leaf-slot').appendChild(icon);
    }

    _runHint() {
      const el = this.$('run-hint');
      const touch = 'ontouchstart' in window;
      el.textContent = touch
        ? 'Swipe ◀ ▶ to steer · swipe ▲ to jump · ▼ to slide'
        : '◀ ▶ steer · ▲ / SPACE jump · ▼ slide · P pause';
      el.classList.add('show');
      clearTimeout(this._hintTimer);
      this._hintTimer = setTimeout(() => el.classList.remove('show'), 4200);
    }

    _updateHud(d) {
      if (d.score !== this._hud.score) {
        this._hud.score = d.score;
        this.$('hud-score').textContent = d.score.toLocaleString();
      }
      if (d.leaves !== this._hud.leaves) {
        this._hud.leaves = d.leaves;
        this.$('hud-leaves').textContent = d.leaves;
      }
      if (d.mult !== this._hud.mult) {
        this._hud.mult = d.mult;
        this.$('hud-mult').classList.toggle('show', d.mult > 1);
      }
      const bars = [['bar-magnet', d.magnetT], ['bar-shield', d.shieldT], ['bar-boost', d.boostT]];
      for (const [id, v] of bars) {
        const el = this.$(id);
        el.closest('.powerbar').classList.toggle('active', v > 0);
        el.style.transform = `scaleX(${v})`;
      }
    }

    /* ---------------------------------------------------- pause / over */
    _wirePause() {
      this.$('btn-resume').addEventListener('click', () => { GR.Audio.sfx('click'); this.game.resume(); });
      this.$('btn-pause-menu').addEventListener('click', () => {
        GR.Audio.sfx('click');
        this.game.backToMenu();
        this._refreshStats();
        this.show('menu');
      });
      this._buildToggles(this.$('pause-toggles'));
    }

    _wireOver() {
      this.$('btn-retry').addEventListener('click', () => {
        GR.Audio.sfx('click');
        this.game.startRun();
        this.show('hud');
      });
      this.$('btn-over-menu').addEventListener('click', () => {
        GR.Audio.sfx('click');
        this.game.backToMenu();
        this._refreshStats();
        this.show('menu');
      });
    }

    /* ---------------------------------------------------- customizer */
    _buildCustomizer() {
      const tabsEl = this.$('custom-tabs');
      const bodyEl = this.$('custom-body');
      const tabs = TABS();
      this._customTabs = tabs;

      tabs.forEach((tab, i) => {
        const b = document.createElement('button');
        b.className = 'tab' + (i === 0 ? ' active' : '');
        b.textContent = tab.label;
        b.addEventListener('click', () => {
          GR.Audio.sfx('click');
          tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
          b.classList.add('active');
          this._renderTab(tab);
        });
        tabsEl.appendChild(b);
      });
      this._renderTab(tabs[0]);

      this.$('btn-custom-back').addEventListener('click', () => {
        GR.Audio.sfx('click');
        GR.Store.saveAvatar(this.cfg);
        this.game.backToMenu();
        this._refreshStats();
        this.show('menu');
      });
      this.$('btn-random').addEventListener('click', () => {
        GR.Audio.sfx('power');
        this.cfg = GR.randomAvatar();
        this._applyCfg();
      });
      this.$('btn-reset').addEventListener('click', () => {
        GR.Audio.sfx('click');
        this.cfg = Object.assign({}, GR.DEFAULT_AVATAR);
        this._applyCfg();
      });
    }

    _applyCfg() {
      GR.Store.saveAvatar(this.cfg);
      this.game.setAvatar(this.cfg);
      // re-render active tab so selections highlight correctly
      const active = document.querySelector('#custom-tabs .tab.active');
      const idx = Array.from(active.parentElement.children).indexOf(active);
      this._renderTab(this._customTabs[idx]);
    }

    _renderTab(tab) {
      const bodyEl = this.$('custom-body');
      bodyEl.innerHTML = '';
      for (const sec of tab.sections) {
        const wrap = document.createElement('div');
        wrap.className = 'section';
        if (sec.label) {
          const h = document.createElement('div');
          h.className = 'section-label';
          h.textContent = sec.label;
          wrap.appendChild(h);
        }
        if (sec.type === 'swatch') {
          const grid = document.createElement('div');
          grid.className = 'swatches';
          for (const color of sec.values) {
            const s = document.createElement('button');
            s.className = 'swatch' + (this.cfg[sec.key] === color ? ' sel' : '');
            s.style.background = color;
            s.title = color;
            s.addEventListener('click', () => {
              this.cfg[sec.key] = color;
              GR.Audio.sfx('click');
              grid.querySelectorAll('.swatch').forEach((x) => x.classList.remove('sel'));
              s.classList.add('sel');
              GR.Store.saveAvatar(this.cfg);
              this.game.setAvatar(this.cfg);
            });
            grid.appendChild(s);
          }
          wrap.appendChild(grid);
        } else if (sec.type === 'chips') {
          const grid = document.createElement('div');
          grid.className = 'chips';
          for (const opt of sec.values) {
            const c = document.createElement('button');
            c.className = 'chip' + (this.cfg[sec.key] === opt.id ? ' sel' : '');
            c.textContent = opt.label;
            c.addEventListener('click', () => {
              this.cfg[sec.key] = opt.id;
              GR.Audio.sfx('click');
              grid.querySelectorAll('.chip').forEach((x) => x.classList.remove('sel'));
              c.classList.add('sel');
              GR.Store.saveAvatar(this.cfg);
              this.game.setAvatar(this.cfg);
            });
            grid.appendChild(c);
          }
          wrap.appendChild(grid);
        } else if (sec.type === 'toggles') {
          const grid = document.createElement('div');
          grid.className = 'chips';
          for (const item of sec.items) {
            const c = document.createElement('button');
            const paint = () => {
              c.className = 'chip' + (this.cfg[item.key] ? ' sel' : '');
              c.textContent = item.label;
            };
            paint();
            c.addEventListener('click', () => {
              this.cfg[item.key] = !this.cfg[item.key];
              GR.Audio.sfx('click');
              paint();
              GR.Store.saveAvatar(this.cfg);
              this.game.setAvatar(this.cfg);
            });
            grid.appendChild(c);
          }
          wrap.appendChild(grid);
        }
        bodyEl.appendChild(wrap);
      }
    }

    /* ---------------------------------------------------- game hooks */
    _wireCallbacks() {
      this.game.callbacks.onScore = (d) => this._updateHud(d);
      this.game.callbacks.onPower = (type) => {
        const names = { magnet: '🧲 LEAF MAGNET!', shield: '🛡 ZEN SHIELD!', boost: '✨ DOUBLE SCORE!' };
        const toast = this.$('toast');
        toast.textContent = names[type];
        toast.classList.remove('show');
        void toast.offsetWidth; // restart animation
        toast.classList.add('show');
      };
      this.game.callbacks.onGameOver = (r) => {
        this.$('over-score').textContent = r.score.toLocaleString();
        this.$('over-best').textContent = r.best.toLocaleString();
        this.$('over-leaves').textContent = r.leaves;
        this.$('over-dist').textContent = r.dist + 'm';
        this.$('over-newbest').classList.toggle('show', r.isNewBest);
        this.show('over');
      };
      this.game.callbacks.onState = (name) => {
        if (name === 'paused') this.show('pause');
        else if (name === 'running' && document.body.dataset.screen === 'pause') this.show('hud');
      };
    }
  };
})();
