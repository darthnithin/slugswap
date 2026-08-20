import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'validate-public-env.mjs',
);

const requiredNames = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_URL',
];

const baseEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !requiredNames.includes(name)),
);

function runValidator(env = {}, args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...baseEnv, ...env },
  });
}

test('fails before a production bundle is built without public configuration', () => {
  const result = runValidator();

  assert.equal(result.status, 1);
  for (const name of requiredNames) {
    assert.match(result.stderr, new RegExp(name));
  }
});

test('rejects non-HTTPS production endpoints', () => {
  const result = runValidator({
    EXPO_PUBLIC_SUPABASE_URL: 'http://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    EXPO_PUBLIC_API_URL: 'https://api.example.com',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /EXPO_PUBLIC_SUPABASE_URL must be a valid HTTPS URL/);
});

test('accepts complete production public configuration without printing values', () => {
  const env = {
    EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public-anon-key',
    EXPO_PUBLIC_API_URL: 'https://api.example.com',
  };
  const result = runValidator(env);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /environment variables are configured/);
  for (const value of Object.values(env)) {
    assert.doesNotMatch(result.stdout, new RegExp(value));
    assert.doesNotMatch(result.stderr, new RegExp(value));
  }
});

test('does not require production configuration for non-production EAS builds', () => {
  const result = runValidator(
    { EAS_BUILD_PROFILE: 'development' },
    ['--when-production'],
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Skipping production environment validation/);
});
