/**
 * Just enough ZIP to reach inside an `.xlsx` and put something back.
 *
 * An xlsx is a ZIP of XML parts, and the one thing the spreadsheet library
 * here cannot write is data validation — the dropdowns that stop somebody
 * typing a rep who does not exist. Rather than hand-build an entire workbook,
 * the library writes it and this reopens the archive, edits one XML part and
 * seals it again.
 *
 * Only *stored* (uncompressed) entries are handled, which is what the library
 * produces when asked not to compress. Anything deflated throws rather than
 * being silently dropped: a half-written workbook is worse than no workbook.
 *
 * Sizes and offsets are read from the central directory, which is the
 * authoritative copy — a local header may carry zeroes when the writer used a
 * trailing data descriptor.
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const STORED = 0;

let CRC_TABLE = null;

function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[i] = c;
  }
  return CRC_TABLE;
}

export function crc32(bytes) {
  const table = crcTable();
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const utf8 = (s) => new TextEncoder().encode(s);
const fromUtf8 = (bytes) => new TextDecoder().decode(bytes);

/**
 * Reads a stored ZIP into `[{ name, bytes }]`, in central-directory order.
 */
export function readZip(buffer) {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // The end-of-central-directory record sits at the tail, after an optional
  // comment, so it has to be found by scanning backwards for its signature.
  let eocd = -1;
  for (let i = data.length - 22; i >= 0 && i >= data.length - 22 - 0xffff; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a ZIP archive: no end-of-central-directory record");

  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  const entries = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(at, true) !== CENTRAL_SIG) throw new Error("Corrupt ZIP: bad central directory entry");
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = fromUtf8(data.subarray(at + 46, at + 46 + nameLen));

    if (method !== STORED) throw new Error(`Cannot edit "${name}": the archive is compressed`);
    if (view.getUint32(localAt, true) !== LOCAL_SIG) throw new Error(`Corrupt ZIP: bad local header for "${name}"`);

    // The local header's name and extra lengths can differ from the central
    // copy's, so the data offset must be computed from the local header.
    const localNameLen = view.getUint16(localAt + 26, true);
    const localExtraLen = view.getUint16(localAt + 28, true);
    const start = localAt + 30 + localNameLen + localExtraLen;

    entries.push({ name, bytes: data.slice(start, start + size) });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Writes `[{ name, bytes }]` back out as a stored ZIP. */
export function writeZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const name = utf8(entry.name);
    const bytes = entry.bytes;
    const crc = crc32(bytes);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIG, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0, true); // flags: no data descriptor, so sizes are here
    lv.setUint16(8, STORED, true);
    lv.setUint16(10, 0, true); // mod time — a fixed stamp keeps output stable
    lv.setUint16(12, 0x21, true); // mod date: 1980-01-01, the ZIP epoch
    lv.setUint32(14, crc, true);
    lv.setUint32(18, bytes.length, true);
    lv.setUint32(22, bytes.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    parts.push(local, bytes);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, CENTRAL_SIG, true);
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0, true);
    dv.setUint16(10, STORED, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0x21, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, bytes.length, true);
    dv.setUint32(24, bytes.length, true);
    dv.setUint16(28, name.length, true);
    dv.setUint16(30, 0, true); // extra
    dv.setUint16(32, 0, true); // comment
    dv.setUint16(34, 0, true); // disk
    dv.setUint16(36, 0, true); // internal attrs
    dv.setUint32(38, 0, true); // external attrs
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);

    offset += local.length + bytes.length;
  }

  const centralSize = central.reduce((n, d) => n + d.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const all = [...parts, ...central, eocd];
  const total = all.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Replaces one part's text, leaving every other byte of the archive alone. */
export function patchZipEntry(buffer, name, replace) {
  const entries = readZip(buffer);
  const entry = entries.find((e) => e.name === name);
  if (!entry) throw new Error(`"${name}" is not in the archive`);
  entry.bytes = utf8(replace(fromUtf8(entry.bytes)));
  return writeZip(entries);
}
