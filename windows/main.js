'use strict';

/**
 * ShopTaBouffe — shell Windows (Electron).
 *
 * L'application est une fenêtre qui affiche l'app web servie par le backend
 * (https://chorizo.dpdns.org/). Aucune logique métier ici : on gère seulement
 * la fenêtre, les liens externes et la page « hors ligne ».
 */

const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');

const START_URL = process.env.STB_URL || 'https://chorizo.dpdns.org/app/';
const APP_NAME = 'ShopTaBouffe';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: '#0b0c11',
    title: APP_NAME,
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Liens target="_blank" (tickets GitHub, etc.) → navigateur système,
  // mais on garde dans l'app tout ce qui concerne notre domaine et l'OAuth.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(START_URL)) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Navigation sortante (OAuth GitHub/Google autorisés dans la fenêtre).
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = [
      START_URL,
      'https://github.com/',
      'https://accounts.google.com/',
      'https://oauth2.googleapis.com/',
      'https://api.github.com/',
    ];
    if (allowed.some((base) => url.startsWith(base))) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // Serveur injoignable → page locale avec bouton « Réessayer ».
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || !url.startsWith(START_URL)) return;
    if (code === -3) return; // annulé
    mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  });

  mainWindow.loadURL(START_URL);

  mainWindow.on('closed', () => { mainWindow = null; });
}

function buildMenu() {
  const template = [
    {
      label: 'Fichier',
      submenu: [
        { label: 'Actualiser', accelerator: 'CmdOrCtrl+R', click: () => mainWindow && mainWindow.webContents.reload() },
        { type: 'separator' },
        { label: 'Quitter', role: 'quit' },
      ],
    },
    {
      label: 'Affichage',
      submenu: [
        { label: 'Zoom avant', accelerator: 'CmdOrCtrl+Plus', click: () => mainWindow && mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() + 0.5) },
        { label: 'Zoom arrière', accelerator: 'CmdOrCtrl+-', click: () => mainWindow && mainWindow.webContents.setZoomLevel(mainWindow.webContents.getZoomLevel() - 0.5) },
        { label: 'Zoom par défaut', accelerator: 'CmdOrCtrl+0', click: () => mainWindow && mainWindow.webContents.setZoomLevel(0) },
        { type: 'separator' },
        { label: 'Plein écran', role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Aide',
      submenu: [
        {
          label: 'Signaler un problème',
          click: () => shell.openExternal('https://github.com/tear360/ShopTaBouffe/issues/new'),
        },
        {
          label: `À propos de ${APP_NAME}`,
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `À propos de ${APP_NAME}`,
              message: `${APP_NAME} 1.0.2`,
              detail: 'Application Windows de ShopTaBouffe.\nLe site : https://chorizo.dpdns.org/',
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Une seule instance : un second lancement remet la fenêtre au premier plan.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    app.setName(APP_NAME);
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
