import { inflateRawSync } from "node:zlib";

import { strFromU8, unzipSync } from "fflate";

const CENTRAL_DIRECTORY_SIGNATURE = 0x0201_4b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x0807_4b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x0605_4b50;
const LOCAL_FILE_SIGNATURE = 0x0403_4b50;
const ZIP64_END_LOCATOR_SIGNATURE = 0x0706_4b50;
const ZIP64_EXTRA_FIELD_ID = 0x0001;

const END_RECORD_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const MAX_ENTRY_COUNT = 1000;
const MAX_ENTRY_BYTES = 25 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 50 * 1024 * 1024;
const MAX_EXPANSION_RATIO = 100;

interface ArchiveEntry {
  compressedBytes: number;
  crc32: number;
  dataOffset: number;
  flags: number;
  localHeaderOffset: number;
  method: number;
  name: Buffer;
  uncompressedBytes: number;
}

export class XlsxArchiveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxArchiveValidationError";
  }
}

function invalidArchive(): never {
  throw new Error("Invalid ZIP archive");
}

function checkRange(bytes: Buffer, offset: number, length: number): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > bytes.byteLength
  ) {
    invalidArchive();
  }
}

function findEndRecord(bytes: Buffer): number {
  if (bytes.byteLength < END_RECORD_BYTES) {
    return invalidArchive();
  }
  const earliest = Math.max(
    0,
    bytes.byteLength - END_RECORD_BYTES - MAX_ZIP_COMMENT_BYTES
  );
  for (
    let offset = bytes.byteLength - END_RECORD_BYTES;
    offset >= earliest;
    offset -= 1
  ) {
    if (
      bytes.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE &&
      offset + END_RECORD_BYTES + bytes.readUInt16LE(offset + 20) ===
        bytes.byteLength
    ) {
      return offset;
    }
  }
  return invalidArchive();
}

function containsZip64Extra(
  bytes: Buffer,
  offset: number,
  length: number
): boolean {
  const end = offset + length;
  checkRange(bytes, offset, length);
  while (offset < end) {
    checkRange(bytes, offset, 4);
    const fieldLength = bytes.readUInt16LE(offset + 2);
    checkRange(bytes, offset + 4, fieldLength);
    if (bytes.readUInt16LE(offset) === ZIP64_EXTRA_FIELD_ID) {
      return true;
    }
    offset += 4 + fieldLength;
  }
  if (offset !== end) {
    invalidArchive();
  }
  return false;
}

function validateLocalHeader(
  bytes: Buffer,
  centralDirectoryOffset: number,
  entry: ArchiveEntry,
  flags: number,
  method: number,
  crc32: number,
  localHeaderOffset: number
): number {
  checkRange(bytes, localHeaderOffset, 30);
  if (bytes.readUInt32LE(localHeaderOffset) !== LOCAL_FILE_SIGNATURE) {
    invalidArchive();
  }

  const localFlags = bytes.readUInt16LE(localHeaderOffset + 6);
  const localMethod = bytes.readUInt16LE(localHeaderOffset + 8);
  const localCrc32 = bytes.readUInt32LE(localHeaderOffset + 14);
  const localCompressedBytes = bytes.readUInt32LE(localHeaderOffset + 18);
  const localUncompressedBytes = bytes.readUInt32LE(localHeaderOffset + 22);
  const nameLength = bytes.readUInt16LE(localHeaderOffset + 26);
  const extraLength = bytes.readUInt16LE(localHeaderOffset + 28);
  const nameOffset = localHeaderOffset + 30;
  const extraOffset = nameOffset + nameLength;
  const dataOffset = extraOffset + extraLength;

  checkRange(bytes, nameOffset, nameLength);
  checkRange(bytes, extraOffset, extraLength);
  checkRange(bytes, dataOffset, entry.compressedBytes);
  if (
    localFlags !== flags ||
    localMethod !== method ||
    !bytes.subarray(nameOffset, extraOffset).equals(entry.name) ||
    containsZip64Extra(bytes, extraOffset, extraLength) ||
    dataOffset + entry.compressedBytes > centralDirectoryOffset
  ) {
    invalidArchive();
  }

  const usesDataDescriptor = (flags & 0x0008) !== 0;
  if (
    (!usesDataDescriptor &&
      (localCrc32 !== crc32 ||
        localCompressedBytes !== entry.compressedBytes ||
        localUncompressedBytes !== entry.uncompressedBytes)) ||
    (usesDataDescriptor &&
      ((localCompressedBytes !== 0 &&
        localCompressedBytes !== entry.compressedBytes) ||
        (localUncompressedBytes !== 0 &&
          localUncompressedBytes !== entry.uncompressedBytes)))
  ) {
    invalidArchive();
  }
  return dataOffset;
}

