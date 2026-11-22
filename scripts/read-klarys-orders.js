import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

// Значения сверены с подписями в Commandes achat. Для новых ID сохраняем исходный код.
const units = { 5: 'kg', 6: 'Pcs', 7: 'Colis' }
const currencies = { 1: 'EUR', 2: 'CHF' }
const cancelled = new Set(['cancelled', 'canceled'])
const activeOrders = new Set(['to_prepare', 'validated', 'invoiced'])
const manorMarketplaces = new Set([139, 143])

function check(condition, message) {
  if (!condition) throw new Error(message)
}

function code(value) {
  return value == null || value === '' ? null : String(value)
}

function lineState(order, item) {
  if (cancelled.has(order.status) || cancelled.has(item.status) || item.is_cancelled_by_seller === true) return 'cancelled'
  if (activeOrders.has(order.status) && item.status === 'accepted' && item.is_cancelled_by_seller === false) return 'active'
  return 'unclassified'
}

function price(amount, unitId) {
  return amount == null ? null : { amount, per: units[unitId] ?? null, unit_id: unitId ?? null }
}

function readItem(order, item, references) {
  check(Number.isSafeInteger(item.id) && item.order_id === order.id, 'Позиция без ID или с неверным номером заказа')
  check(typeof item.frontend_designation === 'string' && item.frontend_designation.trim(), 'Позиция без названия')
  check(Number.isFinite(item.quantity) && item.quantity >= 0, 'Некорректное заказанное количество')
  const originId = item.fishing_port_id
  const unit = units[item.quantity_unit_id] ?? null
  const quoted = price(item.price_of_the_day, item.price_of_the_day_unit_id)
  const fixed = price(item.price, item.price_unit_id)
  return {
    id: item.id, product_name: item.frontend_designation, seller_designation: item.seller_designation ?? null,
    full_designation: item.full_designation ?? null,
    original_supplier_id: item.origin_seller_company_id ?? null,
    original_supplier: references.suppliers?.[item.origin_seller_company_id] ?? null,
    gtin: code(item.gtin), manor_article: code(item.manor_article_number),
    manor_variant: code(item.variant_number), internal_ref: code(item.seller_product_instance_from_buyer_external_id),
    is_bio: Array.isArray(item.label_ids) ? item.label_ids.some((id) => id === 5 || id === 50) : null,
    origin_label: originId == null ? null : references.origins?.[originId] ?? item.full_designation?.split('\n')[1]?.trim() ?? null,
    origin_id: originId ?? null, possible_origin_ids: item.possible_origins ?? [],
    ordered_quantity: item.quantity, ordered_unit: unit, ordered_unit_id: item.quantity_unit_id,
    ordered_boxes: unit === 'Colis' ? item.quantity : null,
    per_box: unit === 'Colis' ? item.package_quantity ?? null : null,
    per_box_unit: unit === 'Colis' ? units[item.package_quantity_unit_id] ?? null : null,
    package_quantity_unit_id: item.package_quantity_unit_id ?? null,
    validated_quantity: item.validated_quantity ?? null,
    validated_unit: units[item.validated_quantity_unit_id] ?? null,
    validated_unit_id: item.validated_quantity_unit_id ?? null,
    currency: currencies[item.currency_id] ?? null, currency_id: item.currency_id ?? null,
    price: fixed ?? quoted, price_source: fixed ? 'price' : quoted ? 'price_of_the_day' : null,
    price_of_the_day: quoted, price_at_order_creation: price(item.price_seen_by_customer_at_order_creation, item.price_seen_by_customer_at_order_creation_unit_id),
    status: item.status, cancelled_by_seller: item.is_cancelled_by_seller ?? null,
    counting_status: lineState(order, item),
  }
}

function isDate(date) {
  return typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
}

export function parsePeriod(pages, from, to, expected, references = {}) {
  check(isDate(from) && isDate(to) && from <= to, 'Нужен корректный период доставки в формате ГГГГ-ММ-ДД')
  check(Number.isSafeInteger(expected) && expected >= 0 && pages.length > 0, 'Нужны число заказов и JSON списка')
  const orders = []
  const orderIds = new Set()
  const lineIds = new Set()
  for (const [index, page] of pages.entries()) {
    check(page && Array.isArray(page.results) && page.count === expected,
      `Ответ ${index + 1} списка заказов отсутствует или его счётчик отличается от ожидаемого (${expected})`)
    check(Object.hasOwn(page, 'next') && Object.hasOwn(page, 'previous') &&
      Boolean(page.previous) === (index > 0) && Boolean(page.next) === (index < pages.length - 1),
    'Неполный набор страниц или нарушен их порядок')
    for (const order of page.results) {
      check(manorMarketplaces.has(order.marketplace_id) && order.buyer_aisle_reference === 'RY74' &&
        order.delivery_location_id === 7636 && order.buyer_company_id === 71408 &&
        order.type === 'purchase', 'Заказ другой точки доставки, отдела или типа')
      check(isDate(order.delivery_date) && order.delivery_date >= from && order.delivery_date <= to,
        `Дата доставки заказа ${order.id} вне выбранного периода или не указана`)
      check(Number.isSafeInteger(order.id) && !orderIds.has(order.id), 'Некорректный или повторный номер заказа')
      check(Array.isArray(order.items), 'Нет массива товарных строк')
      orderIds.add(order.id)
      const items = order.items.map(item => {
        const row = readItem(order, item, references)
        check(!lineIds.has(row.id), 'Повторный ID товарной строки')
        lineIds.add(row.id)
        return row
      })
      orders.push({
        id: order.id, marketplace_id: order.marketplace_id, order_date: order.order_date, shipping_date: order.shipping_date,
        shipping_location_id: order.shipping_location_id ?? null, shipping_packages: order.shipping_packages ?? null,
        delivery_date: order.delivery_date, status: order.status, supplier_id: order.seller_company_id,
        supplier: references.suppliers?.[order.seller_company_id] ?? null, items,
      })
    }
  }
  check(orders.length === expected, `Число уникальных заказов (${orders.length}) отличается от ожидаемого (${expected})`)
  const dates = from === to ? { delivery_date: from } : { delivery_date_from: from, delivery_date_to: to }
  return { department: 'RY74', delivery_location_id: 7636, ...dates,
    expected_orders: expected, order_count: orders.length, line_count: lineIds.size, orders }
}

