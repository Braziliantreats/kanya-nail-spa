/* Green Rush — environment: sky + day/night cycle, lighting, mountains,
   clouds, stars, road, swaying hemp fields, farm props, ambient particles.
   The player stays near z=0; the world scrolls toward +z and recycles. */
(function () {
  'use strict';
  const GR = (window.GR = window.GR || {});
  const C = GR.CFG;

  /* merge a list of {geo, matrix} into one BufferGeometry (single material) */
  function mergeGeoms(list) {
    let pos = [], norm = [], uv = [];
    for (const { geo, matrix } of list) {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      g.applyMatrix4(matrix);
      pos.push(...g.getAttribute('position').array);
      norm.push(...g.getAttribute('normal').array);
      const u = g.getAttribute('uv');
      if (u) uv.push(...u.array);
      g.dispose();
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    if (uv.length) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return merged;
  }

  /* soft radial blob texture (clouds, particles, glows) */
  function blobTexture(px, inner, outer) {
    const { canvas, ctx } = GR.makeCanvas(px, px);
    const g = ctx.createRadialGradient(px / 2, px / 2, px * 0.05, px / 2, px / 2, px * 0.5);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, px, px);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* day/night palette keyframes (t: 0..1 around the cycle) */
  const STOPS = [
    { t: 0.00, sky: '#2f4f7f', hor: '#f2a86e', fog: '#dba173', sun: '#ffd9a0', sunI: 0.85, hemiS: '#9db4d6', hemiG: '#5d7a45', hemiI: 0.6, el: 0.35, night: 0 },
    { t: 0.28, sky: '#3d8bd4', hor: '#bfe3f0', fog: '#c6e0ea', sun: '#fff3d0', sunI: 1.25, hemiS: '#bcd8ee', hemiG: '#6f8f52', hemiI: 0.8, el: 1.05, night: 0 },
    { t: 0.55, sky: '#6b4b90', hor: '#ff9a55', fog: '#e8a06b', sun: '#ffb36b', sunI: 0.9, hemiS: '#c79ac2', hemiG: '#63764a', hemiI: 0.6, el: 0.3, night: 0 },
    { t: 0.78, sky: '#0b1329', hor: '#22345a', fog: '#141d33', sun: '#bcd0ff', sunI: 0.45, hemiS: '#3a4a6d', hemiG: '#22301f', hemiI: 0.42, el: 0.9, night: 1 },
  ];
  // prebuilt Color objects
  const PAL = STOPS.map((s) => ({
    t: s.t,
    sky: new THREE.Color(s.sky), hor: new THREE.Color(s.hor), fog: new THREE.Color(s.fog),
    sun: new THREE.Color(s.sun), sunI: s.sunI,
    hemiS: new THREE.Color(s.hemiS), hemiG: new THREE.Color(s.hemiG), hemiI: s.hemiI,
    el: s.el, night: s.night,
  }));

  function samplePalette(T, out) {
    let a = PAL[PAL.length - 1], b = PAL[0], span, k;
    for (let i = 0; i < PAL.length; i++) {
      const cur = PAL[i], nxt = PAL[(i + 1) % PAL.length];
      const end = nxt.t > cur.t ? nxt.t : nxt.t + 1;
      if (T >= cur.t && T < end) { a = cur; b = nxt; break; }
    }
    span = (b.t > a.t ? b.t : b.t + 1) - a.t;
    k = GR.smoothstep(GR.clamp((T - a.t + (T < a.t ? 1 : 0)) / span, 0, 1));
    out.sky.copy(a.sky).lerp(b.sky, k);
    out.hor.copy(a.hor).lerp(b.hor, k);
    out.fog.copy(a.fog).lerp(b.fog, k);
    out.sun.copy(a.sun).lerp(b.sun, k);
    out.hemiS.copy(a.hemiS).lerp(b.hemiS, k);
    out.hemiG.copy(a.hemiG).lerp(b.hemiG, k);
    out.sunI = GR.lerp(a.sunI, b.sunI, k);
    out.hemiI = GR.lerp(a.hemiI, b.hemiI, k);
    out.el = GR.lerp(a.el, b.el, k);
    out.night = GR.lerp(a.night, b.night, k);
  }

  /* ------------------------------------------------ road texture */
  function roadTexture() {
    const S = 512;
    const { canvas, ctx } = GR.makeCanvas(S, S);
    ctx.fillStyle = '#57524b';
    ctx.fillRect(0, 0, S, S);
    // speckle
    for (let i = 0; i < 900; i++) {
      const v = GR.randi(-16, 18);
      ctx.fillStyle = `rgba(${87 + v},${82 + v},${75 + v},0.6)`;
      ctx.fillRect(GR.rand(0, S), GR.rand(0, S), GR.rand(1, 3), GR.rand(1, 3));
    }
    // cracks
    ctx.strokeStyle = 'rgba(30,27,24,0.3)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      let x = GR.rand(0, S), y = 0;
      ctx.moveTo(x, y);
      while (y < S) { y += GR.rand(20, 60); x += GR.rand(-25, 25); ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // lane dividers (dashed) at ±1.15 of 7.6-wide road
    const laneX = (1.15 / 3.8) * (S / 2);
    ctx.fillStyle = '#d9b64f';
    for (const sx of [-1, 1]) {
      for (let y = 0; y < S; y += 84) ctx.fillRect(S / 2 + sx * laneX - 4, y, 8, 42);
    }
    // edge lines
    ctx.fillStyle = 'rgba(210,200,180,0.85)';
    const edgeX = (3.45 / 3.8) * (S / 2);
    ctx.fillRect(S / 2 - edgeX - 4, 0, 7, S);
    ctx.fillRect(S / 2 + edgeX - 3, 0, 7, S);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    tex.anisotropy = 8;
    return tex;
  }

  /* ------------------------------------------------ ridge silhouette */
  function ridgeGeometry(width, height, seed) {
    const pts = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const x = GR.lerp(-width / 2, width / 2, i / N);
      const h = height * (0.45 + 0.3 * Math.sin(i * 0.7 + seed) + 0.18 * Math.sin(i * 1.9 + seed * 2) + 0.07 * Math.sin(i * 3.7 + seed * 5));
      pts.push({ x, h: Math.max(4, h) });
    }
    const pos = [];
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[i + 1];
      pos.push(a.x, 0, 0, b.x, 0, 0, a.x, a.h, 0);
      pos.push(b.x, 0, 0, b.x, b.h, 0, a.x, a.h, 0);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  }

  /* ------------------------------------------------ sign textures */
  function billboardTexture() {
    const { canvas, ctx } = GR.makeCanvas(512, 256);
    ctx.fillStyle = '#8a6b48';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#f3ead6';
    ctx.fillRect(16, 16, 480, 224);
    ctx.fillStyle = '#2c5e34';
    ctx.font = 'bold 72px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('KAYA FARMS', 256, 105);
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillStyle = '#7a5b3a';
    ctx.fillText('FRESH AIR · 5 MI', 256, 205);
    GR.drawLeaf(ctx, 60, 130, 40, '#2c7a3f', -0.2);
    GR.drawLeaf(ctx, 452, 130, 40, '#2c7a3f', 0.2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  function neonTexture() {
    const { canvas, ctx } = GR.makeCanvas(512, 256);
    ctx.fillStyle = '#101418';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#39ff88';
    ctx.lineWidth = 4;
    ctx.strokeRect(14, 14, 484, 228);
    ctx.shadowColor = '#39ff88';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#a5ffcb';
    ctx.font = 'bold 84px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GREEN', 256, 110);
    ctx.fillText('RUSH', 256, 205);
    ctx.shadowBlur = 0;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ================================================================ */
  GR.World = class {
    constructor(scene, quality) {
      this.scene = scene;
      this.quality = quality || 'high';
      this.dayT = 0.29; // start mid-morning
      this.windT = 0;
      this.pal = {
        sky: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(),
        sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(),
        sunI: 1, hemiI: 1, el: 1, night: 0,
      };

      scene.fog = new THREE.Fog(0xc6e0ea, 45, 165);

      this._buildLights();
      this._buildSky();
      this._buildMountains();
      this._buildClouds();
      this._buildSegments();
      this._buildFeatures();
      this._buildParticles();
      this.setQuality(this.quality);
    }

    /* ------------------------------------------------------ lights */
    _buildLights() {
      this.hemi = new THREE.HemisphereLight(0xbcd8ee, 0x6f8f52, 0.8);
      this.scene.add(this.hemi);
      this.sun = new THREE.DirectionalLight(0xfff3d0, 1.2);
      this.sun.position.set(14, 32, 12);
      this.sun.castShadow = true;
      const sc = this.sun.shadow.camera;
      sc.left = -18; sc.right = 18; sc.top = 30; sc.bottom = -45;
      sc.near = 4; sc.far = 90;
      sc.updateProjectionMatrix();
      this.sun.shadow.mapSize.set(2048, 2048);
      this.sun.shadow.bias = -0.002;
      this.sun.target.position.set(0, 0, -12);
      this.scene.add(this.sun, this.sun.target);
    }

    /* ------------------------------------------------------ sky dome */
    _buildSky() {
      this.skyUniforms = {
        topColor: { value: new THREE.Color(0x3d8bd4) },
        bottomColor: { value: new THREE.Color(0xbfe3f0) },
        sunDir: { value: new THREE.Vector3(0.3, 0.6, -0.75).normalize() },
        sunColor: { value: new THREE.Color(0xfff3d0) },
        haze: { value: 0.35 },
      };
      const mat = new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          uniform vec3 topColor, bottomColor, sunColor;
          uniform vec3 sunDir;
          uniform float haze;
          varying vec3 vDir;
          void main() {
            float h = max(vDir.y, 0.0);
            vec3 col = mix(bottomColor, topColor, pow(h, 0.55));
            float d = max(dot(normalize(vDir), sunDir), 0.0);
            col += sunColor * (pow(d, 900.0) * 1.6 + pow(d, 24.0) * haze);
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      });
      this.skyMesh = new THREE.Mesh(new THREE.SphereGeometry(420, 28, 18), mat);
      this.skyMesh.renderOrder = -10;
      this.scene.add(this.skyMesh);

      // stars
      const starPos = [];
      for (let i = 0; i < 420; i++) {
        const a = GR.rand(0, GR.TAU), e = GR.rand(0.08, 1.35);
        const r = 400;
        starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
      }
      const starGeo = new THREE.BufferGeometry();
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
      this.starMat = new THREE.PointsMaterial({
        color: 0xdfe8ff, size: 2.2, sizeAttenuation: false,
        transparent: true, opacity: 0, fog: false, depthWrite: false,
      });
      this.stars = new THREE.Points(starGeo, this.starMat);
      this.scene.add(this.stars);
    }

    /* ------------------------------------------------------ mountains */
    _buildMountains() {
      this.mountainMats = [];
      const defs = [
        { w: 700, h: 65, z: -300, seed: 3.1, c: '#6a7f9f', mix: 0.55 },
        { w: 640, h: 42, z: -240, seed: 8.7, c: '#4d6b54', mix: 0.32 },
      ];
      for (const d of defs) {
        const mat = new THREE.MeshBasicMaterial({ color: d.c, fog: false });
        mat.baseColor = new THREE.Color(d.c);
        mat.fogMix = d.mix;
        this.mountainMats.push(mat);
        const m = new THREE.Mesh(ridgeGeometry(d.w, d.h, d.seed), mat);
        m.position.set(0, 0, d.z);
        this.scene.add(m);
      }
    }

    /* ------------------------------------------------------ clouds */
    _buildClouds() {
      this.cloudTex = blobTexture(128, 'rgba(255,255,255,0.9)', 'rgba(255,255,255,0)');
      this.cloudMat = new THREE.SpriteMaterial({ map: this.cloudTex, transparent: true, opacity: 0.75, fog: false, depthWrite: false });
      this.clouds = [];
      for (let i = 0; i < 12; i++) {
        const sp = new THREE.Sprite(this.cloudMat);
        const s = GR.rand(22, 52);
        sp.scale.set(s, s * GR.rand(0.35, 0.5), 1);
        sp.position.set(GR.rand(-180, 180), GR.rand(40, 90), GR.rand(-320, -140));
        sp.userData.drift = GR.rand(0.4, 1.4);
        this.clouds.push(sp);
        this.scene.add(sp);
      }
    }

    /* ------------------------------------------------------ segments */
    _buildSegments() {
      const L = C.segLen, N = C.segCount;
      this.segments = [];
      this.roadTex = roadTexture();
      const roadMat = new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.95 });
      const roadGeo = new THREE.PlaneGeometry(7.6, L);
      const grassMat = new THREE.MeshLambertMaterial({ color: 0x5d8544 });
      const grassGeo = new THREE.PlaneGeometry(260, L);
      const dirtMat = new THREE.MeshLambertMaterial({ color: 0x7d6a4f });
      const dirtGeo = new THREE.PlaneGeometry(1.7, L);
      const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });

      // plant crossed-plane geometry (unit height)
      const plantGeo = this._plantGeometry();
      this.plantTex = GR.plantTexture(256);
      this.windUniform = { value: 0 };
      const plantMat = new THREE.MeshLambertMaterial({ map: this.plantTex, alphaTest: 0.5, side: THREE.DoubleSide });
      const windU = this.windUniform;
      plantMat.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = windU;
        shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float wph = instanceMatrix[3][0] * 0.37 + instanceMatrix[3][2] * 0.23;
            transformed.x += sin(uTime * 1.7 + wph) * position.y * 0.09;
            transformed.z += cos(uTime * 1.25 + wph * 1.31) * position.y * 0.05;
          #endif`
        );
      };
      this.maxPlants = 30;

      // fence: merged posts + rails, one geometry reused by every segment
      const fenceParts = [];
      const post = new THREE.BoxGeometry(0.12, 1.0, 0.12);
      const rail = new THREE.BoxGeometry(0.06, 0.1, L);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < 8; i++) {
        m4.makeTranslation(0, 0.5, -L / 2 + (i + 0.5) * (L / 8));
        fenceParts.push({ geo: post, matrix: m4.clone() });
      }
      m4.makeTranslation(0, 0.82, 0);
      fenceParts.push({ geo: rail, matrix: m4.clone() });
      m4.makeTranslation(0, 0.45, 0);
      fenceParts.push({ geo: rail, matrix: m4.clone() });
      const fenceGeo = mergeGeoms(fenceParts);
      post.dispose(); rail.dispose();

      for (let i = 0; i < N; i++) {
        const seg = new THREE.Group();
        seg.position.z = -i * L + 6 * L; // tile from +180 back to -210 (recycle window)

        const road = new THREE.Mesh(roadGeo, roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.y = 0.02;
        road.receiveShadow = true;
        seg.add(road);

        const grass = new THREE.Mesh(grassGeo, grassMat);
        grass.rotation.x = -Math.PI / 2;
        grass.position.y = -0.02;
        grass.receiveShadow = true;
        seg.add(grass);

        for (const sx of [-1, 1]) {
          const dirt = new THREE.Mesh(dirtGeo, dirtMat);
          dirt.rotation.x = -Math.PI / 2;
          dirt.position.set(sx * 4.65, 0, 0);
          seg.add(dirt);
          const fence = new THREE.Mesh(fenceGeo, fenceMat);
          fence.position.set(sx * 5.6, 0, 0);
          fence.castShadow = false;
          seg.add(fence);
        }

        const plants = new THREE.InstancedMesh(plantGeo, plantMat, this.maxPlants);
        plants.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        plants.frustumCulled = false;
        seg.add(plants);
        seg.userData.plants = plants;
        this._scatterPlants(plants, this.maxPlants);

        this.segments.push(seg);
        this.scene.add(seg);
      }
    }

    _plantGeometry() {
      // two crossed quads, 1 unit tall, pivot at ground
      const pos = [], uv = [], norm = [];
      const quad = (rot) => {
        const c = Math.cos(rot), s = Math.sin(rot);
        const pts = [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 0], [0.5, 1], [-0.5, 1]];
        const uvs = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
        for (let i = 0; i < 6; i++) {
          const [x, y] = pts[i];
          pos.push(x * c, y, x * s);
          uv.push(uvs[i][0], uvs[i][1]);
          norm.push(-s, 0, c);
        }
      };
      quad(0);
      quad(Math.PI / 2);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      return geo;
    }

    _scatterPlants(inst, count) {
      const m4 = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const up = new THREE.Vector3(0, 1, 0);
      const pos = new THREE.Vector3(), scl = new THREE.Vector3();
      const L = C.segLen;
      for (let i = 0; i < inst.count; i++) {
        if (i >= count) {
          m4.makeScale(0, 0, 0);
          inst.setMatrixAt(i, m4);
          continue;
        }
        const side = i % 2 === 0 ? -1 : 1;
        const far = i % 5 === 0;  // every 5th plant sits deep in the field
        const hero = i % 7 === 3; // and some crowd right up against the fence
        const x = side * (hero ? GR.rand(4.9, 5.4) : far ? GR.rand(16, 60) : GR.rand(6.4, 15));
        const z = GR.rand(-L / 2, L / 2);
        const s = far ? GR.rand(1.8, 3.4) : hero ? GR.rand(1.4, 2.1) : GR.rand(0.9, 1.9);
        q.setFromAxisAngle(up, GR.rand(0, GR.TAU));
        pos.set(x, 0, z);
        scl.set(s, s, s);
        m4.compose(pos, q, scl);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
    }

    /* ------------------------------------------------------ farm props */
    _buildFeatures() {
      this.features = [];
      const span = C.segLen * C.segCount;

      const add = (obj, minX, maxX) => {
        obj.userData.rollX = () => {
          const side = Math.random() < 0.5 ? -1 : 1;
          obj.position.x = side * GR.rand(minX, maxX);
          obj.rotation.y = side > 0 ? GR.rand(-0.4, 0.4) + Math.PI : GR.rand(-0.4, 0.4);
        };
        obj.userData.rollX();
        obj.position.z = GR.rand(-span + 30, 0);
        this.features.push(obj);
        this.scene.add(obj);
      };

      // greenhouses
      const glassMat = new THREE.MeshLambertMaterial({ color: 0xcfe8dd, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
      const frameMat = new THREE.MeshLambertMaterial({ color: 0xe8e4da });
      for (let i = 0; i < 3; i++) {
        const gh = new THREE.Group();
        const roof = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 9, 14, 1, true, 0, Math.PI), glassMat);
        roof.rotation.z = Math.PI / 2;
        roof.rotation.y = Math.PI / 2;
        roof.position.y = 1.2;
        gh.add(roof);
        const base = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.3, 9), frameMat);
        base.position.y = 0.65;
        gh.add(base);
        add(gh, 12, 26);
      }

      // barns
      const barnMat = new THREE.MeshLambertMaterial({ color: 0x9c4a38 });
      const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a3a2e });
      for (let i = 0; i < 2; i++) {
        const barn = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(7, 4.4, 9), barnMat);
        body.position.y = 2.2;
        barn.add(body);
        for (const sx of [-1, 1]) {
          const slab = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.22, 9.6), roofMat);
          slab.rotation.z = sx * 0.6;
          slab.position.set(sx * 1.75, 5.45, 0);
          barn.add(slab);
        }
        const ridgeCap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 9.6), roofMat);
        ridgeCap.position.y = 6.55;
        barn.add(ridgeCap);
        add(barn, 18, 40);
      }

      // windmills (blades animate)
      this.windmills = [];
      const steelMat = new THREE.MeshLambertMaterial({ color: 0xb8bec4 });
      for (let i = 0; i < 2; i++) {
        const wm = new THREE.Group();
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.7, 12, 8), steelMat);
        tower.position.y = 6;
        wm.add(tower);
        const blades = new THREE.Group();
        blades.position.set(0, 12, 0.6);
        for (let b = 0; b < 4; b++) {
          const blade = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.6, 0.08), steelMat);
          blade.position.y = 2.3;
          const holder = new THREE.Group();
          holder.rotation.z = (b / 4) * GR.TAU;
          holder.add(blade);
          blades.add(holder);
        }
        wm.add(blades);
        wm.userData.blades = blades;
        this.windmills.push(wm);
        add(wm, 26, 60);
      }

      // billboard
      const bb = new THREE.Group();
      const bbMat = new THREE.MeshLambertMaterial({ map: billboardTexture() });
      const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 3.5, 0.2), bbMat);
      panel.position.y = 4.4;
      bb.add(panel);
      const legMat = new THREE.MeshLambertMaterial({ color: 0x6b543c });
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.5, 8), legMat);
        leg.position.set(sx * 2.4, 2.25, 0);
        bb.add(leg);
      }
      add(bb, 9, 14);

      // neon dispensary sign — glows at night
      const neon = new THREE.Group();
      const nTex = neonTexture();
      this.neonMat = new THREE.MeshStandardMaterial({ map: nTex, emissiveMap: nTex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6 });
      const nPanel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.6, 0.2), this.neonMat);
      nPanel.position.y = 3.6;
      neon.add(nPanel);
      const nLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.6, 8), legMat);
      nLeg.position.y = 1.3;
      neon.add(nLeg);
      add(neon, 8.5, 12);

      // MILE 420 marker
      const mileTex = (() => {
        const { canvas, ctx } = GR.makeCanvas(128, 160);
        ctx.fillStyle = '#1e6e46';
        ctx.fillRect(0, 0, 128, 160);
        ctx.strokeStyle = '#f4f1ea';
        ctx.lineWidth = 5;
        ctx.strokeRect(6, 6, 116, 148);
        ctx.fillStyle = '#f4f1ea';
        ctx.textAlign = 'center';
        ctx.font = 'bold 34px Arial, sans-serif';
        ctx.fillText('MILE', 64, 62);
        ctx.font = 'bold 52px Arial, sans-serif';
        ctx.fillText('420', 64, 122);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      })();
      const mile = new THREE.Group();
      const milePanel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.25, 0.08), new THREE.MeshLambertMaterial({ map: mileTex }));
      milePanel.position.y = 1.7;
      mile.add(milePanel);
      const milePost = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), legMat);
      milePost.position.y = 0.6;
      mile.add(milePost);
      add(mile, 5.6, 7);

      // hay bales + rocks near the road
      const hayMat = new THREE.MeshLambertMaterial({ color: 0xc9a862 });
      const rockMat = new THREE.MeshLambertMaterial({ color: 0x8d8a80 });
      for (let i = 0; i < 6; i++) {
        let obj;
        if (i % 2 === 0) {
          obj = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 12), hayMat);
          obj.rotation.z = Math.PI / 2;
          obj.position.y = 0.7;
        } else {
          obj = new THREE.Mesh(new THREE.SphereGeometry(GR.rand(0.4, 0.8), 7, 5), rockMat);
          obj.position.y = 0.25;
          obj.scale.y = 0.6;
        }
        obj.castShadow = true;
        const wrap = new THREE.Group();
        wrap.add(obj);
        add(wrap, 5.2, 8.5);
      }
    }

    /* ------------------------------------------------------ particles */
    _buildParticles() {
      this.maxParticles = 90;
      const pos = new Float32Array(this.maxParticles * 3);
      this.particleSeeds = [];
      for (let i = 0; i < this.maxParticles; i++) {
        pos[i * 3] = GR.rand(-11, 11);
        pos[i * 3 + 1] = GR.rand(0.4, 4.5);
        pos[i * 3 + 2] = GR.rand(-130, 5);
        this.particleSeeds.push(GR.rand(0, GR.TAU));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      this.particleTex = blobTexture(32, 'rgba(255,255,240,1)', 'rgba(255,255,240,0)');
      this.particleMat = new THREE.PointsMaterial({
        map: this.particleTex, size: 0.16, transparent: true, opacity: 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff8d8,
      });
      this.particles = new THREE.Points(geo, this.particleMat);
      this.particles.frustumCulled = false;
      this.scene.add(this.particles);
    }

    /* ------------------------------------------------------ quality */
    setQuality(q) {
      this.quality = q;
      const high = q === 'high';
      this.sun.castShadow = high;
      this.sun.shadow.mapSize.set(high ? 2048 : 1024, high ? 2048 : 1024);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
      const plantCount = high ? this.maxPlants : 14;
      for (const seg of this.segments) this._scatterPlants(seg.userData.plants, plantCount);
      this.particleCount = high ? this.maxParticles : 36;
      const parr = this.particles.geometry.getAttribute('position');
      for (let i = this.particleCount; i < this.maxParticles; i++) parr.setY(i, -50);
      parr.needsUpdate = true;
    }

    /* ------------------------------------------------------ frame */
    update(dt, speed) {
      const span = C.segLen * C.segCount;
      this.windT += dt;
      this.windUniform.value = this.windT;
      this.dayT = (this.dayT + dt / C.dayLength) % 1;

      // scroll segments. Recycle far behind the player (not at killZ): the
      // menu/customize cameras look toward +z, so a near recycle line would
      // pop in plain view — 170 is past the fog wall from every camera.
      const RECYCLE_Z = 170;
      for (const seg of this.segments) {
        seg.position.z += speed * dt;
        if (seg.position.z - C.segLen / 2 > RECYCLE_Z) {
          seg.position.z -= span;
          this._scatterPlants(seg.userData.plants, this.quality === 'high' ? this.maxPlants : 14);
        }
      }
      // scroll features
      for (const f of this.features) {
        f.position.z += speed * dt;
        if (f.position.z > RECYCLE_Z + 10) {
          f.position.z -= span + GR.rand(0, 40);
          f.userData.rollX();
        }
      }
      for (const wm of this.windmills) wm.userData.blades.rotation.z += dt * 1.3;

      // clouds
      for (const cl of this.clouds) {
        cl.position.x += cl.userData.drift * dt;
        if (cl.position.x > 200) cl.position.x = -200;
      }

      // particles: gentle float + scroll
      const parr = this.particles.geometry.getAttribute('position');
      for (let i = 0; i < this.particleCount; i++) {
        const s = this.particleSeeds[i];
        let z = parr.getZ(i) + speed * dt * 0.55;
        if (z > 6) z -= 140;
        parr.setZ(i, z);
        parr.setY(i, GR.clamp(parr.getY(i) + Math.sin(this.windT * 0.8 + s) * dt * 0.25, 0.3, 5));
        parr.setX(i, parr.getX(i) + Math.cos(this.windT * 0.5 + s * 2) * dt * 0.12);
      }
      parr.needsUpdate = true;

      /* ------------------ day/night cycle */
      const P = this.pal;
      samplePalette(this.dayT, P);
      this.scene.fog.color.copy(P.fog);
      this.skyUniforms.topColor.value.copy(P.sky);
      this.skyUniforms.bottomColor.value.copy(P.hor);
      this.skyUniforms.sunColor.value.copy(P.sun);
      this.skyUniforms.haze.value = 0.4 - P.night * 0.25;

      const az = -0.55;
      const el = P.el;
      const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      this.skyUniforms.sunDir.value.copy(dir);
      this.sun.position.copy(dir).multiplyScalar(46);
      this.sun.position.z += 4;
      this.sun.color.copy(P.sun);
      this.sun.intensity = P.sunI;
      this.hemi.color.copy(P.hemiS);
      this.hemi.groundColor.copy(P.hemiG);
      this.hemi.intensity = P.hemiI;

      this.starMat.opacity = P.night * 0.85;
      this.cloudMat.opacity = 0.75 - P.night * 0.45;
      this.cloudMat.color.setRGB(1 - P.night * 0.75, 1 - P.night * 0.72, 1 - P.night * 0.62);
      for (const mat of this.mountainMats) {
        mat.color.copy(mat.baseColor).lerp(P.fog, mat.fogMix + P.night * 0.15);
      }
      this.neonMat.emissiveIntensity = 0.25 + P.night * 1.9;
      // fireflies at night, pollen by day
      this.particleMat.color.setStyle(P.night > 0.5 ? '#d8ff7e' : '#fff8d8');
      this.particleMat.opacity = 0.18 + P.night * 0.65;
      this.particleMat.size = 0.16 + P.night * 0.1;
    }
  };
})();
