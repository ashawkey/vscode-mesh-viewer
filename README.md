<p align="center">
    <picture>
    <img alt="logo" src="logo.webp" width="20%">
    </picture>
    </br>
    <b>VS Code Mesh Viewer</b>
</p>

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/kiui.mesh-viewer)](https://marketplace.visualstudio.com/items?itemName=kiui.mesh-viewer)
![Visual Studio Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/kiui.mesh-viewer)


This extension is modified from [vscode-3d-preview](https://github.com/tatsy/vscode-3d-preview) with the following features:
* Preview meshes in FBX/GLB/GLTF/OBJ/PLY formats with texture.
* Play FBX/GLB/GLTF animations.
* Default to white background.
* Depth/Normal rendering.
* Preview point clouds or mesh vertices.

### Install


Search in Marketplace: [mesh-viewer](https://marketplace.visualstudio.com/items?itemName=kiui.mesh-viewer).

<img src="assets/install.jpg" alt="install" width="300"/>

### Mesh preview

<img src="assets/quad_point.jpg" alt="quad_point" width="300"/>

Rendering quad or polygon faces (only for `obj` format).

<video controls>
  <source src="assets/demo.mp4" type="video/mp4">
</video>

https://github.com/ashawkey/vscode-mesh-viewer/assets/25863658/f12653eb-be65-43de-9f9e-97d89b96c7f5

Credits to ["Kgirls01" (https://skfb.ly/6CIGK) by nuulbee is licensed under CC Attribution-NonCommercial-NoDerivs (http://creativecommons.org/licenses/by-nc-nd/4.0/)](https://sketchfab.com/3d-models/kgirls01-d2f946f58a8040ae993cda70c97b302c).

![mesh](assets/demo.png)

### Configuration
The default value of GUI settings can be edited in vscode extension settings (`@ext:kiui.mesh-viewer` or just search `meshviewer`).

![settings](assets/setting.jpg)

Notes:
* `CameraNear`: -1 means we will auto-calculate a suitable value for better depth visualization, but it may lead to problems when zooming in.

### Development
Install `Node.js` and `npm` first, then clone this repo and:

```bash
# install dependencies
npm install 

# use F5 or the dubugger panel to start debugging (will open a new VSCode window with this extension enabled.)
# Help->Toggle Developer Tools (or Shift-Control-I) to see console output.

# publish to official vscode marketplace (requires vsce, a publisher as defined in package.json, and the personal access token)
# don't forget to update version in package.json
vsce publish

# publish to open vsx (e.g., to support cursor)
vsce package # will output a .vsix file
# then upload the .vsix file to https://open-vsx.org/, you'll need an eclipse account and sign many agreements to do this...
```

## Acknowledgements & Reference

* [vscode-3d-preview](https://github.com/tatsy/vscode-3d-preview)
* [vscode-3dviewer](https://github.com/stef-levesque/vscode-3dviewer)
* [vscode-pc-viewer](https://github.com/Obarads/vscode-pc-viewer)
* [three.js](https://threejs.org/)
