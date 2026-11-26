import assert from 'node:assert/strict';
import qrcode, { qrcode as namedQrcode, stringToBytes } from '../../frontend/src/vendor/qrcode.mjs';

const BYTE_BITS = 8;
const QR_VERSION_OFFSET = 17;
const QR_VERSION_STEP = 4;
const FINDER_SIZE = 7;
const FINDER_BORDER = 8;
const FORMAT_SIZE = 15;
const TIMING_POSITION = 6;
const FORMAT_POSITION = 8;
const V1_CODEWORDS = 26;
const FIELD_POLYNOMIAL = 0x11d;
const FIELD_SIZE = 256;
const FORMAT_WORDS = {
  L: [0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976],
  M: [0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0],
  Q: [0x355f, 0x3068, 0x3f31, 0x3a06, 0x24b4, 0x2183, 0x2eda, 0x2bed],
  H: [0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b],
};
const V1_PARITY_BYTES = { L: 7, M: 10, Q: 13, H: 17 };
const MASKS = [
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (_, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => (row * col) % 2 + (row * col) % 3 === 0,
  (row, col) => ((row * col) % 2 + (row * col) % 3) % 2 === 0,
  (row, col) => ((row + col) % 2 + (row * col) % 3) % 2 === 0,
];
const GIF = {
  prefix: 'data:image/gif;base64,',
  signatureBytes: 6,
  widthOffset: 6,
  heightOffset: 8,
  paletteOffset: 13,
  imageOffset: 19,
  imageDescriptorBytes: 10,
  minimumCodeSizeOffset: 29,
  blocksOffset: 30,
  imageSeparator: 0x2c,
  trailer: 0x3b,
  maxCodeBits: 12,
};

function makeQr(data, mode = 'Byte', version = 1, level = 'M') {
  const qr = qrcode(version, level);
  qr.addData(data, mode);
  qr.make();
  return qr;
}

function matrix(qr) {
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

function assertStringThrow(action, expected) {
  assert.throws(action, (error) => {
    assert.equal(typeof error, 'string');
    if (expected instanceof RegExp) assert.match(error, expected);
    else assert.equal(error, expected);
    return true;
  });
}

function readFormat(qr, level) {
  const size = qr.getModuleCount();
  const verticalRows = [0, 1, 2, 3, 4, 5, 7, 8, ...Array.from({ length: 7 }, (_, index) => size - 7 + index)];
  const horizontalColumns = [...Array.from({ length: 8 }, (_, index) => size - 1 - index), 7, 5, 4, 3, 2, 1, 0];
  let vertical = 0;
  let horizontal = 0;
  for (let bit = 0; bit < FORMAT_SIZE; bit++) {
    vertical |= Number(qr.isDark(verticalRows[bit], FORMAT_POSITION)) << bit;
    horizontal |= Number(qr.isDark(FORMAT_POSITION, horizontalColumns[bit])) << bit;
  }
  assert.equal(vertical, horizontal, 'both format information copies agree');
  const mask = FORMAT_WORDS[level].indexOf(vertical);
  assert.notEqual(mask, -1, 'format BCH word identifies the requested correction level and a legal mask');
  return mask;
}

function assertStructure(qr, version, level) {
  const size = version * QR_VERSION_STEP + QR_VERSION_OFFSET;
  assert.equal(qr.getModuleCount(), size);
  for (const row of matrix(qr)) for (const value of row) assert.equal(typeof value, 'boolean');
  const finder = ['1111111', '1000001', '1011101', '1011101', '1011101', '1000001', '1111111'];
  for (const [top, left] of [[0, 0], [0, size - FINDER_SIZE], [size - FINDER_SIZE, 0]]) {
    for (let row = 0; row < FINDER_SIZE; row++) {
      for (let col = 0; col < FINDER_SIZE; col++) {
        assert.equal(qr.isDark(top + row, left + col), finder[row][col] === '1');
      }
    }
  }
  for (let coordinate = FINDER_BORDER; coordinate < size - FINDER_BORDER; coordinate++) {
    assert.equal(qr.isDark(TIMING_POSITION, coordinate), coordinate % 2 === 0);
    assert.equal(qr.isDark(coordinate, TIMING_POSITION), coordinate % 2 === 0);
  }
  assert.equal(qr.isDark(size - FINDER_BORDER, FORMAT_POSITION), true, 'fixed dark module');
  return readFormat(qr, level);
}

function v1Codewords(qr, level) {
  const size = qr.getModuleCount();
  const mask = readFormat(qr, level);
  const bits = [];
  let upward = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === TIMING_POSITION) right--;
    for (let step = 0; step < size; step++) {
      const row = upward ? size - 1 - step : step;
      for (const col of [right, right - 1]) {
        const reserved = (row <= FINDER_BORDER && col <= FINDER_BORDER)
          || (row <= FINDER_BORDER && col >= size - FINDER_BORDER)
          || (row >= size - FINDER_BORDER && col <= FINDER_BORDER)
          || row === TIMING_POSITION || col === TIMING_POSITION;
        if (!reserved) bits.push(Number(qr.isDark(row, col) !== MASKS[mask](row, col)));
      }
    }
    upward = !upward;
  }
  assert.equal(bits.length, V1_CODEWORDS * BYTE_BITS);
  return Array.from({ length: V1_CODEWORDS }, (_, index) => Number.parseInt(bits.slice(index * BYTE_BITS, (index + 1) * BYTE_BITS).join(''), 2));
}

