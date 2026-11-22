import { readFile, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'

function sqlLiteral(value) {
  if (value == null) return 'null'
  if ((typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean') return String(value)
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `E'${text.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`
}

function upsert(table, rows) {
  if (!rows.length) return ''
  const columns = Object.keys(rows[0])
  const values = rows.map(row => `(${columns.map(column => sqlLiteral(row[column])).join(',')})`)
  const updates = columns.filter(column => column !== 'id').map(column => `${column} = excluded.${column}`)
  return `insert into public.${table} (${columns.join(', ')}) values\n${values.join(',\n')}\n` +
    `on conflict (id) do update set ${updates.join(', ')}\n` +
    `where excluded.source_captured_at > ${table}.source_captured_at;\n`
}

async function main() {
  const { positionals: [input, output], values } = parseArgs({ allowPositionals: true, options: {
    'bio-only': { type: 'boolean' },
  } })
  if (!input || !output) throw new Error('Укажите путь к снимку JSON и путь к новому файлу SQL')
  const snapshot = JSON.parse(await readFile(input, 'utf8'))
  const capturedAt = snapshot.source_captured_at ?? snapshot.source_files_saved_at
  if (snapshot.source !== 'Klarys / Commandes achat' || snapshot.department !== 'RY74' ||
      snapshot.delivery_location_id !== 7636 || !Number.isFinite(Date.parse(capturedAt)) ||
      !Array.isArray(snapshot.orders) || snapshot.orders.length !== snapshot.order_count) {
    throw new Error('Ожидается проверенный снимок заказов отдела 74')
  }

  const orders = snapshot.orders.map(order => ({
    id: order.id, marketplace_id: order.marketplace_id ?? 139,
    department: snapshot.department, delivery_location_id: snapshot.delivery_location_id,
    order_date: order.order_date, shipping_date: order.shipping_date,
    shipping_location_id: order.shipping_location_id, shipping_packages: order.shipping_packages,
    delivery_date: order.delivery_date, status: order.status,
    supplier_id: order.supplier_id, supplier_name: order.supplier, source_captured_at: capturedAt,
  }))
  const lines = snapshot.orders.flatMap(order => order.items.map(line => ({
    id: line.id, order_id: order.id, product_name: line.product_name,
    gtin: line.gtin, manor_article: line.manor_article, manor_variant: line.manor_variant,
    internal_ref: line.internal_ref, origin_id: line.origin_id, origin_label: line.origin_label,
    ordered_quantity: line.ordered_quantity, ordered_unit_id: line.ordered_unit_id,
    per_box: line.per_box, package_quantity_unit_id: line.package_quantity_unit_id,
    validated_quantity: line.validated_quantity, validated_unit_id: line.validated_unit_id,
    price_amount: line.price?.amount, price_unit_id: line.price?.unit_id, currency_id: line.currency_id,
    status: line.status, cancelled_by_seller: line.cancelled_by_seller, counting_status: line.counting_status,
    details: {
      is_bio: line.is_bio,
      seller_designation: line.seller_designation,
      full_designation: line.full_designation,
      original_supplier_id: line.original_supplier_id,
      original_supplier: line.original_supplier,
      possible_origin_ids: line.possible_origin_ids,
      price_source: line.price_source,
      price_of_the_day: line.price_of_the_day,
      price_at_order_creation: line.price_at_order_creation,
    },
    source_captured_at: capturedAt,
  })))
  if (lines.length !== snapshot.line_count) throw new Error('Число строк не совпадает со счётчиком снимка')
  if (values['bio-only']) {
    const verified = lines.filter(({ details }) => typeof details.is_bio === 'boolean')
    if (!verified.length) throw new Error('В снимке нет исходных меток Bio из Klarys')
    const rows = verified.map(({ id, order_id, details }) =>
      `(${sqlLiteral(id)}::bigint,${sqlLiteral(order_id)}::bigint,${sqlLiteral(details.is_bio)})`)
    const sql = `update public.klarys_order_lines line\n` +
      `set details = jsonb_set(line.details, '{is_bio}', to_jsonb(batch.is_bio))\n` +
      `from (values\n${rows.join(',\n')}\n) as batch(id, order_id, is_bio)\n` +
      `where line.id = batch.id and line.order_id = batch.order_id\n` +
      `  and line.source_captured_at = ${sqlLiteral(capturedAt)}::timestamptz\n` +
      `  and line.details->'is_bio' is distinct from to_jsonb(batch.is_bio);\n`
    await writeFile(output, sql, { mode: 0o600, flag: 'wx' })
    console.log(`Подготовлены отметки Bio для ${verified.length} позиций`)
    return
  }
  const sql = 'begin;\n' +
    upsert('klarys_orders', orders) + upsert('klarys_order_lines', lines) + 'commit;\n'
  await writeFile(output, sql, { mode: 0o600, flag: 'wx' })
  console.log(`Подготовлено заказов ${orders.length}, товарных строк ${lines.length}`)
}

main().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
