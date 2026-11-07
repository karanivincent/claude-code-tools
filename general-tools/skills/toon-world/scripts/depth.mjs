import { pipeline, RawImage } from '@huggingface/transformers';
import sharp from 'sharp';
const [,, model, ...files] = process.argv;
const est = await pipeline('depth-estimation', model, { dtype: 'fp32' });
for (const f of files) {
  const img = await RawImage.read(f);
  const t0 = Date.now();
  const out = await est(img);
  const d = out.predicted_depth; // tensor HxW
  const [h, w] = d.dims.slice(-2);
  const data = d.data; let mn = Infinity, mx = -Infinity;
  for (const v of data) { if (v < mn) mn = v; if (v > mx) mx = v; }
  const u8 = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) u8[i] = Math.round((data[i] - mn) / (mx - mn) * 255);
  const name = f.split('/').pop().replace('.png', '');
  (await import("fs")).writeFileSync(`${name}.f32`, Buffer.from(new Float32Array(data).buffer));
  await sharp(Buffer.from(u8), { raw: { width: w, height: h, channels: 1 } }).png().toFile(`${name}-depth-raw.png`);
  console.log(name, w, h, mn, mx, Date.now() - t0, 'ms');
}
