// Just enough PNG for `delivery crop`: decode an 8-bit, non-interlaced PNG (grey, grey and alpha,
// RGB, RGBA; the kinds a browser screenshot and a design render produce) to RGBA, cut a box out,
// scale it up by a whole number, and encode RGBA back. Pure, node:zlib only.

import { deflateSync, inflateSync, crc32 as zcrc32 } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS = { 0: 1, 2: 3, 4: 2, 6: 4 };

/** @returns {{ width: number, height: number, data: Buffer }} RGBA, 4 bytes per pixel */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG file');
  let at = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const kind = buf.toString('latin1', at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  if (depth !== 8 || !(type in CHANNELS) || interlace) throw new Error(`unsupported PNG (bit depth ${depth}, colour type ${type}${interlace ? ', interlaced' : ''})`);
  const ch = CHANNELS[type];
  const stride = width * ch;
  const raw = inflateSync(Buffer.concat(idat));
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const up = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[i - ch] : 0;
      const b = up ? up[i] : 0;
      const c = up && i >= ch ? up[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[i] = v & 255;
    }
  }
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += ch) {
    const o = i * 4;
    if (ch === 4) px.copy(data, o, j, j + 4);
    else if (ch === 3) { data[o] = px[j]; data[o + 1] = px[j + 1]; data[o + 2] = px[j + 2]; data[o + 3] = 255; }
    else if (ch === 2) { data[o] = data[o + 1] = data[o + 2] = px[j]; data[o + 3] = px[j + 1]; }
    else { data[o] = data[o + 1] = data[o + 2] = px[j]; data[o + 3] = 255; }
  }
  return { width, height, data };
}

function chunk(kind, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const kb = Buffer.from(kind, 'latin1');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([kb, body])) >>> 0);
  return Buffer.concat([len, kb, body, crc]);
}

let TABLE = null;
function crc32(buf) {
  if (typeof zcrc32 === 'function') return zcrc32(buf);
  TABLE ??= Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** @param {{ width: number, height: number, data: Buffer }} img RGBA */
export function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * A box of an image, scaled up by a whole number (nearest pixel). A box running past the edge is
 * cut at it; a box wholly outside is an error.
 */
export function cropImage(img, { x, y, w, h, zoom = 1 }) {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(img.width, x + w), y1 = Math.min(img.height, y + h);
  if (x1 <= x0 || y1 <= y0) throw new Error(`the box ${x},${y},${w},${h} is outside the ${img.width} x ${img.height} picture`);
  const cw = x1 - x0, chh = y1 - y0;
  const out = Buffer.alloc(cw * zoom * chh * zoom * 4);
  for (let yy = 0; yy < chh * zoom; yy++) {
    for (let xx = 0; xx < cw * zoom; xx++) {
      const s = ((y0 + Math.floor(yy / zoom)) * img.width + x0 + Math.floor(xx / zoom)) * 4;
      img.data.copy(out, (yy * cw * zoom + xx) * 4, s, s + 4);
    }
  }
  return { width: cw * zoom, height: chh * zoom, data: out, box: { x: x0, y: y0, w: cw, h: chh } };
}
