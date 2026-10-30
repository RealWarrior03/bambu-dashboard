/**
 * Frame parser for the Bambu "chamber image" protocol used by A1/P1 printers on port 6000.
 * Each frame is a 16-byte header (payload length as little-endian uint32 at offset 0)
 * followed by one JPEG image.
 */
export class BambuFrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames: Buffer[] = [];
    while (this.buffer.length >= 16) {
      const size = this.buffer.readUInt32LE(0);
      if (size === 0 || size > 10 * 1024 * 1024) {
        // Out of sync: drop everything and wait for the next frame boundary.
        this.buffer = Buffer.alloc(0);
        break;
      }
      if (this.buffer.length < 16 + size) break;
      const jpeg = this.buffer.subarray(16, 16 + size);
      if (isJpeg(jpeg)) frames.push(Buffer.from(jpeg));
      this.buffer = this.buffer.subarray(16 + size);
    }
    return frames;
  }
}

/** Splits a stream of concatenated JPEG images (ffmpeg "-f mjpeg" output). */
export class MjpegSplitter {
  private buffer: Buffer = Buffer.alloc(0);

  push(chunk: Buffer): Buffer[] {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    const frames: Buffer[] = [];
    for (;;) {
      const start = this.buffer.indexOf(SOI);
      if (start < 0) {
        this.buffer = Buffer.alloc(0);
        break;
      }
      const end = this.buffer.indexOf(EOI, start + 2);
      if (end < 0) {
        this.buffer = this.buffer.subarray(start);
        break;
      }
      frames.push(Buffer.from(this.buffer.subarray(start, end + 2)));
      this.buffer = this.buffer.subarray(end + 2);
    }
    return frames;
  }
}

const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

function isJpeg(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8;
}

/** Login packet for the port 6000 camera stream. */
export function bambuAuthPacket(accessCode: string): Buffer {
  const buf = Buffer.alloc(80);
  buf.writeUInt32LE(0x40, 0);
  buf.writeUInt32LE(0x3000, 4);
  buf.write('bblp', 16, 32, 'ascii');
  buf.write(accessCode, 48, 32, 'ascii');
  return buf;
}
