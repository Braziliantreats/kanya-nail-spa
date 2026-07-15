/* Green Rush — bootstrap */
(function () {
  'use strict';
  const GR = window.GR;

  function fatal(msg) {
    const el = document.getElementById('fatal');
    el.textContent = msg;
    el.style.display = 'flex';
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (!window.THREE) {
      fatal('three.js failed to load — please check vendor/three.global.min.js exists.');
      return;
    }
    const canvas = document.getElementById('game-canvas');
    let game;
    const settings = GR.Store.loadSettings();
    try {
      game = new GR.Game(canvas, settings);
    } catch (e) {
      console.error(e);
      fatal('Could not start WebGL. Try a modern browser with hardware acceleration enabled.');
      return;
    }
    const ui = new GR.UI(game, settings);
    GR.game = game; // handy for debugging/testing from the console

    const onResize = () => game.resize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', onResize);
    onResize();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.state === 'running') game.pause();
      if (!document.hidden) GR.Audio.resume();
    });

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      fatal('Graphics context was lost — please reload the page.');
    });
  });
})();
