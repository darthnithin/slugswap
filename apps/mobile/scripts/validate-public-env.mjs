const REQUIRED_PUBLIC_ENV = [
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_URL',
];

const shouldSkipNonProductionEasBuild =
  process.argv.includes('--when-production') &&
  process.env.EAS_BUILD_PROFILE &&
  process.env.EAS_BUILD_PROFILE !== 'production';

if (shouldSkipNonProductionEasBuild) {
  console.log(
    `Skipping production environment validation for EAS profile ${process.env.EAS_BUILD_PROFILE}.`,
  );
  process.exit(0);
}

const missing = REQUIRED_PUBLIC_ENV.filter(
  (name) => !process.env[name]?.trim(),
);

if (missing.length > 0) {
  console.error(
    `Missing required mobile environment variables: ${missing.join(', ')}`,
  );
  console.error(
    'Configure them for this production build before generating the app bundle.',
  );
  process.exit(1);
}

for (const name of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_API_URL']) {
  const value = process.env[name].trim();

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') {
      throw new Error('URL must use HTTPS');
    }
  } catch {
    console.error(`${name} must be a valid HTTPS URL.`);
    process.exit(1);
  }
}

console.log('Required mobile public environment variables are configured.');
