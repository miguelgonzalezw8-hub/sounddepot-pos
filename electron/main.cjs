const { app, BrowserWindow } = require("electron");
const path = require("path");

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    if (isDev) {
  win.loadURL("http://localhost:5173");
  // win.webContents.openDevTools({ mode: "detach" }); // <- keep commented unless you want it
} else {
  win.loadFile(path.join(__dirname, "../client/dist/index.html"));
}

  } else {
    win.loadFile(path.join(__dirname, "../client/dist/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
