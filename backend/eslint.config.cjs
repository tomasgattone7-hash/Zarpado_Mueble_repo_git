module.exports = [
    {
        ignores: [
            'node_modules/**',
            '../frontend/js/*.min.js'
        ]
    },
    {
        files: ['server.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs'
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
        }
    },
    {
        files: ['scripts/**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module'
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
        }
    },
    {
        files: ['../frontend/js/**/*.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                window: 'readonly',
                document: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                fetch: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                URLSearchParams: 'readonly',
                IntersectionObserver: 'readonly',
                FormData: 'readonly',
                AbortController: 'readonly',
                grecaptcha: 'readonly',
                event: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': 'off'
        }
    }
];
