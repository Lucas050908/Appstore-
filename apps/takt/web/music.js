// Takt – musikteori, instrumenter og indhold
'use strict';
const M = (() => {
  const SHARP = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  const FLAT_OK = { Db:'C#', Eb:'D#', Gb:'F#', Ab:'G#', Bb:'A#', Hb:'A#' };
  let useH = true; // dansk: H i stedet for B

  function parse(n) {
    const m = /^([A-H])([#b]?)(-?\d)$/.exec(n);
    if (!m) throw new Error('Ugyldig tone: ' + n);
    let name = m[1] + m[2];
    if (name === 'H') name = 'B';
    if (FLAT_OK[name]) name = FLAT_OK[name];
    if (name === 'Cb') return parse('B' + (parseInt(m[3]) - 1));
    if (name === 'Fb') return parse('E' + m[3]);
    if (name === 'E#') return parse('F' + m[3]);
    if (name === 'B#') return parse('C' + (parseInt(m[3]) + 1));
    const pc = SHARP.indexOf(name);
    return (parseInt(m[3]) + 1) * 12 + pc;
  }
  const pcName = pc => { const n = SHARP[((pc % 12) + 12) % 12]; return useH && n === 'B' ? 'H' : n; };
  const name = midi => pcName(Math.round(midi)) + (Math.floor(Math.round(midi) / 12) - 1);
  const chordLabel = c => useH ? c.replace(/^B(?!b)/, 'H').replace(/^Bb/, 'B') : c;
  const freq = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const midiOf = f => 69 + 12 * Math.log2(f / 440);

  // Instrumenter. strings: fra dybeste til lyseste
  const INSTR = {
    guitar: { id:'guitar', name:'Guitar', view:'tab', strings:[40,45,50,55,59,64], frets:12, minF:70, maxF:1400, transpose:0, octaveOk:true },
    eguitar:{ id:'eguitar', name:'Elguitar', view:'tab', strings:[40,45,50,55,59,64], frets:15, minF:70, maxF:1400, transpose:0, octaveOk:true, shape:'guitar', electric:true },
    bass:   { id:'bass', name:'Bas', view:'tab', strings:[28,33,38,43], frets:12, minF:38, maxF:500, transpose:-24, octaveOk:true },
    ukulele:{ id:'ukulele', name:'Ukulele', view:'tab', strings:[67,60,64,69], frets:12, minF:200, maxF:1600, transpose:0, octaveOk:true, reentrant:true },
    piano:  { id:'piano', name:'Klaver', view:'roll', minF:60, maxF:2100, transpose:0, octaveOk:true },
    voice:  { id:'voice', name:'Sang', view:'roll', minF:70, maxF:1100, transpose:0, pcOnly:true },
  };
  const TUNINGS = {
    guitar: [['Standard',[40,45,50,55,59,64]], ['Drop D',[38,45,50,55,59,64]], ['Halv tone ned (Eb)',[39,44,49,54,58,63]], ['Hel tone ned (D)',[38,43,48,53,57,62]], ['Drop C',[36,43,48,53,57,62]], ['DADGAD',[38,45,50,55,57,62]], ['Open G',[38,43,50,55,59,62]], ['Open D',[38,45,50,54,57,62]]],
    bass: [['Standard',[28,33,38,43]], ['Drop D',[26,33,38,43]], ['Halv tone ned',[27,32,37,42]], ['5-strenget',[23,28,33,38,43]]],
  };
  const tunings = instr => TUNINGS[shapeKey(instr)] || null;
  const STRING_COLORS = ['#f3c08c','#cbbaf0','#b7e0a6','#accbef','#f3d867','#f1b3c4']; // dyb → lys (guitar)

  // Akkorder: toner (pitch classes), greb (dyb→lys streng, -1 = dæmpes)
  const CH = {
    'C':   { pcs:[0,4,7],    guitar:[-1,3,2,0,1,0], ukulele:[0,0,0,3], fingers:{guitar:[0,3,2,0,1,0], ukulele:[0,0,0,3]} },
    'D':   { pcs:[2,6,9],    guitar:[-1,-1,0,2,3,2], ukulele:[2,2,2,0], fingers:{guitar:[0,0,0,1,3,2], ukulele:[1,2,3,0]} },
    'E':   { pcs:[4,8,11],   guitar:[0,2,2,1,0,0], ukulele:[1,4,0,2], fingers:{guitar:[0,2,3,1,0,0], ukulele:[1,4,0,2]} },
    'F':   { pcs:[5,9,0],    guitar:[-1,-1,3,2,1,1], ukulele:[2,0,1,0], fingers:{guitar:[0,0,3,2,1,1], ukulele:[2,0,1,0]} },
    'G':   { pcs:[7,11,2],   guitar:[3,2,0,0,0,3], ukulele:[0,2,3,2], fingers:{guitar:[2,1,0,0,0,3], ukulele:[0,1,3,2]} },
    'A':   { pcs:[9,1,4],    guitar:[-1,0,2,2,2,0], ukulele:[2,1,0,0], fingers:{guitar:[0,0,1,2,3,0], ukulele:[2,1,0,0]} },
    'Am':  { pcs:[9,0,4],    guitar:[-1,0,2,2,1,0], ukulele:[2,0,0,0], fingers:{guitar:[0,0,2,3,1,0], ukulele:[2,0,0,0]} },
    'Em':  { pcs:[4,7,11],   guitar:[0,2,2,0,0,0], ukulele:[0,4,3,2], fingers:{guitar:[0,2,3,0,0,0], ukulele:[0,3,2,1]} },
    'Dm':  { pcs:[2,5,9],    guitar:[-1,-1,0,2,3,1], ukulele:[2,2,1,0], fingers:{guitar:[0,0,0,2,3,1], ukulele:[2,3,1,0]} },
    'Bm':  { pcs:[11,2,6],   guitar:[-1,2,4,4,3,2], ukulele:[4,2,2,2], fingers:{guitar:[0,1,3,4,2,1], ukulele:[3,1,1,1]} },
    'A7':  { pcs:[9,1,4,7],  guitar:[-1,0,2,0,2,0], ukulele:[0,1,0,0], fingers:{guitar:[0,0,2,0,3,0], ukulele:[0,1,0,0]} },
    'D7':  { pcs:[2,6,9,0],  guitar:[-1,-1,0,2,1,2], ukulele:[2,2,2,3], fingers:{guitar:[0,0,0,2,1,3], ukulele:[1,1,1,2]} },
    'E7':  { pcs:[4,8,11,2], guitar:[0,2,0,1,0,0], ukulele:[1,2,0,2], fingers:{guitar:[0,2,0,1,0,0], ukulele:[1,2,0,3]} },
    'G7':  { pcs:[7,11,2,5], guitar:[3,2,0,0,0,1], ukulele:[0,2,1,2], fingers:{guitar:[3,2,0,0,0,1], ukulele:[0,2,1,3]} },
    'C7':  { pcs:[0,4,7,10], guitar:[-1,3,2,3,1,0], ukulele:[0,0,0,1], fingers:{guitar:[0,3,2,4,1,0], ukulele:[0,0,0,1]} },
    'Cmaj7':{ pcs:[0,4,7,11],guitar:[-1,3,2,0,0,0], ukulele:[0,0,0,2], fingers:{guitar:[0,3,2,0,0,0], ukulele:[0,0,0,2]} },
    'Fmaj7':{ pcs:[5,9,0,4], guitar:[-1,-1,3,2,1,0], ukulele:[2,4,1,3], fingers:{guitar:[0,0,3,2,1,0], ukulele:[2,4,1,3]} },
    'Asus2':{ pcs:[9,11,4],  guitar:[-1,0,2,2,0,0], ukulele:[2,4,5,2], fingers:{guitar:[0,0,1,2,0,0], ukulele:[1,3,4,1]} },
    'Dsus4':{ pcs:[2,7,9],   guitar:[-1,-1,0,2,3,3], ukulele:[0,2,3,0], fingers:{guitar:[0,0,0,1,2,3], ukulele:[0,1,2,0]} },
  };
  // Powerakkorder (grundtone + kvint) – de klassiske elguitar-greb
  const PW = { E5:[0,2,2,-1,-1,-1], A5:[-1,0,2,2,-1,-1], D5:[-1,-1,0,2,3,-1], F5:[1,3,3,-1,-1,-1], G5:[3,5,5,-1,-1,-1], C5:[-1,3,5,5,-1,-1], B5:[-1,2,4,4,-1,-1] };
  for (const c in PW) {
    const sh = PW[c], open = sh.includes(0), r = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[c[0]];
    let seen = 0;
    CH[c] = { pcs:[r, (r + 7) % 12], power:true, guitar:sh, fingers:{ guitar: sh.map(f => f <= 0 ? 0 : open ? (++seen === 1 ? 1 : seen === 2 && c !== 'D5' ? 2 : 3) : (++seen === 1 ? 1 : seen === 2 ? 3 : 4)) } };
  }
  const ROOT = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 };
  const shapeKey = instr => (INSTR[instr] && INSTR[instr].shape) || instr;
  // Akkorder der kan vises/spilles på instrumentet
  const chordNames = instr => Object.keys(CH).filter(c => { const k = shapeKey(instr); return (k !== 'guitar' && k !== 'ukulele') || !!CH[c][k]; });
  const chordRoot = c => ROOT[c[0]] + (c[1] === '#' ? 1 : c[1] === 'b' ? -1 : 0);

  // Klavertoner til en akkord (rodposition omkring C4)
  function pianoChordNotes(c) {
    const r = chordRoot(c); const base = 60 + (r >= 7 ? r - 12 : r);
    return CH[c].pcs.map(pc => { let m = base + ((pc - r + 12) % 12); return m; });
  }
  // Toner der klinger i et guitar-/ukulele-greb (til lyd og visning)
  function shapeNotes(c, instr) {
    const I = INSTR[instr];
    if (instr === 'piano' || instr === 'voice') return pianoChordNotes(c);
    if (instr === 'bass') { const r = chordRoot(c); let m = 28 + ((r - 4 + 12) % 12); return [m, m + 7]; }
    const s = CH[c][shapeKey(instr)];
    return s.map((f, i) => f < 0 ? null : I.strings[i] + f).filter(x => x != null);
  }

  // "C4 D4:2 r:1 E4:.5" → noder i taktslag
  function mel(str, tr = 0) {
    let beat = 0; const out = [];
    for (const tok of str.trim().split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const [n, d0] = tok.split(':'); const d = d0 ? parseFloat(d0) : 1;
      if (n !== 'r') out.push({ m: parse(n) + tr, b: beat, d });
      beat += d;
    }
    return { events: out, beats: beat };
  }
  function chords(str) {
    let beat = 0; const out = [];
    for (const tok of str.trim().split(/\s+/)) {
      if (!tok || tok === '|') continue;
      const [c, d0] = tok.split(':'); const d = d0 ? parseFloat(d0) : 4;
      if (c !== 'r') { if (!CH[c]) throw new Error('Ukendt akkord ' + c); out.push({ c, b: beat, d }); }
      beat += d;
    }
    return { events: out, beats: beat };
  }

  // Placér toner på strenge: lavest mulige bånd, tæt på forrige hånd-position
  function fretify(events, instr, pos) {
    const I = INSTR[instr]; let prev = 0;
    for (const e of events) {
      if (e.c) continue;
      let best = null;
      for (let s = 0; s < I.strings.length; s++) {
        const f = e.m - I.strings[s];
        if (f < 0 || f > I.frets) continue;
        const cost = pos ? (f >= pos && f <= pos + 3 ? f - pos : 20 + Math.abs(f - pos)) + (I.strings.length - s) * 0.01
                         : f + (f > 0 && prev > 0 ? 0.35 * Math.abs(f - prev) : 0) + (f > 5 ? 4 : 0);
        if (!best || cost < best.cost) best = { s, f, cost };
      }
      if (!best) throw new Error('Tonen ' + name(e.m) + ' findes ikke på ' + I.name);
      e.s = best.s; e.f = best.f; if (best.f > 0) prev = best.f;
    }
    return events;
  }

  // ---------- Melodier (traditionelle / public domain) ----------
  const SONGS = {
    ode:     { t:'Ode til glæden', by:'Beethoven', bpm:96, s:'E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 E4:1.5 D4:.5 D4:2 E4 E4 F4 G4 G4 F4 E4 D4 C4 C4 D4 E4 D4:1.5 C4:.5 C4:2' },
    twinkle: { t:'Blinke lille stjerne', by:'Traditionel', bpm:92, s:'C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2 G4 G4 F4 F4 E4 E4 D4:2 G4 G4 F4 F4 E4 E4 D4:2 C4 C4 G4 G4 A4 A4 G4:2 F4 F4 E4 E4 D4 D4 C4:2' },
    jakob:   { t:'Mester Jakob', by:'Traditionel', bpm:100, s:'C4 D4 E4 C4 C4 D4 E4 C4 E4 F4 G4:2 E4 F4 G4:2 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 C4 G3 C4:2 C4 G3 C4:2' },
    saints:  { t:'When the Saints', by:'Traditionel', bpm:110, s:'r:1 C4 E4 F4 G4:4 r:1 C4 E4 F4 G4:4 r:1 C4 E4 F4 G4:2 E4:2 C4:2 E4:2 D4:4 r:1 E4 E4 D4 C4:3 C4 E4:2 G4:2 G4 F4:3 r:1 E4 F4 G4:2 E4:2 C4:2 D4:2 C4:4' },
    jingle:  { t:'Jingle Bells', by:'J. Pierpont', bpm:112, s:'E4 E4 E4:2 E4 E4 E4:2 E4 G4 C4:1.5 D4:.5 E4:4 F4 F4 F4:1.5 F4:.5 F4 E4 E4 E4:.5 E4:.5 E4 D4 D4 E4 D4:2 G4:2' },
    green:   { t:'Greensleeves', by:'Traditionel', bpm:120, ts:3, s:'A3 C4:2 D4 E4:1.5 F4:.5 E4 D4:2 B3 G3:1.5 A3:.5 B3 C4:2 A3 A3:1.5 G#3:.5 A3 B3:2 G#3 E3:2 A3 C4:2 D4 E4:1.5 F4:.5 E4 D4:2 B3 G3:1.5 A3:.5 B3 C4:1.5 B3:.5 A3 G#3:1.5 F#3:.5 G#3 A3:3' },
    grace:   { t:'Amazing Grace', by:'Traditionel', bpm:84, ts:3, s:'G3 C4:2 E4:.5 C4:.5 E4:2 D4 C4:2 A3 G3:2 G3 C4:2 E4:.5 C4:.5 E4:2 D4 G4:3 r:2 E4 G4:1.5 E4:.5 G4:.5 E4:.5 C4:2 G3 A3:1.5 C4:.5 C4:.5 A3:.5 G3:2 G3 C4:2 E4:.5 C4:.5 E4:2 D4 C4:3' },
    susanna: { t:'Oh! Susanna', by:'S. Foster', bpm:104, s:'C4:.5 D4:.5 E4 G4 G4:1.5 A4:.5 G4 E4 C4:1.5 D4:.5 E4 E4 D4 C4 D4:3 C4:.5 D4:.5 E4 G4 G4:1.5 A4:.5 G4 E4 C4:1.5 D4:.5 E4 E4 D4 D4 C4:4' },
  };

  // ---------- Kurser ----------
  function ex(id, title, sub, o) { return Object.assign({ id, title, sub, ts:4, bpm:80 }, o); }
  const songEx = (key, tr = 0, bpmF = 1) => { const S = SONGS[key]; return ex('song-' + key, S.t, S.by, { kind:'notes', bpm:Math.round(S.bpm * bpmF), ts:S.ts || 4, src:S.s, tr }); };

  const COURSES = {
    guitar: [
      { id:'g1', title:'Første skridt', color:'#f3d867', items:[
        ex('g-open-hi','De to tynde strenge','Løse e- og H-strenge', { kind:'notes', bpm:60, src:'E4:2 E4:2 B3:2 B3:2 E4 E4 B3 B3 E4:2 B3:2 E4:4' }),
        ex('g-open-all','Alle seks strenge','Løse strenge, ned og op', { kind:'notes', bpm:60, src:'E2:2 A2:2 D3:2 G3:2 B3:2 E4:2 B3:2 G3:2 D3:2 A2:2 E2:4' }),
        ex('g-bstr','Toner på H-strengen','H, C og D', { kind:'notes', bpm:66, src:'B3:2 C4:2 D4:2 C4:2 B3 C4 D4 C4 B3:4' }),
        ex('g-estr','Toner på e-strengen','E, F og G', { kind:'notes', bpm:66, src:'E4:2 F4:2 G4:2 F4:2 E4 F4 G4 F4 E4:4' }),
        ex('g-mix','Hop mellem strengene','H, C, D, E, F, G', { kind:'notes', bpm:70, src:'B3 C4 D4 E4 F4 G4:2 r:1 G4 F4 E4 D4 C4 B3:3' }),
        ex('g-scale','C-dur-skalaen','Første position', { kind:'notes', bpm:72, src:'C3 D3 E3 F3 G3 A3 B3 C4:2 r:2 C4 B3 A3 G3 F3 E3 D3 C3:2' }),
      ]},
      { id:'g2', title:'Melodier', color:'#f1b3c4', items:[
        songEx('ode'), songEx('twinkle'), songEx('jakob'), songEx('jingle'), songEx('saints'), songEx('susanna'), songEx('green'), songEx('grace'),
      ]},
      { id:'g3', title:'Akkorder', color:'#b7e0a6', items:[
        ex('g-c-em','Em','Den letteste akkord', { kind:'chords', bpm:60, src:'Em:4 Em:4 Em:2 Em:2 Em:4' }),
        ex('g-c-am','Am','To fingre flyttes ned', { kind:'chords', bpm:60, src:'Am:4 Am:4 Am:2 Am:2 Am:4' }),
        ex('g-c-emam','Skift: Em – Am','Dit første akkordskift', { kind:'chords', bpm:60, src:'Em:4 Am:4 Em:4 Am:4 Em:4 Am:4' }),
        ex('g-c-ead','E, A og D','Tre durakkorder', { kind:'chords', bpm:60, src:'E:4 A:4 D:4 A:4 E:4 D:4 A:4 E:4' }),
        ex('g-c-gc','G og C','Store greb', { kind:'chords', bpm:60, src:'G:4 G:4 C:4 C:4 G:4 C:4 G:4' }),
        ex('g-c-folk','G – C – D','Tusindvis af sange', { kind:'chords', bpm:70, src:'G:4 C:4 D:4 G:4 G:4 C:4 D:4 G:4' }),
        ex('g-c-50s','G – Em – C – D','50\'er-progressionen', { kind:'chords', bpm:72, src:'G:4 Em:4 C:4 D:4 G:4 Em:4 C:4 D:4' }),
        ex('g-c-pop','C – G – Am – F','Pop-progressionen (F er svær!)', { kind:'chords', bpm:70, src:'C:4 G:4 Am:4 F:4 C:4 G:4 Am:4 F:4' }),
        ex('g-c-strum','Rytme: Am – C – D – E','Slå to gange pr. akkord', { kind:'chords', bpm:84, src:'Am:2 Am:2 C:2 C:2 D:2 D:2 E:2 E:2 Am:2 Am:2 C:2 C:2 D:2 D:2 E:4' }),
        ex('g-c-blues','Blues i A','A7, D7 og E7', { kind:'chords', bpm:80, src:'A7:4 A7:4 A7:4 A7:4 D7:4 D7:4 A7:4 A7:4 E7:4 D7:4 A7:4 E7:4' }),
      ]},
    ],
    bass: [
      { id:'b1', title:'Første skridt', color:'#f3d867', items:[
        ex('b-open','De fire strenge','E, A, D og G', { kind:'notes', bpm:60, src:'E1:2 A1:2 D2:2 G2:2 D2:2 A1:2 E1:4' }),
        ex('b-estr','Toner på E-strengen','E, F og G', { kind:'notes', bpm:66, src:'E1:2 F1:2 G1:2 F1:2 E1 F1 G1 F1 E1:4' }),
        ex('b-astr','Toner på A-strengen','A, H og C', { kind:'notes', bpm:66, src:'A1:2 B1:2 C2:2 B1:2 A1 B1 C2 B1 A1:4' }),
        ex('b-roots','Grundtoner: C – G – Am – F','Spil bunden i pop-progressionen', { kind:'notes', bpm:72, src:'C2 C2 C2 C2 G1 G1 G1 G1 A1 A1 A1 A1 F1 F1 F1 F1 C2:4' }),
        ex('b-walk','Gå-bas i G','Fire toner pr. takt', { kind:'notes', bpm:80, src:'G1 A1 B1 D2 C2 B1 A1 G1 G1 A1 B1 D2 C2 A1 D2:2 G1:4' }),
        ex('b-scale','C-dur-skalaen','Første position', { kind:'notes', bpm:72, src:'C2 D2 E2 F2 G2 A2 B2 C3:2 r:2 C3 B2 A2 G2 F2 E2 D2 C2:2' }),
      ]},
      { id:'b2', title:'Melodier', color:'#f1b3c4', items:[
        songEx('ode', -24), songEx('jakob', -24), songEx('twinkle', -24), songEx('saints', -24), songEx('jingle', -24),
      ]},
    ],
    ukulele: [
      { id:'u1', title:'Første skridt', color:'#f3d867', items:[
        ex('u-open','De fire strenge','G, C, E og A', { kind:'notes', bpm:60, src:'G4:2 C4:2 E4:2 A4:2 E4:2 C4:2 G4:4' }),
        ex('u-astr','Toner på A-strengen','A, H og C', { kind:'notes', bpm:66, src:'A4:2 B4:2 C5:2 B4:2 A4 B4 C5 B4 A4:4' }),
        ex('u-scale','C-dur-skalaen','C, D, E, F, G, A, H, C', { kind:'notes', bpm:70, src:'C4 D4 E4 F4 G4 A4 B4 C5:2 r:2 C5 B4 A4 G4 F4 E4 D4 C4:2' }),
      ]},
      { id:'u2', title:'Akkorder', color:'#b7e0a6', items:[
        ex('u-c','C','Én finger', { kind:'chords', bpm:60, src:'C:4 C:4 C:2 C:2 C:4' }),
        ex('u-am','Am','Én finger igen', { kind:'chords', bpm:60, src:'Am:4 Am:4 Am:2 Am:2 Am:4' }),
        ex('u-cam','Skift: C – Am','Det letteste skift', { kind:'chords', bpm:60, src:'C:4 Am:4 C:4 Am:4 C:4 Am:4' }),
        ex('u-f','F','To fingre', { kind:'chords', bpm:60, src:'F:4 F:4 C:4 F:4 C:4' }),
        ex('u-pop','C – G – Am – F','Den store pop-progression', { kind:'chords', bpm:70, src:'C:4 G:4 Am:4 F:4 C:4 G:4 Am:4 F:4' }),
        ex('u-g7','C – F – G7','Klassisk ukulele', { kind:'chords', bpm:72, src:'C:4 F:4 G7:4 C:4 C:4 F:4 G7:4 C:4' }),
      ]},
      { id:'u3', title:'Melodier', color:'#f1b3c4', items:[
        songEx('ode'), songEx('twinkle'), songEx('jakob', 7), songEx('jingle'), songEx('susanna'),
      ]},
    ],
    piano: [
      { id:'p1', title:'Første skridt', color:'#f3d867', items:[
        ex('p-cde','C, D og E','Højre hånd, finger 1–3', { kind:'notes', bpm:66, src:'C4:2 D4:2 E4:2 D4:2 C4 D4 E4 D4 C4:4' }),
        ex('p-five','Fem-finger-position','C til G', { kind:'notes', bpm:72, src:'C4 D4 E4 F4 G4:2 r:2 G4 F4 E4 D4 C4:2 r:2 C4 E4 G4 E4 C4:4' }),
        ex('p-scale','C-dur-skalaen','Husk tommelfinger-overgangen', { kind:'notes', bpm:72, src:'C4 D4 E4 F4 G4 A4 B4 C5:2 r:2 C5 B4 A4 G4 F4 E4 D4 C4:2' }),
      ]},
      { id:'p2', title:'Melodier', color:'#f1b3c4', items:[
        songEx('ode'), songEx('twinkle'), songEx('jakob'), songEx('jingle'), songEx('saints'), songEx('susanna'), songEx('green'), songEx('grace'),
      ]},
      { id:'p3', title:'Akkorder', color:'#b7e0a6', items:[
        ex('p-c','C-dur','C, E og G samtidig', { kind:'chords', bpm:60, src:'C:4 C:4 C:2 C:2 C:4' }),
        ex('p-cfg','C – F – G','Hovedakkorderne i C', { kind:'chords', bpm:64, src:'C:4 F:4 G:4 C:4 C:4 F:4 G:4 C:4' }),
        ex('p-pop','C – G – Am – F','Pop-progressionen', { kind:'chords', bpm:70, src:'C:4 G:4 Am:4 F:4 C:4 G:4 Am:4 F:4' }),
      ]},
    ],
    voice: [
      { id:'v1', title:'Ram tonen', color:'#f3d867', items:[
        ex('v-one','Hold én tone','Syng og hold tonen', { kind:'notes', bpm:60, src:'C4:4 r:2 C4:4 r:2 E4:4 r:2 C4:4' }),
        ex('v-three','Tre toner','Do – mi – sol', { kind:'notes', bpm:60, src:'C4:2 E4:2 G4:2 r:2 G4:2 E4:2 C4:4' }),
        ex('v-scale','Do-re-mi','Hele skalaen op og ned', { kind:'notes', bpm:66, src:'C4:2 D4:2 E4:2 F4:2 G4:2 A4:2 B4:2 C5:4 r:2 C5:2 B4:2 A4:2 G4:2 F4:2 E4:2 D4:2 C4:4' }),
        ex('v-int','Spring','Kvinter og terser', { kind:'notes', bpm:66, src:'C4:2 G4:2 C4:2 r:2 D4:2 A4:2 D4:2 r:2 E4:2 C4:2 G4:2 E4:2 C4:4' }),
      ]},
      { id:'v2', title:'Sange', color:'#f1b3c4', items:[
        songEx('jakob', 0, .85), songEx('twinkle', 0, .85), songEx('ode', 0, .85), songEx('grace', 0, .9), songEx('susanna', 0, .85),
      ]},
    ],
  };

  // ---------- Elguitar ----------
  const gById = id => COURSES.guitar.flatMap(c => c.items).find(e => e.id === id);
  COURSES.eguitar = [
    { id:'e1', title:'Første skridt', color:'#f3d867', items:[
      ex('e-low3','De tre dybe strenge','E, A og D – her bor rocken', { kind:'notes', bpm:60, src:'E2:2 A2:2 D3:2 A2:2 E2 E2 A2 A2 D3 D3 A2 A2 E2:4' }),
      gById('g-open-all'),
      ex('e-estr','Toner på den dybe E-streng','E, F og G', { kind:'notes', bpm:66, src:'E2:2 F2:2 G2:2 F2:2 E2 F2 G2 F2 E2:4' }),
      ex('e-astr','Toner på A-strengen','A, H og C', { kind:'notes', bpm:66, src:'A2:2 B2:2 C3:2 B2:2 A2 B2 C3 B2 A2:4' }),
      ex('e-alt','Skiftevis anslag','Ned–op i ottendedele', { kind:'notes', bpm:66, src:'E2:.5 E2:.5 E2:.5 E2:.5 G2:.5 G2:.5 G2:.5 G2:.5 A2:.5 A2:.5 A2:.5 A2:.5 G2:.5 G2:.5 G2:.5 G2:.5 E2:4' }),
      gById('g-scale'),
    ]},
    { id:'e2', title:'Riffs og licks', color:'#f3c08c', items:[
      ex('e-riff1','Rock-riff i E','Dybe strenge med fast puls', { kind:'notes', bpm:84, src:'E2 E2 G2 E2 A2 G2 E2:2 E2 E2 G2 E2 B2 A2 G2:2 E2 E2 G2 E2 A2 G2 E2:2 G2 A2 B2 A2 G2 E2:3' }),
      ex('e-oct','Oktav-hop','Samme tone på to strenge', { kind:'notes', bpm:80, src:'E2 E3 E2 E3 G2 G3 G2 G3 A2 A3 A2 A3 G2 G3 E2:2' }),
      ex('e-pent','A-mol pentatonisk','Boks 1 i 5. position', { kind:'notes', bpm:72, pos:5, src:'A2 C3 D3 E3 G3 A3 C4 D4 E4 G4 A4:2 r:2 A4 G4 E4 D4 C4 A3 G3 E3 D3 C3 A2:2' }),
      ex('e-blues','Blues-skalaen','Pentatonisk plus den blå tone', { kind:'notes', bpm:72, pos:5, src:'A2 C3 D3 D#3 E3 G3 A3:2 r:1 A3 G3 E3 D#3 D3 C3 A2:2' }),
      ex('e-boogie','Boogie i A','Rock\'n\'roll-figuren', { kind:'notes', bpm:92, src:'A2 C#3 E3 F#3 G3 F#3 E3 C#3 A2 C#3 E3 F#3 G3 F#3 E3 C#3 D3 F#3 A3 B3 C4 B3 A3 F#3 A2 C#3 E3 F#3 G3 F#3 E3 C#3 E3 G#3 B3 G#3 D3 F#3 A3 F#3 A2 C#3 E3 C#3 A2:4' }),
      ex('e-lick','Dit første solo-lick','Pentatonisk i 5. position', { kind:'notes', bpm:80, pos:5, src:'E4:.5 G4:.5 A4 G4:.5 E4:.5 D4 C4:.5 D4:.5 E4 C4:.5 A3:.5 G3 A3:2 r:1 C4:.5 D4:.5 E4 G4:.5 E4:.5 D4 C4:.5 A3:.5 C4 A3:3' }),
    ]},
    { id:'e3', title:'Powerakkorder', color:'#cbbaf0', items:[
      ex('e-p-e5','E5','Din første powerakkord – kun tre strenge', { kind:'chords', bpm:60, src:'E5:4 E5:4 E5:2 E5:2 E5:4' }),
      ex('e-p-ea','Skift: E5 – A5','Samme form, én streng op', { kind:'chords', bpm:60, src:'E5:4 A5:4 E5:4 A5:4 E5:2 A5:2 E5:4' }),
      ex('e-p-ead','E5 – A5 – D5','Tre åbne powerakkorder', { kind:'chords', bpm:66, src:'E5:4 A5:4 D5:4 A5:4 E5:4 D5:4 A5:4 E5:4' }),
      ex('e-p-gc','G5 og C5','Flytbare greb – formen er den samme overalt', { kind:'chords', bpm:66, src:'G5:4 G5:4 C5:4 C5:4 G5:4 C5:4 G5:4' }),
      ex('e-p-pulse','Hold pulsen','Fire anslag pr. takt', { kind:'chords', bpm:76, src:'E5:1 E5:1 E5:1 E5:1 A5:1 A5:1 A5:1 A5:1 E5:1 E5:1 E5:1 E5:1 G5:1 G5:1 A5:2' }),
      ex('e-p-rock','Rock: E5 – G5 – A5','Tre akkorder er nok', { kind:'chords', bpm:88, src:'E5:2 E5:2 G5:2 A5:2 E5:2 E5:2 G5:2 A5:2 E5:2 G5:2 A5:2 G5:2 E5:4' }),
      ex('e-p-punk','Punk: A5 – D5 – E5','Hurtige skift', { kind:'chords', bpm:96, src:'A5:2 A5:2 D5:2 D5:2 E5:2 E5:2 D5:2 D5:2 A5:2 A5:2 D5:2 E5:2 A5:4' }),
    ]},
    { id:'e4', title:'Melodier', color:'#f1b3c4', items:[ songEx('ode'), songEx('jakob'), songEx('saints'), songEx('green'), songEx('grace') ]},
    { id:'e5', title:'Åbne akkorder', color:'#b7e0a6', items: COURSES.guitar[2].items },
  ];

  // Byg en spilbar øvelse til et instrument
  function build(exDef, instr, voiceShift = 0) {
    const I = INSTR[instr];
    let p;
    if (exDef.kind === 'chords') p = chords(exDef.src);
    else {
      let tr = exDef.tr || 0;
      if (instr === 'voice') tr += voiceShift;
      p = mel(exDef.src, tr);
      if (I.view === 'tab') fretify(p.events, instr, exDef.pos);
    }
    return { def: exDef, instr, kind: exDef.kind, bpm: exDef.bpm, ts: exDef.ts || 4, events: p.events, beats: p.beats };
  }

  function allExercises(instr) { const out = []; for (const c of COURSES[instr]) for (const e of c.items) out.push(Object.assign({ course: c.id }, e)); return out; }
  function findEx(instr, id) { return allExercises(instr).find(e => e.id === id); }

  return { parse, name, pcName, chordLabel, freq, midiOf, INSTR, STRING_COLORS, CH, chordRoot, shapeNotes, pianoChordNotes, shapeKey, chordNames, tunings,
           mel, chords, fretify, SONGS, COURSES, build, allExercises, findEx,
           setH(v) { useH = !!v; }, get useH() { return useH; } };
})();
if (typeof module !== 'undefined') module.exports = M;