export function parseDay(pages, date, expected, references = {}) {
  return parsePeriod(pages, date, date, expected, references)
}

export function totals(snapshot) {
  const result = { active: {}, cancelled: {}, unclassified: {} }
  for (const order of snapshot.orders) {
    for (const line of order.items) {
      const group = result[line.counting_status]
      const unit = line.ordered_unit ?? `unit_id=${line.ordered_unit_id}`
      group[unit] = (group[unit] ?? 0) + line.ordered_quantity
    }
  }
  return result
}

async function readJson(file) {
  const raw = await readFile(file, 'utf8')
  try { return JSON.parse(raw) } catch { throw new Error(`Файл ${file} не содержит корректный JSON`) }
}

export function pagesFromHar(har, from, to) {
  check(Array.isArray(har?.log?.entries), 'В файле HAR нет списка запросов')
  const responses = new Map()
  for (const { request, response, startedDateTime } of har.log.entries) {
    const url = URL.parse(request?.url ?? '')
    if (request?.method !== 'GET' || response?.status !== 200 ||
      url?.origin !== 'https://klarys.app' || url.pathname !== '/api/buyer/orders/') continue
    const query = url.searchParams
    if (query.get('from_delivery_date') !== from || query.get('to_delivery_date') !== to ||
      query.get('delivery_location_id') !== '7636' || query.get('buyer_company_id') !== '71408' ||
      query.get('status') || query.get('created_by_users_id')) continue
    const offset = Number(query.get('offset') ?? '0')
    check(Number.isSafeInteger(offset) && offset >= 0, 'Некорректное смещение страницы в HAR')
    const content = response.content
    if (!content?.text) continue
    check(!content.encoding || content.encoding === 'base64', 'Неизвестная кодировка ответа в HAR')
    const body = content.encoding === 'base64' ? Buffer.from(content.text, 'base64').toString('utf8') : content.text
    check(!responses.has(offset) || responses.get(offset).body === body,
      `В HAR есть разные версии страницы со смещением ${offset}`)
    const timestamp = Date.parse(startedDateTime)
    check(Number.isFinite(timestamp), 'В HAR отсутствует время запроса Klarys')
    responses.set(offset, { body, timestamp: Math.max(timestamp, responses.get(offset)?.timestamp ?? timestamp) })
  }
  check(responses.size, 'В HAR нет ответов Klarys для указанного диапазона и отдела 74')
  let expectedOffset = 0
  const pages = [...responses].sort(([a], [b]) => a - b).map(([offset, { body }]) => {
    check(offset === expectedOffset, `В HAR отсутствует страница со смещением ${expectedOffset}`)
    const page = JSON.parse(body)
    check(Array.isArray(page?.results), `Ответ со смещением ${offset} не содержит список заказов`)
    expectedOffset += page.results.length
    return page
  })
  const capturedAt = new Date(Math.max(...Array.from(responses.values(), entry => entry.timestamp))).toISOString()
  return { pages, capturedAt }
}

async function main() {
  const { positionals: [period, expectedInput, ...files], values } = parseArgs({
    allowPositionals: true, options: { refs: { type: 'string' }, out: { type: 'string' } },
  })
  check(period && files.length && (/^\d+$/.test(expectedInput ?? '') || expectedInput === 'auto'),
    'Укажите дату или период, число заказов или auto и файл HAR либо файлы ответов по порядку. Дополнительно: --refs файл --out каталог')
  const [from, to = from, extraDate] = period.split('..')
  check(extraDate === undefined, 'В периоде должны быть две даты, разделённые двумя точками')
  const references = values.refs ? await readJson(values.refs) : {}
  const inputs = await Promise.all(files.map(readJson))
  const { pages, capturedAt } = files.length === 1 && files[0].toLowerCase().endsWith('.har')
    ? pagesFromHar(inputs[0], from, to) : { pages: inputs }
  const expected = expectedInput === 'auto' ? pages[0]?.count : Number(expectedInput)
  const data = parsePeriod(pages, from, to, expected, references)
  const summaryDates = from === to ? { date: from } : { from, to }
  console.log(JSON.stringify({ ...summaryDates, orders: data.order_count, lines: data.line_count, quantities: totals(data) }))
  if (!values.out) return
  const times = await Promise.all(files.map(file => stat(file)))
  const savedAt = new Date(Math.max(...times.map(s => s.mtimeMs))).toISOString()
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16)
  const dir = path.resolve(values.out)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const label = from === to ? from : `${from}..${to}`
  const dest = path.join(dir, `${label}_${savedAt.replaceAll(':', '-')}_${hash}.json`)
  const tmp = path.join(dir, `.${randomUUID()}.tmp`)
  const snapshot = { source: 'Klarys / Commandes achat', source_files_saved_at: savedAt,
    source_captured_at: capturedAt, parsed_at: new Date().toISOString(), source_pages: pages.length, ...data }
  try {
    await writeFile(tmp, JSON.stringify(snapshot, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    try { await link(tmp, dest) } catch (e) { if (e.code !== 'EEXIST') throw e }
  } finally { await unlink(tmp).catch(e => { if (e.code !== 'ENOENT') throw e }) }
  console.log(dest)
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
