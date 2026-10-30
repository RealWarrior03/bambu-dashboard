import { describe, expect, it } from 'vitest';
import { BambuFrameParser, MjpegSplitter, bambuAuthPacket } from '../src/camera/parsers';

function jpeg(fill: number, size = 32): Buffer {
  const buf = Buffer.alloc(size, fill);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[size - 2] = 0xff;
  buf[size - 1] = 0xd9;
  return buf;
}

function bambuFrame(payload: Buffer): Buffer {
  const header = Buffer.alloc(16);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

describe('BambuFrameParser', () => {
  it('extracts frames across arbitrary chunk boundaries', () => {
    const a = jpeg(1);
    const b = jpeg(2, 50);
    const stream = Buffer.concat([bambuFrame(a), bambuFrame(b)]);
    const parser = new BambuFrameParser();
    const frames: Buffer[] = [];
    for (let i = 0; i < stream.length; i += 7)
      frames.push(...parser.push(stream.subarray(i, i + 7)));
    expect(frames).toEqual([a, b]);
  });
});

describe('MjpegSplitter', () => {
  it('splits concatenated JPEGs', () => {
    const a = jpeg(3);
    const b = jpeg(4);
    const splitter = new MjpegSplitter();
    const stream = Buffer.concat([Buffer.from([0, 0]), a, b]);
    const frames = [
      ...splitter.push(stream.subarray(0, 20)),
      ...splitter.push(stream.subarray(20)),
    ];
    expect(frames).toEqual([a, b]);
  });
});

describe('bambuAuthPacket', () => {
  it('has the expected layout', () => {
    const p = bambuAuthPacket('12345678');
    expect(p.length).toBe(80);
    expect(p.readUInt32LE(0)).toBe(0x40);
    expect(p.readUInt32LE(4)).toBe(0x3000);
    expect(p.subarray(16, 20).toString()).toBe('bblp');
    expect(p.subarray(48, 56).toString()).toBe('12345678');
    expect(p[56]).toBe(0);
  });
});
