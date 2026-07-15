/* Green Rush — Bitmoji-style procedural avatar + animation rig.
   buildAvatar(cfg) assembles a customizable character from primitives with a
   canvas-painted face. AvatarAnimator drives run / jump / slide / idle / dead
   poses with smooth state blending and secondary hair motion. */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});

  /* ---------------------------------------------------------- helpers */
  function shade(hex, amt) {
    // amt in [-1, 1]: negative darkens toward black, positive lightens toward white
    const c = parseInt(hex.slice(1), 16);
    let r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
    const to = amt < 0 ? 0 : 255;
    const t = Math.abs(amt);
    r = Math.round(GR.lerp(r, to, t));
    g = Math.round(GR.lerp(g, to, t));
    b = Math.round(GR.lerp(b, to, t));
    return `rgb(${r},${g},${b})`;
  }

  function stdMat(color, opts) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.9, metalness: 0 }, opts || {}));
  }

  function mesh(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    m.castShadow = true;
    return m;
  }

  /* subtle fingerprint-y noise bump shared by all clay materials */
  let clayBump = null;
  function getClayBump() {
    if (clayBump) return clayBump;
    const { canvas, ctx } = GR.makeCanvas(128, 128);
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const g = GR.randi(110, 145);
      ctx.fillStyle = `rgba(${g},${g},${g},0.5)`;
      ctx.beginPath();
      ctx.ellipse(GR.rand(0, 128), GR.rand(0, 128), GR.rand(2, 7), GR.rand(1, 4), GR.rand(0, 3), 0, GR.TAU);
      ctx.fill();
    }
    clayBump = new THREE.CanvasTexture(canvas);
    clayBump.wrapS = clayBump.wrapT = THREE.RepeatWrapping;
    return clayBump;
  }

  function clayMat(color, opts) {
    // cel-shaded plasticine: stepped toon lighting + subtle fingerprint bump
    const o = Object.assign({ color, bumpMap: getClayBump(), bumpScale: 0.012 }, opts || {});
    delete o.roughness; // toon material has no roughness
    return GR.toonMat(o);
  }

  /* -------------------------------------------------- head painting
     Claymation-style: eyes and brows are 3D geometry. The head texture only
     carries skin, cheeks and freckles; the muzzle texture carries the big
     molded mouth. Both spheres are rotated so canvas-center faces -Z. */
  function paintHeadTex(cfg) {
    const S = 512;
    const { canvas, ctx } = GR.makeCanvas(S, S);
    ctx.fillStyle = cfg.skin;
    ctx.fillRect(0, 0, S, S);
    const cx = 256;
    if (cfg.blush) {
      ctx.fillStyle = 'rgba(235,120,110,0.35)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + s * 98, 308, 26, 16, 0, 0, GR.TAU);
        ctx.fill();
      }
    }
    if (cfg.freckles) {
      ctx.fillStyle = 'rgba(90,50,30,0.5)';
      const spots = [[-84, 296], [-64, 308], [-98, 316], [84, 298], [66, 310], [100, 314], [-74, 322], [78, 324]];
      for (const [dx, dy] of spots) {
        ctx.beginPath();
        ctx.arc(cx + dx, dy, 4, 0, GR.TAU);
        ctx.fill();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /* huge cheek-to-cheek molded mouth on the muzzle ball */
  function paintMuzzleTex(cfg, variant) {
    const S = 256;
    const { canvas, ctx } = GR.makeCanvas(S, S);
    ctx.fillStyle = shade(cfg.skin, 0.09);
    ctx.fillRect(0, 0, S, S);
    const cx = 128, cy = 118;
    const lineCol = '#5a2f24';
    ctx.strokeStyle = lineCol;
    ctx.lineCap = 'round';
    const mouth = variant === 'dizzy' ? 'dizzy' : cfg.mouth;
    if (mouth === 'grin') {
      // the trademark enormous clay grin, teeth and all
      ctx.beginPath();
      ctx.moveTo(cx - 88, cy - 16);
      ctx.quadraticCurveTo(cx, cy + 78, cx + 88, cy - 16);
      ctx.quadraticCurveTo(cx, cy + 18, cx - 88, cy - 16);
      ctx.closePath();
      ctx.fillStyle = '#fdf8ee';
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.stroke();
      // tooth seams
      ctx.lineWidth = 4;
      for (const dx of [-44, 0, 44]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx, cy + (dx === 0 ? 8 : -2));
        ctx.lineTo(cx + dx, cy + (dx === 0 ? 46 : 26));
        ctx.stroke();
      }
    } else if (mouth === 'smile') {
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(cx - 74, cy - 8);
      ctx.quadraticCurveTo(cx, cy + 52, cx + 74, cy - 8);
      ctx.stroke();
    } else if (mouth === 'smirk') {
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(cx - 40, cy + 12);
      ctx.quadraticCurveTo(cx + 30, cy + 34, cx + 74, cy - 14);
      ctx.stroke();
    } else if (mouth === 'open') {
      ctx.fillStyle = '#54231c';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 12, 52, 40, 0, 0, GR.TAU);
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = '#e0697a';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 32, 28, 15, 0, 0, GR.TAU);
      ctx.fill();
      ctx.fillStyle = '#fdf8ee';
      ctx.fillRect(cx - 34, cy - 24, 68, 14);
    } else if (mouth === 'tongue') {
      ctx.lineWidth = 11;
      ctx.beginPath();
      ctx.moveTo(cx - 66, cy - 6);
      ctx.quadraticCurveTo(cx, cy + 46, cx + 66, cy - 6);
      ctx.stroke();
      ctx.fillStyle = '#e0697a';
      ctx.beginPath();
      ctx.ellipse(cx + 26, cy + 34, 22, 26, 0.25, 0, GR.TAU);
      ctx.fill();
      ctx.strokeStyle = '#b04a5c';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx + 22, cy + 18);
      ctx.lineTo(cx + 32, cy + 50);
      ctx.stroke();
    } else {
      // dizzy: wobbly little 'o'
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 10, 22, 28, 0.15, 0, GR.TAU);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }

  /* -------------------------------------------------- shirt pattern */
  function paintPattern(topColor, pattern) {
    const S = 256;
    const { canvas, ctx } = GR.makeCanvas(S, S);
    ctx.fillStyle = topColor;
    ctx.fillRect(0, 0, S, S);
    if (pattern === 'tiedye') {
      const cols = ['rgba(255,255,255,0.5)', 'rgba(255,80,160,0.35)', 'rgba(80,200,255,0.35)', 'rgba(255,220,80,0.4)', 'rgba(140,255,140,0.35)'];
      for (let i = 0; i < 14; i++) {
        const x = GR.rand(0, S), y = GR.rand(0, S), r = GR.rand(18, 60);
        const g = ctx.createRadialGradient(x, y, 2, x, y, r);
        g.addColorStop(0, GR.pick(cols));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 5;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, 18 + i * 24, 0, GR.TAU);
        ctx.stroke();
      }
    } else if (pattern === 'stripes') {
      ctx.fillStyle = shade(topColor, -0.3);
      for (let y = 0; y < S; y += 44) ctx.fillRect(0, y, S, 20);
    } else if (pattern === 'leaf') {
      const c = shade(topColor, -0.35);
      for (let y = 20; y < S; y += 60) {
        for (let x = 20; x < S + 30; x += 60) {
          GR.drawLeaf(ctx, x + ((y / 60) % 2) * 30, y, 16, c, 0.3);
        }
      }
    } else if (pattern === 'checker') {
      ctx.fillStyle = shade(topColor, -0.25);
      const k = 32;
      for (let y = 0; y < S; y += k)
        for (let x = 0; x < S; x += k)
          if (((x + y) / k) % 2 === 0) ctx.fillRect(x, y, k, k);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    return tex;
  }

  /* -------------------------------------------------- hair styles */
  function hairCap(mat, r, thetaLength, rotX) {
    const m = mesh(new THREE.SphereGeometry(r, 24, 16, 0, GR.TAU, 0, thetaLength), mat, 0, 0, 0);
    m.rotation.x = rotX || 0;
    return m;
  }

  function buildHair(cfg, R) {
    // R = head radius. Returns { base, top, sway:[{group, amp, rate}] }
    const mat = clayMat(cfg.hairColor);
    const base = new THREE.Group();
    const top = new THREE.Group();
    const sway = [];
    const s = cfg.hairStyle;
    const cap = (r, th, rx) => hairCap(mat, r, th, rx);

    if (s === 'buzz') {
      base.add(cap(R * 1.03, 1.6, 0.77));
    } else if (s === 'short') {
      base.add(cap(R * 1.12, 1.55, 0.72));
    } else if (s === 'swoop') {
      base.add(cap(R * 1.12, 1.55, 0.72));
      const sw = mesh(new THREE.SphereGeometry(R * 0.62, 16, 12), mat, R * 0.32, R * 0.72, -R * 0.56);
      sw.scale.set(1, 0.42, 0.8);
      sw.rotation.z = 0.45;
      base.add(sw);
    } else if (s === 'afro') {
      const fro = new THREE.Group();
      const main = mesh(new THREE.SphereGeometry(R * 1.28, 20, 16), mat, 0, R * 0.5, 0.02);
      fro.add(main);
      const offs = [[-0.55, 0.9, 0.2], [0.55, 0.9, 0.2], [0, 1.15, 0.35], [-0.4, 0.6, -0.5], [0.4, 0.6, -0.5]];
      for (const [x, y, z] of offs) fro.add(mesh(new THREE.SphereGeometry(R * 0.62, 14, 10), mat, x * R, y * R, z * R));
      top.add(fro);
      sway.push({ group: fro, amp: 0.045, rate: 7 });
      base.add(cap(R * 1.05, 1.6, 0.77));
    } else if (s === 'puffs') {
      base.add(cap(R * 1.08, 1.55, 0.72));
      for (const sx of [-1, 1]) {
        const p = mesh(new THREE.SphereGeometry(R * 0.5, 14, 10), mat, sx * R * 0.66, R * 0.95, 0);
        top.add(p);
      }
    } else if (s === 'bun') {
      base.add(cap(R * 1.1, 1.6, 0.77));
      top.add(mesh(new THREE.SphereGeometry(R * 0.4, 14, 10), mat, 0, R * 1.08, R * 0.32));
    } else if (s === 'pony') {
      base.add(cap(R * 1.1, 1.6, 0.77));
      const pivot = new THREE.Group();
      pivot.position.set(0, R * 0.55, R * 0.78);
      const tail = mesh(new THREE.CapsuleGeometry(R * 0.22, R * 1.1, 6, 12), mat, 0, -R * 0.62, R * 0.1);
      tail.rotation.x = 0.35;
      pivot.add(tail);
      pivot.add(mesh(new THREE.SphereGeometry(R * 0.26, 12, 10), mat, 0, 0, 0));
      base.add(pivot);
      sway.push({ group: pivot, amp: 0.32, rate: 9 });
    } else if (s === 'long') {
      base.add(cap(R * 1.13, 1.85, 1.02));
      const flow = new THREE.Group();
      const backPanel = mesh(new THREE.SphereGeometry(R * 0.95, 16, 12), mat, 0, -R * 0.55, R * 0.55);
      backPanel.scale.set(0.85, 1.15, 0.5);
      flow.add(backPanel);
      for (const sx of [-1, 1]) {
        const side = mesh(new THREE.SphereGeometry(R * 0.5, 14, 10), mat, sx * R * 0.78, -R * 0.5, -R * 0.05);
        side.scale.set(0.55, 1.5, 0.8);
        flow.add(side);
      }
      base.add(flow);
      sway.push({ group: flow, amp: 0.07, rate: 8 });
    } else if (s === 'locs') {
      base.add(cap(R * 1.1, 1.6, 0.77));
      const bunch = new THREE.Group();
      for (let i = 0; i < 9; i++) {
        const a = GR.lerp(Math.PI * 0.55, Math.PI * 1.45, i / 8); // around back half (+z)
        const x = Math.sin(a) * R * 0.88;
        const z = -Math.cos(a) * R * 0.88;
        const loc = mesh(new THREE.CapsuleGeometry(R * 0.11, R * (0.75 + (i % 3) * 0.2), 4, 8), mat, x, -R * 0.35, z);
        loc.rotation.z = -Math.sin(a) * 0.22;
        loc.rotation.x = -Math.cos(a) * 0.22;
        bunch.add(loc);
      }
      base.add(bunch);
      sway.push({ group: bunch, amp: 0.08, rate: 8.5 });
    } else if (s === 'mohawk') {
      base.add(cap(R * 1.02, 1.55, 0.72));
      for (let i = 0; i < 5; i++) {
        const z = GR.lerp(-R * 0.75, R * 0.7, i / 4);
        const h = R * (0.55 - Math.abs(i - 1.6) * 0.07);
        const spike = mesh(new THREE.ConeGeometry(R * 0.16, h, 8), mat, 0, R * 0.92 + h * 0.3, z);
        spike.rotation.x = z * 0.5;
        top.add(spike);
      }
    } else if (s === 'braids') {
      base.add(cap(R * 1.1, 1.6, 0.77));
      for (const sx of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx * R * 0.72, -R * 0.05, -R * 0.28);
        const br = mesh(new THREE.CapsuleGeometry(R * 0.14, R * 1.0, 4, 8), mat, 0, -R * 0.55, 0);
        pivot.add(br);
        pivot.add(mesh(new THREE.SphereGeometry(R * 0.17, 10, 8), mat, 0, -R * 1.12, 0));
        base.add(pivot);
        sway.push({ group: pivot, amp: 0.18, rate: 8 + (sx > 0 ? 0.9 : 0) });
      }
    }
    return { base, top, sway, mat };
  }

  /* -------------------------------------------------- hats / glasses / extras */
  function buildHat(cfg, R) {
    if (cfg.hat === 'none') return null;
    const g = new THREE.Group();
    const mat = clayMat(cfg.hatColor);
    if (cfg.hat === 'beanie') {
      g.add(hairCap(mat, R * 1.16, 1.45, 0.62));
      const band = mesh(new THREE.TorusGeometry(R * 1.0, R * 0.13, 10, 24), mat, 0, R * 0.52, 0);
      band.rotation.x = Math.PI / 2 - 0.12;
      g.add(band);
      g.add(mesh(new THREE.SphereGeometry(R * 0.18, 10, 8), stdMat('#f4f1ea'), 0, R * 1.22, 0));
    } else if (cfg.hat === 'cap' || cfg.hat === 'backcap') {
      const back = cfg.hat === 'backcap';
      g.add(hairCap(mat, R * 1.14, 1.4, 0.58));
      const brim = mesh(new THREE.CylinderGeometry(R * 0.78, R * 0.85, R * 0.07, 18, 1, false, 0, Math.PI), mat, 0, R * 0.56, (back ? 1 : -1) * R * 0.82);
      brim.scale.z = 1.25;
      brim.rotation.y = back ? Math.PI : 0;
      brim.rotation.x = back ? -0.12 : 0.12;
      g.add(brim);
      g.add(mesh(new THREE.SphereGeometry(R * 0.09, 8, 6), mat, 0, R * 1.12, 0));
    } else if (cfg.hat === 'bucket') {
      g.add(mesh(new THREE.CylinderGeometry(R * 0.85, R * 1.02, R * 0.62, 20), mat, 0, R * 0.85, 0));
      g.add(mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.42, R * 0.24, 22), mat, 0, R * 0.56, 0));
    } else if (cfg.hat === 'headband') {
      const band = mesh(new THREE.TorusGeometry(R * 1.0, R * 0.1, 10, 24), mat, 0, R * 0.55, 0);
      band.rotation.x = Math.PI / 2 - 0.18;
      g.add(band);
    }
    return g;
  }

  function heartGeo() {
    const s = new THREE.Shape();
    s.moveTo(2.5, 2.5);
    s.bezierCurveTo(2.5, 2.5, 2.0, 0, 0, 0);
    s.bezierCurveTo(-3.0, 0, -3.0, 3.5, -3.0, 3.5);
    s.bezierCurveTo(-3.0, 5.5, -1.0, 7.7, 2.5, 9.5);
    s.bezierCurveTo(6.0, 7.7, 8.0, 5.5, 8.0, 3.5);
    s.bezierCurveTo(8.0, 3.5, 8.0, 0, 5.0, 0);
    s.bezierCurveTo(3.5, 0, 2.5, 2.5, 2.5, 2.5);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 1.2, bevelEnabled: false });
    geo.center();
    return geo;
  }

  function buildGlasses(cfg, R) {
    if (cfg.glassesStyle === 'none') return null;
    const g = new THREE.Group();
    // sized and raised for the big googly clay eyes
    const y = R * 0.3, z = -R * 1.12;
    if (cfg.glassesStyle === 'sun') {
      const mat = stdMat('#15151a', { roughness: 0.35, metalness: 0.2 });
      for (const sx of [-1, 1]) {
        const lens = mesh(new THREE.SphereGeometry(R * 0.3, 12, 10), mat, sx * R * 0.3, y, z);
        lens.scale.set(1.1, 0.9, 0.3);
        g.add(lens);
      }
      g.add(mesh(new THREE.BoxGeometry(R * 0.2, R * 0.06, R * 0.06), mat, 0, y + R * 0.08, z));
    } else if (cfg.glassesStyle === 'round') {
      const mat = stdMat('#3c3226', { roughness: 0.4, metalness: 0.4 });
      for (const sx of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(R * 0.27, R * 0.032, 8, 20), mat, sx * R * 0.3, y, z);
        g.add(ring);
      }
      g.add(mesh(new THREE.BoxGeometry(R * 0.16, R * 0.05, R * 0.05), mat, 0, y + R * 0.04, z));
    } else if (cfg.glassesStyle === 'heart') {
      const mat = stdMat('#ff5c8a', { roughness: 0.4 });
      const geo = heartGeo();
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(geo, mat);
        h.scale.setScalar(R * 0.062);
        h.rotation.z = Math.PI;
        h.position.set(sx * R * 0.31, y, z);
        h.castShadow = true;
        g.add(h);
      }
      g.add(mesh(new THREE.BoxGeometry(R * 0.18, R * 0.06, R * 0.06), mat, 0, y + R * 0.06, z));
    }
    return g;
  }

  function buildHeadExtra(cfg, R) {
    if (cfg.extra !== 'headphones') return null;
    const g = new THREE.Group();
    const dark = stdMat('#20242b', { roughness: 0.5 });
    const gold = stdMat('#e9b64c', { roughness: 0.35, metalness: 0.6 });
    const band = mesh(new THREE.TorusGeometry(R * 1.12, R * 0.09, 8, 24, Math.PI), dark, 0, R * 0.1, 0);
    g.add(band);
    for (const sx of [-1, 1]) {
      const cup = mesh(new THREE.CylinderGeometry(R * 0.3, R * 0.3, R * 0.18, 14), dark, sx * R * 1.06, R * 0.05, 0);
      cup.rotation.z = Math.PI / 2;
      g.add(cup);
      const ring = mesh(new THREE.CylinderGeometry(R * 0.31, R * 0.31, R * 0.04, 14), gold, sx * R * 1.16, R * 0.05, 0);
      ring.rotation.z = Math.PI / 2;
      g.add(ring);
    }
    return g;
  }

  /* -------------------------------------------------- avatar assembly */
  GR.buildAvatar = function (cfg) {
    const group = new THREE.Group();
    const rig = new THREE.Group();
    group.add(rig);

    const heightScale = { short: 0.93, medium: 1.0, tall: 1.07 }[cfg.height] || 1;
    const rm = { slim: 0.88, medium: 1.0, broad: 1.16 }[cfg.build] || 1; // limb radius mult
    const tm = { slim: 0.9, medium: 1.0, broad: 1.2 }[cfg.build] || 1;  // torso mult
    rig.scale.setScalar(heightScale);

    const disposables = [];
    const track = (obj) => { disposables.push(obj); return obj; };

    /* materials — matte plasticine with a fingerprint bump */
    const skinMat = track(clayMat(cfg.skin));
    const patternTex = track(paintPattern(cfg.topColor, cfg.pattern));
    const torsoMat = track(GR.toonMat({ map: patternTex, bumpMap: getClayBump(), bumpScale: 0.02 }));
    const topPlainMat = track(clayMat(cfg.topColor));
    const bottomMat = track(clayMat(cfg.bottomColor));
    const shoeMat = track(clayMat(cfg.shoeColor, { roughness: 0.7 }));
    const soleMat = track(clayMat('#f5f2ec', { roughness: 0.6 }));

    const longSleeves = cfg.top === 'hoodie' || cfg.top === 'jacket';
    const sleeveless = cfg.top === 'tank';
    const upperArmMat = sleeveless ? skinMat : topPlainMat;
    const forearmMat = longSleeves ? topPlainMat : skinMat;
    const longLegs = cfg.bottom !== 'shorts';
    const shinMat = longLegs ? bottomMat : skinMat;

    /* ------ hips + legs */
    const hipsBaseY = 0.84;
    const hips = new THREE.Group();
    hips.position.set(0, hipsBaseY, 0);
    rig.add(hips);

    const pelvis = mesh(new THREE.SphereGeometry(0.18 * tm, 18, 14), bottomMat, 0, 0.01, 0);
    pelvis.scale.set(1.2, 0.8, 1.0);
    hips.add(pelvis);

    function buildLeg(sx) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.115 * tm, -0.04, 0);
      const thigh = mesh(track(new THREE.CapsuleGeometry(0.1 * rm, 0.19, 6, 12)), bottomMat, 0, -0.17, 0);
      leg.add(thigh);
      if (cfg.bottom === 'cargo') {
        const pocket = mesh(track(new THREE.BoxGeometry(0.05, 0.09, 0.08)), track(stdMat(shade(cfg.bottomColor, -0.2))), sx * 0.1 * rm, -0.16, 0);
        leg.add(pocket);
      }
      const knee = new THREE.Group();
      knee.position.set(0, -0.34, 0);
      leg.add(knee);
      const shin = mesh(track(new THREE.CapsuleGeometry(0.084 * rm, 0.18, 6, 12)), shinMat, 0, -0.155, 0);
      knee.add(shin);
      if (cfg.bottom === 'joggers') {
        const cuff = mesh(track(new THREE.CylinderGeometry(0.09 * rm, 0.09 * rm, 0.05, 12)), soleMat, 0, -0.27, 0);
        knee.add(cuff);
      }
      const shoe = new THREE.Group();
      shoe.position.set(0, -0.345, -0.03);
      const body = mesh(track(new THREE.BoxGeometry(0.13, 0.085, 0.22)), shoeMat, 0, 0.015, 0);
      const sole = mesh(track(new THREE.BoxGeometry(0.135, 0.04, 0.23)), soleMat, 0, -0.04, 0);
      const toe = mesh(track(new THREE.SphereGeometry(0.062, 10, 8)), soleMat, 0, 0, -0.11);
      toe.scale.set(1, 0.8, 0.7);
      shoe.add(body, sole, toe);
      knee.add(shoe);
      return { group: leg, knee };
    }
    const legL = buildLeg(-1);
    const legR = buildLeg(1);
    hips.add(legL.group, legR.group);

    /* ------ spine + torso */
    const spine = new THREE.Group();
    spine.position.set(0, 0.06, 0);
    hips.add(spine);

    const torso = mesh(track(new THREE.CapsuleGeometry(0.205 * tm, 0.24, 8, 16)), torsoMat, 0, 0.26, 0);
    torso.rotation.y = Math.PI / 2; // seam to the back, pattern front
    torso.scale.set(1, 1.08, 0.92);  // egg-shaped clay torso
    spine.add(torso);

    if (cfg.top === 'hoodie') {
      const hood = mesh(track(new THREE.TorusGeometry(0.14 * tm, 0.06, 10, 18)), topPlainMat, 0, 0.44, 0.14 * tm);
      hood.rotation.x = 0.6;
      spine.add(hood);
      const pocket = mesh(track(new THREE.BoxGeometry(0.2 * tm, 0.1, 0.05)), track(clayMat(shade(cfg.topColor, -0.18))), 0, 0.1, -0.19 * tm);
      spine.add(pocket);
      for (const sx of [-1, 1]) {
        const str = mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6)), soleMat, sx * 0.06, 0.34, -0.205 * tm);
        spine.add(str);
      }
    } else if (cfg.top === 'jacket') {
      const zip = mesh(track(new THREE.BoxGeometry(0.024, 0.36, 0.02)), track(stdMat('#d8d8d8', { metalness: 0.5, roughness: 0.4 })), 0, 0.24, -0.207 * tm);
      spine.add(zip);
      const collar = mesh(track(new THREE.TorusGeometry(0.115 * tm, 0.038, 8, 16)), track(clayMat(shade(cfg.topColor, -0.25))), 0, 0.45, 0);
      collar.rotation.x = Math.PI / 2 - 0.25;
      spine.add(collar);
    }
    if (cfg.extra === 'chain') {
      const gold = track(stdMat('#e9b64c', { metalness: 0.75, roughness: 0.3 }));
      const chain = mesh(track(new THREE.TorusGeometry(0.14 * tm, 0.016, 8, 20)), gold, 0, 0.4, -0.05);
      chain.rotation.x = Math.PI / 2 - 1.15;
      spine.add(chain);
      const pendant = mesh(track(new THREE.SphereGeometry(0.035, 10, 8)), gold, 0, 0.3, -0.21 * tm);
      pendant.scale.set(1, 1.15, 0.5);
      spine.add(pendant);
    }

    /* ------ arms */
    function buildArm(sx) {
      const arm = new THREE.Group();
      arm.position.set(sx * (0.205 * tm + 0.02), 0.45, 0);
      const shoulder = mesh(track(new THREE.SphereGeometry(0.088 * rm, 12, 10)), upperArmMat, 0, -0.01, 0);
      arm.add(shoulder);
      const upper = mesh(track(new THREE.CapsuleGeometry(0.072 * rm, 0.14, 6, 12)), upperArmMat, 0, -0.13, 0);
      arm.add(upper);
      if (cfg.top === 'jacket') {
        const stripe = mesh(track(new THREE.CylinderGeometry(0.076 * rm, 0.076 * rm, 0.035, 10)), soleMat, 0, -0.12, 0);
        arm.add(stripe);
      }
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.27, 0);
      arm.add(elbow);
      const fore = mesh(track(new THREE.CapsuleGeometry(0.064 * rm, 0.12, 6, 12)), forearmMat, 0, -0.11, 0);
      elbow.add(fore);
      // big soft mitt hands
      const hand = mesh(track(new THREE.SphereGeometry(0.08 * rm, 12, 10)), skinMat, 0, -0.245, 0);
      hand.scale.set(0.95, 1.1, 1.0);
      elbow.add(hand);
      return { group: arm, elbow };
    }
    const armL = buildArm(-1);
    const armR = buildArm(1);
    spine.add(armL.group, armR.group);

    /* ------ neck + head */
    const neck = new THREE.Group();
    neck.position.set(0, 0.52, 0);
    spine.add(neck);
    const neckMesh = mesh(track(new THREE.CylinderGeometry(0.085 * rm, 0.095 * rm, 0.12, 12)), skinMat, 0, -0.02, 0);
    neck.add(neckMesh);

    const R = 0.28; // head radius
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 0.14 + R * 0.6, 0);
    headGrp.scale.set(0.94, 1.16, 0.96); // tall clay oval
    neck.add(headGrp);

    // no bump on the face — it fights the toon steps and looks patchy
    const headMat = track(GR.toonMat({ map: track(paintHeadTex(cfg)) }));
    const head = mesh(track(new THREE.SphereGeometry(R, 32, 24)), headMat, 0, 0, 0);
    head.rotation.y = Math.PI / 2; // texture center → -Z
    headGrp.add(head);

    /* muzzle — the protruding lower-face mass that carries the big mouth */
    const muzzleTex = {
      normal: track(paintMuzzleTex(cfg, 'normal')),
      dizzy: track(paintMuzzleTex(cfg, 'dizzy')),
    };
    const muzzleMat = track(GR.toonMat({ map: muzzleTex.normal }));
    const muzzle = mesh(track(new THREE.SphereGeometry(R * 0.62, 24, 18)), muzzleMat, 0, -R * 0.42, -R * 0.6);
    muzzle.rotation.y = Math.PI / 2;
    muzzle.scale.set(1.28, 0.85, 0.8);
    headGrp.add(muzzle);

    /* googly clay eyes: big close-set white balls, proud of the face */
    const eyeWhiteMat = track(new THREE.MeshStandardMaterial({ color: 0xfdfaf2, roughness: 0.55 }));
    const irisMat = track(stdMat(cfg.eyeColor, { roughness: 0.45 }));
    const pupilMat = track(new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 0.35 }));
    const eyeR = R * 0.26;
    const lidAmount = { chill: 0.5, sleepy: 0.32, round: 10, happy: 10, wink: 0.5 }[cfg.eyeStyle];
    const face = { eyes: [], pupils: [] };
    for (const sx of [-1, 1]) {
      const eg = new THREE.Group();
      eg.position.set(sx * R * 0.28, R * 0.3, -R * 0.8);
      const white = mesh(track(new THREE.SphereGeometry(eyeR, 18, 14)), eyeWhiteMat, 0, 0, 0);
      eg.add(white);
      const iris = mesh(track(new THREE.SphereGeometry(eyeR * 0.44, 12, 10)), irisMat, 0, -eyeR * 0.05, -eyeR * 0.72);
      const pupil = mesh(track(new THREE.SphereGeometry(eyeR * 0.26, 10, 8)), pupilMat, 0, -eyeR * 0.05, -eyeR * 0.92);
      iris.userData.noOutline = true;
      pupil.userData.noOutline = true;
      eg.add(iris, pupil);
      // heavy clay lid (skin ball shifted up to hood the eye)
      if (lidAmount < 2) {
        const lid = mesh(track(new THREE.SphereGeometry(eyeR * 1.06, 16, 12)), skinMat, 0, eyeR * (0.35 + lidAmount * 0.5), eyeR * 0.06);
        eg.add(lid);
      }
      // happy / wink: molded-shut squint
      const shut = cfg.eyeStyle === 'happy' || (cfg.eyeStyle === 'wink' && sx === 1);
      if (shut) eg.scale.y = 0.22;
      face.eyes.push({ group: eg, shut });
      face.pupils.push(pupil);
      headGrp.add(eg);
    }

    /* thick clay brow slugs */
    const browMat = track(clayMat(shade(cfg.hairColor, -0.15)));
    const browDef = {
      soft: { r: 0.055, len: 0.3, rot: 0.18, y: 0.68 },
      flat: { r: 0.055, len: 0.34, rot: 0, y: 0.66 },
      arch: { r: 0.055, len: 0.3, rot: 0.42, y: 0.72 },
      thick: { r: 0.085, len: 0.34, rot: 0.12, y: 0.7 },
    }[cfg.brow] || { r: 0.055, len: 0.3, rot: 0.18, y: 0.68 };
    for (const sx of [-1, 1]) {
      const brow = mesh(track(new THREE.CapsuleGeometry(R * browDef.r, R * browDef.len, 4, 8)), browMat, sx * R * 0.3, R * browDef.y, -R * 0.84);
      brow.rotation.z = Math.PI / 2 - sx * browDef.rot;
      headGrp.add(brow);
    }

    // big soft ears + round clay nose perched between the eyes
    for (const sx of [-1, 1]) {
      const ear = mesh(track(new THREE.SphereGeometry(R * 0.26, 12, 10)), skinMat, sx * R * 0.96, -R * 0.08, 0.01);
      ear.scale.set(0.5, 1.05, 0.85);
      headGrp.add(ear);
    }
    const nose = mesh(track(new THREE.SphereGeometry(R * 0.17, 14, 12)), skinMat, 0, R * 0.02, -R * 1.0);
    nose.scale.set(1, 0.9, 0.95);
    headGrp.add(nose);

    // facial hair (molded around the muzzle)
    const fhMat = track(clayMat(cfg.hairColor));
    if (cfg.facialHair === 'mustache') {
      for (const sx of [-1, 1]) {
        const mo = mesh(track(new THREE.SphereGeometry(R * 0.24, 12, 8)), fhMat, sx * R * 0.22, -R * 0.2, -R * 1.04);
        mo.scale.set(1.25, 0.42, 0.45);
        mo.rotation.z = sx * -0.25;
        headGrp.add(mo);
      }
    } else if (cfg.facialHair === 'goatee') {
      const gt = mesh(track(new THREE.SphereGeometry(R * 0.28, 12, 8)), fhMat, 0, -R * 0.86, -R * 0.66);
      gt.scale.set(0.95, 0.9, 0.6);
      headGrp.add(gt);
    } else if (cfg.facialHair === 'beard') {
      const chin = mesh(track(new THREE.SphereGeometry(R * 0.46, 14, 10)), fhMat, 0, -R * 0.84, -R * 0.36);
      chin.scale.set(1.4, 0.75, 0.95);
      headGrp.add(chin);
      for (const sx of [-1, 1]) {
        const jaw = mesh(track(new THREE.SphereGeometry(R * 0.32, 12, 8)), fhMat, sx * R * 0.68, -R * 0.42, -R * 0.32);
        jaw.scale.set(0.6, 1.0, 0.95);
        headGrp.add(jaw);
      }
    }

    // hair / hat / glasses / headphones
    const hair = buildHair(cfg, R);
    track(hair.mat);
    headGrp.add(hair.base, hair.top);
    const hat = buildHat(cfg, R);
    if (hat) {
      // tall hair tucks into real hats — but a headband covers nothing
      if (cfg.hat !== 'headband') hair.top.visible = false;
      headGrp.add(hat);
    }
    const glasses = buildGlasses(cfg, R);
    if (glasses) headGrp.add(glasses);
    const phones = buildHeadExtra(cfg, R);
    if (phones) headGrp.add(phones);

    /* ------ ink outlines: inverted-hull pass over every clay piece */
    const outlineMat = track(new THREE.MeshBasicMaterial({ color: 0x2a1c12, side: THREE.BackSide }));
    const outlineTargets = [];
    group.traverse((o) => {
      if (!o.isMesh || o.userData.noOutline) return;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      if (o.geometry.boundingSphere.radius < 0.05) return; // skip tiny trim pieces
      outlineTargets.push(o);
    });
    for (const o of outlineTargets) {
      const hull = new THREE.Mesh(o.geometry, outlineMat);
      hull.scale.setScalar(1.05);
      hull.castShadow = false;
      hull.userData.noOutline = true;
      o.add(hull);
    }

    /* ------ public interface */
    const avatar = {
      kind: 'clay',
      group,
      rig,
      cfg,
      hipsBaseY,
      joints: {
        hips, spine, neck, headGrp,
        legL: { hip: legL.group, knee: legL.knee },
        legR: { hip: legR.group, knee: legR.knee },
        armL: { sh: armL.group, el: armL.elbow },
        armR: { sh: armR.group, el: armR.elbow },
      },
      sway: hair.sway,
      _face: 'open',
      setFace(name) {
        if (this._face === name) return;
        this._face = name;
        muzzleMat.map = name === 'dizzy' ? muzzleTex.dizzy : muzzleTex.normal;
        for (let i = 0; i < face.eyes.length; i++) {
          const e = face.eyes[i];
          const p = face.pupils[i];
          if (name === 'closed') {
            e.group.scale.y = 0.18; // clay-squint blink
          } else {
            e.group.scale.y = e.shut ? 0.22 : 1;
          }
          // dizzy: cross-eyed pupils
          const sx = i === 0 ? -1 : 1;
          p.position.x = name === 'dizzy' ? sx * -0.045 : 0;
          p.position.y = name === 'dizzy' ? 0.02 : -0.0036;
        }
      },
      dispose() {
        // all geometries/materials/textures are created per-avatar, so a full
        // traverse-dispose is safe (nothing is shared across avatars)
        group.traverse((o) => {
          if (o.isMesh) {
            if (o.geometry) o.geometry.dispose();
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            for (const m of mats) {
              if (!m) continue;
              if (m.map) m.map.dispose();
              m.dispose();
            }
          }
        });
        for (const d of disposables) {
          if (d.dispose) d.dispose();
          if (d.map && d.map.dispose) d.map.dispose();
        }
      },
    };
    return avatar;
  };

  /* ==================================================================
     AvatarAnimator — procedural pose machine with state blending
     ================================================================== */
  const relu = (v) => (v > 0 ? v : 0);

  GR.AvatarAnimator = class {
    constructor(avatar) {
      this.t = 0;
      this.phase = 0;
      this.state = 'idle';
      this.blendT = 1;
      this.blinkTimer = GR.rand(1.5, 4);
      this.blinkLeft = 0;
      this.setAvatar(avatar);
    }

    setAvatar(avatar) {
      this.av = avatar;
      const j = avatar.joints;
      // flat list of [object, property-path] the poses drive
      this.channels = [
        [j.hips.position, 'y'], [j.hips.rotation, 'y'], [j.hips.rotation, 'z'],
        [j.spine.rotation, 'x'], [j.spine.rotation, 'y'], [j.spine.rotation, 'z'],
        [j.neck.rotation, 'x'], [j.neck.rotation, 'y'], [j.neck.rotation, 'z'],
        [j.legL.hip.rotation, 'x'], [j.legL.hip.rotation, 'z'], [j.legL.knee.rotation, 'x'],
        [j.legR.hip.rotation, 'x'], [j.legR.hip.rotation, 'z'], [j.legR.knee.rotation, 'x'],
        [j.armL.sh.rotation, 'x'], [j.armL.sh.rotation, 'z'], [j.armL.el.rotation, 'x'],
        [j.armR.sh.rotation, 'x'], [j.armR.sh.rotation, 'z'], [j.armR.el.rotation, 'x'],
      ];
      this.snapshot = this.channels.map(([o, p]) => o[p]);
    }

    setState(name) {
      if (this.state === name) return;
      this.snapshot = this.channels.map(([o, p]) => o[p]);
      this.state = name;
      this.blendT = 0;
      if (name === 'dead') this.av.setFace('dizzy');
      else if (this.blinkLeft <= 0) this.av.setFace('open');
    }

    /* opts: speed (world u/s), lean (-1..1 lane-change lean), velY, onGround */
    update(dt, opts) {
      opts = opts || {};
      this.t += dt;
      const speed = opts.speed || 0;
      this.blendT = Math.min(1, this.blendT + dt / 0.16);

      // blink
      if (this.state !== 'dead') {
        this.blinkTimer -= dt;
        if (this.blinkTimer <= 0) {
          this.blinkLeft = 0.13;
          this.blinkTimer = GR.rand(2.2, 5);
          this.av.setFace('closed');
        }
        if (this.blinkLeft > 0) {
          this.blinkLeft -= dt;
          if (this.blinkLeft <= 0) this.av.setFace('open');
        }
      }

      const P = new Array(this.channels.length).fill(0);
      const base = this.av.hipsBaseY;
      const t = this.t;

      if (this.state === 'run') {
        const stride = GR.clamp(4.5 + speed * 0.42, 6, 16);
        this.phase += dt * stride;
        const ph = this.phase;
        const swing = Math.sin(ph);
        const bounce = Math.abs(Math.cos(ph));
        P[0] = base + bounce * 0.055 - 0.025;             // hips y
        P[1] = -swing * 0.10;                              // hips yaw
        P[2] = Math.cos(ph) * 0.05;                        // hips roll
        P[3] = 0.17 + Math.sin(ph * 2) * 0.03;             // spine pitch (lean fwd)
        P[4] = swing * 0.13;                               // spine twist
        P[5] = 0;
        P[6] = -0.14;                                      // neck: look up a touch
        P[7] = -swing * 0.06;                              // head counter-turn
        P[8] = 0;
        P[9] = swing * 0.78;                               // thigh L
        P[10] = 0.02;
        P[11] = -(0.18 + relu(Math.sin(ph - 2.0)) * 1.35); // knee L
        P[12] = -swing * 0.78;                             // thigh R
        P[13] = -0.02;
        P[14] = -(0.18 + relu(Math.sin(ph - 2.0 + Math.PI)) * 1.35);
        P[15] = -swing * 0.85;                             // arm L (opposite legs)
        P[16] = -0.14;
        P[17] = 0.75 + relu(-swing) * 0.5;                 // elbow L
        P[18] = swing * 0.85;
        P[19] = 0.14;
        P[20] = 0.75 + relu(swing) * 0.5;
      } else if (this.state === 'jump') {
        // tuck while rising, reach for the ground while falling — smooth ramp
        const k = GR.smoothstep(GR.clamp(((opts.velY || 0) - 0.5) / 3, 0, 1));
        P[0] = base;
        P[3] = 0.1;
        P[6] = -0.2;
        P[9] = GR.lerp(0.55, 0.85, k);
        P[11] = GR.lerp(-0.4, -1.6, k);
        P[12] = GR.lerp(-0.45, 0.35, k);
        P[14] = GR.lerp(-0.9, -1.5, k);
        P[15] = GR.lerp(-1.4, -2.2, k);   // arms swing up
        P[16] = -0.35;
        P[17] = 0.5;
        P[18] = GR.lerp(-1.2, -2.0, k);
        P[19] = 0.35;
        P[20] = 0.5;
      } else if (this.state === 'slide') {
        P[0] = base - 0.34;               // drop low
        P[3] = -0.62;                     // lean back
        P[6] = 0.72;                      // head looks forward
        P[9] = 1.35; P[11] = -0.85;       // knees forward
        P[12] = 1.05; P[14] = -0.45;
        P[15] = 0.9; P[16] = -0.3; P[17] = 0.4;  // arms trail behind
        P[18] = 0.9; P[19] = 0.3; P[20] = 0.4;
        this.phase += dt * 6;
      } else if (this.state === 'dead') {
        P[0] = base - 0.15;
        P[3] = 0.4;
        P[6] = -0.3;
        P[9] = 0.8; P[11] = -1.2;
        P[12] = -0.6; P[14] = -0.5;
        P[15] = -1.8; P[16] = -0.9; P[17] = 0.3;
        P[18] = -1.5; P[19] = 0.9; P[20] = 0.3;
      } else {
        // idle — soft breathing, weight shift, little bpm head-nod
        P[0] = base + Math.sin(t * 2) * 0.008;
        P[2] = Math.sin(t * 0.7) * 0.03;
        P[3] = 0.03 + Math.sin(t * 2) * 0.015;
        P[6] = -0.03 + Math.sin(t * 8.16) * 0.025; // nod ~78bpm
        P[7] = Math.sin(t * 0.33) * 0.22;
        P[9] = 0.06; P[11] = -0.1;
        P[12] = -0.04; P[14] = -0.06;
        P[15] = 0.08; P[16] = -0.1; P[17] = 0.25;
        P[18] = 0.05; P[19] = 0.1; P[20] = 0.22;
      }

      // apply with transition blending
      const w = GR.smoothstep(this.blendT);
      for (let i = 0; i < this.channels.length; i++) {
        const [o, p] = this.channels[i];
        o[p] = GR.lerp(this.snapshot[i], P[i], w);
      }

      // lane-change lean (root roll) — applied outside the blend
      const lean = opts.lean || 0;
      this.av.rig.rotation.z = GR.damp(this.av.rig.rotation.z, -lean * 0.28, 10, dt);

      // secondary hair motion
      const energy = this.state === 'run' ? GR.clamp(speed / 18, 0.4, 1.4) : 0.25;
      for (let i = 0; i < this.av.sway.length; i++) {
        const s = this.av.sway[i];
        s.group.rotation.x = Math.sin(this.t * s.rate + i * 1.7) * s.amp * energy;
        s.group.rotation.z = Math.cos(this.t * s.rate * 0.8 + i) * s.amp * 0.6 * energy + lean * 0.3;
      }
    }
  };
})();
