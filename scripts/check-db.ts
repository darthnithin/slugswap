import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function checkDatabase() {
  try {
    // Get all tables
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;

    console.log('Existing tables:', tables);

    // If users table exists, check its columns
    if (tables.some((t: any) => t.table_name === 'users')) {
      const columns = await sql`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'users' AND table_schema = 'public'
        ORDER BY ordinal_position;
      `;
      console.log('\nUsers table columns:', columns);
    }
  } catch (error) {
    console.error('Error checking database:', error);
  }
}

checkDatabase();
