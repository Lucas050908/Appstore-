// Browsertest af Slurk gennem den rigtige brugerflade (telefonskærm 390×844 og 320×568).
// Kør: node apps/slurk/test/ui.mjs [mappe til skærmbilleder]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire("/opt/npm-tools/node_modules/");
const { chromium } = require("playwright");
const here = path.dirname(fileURLToPath(import.meta.url)), assets = path.join(here, "../app/src/main/assets");
const shots = process.argv[2] || "";
const PORT = 8791, URL = `http://127.0.0.1:${PORT}/index.html`;
const srv = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: assets, stdio: "ignore" });
await new Promise(r => setTimeout(r, 900));

let pass = 0, fail = 0; const errors = [];
const ok = (c, name, extra = "") => { if (c) pass++; else { fail++; console.log("FEJL:", name, extra); } };
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error" && !m.text().includes("404")) errors.push("console: " + m.text()); });
page.on("response", r => { if (r.status() >= 400 && !r.url().endsWith("/favicon.ico")) errors.push(r.status() + " " + r.url()); });
const shot = async n => { if (shots) { await page.waitForTimeout(450); await page.screenshot({ path: path.join(shots, n + ".png") }); } };
const txt = sel => page.locator(sel).first().innerText();
const tap = sel => page.locator(sel).first().click();
const footBtn = label => page.locator("#stFoot button", { hasText: label }).first();
const noOverflow = async name => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && [...document.querySelectorAll("#stage.on .wrap > *, .screen.on > *")].every(e => { const r = e.getBoundingClientRect(); return r.left >= -8 && r.right <= innerWidth + 8; })), "ingen vandret overløb: " + name);
const cardVal = async () => page.evaluate(() => { const l = document.querySelector("#stBody .pcard").getAttribute("aria-label").split(" ")[1]; return l === "A" ? 14 : l === "K" ? 13 : l === "Q" ? 12 : l === "J" ? 11 : +l; });
const addP = async n => { await page.fill("#pn", n); await page.keyboard.press("Enter"); };

