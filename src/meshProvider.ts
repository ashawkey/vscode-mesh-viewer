import * as vscode from 'vscode';
import * as path from 'path';
import { MeshDocument } from './meshDocument';
import { disposeAll, getNonce } from './utils';
import { DoubleSide } from 'three';

/**
 * provider for mesh viewers.
 */
export class MeshViewProvider implements vscode.CustomReadonlyEditorProvider<MeshDocument> {
  // register to subscriptions
  public static register(context: vscode.ExtensionContext): vscode.Disposable {
    const register = vscode.window.registerCustomEditorProvider(
      MeshViewProvider.viewType,
      new MeshViewProvider(context),
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
        supportsMultipleEditorsPerDocument: false
      }
    );
    return register;
  }

  // view type name
  private static readonly viewType = 'meshviewer.viewer';

  // tracks all known webviews
  private readonly webviews = new WebviewCollection();

  constructor(
    private readonly _context: vscode.ExtensionContext
  ) { }


  async openCustomDocument(
    uri: vscode.Uri,
    openContext: vscode.CustomDocumentOpenContext,
    token: vscode.CancellationToken
  ): Promise<MeshDocument> {
    const document = new MeshDocument(uri);
    const listeners: vscode.Disposable[] = [];

    listeners.push(document.onDidChangeDocument(e => {
      for (const webviewPanel of this.webviews.get(document.uri)) {
        this.postMessage(webviewPanel, 'update', {});
      }
    }));

    document.onDidDispose(() => disposeAll(listeners));

    return document;
  }

  async resolveCustomEditor(
    document: MeshDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    // add the webview to our internal set of active webviews
    this.webviews.add(document.uri, webviewPanel);

    // setup initial content for the webview
    webviewPanel.webview.options = {
      enableScripts: true,
    };
    webviewPanel.webview.html = this.getHtmlForWebview(webviewPanel.webview, document);

    webviewPanel.webview.onDidReceiveMessage(e => this.onMessage(document, e));

    if (document.uri.scheme === 'file' && vscode.workspace.getConfiguration('meshviewer').get('hotReload', true)) {
      const watcher = vscode.workspace.createFileSystemWatcher(document.uri.fsPath, true, false, true);

      watcher.onDidChange(() => webviewPanel.webview.postMessage('modelRefresh'));
      webviewPanel.onDidDispose(() => watcher.dispose());
    }

    webviewPanel.webview.onDidReceiveMessage(e => {
      if (e.type === 'ready') {
        this.postMessage(webviewPanel, 'init', {});
      }
    });
  }

  private getSettings(uri: vscode.Uri): string {
    const config = vscode.workspace.getConfiguration('meshviewer');
    const initialData = {
      fileToLoad: uri.toString(),
      hideControlsOnStart: config.get('hideControlsOnStart', false),
      cameraFovy: config.get('cameraFovy', 45),
      backgroundColor: config.get('backgroundColor', '#0b1447'),
      meshColor: config.get('meshColor', '#ffffff'),
      showMesh: config.get('showMesh', true),
      showWireframe: config.get('showWireframe', false),
      showGrid: config.get('showGrid', false),
      showAxis: config.get('showAxis', false),
      wireframeColor: config.get('wireframeColor', '#0000ff'),
      wireframeWidth: config.get('wireframeWidth', 1),
      lightIntensity: config.get('lightIntensity', 1),
      doubleSide: config.get('doubleSide', true),
      playAnimation: config.get('playAnimation', true),
      renderMode: config.get('renderMode', 'color'),
      cameraNear: config.get('cameraNear', -1),
      cameraFar: config.get('cameraFar', 1000),
    };
    return `<meta id="vscode-3dviewer-data" data-settings="${JSON.stringify(initialData).replace(/"/g, '&quot;')}">`;
  }

  private getMediaWebviewUri(webview: vscode.Webview, filePath: string): vscode.Uri {
    return webview.asWebviewUri(vscode.Uri.file(
      path.join(this._context.extensionPath, 'media', filePath)
    ));
  }

  private getScripts(webview: vscode.Webview, nonce: string): string {
    const scripts = [
      this.getMediaWebviewUri(webview, 'three/three.min.js'),
      this.getMediaWebviewUri(webview, 'three/dat.gui.min.js'),
      this.getMediaWebviewUri(webview, 'three/stats.min.js'),
      this.getMediaWebviewUri(webview, 'three/OrbitControls.js'),
      this.getMediaWebviewUri(webview, 'three/loaders/OBJLoader.js'),
      this.getMediaWebviewUri(webview, 'three/loaders/PLYLoader.js'),
      this.getMediaWebviewUri(webview, 'three/loaders/GLTFLoader.js'),
      this.getMediaWebviewUri(webview, 'three/loaders/FBXLoader.js'),
      this.getMediaWebviewUri(webview, 'three/fflate.min.js'),
      this.getMediaWebviewUri(webview, 'three/ViewHelper.js'),
      this.getMediaWebviewUri(webview, 'viewer.js'),
    ];
    return scripts.map(source => `<script nonce="${nonce}" src="${source}"></script>`).join('\n');
  }

  /**
   * get the static HTML used in our webviews.
   */
  private getHtmlForWebview(webview: vscode.Webview, document: MeshDocument): string {
    const fileToLoad = document.uri.scheme === 'file' ?
      webview.asWebviewUri(vscode.Uri.file(document.uri.fsPath)) :
      document.uri;

    const scriptUri = this.getMediaWebviewUri(webview, 'viewer.js');
    const styleUri = this.getMediaWebviewUri(webview, 'viewer.css');
    const mediaUri = this.getMediaWebviewUri(webview, '');
    const nonce = getNonce();

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src ${webview.cspSource} 'self' 'unsafe-eval' blob: data:; img-src ${webview.cspSource} 'self' 'unsafe-eval' blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'self' 'unsafe-eval' blob: data:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <base href="${mediaUri}/">
        <link href="${styleUri}" rel="stylesheet" />
        ${this.getSettings(fileToLoad)}

        <title>3D Mesh Viewer</title>
      </head>
      <body>
        ${this.getScripts(webview, nonce)}
      </body>
      </html>`;
  }

  private readonly _callbacks = new Map<number, (response: any) => void>();

  private postMessage(panel: vscode.WebviewPanel, type: string, body: any): void {
    panel.webview.postMessage({ type, body });
  }

  private onMessage(document: MeshDocument, message: any) {
    switch (message.type) {
      case 'response':
        const callback = this._callbacks.get(message.requestId);
        callback?.(message.body);
        return;
    }
  }
}

class WebviewCollection {
  private readonly _webviews = new Set<{
    readonly resource: string;
    readonly webviewPanel: vscode.WebviewPanel;
  }>();

  /**
   * Get all known webviews for a given uri.
   */
  public *get(uri: vscode.Uri): Iterable<vscode.WebviewPanel> {
    const key = uri.toString();
    for (const entry of this._webviews) {
      if (entry.resource === key) {
        yield entry.webviewPanel;
      }
    }
  }

  /**
   * Add a new webview to the collection.
   */
  public add(uri: vscode.Uri, webviewPanel: vscode.WebviewPanel) {
    const entry = { resource: uri.toString(), webviewPanel };
    this._webviews.add(entry);

    webviewPanel.onDidDispose(() => {
      this._webviews.delete(entry);
    });
  }
}
