const crypto = require('crypto');

const size = Number.parseInt(process.argv[2], 10);
const bytes = Number.isInteger(size) && size >= 16 && size <= 256 ? size : 32;

console.log(crypto.randomBytes(bytes).toString('hex'));
