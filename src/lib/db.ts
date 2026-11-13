import pg from 'pg';

// Postgres returns NUMERIC as strings; our percentages are small, so read them as numbers.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// Keep DATE columns as 'YYYY-MM-DD' strings so no time zone shifts the day.
pg.types.setTypeParser(1082, (v) => v);

const globalForPool = globalThis as unknown as { pool?: pg.Pool };

export const pool =
  globalForPool.pool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== 'production') globalForPool.pool = pool;

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) {
  return pool.query<T>(text, params);
}
