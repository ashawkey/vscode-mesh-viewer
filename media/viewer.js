class FreeOrbitControls {

  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = true;
    this.target = new THREE.Vector3();
    this.center = this.target;

    this.rotateSpeed = 1.0;
    this.panSpeed = 1.0;
    this.zoomSpeed = 1.0;
    this.minDistance = 1e-6;
    this.maxDistance = Infinity;

    this._state = 'none';
    this._last = new THREE.Vector2();
    this._pointerId = null;
    this._touches = new Map();
    this._touchStartDistance = 0;
    this._touchStartCenter = new THREE.Vector2();

    this._onContextMenu = (e) => e.preventDefault();
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);

    this.domElement.style.touchAction = 'none';
    this.domElement.addEventListener('contextmenu', this._onContextMenu);
    this.domElement.addEventListener('pointerdown', this._onPointerDown);
    this.domElement.addEventListener('pointermove', this._onPointerMove);
    this.domElement.addEventListener('pointerup', this._onPointerUp);
    this.domElement.addEventListener('pointercancel', this._onPointerUp);
    this.domElement.addEventListener('wheel', this._onWheel, { passive: false });
  }

  update() {
    this.camera.lookAt(this.target);
    return false;
  }

  dispose() {
    this.domElement.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement.removeEventListener('pointerdown', this._onPointerDown);
    this.domElement.removeEventListener('pointermove', this._onPointerMove);
    this.domElement.removeEventListener('pointerup', this._onPointerUp);
    this.domElement.removeEventListener('pointercancel', this._onPointerUp);
    this.domElement.removeEventListener('wheel', this._onWheel);
    this._touches.clear();
  }

  _handlePointerDown(event) {
    if (!this.enabled) {
      return;
    }

    this.domElement.setPointerCapture(event.pointerId);

    if (event.pointerType === 'touch') {
      this._touches.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
      if (this._touches.size === 1) {
        this._state = 'touch-rotate';
        this._last.set(event.clientX, event.clientY);
      } else if (this._touches.size === 2) {
        const points = [...this._touches.values()];
        this._touchStartDistance = points[0].distanceTo(points[1]);
        this._touchStartCenter.set((points[0].x + points[1].x) * 0.5, (points[0].y + points[1].y) * 0.5);
        this._state = 'touch-dolly-pan';
      }
      return;
    }

    this._pointerId = event.pointerId;
    this._last.set(event.clientX, event.clientY);

    if (event.button === 0) {
      this._state = 'rotate';
    } else if (event.button === 1) {
      this._state = 'dolly';
    } else if (event.button === 2) {
      this._state = 'pan';
    } else {
      this._state = 'none';
    }
  }

  _handlePointerMove(event) {
    if (!this.enabled) {
      return;
    }

    if (event.pointerType === 'touch') {
      if (!this._touches.has(event.pointerId)) {
        return;
      }
      this._touches.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));

      if (this._touches.size === 1 && this._state === 'touch-rotate') {
        const p = [...this._touches.values()][0];
        const dx = p.x - this._last.x;
        const dy = p.y - this._last.y;
        this._rotate(dx, dy);
        this._last.copy(p);
      } else if (this._touches.size >= 2 && this._state === 'touch-dolly-pan') {
        const points = [...this._touches.values()];
        const distance = points[0].distanceTo(points[1]);
        const center = new THREE.Vector2((points[0].x + points[1].x) * 0.5, (points[0].y + points[1].y) * 0.5);

        if (this._touchStartDistance > 0) {
          const scale = this._touchStartDistance / distance;
          this._dollyByScale(scale);
        }

        const panDx = center.x - this._touchStartCenter.x;
        const panDy = center.y - this._touchStartCenter.y;
        this._pan(panDx, panDy);

        this._touchStartDistance = distance;
        this._touchStartCenter.copy(center);
      }
      return;
    }

    if (event.pointerId !== this._pointerId) {
      return;
    }

    const dx = event.clientX - this._last.x;
    const dy = event.clientY - this._last.y;
    this._last.set(event.clientX, event.clientY);

    if (this._state === 'rotate') {
      this._rotate(dx, dy);
    } else if (this._state === 'pan') {
      this._pan(dx, dy);
    } else if (this._state === 'dolly') {
      this._dollyByScale(Math.pow(0.95, this.zoomSpeed * dy * 0.05));
    }
  }

  _handlePointerUp(event) {
    if (event.pointerType === 'touch') {
      this._touches.delete(event.pointerId);
      if (this._touches.size === 0) {
        this._state = 'none';
      } else if (this._touches.size === 1) {
        this._state = 'touch-rotate';
        this._last.copy([...this._touches.values()][0]);
      }
      return;
    }

    if (event.pointerId === this._pointerId) {
      this._pointerId = null;
      this._state = 'none';
    }
  }

  _handleWheel(event) {
    if (!this.enabled) {
      return;
    }

    event.preventDefault();
    const scale = event.deltaY > 0 ? Math.pow(0.95, -this.zoomSpeed * 2.0) : Math.pow(0.95, this.zoomSpeed * 2.0);
    this._dollyByScale(scale);
  }

  _rotate(deltaX, deltaY) {
    const element = this.domElement;
    const yaw = -2 * Math.PI * (deltaX / element.clientHeight) * this.rotateSpeed;
    const pitch = -2 * Math.PI * (deltaY / element.clientHeight) * this.rotateSpeed;

    const offset = this.camera.position.clone().sub(this.target);
    const viewDir = this.target.clone().sub(this.camera.position).normalize();

    const right = new THREE.Vector3().crossVectors(viewDir, this.camera.up).normalize();
    if (right.lengthSq() < 1e-10) {
      right.set(1, 0, 0);
    }

    const qYaw = new THREE.Quaternion().setFromAxisAngle(this.camera.up.clone().normalize(), yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(right, pitch);
    const q = new THREE.Quaternion().multiplyQuaternions(qPitch, qYaw);

    offset.applyQuaternion(q);
    this.camera.up.applyQuaternion(q).normalize();

    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }

  _pan(deltaX, deltaY) {
    const element = this.domElement;
    const offset = this.camera.position.clone().sub(this.target);
    const targetDistance = offset.length() * Math.tan((this.camera.fov * 0.5) * Math.PI / 180.0);

    const panX = (2 * deltaX * targetDistance / element.clientHeight) * this.panSpeed;
    const panY = (2 * deltaY * targetDistance / element.clientHeight) * this.panSpeed;

    const viewDir = this.target.clone().sub(this.camera.position).normalize();
    const right = new THREE.Vector3().crossVectors(viewDir, this.camera.up).normalize();
    const up = this.camera.up.clone().normalize();

    const pan = right.multiplyScalar(-panX).add(up.multiplyScalar(panY));
    this.camera.position.add(pan);
    this.target.add(pan);
    this.center = this.target;
    this.camera.lookAt(this.target);
  }

  _dollyByScale(scale) {
    const offset = this.camera.position.clone().sub(this.target);
    let distance = offset.length() * scale;
    distance = Math.max(this.minDistance, Math.min(this.maxDistance, distance));

    offset.normalize().multiplyScalar(distance);
    this.camera.position.copy(this.target).add(offset);
    this.camera.lookAt(this.target);
  }
}

