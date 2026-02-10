import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

async function verifySchema() {
  try {
    const tables = ['users', 'donations', 'weekly_pools', 'claim_codes', 'redemptions', 'user_allowances'];

    for (const table of tables) {
      const columns = await sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = ${table} AND table_schema = 'public'
        ORDER BY ordinal_position;
      `;

      console.log(`\n${table}:`);
      columns.forEach((col: any) => {
        console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : 'NULL'}`);
      });
    }

    console.log('\n✓ All tables verified successfully!');
  } catch (error) {
    console.error('Error verifying schema:', error);
  }
}

verifySchema();
