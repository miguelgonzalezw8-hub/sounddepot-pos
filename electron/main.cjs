const { app, BrowserWindow } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;

let splashWin = null;

function createSplash() {
  splashWin = new BrowserWindow({
    width: 520,
    height: 320,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    center: true,
    show: false,
    backgroundColor: "#0b1220",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  splashWin.loadFile(path.join(__dirname, "splash.html"));

  splashWin.once("ready-to-show", () => {
    if (splashWin) splashWin.show();
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    show: false, // ✅ don’t show until ready, so splash is seen first
    backgroundColor: "#0b1220",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    // win.webContents.openDevTools({ mode: "detach" }); // <- keep commented unless you want it
  } else {
    win.loadFile(path.join(__dirname, "../client/dist/index.html"));
  }

  win.once("ready-to-show", () => {
    win.show();

    if (splashWin) {
      splashWin.close();
      splashWin = null;
    }
  });
}

app.whenReady().then(() => {
  createSplash();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSplash();
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