class Viewer {

  constructor() {
    
    // init params from vscode settings (see package.json and src/meshProvider.ts)
    this.params = JSON.parse(document.getElementById('vscode-3dviewer-data').getAttribute('data-settings'));
    
    // init renderer
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: 'high-performance', 
      precision: 'mediump', 
      alpha: true, 
      antialias: true,
      // logarithmicDepthBuffer: true,
    }); // antialias can be disabled to improve performance
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.autoClear = false;

    // fancy stuff
    // this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		// this.renderer.toneMappingExposure = 0.85;

    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.helper_clock = new THREE.Clock();
    this.mixer = null;
    this.meshObject = null;
    // this.meshObject = new THREE.Group();
    this.wireObject = null;
    this.pointObject = new THREE.Group();
    this.scene.background = new THREE.Color(this.params.backgroundColor);
    this.num_meshes = 0;
    this.num_vertices = 0;
    this.num_faces = 0;

    // light
    this.light = new THREE.HemisphereLight(0xcccccc, 0x333333, this.params.lightIntensity);
    this.scene.add(this.light);

    // point sprite
    this.sprite = new THREE.TextureLoader().load('three/textures/sprites/disc.png' );
    
    // load envmap
    let envloader = new THREE.CubeTextureLoader().setPath('three/textures/cube/Park2/');
    envloader.load( [ 'posx.jpg', 'negx.jpg', 'posy.jpg', 'negy.jpg', 'posz.jpg', 'negz.jpg' ], function ( textureCube ) {
    // set the environment map for the scene
    this.scene.environment = textureCube;
    // this.scene.background = textureCube;

    // load mesh and all other stuff after loading
    const fileExt = this.params.fileToLoad.split('.').pop().toLowerCase();
    let loader;
    if (fileExt === 'glb' || fileExt === 'gltf') {
      loader = new THREE.GLTFLoader();
    } else if (fileExt === 'fbx') {
      loader = new THREE.FBXLoader();
    } else if (fileExt === 'obj') {
      loader = new THREE.NGonOBJLoader();
    } else if (fileExt === 'ply') {
      loader = new THREE.PLYLoader();
    }

    loader.load(this.params.fileToLoad, function (object) {

      if (fileExt === 'glb' || fileExt === 'gltf') {        
        this.meshObject = object.scene; // Group
        if (object.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.meshObject);
          this.mixer.clipAction(object.animations[0]).play();
        }
      } else if (fileExt === 'fbx') {
        this.meshObject = object; // Group
        if (object.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.meshObject);
          this.mixer.clipAction(object.animations[0]).play();
        }
      } else if (fileExt === 'obj') {
        // object is an NGon
        const geometry = object.makeGeometry();

        // support vertex colors
        const material = new THREE.MeshStandardMaterial({
          vertexColors: geometry.attributes.color !== undefined,
          color: new THREE.Color(this.params.meshColor), // default grey
          metalness: this.params.metalness,
          roughness: this.params.roughness, 
          flatShading: this.params.flatShading,
          side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        });

        this.meshObject = new THREE.Group();
        this.meshObject.add(new THREE.Mesh(geometry, material));
        
        // specially handle ngon wireframe
        const wireGeometry = object.makeWireGeometry();
        const wireMaterial = new THREE.LineBasicMaterial({ 
            color: this.params.wireframeColor, 
            linewidth: this.params.wireframeWidth,
            transparent: true,
            // opacity: 0.8,
        });
        this.wireObject = new THREE.LineSegments(wireGeometry, wireMaterial);
        this.wireObject.position.copy(this.meshObject.position);
        

      } else if (fileExt === 'ply') {
        object.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(this.params.meshColor), // default grey
          metalness: this.params.metalness,
          roughness: this.params.roughness, 
          flatShading: this.params.flatShading,
          side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        });
        this.meshObject = new THREE.Group();
        this.meshObject.add(new THREE.Mesh(object, material));
      }

      // traverse and update mesh
      // console.log(this.meshObject);
      this.meshObject.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
          // make sure normal is good
          child.geometry.computeVertexNormals();
          // support multiple materials to switch
          child.default_material = child.material.clone();
          child.default_material.side = this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
          child.default_material.metalness = this.params.metalness;
          child.default_material.roughness = this.params.roughness;
          child.default_material.flatShading = this.params.flatShading;
          // sometimes the default material just break and become black, so we need to create a new one
          child.color_material = new THREE.MeshStandardMaterial({
            color: new THREE.Color(this.params.meshColor), // default grey
            metalness: this.params.metalness,
            roughness: this.params.roughness, 
            flatShading: this.params.flatShading,
            side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
          });
          child.normal_material = new THREE.MeshNormalMaterial({
            flatShading: this.params.flatShading, // use false for accurate normal map
            normalMapType: THREE.ObjectSpaceNormalMap,
            side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
          });
          child.depth_material = new THREE.MeshDepthMaterial({
            side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
          });
          // render mode initialization
          if (this.params.renderMode === 'normal') {
            child.material = child.normal_material;
          } else if (this.params.renderMode === 'depth') {
            child.material = child.depth_material;
          } else if (this.params.renderMode === 'color') {
            child.material = child.color_material;
          } else {
            child.material = child.default_material;
          }
          // update stats
          this.num_meshes++;
          this.num_vertices += child.geometry.attributes.position.count; // this is always num_faces * 3...
          if (child.geometry.index) {
            this.num_faces += child.geometry.index.count / 3;
          } else {
            this.num_faces += child.geometry.attributes.position.count / 3;
          }
        }
      }.bind(this));

      this.meshObject.visible = this.params.showMesh;
      this.scene.add(this.meshObject);

      // traverse and update points
      this.meshObject.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
          const point_geometry = new THREE.BufferGeometry();
          point_geometry.setAttribute('position', child.geometry.attributes.position);
          const point_material = new THREE.PointsMaterial({
            color: new THREE.Color(this.params.pointColor),
            size: this.params.pointSize,
            sizeAttenuation: true, 
            map: this.sprite, 
            alphaTest: 0.5, 
            transparent: true,
          })
          const points = new THREE.Points(point_geometry, point_material);
          this.pointObject.add(points);
        }
      }.bind(this));

      this.pointObject.visible = this.params.showPoints;
      this.scene.add(this.pointObject);

      // copy meshObject as wireframes (except obj which we specially processed earlier)
      if (fileExt !== 'obj') {
          this.wireObject = this.meshObject.clone();
          this.wireObject.traverse(function (child) {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: this.params.wireframeColor,
                flatShading: this.params.flatShading,
                side: THREE.DoubleSide, // wireframe is always double sided
                wireframe: true,
                wireframeLinewidth: this.params.wireframeWidth,
              });
            }
          }.bind(this));
      }
      this.wireObject.visible = this.params.showWireframe;
      this.scene.add(this.wireObject);

      // init geometry related params
      this.bbox = new THREE.Box3().setFromObject(this.scene);
      this.center = this.bbox.getCenter(new THREE.Vector3());
      
      var cx = (this.bbox.max.x - this.bbox.min.x);
      var cy = (this.bbox.max.y - this.bbox.min.y);
      var cz = (this.bbox.max.z - this.bbox.min.z);
      this.extent = Math.max(cx, Math.max(cy, cz));
      this.params.gridUnit = Math.pow(10, Math.floor(Math.log10(this.extent)));
    
      // init camera
      if (this.params.cameraNear < 0) {
        this.params.cameraNear = this.extent; // auto calculate suitable near
      }
      this.camera = new THREE.PerspectiveCamera(this.params.cameraFovy, window.innerWidth / window.innerHeight, this.params.cameraNear, this.params.cameraFar);

      // Place camera in front of the object (+Z), not on diagonal.
      // Distance is computed from FOV so the object fits the initial view.
      const fitDistance = (this.extent * 0.5) / Math.tan(THREE.MathUtils.degToRad(this.params.cameraFovy * 0.5));
      const cameraDistance = fitDistance * 1.2; // small margin
      var cameraPos = new THREE.Vector3(
        this.center.x,
        this.center.y,
        this.center.z + cameraDistance
      );
      this.camera.position.copy(cameraPos);
      this.camera.up.set(0, 1, 0);

      this.controls = new FreeOrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(this.center);
      this.controls.center = this.controls.target;
      this.controls.update();
      
      // init helpers
      this.axisHelper = new THREE.AxesHelper(this.extent);
      this.axisHelper.position.x += this.center.x - this.extent * 0.5;
      this.axisHelper.position.y += this.center.y - this.extent * 0.5;
      this.axisHelper.position.z += this.center.z - this.extent * 0.5;
      this.axisHelper.material.linewidth = 10;
      this.axisHelper.visible = this.params.showAxis;
      this.axisHelper.name = 'axisHelper';
      this.scene.add(this.axisHelper);
      
      this.gridHelper = new THREE.GridHelper(this.params.gridUnit * 10, 10);
      this.gridHelper.visible = this.params.showGrid;
      this.gridHelper.name = 'gridHelper';
      this.scene.add(this.gridHelper);

      // view helper
      this.viewHelper = new THREE.ViewHelper(this.camera, this.renderer.domElement);
      this.viewHelper.controls = this.controls;
      this.viewHelper.controls.center = this.controls.target;
      
      this.div_viewhelper = document.createElement('div');
      this.div_viewhelper.id = 'viewHelper';
      this.div_viewhelper.style.position = 'absolute';
      this.div_viewhelper.style.bottom = '0';
      this.div_viewhelper.style.right = '0';
      this.div_viewhelper.style.height = '128px';
      this.div_viewhelper.style.width = '128px';
      document.body.appendChild(this.div_viewhelper);
      this.div_viewhelper.addEventListener('pointerup', event => this.viewHelper.handleClick(event));

      // mesh stats
      this.div_stats = document.createElement('div');
      this.div_stats.id = 'stats';
      this.div_stats.style.position = 'absolute';
      this.div_stats.style.bottom = '0';
      this.div_stats.style.left = '0';
      this.div_stats.style.color = 'black';
      this.div_stats.style.margin = '10px';
      this.div_stats.textContent = `Meshes: ${this.num_meshes}, Vertices: ${this.num_vertices}, Faces: ${this.num_faces}`;
      document.body.appendChild(this.div_stats);

      // init GUI
      this.stats = new Stats();
      this.stats.showPanel(0);
      this.gui = new dat.GUI();
      this.gui.addColor(this.params, 'backgroundColor').name('Background color').onChange(v => this.scene.background = new THREE.Color(v));
      this.gui.add(this.params, 'lightIntensity', 0, 3).name('Light intensity').onChange(v => this.light.intensity = v);
      this.gui.add(this.params, 'cameraFovy', 0.001, 180).onChange(v => {this.camera.fov = v; this.camera.updateProjectionMatrix(); });
      this.gui.add(this.params, 'doubleSide').name('Double side').onChange(v => this.meshObject.traverse(function (child) { if (child instanceof THREE.Mesh) { child.material.side = v ? THREE.DoubleSide : THREE.FrontSide; child.material.needsUpdate = true; }}));
      this.gui.add(this.params, 'flatShading').name('Flat shading').onChange(v => this.meshObject.traverse(function (child) { if (child instanceof THREE.Mesh) { child.material.flatShading = v ? true : false; child.material.needsUpdate = true; }}));
      this.gui.add(this.params, 'metalness', 0, 1).name('Metalness').onChange(v => this.meshObject.traverse(function (child) { if (child instanceof THREE.Mesh) { child.material.metalness = v; }}));
      this.gui.add(this.params, 'roughness', 0, 1).name('Roughness').onChange(v => this.meshObject.traverse(function (child) { if (child instanceof THREE.Mesh) { child.material.roughness = v; }}));
      this.gui.add(this.params, 'cameraNear', 0.001, 10).name('Camera near').onChange(v => {this.camera.near = v; this.camera.updateProjectionMatrix(); });
      this.gui.add(this.params, 'cameraFar', 0.1, 1000).name('Camera far').onChange(v => {this.camera.far = v; this.camera.updateProjectionMatrix(); });
      this.gui.add(this.params, 'renderMode', ['default', 'color', 'normal', 'depth']).name('Render mode').onChange(v => this.meshObject.traverse(function (child) { if (child instanceof THREE.Mesh) { 
        if (v === 'color') {
          child.material = child.color_material;
        } else if (v === 'normal') {
          child.material = child.normal_material;
        } else if (v === 'depth') {
          child.material = child.depth_material;
        } else if (v === 'default') {
          child.material = child.default_material;
        }
      }}));
      if (this.mixer) {
        this.gui.add(this.params, 'playAnimation').name('Play animation').onChange(v => {v ? this.clock.start() : this.clock.stop();});
      }
      this.gui.add(this.params, 'showMesh').name('Show Mesh').onChange(v => this.meshObject.visible = v);
      this.gui.addColor(this.params, 'meshColor').name('Mesh color').onChange(v => this.meshObject.traverse(function (child) { if (child instanceof THREE.Mesh) { child.material.color = new THREE.Color(v); }}));
      this.gui.add(this.params, 'showWireframe').name('Show Wireframe').onChange(v => this.wireObject.visible = v);
      this.gui.addColor(this.params, 'wireframeColor').name('Wireframe color').onChange(v => this.wireObject.traverse(function (child) { if (child instanceof THREE.Mesh) { child.material.color = new THREE.Color(v); }}));
      this.gui.add(this.params, 'showPoints').name('Show Points').onChange(v => this.pointObject.visible = v);
      this.gui.addColor(this.params, 'pointColor').name('Point color').onChange(v => this.pointObject.traverse(function (child) { if (child instanceof THREE.Points) { child.material.color = new THREE.Color(v); }}));
      this.gui.add(this.params, 'pointSize', 0.001, 1).name('Point size').onChange(v => this.pointObject.traverse(function (child) { if (child instanceof THREE.Points) { child.material.size = v; }}));
      this.gui.add(this.params, 'showAxis').name('Show Axis').onChange(v => this.axisHelper.visible = v);
      this.gui.add(this.params, 'showGrid').name('Show Grid').onChange(v => this.gridHelper.visible = v);

      if (this.params.hideControlsOnStart) {
        this.gui.close();
      }

      // bind to DOM
      document.body.appendChild(this.renderer.domElement);
      document.body.appendChild(this.stats.domElement);
      window.addEventListener('resize', this.onWindowResize.bind(this), false);

      // start animation
      this.animate();

    }.bind(this));

    }.bind(this));

  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    if (this.mixer && this.params.playAnimation) {
      this.mixer.update(this.clock.getDelta());
    }
    if (this.viewHelper.animating) { 
      this.viewHelper.update(this.helper_clock.getDelta()); 
    }
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.viewHelper.render(this.renderer);
    this.stats.update();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

viewer = new Viewer();