function gfMultiply(left, right) {
  let result = 0;
  while (right > 0) {
    if (right & 1) result ^= left;
    right >>>= 1;
    left <<= 1;
    if (left >= FIELD_SIZE) left ^= FIELD_POLYNOMIAL;
  }
  return result;
}

function assertParity(words, level) {
  let root = 1;
  for (let exponent = 0; exponent < V1_PARITY_BYTES[level]; exponent++) {
    let syndrome = 0;
    for (const word of words) syndrome = gfMultiply(syndrome, root) ^ word;
    assert.equal(syndrome, 0, `Reed-Solomon syndrome ${exponent}`);
    root = gfMultiply(root, 2);
  }
}

function referenceParity(data, parityLength) {
  let generator = [1];
  let root = 1;
  for (let exponent = 0; exponent < parityLength; exponent++) {
    const product = Array(generator.length + 1).fill(0);
    for (const [index, coefficient] of generator.entries()) {
      product[index] ^= coefficient;
      product[index + 1] ^= gfMultiply(coefficient, root);
    }
    generator = product;
    root = gfMultiply(root, 2);
  }
  const remainder = [...data, ...Array(parityLength).fill(0)];
  for (let offset = 0; offset < data.length; offset++) {
    const leading = remainder[offset];
    for (const [index, coefficient] of generator.entries()) {
      remainder[offset + index] ^= gfMultiply(coefficient, leading);
    }
  }
  return remainder.slice(data.length);
}

function assertPayloadPrefix(qr, level, expectedBits) {
  const words = v1Codewords(qr, level);
  const bits = words.map((word) => word.toString(2).padStart(BYTE_BITS, '0')).join('');
  assert.equal(bits.slice(0, expectedBits.length), expectedBits);
  assertParity(words, level);
}

