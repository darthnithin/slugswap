type AppleCredential = {
  identityToken: string | null;
  fullName: {
    givenName?: string | null;
    middleName?: string | null;
    familyName?: string | null;
  } | null;
};

type AppleAuthClient = {
  signInWithIdToken: (credentials: {
    provider: 'apple';
    token: string;
    nonce: string;
  }) => Promise<{ data: { session: unknown | null }; error: Error | null }>;
  updateUser: (attributes: {
    data: { full_name: string };
  }) => Promise<{ error: Error | null }>;
};

// Keep the raw nonce for Supabase; only its SHA-256 hash goes to Apple.
export async function completeAppleSignIn(
  auth: AppleAuthClient,
  credential: AppleCredential,
  nonce: string,
): Promise<{ nameSaved: boolean }> {
  if (!credential.identityToken) {
    throw new Error('Apple did not return an identity token. Please try again.');
  }

  const { data, error } = await auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce,
  });
  if (error) throw error;
  if (!data.session) throw new Error('Unable to finish Apple sign in. Please try again.');

  // Apple supplies the name only on first authorization. Never overwrite it
  // with an empty name on subsequent logins, or require a non-relay email.
  const fullName = [
    credential.fullName?.givenName,
    credential.fullName?.middleName,
    credential.fullName?.familyName,
  ].map((part) => part?.trim()).filter(Boolean).join(' ');

  if (fullName) {
    try {
      const { error: nameError } = await auth.updateUser({ data: { full_name: fullName } });
      return { nameSaved: !nameError };
    } catch {
      // A profile update failure must not turn an established session into a
      // reported login failure (which could prompt the user to create accounts).
      return { nameSaved: false };
    }
  }
  return { nameSaved: true };
}

export function isAppleSignInCancelled(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && error.code === 'ERR_REQUEST_CANCELED';
}
