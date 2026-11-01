// Calls from the UI (window.gtt, preload.ts) into the main process, for the shell (ipc.ts) and the modules
// (modules.ts). Every call must come from the app's own page; its arguments are checked by the handler.

import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { fromApp } from './security';

/** Registers a call on an IPC channel; the returned function removes it again. */
export function handle(channel: string, handler: (...args: unknown[]) => unknown): () => void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!fromApp(event)) throw new Error('Not allowed');
    return handler(...args);
  });
  return () => ipcMain.removeHandler(channel);
}
