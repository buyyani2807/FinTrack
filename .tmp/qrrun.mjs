
import { encodeQr } from '../src/lib/qrCode.js';
const cases = JSON.parse(process.argv[2]);
const out = cases.map(([text, version, mask]) => encodeQr(text, { minVersion: version, maxVersion: version, mask }).modules.map(r => r.map(b => b ? 1 : 0).join('')));
const auto = cases.map(([text]) => { const q = encodeQr(text); return [q.version, q.mask]; });
console.log(JSON.stringify({ out, auto }));
