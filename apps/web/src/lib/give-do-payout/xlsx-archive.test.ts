import { describe, expect, it } from "bun:test";
import { crc32, deflateRawSync } from "node:zlib";

import { strFromU8, unzipSync } from "fflate";

import { generatePayoutFixture } from "../../../../../packages/e2e/fixtures/give-do/generate";
import { parseGiveDoPayout } from "./parse";
import { sanitizeXlsxArchive } from "./xlsx-archive";

const UNREADABLE = "The file could not be read as an XLSX workbook.";

interface RawEntry {
  /** Bytes written after the local header, up to the central compressed size. */
  data: Buffer;
  flags?: number;
  /** Overrides for the local header's CRC and sizes (data-descriptor tricks). */
  local?: { compressedBytes: number; crc: number; uncompressedBytes: number };
  method: 0 | 8;
  name: string;
  /** CRC and expanded size declared in the central directory. */
  crc: number;
  uncompressedBytes: number;
}

function localHeader(
  name: Buffer,
  flags: number,
  method: number,
  crc: number,
  compressedBytes: number,
  uncompressedBytes: number
): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x0403_4b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(flags, 6);
  header.writeUInt16LE(method, 8);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(compressedBytes, 18);
  header.writeUInt32LE(uncompressedBytes, 22);
  header.writeUInt16LE(name.byteLength, 26);
  return Buffer.concat([header, name]);
}

function descriptor(crc: number, compressed: number, size: number): Buffer {
  const bytes = Buffer.alloc(16);
  bytes.writeUInt32LE(0x0807_4b50, 0);
  bytes.writeUInt32LE(crc, 4);
  bytes.writeUInt32LE(compressed, 8);
  bytes.writeUInt32LE(size, 12);
  return bytes;
}

