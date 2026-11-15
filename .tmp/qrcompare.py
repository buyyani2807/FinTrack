import json, subprocess, sys
import qrcode
from qrcode.util import QRData, MODE_8BIT_BYTE

cases = [
    "hello",
    "upi://pay?pa=merchant@okaxis&pn=Sri%20Traders&am=1250.00&cu=INR&tn=INV-00012",
    "x" * 120,
    "A" * 300,
    "₹ unicode payee — टेस्ट",
    "y" * 900,
]
script = """
import { encodeQr } from '../src/lib/qrCode.js';
const cases = JSON.parse(process.argv[2]);
const out = cases.map(([text, version, mask]) => encodeQr(text, { minVersion: version, maxVersion: version, mask }).modules.map(r => r.map(b => b ? 1 : 0).join('')));
const auto = cases.map(([text]) => { const q = encodeQr(text); return [q.version, q.mask]; });
console.log(JSON.stringify({ out, auto }));
"""
open(".tmp/qrrun.mjs", "w").write(script)

payload = []
expected = []
for text in cases:
    data = text.encode("utf-8")
    probe = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    probe.add_data(QRData(data, mode=MODE_8BIT_BYTE))
    probe.make(fit=True)
    version = probe.version
    for mask in range(8):
        q = qrcode.QRCode(version=version, error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, mask_pattern=mask)
        q.add_data(QRData(data, mode=MODE_8BIT_BYTE))
        q.make(fit=False)
        expected.append(["".join("1" if c else "0" for c in row) for row in q.get_matrix()])
        payload.append([text, version, mask])

res = json.loads(subprocess.check_output(["node", ".tmp/qrrun.mjs", json.dumps(payload)]))
bad = [(p[0][:20], p[1], p[2]) for p, a, b in zip(payload, res["out"], expected) if a != b]
print("compared", len(payload), "mismatches", len(bad), bad[:5])
print("auto (version, mask):", res["auto"])
