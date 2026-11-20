// Small QR code generator for the recruiting flyer (no outside library). Byte mode, error correction level M,
// versions 1–6 (up to 106 bytes, plenty for a link). qrSVG(text) returns an SVG string.

// [total codewords, ec codewords per block, blocks] for level M, versions 1–6
const SPEC = [null, [26, 10, 1], [44, 16, 1], [70, 26, 1], [100, 18, 2], [134, 24, 2], [172, 16, 4]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];

// GF(256) arithmetic for Reed–Solomon
const EXP = new Array(512), LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGen(n){
  let g = [1];
  for (let i = 0; i < n; i++) { const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); } g = ng; }
  return g;
}
function rsEc(data, n){
  const g = rsGen(n), r = data.concat(new Array(n).fill(0));
  for (let i = 0; i < data.length; i++) { const c = r[i]; if (c) for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], c); }
  return r.slice(data.length);
}

function encode(text){
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1; while (v <= 6 && (SPEC[v][0] - SPEC[v][1] * SPEC[v][2]) * 8 < 4 + 8 + bytes.length * 8) v++;
  if (v > 6) throw new Error("Text too long for this QR code");
  const [total, ecn, nb] = SPEC[v], dataLen = total - ecn * nb;
  const bits = []; const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  put(4, 4); put(bytes.length, 8); bytes.forEach(b => put(b, 8));
  put(0, Math.min(4, dataLen * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let p = 0; data.length < dataLen; p++) data.push(p % 2 ? 0x11 : 0xec);
  // split into blocks (all equal size for level M v1–6), add EC, interleave
  const per = dataLen / nb, blocks = [], ecs = [];
  for (let b = 0; b < nb; b++) { const d = data.slice(b * per, (b + 1) * per); blocks.push(d); ecs.push(rsEc(d, ecn)); }
  const out = [];
  for (let i = 0; i < per; i++) blocks.forEach(b => out.push(b[i]));
  for (let i = 0; i < ecn; i++) ecs.forEach(e => out.push(e[i]));
  return { v, codewords: out };
}

function build(text){
  const { v, codewords } = encode(text), n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array(n).fill(null));   // null = data area
  const set = (r, c, val) => { if (r >= 0 && c >= 0 && r < n && c < n) m[r][c] = val; };
  const finder = (r, c) => { for (let i = -1; i <= 7; i++) for (let j = -1; j <= 7; j++) {
    const inside = i >= 0 && i <= 6 && j >= 0 && j <= 6;
    set(r + i, c + j, inside && (i === 0 || i === 6 || j === 0 || j === 6 || (i >= 2 && i <= 4 && j >= 2 && j <= 4)) ? 1 : 0); } };
  finder(0, 0); finder(0, n - 7); finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 ? 0 : 1); set(i, 6, i % 2 ? 0 : 1); }
  const al = ALIGN[v];
  for (const r of al) for (const c of al) { if (m[r][c] !== null) continue;
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) set(r + i, c + j, Math.max(Math.abs(i), Math.abs(j)) !== 1 ? 1 : 0); }
  set(n - 8, 8, 1);   // dark module
  // reserve format areas
  for (let i = 0; i < 9; i++) { if (m[8][i] === null) m[8][i] = 0; if (m[i][8] === null) m[i][8] = 0; }
  for (let i = 0; i < 8; i++) { if (m[8][n - 1 - i] === null) m[8][n - 1 - i] = 0; if (m[n - 1 - i][8] === null) m[n - 1 - i][8] = 0; }
  const fixed = m.map(row => row.map(x => x !== null));
  // place data bits in the zig-zag
  const bits = []; codewords.forEach(c => { for (let i = 7; i >= 0; i--) bits.push((c >> i) & 1); });
  let k = 0, up = true;
  for (let c = n - 1; c > 0; c -= 2) { if (c === 6) c--;
    for (let t = 0; t < n; t++) { const r = up ? n - 1 - t : t;
      for (const cc of [c, c - 1]) if (!fixed[r][cc]) m[r][cc] = k < bits.length ? bits[k++] : 0; }
    up = !up; }
  // try all 8 masks, keep the lowest penalty
  const MASKS = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
    (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0, (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0];
  let best = null, bestScore = Infinity;
  for (let mask = 0; mask < 8; mask++) {
    const g = m.map((row, r) => row.map((x, c) => (fixed[r][c] ? x : x ^ (MASKS[mask](r, c) ? 1 : 0))));
    writeFormat(g, n, mask);
    const s = penalty(g, n); if (s < bestScore) { bestScore = s; best = g; }
  }
  return best;
}
function writeFormat(g, n, mask){
  const d = (0 << 3) | mask;   // level M = 00
  let rem = d << 10; for (let i = 14; i >= 10; i--) if (rem & (1 << i)) rem ^= 0x537 << (i - 10);
  const f = ((d << 10) | rem) ^ 0x5412, bit = i => (f >> i) & 1;
  // g[row][col]; first copy around the top-left finder, second split between the other two
  for (let i = 0; i <= 5; i++) g[i][8] = bit(i);
  g[7][8] = bit(6); g[8][8] = bit(7); g[8][7] = bit(8);
  for (let i = 9; i < 15; i++) g[8][14 - i] = bit(i);
  for (let i = 0; i < 8; i++) g[8][n - 1 - i] = bit(i);
  for (let i = 8; i < 15; i++) g[n - 15 + i][8] = bit(i);
  g[n - 8][8] = 1;
}
function penalty(g, n){
  let s = 0;
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) { let run = 1;
    for (let j = 1; j < n; j++) { const a = pass ? g[j][i] : g[i][j], b = pass ? g[j - 1][i] : g[i][j - 1];
      if (a === b) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; } }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < n - 1; j++) { const x = g[i][j]; if (x === g[i + 1][j] && x === g[i][j + 1] && x === g[i + 1][j + 1]) s += 3; }
  const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], rev = [...pat].reverse();
  for (let i = 0; i < n; i++) for (let j = 0; j <= n - 11; j++) for (const p of [pat, rev]) {
    if (p.every((v, k) => g[i][j + k] === v)) s += 40; if (p.every((v, k) => g[j + k][i] === v)) s += 40; }
  let dark = 0; g.forEach(r => r.forEach(x => { dark += x; }));
  s += Math.floor(Math.abs(dark * 100 / (n * n) - 50) / 5) * 10;
  return s;
}

export function qrSVG(text, { size = 220, color = "#000" } = {}){
  const g = build(text), n = g.length, q = 4, t = n + q * 2;
  let path = ""; g.forEach((row, r) => row.forEach((x, c) => { if (x) path += `M${c + q} ${r + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${t}" height="${t}" fill="#fff"/><path d="${path}" fill="${color}"/></svg>`;
}