function decodeGif(url) {
  assert.ok(url.startsWith(GIF.prefix));
  const encoded = url.slice(GIF.prefix.length);
  const bytes = Buffer.from(encoded, 'base64');
  assert.equal(bytes.toString('base64'), encoded, 'canonical base64 padding and alphabet');
  assert.equal(bytes.toString('ascii', 0, GIF.signatureBytes), 'GIF87a');
  const width = bytes.readUInt16LE(GIF.widthOffset);
  const height = bytes.readUInt16LE(GIF.heightOffset);
  assert.deepEqual([...bytes.subarray(GIF.paletteOffset, GIF.imageOffset)], [0, 0, 0, 255, 255, 255]);
  assert.equal(bytes[GIF.imageOffset], GIF.imageSeparator);
  assert.equal(bytes.readUInt16LE(GIF.imageOffset + 1), 0);
  assert.equal(bytes.readUInt16LE(GIF.imageOffset + 3), 0);
  assert.equal(bytes.readUInt16LE(GIF.imageOffset + 5), width);
  assert.equal(bytes.readUInt16LE(GIF.imageOffset + 7), height);
  assert.equal(bytes[GIF.imageOffset + GIF.imageDescriptorBytes - 1], 0);
  let cursor = GIF.blocksOffset;
  const blocks = [];
  while (bytes[cursor] !== 0) {
    const length = bytes[cursor++];
    assert.ok(cursor + length < bytes.length);
    blocks.push(bytes.subarray(cursor, cursor + length));
    cursor += length;
  }
  assert.equal(bytes[++cursor], GIF.trailer);
  assert.equal(cursor + 1, bytes.length);
  const compressed = Buffer.concat(blocks);
  const minimumBits = bytes[GIF.minimumCodeSizeOffset];
  const clear = 1 << minimumBits;
  const end = clear + 1;
  let dictionary = [];
  let codeBits = minimumBits + 1;
  let nextCode = end + 1;
  let bitPosition = 0;
  let previous;
  const pixels = [];
  while (bitPosition + codeBits <= compressed.length * BYTE_BITS) {
    let code = 0;
    for (let bit = 0; bit < codeBits; bit++) {
      code |= ((compressed[Math.floor(bitPosition / BYTE_BITS)] >>> (bitPosition % BYTE_BITS)) & 1) << bit;
      bitPosition++;
    }
    if (code === clear) {
      dictionary = Array.from({ length: clear }, (_, value) => [value]);
      codeBits = minimumBits + 1;
      nextCode = end + 1;
      previous = undefined;
      continue;
    }
    if (code === end) {
      assert.equal(pixels.length, width * height);
      return { width, height, pixels };
    }
    const entry = dictionary[code] ?? (code === nextCode && previous ? [...previous, previous[0]] : undefined);
    assert.ok(entry, `valid LZW dictionary code ${code}`);
    pixels.push(...entry);
    if (previous) {
      dictionary[nextCode++] = [...previous, entry[0]];
      if (nextCode === 1 << codeBits && codeBits < GIF.maxCodeBits) codeBits++;
    }
    previous = entry;
  }
  assert.fail('GIF raster must terminate with an LZW end code');
}

function assertGif(qr, url, cellSize, margin) {
  const { width, height, pixels } = decodeGif(url);
  const moduleCount = qr.getModuleCount();
  const size = moduleCount * cellSize + margin * 2;
  assert.equal(width, size);
  assert.equal(height, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const inside = row >= margin && col >= margin && row < size - margin && col < size - margin;
      const dark = inside && qr.isDark(Math.floor((row - margin) / cellSize), Math.floor((col - margin) / cellSize));
      assert.equal(pixels[row * size + col], dark ? 0 : 1, `GIF pixel ${row},${col}`);
    }
  }
}

assert.equal(qrcode, namedQrcode);
assert.equal(qrcode.stringToBytes, stringToBytes);
assert.deepEqual(stringToBytes('A\u0000éĀ友😀'), [65, 0, 233, 0, 203, 61, 0]);
assert.deepEqual(stringToBytes(''), []);

