/**
 * Creates a valid Windows ICO file by embedding the 512x512 PNG directly.
 * The ICO spec allows PNG-compressed images for sizes >= 256x256:
 *   - Directory entry width/height = 0  →  means 256 (or the actual PNG size)
 *   - Image data is a raw PNG blob
 * This satisfies electron-builder's "must be at least 256x256" requirement.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src  = path.join(root, 'public', 'icon-512.png');
const dest = path.join(root, 'build',  'icon.ico');

const png = fs.readFileSync(src);

// ICO ICONDIR header (6 bytes)
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);   // reserved = 0
header.writeUInt16LE(1, 2);   // type     = 1 (ICO)
header.writeUInt16LE(1, 4);   // count    = 1 image

// ICO ICONDIRENTRY (16 bytes)
//   width  = 0  → 256 (or larger; PNG header has the real dims)
//   height = 0  → 256 (same)
const entry = Buffer.alloc(16);
entry.writeUInt8(0,  0);                     // width  (0 = 256+)
entry.writeUInt8(0,  1);                     // height (0 = 256+)
entry.writeUInt8(0,  2);                     // color count (0 = no palette)
entry.writeUInt8(0,  3);                     // reserved
entry.writeUInt16LE(1,  4);                  // planes
entry.writeUInt16LE(32, 6);                  // bit count
entry.writeUInt32LE(png.length, 8);          // bytes in resource
entry.writeUInt32LE(6 + 16, 12);             // offset to image data

const ico = Buffer.concat([header, entry, png]);
fs.writeFileSync(dest, ico);

console.log(`Done: ${dest}  (${(ico.length / 1024).toFixed(1)} KB)`);
