// Animated cartoon EMS scenes for the background (Nov 21, Dkota: "cooler… animations… EMS cartoony, like a field incident").
// Each is one inline SVG (viewBox 1600×420, anchored to the bottom of the screen). Motion is CSS only (app.css "SCENES"),
// switched off with reduced motion or the picker's "Animations" switch. Drawn here; no image files, no outside requests.

const INK = "#1C1917";
// An ambulance, about 260 × 130, facing right. `cls` adds a class for its own motion.
const amb = (x, y, s = 1, cls = "") => `<g transform="translate(${x} ${y}) scale(${s})"><g class="amb ${cls}">
  <ellipse class="glow gr" cx="31" cy="4" rx="46" ry="30"/><ellipse class="glow gb" cx="139" cy="4" rx="46" ry="30"/>
  <rect x="0" y="12" width="172" height="96" rx="12" fill="#fff" stroke="${INK}" stroke-width="5"/>
  <path d="M172 44h48l34 34v30h-82z" fill="#fff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M180 52h36l24 24h-60z" fill="#BFDBFE" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <rect x="2" y="70" width="250" height="13" fill="#E11D48"/>
  <rect x="236" y="88" width="20" height="10" rx="3" fill="#FDE047" stroke="${INK}" stroke-width="3"/>
  <g transform="translate(86 42)" fill="#2563EB"><rect x="-5" y="-17" width="10" height="34" rx="2"/><rect x="-5" y="-17" width="10" height="34" rx="2" transform="rotate(60)"/><rect x="-5" y="-17" width="10" height="34" rx="2" transform="rotate(120)"/></g>
  <rect x="16" y="2" width="30" height="13" rx="4" class="lr" stroke="${INK}" stroke-width="3"/><rect x="124" y="2" width="30" height="13" rx="4" class="lb" stroke="${INK}" stroke-width="3"/>
  ${[52, 208].map(cx => `<g transform="translate(${cx} 110)"><g class="wheel"><circle r="22" fill="${INK}"/><circle r="9" fill="#D6D3D1"/><rect x="-2.5" y="-20" width="5" height="11" fill="#D6D3D1"/></g></g>`).join("")}
</g></g>`;
// A cartoon EMT, about 50 × 120: navy uniform with hi-vis stripes.
const emt = (x, y, s = 1, cls = "", skin = "#F2C9A0") => `<g transform="translate(${x} ${y}) scale(${s})"><g class="emt ${cls}">
  <rect x="8" y="78" width="13" height="42" rx="6" fill="#1E293B"/><rect x="27" y="78" width="13" height="42" rx="6" fill="#1E293B"/>
  <rect x="2" y="30" width="44" height="56" rx="16" fill="#1E3A8A" stroke="${INK}" stroke-width="4"/>
  <rect x="2" y="56" width="44" height="7" fill="#FACC15"/>
  <circle cx="24" cy="16" r="16" fill="${skin}" stroke="${INK}" stroke-width="4"/><path d="M8 12a16 16 0 0 1 32 0z" fill="${INK}"/>
</g></g>`;
const cone = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-14 0 L0 -40 L14 0z" fill="#F97316" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M-9 -14h18l-2.5 -8h-13z" fill="#fff"/><rect x="-20" y="-3" width="40" height="7" rx="3" fill="${INK}"/></g>`;
const cloud = (x, y, s, cls) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="${cls}"><path d="M0 40a26 26 0 0 1 26-26 36 36 0 0 1 66-6 28 28 0 0 1 46 26 20 20 0 0 1-6 40H8A20 20 0 0 1 0 40z" fill="#fff" stroke="${INK}" stroke-width="4" opacity=".9"/></g></g>`;
const tree = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-5" y="-30" width="10" height="34" fill="#92400E" stroke="${INK}" stroke-width="3"/><path d="M0 -110 L34 -30 H-34z" fill="#15803D" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M0 -130 L26 -70 H-26z" fill="#16A34A" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></g>`;
const town = cls => `<g class="${cls}">${[0, 1600].map(o => `<g transform="translate(${o} 0)" fill="#CBD5E1" stroke="${INK}" stroke-width="4">
  <rect x="40" y="200" width="120" height="130"/><rect x="190" y="160" width="90" height="170"/><rect x="300" y="230" width="140" height="100"/><path d="M300 230l70-50 70 50z"/>
  <rect x="480" y="180" width="110" height="150"/><rect x="640" y="210" width="160" height="120"/><rect x="840" y="150" width="80" height="180"/><path d="M840 150l40-40 40 40z"/>
  <rect x="960" y="220" width="130" height="110"/><rect x="1130" y="170" width="100" height="160"/><rect x="1270" y="200" width="150" height="130"/><rect x="1460" y="235" width="110" height="95"/>
  <g fill="#FEF3C7" stroke-width="3">${[[60, 220], [110, 220], [60, 270], [210, 185], [245, 185], [210, 235], [500, 200], [545, 200], [500, 250], [870, 175], [870, 225], [1150, 190], [1195, 190], [1150, 240], [1290, 220], [1350, 220]].map(([x, y]) => `<rect x="${x}" y="${y}" width="22" height="26" rx="3"/>`).join("")}</g></g>`).join("")}</g>`;