const unmade = qrcode(1, 'M');
assert.equal(unmade.getModuleCount(), 0);
assertStringThrow(() => unmade.isDark(0, 0), '0,0');
assertStringThrow(() => unmade.addData('text', 'Unknown'), 'mode:Unknown');
const hello = makeQr('HELLO WORLD', 'Alphanumeric');
assertStructure(hello, 1, 'M');
const helloWords = v1Codewords(hello, 'M');
assert.deepEqual(helloWords.slice(0, 16), [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17]);
assertParity(helloWords, 'M');
for (const [row, col] of [[-1, 0], [0, -1], [21, 0], [0, 21]]) {
  assertStringThrow(() => hello.isDark(row, col), `${row},${col}`);
}
const originalMatrix = matrix(hello);
hello.make();
assert.deepEqual(matrix(hello), originalMatrix, 'repeated make preserves the cached codewords');
hello.addData('!');
hello.make();
const mixed = qrcode(1, 'M');
mixed.addData('HELLO WORLD', 'Alphanumeric');
mixed.addData('!');
mixed.make();
assert.deepEqual(matrix(hello), matrix(mixed), 'adding a segment invalidates cached encoded data');
assert.notDeepEqual(matrix(hello), originalMatrix);

for (const level of Object.keys(FORMAT_WORDS)) {
  const qr = makeQr('01234567', 'Numeric', 1, level);
  assertStructure(qr, 1, level);
  assertPayloadPrefix(qr, level, '00010000001000000000110001010110011000011');
}
for (const [data, bits] of [
  ['', '00010000000000'],
  ['1', '000100000000010001'],
  ['12', '000100000000100001100'],
  ['123', '000100000000110001111011'],
  ['1234', '0001000000010000011110110100'],
]) assertPayloadPrefix(makeQr(data, 'Numeric'), 'M', bits);
for (const data of ['a', '/', ':', '12x']) {
  assertStringThrow(() => makeQr(data, 'Numeric'), `illegal char :${data.at(-1)}`);
}
for (const data of ['a', '[', 'A!']) {
  assertStringThrow(() => makeQr(data, 'Alphanumeric'), `illegal char :${data.at(-1)}`);
}
assertPayloadPrefix(makeQr('A', 'Byte'), 'M', '01000000000101000001');
assertPayloadPrefix(makeQr('A', 'Alphanumeric'), 'M', '0010000000001001010');
assertParity(v1Codewords(makeQr('0AZ $%*+-./:', 'Alphanumeric'), 'M'), 'M');
assert.deepEqual(matrix(makeQr('A', '')), matrix(makeQr('A', 'Byte')));
const empty = qrcode(0, 'L');
empty.make();
assertStructure(empty, 1, 'L');
assertParity(v1Codewords(empty, 'L'), 'L');

let zeroLeadingParityFixture;
for (let first = 0; first < FIELD_SIZE && !zeroLeadingParityFixture; first++) {
  for (let second = 0; second < FIELD_SIZE; second++) {
    const data = [0x40, 0x20 | (first >>> 4), ((first & 0x0f) << 4) | (second >>> 4), (second & 0x0f) << 4];
    const padding = [0xec, 0x11];
    const dataLength = V1_CODEWORDS - V1_PARITY_BYTES.M;
    for (let pad = 0; data.length < dataLength; pad++) data.push(padding[pad % padding.length]);
    const parity = referenceParity(data, V1_PARITY_BYTES.M);
    if (parity[0] === 0) {
      zeroLeadingParityFixture = { payload: String.fromCharCode(first, second), words: [...data, ...parity] };
      break;
    }
  }
}
assert.ok(zeroLeadingParityFixture, 'two-byte inputs include a symbol whose error-correction block starts with zero');
const zeroLeadingParity = v1Codewords(makeQr(zeroLeadingParityFixture.payload), 'M');
assert.deepEqual(zeroLeadingParity, zeroLeadingParityFixture.words, 'parity blocks retain leading zero coefficients rather than shifting later codewords');
assertParity(zeroLeadingParity, 'M');

