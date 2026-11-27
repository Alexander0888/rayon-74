import { spawnSync } from 'node:child_process';
import { localDatabase } from './localSupabase.js';

const [stack, psql = 'psql'] = process.argv.slice(2);
const url = localDatabase(stack);
const { status, error } = spawnSync(psql, ['-X', '-w', '-v', 'VERBOSITY=terse',
  '-f', 'supabase/tests/rayon-demo-quality.sql'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PGHOST: url.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: url.port,
    PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
  },
});
if (error) throw new Error('Install PostgreSQL client tools or pass the path to psql.');
process.exitCode = status ?? 1;
