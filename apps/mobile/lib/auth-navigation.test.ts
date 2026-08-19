import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_POST_AUTH_ROUTE, getSafePostAuthRoute } from './auth-navigation';

test('preserves canonical protected destinations after sign in', () => {
  assert.equal(getSafePostAuthRoute('/my-get'), '/my-get');
  assert.equal(getSafePostAuthRoute(['/point-sharing']), '/point-sharing');
  assert.equal(getSafePostAuthRoute('/scan-card'), '/scan-card');
});

test('rejects unknown and external post-auth destinations', () => {
  assert.equal(getSafePostAuthRoute('https://example.com'), DEFAULT_POST_AUTH_ROUTE);
  assert.equal(getSafePostAuthRoute('/rooms'), DEFAULT_POST_AUTH_ROUTE);
  assert.equal(getSafePostAuthRoute(undefined), DEFAULT_POST_AUTH_ROUTE);
});