await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload();
/* 1 forside */
ok(await page.locator(".game").count() === 8, "8 spil på forsiden");
ok(await page.locator(".tip").count() === 1, "tip om spillere vises uden spillere");
ok((await page.locator(".game .hand").allInnerTexts()).join("|") === "Fest|Jeg har aldrig|Mest tilbøjelig|Kongekort|Højere eller lavere|Meyer|Bomben|Flasken", "spillenes navne på forsiden");
ok(await page.locator(".game.off").count() === 2, "Fest og Meyer er dæmpet uden spillere");
ok((await txt("#subtitle")).includes("Ingen spillere"), "undertitel uden spillere");
await noOverflow("forside"); await shot("01-forside-tom");
/* 2 Fest uden spillere -> Spillere */
await tap('.game[data-g="fest"]');
ok(await page.locator("#s-folk.on").count() === 1 && (await txt("#toast")).includes("mindst 2"), "Fest uden spillere sender til Spillere");
ok(!(await page.locator("#stage.on").count()), "scenen åbner ikke");
/* 3 spillere */
await addP("Ida"); await addP("  Bo  "); await tap("#pa");
ok((await txt("#toast")).includes("Skriv et navn"), "tomt navn afvises");
await addP("ida"); ok((await txt("#toast")).includes("allerede"), "dublet afvises");
await addP("<img src=x onerror=alert(1)>");
ok(await page.locator(".pl").count() === 3 && await page.locator(".pl img").count() === 0, "navne med HTML vises som tekst");
ok((await page.locator(".pl span").nth(2).innerText()).startsWith("<img"), "HTML-navn står som tekst");
await page.locator(".pl button").nth(2).click(); ok(await page.locator(".pl").count() === 2, "spiller fjernet");
await page.locator("#toast button").click(); ok(await page.locator(".pl").count() === 3, "fortryd fjernelse");
await page.locator(".pl button").nth(2).click();
for (const n of ["Lukas", "Maja", "Noah", "Freja Marie Jensen Madsen"]) await addP(n);
ok(await page.locator(".pl").count() === 6, "6 spillere");
ok((await page.locator(".pl span").nth(5).innerText()).length <= 16, "langt navn afkortes");
ok(await page.evaluate(() => document.activeElement.id === "pn"), "feltet beholder fokus, så man kan skrive videre");
await noOverflow("spillere"); await shot("02-spillere");
for (let i = 0; i < 8; i++) await addP("P" + i);
ok(await page.locator(".pl").count() === 12 && (await txt("#toast")).includes("højst"), "højst 12 spillere");
await tap("#pClear"); ok(await page.locator(".pl").count() === 0 && await page.locator(".empty").count() === 1, "ryd alle");
await page.locator("#toast button").click(); ok(await page.locator(".pl").count() === 12, "fortryd ryd alle");
for (let i = 0; i < 6; i++) await page.locator(".pl button").last().click();
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("kit.slurk")).players.length === 6), "spillere gemmes");
/* 4 Fest */
await tap('.tab[data-tab="spil"]');
ok(await page.locator(".tip").count() === 0 && await page.locator(".game.off").count() === 0, "alle spil åbne med spillere");
await shot("03-forside"); await noOverflow("forside med spillere");
await tap('.game[data-g="fest"]');
ok(await page.locator("#stage.on").count() === 1 && await txt("#stTitle") === "Fest", "Fest åbner");
const kinds = new Set(), seen = new Set(); let active = 0, festBad = 0;
for (let i = 0; i < 160; i++) {
  const k = await txt("#stBody .kick"), t = await txt("#stBody .txt");
  kinds.add(k); seen.add(t); if (/[{}]/.test(t) || t.length < 5) festBad++;
  if (await page.locator("#stBody .active").count()) active++;
  if (i === 3) await shot("04-fest");
  if (i % 2) await footBtn("Næste").click(); else await tap("#stBody .big");
}
ok(festBad === 0, "Fest: alle kort er udfyldt");
ok(["Udfordring", "Alle", "Duel", "Ny regel", "Reglen er slut"].every(k => kinds.has(k)), "Fest: alle korttyper forekommer", [...kinds].join());
ok(seen.size > 70 && active > 20, "Fest: mange forskellige kort og aktive regler vises", `${seen.size} ${active}`);
await noOverflow("fest");
await tap("#stInfo"); ok(await page.locator("#sheet.on li").count() === 4, "regelark for Fest");
ok(await page.evaluate(() => window.onNativeBack()) === true && await page.locator("#sheet.on").count() === 0, "tilbage lukker arket først");
ok(await page.evaluate(() => window.onNativeBack()) === true && await page.locator("#stage.on").count() === 0, "tilbage lukker scenen");
/* 5 Jeg har aldrig + Mest tilbøjelig */
for (const [id, kick, n] of [["aldrig", "Jeg har aldrig", 65], ["mest", "mest tilbøjelig", 54]]) {
  await tap(`.game[data-g="${id}"]`);
  const s = new Set();
  for (let i = 0; i < n; i++) { s.add(await txt("#stBody .txt")); if (i === 0) { ok((await txt("#stBody .kick")).includes(kick), id + ": overskrift"); await shot("05-" + id); } await footBtn("Næste").click(); }
  ok(s.size === n, `${id}: ${n} kort uden gentagelser`, String(s.size));
  ok(/slurk/.test(await txt("#stBody .subt")), id + ": undertekst med slurke");
  await noOverflow(id); await tap("#stBack");
}
/* 6 Kongekort */
await tap('.game[data-g="konge"]');
ok(await page.locator(".pcard.back").count() === 1 && (await txt(".who")).includes("starter"), "Kongekort: start");
for (let i = 0; i < 3; i++) await footBtn("Træk kort").click();
await shot("06-kongekort"); await noOverflow("kongekort");
const kSaved = await page.evaluate(() => JSON.parse(localStorage.getItem("kit.slurk")).konge.i);
ok(kSaved === 3, "Kongekort gemmes undervejs");
await tap("#stBack"); ok((await txt('.game[data-g="konge"] .m')).includes("Fortsæt · 49"), "forsiden viser Fortsæt");
await page.reload(); await tap('.game[data-g="konge"]');
ok((await txt("#stBody .info")).startsWith("49 kort"), "Kongekort fortsætter efter genstart");
await footBtn("Bland igen").click(); await tap("#cNo"); ok((await txt("#stBody .info")).startsWith("49 kort"), "Bland igen kan fortrydes");
await footBtn("Træk kort").click(); await footBtn("Bland igen").click(); await tap("#cYes"); ok((await txt("#stBody .info")).startsWith("52 kort"), "Bland igen starter forfra");
let draws = 0, kings = 0; const names = new Set();
while (await footBtn("Træk kort").count()) { await footBtn("Træk kort").click(); draws++; const l = await page.locator("#stBody .pcard").getAttribute("aria-label"); if (l.endsWith(" K")) kings++; names.add(await txt("#stBody .note .hand")); if (draws > 60) break; }
ok(kings === 4 && draws <= 52 && draws >= 4, "Kongekort slutter på fjerde konge", `${draws} ${kings}`);
ok((await txt("#stBody .note")).includes("Fjerde konge") && await footBtn("Nyt spil").count() === 1, "slutkort og Nyt spil");
ok(names.size >= 8, "flere forskellige regler set", String(names.size));
await shot("07-kongekort-slut");
await footBtn("Nyt spil").click(); ok((await txt("#stBody .info")).startsWith("52 kort"), "nyt spil efter slut"); await tap("#stBack");
/* 7 Højere eller lavere */
await tap('.game[data-g="hilo"]'); ok(await txt("#stTitle") === "Højere eller lavere", "titel på Højere eller lavere");
let hiBad = 0, passSeen = 0, right = 0, wrong = 0;
for (let i = 0; i < 140; i++) {
  const a = await cardVal(), up = Math.random() < .5; if (i === 2) await shot("08-hilo");
  await footBtn(up ? "Højere" : "Lavere").click();
  const b = await cardVal(), msg = await txt("#stBody .note");
  const exp = a === b ? "Samme" : (b > a) === up ? "Rigtigt" : "Forkert";
  if (!msg.startsWith(exp)) hiBad++; if (exp === "Rigtigt") right++; else { wrong++; if (!/tager \d+ slurk/.test(msg)) hiBad++; }
  if (await footBtn("Send videre").count()) { passSeen++; if (passSeen === 1) { const w = await txt(".who"); await footBtn("Send videre").click(); ok(await txt(".who") !== w && (await txt("#stBody .note")).includes("overtager"), "Send videre skifter spiller"); } }
}
ok(hiBad === 0 && right > 30 && wrong > 30, "Højere/lavere: alle 140 udfald stemmer med kortene", `${hiBad} ${right} ${wrong}`);
ok(passSeen > 0, "Send videre dukker op efter tre rigtige");
await noOverflow("hilo"); await tap("#stBack");
/* 8 Meyer */
await tap('.game[data-g="meyer"]');
const R = [32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, 11, 22, 33, 44, 55, 66, 31, 21];
const val = t => t === "Meyer" ? 21 : t === "Lille Meyer" ? 31 : t.startsWith("Par ") ? +t.slice(4) * 11 : +t;
let mBad = 0, lifts = 0, believes = 0, prev = null;
for (let i = 0; i < 60; i++) {
  await footBtn("Slå").click();
  if (await page.locator(".die.hid").count() !== 2) mBad++;
  await footBtn("Kig").click();
  const dice = await page.evaluate(() => [...document.querySelectorAll("#stBody .die")].map(d => +d.getAttribute("aria-label")));
  const actual = Math.max(...dice) * 10 + Math.min(...dice);
  if (val((await txt("#stBody .hint b"))) !== actual) mBad++;
  if (i === 0) await shot("09-meyer-kig");
  await footBtn("Skjul").click(); if (await page.locator(".die.hid").count() !== 2) mBad++;
  await footBtn("Meld").click();
  const opts = await page.locator(".claims button").allInnerTexts();
  if (opts.length !== (prev == null ? 21 : R.length - R.indexOf(prev))) mBad++;
  if (i === 0) { await shot("10-meyer-meld"); await noOverflow("meyer meld"); await footBtn("Tilbage").click(); await footBtn("Meld").click(); }
  const pickT = opts[Math.floor(Math.random() * opts.length)], claim = val(pickT);
  await page.locator(".claims button", { hasText: new RegExp("^" + pickT + "$") }).click();
  const melder = (await txt("#stBody .kick")).replace(" melder", "");
  if (val(await txt("#stBody .txt")) !== claim) mBad++;
  if (Math.random() < .5) {
    lifts++; await footBtn("Løfter!").click();
    const liar = R.indexOf(actual) < R.indexOf(claim), kick = await txt("#stBody .kick"), sub = await txt("#stBody .subt");
    if ((kick === "Bluff!") !== liar) mBad++;
    if (liar !== sub.startsWith(melder)) mBad++;
    if (!sub.includes(claim === 21 || actual === 21 ? "4 slurke" : "2 slurke")) mBad++;
    if (await page.locator(".die.hid").count() !== 0) mBad++;
    if (lifts === 1) await shot("11-meyer-loeft");
    await footBtn("Ny runde").click(); prev = null;
    if (!(await txt(".who")).startsWith(sub.split(" tager")[0])) mBad++;
  } else { believes++; await footBtn("Tror på det").click(); prev = claim; if (val(await txt("#stBody .txt")) !== claim) mBad++; }
}
ok(mBad === 0 && lifts > 10 && believes > 10, "Meyer: 60 ture stemmer (terninger, meldinger, løft, taber starter)", `${mBad} ${lifts} ${believes}`);
await tap("#stBack");
/* 9 Bomben */
await page.evaluate(() => { Slurk.bombMs = () => 700; });
await tap('.game[data-g="bombe"]');
const cat1 = await txt("#stBody .txt"); await footBtn("Ny kategori").click(); ok(await txt("#stBody .txt") !== cat1, "ny kategori");
await shot("12-bombe"); await footBtn("Start").click(); ok(await page.locator("#bomb").count() === 1, "bomben tikker"); await shot("13-bombe-tikker");
await page.waitForSelector("#stBody .txt.xl", { timeout: 4000 }); ok(await txt("#stBody .txt") === "BUM!" && /tager 3 slurke/.test(await txt("#stBody .subt")), "bomben springer");
await shot("14-bum"); await footBtn("Ny runde").click(); await footBtn("Start").click(); await footBtn("Stop").click();
ok(await footBtn("Start").count() === 1, "stop virker"); await page.waitForTimeout(900); ok(await footBtn("Start").count() === 1, "ingen eksplosion efter stop");
await footBtn("Start").click(); await tap("#stBack"); await page.waitForTimeout(900); ok(await page.locator("#stage.on").count() === 0, "tilbage midt i en runde stopper bomben");
/* 10 Flasken */
await page.evaluate(() => { CFG.spinMs = 140; });
await tap('.game[data-g="flaske"]');
ok(await page.locator(".ring .nm").count() === 6, "navne står rundt om flasken"); let fBad = 0; const hitNames = new Set();
for (let i = 0; i < 14; i++) {
  await footBtn("Snur").click(); await page.waitForSelector(".ring .nm.hit", { timeout: 3000 });
  const r = await page.evaluate(() => { const h = document.querySelector(".nm.hit"), all = [...document.querySelectorAll(".ring .nm")]; const a = +document.querySelector("#bt").style.transform.match(/-?[\d.]+/)[0]; return { name: h.textContent, idx: all.indexOf(h), ptr: Slurk.pointed(a, all.length), note: document.querySelector("#stBody .note").textContent }; });
  if (r.idx !== r.ptr || !r.note.startsWith(r.name) || /[{}]/.test(r.note)) fBad++; hitNames.add(r.name);
  if (i === 0) { await shot("15-flaske"); await noOverflow("flaske"); }
}
ok(fBad === 0 && hitNames.size >= 3, "Flasken: peger på den, der bliver nævnt", `${fBad} ${hitNames.size}`);
await tap("#stBack");
/* 11 indstillinger */
await tap("#btnSet"); await page.locator("#lv button", { hasText: "Vild" }).click(); await shot("16-indstillinger");
await page.locator("#th button", { hasText: "Lyst" }).click(); ok(await page.evaluate(() => document.documentElement.dataset.theme) === "light", "lyst tema");
await page.evaluate(() => Kit.closeSheet()); ok((await txt("#subtitle")).includes("Vild"), "niveau i undertitlen");
await tap('.game[data-g="mest"]'); ok((await txt("#stBody .subt")).includes("3 slurke"), "Vild: 2 bliver til 3"); await shot("17-lyst-mest"); await tap("#stBack");
await shot("18-forside-lys");
await tap("#btnSet"); await page.locator("#lv button", { hasText: "Rolig" }).click(); await page.evaluate(() => Kit.closeSheet());
await tap('.game[data-g="aldrig"]'); ok((await txt("#stBody .subt")).includes("1 slurk."), "Rolig: 1 slurk"); await tap("#stBack");
await tap('.tab[data-tab="regler"]'); ok(await page.locator(".rule").count() === 8 && await page.locator(".kr").count() === 13, "Regler: 8 spil og 13 kongekort"); await noOverflow("regler"); await shot("19-regler");
await tap("#btnSet"); await tap("#rs"); ok(await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("kit.slurk")); return Object.keys(d.bags).length === 0 && d.konge === null; }), "Bland nulstiller kortene");
await page.locator("#th button", { hasText: "Mørkt" }).click(); await page.evaluate(() => Kit.closeSheet());
/* 12 genstart, hash, tilbage */
await page.reload();
ok(await page.locator("#s-spil.on").count() === 1 && (await txt("#subtitle")).startsWith("6 spillere · Rolig") && await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "indstillinger og spillere overlever genstart");
await page.evaluate(() => window.openHash("fest")); ok(await txt("#stTitle") === "Fest" && await page.locator("#stage.on").count() === 1, "widget-genvej starter Fest");
await page.evaluate(() => window.openHash("meyer")); ok(await txt("#stTitle") === "Meyer", "skift direkte mellem spil");
await page.evaluate(() => window.openHash("folk")); ok(await page.locator("#stage.on").count() === 0 && await page.locator("#s-folk.on").count() === 1, "hash til fane lukker scenen");
ok(await page.evaluate(() => window.onNativeBack()) === true && await page.locator("#s-spil.on").count() === 1, "tilbage går til første fane");
ok(await page.evaluate(() => window.onNativeBack()) === false, "tilbage på forsiden lukker appen");
/* 13 uden navne */
await tap('.tab[data-tab="folk"]'); await tap("#pClear"); await tap('.tab[data-tab="spil"]');
await page.evaluate(() => { CFG.spinMs = 140; }); await tap('.game[data-g="flaske"]'); await footBtn("Snur").click(); await page.waitForSelector("#stBody .note", { timeout: 3000 });
ok((await txt("#stBody .note")).startsWith("Den, flasken peger på,") && await page.locator(".ring .nm").count() === 0, "Flasken uden navne"); await tap("#stBack");
await tap('.game[data-g="hilo"]'); ok(await page.locator(".who").count() === 0, "Højere/lavere uden navne"); await footBtn("Højere").click(); ok(/Rigtigt|Du tager|Samme/.test(await txt("#stBody .note")), "udfald uden navne"); await tap("#stBack");
await tap('.game[data-g="konge"]'); ok(await page.locator(".who").count() === 0, "Kongekort uden navne"); await footBtn("Træk kort").click(); await tap("#stBack");
await page.evaluate(() => window.openHash("fest")); ok(await page.locator("#s-folk.on").count() === 1 && await page.locator("#stage.on").count() === 0, "genvej uden spillere går til Spillere");
/* 14 ødelagte data */
for (const bad of ['{"players":"x","level":9,"bags":[1],"konge":{"deck":[1]},"theme":5,"last":7}', "ikke json", '{"players":[1,null,"A","a"],"bags":{"fest":{"o":"x","i":-3},"aldrig":7}}', "null", "[]"]) {
  await page.evaluate(v => localStorage.setItem("kit.slurk", v), bad); await page.reload();
  ok(await page.locator(".game").count() === 8, "starter med ødelagte data: " + bad.slice(0, 22));
  await tap('.game[data-g="aldrig"]'); await footBtn("Næste").click(); ok((await txt("#stBody .txt")).length > 5, "kort virker efter ødelagte data"); await tap("#stBack");
}
ok(await page.evaluate(() => JSON.parse(localStorage.getItem("kit.slurk")).players.length) === 0, "data ryddet op");
/* 15 lille skærm */
await page.setViewportSize({ width: 320, height: 568 }); await page.evaluate(() => localStorage.clear()); await page.reload();
await tap('.tab[data-tab="folk"]'); for (const n of ["Christoffer-Emil", "Alexander", "Bo", "Ida", "Freja", "Noah", "Maja", "Lukas", "Oscar", "Alma", "Karl", "Ella"]) await addP(n);
await noOverflow("320 spillere"); await tap('.tab[data-tab="spil"]'); await noOverflow("320 forside"); await shot("20-lille-forside");
const fits = async name => ok(await page.evaluate(() => { const f = document.querySelector("#stFoot").getBoundingClientRect(), b = document.querySelector("#stBody"); return f.bottom <= innerHeight + 1 && [...document.querySelectorAll("#stFoot button")].every(x => x.getBoundingClientRect().height >= 44) && b.scrollWidth <= b.clientWidth + 1; }), "lille skærm: knapper synlige – " + name);
await tap('.game[data-g="fest"]'); for (let i = 0; i < 40; i++) { await footBtn("Næste").click(); } await fits("fest"); await noOverflow("320 fest"); await shot("21-lille-fest"); await tap("#stBack");
await page.evaluate(() => { CFG.spinMs = 140; }); await tap('.game[data-g="flaske"]'); await footBtn("Snur").click(); await page.waitForSelector(".nm.hit"); await fits("flaske"); await noOverflow("320 flaske"); await shot("22-lille-flaske"); await tap("#stBack");
await tap('.game[data-g="meyer"]'); await footBtn("Slå").click(); await footBtn("Meld").click(); await fits("meyer meld"); await noOverflow("320 meyer"); await shot("23-lille-meyer");
await page.locator(".claims button").last().click(); await fits("meyer pass"); await footBtn("Løfter!").click(); await fits("meyer resultat"); await shot("24-lille-meyer-loeft"); await tap("#stBack");
await tap('.game[data-g="konge"]'); await footBtn("Træk kort").click(); await fits("konge"); await shot("25-lille-konge"); await tap("#stBack");
await tap('.game[data-g="hilo"]'); await footBtn("Højere").click(); await fits("hilo"); await shot("26-lille-hilo"); await tap("#stBack");
await tap('.tab[data-tab="regler"]'); await noOverflow("320 regler");

