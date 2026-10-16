import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/**
 * A synthetic signature: a looping pen line on a transparent background,
 * drawn the way the pad exports one (dark ink, trimmed PNG).
 */
export function syntheticSignaturePng(width = 480, height = 160): Buffer {
  const pixels = Buffer.alloc(width * height * 4);
  const ink = [0x0f, 0x1b, 0x24];
  const dot = (cx: number, cy: number, r: number) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y += 1) {
      for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) {
          continue;
        }
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) {
          const i = (y * width + x) * 4;
          pixels[i] = ink[0] ?? 0;
          pixels[i + 1] = ink[1] ?? 0;
          pixels[i + 2] = ink[2] ?? 0;
          pixels[i + 3] = 255;
        }
      }
    }
  };
  for (let t = 0; t <= 1; t += 0.0005) {
    const x = 20 + t * (width - 40);
    const y =
      height / 2 +
      Math.sin(t * Math.PI * 7) * height * 0.28 +
      Math.cos(t * Math.PI * 17) * height * 0.08;
    dot(x, y, 2.6);
  }
  // An underline flourish.
  for (let t = 0; t <= 1; t += 0.001) {
    dot(60 + t * (width - 120), height * 0.86 - Math.sin(t * Math.PI) * 6, 2);
  }
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    rows[y * (width * 4 + 1)] = 0;
    pixels.copy(
      rows,
      y * (width * 4 + 1) + 1,
      y * width * 4,
      (y + 1) * width * 4
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
