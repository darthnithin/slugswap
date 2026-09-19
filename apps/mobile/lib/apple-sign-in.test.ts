import assert from 'node:assert/strict';
import test from 'node:test';
import { completeAppleSignIn, isAppleSignInCancelled } from './apple-sign-in';

function client() {
  const tokens: unknown[] = [];
  const profiles: unknown[] = [];
  return {
    tokens,
    profiles,
    async signInWithIdToken(input: unknown) {
      tokens.push(input);
      return { data: { session: { user: { email: 'private@privaterelay.appleid.com' } } }, error: null };
    },
    async updateUser(input: unknown) {
      profiles.push(input);
      return { error: null };
    },
  };
}

test('exchanges Apple token with raw nonce and preserves first-authorization name', async () => {
  const auth = client();
  await completeAppleSignIn(auth, {
    identityToken: 'signed-token',
    fullName: { givenName: ' Ada ', middleName: null, familyName: 'Lovelace' },
  }, 'raw-nonce');
  assert.deepEqual(auth.tokens, [{ provider: 'apple', token: 'signed-token', nonce: 'raw-nonce' }]);
  assert.deepEqual(auth.profiles, [{ data: { full_name: 'Ada Lovelace' } }]);
});

test('repeat login and private email do not require a name or overwrite profile', async () => {
  const auth = client();
  for (const fullName of [null, { givenName: null, familyName: ' ' }]) {
    await completeAppleSignIn(auth, { identityToken: 'token', fullName }, 'nonce');
  }
  assert.equal(auth.tokens.length, 2);
  assert.deepEqual(auth.profiles, []);
});

test('missing identity token never contacts Supabase', async () => {
  const auth = client();
  await assert.rejects(completeAppleSignIn(auth, { identityToken: null, fullName: null }, 'nonce'), /identity token/);
  assert.deepEqual(auth.tokens, []);
});

test('rejected token or missing session never saves profile or reports success', async () => {
  for (const error of [new Error('Invalid nonce'), null]) {
    const auth = { ...client(), async signInWithIdToken() { return { data: { session: null }, error }; } };
    await assert.rejects(completeAppleSignIn(auth, {
      identityToken: 'token', fullName: { givenName: 'Ada' },
    }, 'nonce'), error ? /Invalid nonce/ : /Unable to finish/);
    assert.deepEqual(auth.profiles, []);
  }
});

test('profile persistence failure does not discard a valid login', async () => {
  for (const throws of [false, true]) {
    const auth = { ...client(), async updateUser() {
      if (throws) throw new Error('Network failed');
      return { error: new Error('Profile failed') };
    } };
    assert.deepEqual(await completeAppleSignIn(auth, {
      identityToken: 'token', fullName: { givenName: 'Ada' },
    }, 'nonce'), { nameSaved: false });
  }
});

test('only explicit user cancellation is silenced', () => {
  assert.equal(isAppleSignInCancelled({ code: 'ERR_REQUEST_CANCELED' }), true);
  for (const error of [null, 'cancel', new Error('Network failed'), { code: 'ERR_REQUEST_FAILED' }]) {
    assert.equal(isAppleSignInCancelled(error), false);
  }
});