const road = `<rect x="0" y="330" width="1600" height="90" fill="#57534E" stroke="${INK}" stroke-width="5"/><rect x="0" y="322" width="1600" height="10" fill="#A8A29E"/>
  <g class="dashes">${Array.from({ length: 12 }, (_, i) => `<rect x="${i * 160}" y="372" width="80" height="9" rx="4" fill="#FDE047"/>`).join("")}</g>`;
const grass = `<rect x="0" y="318" width="1600" height="102" fill="#86EFAC" stroke="${INK}" stroke-width="5"/>`;
const ecg = "M0 210 H180 L200 190 L220 210 H250 L268 120 L290 300 L306 210 H340 L362 186 L390 210 H600";

export const SCENES = [
  { k: "code3", name: "Code 3", sub: "Lights and sirens through town",
    svg: `${town("town")}${road}${amb(560, 205, 1, "drive")}` },
  { k: "onscene", name: "On scene", sub: "A roadside call in progress",
    svg: `${tree(90, 322, 1)}${tree(1480, 322, 1.2)}${tree(1380, 322, .8)}${road}
      <g transform="translate(980 262) rotate(-9)"><g class="car"><path d="M0 60 L18 18 Q24 6 40 6 H128 Q144 6 152 18 L178 44 H214 Q228 44 228 58 V78 H0z" fill="#3B82F6" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <path d="M34 18 H86 V44 H22z M96 18 H134 Q140 18 146 26 L160 44 H96z" fill="#BFDBFE" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M200 46 l10 10 -8 8 10 8" fill="none" stroke="${INK}" stroke-width="4"/>
        ${[40, 182].map(cx => `<circle cx="${cx}" cy="80" r="20" fill="${INK}"/><circle cx="${cx}" cy="80" r="8" fill="#D6D3D1"/>`).join("")}</g></g>
      <g class="smoke">${[0, 1, 2].map(i => `<circle class="puff p${i}" cx="1190" cy="250" r="${16 + i * 5}" fill="#E7E5E4" stroke="${INK}" stroke-width="3"/>`).join("")}</g>
      ${cone(900, 352)}${cone(1290, 352)}${cone(1360, 352)}
      ${amb(470, 210, 1, "parked")}
      <g transform="translate(770 300)"><rect x="0" y="0" width="130" height="16" rx="6" fill="#E7E5E4" stroke="${INK}" stroke-width="4"/><rect x="6" y="-12" width="54" height="14" rx="6" fill="#fff" stroke="${INK}" stroke-width="3"/>${[18, 112].map(x => `<circle cx="${x}" cy="30" r="9" fill="${INK}"/><line x1="${x}" y1="16" x2="${x}" y2="24" stroke="${INK}" stroke-width="4"/>`).join("")}</g>
      ${emt(760, 196, 1, "bob")}${emt(870, 196, 1, "bob2", "#8D5524")}${emt(1235, 200, .95, "wave", "#C68642")}` },
  { k: "station", name: "The station", sub: "Home base, flag in the breeze",
    svg: `${cloud(160, 40, .9, "drift")}${cloud(900, 20, .7, "drift2")}${grass}
      <g stroke="${INK}" stroke-width="5" stroke-linejoin="round"><rect x="520" y="120" width="560" height="200" fill="#FCA5A5"/><path d="M500 124 L800 40 L1100 124z" fill="#B91C1C"/>
        <rect x="560" y="170" width="200" height="150" fill="#E7E5E4"/><rect x="840" y="170" width="200" height="150" fill="#E7E5E4"/>
        <g stroke-width="3" fill="none">${[195, 220, 245, 270, 295].map(y => `<line x1="560" y1="${y}" x2="760" y2="${y}"/><line x1="840" y1="${y}" x2="1040" y2="${y}"/>`).join("")}</g>
        <rect x="690" y="132" width="220" height="30" rx="6" fill="#fff"/></g>
      <text x="800" y="155" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="900" font-size="22" fill="#B91C1C">RESCUE SQUAD</text>
      <line x1="1200" y1="320" x2="1200" y2="80" stroke="${INK}" stroke-width="6"/><g class="flag"><path d="M1203 84 h90 v56 h-90z" fill="#fff" stroke="${INK}" stroke-width="4"/>${[0, 1, 2, 3].map(i => `<rect x="1203" y="${84 + i * 14}" width="90" height="7" fill="#DC2626"/>`).join("")}<rect x="1203" y="84" width="38" height="30" fill="#1D4ED8"/></g>
      ${tree(400, 318, 1.1)}${tree(1360, 318, .9)}${amb(240, 212, .9, "idle")}${emt(1110, 196, 1, "wave")}` },
  { k: "medevac", name: "Medevac", sub: "A helicopter on its way",
    svg: `${cloud(120, 60, 1, "drift")}${cloud(700, 30, .8, "drift2")}${cloud(1250, 80, .9, "drift")}
      <path d="M0 330 Q200 250 420 310 T860 300 T1300 290 T1600 300 V420 H0z" fill="#86EFAC" stroke="${INK}" stroke-width="5"/>
      ${tree(260, 300, .8)}${tree(1180, 296, .9)}
      <g class="heli"><g transform="translate(0 120)">
        <rect x="-90" y="-22" width="180" height="8" rx="4" fill="${INK}" class="rotor"/><rect x="-4" y="-16" width="8" height="18" fill="${INK}"/>
        <path d="M-60 0 Q-60 -2 -40 -4 H30 Q66 -4 70 30 Q72 58 40 58 H-46 Q-64 58 -64 34z" fill="#E11D48" stroke="${INK}" stroke-width="5"/>
        <path d="M30 4 Q58 6 60 30 H30z" fill="#BFDBFE" stroke="${INK}" stroke-width="4"/>
        <path d="M-64 20 H-170 V34 H-60z" fill="#E11D48" stroke="${INK}" stroke-width="5"/><g transform="translate(-170 24)"><circle r="16" class="trotor" fill="none" stroke="${INK}" stroke-width="4" stroke-dasharray="10 6"/></g>
        <g transform="translate(-8 26)" fill="#fff"><rect x="-4" y="-13" width="8" height="26" rx="2"/><rect x="-4" y="-13" width="8" height="26" rx="2" transform="rotate(60)"/><rect x="-4" y="-13" width="8" height="26" rx="2" transform="rotate(120)"/></g>
        <path d="M-40 58 V72 M30 58 V72 M-56 72 H52" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/></g></g>` },
  { k: "monitor", name: "On the monitor", sub: "A live heartbeat sweep",
    svg: `<g class="grid" stroke="#A8A29E" stroke-width="1.2" opacity=".55">${Array.from({ length: 33 }, (_, i) => `<line x1="${i * 50}" y1="90" x2="${i * 50}" y2="330"/>`).join("")}${[90, 140, 190, 240, 290, 330].map(y => `<line x1="0" y1="${y}" x2="1600" y2="${y}"/>`).join("")}</g>
      <g class="tracewrap">${[0, 600].map(o => `<path class="ecg" transform="translate(${o} 0)" d="${ecg}" fill="none" stroke="#16A34A" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>`).join("")}</g>
      <rect class="sweep" x="0" y="90" width="140" height="240"/>
      <g font-family="system-ui,sans-serif" font-weight="900"><text x="1470" y="252" font-size="20" fill="#16A34A">HR</text><text x="1470" y="300" font-size="48" fill="#16A34A" class="hr">72</text><text x="1340" y="252" font-size="20" fill="#2563EB">SpO₂</text><text x="1340" y="300" font-size="48" fill="#2563EB">98</text></g>` }];
export const sceneByKey = k => SCENES.find(s => s.k === k);
export const sceneSVG = k => { const s = sceneByKey(k); return s ? `<svg viewBox="0 0 1600 420" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" role="presentation" class="sc sc-${k}">${s.svg}</svg>` : ""; };
