// "App"-broen for apps, der kører i et vindue på PC – samme navne som på Android.
const { ipcRenderer } = require("electron");

const arg = n => (process.argv.find(a => a.startsWith("--" + n + "=")) || "").slice(n.length + 3);
const ID = arg("lapp-id") || "app";
const NAME = decodeURIComponent(arg("lapp-name") || ID);
const info = () => ({ id: ID, name: NAME, web: location.href.split("#")[0] });

window.DESKTOP = true;
window.App = {
  version: () => ipcRenderer.sendSync("version"),
  load: key => ipcRenderer.sendSync("app-load", ID, key),
  save: (key, data) => ipcRenderer.sendSync("app-save", ID, key, String(data)),
  share: (name, mime, text) => ipcRenderer.send("app-share", name, mime, String(text)),
  shareText: text => { ipcRenderer.send("app-copy", text); ipcRenderer.send("app-toast", "Kopieret til udklipsholderen"); },
  copy: text => ipcRenderer.send("app-copy", text),
  openUrl: url => ipcRenderer.send("open-external", url),
  pickFile: () => ipcRenderer.send("app-pick"),
  haptic: () => {},
  toast: text => ipcRenderer.send("app-toast", text),
  keepAwake: on => ipcRenderer.send("app-awake", !!on),
  setSystemBars: () => {},
  widget: () => {},
  schedule: (id, at, title, text, hash) => ipcRenderer.send("app-schedule", info(), id, at, title, text, hash),
  cancel: id => ipcRenderer.send("app-cancel", ID, id),
  hasPerm: name => name === "notifications",
  requestPerm: name => ipcRenderer.send("app-perm", name),
  openSettings: () => {},
  location: () => ipcRenderer.send("app-location")
};