for (const [level, capacity] of [['L', 17], ['M', 14], ['Q', 11], ['H', 7]]) {
  const atLimit = makeQr('a'.repeat(capacity), 'Byte', 0, level);
  assertStructure(atLimit, 1, level);
  assertParity(v1Codewords(atLimit, level), level);
  assertStructure(makeQr('a'.repeat(capacity + 1), 'Byte', 0, level), 2, level);
  assertStringThrow(() => makeQr('a'.repeat(capacity + 1), 'Byte', 1, level), /^code length overflow\. \(\d+>\d+\)$/);
}
assertStructure(makeQr('1'.repeat(41), 'Numeric', 1, 'L'), 1, 'L');
assertStringThrow(() => makeQr('1'.repeat(42), 'Numeric', 1, 'L'), 'code length overflow. (154>152)');
assertStringThrow(() => makeQr('A', 'Byte', 0, 'invalid'), 'bad rs block @ typeNumber:1/errorCorrectionLevel:undefined');
assert.throws(() => makeQr('A', 'Byte', 41), TypeError);
const largest = makeQr('a'.repeat(2953), 'Byte', 0, 'L');
assertStructure(largest, 40, 'L');
assertStringThrow(() => makeQr('a'.repeat(2954), 'Byte', 0, 'L'), 'code length overflow. (23652>23648)');

const unicodeMappings = [
  [0x53cb, 0x9746], [0x6f22, 0x8abf], [0x5b57, 0x8e9a], [0x8317, 0xe4aa],
  [0x00e9, 0x8040], [0x00f1, 0xec00], [0x00a3, 0x00a3], [0xffff, 0xfffe],
];
const mappingBytes = Buffer.alloc(unicodeMappings.length * 4);
for (const [index, [unicode, encoded]] of unicodeMappings.entries()) {
  mappingBytes.writeUInt16BE(unicode, index * 4);
  mappingBytes.writeUInt16BE(encoded, index * 4 + 2);
}
const mappingBase64 = mappingBytes.toString('base64');
const sjis = qrcode.createStringToBytes(` \n${mappingBase64.slice(0, 5)}\t${mappingBase64.slice(5)}\r`, unicodeMappings.length);
assert.deepEqual(sjis('A友漢字茗£☃\uffff'), [65, 151, 70, 138, 191, 142, 154, 228, 170, 163, 63, 255, 254]);
assert.deepEqual(sjis(''), []);
assert.deepEqual(qrcode.createStringToBytes('', 0)('abc☃'), [97, 98, 99, 63]);
assert.deepEqual(qrcode.createStringToBytes('+++++g==', 1)('\ufbef'), [0xbe, 0xfa]);
assertStringThrow(() => qrcode.createStringToBytes(mappingBase64, 1), '8 != 1');
assertStringThrow(() => qrcode.createStringToBytes('AA==', 0), 'eof');
assertStringThrow(() => qrcode.createStringToBytes('A', 0), 'unexpected end of file./6');
assertStringThrow(() => qrcode.createStringToBytes('!', 0), 'c:33');
assertStringThrow(() => qrcode.createStringToBytes('AAAA', 0), 'eof');
assertStringThrow(() => makeQr('友', 'Kanji'), 'sjis not supported.');
const defaultConverter = qrcode.stringToBytes;
try {
  qrcode.stringToBytes = qrcode.createStringToBytes(Buffer.from([0x53, 0xcb, 0x81, 0x40]).toString('base64'), 1);
  assertStringThrow(() => makeQr('友', 'Kanji'), 'sjis not supported.');
  qrcode.stringToBytes = sjis;
  assertPayloadPrefix(makeQr('友', 'Kanji'), 'M', '1000000000011000010000110');
  assertParity(v1Codewords(makeQr('漢字茗', 'Kanji'), 'M'), 'M');
  assertStringThrow(() => makeQr('é', 'Kanji'), 'illegal char at 1/32832');
  assertStringThrow(() => makeQr('ñ', 'Kanji'), 'illegal char at 1/60416');
  assertStringThrow(() => makeQr('A', 'Kanji'), 'illegal char at 1');
  for (const version of [7, 10, 27]) {
    const qr = qrcode(version, 'Q');
    for (const [data, mode] of [['12345', 'Numeric'], ['AB $%*+-./:', 'Alphanumeric'], ['room-link', 'Byte'], ['友漢字茗', 'Kanji']]) qr.addData(data, mode);
    qr.make();
    assertStructure(qr, version, 'Q');
    const center = qr.getModuleCount() - FINDER_SIZE;
    for (let row = -2; row <= 2; row++) {
      for (let col = -2; col <= 2; col++) {
        assert.equal(qr.isDark(center + row, center + col), Math.abs(row) === 2 || Math.abs(col) === 2 || (row === 0 && col === 0));
      }
    }
    if (version === 7) {
      let topVersion = 0;
      let leftVersion = 0;
      for (let bit = 0; bit < 18; bit++) {
        const near = Math.floor(bit / 3);
        const far = qr.getModuleCount() - 11 + bit % 3;
        topVersion |= Number(qr.isDark(near, far)) << bit;
        leftVersion |= Number(qr.isDark(far, near)) << bit;
      }
      assert.equal(topVersion, 0x07c94);
      assert.equal(leftVersion, 0x07c94);
    }
  }
} finally {
  qrcode.stringToBytes = defaultConverter;
}
assert.equal(qrcode.stringToBytes, stringToBytes);

