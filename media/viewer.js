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

    this.scene = new THREE.Scene();
    this.clock = new THREE.Clock();
    this.helper_clock = new THREE.Clock();
    this.mixer = null;
    this.group = null;
    this.meshObject = new THREE.Group();
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
        this.group = object.scene; // Group
        if (object.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.group);
          this.mixer.clipAction(object.animations[0]).play();
        }
      } else if (fileExt === 'fbx') {
        this.group = object; // Group
        if (object.animations.length > 0) {
          this.mixer = new THREE.AnimationMixer(this.group);
          this.mixer.clipAction(object.animations[0]).play();
        }
      } else if (fileExt === 'obj') {
        // object is an NGon
        const geometry = object.makeGeometry();
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(this.params.meshColor), // default grey
          roughness: 0.1,
          flatShading: true,
          side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        });
        this.group = new THREE.Mesh(geometry, material);
        
        // specially handle ngon wireframe
        const wireGeometry = object.makeWireGeometry();
        const wireMaterial = new THREE.LineBasicMaterial({ 
            color: this.params.wireframeColor, 
            linewidth: this.params.wireframeWidth,
            transparent: true,
            // opacity: 0.8,
        });
        this.wireObject = new THREE.LineSegments(wireGeometry, wireMaterial);
        this.wireObject.position.copy(this.group.position);
        

      } else if (fileExt === 'ply') {
        object.computeVertexNormals();
        const material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(this.params.meshColor), // default grey
          roughness: 0.1,
          flatShading: true,
          side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
        });
        this.group = new THREE.Mesh(object, material);
      }

      // traverse and update mesh and points
      this.group.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
          child.material.side = this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide;
          child.material.color = new THREE.Color(this.params.meshColor);
          // support multiple materials to switch
          child.color_material = child.material;
          child.normal_material = new THREE.MeshNormalMaterial({
            side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
          });
          child.depth_material = new THREE.MeshDepthMaterial({
            side: this.params.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
          });
          // update stats
          this.num_meshes++;
          this.num_vertices += child.geometry.attributes.position.count; // this is always num_faces * 3...
          if (child.geometry.index) {
            this.num_faces += child.geometry.index.count / 3;
          } else {
            this.num_faces += child.geometry.attributes.position.count / 3;
          }
          this.meshObject.add(child);
          // also copy mesh as points
          var point_material = new THREE.PointsMaterial({
            color: new THREE.Color(this.params.pointColor),
            size: this.params.pointSize,
            sizeAttenuation: true, 
            map: this.sprite, 
            alphaTest: 0.5, 
            transparent: true,
          })
          // point_material.color.setHSL( 1.0, 0.3, 0.7, THREE.SRGBColorSpace );
          var points = new THREE.Points(child.geometry, point_material);
          this.pointObject.add(points);
        } else if (child instanceof THREE.Points) {
          child.material.color = new THREE.Color(this.params.pointColor);
          child.material.size = this.params.pointSize;
          this.pointObject.add(child);
        }
      }.bind(this));

      this.meshObject.visible = this.params.showMesh;
      this.scene.add(this.meshObject);

      this.pointObject.visible = this.params.showPoints;
      this.scene.add(this.pointObject);

      // copy meshObject as wireframes (except obj which we specially processed earlier)
      if (fileExt !== 'obj') {
          this.wireObject = this.meshObject.clone();
          this.wireObject.traverse(function (child) {
            if (child instanceof THREE.Mesh) {
              child.material = new THREE.MeshStandardMaterial({
                color: this.params.wireframeColor,
                roughness: 0.1,
                flatShading: true,
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
      var cameraPos = new THREE.Vector3(
        this.extent + this.center.x, 
        this.extent + this.center.y, 
        this.extent + this.center.z
      );
      this.camera.position.copy(cameraPos);
      this.camera.up.set(0, 1, 0);
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(this.center);
      this.controls.enableDamping = true;
      
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
      this.gui.add(this.params, 'doubleSide').name('Double side').onChange(v => this.meshObject.traverse(function (child) { if (child instanceof THREE.Mesh) { child.material.side = v ? THREE.DoubleSide : THREE.FrontSide; }}));
      this.gui.add(this.params, 'cameraNear', 0.001, 10).name('Camera near').onChange(v => {this.camera.near = v; this.camera.updateProjectionMatrix(); });
      this.gui.add(this.params, 'cameraFar', 0.1, 1000).name('Camera far').onChange(v => {this.camera.far = v; this.camera.updateProjectionMatrix(); });
      this.gui.add(this.params, 'renderMode', ['color', 'normal', 'depth']).name('Render mode').onChange(v => this.meshObject.traverse(function (child) { if (child instanceof THREE.Mesh) { 
        if (v === 'color') {
          child.material = child.color_material;
        } else if (v === 'normal') {
          child.material = child.normal_material;
        } else if (v === 'depth') {
          child.material = child.depth_material;
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
