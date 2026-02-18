import crypto from 'node:crypto';

const password = String(process.argv[2] || '').trim();
if (!password) {
    console.error('Uso: node scripts/generate-admin-password-hash.mjs "tu_password_segura"');
    process.exit(1);
}

const salt = crypto.randomBytes(16);
const N = 16384;
const r = 8;
const p = 1;
const keylen = 64;

crypto.scrypt(password, salt, keylen, { N, r, p }, (error, derivedKey) => {
    if (error) {
        console.error(`Error generando hash: ${error.message}`);
        process.exit(1);
    }

    console.log(
        [
            'scrypt',
            N,
            r,
            p,
            salt.toString('hex'),
            derivedKey.toString('hex')
        ].join('$')
    );
});
