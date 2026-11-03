// ============================================================================
// SceneManager — renderer, camera, lighting rig, HDRI environment, shadows.
// ============================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RGBELoader }     from 'three/addons/loaders/RGBELoader.js';
import { Sky }            from 'three/addons/objects/Sky.js';

export class SceneManager {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace    = THREE.SRGBColorSpace;
    this.renderer.toneMapping         = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled   = true;
    this.renderer.shadowMap.type      = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xede9e2);

    this.camera = new THREE.PerspectiveCamera(
      45, canvas.clientWidth / canvas.clientHeight, 0.1, 100,
    );
    this.camera.position.set(2.4, 1.7, 3.2);
    this.camera.lookAt(0, 0.7, 0);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.06;
    this.controls.target.set(0, 0.7, 0);
    this.controls.minDistance    = 1.4;
    this.controls.maxDistance    = 8;
    this.controls.maxPolarAngle  = Math.PI / 2.05;

    this._pmrem = new THREE.PMREMGenerator(this.renderer);
    this._pmrem.compileEquirectangularShader();

    this._setupLights();
    this._setupGround();
    this._setupGarden();
    this._setupResize(canvas);
  }

  _setupLights() {
    this.hemi = new THREE.HemisphereLight(0xb8ccff, 0x2a1c10, 0.35);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff2d6, 2.4);
    this.sun.position.set(4, 6.5, 3.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near   = 0.5;
    this.sun.shadow.camera.far    = 22;
    this.sun.shadow.camera.left   = -4;
    this.sun.shadow.camera.right  =  4;
    this.sun.shadow.camera.top    =  4;
    this.sun.shadow.camera.bottom = -4;
    this.sun.shadow.bias          = -0.0004;
    this.sun.shadow.normalBias    = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.rim = new THREE.DirectionalLight(0x9fbcff, 0.6);
    this.rim.position.set(-4, 2.5, -3.5);
    this.scene.add(this.rim);
  }

  _setupGround() {
    const textureCanvas = document.createElement('canvas');
    textureCanvas.width = textureCanvas.height = 256;
    const context = textureCanvas.getContext('2d');
    const image = context.createImageData(256, 256);
    for (let index = 0; index < image.data.length; index += 4) {
      const variation = (Math.random() - 0.5) * 40;
      image.data[index] = 92 + variation;
      image.data[index + 1] = 126 + variation;
      image.data[index + 2] = 62 + variation * 0.6;
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    const grass = new THREE.CanvasTexture(textureCanvas);
    grass.wrapS = grass.wrapT = THREE.RepeatWrapping;
    grass.repeat.set(28, 28);
    grass.colorSpace = THREE.SRGBColorSpace;

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({
        color: 0xc3d39b,
        map: grass,
        roughness: 0.96,
        metalness: 0.0,
      }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    const sky = new Sky();
    sky.scale.setScalar(450000);
    const skyUniforms = sky.material.uniforms;
    skyUniforms.turbidity.value = 7;
    skyUniforms.rayleigh.value = 1.8;
    skyUniforms.mieCoefficient.value = 0.005;
    skyUniforms.mieDirectionalG.value = 0.82;
    const sunDirection = new THREE.Vector3().setFromSphericalCoords(
      1,
      THREE.MathUtils.degToRad(72),
      THREE.MathUtils.degToRad(205),
    );
    skyUniforms.sunPosition.value.copy(sunDirection);
    this.scene.add(sky);
    this.sun.position.copy(sunDirection).multiplyScalar(15);
    this.hemi.color.set(0xd9edff);
    this.hemi.groundColor.set(0x687448);
    this.hemi.intensity = 0.8;
    this.sun.color.set(0xffedcf);
    this.sun.intensity = 2.1;
    this.scene.fog = new THREE.Fog(0xc9dce6, 24, 72);
  }

  _setupGarden() {
    const dirt = new THREE.MeshStandardMaterial({ color: 0x9d8057, roughness: 1 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x79563a, roughness: 0.92 });
    const leafColors = [0x6a8e4d, 0x789b55, 0x587a43, 0x879e5b];
    const flowerColors = [0xf3d987, 0xe9a8ad, 0xf1e8d2, 0xc9b4e8];

    const pathCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.2, 0.018, 6.5),
      new THREE.Vector3(-2.6, 0.018, 4.8),
      new THREE.Vector3(-1.5, 0.018, 3.8),
      new THREE.Vector3(-0.2, 0.018, 3.2),
      new THREE.Vector3(1.1, 0.018, 2.3),
      new THREE.Vector3(1.8, 0.018, 0.9),
    ]);
    const pathPositions = [];
    const pathIndices = [];
    const pathSteps = 70;
    for (let step = 0; step <= pathSteps; step += 1) {
      const point = pathCurve.getPointAt(step / pathSteps);
      const tangent = pathCurve.getTangentAt(step / pathSteps);
      const sideX = -tangent.z * 0.27;
      const sideZ = tangent.x * 0.27;
      pathPositions.push(point.x + sideX, point.y, point.z + sideZ);
      pathPositions.push(point.x - sideX, point.y, point.z - sideZ);
      if (step < pathSteps) {
        const index = step * 2;
        pathIndices.push(index, index + 1, index + 2, index + 1, index + 3, index + 2);
      }
    }
    const pathGeometry = new THREE.BufferGeometry();
    pathGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pathPositions, 3));
    pathGeometry.setIndex(pathIndices);
    pathGeometry.computeVertexNormals();
    const pathMesh = new THREE.Mesh(pathGeometry, dirt);
    pathMesh.receiveShadow = true;
    this.scene.add(pathMesh);

    const stoneMaterial = new THREE.MeshStandardMaterial({ color: 0xb7b09d, roughness: 0.95 });
    for (let index = 0; index < 7; index += 1) {
      const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.07, 8), stoneMaterial);
      stone.position.set(-2.8 + index * 0.43, 0.035, 5.7 - index * 0.42);
      stone.rotation.y = Math.random() * Math.PI;
      stone.receiveShadow = true;
      this.scene.add(stone);
    }

    const treeMaterial = new THREE.MeshStandardMaterial({ color: 0x73543b, roughness: 0.92 });
    const trunkGeometry = new THREE.CylinderGeometry(0.16, 0.23, 1.7, 9);
    const canopyGeometry = new THREE.IcosahedronGeometry(0.92, 1);
    const treeLocations = [
      [-6.4, -5.2, 1.1], [-4.1, -7.0, 0.88], [0.2, -7.7, 1.15],
      [5.1, -6.5, 1.0], [7.0, -2.8, 0.88], [-7.1, 1.1, 0.9],
    ];
    for (const [x, z, scale] of treeLocations) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(trunkGeometry, treeMaterial);
      trunk.position.y = 0.85;
      trunk.castShadow = true;
      tree.add(trunk);
      for (let cluster = 0; cluster < 4; cluster += 1) {
        const canopy = new THREE.Mesh(
          canopyGeometry,
          new THREE.MeshStandardMaterial({
            color: leafColors[(cluster + Math.floor(Math.random() * leafColors.length)) % leafColors.length],
            roughness: 0.96,
            flatShading: true,
          }),
        );
        canopy.position.set(
          (Math.random() - 0.5) * 0.85,
          1.8 + Math.random() * 0.65,
          (Math.random() - 0.5) * 0.75,
        );
        canopy.scale.set(0.85 + Math.random() * 0.3, 0.8 + Math.random() * 0.35, 0.85);
        canopy.castShadow = true;
        tree.add(canopy);
      }
      tree.position.set(x, 0, z);
      tree.scale.setScalar(scale);
      this.scene.add(tree);
    }

    const shrubGeometry = new THREE.IcosahedronGeometry(0.34, 1);
    const shrubMaterials = leafColors.map((color) => new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      flatShading: true,
    }));
    for (let index = 0; index < 28; index += 1) {
      const angle = index / 28 * Math.PI * 2;
      const radius = 5.5 + Math.random() * 1.8;
      const shrub = new THREE.Mesh(shrubGeometry, shrubMaterials[index % shrubMaterials.length]);
      shrub.position.set(Math.cos(angle) * radius, 0.25, Math.sin(angle) * radius);
      shrub.scale.set(1.15, 0.9 + Math.random() * 0.4, 1.1);
      shrub.castShadow = true;
      this.scene.add(shrub);
    }

    const stemGeometry = new THREE.CylinderGeometry(0.012, 0.018, 0.22, 5);
    const stemMaterial = new THREE.MeshStandardMaterial({ color: 0x66834c, roughness: 1 });
    const flowerGeometry = new THREE.SphereGeometry(0.065, 9, 7);
    const flowerMaterial = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const stems = new THREE.InstancedMesh(stemGeometry, stemMaterial, 80);
    const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, 80);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < 80; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3.8 + Math.random() * 2.2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 0.65 + Math.random() * 0.65;
      dummy.position.set(x, height / 2, z);
      dummy.scale.set(1, height / 0.22, 1);
      dummy.rotation.y = angle;
      dummy.updateMatrix();
      stems.setMatrixAt(index, dummy.matrix);
      dummy.position.y = height;
      dummy.scale.setScalar(0.75 + Math.random() * 0.55);
      dummy.updateMatrix();
      flowers.setMatrixAt(index, dummy.matrix);
      flowers.setColorAt(index, new THREE.Color(flowerColors[index % flowerColors.length]));
    }
    stems.instanceMatrix.needsUpdate = true;
    flowers.instanceMatrix.needsUpdate = true;
    stems.castShadow = true;
    this.scene.add(stems, flowers);

    const fence = new THREE.Group();
    const postGeometry = new THREE.BoxGeometry(0.12, 0.72, 0.12);
    const railGeometry = new THREE.BoxGeometry(0.1, 0.1, 1);
    const makeFenceSide = (start, end, fixed, horizontal) => {
      const length = Math.abs(end - start);
      const count = Math.floor(length / 0.65);
      for (let index = 0; index <= count; index += 1) {
        const along = start + (end - start) * index / count;
        const post = new THREE.Mesh(postGeometry, wood);
        post.position.set(horizontal ? along : fixed, 0.36, horizontal ? fixed : along);
        post.castShadow = true;
        fence.add(post);
        if (index < count) {
          for (const height of [0.24, 0.49]) {
            const rail = new THREE.Mesh(railGeometry, wood);
            rail.position.set(
              horizontal ? along + (end - start) / count / 2 : fixed,
              height,
              horizontal ? fixed : along + (end - start) / count / 2,
            );
            if (!horizontal) rail.rotation.y = Math.PI / 2;
            fence.add(rail);
          }
        }
      }
    };
    makeFenceSide(-7, 7, -7, true);
    makeFenceSide(-7, 7, 7, true);
    makeFenceSide(-7, 7, -7, false);
    makeFenceSide(-7, 7, 7, false);
    this.scene.add(fence);

    const bowl = new THREE.Group();
    bowl.position.set(-2.25, 0, 1.45);
    const bowlBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.28, 0.15, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0x93aeb3,
        roughness: 0.3,
        clearcoat: 0.65,
      }),
    );
    bowlBody.position.y = 0.075;
    bowlBody.castShadow = true;
    bowl.add(bowlBody);
    const food = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x9c704b, roughness: 0.9 }),
    );
    food.position.set(0, 0.14, 0);
    food.scale.y = 0.32;
    bowl.add(food);
    this.scene.add(bowl);

    const bed = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.72, 0.18, 32),
      new THREE.MeshPhysicalMaterial({
        color: 0xc38a8c,
        roughness: 0.92,
        sheen: 0.45,
        sheenColor: 0xffd7df,
      }),
    );
    bed.position.set(2.15, 0.08, 1.55);
    bed.receiveShadow = true;
    bed.castShadow = true;
    this.scene.add(bed);

    const toy = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 20, 16),
      new THREE.MeshPhysicalMaterial({
        color: 0xd58b57,
        roughness: 0.32,
        clearcoat: 0.8,
      }),
    );
    toy.position.set(0.9, 0.14, -0.65);
    toy.castShadow = true;
    this.scene.add(toy);

    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 48),
      new THREE.MeshPhysicalMaterial({
        color: 0x8db7b7,
        roughness: 0.2,
        metalness: 0.05,
        transparent: true,
        opacity: 0.78,
        clearcoat: 0.9,
      }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(4.65, 0.015, -2.75);
    this.scene.add(pond);

    this.garden = {
      bounds: 3.1,
      toy,
      spots: {
        bowl: new THREE.Vector3(-1.65, 0, 1.45),
        bed: new THREE.Vector3(1.8, 0, 1.55),
        sunPatch: new THREE.Vector3(0, 0, -2.2),
      },
    };
  }

  /** Load HDR → prefiltered IBL. Also used as background for a photoreal look. */
  async loadEnvironment(hdriUrl) {
    const hdr = await new RGBELoader().loadAsync(hdriUrl);
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    const env = this._pmrem.fromEquirectangular(hdr).texture;
    this.scene.environment  = env;
    this.scene.background   = new THREE.Color(0xede9e2);
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 1.0;
    hdr.dispose();
  }

  _setupResize(canvas) {
    window.addEventListener('resize', () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
  }

  follow(target, deltaSeconds) {
    const desired = new THREE.Vector3(target.position.x, 0.72, target.position.z);
    const blend = 1 - Math.exp(-deltaSeconds * 2.2);
    const offset = desired.sub(this.controls.target).multiplyScalar(blend);
    this.controls.target.add(offset);
    this.camera.position.add(offset);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}