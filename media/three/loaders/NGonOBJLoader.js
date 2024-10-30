( function () {

/**
 * Class representing a mesh with N-sided polygons (ngons).
 */
class NGon {
  constructor(parameters = {}) {
    this.verts = parameters.verts || [];
    this.faces = parameters.faces || [];
    this.normals = [];
    this.colors = parameters.colors || [];
  }

  /**
   * Calculates vertex normals for smooth shading.
   */
  calculateNormals() {
    const verts = this.verts;
    const faces = this.faces;
    const vertCount = verts.length;

    // Initialize normals array
    this.normals = new Array(vertCount).fill(null).map(() => new THREE.Vector3());

    const vA = new THREE.Vector3();
    const vB = new THREE.Vector3();
    const vC = new THREE.Vector3();
    const cb = new THREE.Vector3();
    const ab = new THREE.Vector3();

    // Loop over all faces
    faces.forEach((face) => {
      const faceVerts = face.map((index) => verts[index]);

      // Triangulate face
      for (let i = 1; i < faceVerts.length - 1; i++) {
        vA.copy(faceVerts[0]);
        vB.copy(faceVerts[i]);
        vC.copy(faceVerts[i + 1]);

        cb.subVectors(vC, vB);
        ab.subVectors(vA, vB);
        cb.cross(ab);

        // Add face normal to each vertex normal
        this.normals[face[0]].add(cb);
        this.normals[face[i]].add(cb);
        this.normals[face[i + 1]].add(cb);
      }
    });

    // Normalize normals
    this.normals.forEach((normal) => normal.normalize());
  }

  /**
   * Generates a BufferGeometry from the ngon's data.
   * @param {Object} parameters - Optional parameters.
   * @returns {THREE.BufferGeometry}
   */
  makeGeometry(parameters = {}) {
    const flipWinding = parameters.flipWinding || false;

    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];

    // Triangulate faces and build geometry data
    this.faces.forEach((face) => {
      const faceIndices = face;
      const faceVertCount = faceIndices.length;

      // Triangulate face
      for (let i = 1; i < faceVertCount - 1; i++) {
        const a = faceIndices[0];
        const b = faceIndices[i];
        const c = faceIndices[i + 1];

        if (flipWinding) {
          indices.push(c, b, a);
        } else {
          indices.push(a, b, c);
        }
      }
    });

    // Build positions, normals, and colors arrays
    this.verts.forEach((vert, idx) => {
      positions.push(vert.x, vert.y, vert.z);

      if (this.normals.length > 0) {
        const normal = this.normals[idx];
        normals.push(normal.x, normal.y, normal.z);
      }

      if (this.colors.length > 0) {
        const color = this.colors[idx];
        colors.push(color.r, color.g, color.b);
      }
    });

    // Create BufferGeometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    if (normals.length > 0) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    } else {
      geometry.computeVertexNormals();
    }

    if (colors.length > 0) {
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    geometry.setIndex(indices);
  
    return geometry;
  }

  /**
   * Generates wireframe geometry from the ngon's data.
   * @returns {THREE.BufferGeometry}
   */
  makeWireGeometry() {
    const positions = [];

    this.faces.forEach((face) => {
      const faceIndices = face;
      const faceVertCount = faceIndices.length;

      for (let i = 0; i < faceVertCount; i++) {
        const a = faceIndices[i];
        const b = faceIndices[(i + 1) % faceVertCount];

        const vertA = this.verts[a];
        const vertB = this.verts[b];

        positions.push(vertA.x, vertA.y, vertA.z);
        positions.push(vertB.x, vertB.y, vertB.z);
      }
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    return geometry;
  }
}

/**
 * Custom OBJ loader that preserves n-gon faces.
 */
class NGonOBJLoader {
  constructor(manager) {
    this.manager = manager !== undefined ? manager : THREE.DefaultLoadingManager;
  }

  /**
   * Loads an OBJ file from a URL.
   * @param {string} url - URL to the OBJ file.
   * @param {function} onLoad - Callback when loading is complete.
   * @param {function} onProgress - Callback for progress events.
   * @param {function} onError - Callback for error events.
   */
  load(url, onLoad, onProgress, onError) {
    const loader = new THREE.FileLoader(this.manager);
    loader.setResponseType('text');
    loader.load(
      url,
      (text) => {
        try {
          onLoad(this.parse(text));
        } catch (error) {
          if (onError) {
            onError(error);
          } else {
            console.error(error);
          }
          this.manager.itemError(url);
        }
      },
      onProgress,
      onError
    );
  }

  /**
   * Parses OBJ file content and returns an NGon instance.
   * @param {string} text - OBJ file content.
   * @returns {NGon}
   */
  parse(text) {
    const verts = [];
    const faces = [];
    const colors = [];

    const lines = text.split('\n');

    const parseVertexIndex = (value, len) => {
      const index = parseInt(value, 10);
      return index >= 0 ? index - 1 : len + index;
    };

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }

      const tokens = line.split(/\s+/);
      const keyword = tokens[0];

      if (keyword === 'v') {
        // Vertex position (possibly with color)
        const x = parseFloat(tokens[1]);
        const y = parseFloat(tokens[2]);
        const z = parseFloat(tokens[3]);
        verts.push(new THREE.Vector3(x, y, z));

        // Handle vertex colors if present
        if (tokens.length >= 7) {
          const r = parseFloat(tokens[4]);
          const g = parseFloat(tokens[5]);
          const b = parseFloat(tokens[6]);
          colors.push(new THREE.Color(r, g, b));
        }
      } else if (keyword === 'f') {
        // Face definition
        const faceIndices = [];
        for (let j = 1; j < tokens.length; j++) {
          const vertexData = tokens[j].split('/');
          const vertexIndex = parseVertexIndex(vertexData[0], verts.length);
          faceIndices.push(vertexIndex);
        }
        faces.push(faceIndices);
      }
      // Handle other cases if needed (vn for normals, vt for UVs, etc.)
    }

    const ngon = new NGon({ verts, faces, colors });

    // Calculate normals
    ngon.calculateNormals();

    return ngon;
  }
}

THREE.NGon = NGon;
THREE.NGonOBJLoader = NGonOBJLoader;

} )();