function validateCentralDirectory(bytes: Buffer): ArchiveEntry[] {
  const endRecordOffset = findEndRecord(bytes);
  if (
    endRecordOffset >= 20 &&
    bytes.readUInt32LE(endRecordOffset - 20) === ZIP64_END_LOCATOR_SIGNATURE
  ) {
    throw new XlsxArchiveValidationError(
      "ZIP64 XLSX workbooks are not supported."
    );
  }

  const diskNumber = bytes.readUInt16LE(endRecordOffset + 4);
  const centralDirectoryDisk = bytes.readUInt16LE(endRecordOffset + 6);
  const diskEntryCount = bytes.readUInt16LE(endRecordOffset + 8);
  const entryCount = bytes.readUInt16LE(endRecordOffset + 10);
  const centralDirectoryBytes = bytes.readUInt32LE(endRecordOffset + 12);
  const centralDirectoryOffset = bytes.readUInt32LE(endRecordOffset + 16);
  if (
    entryCount === 0xffff ||
    centralDirectoryBytes === 0xffff_ffff ||
    centralDirectoryOffset === 0xffff_ffff
  ) {
    throw new XlsxArchiveValidationError(
      "ZIP64 XLSX workbooks are not supported."
    );
  }
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    diskEntryCount !== entryCount
  ) {
    invalidArchive();
  }
  if (entryCount > MAX_ENTRY_COUNT) {
    throw new XlsxArchiveValidationError(
      "The XLSX workbook exceeds the safe archive limits."
    );
  }

  checkRange(bytes, centralDirectoryOffset, centralDirectoryBytes);
  if (centralDirectoryOffset + centralDirectoryBytes !== endRecordOffset) {
    invalidArchive();
  }

  const entries: ArchiveEntry[] = [];
  const names = new Set<string>();
  const localHeaderOffsets = new Set<number>();
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    checkRange(bytes, offset, 46);
    if (bytes.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE) {
      invalidArchive();
    }

    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const crc32 = bytes.readUInt32LE(offset + 16);
    const compressedBytes = bytes.readUInt32LE(offset + 20);
    const uncompressedBytes = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const startingDisk = bytes.readUInt16LE(offset + 34);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const nameOffset = offset + 46;
    const extraOffset = nameOffset + nameLength;
    const nextOffset = extraOffset + extraLength + commentLength;

    checkRange(bytes, offset, nextOffset - offset);
    if (
      compressedBytes === 0xffff_ffff ||
      uncompressedBytes === 0xffff_ffff ||
      startingDisk === 0xffff ||
      localHeaderOffset === 0xffff_ffff ||
      containsZip64Extra(bytes, extraOffset, extraLength)
    ) {
      throw new XlsxArchiveValidationError(
        "ZIP64 XLSX workbooks are not supported."
      );
    }
    if (
      startingDisk !== 0 ||
      nameLength === 0 ||
      (flags & 0x0001) !== 0 ||
      (method !== 0 && method !== 8)
    ) {
      invalidArchive();
    }

    const name = bytes.subarray(nameOffset, extraOffset);
    const nameKey = name.toString("hex");
    if (names.has(nameKey) || localHeaderOffsets.has(localHeaderOffset)) {
      invalidArchive();
    }
    names.add(nameKey);
    localHeaderOffsets.add(localHeaderOffset);

    const entry = {
      compressedBytes,
      crc32,
      dataOffset: 0,
      flags,
      localHeaderOffset,
      method,
      name,
      uncompressedBytes,
    };
    entry.dataOffset = validateLocalHeader(
      bytes,
      centralDirectoryOffset,
      entry,
      flags,
      method,
      crc32,
      localHeaderOffset
    );
    entries.push(entry);
    offset = nextOffset;
  }
  if (offset !== endRecordOffset) {
    invalidArchive();
  }

  if (
    entries.some((entry) => entry.uncompressedBytes > MAX_ENTRY_BYTES) ||
    entries.reduce((total, entry) => total + entry.uncompressedBytes, 0) >
      MAX_EXPANDED_BYTES ||
    entries.some(
      (entry) =>
        entry.uncompressedBytes > entry.compressedBytes * MAX_EXPANSION_RATIO
    )
  ) {
    throw new XlsxArchiveValidationError(
      "The XLSX workbook exceeds the safe archive limits."
    );
  }
  let expectedOffset = 0;
  for (const entry of [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset
  )) {
    if (entry.localHeaderOffset !== expectedOffset) {
      invalidArchive();
    }
    expectedOffset = entry.dataOffset + entry.compressedBytes;
    if ((entry.flags & 0x0008) !== 0) {
      checkRange(bytes, expectedOffset, 12);
      if (bytes.readUInt32LE(expectedOffset) === DATA_DESCRIPTOR_SIGNATURE) {
        expectedOffset += 4;
        checkRange(bytes, expectedOffset, 12);
      }
      if (
        bytes.readUInt32LE(expectedOffset) !== entry.crc32 ||
        bytes.readUInt32LE(expectedOffset + 4) !== entry.compressedBytes ||
        bytes.readUInt32LE(expectedOffset + 8) !== entry.uncompressedBytes
      ) {
        invalidArchive();
      }
      expectedOffset += 12;
    }
  }
  if (expectedOffset !== centralDirectoryOffset) {
    invalidArchive();
  }
  for (const entry of entries) {
    if (entry.method === 0) {
      if (entry.compressedBytes !== entry.uncompressedBytes) {
        invalidArchive();
      }
      continue;
    }
    try {
      const expanded = inflateRawSync(
        bytes.subarray(
          entry.dataOffset,
          entry.dataOffset + entry.compressedBytes
        ),
        { maxOutputLength: entry.uncompressedBytes + 1 }
      );
      if (expanded.byteLength !== entry.uncompressedBytes) {
        invalidArchive();
      }
    } catch {
      invalidArchive();
    }
  }
  return entries;
}

export function inspectXlsxArchive(bytes: Buffer): { epoch1904: boolean } {
  validateCentralDirectory(bytes);
  const files = unzipSync(bytes, {
    filter: (file) => file.name === "xl/workbook.xml",
  });
  const workbook = files["xl/workbook.xml"];
  if (!workbook) {
    return invalidArchive();
  }
  const workbookXml = strFromU8(workbook);
  return {
    epoch1904:
      /<(?:[\w.-]+:)?workbookPr\b[^>]*\bdate1904\s*=\s*["'](?:1|true)["']/i.test(
        workbookXml
      ),
  };
}
