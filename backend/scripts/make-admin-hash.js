const crypto = require('crypto');

const password = process.argv[2];
if (!password) {
    console.error('Uso: node scripts/make-admin-hash.js "TuPasswordFuerte"');
    process.exit(1);
}

const salt = crypto.randomBytes(16);
const N = 16384;
const r = 8;
const p = 1;
const keylen = 64;

crypto.scrypt(password, salt, keylen, { N, r, p }, (error, derivedKey) => {
    if (error) {
        throw error;
    }

    const out = [
        'scrypt',
        N,
        r,
        p,
        salt.toString('hex'),
        derivedKey.toString('hex')
    ].join('$');
    console.log(out);
});
