// Small, bounded ZIP writer: stored entries, UTF-8 filenames and standard CRC32.
// No disk files or third-party archive service. Limits keep classic ZIP offsets safe.
export const MAX_ARCHIVE_BYTES = 64 * 1024 * 1024;
export type ZipEntry = { path: string; bytes: Buffer };
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let i = 0; i < 8; i++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export function zipArchive(entries: ZipEntry[], createdAt: Date) {
  const seen = new Set<string>();
  const files: Buffer[] = [],
    directory: Buffer[] = [];
  let offset = 0,
    centralSize = 0;
  const year = Math.max(1980, Math.min(2107, createdAt.getUTCFullYear()));
  const date =
    ((year - 1980) << 9) |
    ((createdAt.getUTCMonth() + 1) << 5) |
    createdAt.getUTCDate();
  const time =
    (createdAt.getUTCHours() << 11) |
    (createdAt.getUTCMinutes() << 5) |
    Math.floor(createdAt.getUTCSeconds() / 2);
  for (const entry of entries) {
    if (
      !/^[A-Za-z0-9_./-]+$/.test(entry.path) ||
      entry.path.startsWith("/") ||
      entry.path.split("/").includes("..") ||
      seen.has(entry.path)
    )
      throw new Error("Invalid archive path.");
    seen.add(entry.path);
    const name = Buffer.from(entry.path),
      crc = crc32(entry.bytes);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x800, 6);
    header.writeUInt16LE(time, 10);
    header.writeUInt16LE(date, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(entry.bytes.length, 18);
    header.writeUInt32LE(entry.bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.bytes.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    files.push(header, name, entry.bytes);
    directory.push(central, name);
    offset += header.length + name.length + entry.bytes.length;
    centralSize += central.length + name.length;
    if (offset + centralSize + 22 > MAX_ARCHIVE_BYTES || entries.length > 65535)
      throw new Error("Archive exceeds the 64 MiB limit.");
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...files, ...directory, end]);
}
