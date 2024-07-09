import * as vscode from 'vscode';
import { MeshViewProvider } from './meshProvider';

export function activate(context: vscode.ExtensionContext): void {
  // register mesh provider
  context.subscriptions.push(MeshViewProvider.register(context));
}

// this method is called when your extension is deactivated
export function deactivate(): void { }