/** Builds a ZIP byte by byte so tests can describe hostile layouts exactly. */
function buildZip(entries: RawEntry[], comment = Buffer.alloc(0)): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const flags = entry.flags ?? 0;
    const local = entry.local ?? {
      compressedBytes: entry.data.byteLength,
      crc: entry.crc,
      uncompressedBytes: entry.uncompressedBytes,
    };
    const record = Buffer.concat([
      localHeader(
        name,
        flags,
        entry.method,
        local.crc,
        local.compressedBytes,
        local.uncompressedBytes
      ),
      entry.data,
      (flags & 0x0008) === 0
        ? Buffer.alloc(0)
        : descriptor(entry.crc, entry.data.byteLength, entry.uncompressedBytes),
    ]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x0201_4b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(entry.method, 10);
    central.writeUInt32LE(entry.crc, 16);
    central.writeUInt32LE(entry.data.byteLength, 20);
    central.writeUInt32LE(entry.uncompressedBytes, 24);
    central.writeUInt16LE(name.byteLength, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    locals.push(record);
    offset += record.byteLength;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(comment.byteLength, 20);
  return Buffer.concat([...locals, directory, end, comment]);
}

function deflated(name: string, content: Uint8Array): RawEntry {
  return {
    crc: crc32(content),
    data: deflateRawSync(content),
    method: 8,
    name,
    uncompressedBytes: content.byteLength,
  };
}

/** The synthetic give.do workbook rebuilt with the hand-written ZIP writer. */
function fixtureEntries(): RawEntry[] {
  return Object.entries(unzipSync(generatePayoutFixture())).map(
    ([name, content]) => deflated(name, content)
  );
}

function withEntry(
  entries: RawEntry[],
  name: string,
  replace: (entry: RawEntry, content: Buffer) => RawEntry
): RawEntry[] {
  const parts = unzipSync(generatePayoutFixture());
  return entries.map((entry) => {
    const content = parts[entry.name];
    return entry.name === name && content
      ? replace(entry, Buffer.from(content))
      : entry;
  });
}

/** A local header for a sheet the central directory never lists. */
function hiddenSheet(): Buffer {
  const bomb = deflateRawSync(Buffer.alloc(4 * 1024 * 1024));
  const name = Buffer.from("xl/worksheets/sheet9.xml");
  return Buffer.concat([
    localHeader(name, 0, 8, 0, bomb.byteLength, 4 * 1024 * 1024),
    bomb,
  ]);
}

async function legitimateRows() {
  return (await parseGiveDoPayout(Buffer.from(generatePayoutFixture())))
    .donations.rows;
}

describe("sanitizeXlsxArchive", () => {
  it("rebuilds only the validated workbook XML parts", () => {
    const { epoch1904, workbook } = sanitizeXlsxArchive(
      buildZip([
        ...fixtureEntries(),
        deflated("docProps/thumbnail.jpeg", new Uint8Array([1, 2, 3])),
      ])
    );
    const parts = unzipSync(workbook);
    expect(epoch1904).toBe(false);
    // The same parts read-excel-file keeps: `.xml` and `.xml.rels` files.
    expect(Object.keys(parts).sort()).toEqual(
      Object.keys(unzipSync(generatePayoutFixture()))
        .filter((name) => name.endsWith(".xml") || name.endsWith(".xml.rels"))
        .sort()
    );
    expect(strFromU8(parts["xl/workbook.xml"] ?? new Uint8Array())).toContain(
      "<sheets>"
    );
  });

  it("parses the hand-built fixture with the same rows as the original", async () => {
    const result = await parseGiveDoPayout(buildZip(fixtureEntries()));
    expect(result.donations.rows).toEqual(await legitimateRows());
  });
});

describe("hostile XLSX archives", () => {
  it("rejects a deflated entry whose data region hides a descriptor and local header", async () => {
    // The reviewer's layout: flag 8 with zero local sizes, a valid deflate
    // stream, a fake PK\x07\x08 descriptor, then an unlisted sheet header.
    const archive = buildZip(
      withEntry(fixtureEntries(), "xl/workbook.xml", (entry, content) => {
        const stream = deflateRawSync(content);
        return {
          ...entry,
          data: Buffer.concat([
            stream,
            descriptor(crc32(content), stream.byteLength, content.byteLength),
            hiddenSheet(),
          ]),
          flags: 0x0008,
          local: { compressedBytes: 0, crc: 0, uncompressedBytes: 0 },
        };
      })
    );
    await expect(parseGiveDoPayout(archive)).rejects.toThrow(UNREADABLE);
  });

  it("rejects the stored-entry variant of the hidden descriptor layout", async () => {
    const archive = buildZip(
      withEntry(fixtureEntries(), "xl/workbook.xml", (entry, content) => {
        const data = Buffer.concat([
          content,
          descriptor(crc32(content), content.byteLength, content.byteLength),
          hiddenSheet(),
        ]);
        return {
          crc: crc32(data),
          data,
          flags: 0x0008,
          local: { compressedBytes: 0, crc: 0, uncompressedBytes: 0 },
          method: 0,
          name: entry.name,
          uncompressedBytes: data.byteLength,
        };
      })
    );
    await expect(parseGiveDoPayout(archive)).rejects.toThrow(UNREADABLE);
  });

  it("rejects bytes after a deflate stream ends", async () => {
    const archive = buildZip(
      withEntry(fixtureEntries(), "xl/workbook.xml", (entry) => ({
        ...entry,
        data: Buffer.concat([entry.data, hiddenSheet()]),
      }))
    );
    await expect(parseGiveDoPayout(archive)).rejects.toThrow(UNREADABLE);
  });

  it("rejects an entry whose content does not match its declared CRC", async () => {
    const archive = buildZip(
      withEntry(fixtureEntries(), "xl/workbook.xml", (entry) => ({
        ...entry,
        crc: (entry.crc + 1) >>> 0,
      }))
    );
    await expect(parseGiveDoPayout(archive)).rejects.toThrow(UNREADABLE);
  });

  it("rejects path traversal in workbook part names", async () => {
    const archive = buildZip([
      ...fixtureEntries(),
      deflated("xl/../../evil.xml", new Uint8Array([60, 97, 47, 62])),
    ]);
    await expect(parseGiveDoPayout(archive)).rejects.toThrow(UNREADABLE);
  });

  it("rejects a fake end record placed in the ZIP comment", async () => {
    const legitimate = buildZip(fixtureEntries());
    const realEnd = legitimate.subarray(legitimate.byteLength - 22);
    const fakeEnd = Buffer.from(realEnd);
    // Points at an empty directory right before the fake record.
    fakeEnd.writeUInt16LE(0, 8);
    fakeEnd.writeUInt16LE(0, 10);
    fakeEnd.writeUInt32LE(0, 12);
    const archive = buildZip(fixtureEntries(), fakeEnd);
    fakeEnd.writeUInt32LE(archive.byteLength - 22, 16);
    archive.set(fakeEnd, archive.byteLength - 22);
    await expect(parseGiveDoPayout(archive)).rejects.toThrow(UNREADABLE);
  });

  it("ignores an end-record signature inside a comment that is not the final record", async () => {
    const comment = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x05, 0x06]),
      Buffer.alloc(30, 1),
    ]);
    const result = await parseGiveDoPayout(buildZip(fixtureEntries(), comment));
    expect(result.donations.rows).toEqual(await legitimateRows());
  });
});
