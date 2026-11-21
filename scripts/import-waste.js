import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, parseEnv } from 'node:util';
import { checked, sessionlessClient } from './localSupabase.js';

async function localManager() {
  const settings = parseEnv(readFileSync('.env.shared.local', 'utf8'));
  const url = new URL(settings.VITE_SUPABASE_URL);
  const key = settings.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !key?.startsWith('sb_publishable_')) {
    throw new Error('Для импорта нужен локальный Supabase с публикуемым ключом.');
  }

  const accounts = JSON.parse(readFileSync('supabase/demo-accounts.local', 'utf8'));
  const account = accounts.find(({ role }) => role === 'manager');
  if (!account) throw new Error('Подготовьте локальную учётную запись руководителя командой npm run db:demo.');
  const client = sessionlessClient(url.href, key);
  const { error } = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (error) throw new Error('Не удалось войти в локальный Supabase как руководитель.');
  return client;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      apply: { type: 'boolean' },
      replace: { type: 'boolean' },
    },
  });
  if (!positionals.length || (values.replace && !values.apply)) {
    throw new Error('Укажите файлы Excel. Для записи добавьте --apply, для замены дат — --apply --replace.');
  }

  const parser = fileURLToPath(new URL('read-waste.py', import.meta.url));
  const result = spawnSync(process.env.RAYON_WASTE_PYTHON || 'python3', ['-B', parser, ...positionals], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error) throw new Error('Не удалось запустить программу чтения Excel.', { cause: result.error });
  if (result.status !== 0) throw new Error(result.stderr.trim().split('\n').at(-1) || 'Не удалось прочитать Excel.');
  const reports = JSON.parse(result.stdout);
  const manager = values.apply ? await localManager() : null;
  for (const { report, rows, applicable, skipped } of reports) {
    console.log(`${report.filename}: ${report.covered_from} — ${report.covered_to}`);
    console.log(`Строк SIN / 74: ${report.source_row_count}, дневных записей: ${rows.length}.`);
    console.log(`Quantité ${report.quantity}, PA ${report.pa}, Ventes ${report.ventes}.`);
    for (const scope of skipped) {
      console.log(`Пропущено строк: ${scope.count} (магазин ${scope.store}, отдел ${scope.department}).`);
    }
    if (!applicable) {
      console.log('Выгрузка не относится к SIN / 74.');
      continue;
    }
    if (manager) {
      const { status } = checked(await manager.rpc('apply_waste_import', {
        p_report: report, p_rows: rows, p_replace: Boolean(values.replace),
      }));
      console.log(status === 'already_imported' ? 'Файл уже загружался.' : 'Дневные записи сохранены.');
    }
  }
}

try {
  await main();
} catch (error) {
  const importErrors = {
    PT409: 'Период пересекается с историей. После проверки свежести выгрузки используйте --replace.',
    PT422: 'В выгрузке есть позиции без подтверждённой разметки. Сначала проверьте новые артикулы и названия.',
  };
  console.error(importErrors[error.code] ?? error.message);
  process.exitCode = 1;
}