const rendered = makeQr('https://games.example/room/ABCD', 'Byte', 0);
const renderedMatrix = matrix(rendered);
const darkCoordinates = renderedMatrix.flatMap((row, y) => row.flatMap((dark, x) => dark ? [[x, y]] : []));
for (const [options, cellSize, margin] of [[undefined, 2, 8], [{ cellSize: 4, margin: 2, scalable: true }, 4, 2], [{ cellSize: 1, margin: 0 }, 1, 0]]) {
  const svg = options ? rendered.createSvgTag(options) : rendered.createSvgTag();
  const size = rendered.getModuleCount() * cellSize + margin * 2;
  assert.ok(svg.includes(`viewBox="0 0 ${size} ${size}"`));
  assert.equal(svg.includes(`width="${size}px" height="${size}px"`), !options?.scalable);
  const moves = [...svg.matchAll(/M(\d+),(\d+)l/g)].map((match) => [Number(match[1]), Number(match[2])]);
  assert.deepEqual(moves, darkCoordinates.map(([x, y]) => [x * cellSize + margin, y * cellSize + margin]));
  assert.ok(svg.includes(`l${cellSize},0 0,${cellSize} -${cellSize},0 0,-${cellSize}z`));
  assert.ok(svg.includes('<rect width="100%" height="100%" fill="white"'));
  assert.equal(svg.includes('aria-labelledby'), false);
}
const escapedText = '&lt;room&gt; &amp; &quot;invite&quot;';
const label = '<room> & "invite"';
const labeled = rendered.createSvgTag(2, 0, label, label);
assert.ok(labeled.includes('role="img" aria-labelledby="qrcode-title qrcode-description"'));
assert.ok(labeled.includes(`<title id="qrcode-title">${escapedText}</title>`));
assert.ok(labeled.includes(`<description id="qrcode-description">${escapedText}</description>`));
const customLabels = rendered.createSvgTag({ alt: { text: label, id: 'alt<&"' }, title: { text: label, id: 'title<&"' } });
assert.ok(customLabels.includes('aria-labelledby="title&lt;&amp;&quot; alt&lt;&amp;&quot;"'));
assert.ok(customLabels.includes(`<description id="alt&lt;&amp;&quot;">${escapedText}</description>`));
assert.ok(rendered.createSvgTag({ alt: 'description' }).includes('aria-labelledby="qrcode-description"'));
assert.ok(rendered.createSvgTag({ title: 'title' }).includes('aria-labelledby="qrcode-title"'));
assert.equal(rendered.createSvgTag({ alt: { id: 'unused' }, title: {} }).includes('aria-labelledby'), false);