/* 16 mørkt tema (til gennemsyn) + toast forsvinder ved skift */
await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: "dark" }); await page.reload();
ok(await page.evaluate(() => document.documentElement.dataset.theme) === "dark", "systemtema følger telefonen");
await shot("30-moerk-forside"); await page.evaluate(() => window.openHash("fest")); await shot("31-moerk-fest"); await footBtn("Næste").click();
await page.evaluate(() => window.openHash("konge")); await footBtn("Træk kort").click(); await shot("32-moerk-konge");
ok(await page.evaluate(() => { const c = [...document.querySelectorAll("#stBody .pcard .c")].map(x => x.textContent); return c.length === 2 && c[0] === c[1] && getComputedStyle(document.querySelector(".pcard .c.b")).transform === "none"; }), "kortets hjørner står begge retvendt (6 og 9 kan ikke forveksles)");
await page.evaluate(() => window.openHash("meyer")); await footBtn("Slå").click(); await footBtn("Meld").click(); await shot("33-moerk-meyer");
ok(await page.evaluate(() => { const b = document.querySelector("#stFoot button").getBoundingClientRect(); return b.width > innerWidth - 60; }), "en enkelt knap fylder hele bredden");
await page.evaluate(() => { CFG.spinMs = 140; window.openHash("flaske"); }); await footBtn("Snur").click(); await page.waitForSelector(".nm.hit"); await shot("34-moerk-flaske");
await page.evaluate(() => { Slurk.bombMs = () => 60000; window.openHash("bombe"); }); await footBtn("Start").click(); await shot("35-moerk-bombe"); await tap("#stBack");
await tap('.tab[data-tab="folk"]'); await page.locator(".pl button").first().click(); ok(await page.locator("#toast.on").count() === 1, "toast med Fortryd vises"); await shot("36-moerk-spillere");
await tap('.tab[data-tab="spil"]'); ok(await page.locator("#toast.on").count() === 0, "toast forsvinder ved faneskift");
await tap("#btnSet"); await shot("37-moerk-indstillinger"); await page.evaluate(() => Kit.closeSheet());

ok(errors.length === 0, "ingen fejl i konsollen", errors.slice(0, 5).join(" | "));
console.log(`\n${pass} bestået, ${fail} fejlet`);
await browser.close(); srv.kill();
process.exit(fail ? 1 : 0);
