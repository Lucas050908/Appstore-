/* Slurk – spillogik og indhold. Ingen DOM herinde, så det hele kan testes i Node (apps/slurk/test). */
"use strict";
const Slurk = (() => {
  /* ---------- fælles ---------- */
  const LEVELS = [["Rolig", .5], ["Normal", 1], ["Vild", 1.5]];
  const lvl = l => (l === 0 || l === 2 ? l : 1);
  const scale = (n, level = 1) => Math.max(1, Math.round(n * LEVELS[lvl(level)][1]));
  const sips = n => (n === 1 ? "1 slurk" : n + " slurke");
  function shuffle(a, rng = Math.random) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  /* Træk uden gentagelser: bag = {o: rækkefølge, i: næste}. Blander først igen, når alle er brugt. */
  function draw(bag, n, rng = Math.random) {
    const ok = Array.isArray(bag.o) && bag.o.length === n && Number.isInteger(bag.i) && bag.i >= 0 && bag.o.every(x => Number.isInteger(x) && x >= 0 && x < n) && new Set(bag.o).size === n;
    if (!ok || bag.i >= n) {
      const last = ok ? bag.o[n - 1] : -1;
      bag.o = shuffle([...Array(n).keys()], rng);
      if (n > 1 && bag.o[0] === last) [bag.o[0], bag.o[n - 1]] = [bag.o[n - 1], bag.o[0]];
      bag.i = 0;
    }
    return bag.o[bag.i++];
  }
  /* Antal spillernavne en tekst bruger ({a}, {b}, {c}) */
  const need = t => ["{a}", "{b}", "{c}"].filter(k => t.includes(k)).length;
  /* {a}/{b}/{c} -> navne, {2} -> "2 slurke" skaleret efter niveau. wrap pakker navne ind (fx <b>). */
  function fill(t, names = [], level = 1, wrap = x => x) {
    return t.replace(/\{([abc]|\d+)\}/g, (m, k) => {
      if (/\d/.test(k)) return sips(scale(+k, level));
      const n = names["abc".indexOf(k)];
      return n == null ? m : wrap(n);
    });
  }
  /* Vælg k spillere. Den første er den, der har haft færrest ture (tilfældig blandt lige). */
  function pick(players, counts, k, rng = Math.random) {
    const c = p => counts[p] || 0, min = Math.min(...players.map(c));
    const pool = players.filter(p => c(p) === min);
    const a = pool[Math.floor(rng() * pool.length)];
    counts[a] = c(a) + 1;
    return [a, ...shuffle(players.filter(p => p !== a), rng).slice(0, k - 1)];
  }

  /* ---------- Fest ---------- */
  // k: "" (én spiller), "alle", "duel", "regel" (r = antal kort reglen gælder, e = tekst når den slutter)
  const FEST = [
    { t: "{a}, giv {2} til den, der sidst kom til festen." },
    { t: "{a}, del {3} ud – fordel dem, som du vil." },
    { t: "{a}, nævn 5 danske byer på 10 sekunder – ellers tager du {2}." },
    { t: "{a}, lav din bedste dyrelyd. Gætter ingen dyret, tager du {2}." },
    { t: "{a}, fortæl en joke. Griner ingen, tager du {2}. Griner nogen, tager de {1}." },
    { t: "{a}, hvem her ville klare sig længst på en øde ø? Den person deler {2} ud." },
    { t: "{a}, byt plads med {b}. I skåler på det." },
    { t: "{a}, gæt hvor mange procent strøm {b} har på telefonen. Rammer du inden for 10, tager {b} {2} – ellers tager du dem selv." },
    { t: "{a}, vis det seneste billede på din telefon – eller tag {3}." },
    { t: "{a}, læs din seneste sendte besked højt – eller tag {3}." },
    { t: "{a}, lav 5 armbøjninger – eller tag {2}." },
    { t: "{a}, stå på ét ben, til det er din tur igen. Sætter du foden ned, tager du {2}." },
    { t: "{a}, giv {b} en kompliment. {b} bestemmer, om den koster dig {1} eller {2}." },
    { t: "Sandhed: {a}, hvad er det mest pinlige, du har googlet? Svar – eller tag {3}." },
    { t: "Sandhed: {a}, hvad er din værste vane? Svar – eller tag {2}." },
    { t: "Sandhed: {a}, hvem her har du kendt længst? I skåler." },
    { t: "{a}, efterlign en i rummet. Den første, der gætter hvem, deler {2} ud." },
    { t: "{a}, tæl baglæns fra 20 til 1 på 8 sekunder – ellers tager du {2}." },
    { t: "{a}, vælg en, der tager {1} sammen med dig." },
    { t: "{a}, sig alfabetet baglæns fra K. Laver du fejl, tager du {2}." },
    { t: "{a}, nævn 3 ting, du kan lide ved {b}, på 10 sekunder – ellers tager du {2}." },
    { t: "{a}, du er fredet: ingen kan give dig slurke, før det er din tur igen." },
    { t: "{a}, tag {1} for hver søskende, du har. Enebarn? Så deler du {2} ud." },
    { t: "{a}, hvad hedder {b} til mellemnavn? Gætter du forkert, tager du {2}. Gætter du rigtigt, tager {b} dem." },
    { t: "{a}, hold en skåltale på 10 sekunder. Bagefter skåler alle." },
    { t: "{a}, vælg: tag {3} selv – eller lad {b} dele {4} ud." },
    { t: "{a}, hvisk et ord til {b}, som mimer det. Gætter ingen det på 20 sekunder, tager I begge {1}." },
    { t: "{a}, sig noget pænt om alle i rummet – eller tag {3}." },
    { t: "{a}, er du mest til hund eller kat? Alle, der er uenige, tager {1}." },
    { t: "{a}, gæt {b}s yndlingsfarve. Gætter du forkert, tager du {1}." },
    { t: "{a}, vælg en kategori. I tager bordet rundt – den, der går i stå, tager {2}." },
    { t: "{a}, sig et ord. I tager bordet rundt med ord, der rimer – den, der går i stå, tager {2}." },
    { t: "{a}, tegn noget i luften med albuen. Gætter {b} det ikke på 15 sekunder, tager I begge {1}." },
    { t: "{a}, sig tre ting om dig selv: to sande og en løgn. Dem, der gætter forkert, tager {1}." },
    { t: "{a}, nævn en sang, alle kender. Kan ingen synge første linje, tager du {2}." },
    { t: "Alle, der er højere end {a}, tager {1}.", k: "alle" },
    { t: "Alle, der har samme hårfarve som {a}, tager {1}.", k: "alle" },
    { t: "Alle med sorte sokker tager {1}.", k: "alle" },
    { t: "Den yngste i rummet tager {2}.", k: "alle" },
    { t: "Den ældste i rummet deler {3} ud.", k: "alle" },
    { t: "Alle peger på den, der bruger længst tid på badeværelset. Flest fingre tager {2}.", k: "alle" },
    { t: "Alle peger på den med den værste musiksmag. Flest fingre tager {2}.", k: "alle" },
    { t: "Alle peger på den, der altid kommer for sent. Flest fingre tager {2}.", k: "alle" },
    { t: "Alle med iPhone tager {1}.", k: "alle" },
    { t: "Alle med Android deler {1} ud.", k: "alle" },
    { t: "Gulvet! Den sidste, der rører gulvet, tager {2}.", k: "alle" },
    { t: "Himlen! Den sidste, der peger op, tager {2}.", k: "alle" },
    { t: "Den med flest ulæste beskeder tager {2}.", k: "alle" },
    { t: "Den, der sidst var hos frisøren, deler {2} ud.", k: "alle" },
    { t: "Skål! Alle tager {1}.", k: "alle" },
    { t: "Den, der har været længst vågen i dag, deler {2} ud.", k: "alle" },
    { t: "Den sidste, der rejser sig op, tager {2}.", k: "alle" },
    { t: "Alle, der har været i udlandet i år, tager {1}.", k: "alle" },
    { t: "Alle, der har et kæledyr, tager {1}.", k: "alle" },
    { t: "Stilleleg! Den første, der siger noget, tager {2}.", k: "alle" },
    { t: "Alle, der har søskende, tager {1}. Enebørn deler {1} ud.", k: "alle" },
    { t: "Den med den laveste strøm på telefonen tager {2}.", k: "alle" },
    { t: "Alle, der har cyklet i dag, deler {1} ud.", k: "alle" },
    { t: "{a} og {b}: sten, saks, papir. Taberen tager {2}.", k: "duel" },
    { t: "{a} og {b}: stirrekonkurrence. Den, der griner eller blinker først, tager {2}.", k: "duel" },
    { t: "{a} og {b}: tommelfingerkrig. Taberen tager {2}.", k: "duel" },
    { t: "{a} og {b}: den, der først nævner en sang med et navn i titlen, slipper. Den anden tager {2}.", k: "duel" },
    { t: "{a} og {b}: den, der har gået flest skridt i dag, deler {2} ud.", k: "duel" },
    { t: "{a} og {b}: skiftes til at nævne lande i Europa. Den, der går i stå, tager {2}.", k: "duel" },
    { t: "{a} og {b}: den med den nyeste telefon deler {2} ud.", k: "duel" },
    { t: "Ingen må sige »ja« eller »nej«. Den, der gør det, tager {1}.", k: "regel", r: 6, e: "Nu må I gerne sige »ja« og »nej« igen." },
    { t: "{a} er tommelfinger-mester. Når {a} lægger tommelfingeren på bordet, tager den sidste, der gør det samme, {1}.", k: "regel", r: 7, e: "{a} er ikke længere tommelfinger-mester." },
    { t: "Man må kun drikke med venstre hånd. Bliver man taget med højre, tager man {1} ekstra.", k: "regel", r: 7, e: "I må gerne drikke med højre hånd igen." },
    { t: "Ingen må sige navne. Den, der siger et navn, tager {1}.", k: "regel", r: 6, e: "I må gerne sige navne igen." },
    { t: "{a} og {b} er makkere. Når den ene drikker, drikker den anden også.", k: "regel", r: 6, e: "{a} og {b} er ikke makkere længere." },
    { t: "{a} er spørgsmålsmester. Svarer man på et spørgsmål fra {a}, tager man {1}.", k: "regel", r: 6, e: "{a} er ikke spørgsmålsmester længere." },
    { t: "Ingen må pege. Den, der peger på noget eller nogen, tager {1}.", k: "regel", r: 6, e: "I må gerne pege igen." },
    { t: "{a} må kun tale i spørgsmål. For hver almindelig sætning tager {a} {1}.", k: "regel", r: 5, e: "{a} må gerne tale normalt igen." }
  ];
  /* Næste Fest-kort. st = {rules: [{p, names, left}], counts: {}}. Giver {p, names, kind}. */
  function festNext(st, players, bag, rng = Math.random) {
    st.rules = st.rules || []; st.counts = st.counts || {};
    const done = st.rules.findIndex(r => r.left <= 0);
    if (done >= 0) { const r = st.rules.splice(done, 1)[0]; return { p: { t: r.p.e, k: "slut" }, names: r.names, kind: "slut" }; }
    let p = null;
    for (let i = 0; i < FEST.length * 2 && !p; i++) {
      const c = FEST[draw(bag, FEST.length, rng)];
      if (need(c.t) <= players.length) p = c;
    }
    if (!p) return null;
    st.rules.forEach(r => r.left--);
    const k = need(p.t), names = k ? pick(players, st.counts, k, rng) : [];
    if (p.k === "regel") st.rules.push({ p, names, left: p.r });
    return { p, names, kind: p.k || "" };
  }
  const KIND = { "": "Udfordring", alle: "Alle", duel: "Duel", regel: "Ny regel", slut: "Reglen er slut" };

  /* ---------- Jeg har aldrig / Mest tilbøjelig ---------- */
  const ALDRIG = [
    "sovet over mig til en eksamen eller en vagt", "sendt en besked til den forkerte person", "løjet om min alder", "grædt til en film i biografen",
    "glemt navnet på en, jeg lige havde mødt", "faldet i søvn i bussen eller toget og kørt for langt", "googlet mig selv", "kigget en eks' profil igennem",
    "spist noget, der var faldet på gulvet", "ladet som om jeg ikke så en, jeg kendte", "sunget karaoke", "danset på et bord", "kysset nogen i det her rum",
    "fået en bøde", "kørt uden billet", "løjet for at slippe for en aftale", "været lun på en lærer", "sendt en besked, jeg fortrød med det samme",
    "brugt en andens tandbørste", "glemt en fødselsdag, jeg burde have husket", "tabt min telefon i toilettet", "smadret en skærm", "været vågen i over 24 timer",
    "snydt i et brætspil", "snydt til en prøve", "grinet, så jeg tissede en lille smule i bukserne", "ghostet nogen", "været på en date, jeg bare ville væk fra",
    "væltet på cykel foran andre", "gået ind i en glasdør", "vinket tilbage til en, der vinkede til en anden", "spist en hel pizza alene",
    "set en hel sæson af en serie på én dag", "haft et kælenavn, jeg hadede", "brændt maden på, så røgalarmen gik", "låst mig ude", "mistet min pung eller mine nøgler i byen",
    "sagt »i lige måde« til en tjener, der sagde »velbekomme«", "slettet et opslag, fordi det fik for få likes", "været til koncert alene", "badet uden tøj på",
    "kysset mere end én på samme aften", "haft en hemmelig profil på sociale medier", "læst en andens beskeder uden lov", "skrevet »er på vej«, mens jeg stadig lå i sengen",
    "lånt noget og aldrig givet det tilbage", "skrevet til en eks efter midnat", "gemt mig for at slippe for at snakke med nogen", "pyntet på mit cv",
    "meldt mig syg uden at være det", "glemt, hvor jeg parkerede min cykel", "fået stjålet en cykel", "taget en andens mad i køleskabet", "sovet i timen",
    "været i tv eller i avisen", "mødt en kendt", "brækket en knogle", "været lun på en vens søskende", "sagt, at jeg havde læst en bog, jeg aldrig åbnede",
    "grinet på et helt forkert tidspunkt", "sendt et screenshot til den, det handlede om", "glemt at betale i en butik", "faldet i søvn til en fest",
    "sunget for fuld hals i bilen og opdaget, at nogen kiggede", "løjet i den her leg"
  ];
  const MEST = [
    "komme for sent til sit eget bryllup", "blive kendt", "glemme sin egen fødselsdag", "overleve en zombie-apokalypse", "dø først i en gyserfilm", "blive millionær",
    "miste sin telefon i aften", "falde i søvn til festen", "skrive til sin eks i aften", "græde til en tegnefilm", "starte en kædedans", "blive smidt ud af et bibliotek",
    "flytte til udlandet", "vinde et quizshow", "tabe en diskussion til en femårig", "spise noget, der er alt for gammelt", "glemme, hvor de bor", "blive væk i et supermarked",
    "grine i en alvorlig situation", "bruge hele lønnen på en uge", "gå først i seng", "være den sidste på dansegulvet", "tage en taxa 300 meter",
    "tale med et dyr, som om det var et menneske", "blive statsminister", "få en tatovering, de fortryder", "gå viralt på nettet", "glemme sin jakke i aften",
    "bestille mad klokken fire om natten", "snakke i søvne", "købe noget dumt på nettet i nat", "flytte på landet og få høns", "sige noget pinligt til svigerforældrene",
    "sætte sig ind i en fremmed bil ved en fejl", "synge højest i bilen", "blive gift først", "slå alle sine planter ihjel", "løbe et maraton", "snyde i Matador",
    "være vågen til solopgang", "holde den næste fest", "svare på en besked tre dage for sent", "snakke sig ind hvor som helst", "vælte sit glas inden for fem minutter",
    "holde en tale, ingen har bedt om", "kunne teksten til alle sange", "ende i en anden by i nat", "adoptere syv katte", "glemme navnet på sin date",
    "være skyld i, at vi kommer for sent", "starte et band", "græde over en reklame", "blive uvenner med en GPS", "have et hemmeligt talent"
  ];

  /* ---------- kort ---------- */
  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const SUITS = ["spar", "hjerter", "ruder", "klør"];
  const card = i => ({ rank: i % 13, suit: Math.floor(i / 13) % 4, label: RANKS[i % 13], red: [1, 2].includes(Math.floor(i / 13) % 4) });
  const newDeck = (rng = Math.random) => shuffle([...Array(52).keys()], rng);
  const validDeck = d => Array.isArray(d) && d.length === 52 && new Set(d).size === 52 && d.every(x => Number.isInteger(x) && x >= 0 && x < 52);

  /* Kongekort: én regel pr. kortværdi (indeks = rank) */
  const KINGS = [
    ["Vandfald", "Alle drikker. Du starter – ingen må stoppe, før personen før dem i rækken er stoppet."],
    ["Dig", "Vælg en, der tager {2}."],
    ["Mig", "Du tager selv {3}."],
    ["Gulvet", "Den sidste, der rører gulvet, tager {2}."],
    ["Kategori", "Vælg en kategori. Bordet rundt – den, der går i stå, tager {2}."],
    ["Rim", "Sig et ord. Bordet rundt med rim – den, der går i stå, tager {2}."],
    ["Himlen", "Den sidste, der peger op, tager {2}."],
    ["Makker", "Vælg en makker. Resten af spillet drikker I, hver gang den anden drikker."],
    ["Jeg har aldrig", "Tag en runde »Jeg har aldrig« med tre fingre. Den første, der er ude, tager {2}."],
    ["Skål", "Alle tager {1}."],
    ["Lav en regel", "Find på en regel, der gælder resten af spillet. Den, der bryder den, tager {1}."],
    ["Spørgsmålsmester", "Indtil næste dame: den, der svarer på et spørgsmål fra dig, tager {1}."],
    ["Konge", "Hæld en sjat af din drik i kongekoppen på midten."]
  ];
  const KING_LAST = ["Fjerde konge", "Du tømmer kongekoppen. Spillet er slut."];
  const kingsNew = (rng = Math.random) => ({ deck: newDeck(rng), i: 0, kings: 0, turn: 0 });
  const kingsValid = s => !!s && validDeck(s.deck) && Number.isInteger(s.i) && s.i >= 0 && s.i <= 52 && Number.isInteger(s.kings) && s.kings >= 0 && s.kings <= 4 && Number.isInteger(s.turn) && s.turn >= 0;
  const kingsOver = s => s.kings >= 4 || s.i >= 52;
  function kingsDraw(s) {
    if (kingsOver(s)) return null;
    const c = card(s.deck[s.i++]); s.turn++;
    if (c.rank === 12) s.kings++;
    const last = c.rank === 12 && s.kings >= 4;
    const [name, text] = last ? KING_LAST : KINGS[c.rank];
    return { card: c, name, text, over: kingsOver(s), last };
  }

  /* Højere eller lavere: es er højest */
  const hiVal = i => (i % 13 === 0 ? 14 : i % 13 + 1);
  const hiNew = (rng = Math.random) => { const deck = newDeck(rng); return { deck, i: 1, cur: deck[0], streak: 0, turn: 0 }; };
  /* guess: "op" | "ned". Giver {res: "ret" | "fejl" | "ens", card, sips (grundtal før niveau)} */
  function hiGuess(s, guess, rng = Math.random) {
    if (s.i >= s.deck.length) { s.deck = newDeck(rng).filter(c => c !== s.cur); s.i = 0; }
    const nxt = s.deck[s.i++], a = hiVal(s.cur), b = hiVal(nxt);
    const res = a === b ? "ens" : (b > a) === (guess === "op") ? "ret" : "fejl";
    let n = 0;
    if (res === "ret") s.streak++;
    else { n = Math.min(6, s.streak + 1) * (res === "ens" ? 2 : 1); s.streak = 0; s.turn++; }
    s.cur = nxt;
    return { res, card: nxt, sips: n };
  }

  /* ---------- Meyer ---------- */
  const MEYER = [32, 41, 42, 43, 51, 52, 53, 54, 61, 62, 63, 64, 65, 11, 22, 33, 44, 55, 66, 31, 21];
  const meyerVal = (a, b) => Math.max(a, b) * 10 + Math.min(a, b);
  const meyerRank = v => MEYER.indexOf(v);
  const meyerName = v => (v === 21 ? "Meyer" : v === 31 ? "Lille Meyer" : v % 11 === 0 ? "Par " + v % 10 : String(v));
  const meyerClaims = prev => MEYER.filter(v => prev == null || meyerRank(v) >= meyerRank(prev));
  const roll = (rng = Math.random) => [1 + Math.floor(rng() * 6), 1 + Math.floor(rng() * 6)];
  /* Der løftes: lyver melderen? sips er grundtal (Meyer tæller dobbelt). */
  const meyerLift = (actual, claim) => ({ liar: meyerRank(actual) < meyerRank(claim), sips: claim === 21 || actual === 21 ? 4 : 2 });

  /* ---------- Bomben ---------- */
  const BOMBE = [
    "Bilmærker", "Danske byer", "Lande i Europa", "Hovedstæder", "Fodboldklubber", "Ting i et køkken", "Ting på en pizza", "Drinks", "Slik", "Frugter",
    "Dyr med fire ben", "Fugle", "Farver", "Drengenavne", "Pigenavne", "Kendte danskere", "Skuespillere", "Film", "Tv-serier", "Sangere og bands",
    "Computerspil", "Apps", "Tøjmærker", "Sportsgrene", "Instrumenter", "Ting, man tager med på ferie", "Ting på et badeværelse", "Jobs", "Skolefag", "Kropsdele",
    "Superhelte", "Tegnefilmsfigurer", "Ord, der rimer på »kat«", "Ting, der er røde", "Ting, der er runde", "Danske øer", "Supermarkeder", "Fastfood", "Sprog",
    "Morgenmad", "Is-smage", "Ting, man kan lave på en strand", "Undskyldninger for at komme for sent", "Ting i en skoletaske", "Grøntsager", "Ting, der kan flyve"
  ];
  const bombMs = (rng = Math.random) => Math.round(14000 + rng() * 26000);
  const tickGap = left => Math.max(130, Math.min(1000, left / 12));

  /* ---------- Flasken ---------- */
  const FLASKE = [
    "{a} tager {2}.", "{a} deler {2} ud.", "{a} vælger en makker – I tager {1} hver.", "{a} stiller et spørgsmål til en valgfri. Svar – eller tag {2}.",
    "{a} er fredet. Alle andre tager {1}.", "{a} og personen til venstre tager {1}.", "{a} bestemmer, hvem der tager {2}.", "{a} tager {1} og snurrer igen.",
    "{a} fortæller en hemmelighed – eller tager {3}.", "{a} vælger en, der skal udfordres: sten, saks, papir om {2}."
  ];
  /* Hvor flasken lander: spiller idx blandt n, og hvor mange grader den skal dreje videre fra vinklen cur. */
  function spin(n, cur = 0, rng = Math.random) {
    const idx = Math.floor(rng() * Math.max(1, n)), step = 360 / Math.max(1, n);
    const jitter = n > 1 ? (rng() - .5) * step * .5 : rng() * 360;
    const base = Math.ceil(cur / 360) * 360 + (3 + Math.floor(rng() * 3)) * 360;
    return { idx, angle: base + idx * step + jitter };
  }
  /* Hvilken spiller peger vinklen på (0° = spiller 0, med uret) */
  const pointed = (angle, n) => ((Math.round((((angle % 360) + 360) % 360) / (360 / n)) % n) + n) % n;

  /* ---------- spillere ---------- */
  const MAXP = 12, MAXNAME = 16;
  function addPlayer(list, raw) {
    const name = String(raw || "").replace(/\s+/g, " ").trim().slice(0, MAXNAME).trim();
    if (!name) return "tom";
    if (list.length >= MAXP) return "fuld";
    if (list.some(p => p.toLowerCase() === name.toLowerCase())) return "findes";
    list.push(name); return "";
  }
  const cleanPlayers = v => { const out = []; (Array.isArray(v) ? v : []).forEach(p => typeof p === "string" && addPlayer(out, p)); return out; };

  return { LEVELS, scale, sips, shuffle, draw, need, fill, pick, FEST, festNext, KIND, ALDRIG, MEST, RANKS, SUITS, card, newDeck, validDeck, KINGS, KING_LAST,
    kingsNew, kingsValid, kingsOver, kingsDraw, hiVal, hiNew, hiGuess, MEYER, meyerVal, meyerRank, meyerName, meyerClaims, roll, meyerLift,
    BOMBE, bombMs, tickGap, FLASKE, spin, pointed, MAXP, MAXNAME, addPlayer, cleanPlayers };
})();
if (typeof module !== "undefined") module.exports = Slurk;
