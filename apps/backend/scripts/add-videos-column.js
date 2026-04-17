// Add videos column via Supabase REST API with psql extension
require('dotenv').config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

async function addColumn() {
  // Try to use Supabase's built-in SQL execution via the pg_net extension
  // by calling the exec_sql RPC function
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        query: "ALTER TABLE dogs ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT '[]'::jsonb;",
      }),
    });

    const result = await response.text();
    console.log('RPC response:', response.status, result);

    if (response.ok) {
      console.log('Column added successfully!');
      return;
    }
  } catch (err) {
    console.log('RPC not available:', err.message);
  }

  // If RPC didn't work, try using raw SQL via the Supabase SQL endpoint
  console.log('\nPlease run this SQL in the Supabase Dashboard SQL Editor:');
  console.log('\n  ALTER TABLE dogs ADD COLUMN IF NOT EXISTS videos JSONB DEFAULT \'[]\'::jsonb;\n');
}

addColumn();