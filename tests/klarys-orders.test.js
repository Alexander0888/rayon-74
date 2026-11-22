import assert from 'node:assert/strict'
import test from 'node:test'
import { pagesFromHar, parseDay, parsePeriod, totals } from '../scripts/read-klarys-orders.js'

const date = '2026-08-10'
function item(id, extras = {}) {
  return { id, order_id: 1, frontend_designation: 'Produit test',
    gtin: '0012345678905', quantity: 5, quantity_unit_id: 7, package_quantity: 3,
    package_quantity_unit_id: 5, status: 'accepted', is_cancelled_by_seller: false, ...extras }
}
function order(id, items) {
  return { id, marketplace_id: 139, buyer_aisle_reference: 'RY74', buyer_company_id: 71408,
    delivery_location_id: 7636, type: 'purchase', delivery_date: date, status: 'to_prepare', items }
}
function page(results, overrides = {}) {
  return { count: results.length, previous: null, next: null, results, ...overrides }
}

test('различает ящики и штуки, сохраняет коды и обе цены', () => {
  const data = parseDay([page([order(1, [
    item(10, { price: null, price_of_the_day: 2.5, price_of_the_day_unit_id: 5,
      price_seen_by_customer_at_order_creation: 2, price_seen_by_customer_at_order_creation_unit_id: 5, currency_id: 2 }),
    item(11, { quantity_unit_id: 6 }),
  ])])], date, 1)
  const [box, pieces] = data.orders[0].items
  assert.equal(box.gtin, '0012345678905')
  assert.equal(box.ordered_boxes, 5)
  assert.equal(box.per_box, 3)
  assert.equal(box.price.amount, 2.5)
  assert.equal(box.price_at_order_creation.amount, 2)
  assert.equal(pieces.ordered_boxes, null)
  assert.deepEqual(totals(data).active, { Colis: 5, Pcs: 5 })
})

test('отмена строки, отмена заказа и неизвестный статус остаются отдельными', () => {
  const a = order(1, [item(10), item(11, { is_cancelled_by_seller: true }), item(12, { status: 'unknown' })])
  const b = { ...order(2, [item(13, { order_id: 2 })]), status: 'cancelled' }
  assert.deepEqual(totals(parseDay([page([a, b])], date, 2)),
    { active: { Colis: 5 }, cancelled: { Colis: 10 }, unclassified: { Colis: 5 } })
})

test('принимает полный день и отклоняет неполные, посторонние и повторные данные', () => {
  const a = order(1, [item(10)])
  const b = order(2, [item(11, { order_id: 2 })])
  const first = page([a], { count: 2, next: 'page2' })
  const last = page([b], { count: 2, previous: 'page1' })
  assert.equal(parseDay([first, last], date, 2).line_count, 2)
  assert.throws(() => parseDay([first], date, 2))
  assert.throws(() => parseDay([page([a, a])], date, 2))
  assert.throws(() => parseDay([page([{ ...a, items: [item(1), item(1)] }])], date, 1))
  assert.throws(() => parseDay([page([{ ...a, buyer_aisle_reference: 'RY00' }])], date, 1))
  assert.throws(() => parseDay([page([a])], '2026-08-11', 1))
  assert.throws(() => parseDay([page([a])], date, 2))
  assert.equal(parseDay([page([])], date, 0).line_count, 0)
})

test('собирает страницы за месяц и сохраняет дату доставки каждого заказа', () => {
  const from = '2026-08-01'
  const to = '2026-08-31'
  const start = { ...order(1, [item(10)]), delivery_date: from }
  const end = { ...order(2, [item(11, { order_id: 2 })]), delivery_date: to }
  const first = page([end], { count: 2, next: 'page2' })
  const last = page([start], { count: 2, previous: 'page1' })

  const data = parsePeriod([first, last], from, to, 2)
  assert.equal(data.delivery_date_from, from)
  assert.equal(data.delivery_date_to, to)
  assert.deepEqual(data.orders.map(order => order.delivery_date), [to, from])
  assert.equal(data.line_count, 2)
  assert.throws(() => parsePeriod([first, last], from, '2026-08-30', 2), /вне выбранного периода/)
  assert.throws(() => parsePeriod([first], from, to, 2), /Неполный набор страниц/)
  assert.throws(() => parsePeriod([first, page([], { count: 2, previous: 'page1' })], from, to, 2), /отличается от ожидаемого/)
})

test('HAR отбирает страницы нужного периода и учитывает выставленные счета', () => {
  const from = '2026-08-01'
  const to = '2026-08-31'
  const earlier = '2026-08-31T08:00:00Z'
  const later = '2026-08-31T08:01:00Z'
  const filteredUrl = `https://klarys.app/api/buyer/orders/?delivery_location_id=7636&buyer_company_id=71408&from_delivery_date=${from}&to_delivery_date=${to}`
  const entry = (url, body, startedDateTime = earlier) => ({
    request: { method: 'GET', url },
    response: { status: 200, content: { text: JSON.stringify(body) } },
    startedDateTime,
  })
  const a = { ...order(1, [item(10)]), status: 'invoiced', marketplace_id: 143 }
  const b = order(2, [item(11, { order_id: 2 })])
  const first = entry(filteredUrl, page([a], { count: 2, next: 'page2' }))
  const last = entry(`${filteredUrl}&offset=1`, page([b], { count: 2, previous: 'page1' }), later)
  const extra = entry(filteredUrl.replace(to, '2026-09-01'), page([]))
  const { pages, capturedAt } = pagesFromHar({ log: { entries: [extra, last, first, first] } }, from, to)

  const data = parsePeriod(pages, from, to, 2)
  assert.equal(capturedAt, '2026-08-31T08:01:00.000Z')
  assert.equal(data.orders[0].marketplace_id, 143)
  assert.deepEqual(totals(data).active, { Colis: 10 })
  assert.throws(() => pagesFromHar({ log: { entries: [last] } }, from, to), /смещением 0/)
})
