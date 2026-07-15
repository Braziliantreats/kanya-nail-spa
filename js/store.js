/* Green Rush — persistence (avatar, settings, stats) with safe localStorage */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});
  const KEY = 'greenrush.v1';

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      // tolerate corrupted saves: primitives/arrays would break every write path
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch (e) {
      return {};
    }
  }
  function write(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (e) {
      /* private mode / quota — play on without saving */
    }
  }

  GR.Store = {
    loadAvatar() {
      const saved = read().avatar;
      // merge over defaults so new fields added later still get values
      return Object.assign({}, GR.DEFAULT_AVATAR, saved || {});
    },
    saveAvatar(cfg) {
      const data = read();
      data.avatar = cfg;
      write(data);
    },
    loadSettings() {
      return Object.assign({ music: true, sfx: true, quality: 'high' }, read().settings || {});
    },
    saveSettings(s) {
      const data = read();
      data.settings = s;
      write(data);
    },
    getStats() {
      return Object.assign({ best: 0, leaves: 0, runs: 0 }, read().stats || {});
    },
    isTutorialDone() {
      return !!read().tutorialDone;
    },
    setTutorialDone() {
      const data = read();
      data.tutorialDone = true;
      write(data);
    },
    /* record a finished run; returns updated stats + whether it's a new best */
    addRun(score, leaves) {
      const data = read();
      const stats = Object.assign({ best: 0, leaves: 0, runs: 0 }, data.stats || {});
      const isNewBest = score > stats.best;
      stats.best = Math.max(stats.best, score);
      stats.leaves += leaves;
      stats.runs += 1;
      data.stats = stats;
      write(data);
      return { stats, isNewBest };
    },
  };
})();
