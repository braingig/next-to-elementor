/**
 * Minimal ZIP central-directory reader for security metadata.
 * Used before inflate so we can reject symlinks / bombs without trusting names alone.
 */

export type ZipCdEntry = {
  fileName: string;
  compressedSize: number;
  uncompressedSize: number;
  /** High 16 bits = Unix mode when made-by OS is Unix. */
  externalFileAttributes: number;
  versionMadeBy: number;
  generalPurposeBitFlag: number;
  compressionMethod: number;
  isDirectory: boolean;
};

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;

function readU16(buf: Uint8Array, offset: number): number {
  return buf[offset]! | (buf[offset + 1]! << 8);
}

function readU32(buf: Uint8Array, offset: number): number {
  return (
    (buf[offset]! |
      (buf[offset + 1]! << 8) |
      (buf[offset + 2]! << 16) |
      (buf[offset + 3]! << 24)) >>>
    0
  );
}

/**
 * Find End of Central Directory. Supports archives without ZIP64 (Phase 13a).
 */
function findEocdOffset(buf: Uint8Array): number | null {
  // EOCD is at least 22 bytes; comment max 65535.
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (readU32(buf, i) === EOCD_SIG) {
      return i;
    }
  }
  return null;
}

/** Unix symlink when made-by OS is Unix and mode is S_IFLNK. */
export function isZipSymlinkEntry(entry: ZipCdEntry): boolean {
  const madeByOs = (entry.versionMadeBy >> 8) & 0xff;
  // 3 = Unix, 19 = macOS (also stores Unix mode in external attrs).
  if (madeByOs !== 3 && madeByOs !== 19) {
    return false;
  }
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (mode & 0o170000) === 0o120000;
}

export function isZipEncrypted(entry: ZipCdEntry): boolean {
  return (entry.generalPurposeBitFlag & 0x1) !== 0;
}

/**
 * Parse central-directory entries. Throws on malformed structure.
 */
export function parseZipCentralDirectory(buf: Uint8Array): ZipCdEntry[] {
  if (buf.length < 22) {
    throw new Error("ZIP too small to contain an end-of-central-directory record.");
  }

  const eocd = findEocdOffset(buf);
  if (eocd == null) {
    throw new Error("ZIP end-of-central-directory signature not found.");
  }

  const totalEntries = readU16(buf, eocd + 10);
  const centralSize = readU32(buf, eocd + 12);
  const centralOffset = readU32(buf, eocd + 16);

  if (centralOffset + centralSize > buf.length) {
    throw new Error("ZIP central directory extends past end of buffer.");
  }

  // ZIP64 marker in classic fields — reject for MVP rather than mis-parse.
  if (
    totalEntries === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw new Error("ZIP64 archives are not supported in Phase 13a.");
  }

  const entries: ZipCdEntry[] = [];
  let offset = centralOffset;
  const end = centralOffset + centralSize;

  while (offset + 46 <= end && entries.length < totalEntries) {
    if (readU32(buf, offset) !== CEN_SIG) {
      throw new Error(
        `Invalid ZIP central-directory signature at offset ${offset}.`,
      );
    }

    const versionMadeBy = readU16(buf, offset + 4);
    const generalPurposeBitFlag = readU16(buf, offset + 8);
    const compressionMethod = readU16(buf, offset + 10);
    const compressedSize = readU32(buf, offset + 20);
    const uncompressedSize = readU32(buf, offset + 24);
    const fileNameLength = readU16(buf, offset + 28);
    const extraLength = readU16(buf, offset + 30);
    const commentLength = readU16(buf, offset + 32);
    const externalFileAttributes = readU32(buf, offset + 38);

    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    if (nameEnd + extraLength + commentLength > end) {
      throw new Error("ZIP central-directory entry truncates past directory end.");
    }

    const fileName = new TextDecoder("utf-8", { fatal: false }).decode(
      buf.subarray(nameStart, nameEnd),
    );

    entries.push({
      fileName,
      compressedSize,
      uncompressedSize,
      externalFileAttributes,
      versionMadeBy,
      generalPurposeBitFlag,
      compressionMethod,
      isDirectory: fileName.endsWith("/"),
    });

    offset = nameEnd + extraLength + commentLength;
  }

  if (entries.length !== totalEntries) {
    throw new Error(
      `ZIP central-directory entry count mismatch (expected ${totalEntries}, got ${entries.length}).`,
    );
  }

  return entries;
}
