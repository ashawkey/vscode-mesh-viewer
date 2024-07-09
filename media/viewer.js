class Viewer {

  constructor() {
    
    // init params from vscode settings
    this.params = JSON.parse(document.getElementById('vscode-3dviewer-data').getAttribute('data-settings'));
    
    // init renderer
    this.renderer = new THREE.WebGLRenderer({alpha: true, antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    this.scene = new THREE.Scene();
    this.rootObject = null;
    this.wireObject = null;
    this.scene.background = new THREE.Color(this.params.backgroundColor);

    // light
    this.light = new THREE.HemisphereLight(0xaaaaaa, 0x333333, this.params.lightIntensity);
    this.scene.add(this.light);

    // load mesh and all other stuff after loading
    const fileExt = this.params.fileToLoad.split('.').pop().toLowerCase();
    let loader;
    if (fileExt === 'glb' || fileExt === 'gltf') {
      loader = new THREE.GLTFLoader();
    } else if (fileExt === 'obj') {
      loader = new THREE.OBJLoader();
    } else if (fileExt === 'ply') {
      loader = new THREE.PLYLoader();
    }

    loader.load(this.params.fileToLoad, function (object) {

      if (fileExt === 'glb' || fileExt === 'gltf') {        
        this.rootObject = object.scene;
      } else if (fileExt === 'obj') {
        this.rootObject = object;
      } else if (fileExt === 'ply') {
        object.computeVertexNormals();
        var material = new THREE.MeshStandardMaterial({
          color: 0xefefef,
          roughness: 0.1,
          flatShading: true,
          side: THREE.DoubleSide
        });
        this.rootObject = new THREE.Mesh(object, material);
      }
      this.rootObject.visible = this.params.showMesh;
      this.scene.add(this.rootObject);

      // traverse and set double side material
      this.rootObject.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
          child.material.side = THREE.DoubleSide;
        }
      }.bind(this));

      // copy rootObject as wireframes
      this.wireObject = this.rootObject.clone();
      this.wireObject.traverse(function (child) {
        if (child instanceof THREE.Mesh) {
          child.material = new THREE.MeshStandardMaterial({
            color: this.params.wireframeColor,
            roughness: 0.1,
            flatShading: true,
            side: THREE.DoubleSide,
            wireframe: true,
            wireframeLinewidth: this.params.wireframeWidth,
          });
        }
      }.bind(this));
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
      this.camera = new THREE.PerspectiveCamera(this.params.fovy, window.innerWidth / window.innerHeight, 0.1, 5000.0);
      var cameraPos = new THREE.Vector3(
        this.extent + this.center.x, 
        this.extent + this.center.y, 
        this.extent + this.center.z
      );
      this.camera.position.copy(cameraPos);
      this.camera.up.set(0, 1, 0);
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.target.copy(this.center);
      
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

      // init GUI
      this.stats = new Stats();
      this.stats.showPanel(0);
      this.gui = new dat.GUI();
      this.gui.addColor(this.params, 'backgroundColor').name('Background color').onChange(v => this.scene.background = new THREE.Color(v));
      this.gui.add(this.params, 'lightIntensity', 0, 3).name('Light intensity').onChange(v => this.light.intensity = v);
      this.gui.add(this.params, 'fovy', 0.001, 180).onChange(v => {this.camera.fov = v; this.camera.updateProjectionMatrix(); });
      this.gui.add(this.params, 'showAxis').name('showAxis').onChange(v => this.axisHelper.visible = v);
      this.gui.add(this.params, 'showGrid').name('showGrid').onChange(v => this.gridHelper.visible = v);
      this.gui.add(this.params, 'showMesh').name('showMesh').onChange(v => this.rootObject.visible = v);
      this.gui.add(this.params, 'showWireframe').name('showWireframe').onChange(v => this.wireObject.visible = v);
      this.gui.addColor(this.params, 'wireframeColor').name('Wireframe color').onChange(v => this.wireObject.traverse(function (child) { if (child instanceof THREE.Mesh) { child.material.color = new THREE.Color(v); }}));

      if (this.params.hideControlsOnStart) {
        this.gui.close();
      }

      // start animation
      this.animate();

      // bind to DOM
      document.body.appendChild(this.renderer.domElement);
      document.body.appendChild(this.stats.domElement);
      window.addEventListener('resize', this.onWindowResize.bind(this), false);

    }.bind(this));
    
    
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    this.stats.update();
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

viewer = new Viewer();
