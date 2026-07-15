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

  /* -------------------------------------------------- face painting
     512x512 canvas wrapped around the head sphere. Face features live near
     the horizontal center; the head mesh is rotated so that area faces -Z. */
  function paintFace(cfg, variant) {
    const S = 512;
    const { canvas, ctx } = GR.makeCanvas(S, S);
    ctx.fillStyle = cfg.skin;
    ctx.fillRect(0, 0, S, S);

    const cx = 256;
    const eyeY = 246, eyeDX = 50;
    const browY = 202, mouthY = 326;
    const lineCol = '#2b1a12';

    // blush
    if (cfg.blush) {
      ctx.fillStyle = 'rgba(240,110,120,0.30)';
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(cx + s * 88, 300, 22, 13, 0, 0, GR.TAU);
        ctx.fill();
      }
    }
    // freckles
    if (cfg.freckles) {
      ctx.fillStyle = 'rgba(90,50,30,0.5)';
      const spots = [[-64, 292], [-46, 302], [-30, 294], [30, 296], [48, 304], [64, 290], [-12, 300], [12, 302]];
      for (const [dx, dy] of spots) {
        ctx.beginPath();
        ctx.arc(cx + dx, dy, 3.2, 0, GR.TAU);
        ctx.fill();
      }
    }
    // nose hint
    ctx.strokeStyle = shade(cfg.skin, -0.32);
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, 296, 9, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const drawClosedEye = (x) => {
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 20, eyeY + 2);
      ctx.quadraticCurveTo(x, eyeY + 12, x + 20, eyeY + 2);
      ctx.stroke();
    };
    const drawHappyEye = (x) => {
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - 20, eyeY + 8);
      ctx.quadraticCurveTo(x, eyeY - 16, x + 20, eyeY + 8);
      ctx.stroke();
    };
    const drawSpiralEye = (x) => {
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, eyeY, 14, 0, Math.PI * 1.6);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + 2, eyeY - 2, 7, Math.PI, Math.PI * 2.4);
      ctx.stroke();
    };
    const drawOpenEye = (x, style) => {
      // white
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(x, eyeY, 26, 30, 0, 0, GR.TAU);
      ctx.fill();
      // iris + pupil + sparkle
      ctx.fillStyle = cfg.eyeColor;
      ctx.beginPath();
      ctx.arc(x, eyeY + 3, 13.5, 0, GR.TAU);
      ctx.fill();
      ctx.fillStyle = '#191410';
      ctx.beginPath();
      ctx.arc(x, eyeY + 3, 6.5, 0, GR.TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.beginPath();
      ctx.arc(x - 4.5, eyeY - 2.5, 4, 0, GR.TAU);
      ctx.fill();
      // lids
      let lid = 0;
      if (style === 'chill') lid = 0.42;
      if (style === 'sleepy') lid = 0.58;
      if (lid > 0) {
        // skin-colored mask over the top portion of the eye
        ctx.fillStyle = cfg.skin;
        ctx.beginPath();
        ctx.rect(x - 28, eyeY - 32, 56, 62 * lid);
        ctx.fill();
        ctx.strokeStyle = lineCol;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 24, eyeY - 31 + 62 * lid);
        ctx.lineTo(x + 24, eyeY - 31 + 62 * lid);
        ctx.stroke();
      }
    };
    const drawEye = (x, side) => {
      if (variant === 'dizzy') return drawSpiralEye(x);
      if (variant === 'closed') return drawClosedEye(x);
      const st = cfg.eyeStyle;
      if (st === 'happy') return drawHappyEye(x);
      if (st === 'wink' && side === 1) return drawClosedEye(x);
      drawOpenEye(x, st);
    };
    drawEye(cx - eyeDX, -1);
    drawEye(cx + eyeDX, 1);

    // brows
    const browCol = shade(cfg.hairColor, -0.2);
    ctx.strokeStyle = browCol;
    ctx.fillStyle = browCol;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const x = cx + s * eyeDX;
      const b = cfg.brow;
      ctx.lineWidth = b === 'thick' ? 14 : 9;
      ctx.beginPath();
      if (b === 'flat') {
        ctx.moveTo(x - 22, browY);
        ctx.lineTo(x + 22, browY);
      } else if (b === 'arch') {
        ctx.moveTo(x - 22, browY + 6);
        ctx.quadraticCurveTo(x, browY - 16, x + 22, browY + 4);
      } else {
        ctx.moveTo(x - 22, browY + 3);
        ctx.quadraticCurveTo(x, browY - 8, x + 22, browY + 3);
      }
      ctx.stroke();
    }

    // mouth
    const mCol = '#7a352a';
    ctx.strokeStyle = mCol;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    const mouth = variant === 'dizzy' ? 'dizzy' : cfg.mouth;
    if (mouth === 'smile') {
      ctx.beginPath();
      ctx.moveTo(cx - 26, mouthY - 6);
      ctx.quadraticCurveTo(cx, mouthY + 16, cx + 26, mouthY - 6);
      ctx.stroke();
    } else if (mouth === 'grin') {
      ctx.beginPath();
      ctx.moveTo(cx - 32, mouthY - 8);
      ctx.quadraticCurveTo(cx, mouthY + 34, cx + 32, mouthY - 8);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.stroke();
    } else if (mouth === 'smirk') {
      ctx.beginPath();
      ctx.moveTo(cx - 12, mouthY + 2);
      ctx.quadraticCurveTo(cx + 12, mouthY + 12, cx + 30, mouthY - 8);
      ctx.stroke();
    } else if (mouth === 'open') {
      ctx.fillStyle = '#5a241d';
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + 2, 21, 16, 0, 0, GR.TAU);
      ctx.fill();
      ctx.fillStyle = '#e0697a';
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + 10, 12, 7, 0, 0, GR.TAU);
      ctx.fill();
    } else if (mouth === 'tongue') {
      ctx.beginPath();
      ctx.moveTo(cx - 24, mouthY - 6);
      ctx.quadraticCurveTo(cx, mouthY + 14, cx + 24, mouthY - 6);
      ctx.stroke();
      ctx.fillStyle = '#e0697a';
      ctx.beginPath();
      ctx.ellipse(cx + 10, mouthY + 12, 10, 12, 0.2, 0, GR.TAU);
      ctx.fill();
    } else {
      // dizzy: little wobbly 'o'
      ctx.beginPath();
      ctx.ellipse(cx, mouthY + 4, 10, 12, 0, 0, GR.TAU);
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
    const mat = stdMat(cfg.hairColor, { roughness: 0.95 });
    const base = new THREE.Group();
    const top = new THREE.Group();
    const sway = [];
    const s = cfg.hairStyle;
    const cap = (r, th, rx) => hairCap(mat, r, th, rx);

    if (s === 'buzz') {
      base.add(cap(R * 1.03, 1.7, 0.32));
    } else if (s === 'short') {
      base.add(cap(R * 1.12, 1.75, 0.35));
    } else if (s === 'swoop') {
      base.add(cap(R * 1.12, 1.7, 0.35));
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
      base.add(cap(R * 1.05, 1.75, 0.28));
    } else if (s === 'puffs') {
      base.add(cap(R * 1.08, 1.65, 0.3));
      for (const sx of [-1, 1]) {
        const p = mesh(new THREE.SphereGeometry(R * 0.5, 14, 10), mat, sx * R * 0.66, R * 0.95, 0);
        top.add(p);
      }
    } else if (s === 'bun') {
      base.add(cap(R * 1.1, 1.7, 0.3));
      top.add(mesh(new THREE.SphereGeometry(R * 0.4, 14, 10), mat, 0, R * 1.08, R * 0.32));
    } else if (s === 'pony') {
      base.add(cap(R * 1.1, 1.75, 0.3));
      const pivot = new THREE.Group();
      pivot.position.set(0, R * 0.55, R * 0.78);
      const tail = mesh(new THREE.CapsuleGeometry(R * 0.22, R * 1.1, 6, 12), mat, 0, -R * 0.62, R * 0.1);
      tail.rotation.x = 0.35;
      pivot.add(tail);
      pivot.add(mesh(new THREE.SphereGeometry(R * 0.26, 12, 10), mat, 0, 0, 0));
      base.add(pivot);
      sway.push({ group: pivot, amp: 0.32, rate: 9 });
    } else if (s === 'long') {
      base.add(cap(R * 1.13, 1.85, 0.28));
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
      base.add(cap(R * 1.1, 1.7, 0.3));
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
      base.add(cap(R * 1.02, 1.65, 0.32));
      for (let i = 0; i < 5; i++) {
        const z = GR.lerp(-R * 0.75, R * 0.7, i / 4);
        const h = R * (0.55 - Math.abs(i - 1.6) * 0.07);
        const spike = mesh(new THREE.ConeGeometry(R * 0.16, h, 8), mat, 0, R * 0.92 + h * 0.3, z);
        spike.rotation.x = z * 0.5;
        top.add(spike);
      }
    } else if (s === 'braids') {
      base.add(cap(R * 1.1, 1.75, 0.3));
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
    const mat = stdMat(cfg.hatColor);
    if (cfg.hat === 'beanie') {
      g.add(hairCap(mat, R * 1.16, 1.5, 0.15));
      const band = mesh(new THREE.TorusGeometry(R * 1.05, R * 0.13, 10, 24), mat, 0, R * 0.28, 0);
      band.rotation.x = Math.PI / 2 - 0.12;
      g.add(band);
      g.add(mesh(new THREE.SphereGeometry(R * 0.18, 10, 8), stdMat('#f4f1ea'), 0, R * 1.22, 0));
    } else if (cfg.hat === 'cap' || cfg.hat === 'backcap') {
      const back = cfg.hat === 'backcap';
      g.add(hairCap(mat, R * 1.14, 1.45, 0.15));
      const brim = mesh(new THREE.CylinderGeometry(R * 0.78, R * 0.85, R * 0.07, 18, 1, false, 0, Math.PI), mat, 0, R * 0.38, (back ? 1 : -1) * R * 0.85);
      brim.scale.z = 1.25;
      brim.rotation.y = back ? Math.PI : 0;
      brim.rotation.x = back ? -0.12 : 0.12;
      g.add(brim);
      g.add(mesh(new THREE.SphereGeometry(R * 0.09, 8, 6), mat, 0, R * 1.12, 0));
    } else if (cfg.hat === 'bucket') {
      g.add(mesh(new THREE.CylinderGeometry(R * 0.85, R * 1.02, R * 0.62, 20), mat, 0, R * 0.72, 0));
      g.add(mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.42, R * 0.24, 22), mat, 0, R * 0.42, 0));
    } else if (cfg.hat === 'headband') {
      const band = mesh(new THREE.TorusGeometry(R * 1.02, R * 0.1, 10, 24), mat, 0, R * 0.32, 0);
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
    const y = R * 0.12, z = -R * 0.98;
    if (cfg.glassesStyle === 'sun') {
      const mat = stdMat('#15151a', { roughness: 0.35, metalness: 0.2 });
      for (const sx of [-1, 1]) {
        const lens = mesh(new THREE.SphereGeometry(R * 0.21, 12, 10), mat, sx * R * 0.34, y, z);
        lens.scale.set(1.15, 0.85, 0.35);
        g.add(lens);
      }
      g.add(mesh(new THREE.BoxGeometry(R * 0.26, R * 0.05, R * 0.05), mat, 0, y + R * 0.05, z));
    } else if (cfg.glassesStyle === 'round') {
      const mat = stdMat('#3c3226', { roughness: 0.4, metalness: 0.4 });
      for (const sx of [-1, 1]) {
        const ring = mesh(new THREE.TorusGeometry(R * 0.2, R * 0.028, 8, 20), mat, sx * R * 0.34, y, z);
        g.add(ring);
      }
      g.add(mesh(new THREE.BoxGeometry(R * 0.26, R * 0.045, R * 0.045), mat, 0, y + R * 0.02, z));
    } else if (cfg.glassesStyle === 'heart') {
      const mat = stdMat('#ff5c8a', { roughness: 0.4 });
      const geo = heartGeo();
      for (const sx of [-1, 1]) {
        const h = new THREE.Mesh(geo, mat);
        h.scale.setScalar(R * 0.045);
        h.rotation.z = Math.PI;
        h.position.set(sx * R * 0.35, y, z);
        h.castShadow = true;
        g.add(h);
      }
      g.add(mesh(new THREE.BoxGeometry(R * 0.24, R * 0.05, R * 0.05), mat, 0, y + R * 0.04, z));
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

    /* materials */
    const skinMat = track(stdMat(cfg.skin, { roughness: 0.75 }));
    const patternTex = track(paintPattern(cfg.topColor, cfg.pattern));
    const torsoMat = track(new THREE.MeshStandardMaterial({ map: patternTex, roughness: 0.9 }));
    const topPlainMat = track(stdMat(cfg.topColor));
    const bottomMat = track(stdMat(cfg.bottomColor));
    const shoeMat = track(stdMat(cfg.shoeColor, { roughness: 0.6 }));
    const soleMat = track(stdMat('#f5f2ec', { roughness: 0.5 }));

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

    const pelvis = mesh(new THREE.SphereGeometry(0.165 * tm, 18, 14), bottomMat, 0, 0.01, 0);
    pelvis.scale.set(1.2, 0.8, 1.0);
    hips.add(pelvis);

    function buildLeg(sx) {
      const leg = new THREE.Group();
      leg.position.set(sx * 0.115 * tm, -0.04, 0);
      const thigh = mesh(track(new THREE.CapsuleGeometry(0.088 * rm, 0.2, 6, 12)), bottomMat, 0, -0.17, 0);
      leg.add(thigh);
      if (cfg.bottom === 'cargo') {
        const pocket = mesh(track(new THREE.BoxGeometry(0.05, 0.09, 0.08)), track(stdMat(shade(cfg.bottomColor, -0.2))), sx * 0.1 * rm, -0.16, 0);
        leg.add(pocket);
      }
      const knee = new THREE.Group();
      knee.position.set(0, -0.34, 0);
      leg.add(knee);
      const shin = mesh(track(new THREE.CapsuleGeometry(0.072 * rm, 0.19, 6, 12)), shinMat, 0, -0.155, 0);
      knee.add(shin);
      if (cfg.bottom === 'joggers') {
        const cuff = mesh(track(new THREE.CylinderGeometry(0.078 * rm, 0.078 * rm, 0.05, 12)), soleMat, 0, -0.27, 0);
        knee.add(cuff);
      }
      const shoe = new THREE.Group();
      shoe.position.set(0, -0.345, -0.03);
      const body = mesh(track(new THREE.BoxGeometry(0.115, 0.075, 0.2)), shoeMat, 0, 0.015, 0);
      const sole = mesh(track(new THREE.BoxGeometry(0.12, 0.035, 0.21)), soleMat, 0, -0.04, 0);
      const toe = mesh(track(new THREE.SphereGeometry(0.055, 10, 8)), soleMat, 0, 0, -0.1);
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

    const torso = mesh(track(new THREE.CapsuleGeometry(0.185 * tm, 0.3, 8, 16)), torsoMat, 0, 0.26, 0);
    torso.rotation.y = Math.PI / 2; // seam to the back, pattern front
    spine.add(torso);

    if (cfg.top === 'hoodie') {
      const hood = mesh(track(new THREE.TorusGeometry(0.13 * tm, 0.055, 10, 18)), topPlainMat, 0, 0.44, 0.13 * tm);
      hood.rotation.x = 0.6;
      spine.add(hood);
      const pocket = mesh(track(new THREE.BoxGeometry(0.2 * tm, 0.1, 0.05)), track(stdMat(shade(cfg.topColor, -0.18))), 0, 0.1, -0.17 * tm);
      spine.add(pocket);
      for (const sx of [-1, 1]) {
        const str = mesh(track(new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6)), soleMat, sx * 0.06, 0.34, -0.185 * tm);
        spine.add(str);
      }
    } else if (cfg.top === 'jacket') {
      const zip = mesh(track(new THREE.BoxGeometry(0.024, 0.36, 0.02)), track(stdMat('#d8d8d8', { metalness: 0.5, roughness: 0.4 })), 0, 0.24, -0.187 * tm);
      spine.add(zip);
      const collar = mesh(track(new THREE.TorusGeometry(0.105 * tm, 0.035, 8, 16)), track(stdMat(shade(cfg.topColor, -0.25))), 0, 0.45, 0);
      collar.rotation.x = Math.PI / 2 - 0.25;
      spine.add(collar);
    }
    if (cfg.extra === 'chain') {
      const gold = track(stdMat('#e9b64c', { metalness: 0.75, roughness: 0.3 }));
      const chain = mesh(track(new THREE.TorusGeometry(0.13 * tm, 0.016, 8, 20)), gold, 0, 0.4, -0.05);
      chain.rotation.x = Math.PI / 2 - 1.15;
      spine.add(chain);
      const pendant = mesh(track(new THREE.SphereGeometry(0.035, 10, 8)), gold, 0, 0.3, -0.19 * tm);
      pendant.scale.set(1, 1.15, 0.5);
      spine.add(pendant);
    }

    /* ------ arms */
    function buildArm(sx) {
      const arm = new THREE.Group();
      arm.position.set(sx * (0.185 * tm + 0.02), 0.45, 0);
      const shoulder = mesh(track(new THREE.SphereGeometry(0.075 * rm, 12, 10)), upperArmMat, 0, -0.01, 0);
      arm.add(shoulder);
      const upper = mesh(track(new THREE.CapsuleGeometry(0.062 * rm, 0.15, 6, 12)), upperArmMat, 0, -0.13, 0);
      arm.add(upper);
      if (cfg.top === 'jacket') {
        const stripe = mesh(track(new THREE.CylinderGeometry(0.066 * rm, 0.066 * rm, 0.035, 10)), soleMat, 0, -0.12, 0);
        arm.add(stripe);
      }
      const elbow = new THREE.Group();
      elbow.position.set(0, -0.27, 0);
      arm.add(elbow);
      const fore = mesh(track(new THREE.CapsuleGeometry(0.054 * rm, 0.13, 6, 12)), forearmMat, 0, -0.11, 0);
      elbow.add(fore);
      const hand = mesh(track(new THREE.SphereGeometry(0.058 * rm, 10, 8)), skinMat, 0, -0.235, 0);
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
    const neckMesh = mesh(track(new THREE.CylinderGeometry(0.07 * rm, 0.08 * rm, 0.12, 12)), skinMat, 0, -0.02, 0);
    neck.add(neckMesh);

    const R = 0.28; // head radius
    const headGrp = new THREE.Group();
    headGrp.position.set(0, 0.14 + R * 0.6, 0);
    headGrp.scale.set(0.98, 1.06, 0.96);
    neck.add(headGrp);

    const faces = {
      open: track(paintFace(cfg, 'open')),
      closed: track(paintFace(cfg, 'closed')),
      dizzy: track(paintFace(cfg, 'dizzy')),
    };
    const headMat = track(new THREE.MeshStandardMaterial({ map: faces.open, roughness: 0.7 }));
    const head = mesh(track(new THREE.SphereGeometry(R, 32, 24)), headMat, 0, 0, 0);
    head.rotation.y = Math.PI / 2; // face texture center → -Z
    headGrp.add(head);

    // ears + nose
    for (const sx of [-1, 1]) {
      const ear = mesh(track(new THREE.SphereGeometry(R * 0.24, 10, 8)), skinMat, sx * R * 0.98, -0.01, 0);
      ear.scale.set(0.5, 1, 0.8);
      headGrp.add(ear);
    }
    const nose = mesh(track(new THREE.SphereGeometry(R * 0.13, 10, 8)), skinMat, 0, -R * 0.12, -R * 0.98);
    nose.scale.set(1, 0.85, 0.9);
    headGrp.add(nose);

    // facial hair
    const fhMat = track(stdMat(cfg.hairColor, { roughness: 0.95 }));
    if (cfg.facialHair === 'mustache') {
      const mo = mesh(track(new THREE.SphereGeometry(R * 0.3, 12, 8)), fhMat, 0, -R * 0.34, -R * 0.9);
      mo.scale.set(1.15, 0.32, 0.4);
      headGrp.add(mo);
    } else if (cfg.facialHair === 'goatee') {
      const gt = mesh(track(new THREE.SphereGeometry(R * 0.26, 12, 8)), fhMat, 0, -R * 0.78, -R * 0.62);
      gt.scale.set(0.9, 0.85, 0.65);
      headGrp.add(gt);
    } else if (cfg.facialHair === 'beard') {
      const chin = mesh(track(new THREE.SphereGeometry(R * 0.42, 14, 10)), fhMat, 0, -R * 0.72, -R * 0.42);
      chin.scale.set(1.35, 0.8, 0.9);
      headGrp.add(chin);
      for (const sx of [-1, 1]) {
        const jaw = mesh(track(new THREE.SphereGeometry(R * 0.3, 12, 8)), fhMat, sx * R * 0.62, -R * 0.42, -R * 0.42);
        jaw.scale.set(0.6, 0.9, 0.9);
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

    /* ------ public interface */
    const avatar = {
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
        if (this._face === name || !faces[name]) return;
        this._face = name;
        headMat.map = faces[name];
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
