// Minimal QR Code encoder (ISO/IEC 18004, byte mode, versions 1-40).
// Algorithm follows Project Nayuki's reference implementation (MIT).

const ECL = { L: 0, M: 1, Q: 2, H: 3 };
const FORMAT_BITS = [1, 0, 3, 2];

const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const getBit = (value, index) => ((value >>> index) & 1) !== 0;

function numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

const numDataCodewords = (ver, ecl) => Math.floor(numRawDataModules(ver) / 8)
  - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];

function gfMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDivisor(degree) {
  const result = new Array(degree - 1).fill(0);
  result.push(1);
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach((coef, i) => { result[i] ^= gfMultiply(coef, factor); });
  }
  return result;
}

function utf8Bytes(text) {
  if (typeof TextEncoder !== "undefined") return Array.from(new TextEncoder().encode(text));
  return Array.from(unescape(encodeURIComponent(text)), ch => ch.charCodeAt(0));
}

function alignmentPositions(ver, size) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
  return result;
}

function penaltyScore(modules) {
  const size = modules.length;
  let score = 0;
  const runPenalty = line => {
    let total = 0;
    let runColor = line[0];
    let runLength = 1;
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === runColor) {
        runLength += 1;
      } else {
        if (runLength >= 5) total += runLength - 2;
        runColor = line[i];
        runLength = 1;
      }
    }
    if (runLength >= 5) total += runLength - 2;
    return total;
  };
  const finderLike = line => {
    let total = 0;
    const pattern = [true, false, true, true, true, false, true];
    for (let i = 0; i + 7 <= line.length; i += 1) {
      if (!pattern.every((bit, k) => line[i + k] === bit)) continue;
      const before = i >= 4 && line.slice(i - 4, i).every(bit => !bit);
      const after = i + 11 <= line.length && line.slice(i + 7, i + 11).every(bit => !bit);
      if (before || after) total += 40;
    }
    return total;
  };
  for (let y = 0; y < size; y += 1) {
    const row = modules[y];
    const column = modules.map(r => r[y]);
    score += runPenalty(row) + runPenalty(column) + finderLike(row) + finderLike(column);
  }
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x];
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) score += 3;
    }
  }
  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0);
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  return score + Math.max(0, k) * 10;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  x => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/**
 * Encode text as a QR matrix. Returns { size, version, mask, modules } where
 * modules[y][x] is true for a dark module. Throws if the text does not fit.
 */
export function encodeQr(text, { ecc = "M", minVersion = 1, maxVersion = 40, mask: forcedMask = null } = {}) {
  const ecl = ECL[ecc] ?? ECL.M;
  const data = utf8Bytes(String(text ?? ""));
  let version = 0;
  for (let ver = minVersion; ver <= maxVersion; ver += 1) {
    const countBits = ver <= 9 ? 8 : 16;
    if (4 + countBits + data.length * 8 <= numDataCodewords(ver, ecl) * 8) {
      version = ver;
      break;
    }
  }
  if (!version) throw new Error("Text is too long for a QR code.");

  const bits = [];
  const appendBits = (value, length) => { for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1); };
  appendBits(0x4, 4);
  appendBits(data.length, version <= 9 ? 8 : 16);
  data.forEach(byte => appendBits(byte, 8));
  const capacityBits = numDataCodewords(version, ecl) * 8;
  appendBits(0, Math.min(4, capacityBits - bits.length));
  appendBits(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacityBits; pad ^= 0xec ^ 0x11) appendBits(pad, 8);
  const dataCodewords = [];
  for (let i = 0; i < bits.length; i += 8) dataCodewords.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));

  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][version];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][version];
  const rawCodewords = Math.floor(numRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = rsDivisor(blockEccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i += 1) {
    const block = dataCodewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += block.length;
    const eccBytes = rsRemainder(block, divisor);
    if (i < numShortBlocks) block.push(0);
    blocks.push(block.concat(eccBytes));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) codewords.push(block[i]);
    });
  }

  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFunction = (x, y, dark) => { modules[y][x] = dark; isFunction[y][x] = true; };

  for (let i = 0; i < size; i += 1) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }
  const drawFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFunction(x, y, dist !== 2 && dist !== 4);
      }
    }
  };
  drawFinder(3, 3);
  drawFinder(size - 4, 3);
  drawFinder(3, size - 4);
  const align = alignmentPositions(version, size);
  for (let i = 0; i < align.length; i += 1) {
    for (let j = 0; j < align.length; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) setFunction(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  const drawFormat = mask => {
    const value = (FORMAT_BITS[ecl] << 3) | mask;
    let rem = value;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const formatBits = ((value << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) setFunction(8, i, getBit(formatBits, i));
    setFunction(8, 7, getBit(formatBits, 6));
    setFunction(8, 8, getBit(formatBits, 7));
    setFunction(7, 8, getBit(formatBits, 8));
    for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, getBit(formatBits, i));
    for (let i = 0; i < 8; i += 1) setFunction(size - 1 - i, 8, getBit(formatBits, i));
    for (let i = 8; i < 15; i += 1) setFunction(8, size - 15 + i, getBit(formatBits, i));
    setFunction(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const versionBits = (version << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const dark = getBit(versionBits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < codewords.length * 8) {
          modules[y][x] = getBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7));
          bitIndex += 1;
        }
      }
    }
  }

  const applyMask = mask => {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!isFunction[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
      }
    }
  };
  let mask = forcedMask;
  if (mask == null) {
    let best = Infinity;
    for (let candidate = 0; candidate < 8; candidate += 1) {
      applyMask(candidate);
      drawFormat(candidate);
      const score = penaltyScore(modules);
      if (score < best) { best = score; mask = candidate; }
      applyMask(candidate);
    }
  }
  applyMask(mask);
  drawFormat(mask);
  return { size, version, mask, modules };
}

/** SVG path data ("M x y h1 v1 h-1 z" per dark module) with a quiet zone of `border` modules. */
export function qrSvgPath(qr, border = 4) {
  const parts = [];
  for (let y = 0; y < qr.size; y += 1) {
    for (let x = 0; x < qr.size; x += 1) {
      if (qr.modules[y][x]) parts.push(`M${x + border} ${y + border}h1v1h-1z`);
    }
  }
  return parts.join("");
}
