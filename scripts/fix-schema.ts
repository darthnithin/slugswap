import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function fixSchema() {
  try {
    console.log('Fixing users table schema...');

    // Drop auth_user_id column and add avatar_url
    await sql`
      ALTER TABLE users
      DROP COLUMN IF EXISTS auth_user_id,
      ADD COLUMN IF NOT EXISTS avatar_url TEXT;
    `;

    console.log('✓ Users table updated: removed auth_user_id, added avatar_url');

    // Verify the change
    const columns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users' AND table_schema = 'public'
      ORDER BY ordinal_position;
    `;

    console.log('\nUpdated users table columns:', columns);
  } catch (error) {
    console.error('Error fixing schema:', error);
  }
}

fixSchema();
