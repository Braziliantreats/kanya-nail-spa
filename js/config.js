/* Green Rush — config, shared helpers, art helpers, customization catalog */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});

  /* ------------------------------------------------ gameplay constants */
  GR.CFG = {
    lanes: [-2.3, 0, 2.3],
    baseSpeed: 10.5,
    maxSpeed: 27,
    accel: 0.22,            // speed gained per second
    gravity: -26,
    jumpVel: 9.2,
    slideTime: 0.85,
    laneDamp: 11,           // lane-change lerp rate
    spawnZ: -180,           // where new obstacles appear
    killZ: 14,              // recycle point behind camera
    segLen: 30,             // world segment length
    segCount: 14,           // world segments in the pool
    dayLength: 210,         // seconds for a full day/night cycle
    playerBox: { hw: 0.36, standH: 1.62, slideH: 0.72, hd: 0.34 },
    magnetTime: 8,
    shieldTime: 15,
    boostTime: 10,
  };

  /* ------------------------------------------------ small math helpers */
  GR.TAU = Math.PI * 2;
  GR.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  GR.lerp = (a, b, t) => a + (b - a) * t;
  GR.damp = (a, b, lambda, dt) => GR.lerp(a, b, 1 - Math.exp(-lambda * dt));
  GR.smoothstep = (t) => t * t * (3 - 2 * t);
  GR.rand = (a, b) => a + Math.random() * (b - a);
  GR.randi = (a, b) => Math.floor(GR.rand(a, b + 1));
  GR.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  GR.lerpColor = (out, a, b, t) => out.copy(a).lerp(b, t);

  GR.makeCanvas = function (w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    return { canvas, ctx: canvas.getContext('2d') };
  };

  /* nudge a hex toward warm off-white — desaturates + lifts to a pastel */
  GR.soften = function (hex, t) {
    const c = parseInt(hex.slice(1), 16);
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    r = Math.round(GR.lerp(r, 236, t));
    g = Math.round(GR.lerp(g, 231, t));
    b = Math.round(GR.lerp(b, 223, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  /* shared stepped-lighting ramp for the cel/toon look */
  let _toonRamp = null;
  GR.toonRamp = function () {
    if (_toonRamp) return _toonRamp;
    // wide flat bands with narrow linear transitions: crisp cel steps without
    // the sampling noise a tiny NearestFilter ramp produces
    const colors = new Uint8Array([
      112, 112, 112, 112,
      165, 165, 165, 165,
      218, 218, 218, 218,
      255, 255, 255, 255,
    ]);
    _toonRamp = new THREE.DataTexture(colors, colors.length, 1, THREE.RedFormat);
    _toonRamp.minFilter = THREE.LinearFilter;
    _toonRamp.magFilter = THREE.LinearFilter;
    _toonRamp.needsUpdate = true;
    return _toonRamp;
  };

  GR.toonMat = function (opts) {
    return new THREE.MeshToonMaterial(Object.assign({ gradientMap: GR.toonRamp() }, opts));
  };

  /* ------------------------------------------------ cannabis leaf art
     Draws a stylized 7-fingered leaf centered at (x, y).
     size = length of the biggest (center) finger. */
  GR.drawLeaf = function (ctx, x, y, size, color, rotation) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation || 0);
    ctx.fillStyle = color;
    // finger angle (deg from straight up) and relative length
    const fingers = [
      { a: 0, l: 1.0, w: 0.21 },
      { a: 32, l: 0.88, w: 0.19 },
      { a: -32, l: 0.88, w: 0.19 },
      { a: 63, l: 0.66, w: 0.16 },
      { a: -63, l: 0.66, w: 0.16 },
      { a: 92, l: 0.40, w: 0.13 },
      { a: -92, l: 0.40, w: 0.13 },
    ];
    for (const f of fingers) {
      const ang = (f.a * Math.PI) / 180;
      const len = size * f.l;
      const wid = size * f.w;
      ctx.save();
      ctx.rotate(ang);
      // serrated blade: lens shape with jagged edges
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const teeth = 5;
      for (let i = 1; i <= teeth; i++) {
        const t = i / teeth;
        const bulge = Math.sin(t * Math.PI) * wid;
        ctx.lineTo(-bulge * (1 - 0.12 * (i % 2)), -len * t + (i % 2 ? len * 0.03 : 0));
      }
      for (let i = teeth - 1; i >= 0; i--) {
        const t = i / teeth;
        const bulge = Math.sin(t * Math.PI) * wid;
        ctx.lineTo(bulge * (1 - 0.12 * (i % 2)), -len * t + (i % 2 ? len * 0.03 : 0));
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // stem
    ctx.fillRect(-size * 0.025, 0, size * 0.05, size * 0.28);
    ctx.restore();
  };

  /* Leaf sprite texture (transparent bg). Used for tokens and particles. */
  GR.leafTexture = function (px, color, glowColor) {
    const { canvas, ctx } = GR.makeCanvas(px, px);
    if (glowColor) {
      const g = ctx.createRadialGradient(px / 2, px / 2, px * 0.1, px / 2, px / 2, px * 0.5);
      g.addColorStop(0, glowColor);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, px, px);
    }
    GR.drawLeaf(ctx, px / 2, px * 0.62, px * 0.34, color, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  /* Bushy plant texture: several overlapping leaves on transparent bg.
     Painted onto crossed planes to make a field plant. */
  GR.plantTexture = function (px) {
    const { canvas, ctx } = GR.makeCanvas(px, px);
    const greens = ['#2f9e44', '#3aa84f', '#2e7d32', '#43a047', '#37a34a'];
    // stem
    ctx.strokeStyle = '#4e6b2a';
    ctx.lineWidth = px * 0.035;
    ctx.beginPath();
    ctx.moveTo(px * 0.5, px);
    ctx.lineTo(px * 0.5, px * 0.3);
    ctx.stroke();
    const spots = [
      [0.5, 0.16, 0.34, 0], [0.28, 0.42, 0.3, -0.75], [0.72, 0.42, 0.3, 0.75],
      [0.2, 0.68, 0.24, -1.2], [0.8, 0.68, 0.24, 1.2],
      [0.5, 0.46, 0.3, 0.03], [0.38, 0.8, 0.2, -0.5], [0.62, 0.8, 0.2, 0.5],
    ];
    for (const [sx, sy, ss, rot] of spots) {
      GR.drawLeaf(ctx, px * sx, px * sy, px * ss, GR.pick(greens), rot);
    }
    // flowering cola up top + amber pistils, so the plant is unmistakable
    const budCols = ['#5f7d33', '#6f8f3a', '#557029', '#7a9a40'];
    for (let i = 0; i < 14; i++) {
      const by = px * (0.34 - i * 0.017);
      ctx.fillStyle = GR.pick(budCols);
      ctx.beginPath();
      ctx.ellipse(px * 0.5 + GR.rand(-px * 0.05, px * 0.05), by, px * GR.rand(0.035, 0.055), px * GR.rand(0.025, 0.04), GR.rand(-0.6, 0.6), 0, GR.TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#e8963f';
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.arc(px * 0.5 + GR.rand(-px * 0.06, px * 0.06), px * GR.rand(0.1, 0.34), px * 0.008, 0, GR.TAU);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  };

  /* ------------------------------------------------ customization catalog
     Everything the avatar editor offers. Ids are stable — saved configs
     reference them. */
  GR.CATALOG = {
    skins: [
      '#f6d7bd', '#f2c49b', '#eab68a', '#dfa072', '#cd8b5f', '#b97a52',
      '#a4653f', '#8d5532', '#774526', '#5f371f', '#4a2a18', '#f8dfd0',
    ].map(function (h) { return GR.soften(h, 0.1); }),
    hairStyles: [
      { id: 'bald', label: 'Fresh Fade' },
      { id: 'buzz', label: 'Buzz Cut' },
      { id: 'short', label: 'Short Crop' },
      { id: 'swoop', label: 'Side Swoop' },
      { id: 'afro', label: 'Afro' },
      { id: 'puffs', label: 'Twin Puffs' },
      { id: 'bun', label: 'Top Bun' },
      { id: 'pony', label: 'Ponytail' },
      { id: 'long', label: 'Long Flow' },
      { id: 'locs', label: 'Locs' },
      { id: 'mohawk', label: 'Mohawk' },
      { id: 'braids', label: 'Braids' },
    ],
    hairColors: [
      '#141210', '#2e2118', '#4b3220', '#6b4a2c', '#8a613a', '#b58143',
      '#d9a45f', '#e8d3a5', '#b03a2e', '#7b3fbf', '#2e86c1', '#27ae60',
      '#e75480', '#bfc4c9',
    ],
    eyeStyles: [
      { id: 'chill', label: 'Chill' },
      { id: 'round', label: 'Wide Awake' },
      { id: 'happy', label: 'Happy' },
      { id: 'sleepy', label: 'Half Baked' },
      { id: 'wink', label: 'Wink' },
    ],
    eyeColors: ['#3a2a1c', '#1c1c1c', '#365f8c', '#3f7d4e', '#6d4c8f', '#8c6239'],
    brows: [
      { id: 'soft', label: 'Soft' },
      { id: 'flat', label: 'Flat' },
      { id: 'arch', label: 'Arched' },
      { id: 'thick', label: 'Bold' },
    ],
    mouthStyles: [
      { id: 'smile', label: 'Smile' },
      { id: 'grin', label: 'Big Grin' },
      { id: 'smirk', label: 'Smirk' },
      { id: 'open', label: 'Woo!' },
      { id: 'tongue', label: 'Cheeky' },
    ],
    facialHair: [
      { id: 'none', label: 'Clean' },
      { id: 'mustache', label: 'Mustache' },
      { id: 'goatee', label: 'Goatee' },
      { id: 'beard', label: 'Full Beard' },
    ],
    tops: [
      { id: 'tee', label: 'T-Shirt' },
      { id: 'hoodie', label: 'Hoodie' },
      { id: 'tank', label: 'Tank Top' },
      { id: 'jacket', label: 'Track Jacket' },
    ],
    patterns: [
      { id: 'solid', label: 'Solid' },
      { id: 'tiedye', label: 'Tie-Dye' },
      { id: 'stripes', label: 'Stripes' },
      { id: 'leaf', label: 'Leaf Print' },
      { id: 'checker', label: 'Checker' },
    ],
    topColors: [
      '#f4f1ea', '#1f1f23', '#e63946', '#f4a261', '#e9c46a', '#2a9d8f',
      '#1b7a3d', '#457b9d', '#5e548e', '#e75480', '#7f5539', '#94d2bd',
    ].map(function (h) { return GR.soften(h, 0.16); }),
    bottoms: [
      { id: 'jeans', label: 'Jeans' },
      { id: 'joggers', label: 'Joggers' },
      { id: 'shorts', label: 'Shorts' },
      { id: 'cargo', label: 'Cargos' },
    ],
    bottomColors: [
      '#31435e', '#1f1f23', '#5b5f66', '#7f5539', '#3d5a3d', '#8d6b94',
      '#b8b2a7', '#803a3a', '#2a6f77', '#d9c58b',
    ].map(function (h) { return GR.soften(h, 0.16); }),
    shoeColors: [
      '#ffffff', '#1f1f23', '#e63946', '#f7b32b', '#2a9d8f', '#1b7a3d',
      '#5e60ce', '#ff7aa2', '#ff6b35', '#8d99ae',
    ],
    hats: [
      { id: 'none', label: 'None' },
      { id: 'beanie', label: 'Beanie' },
      { id: 'cap', label: 'Dad Cap' },
      { id: 'backcap', label: 'Backwards Cap' },
      { id: 'bucket', label: 'Bucket Hat' },
      { id: 'headband', label: 'Headband' },
    ],
    hatColors: [
      '#c62828', '#1f1f23', '#f4f1ea', '#1b7a3d', '#e9c46a', '#457b9d',
      '#5e548e', '#ff7aa2', '#ed6c02', '#00897b',
    ],
    glasses: [
      { id: 'none', label: 'None' },
      { id: 'sun', label: 'Shades' },
      { id: 'round', label: 'Rounds' },
      { id: 'heart', label: 'Hearts' },
    ],
    extras: [
      { id: 'none', label: 'None' },
      { id: 'headphones', label: 'Headphones' },
      { id: 'chain', label: 'Gold Chain' },
    ],
    runners: [
      { id: 'clay', label: 'Custom Character' },
      { id: 'robot', label: 'R0-BUD the Farm-Bot' },
    ],
    styles: [
      { id: 'sticker', label: 'Sticker Toon' },
      { id: 'clay', label: 'Claymation' },
      { id: 'chibi', label: 'Chibi' },
    ],
    robotColors: [
      '#e63946', '#1b7a3d', '#f7b32b', '#2a9d8f', '#457b9d', '#5e548e',
      '#ff7aa2', '#ff6b35', '#f4f1ea', '#1f1f23', '#8d99ae', '#7dffb5',
    ],
    builds: [
      { id: 'slim', label: 'Slim' },
      { id: 'medium', label: 'Medium' },
      { id: 'broad', label: 'Broad' },
    ],
    heights: [
      { id: 'short', label: 'Short' },
      { id: 'medium', label: 'Medium' },
      { id: 'tall', label: 'Tall' },
    ],
  };

  GR.DEFAULT_AVATAR = {
    runner: 'clay',
    artStyle: 'sticker',
    robotPrimary: '#e63946',
    robotAccent: '#8d99ae',
    skin: GR.soften('#cd8b5f', 0.1),
    build: 'medium',
    height: 'medium',
    hairStyle: 'short',
    hairColor: '#2e2118',
    eyeStyle: 'round',
    eyeColor: '#3a2a1c',
    brow: 'soft',
    mouth: 'smile',
    facialHair: 'none',
    freckles: false,
    blush: true,
    top: 'hoodie',
    topColor: GR.soften('#1b7a3d', 0.16),
    pattern: 'solid',
    bottom: 'joggers',
    bottomColor: GR.soften('#1f1f23', 0.16),
    shoeColor: '#ffffff',
    hat: 'none',
    hatColor: '#c62828',
    glassesStyle: 'none',
    extra: 'none',
  };

  GR.randomAvatar = function () {
    const C = GR.CATALOG;
    const id = (list) => GR.pick(list).id;
    return {
      runner: 'clay',
      artStyle: id(C.styles),
      robotPrimary: GR.pick(C.robotColors),
      robotAccent: GR.pick(C.robotColors),
      skin: GR.pick(C.skins),
      build: id(C.builds),
      height: id(C.heights),
      hairStyle: id(C.hairStyles),
      hairColor: GR.pick(C.hairColors),
      eyeStyle: id(C.eyeStyles),
      eyeColor: GR.pick(C.eyeColors),
      brow: id(C.brows),
      mouth: id(C.mouthStyles),
      facialHair: Math.random() < 0.65 ? 'none' : id(C.facialHair),
      freckles: Math.random() < 0.3,
      blush: Math.random() < 0.5,
      top: id(C.tops),
      topColor: GR.pick(C.topColors),
      pattern: id(C.patterns),
      bottom: id(C.bottoms),
      bottomColor: GR.pick(C.bottomColors),
      shoeColor: GR.pick(C.shoeColors),
      hat: Math.random() < 0.55 ? 'none' : id(C.hats),
      hatColor: GR.pick(C.hatColors),
      glassesStyle: Math.random() < 0.6 ? 'none' : id(C.glasses),
      extra: Math.random() < 0.6 ? 'none' : id(C.extras),
    };
  };
})();
