// client/src/services/terminalConfig.js
const KEY = "sd_terminal_v1";

export function getTerminalConfig() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setTerminalConfig(config) {
  localStorage.setItem(KEY, JSON.stringify(config));
}

export function clearTerminalConfig() {
  localStorage.removeItem(KEY);
}