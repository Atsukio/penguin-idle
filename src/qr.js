/* Penguin Idle — a small QR code encoder (byte mode, low error correction, versions 1–40).
 * Used to move a colony to another device. Follows the QR Code specification (ISO/IEC 18004);
 * the structure mirrors Project Nayuki's reference encoder. No DOM, so tests can run it in Node.
 *   PI.qr.encode(text) -> { size, get(x, y) } or null when the text is too long for any QR code
 *   PI.qr.svg(text, opts) -> an SVG string, or "" when too long
 */
(function (PI) {
  "use strict";

  // Error correction level L: codewords per block and number of blocks, by version (index 0 unused)
  const ECC_PER_BLOCK = [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30];
  const NUM_BLOCKS = [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25];
  const FORMAT_L = 1;   // the two format bits for level L

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function rawModules(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

  // ---------- Reed–Solomon over GF(256) ----------
  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11d);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function divisor(degree) {
    const r = new Array(degree).fill(0);
    r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = mul(r[j], root);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      root = mul(root, 0x02);
    }
    return r;
  }
  function remainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= mul(c, f); });
    }
    return r;
  }

  function utf8(text) {
    const s = unescape(encodeURIComponent(text));
    const out = new Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  function encode(text) {
    const bytes = utf8(String(text));
    // Smallest version that fits: 4 mode bits + the length field + the data
    let ver = 1;
    for (; ver <= 40; ver++) {
      const lenBits = ver <= 9 ? 8 : 16;
      if (4 + lenBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
    }
    if (ver > 40) return null;
    const size = ver * 4 + 17;
    const capBits = dataCodewords(ver) * 8;

    // Bit stream: byte mode, length, data, terminator, padding
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0x4, 4);
    put(bytes.length, ver <= 9 ? 8 : 16);
    bytes.forEach(b => put(b, 8));
    put(0, Math.min(4, capBits - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < capBits; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

    // Split into blocks, add error correction, interleave
    const nBlocks = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver];
    const raw = Math.floor(rawModules(ver) / 8);
    const nShort = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks);
    const div = divisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nBlocks; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = remainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const codewords = [];
    for (let i = 0; i < blocks[0].length; i++) {
      blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) codewords.push(b[i]); });
    }

    // ---------- Draw ----------
    const grid = Array.from({ length: size }, () => new Array(size).fill(false));
    const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
    const setF = (x, y, dark) => { grid[y][x] = dark; fixed[y][x] = true; };

    for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }   // timing
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setF(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ver > 1) {
      const n = Math.floor(ver / 7) + 2;
      const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
      const pos = [6];
      for (let p = size - 7; pos.length < n; p -= step) pos.splice(1, 0, p);
      pos.forEach((px, i) => pos.forEach((py, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(px + dx, py + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }));
    }
    const drawFormat = mask => {
      const d = (FORMAT_L << 3) | mask;
      let rem = d;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((d << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setF(8, i, bit(b, i));
      setF(8, 7, bit(b, 6)); setF(8, 8, bit(b, 7)); setF(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(b, i));
      setF(8, size - 8, true);   // the dark module
    };
    drawFormat(0);   // reserve the format areas; redrawn with the chosen mask below
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const b = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const a = size - 11 + (i % 3), c = Math.floor(i / 3);
        setF(a, c, bit(b, i)); setF(c, a, bit(b, i));
      }
    }

    // Codewords in the zigzag order, right to left in two-column strips
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
        if (!fixed[y][x] && i < codewords.length * 8) { grid[y][x] = bit(codewords[i >>> 3], 7 - (i & 7)); i++; }
      }
    }

    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const applyMask = m => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fixed[y][x] && MASKS[m](x, y)) grid[y][x] = !grid[y][x];
    };

    // Pick the mask with the lowest penalty, as the spec asks, so scanners read it easily
    let best = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      const sc = penalty(grid, size);
      if (sc < bestScore) { bestScore = sc; best = m; }
      applyMask(m);   // masks are their own inverse
    }
    applyMask(best); drawFormat(best);
    return { size, version: ver, get: (x, y) => x >= 0 && x < size && y >= 0 && y < size && grid[y][x] };
  }

  function penalty(g, size) {
    let score = 0;
    const lines = [];
    for (let y = 0; y < size; y++) lines.push(g[y]);
    for (let x = 0; x < size; x++) lines.push(g.map(row => row[x]));
    const F1 = [true, false, true, true, true, false, true, false, false, false, false];
    const F2 = [false, false, false, false, true, false, true, true, true, false, true];
    lines.forEach(line => {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && line[i] === line[i - 1]) { run++; continue; }
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
      for (let i = 0; i + 11 <= size; i++) {   // finder-like patterns
        let a = true, b = true;
        for (let k = 0; k < 11; k++) { if (line[i + k] !== F1[k]) a = false; if (line[i + k] !== F2[k]) b = false; }
        if (a) score += 40;
        if (b) score += 40;
      }
    });
    let dark = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (g[y][x]) dark++;
      if (x + 1 < size && y + 1 < size && g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) score += 3;
    }
    const k = Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1;
    return score + Math.max(0, k) * 10;
  }

  function svg(text, { border = 4, dark = "#1d1626", light = "#fff" } = {}) {
    const q = encode(text);
    if (!q) return "";
    const n = q.size + border * 2;
    let d = "";
    for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.get(x, y)) d += `M${x + border},${y + border}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
  }

  PI.qr = { encode, svg };
})(typeof globalThis !== "undefined" ? (globalThis.PI = globalThis.PI || {}) : (window.PI = window.PI || {}));
