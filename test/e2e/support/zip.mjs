// Reads the entries of a ZIP whose files are stored (as the ones Oblitero writes).
export function readZip(buffer) {
  const files = [];
  let at = 0;
  while (at + 30 <= buffer.length && buffer.readUInt32LE(at) === 0x04034b50) {
    const size = buffer.readUInt32LE(at + 18);
    const nameLength = buffer.readUInt16LE(at + 26);
    const extraLength = buffer.readUInt16LE(at + 28);
    const start = at + 30 + nameLength + extraLength;
    files.push({ name: buffer.toString('utf8', at + 30, at + 30 + nameLength), data: buffer.subarray(start, start + size) });
    at = start + size;
  }
  return files;
}