for (const [args, cellSize, margin] of [[[], 2, 8], [[3, 0], 3, 0]]) {
  const table = rendered.createTableTag(...args);
  assert.ok(table.includes(`margin: ${margin}px;`));
  assert.equal([...table.matchAll(/<tr>/g)].length, rendered.getModuleCount());
  const cells = [...table.matchAll(/<td style="([^"]+)"\/>/g)].map((match) => match[1]);
  assert.equal(cells.length, rendered.getModuleCount() ** 2);
  for (const [index, style] of cells.entries()) {
    assert.ok(style.includes(`width: ${cellSize}px; height: ${cellSize}px;`));
    const dark = renderedMatrix[Math.floor(index / rendered.getModuleCount())][index % rendered.getModuleCount()];
    assert.ok(style.includes(`background-color: ${dark ? '#000000' : '#ffffff'};`));
  }
}
for (const [args, cellSize, margin] of [[[], 2, 8], [[1, 0], 1, 0], [[3, 1], 3, 1]]) {
  assertGif(rendered, rendered.createDataURL(...args), cellSize, margin);
}
assertGif(largest, largest.createDataURL(2, 0), 2, 0);
const image = rendered.createImgTag(1, 0, label);
assert.ok(image.includes(`width="${rendered.getModuleCount()}" height="${rendered.getModuleCount()}"`));
assert.ok(image.includes(`alt="${escapedText}"`));
assertGif(rendered, image.match(/src="([^"]+)"/)[1], 1, 0);
const defaultImage = rendered.createImgTag();
assert.equal(defaultImage.includes('alt='), false);
assertGif(rendered, defaultImage.match(/src="([^"]+)"/)[1], 2, 8);

for (const [args, margin] of [[[], 2], [[1, 0], 0], [[1, 1], 1]]) {
  const lines = rendered.createASCII(...args).split('\n');
  const size = rendered.getModuleCount() + margin * 2;
  assert.equal(lines.length, Math.ceil(size / 2));
  for (const [lineIndex, line] of lines.entries()) {
    assert.equal(line.length, size);
    for (let col = 0; col < size; col++) {
      const whites = [0, 1].map((offset) => {
        const row = lineIndex * 2 + offset;
        if (row >= size) return false;
        if (row < margin || col < margin || row >= size - margin || col >= size - margin) return true;
        return !rendered.isDark(row - margin, col - margin);
      });
      const glyphs = [' ', '▄', '▀', '█'];
      assert.equal(line[col], glyphs[Number(whites[0]) * 2 + Number(whites[1])]);
    }
  }
}
for (const [args, margin] of [[[2], 2], [[2, 0], 0]]) {
  const lines = rendered.createASCII(...args).split('\n');
  const size = rendered.getModuleCount() + margin * 2;
  assert.equal(lines.length, size);
  for (const [row, line] of lines.entries()) {
    assert.equal(line.length, size * 2);
    for (let col = 0; col < size; col++) {
      const inside = row >= margin && col >= margin && row < size - margin && col < size - margin;
      const dark = inside && rendered.isDark(row - margin, col - margin);
      assert.equal(line.slice(col * 2, col * 2 + 2), dark ? '  ' : '██');
    }
  }
}
for (const cellSize of [undefined, 3]) {
  const calls = [];
  const context = { fillStyle: '', fillRect(...rectangle) { calls.push({ color: this.fillStyle, rectangle }); } };
  rendered.renderTo2dContext(context, cellSize);
  const scale = cellSize ?? 2;
  assert.deepEqual(calls, renderedMatrix.flatMap((row, y) => row.map((dark, x) => ({ color: dark ? 'black' : 'white', rectangle: [x * scale, y * scale, scale, scale] }))));
}

console.log('qrcode coverage ok');
