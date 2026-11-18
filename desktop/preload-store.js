// Giver butikssiden samme "Android"-bro som på telefonen – bare til PC.
const { ipcRenderer } = require("electron");

const RAW = "https://raw.githubusercontent.com/Lucas050908/Appstore-/main/store/";
let byPkg = {};

window.DESKTOP = true;
window.Android = {
  assetBase: () => RAW,
  appVersion: () => ipcRenderer.sendSync("version") + " (PC)",
  setSystemBars: () => {},
  loadCatalog: () => {
    ipcRenderer.invoke("catalog").then(({ json, cached }) => {
      if (!json) { window.onCatalogError && window.onCatalogError(); return; }
      const d = JSON.parse(json);
      byPkg = {};
      for (const a of d.apps || []) {
        if (a.pkg === "dk.lucas.appstore") { a.hidden = true; continue; }
        if (a.web) { a.download = "web"; byPkg[a.pkg] = a; } else a.download = "";
      }
      window.onCatalog && window.onCatalog(JSON.stringify(d), cached ? "1" : "0");
    }).catch(() => window.onCatalogError && window.onCatalogError());
  },
  installedVersion: pkg => (byPkg[pkg] ? byPkg[pkg].version : ""),
  openApp: pkg => {
    const a = byPkg[pkg]; if (!a) return false;
    ipcRenderer.send("open-app", { id: a.id, name: a.name, web: a.web, icon: a.icon });
    return true;
  },
  shortcut: id => {
    const a = Object.values(byPkg).find(x => x.id === id); if (!a) return;
    ipcRenderer.invoke("shortcut", { id: a.id, name: a.name, icon: a.icon, tagline: a.tagline }).then(msg => window.toast && window.toast(msg));
  },
  install: (id) => { setTimeout(() => window.onDownloadDone && window.onDownloadDone(id, "0", "Kun til Android"), 10); }
};
