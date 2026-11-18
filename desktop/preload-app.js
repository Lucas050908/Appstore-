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
  hasPerm: name => ["notifications", "camera", "mic"].includes(name),
  requestPerm: name => ipcRenderer.send("app-perm", name),
  openSettings: () => {},
  location: () => {
    const fail = () => window.onLocationError && window.onLocationError("off");
    if (!navigator.geolocation) return fail();
    navigator.geolocation.getCurrentPosition(
      p => window.onLocation && window.onLocation(String(p.coords.latitude), String(p.coords.longitude), String(p.coords.accuracy)),
      fail, { timeout: 8000, maximumAge: 1800000 });
  }
};

// Lokal AI: den rigtige AI-motor kører i programmet (llama.cpp), ikke i browseren.
if (ID === "lokal-ai") {
  const S = (fn, ...a) => ipcRenderer.sendSync("ai-sync", fn, ...a);
  const A = (fn, ...a) => ipcRenderer.send("ai-async", fn, ...a);
  window.Native = {
    info: () => S("info"), models: () => S("models"), downloads: () => S("downloads"),
    download: (u, f) => S("download", u, f), cancelDownload: id => S("cancelDownload", String(id)),
    deleteModel: f => S("deleteModel", f), lastModel: () => S("lastModel"),
    load: (f, c, t) => A("load", f, c, t), unload: () => A("unload"),
    chat: (j, t, m) => A("chat", j, t, m), stop: () => A("stop"),
    importModel: () => A("importModel"), cancelImport: () => A("cancelImport"),
    copy: t => ipcRenderer.send("app-copy", String(t)),
    share: t => { ipcRenderer.send("app-copy", String(t)); ipcRenderer.send("app-toast", "Kopieret – sæt det ind, hvor du vil dele det"); }
  };
}
