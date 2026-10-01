// Google Play requires 16 KB aligned segments for apps targeting Android 15+.
import { closeSync, openSync, readSync } from 'node:fs';

const MIN_ALIGN = 16384;
const PT_LOAD = 1;

function loadAlignments(file) {
  const fd = openSync(file, 'r');
  const read = (length, position) => {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, position);
    return buffer;
  };
  const header = read(64, 0);
  const is64 = header[4] === 2;
  const phoff = Number(is64 ? header.readBigUInt64LE(32) : header.readUInt32LE(28));
  const phentsize = header.readUInt16LE(is64 ? 54 : 42);
  const phnum = header.readUInt16LE(is64 ? 56 : 44);
  const alignments = [];
  for (let i = 0; i < phnum; i++) {
    const entry = read(phentsize, phoff + i * phentsize);
    if (entry.readUInt32LE(0) === PT_LOAD) {
      alignments.push(Number(is64 ? entry.readBigUInt64LE(48) : entry.readUInt32LE(28)));
    }
  }
  closeSync(fd);
  return alignments;
}

let failed = false;
for (const file of process.argv.slice(2)) {
  const low = loadAlignments(file).filter(a => a < MIN_ALIGN);
  if (low.length) {
    console.error(`${file}: LOAD segments aligned to ${low.join(', ')}, need at least ${MIN_ALIGN}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
