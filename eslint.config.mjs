import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TRANSCENDENTAL = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow', 'sqrt', 'cbrt', 'hypot',
];

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.wrangler/**',
      '**/dist/**',
      'test-results/**',
      'playwright-report/**',
      '**/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    // Determinism guard (PLAN §4.4): the simulation must not touch the outside world.
    files: ['packages/sim/src/**/*.ts', 'packages/sim/data/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use rand(state, n): randomness must live in GameState.' },
        ...TRANSCENDENTAL.map((property) => ({
          object: 'Math',
          property,
          message: 'May differ between JS engines. Use integer helpers (isqrt, facingDir, along).',
        })),
        { object: 'Date', property: 'now', message: 'No clocks in the simulation.' },
        { object: 'performance', property: 'now', message: 'No clocks in the simulation.' },
      ],
      'no-restricted-globals': [
        'error',
        ...['Date', 'performance', 'setTimeout', 'setInterval', 'requestAnimationFrame', 'window', 'document', 'fetch', 'WebSocket', 'crypto', 'localStorage'].map(
          (name) => ({ name, message: 'The simulation must be pure: step(state, inputs) depends on nothing else.' }),
        ),
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['three', 'three/*', 'react', 'next/*'], message: 'The simulation knows nothing about rendering.' }] },
      ],
    },
  },
);
