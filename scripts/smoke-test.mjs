import { spawn } from 'node:child_process';

const smokePort = Number.parseInt(process.env.SMOKE_PORT || '3099', 10);
const baseUrl = `http://127.0.0.1:${smokePort}`;

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCookieValue(cookieHeader, name) {
    if (!cookieHeader) return '';
    const match = cookieHeader.match(new RegExp(`${name}=([^;]+)`, 'i'));
    return match ? decodeURIComponent(match[1]) : '';
}

async function run() {
    const server = spawn('node', ['server.js'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PORT: String(smokePort),
            BASE_URL: `http://localhost:${smokePort}`
        },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    let serverReady = false;

    server.stdout.on('data', chunk => {
        const message = chunk.toString();
        if (message.includes('Servidor corriendo')) {
            serverReady = true;
        }
    });

    server.stderr.on('data', chunk => {
        process.stderr.write(chunk.toString());
    });

    for (let i = 0; i < 30; i += 1) {
        if (serverReady) break;
        await wait(200);
    }

    if (!serverReady) {
        server.kill('SIGTERM');
        throw new Error('No se pudo iniciar el servidor para smoke test');
    }

    try {
        const healthResponse = await fetch(`${baseUrl}/api/health`);
        if (!healthResponse.ok) {
            throw new Error(`Healthcheck fallido (${healthResponse.status})`);
        }

        const health = await healthResponse.json();
        if (health.status !== 'ok') {
            throw new Error('Healthcheck devolvio estado invalido');
        }

        const cookieHeader = healthResponse.headers.get('set-cookie');
        const sessionId = extractCookieValue(cookieHeader, 'zm_sid');
        if (!sessionId) {
            throw new Error('No se pudo obtener cookie de sesion CSRF desde set-cookie');
        }

        const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`, {
            headers: {
                Cookie: `zm_sid=${encodeURIComponent(sessionId)}`
            }
        });

        if (!csrfResponse.ok) {
            throw new Error(`No se pudo obtener token CSRF (${csrfResponse.status})`);
        }

        const csrfPayload = await csrfResponse.json();
        const csrfToken = String(csrfPayload?.csrfToken || '');
        if (!csrfToken) {
            throw new Error('No se pudo obtener token CSRF del endpoint');
        }

        const quoteResponse = await fetch(`${baseUrl}/api/delivery/quote?postalCode=1746`);
        if (!quoteResponse.ok) {
            throw new Error(`No se pudo cotizar envío (${quoteResponse.status})`);
        }

        const quotePayload = await quoteResponse.json();
        if (!Number.isInteger(quotePayload.shippingCost)) {
            throw new Error('Cotización de envío inválida');
        }

        const invalidCheckout = await fetch(`${baseUrl}/api/mp/create-preference`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
                Cookie: `zm_sid=${encodeURIComponent(sessionId)}`
            },
            body: JSON.stringify({
                items: [{ id: 9999, quantity: 1 }],
                delivery: {
                    method: 'pickup'
                }
            })
        });

        if (invalidCheckout.status !== 400) {
            throw new Error(`Validacion de checkout esperada 400, recibio ${invalidCheckout.status}`);
        }

        console.log('Smoke test OK');
    } finally {
        server.kill('SIGTERM');
    }
}

run().catch(error => {
    console.error(error.message);
    process.exit(1);
});
