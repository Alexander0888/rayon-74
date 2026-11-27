import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

function localStatus(stack) {
  const args = ['status', '--output-format', 'json'];
  if (stack) args.push('--stack', stack);
  try {
    return JSON.parse(execFileSync('node_modules/.bin/supabase', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
    })).env;
  } catch {
    throw new Error('Start the local Supabase stack first.');
  }
}

const isLoopback = (url) => ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);

export function localSettings(stack) {
  const { API_URL: url, PUBLISHABLE_KEY: key, SECRET_KEY: secretKey } = localStatus(stack) ?? {};
  if (!url || !key || !secretKey || !isLoopback(new URL(url))) {
    throw new Error('Start the local Supabase stack first.');
  }
  return { url, key, secretKey };
}

export function localDatabase(stack) {
  const db = localStatus(stack)?.DB_URL;
  const url = db && new URL(db);
  if (!url || !isLoopback(url)) throw new Error('This check requires a local Supabase database.');
  return url;
}

export function sessionlessClient(url, key) {
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function checked({ data, error }) {
  if (error) throw error;
  return data;
}
