// Flat config (ESLint 9). `eslint-config-prettier` fica por último: ele só
// desliga as regras de estilo que brigariam com o Prettier — formatação é
// responsabilidade do `npm run format`, não do lint.
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = [
    ...expoConfig,
    prettierConfig,
    {
        ignores: [
            'node_modules/**',
            '.expo/**',
            'dist/**',
            'android/**',
            'assets/**',
            'coverage/**',
        ],
    },
    {
        files: ['__tests__/**/*.js'],
        languageOptions: {
            globals: {
                describe: 'readonly',
                it: 'readonly',
                expect: 'readonly',
                beforeEach: 'readonly',
                afterEach: 'readonly',
                jest: 'readonly',
            },
        },
    },
];
