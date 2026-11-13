// Creates the first owner (from OWNER_* env vars) and the first four clients, once.
// Safe to run repeatedly: it only inserts what is missing.
import bcrypt from 'bcryptjs';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { OWNER_EMAIL, OWNER_PASSWORD, OWNER_NAME } = process.env;
  const owners = await client.query("SELECT 1 FROM users WHERE role = 'owner'");
  if (owners.rowCount > 0 && process.env.OWNER_RESET_PASSWORD === 'true') {
    // Recovery switch: set OWNER_RESET_PASSWORD=true in Railway with a new OWNER_PASSWORD,
    // let it redeploy once, then remove the switch. Only the account named in OWNER_EMAIL changes.
    if (!OWNER_EMAIL || !OWNER_PASSWORD || OWNER_PASSWORD.length < 10) {
      console.log('OWNER_RESET_PASSWORD is on, but OWNER_EMAIL or a 10+ character OWNER_PASSWORD is missing. Nothing changed.');
    } else {
      const hash = await bcrypt.hash(OWNER_PASSWORD, 12);
      const r = await client.query(
        "UPDATE users SET password_hash = $1 WHERE email = $2 AND role = 'owner'",
        [hash, OWNER_EMAIL.trim().toLowerCase()],
      );
      if (r.rowCount) {
        await client.query("DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = $1)", [OWNER_EMAIL.trim().toLowerCase()]);
        console.log('owner password reset; remove OWNER_RESET_PASSWORD now');
      } else {
        console.log('OWNER_RESET_PASSWORD is on, but no owner has that OWNER_EMAIL. Nothing changed.');
      }
    }
  }
  if (owners.rowCount === 0) {
    if (!OWNER_EMAIL || !OWNER_PASSWORD) {
      console.log('No owner yet. Set OWNER_EMAIL and OWNER_PASSWORD and run seed again.');
    } else if (OWNER_PASSWORD.length < 10) {
      throw new Error('OWNER_PASSWORD must be at least 10 characters.');
    } else {
      const hash = await bcrypt.hash(OWNER_PASSWORD, 12);
      await client.query(
        "INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'owner')",
        [OWNER_EMAIL.trim().toLowerCase(), OWNER_NAME || 'Owner', hash],
      );
      console.log('owner created');
    }
  }

  const firstClients = [
    { name: 'LibraPro Facility Services', industry: 'Commercial cleaning (MI and OH)', website: 'https://libraprofs.com' },
    { name: 'AutoAt', industry: 'Car service marketplace (national)', website: 'https://www.autoat.org' },
    { name: 'MAXPRO Fitness', industry: 'Home fitness equipment (online)', website: 'https://maxprofitness.com' },
    { name: 'Wedding business', industry: 'Weddings', website: '' },
  ];
  for (const c of firstClients) {
    const exists = await client.query('SELECT 1 FROM clients WHERE name = $1', [c.name]);
    if (exists.rowCount) continue;
    await client.query('INSERT INTO clients (name, industry, website) VALUES ($1, $2, $3)', [c.name, c.industry, c.website]);
    console.log(`client added: ${c.name}`);
  }
} finally {
  await client.end();
}
