// Tjek indholdsfil: node shared/laer/check.js shared/laer/content/<id>.txt
const fs = require("fs"); let u = -1; const per = [], bad = [];
fs.readFileSync(process.argv[2], "utf8").split("\n").map(l => l.trim()).filter(Boolean).forEach(l => {
  const k = l[0], f = l.slice(1).split("§").map(x => x.trim());
  if (k === "#") { u++; per.push([f[0], 0, 0]); return; }
  if (k === "!") { per[u][1]++; if (f.length !== 3) bad.push("kort: " + l.slice(0, 60)); return; }
  per[u][2]++; const need = { "?": 6, "=": 3, "_": 6, ">": 3, "@": 7 }[k];
  if (!need || f.length !== need) bad.push(`${k} har ${f.length} felter: ${l.slice(0, 70)}`);
  if (k === "=" && !/^(sand|falsk)$/.test(f[1])) bad.push("sand/falsk: " + l.slice(0, 50));
  if (k === "_" && !f[0].includes("___")) bad.push("mangler ___: " + l.slice(0, 50));
  if ((k === "?" || k === "_") && new Set(f.slice(1, 5)).size !== 4) bad.push("ens svar: " + l.slice(0, 50));
  if ((l.match(/`/g) || []).length % 2) bad.push("ulige antal `: " + l.slice(0, 50));
});
console.log(per.map(p => `${p[0]}: ${p[1]} kort, ${p[2]} spørgsmål${p[2] % 5 ? "  <-- ikke deleligt med 5" : ""}`).join("\n"));
console.log(bad.length ? "FEJL:\n" + bad.join("\n") : "OK");
