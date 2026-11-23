import { isSunday, shiftDay, todayInZurich } from '../../app/calendar.js';
import { locale, orders } from '../../content/fr.js';

export const categoryKeys = Object.keys(orders.groups).filter((key) => key !== 'unclassified');
const categoryByLabel = new Map(categoryKeys.map((key) => [orders.groups[key], key]));

export function initialDeliveryDay(now) {
  const day = todayInZurich(now);
  return isSunday(day) ? shiftDay(day, 1) : day;
}

const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase();
const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
const categoryPatterns = [
  ['olives', /^olives?\b/],
  ['freshCut', /\b(?:4g|4e gamme|4eme gamme)\b|^sauce grand mere\b/],
  ['herbs', /^(?:aneth|basilic|cerfeuil|ciboulette|citronnelle|coriandre|estragon|herbe de ble|laurier|liveche|marjolaine|melisse|menthe|origan|oseille|persil|romarin|sarriette|sauge|thym|verveine)\b/],
  ['dried', /\b(?:fruits? secs?|sechees?|massepain)\b|^(?:amandes?|baie de goji|baies? (?:&|et) noix|briquettes?|cacahuetes?|chips de banane|corbeilles?|cranberries|dattes?|graines de courges|mais sec|mendiants?|mix fruits-souris|noisettes?|noix|pignons?|pistaches?|plateau aperitivo|raisins? golden sec|selection box)\b/],
  ['fruits', /^(?:(?:bnp|tp|mini) )?(?:abricots?|ananas|arille de grenade|avocats?|baies?|bananes?|cerises?|citrons?|clementines?|coings?|figues?|fraises?|framboises?|fruits? de la passion|gingembre|grenades?|grenadilles?|groseilles?|jus de grenade|kakis?|kiwis?|limes?|litchis?|mandarines?|mangoustans?|mangues?|marrons?|melons?|mures?|myrtilles?|nashis?|nectarines?|oranges?|pamplemousses?|papayes?|pasteques?|pate[s]? des fruits|peches?|pitahayas?|poires?|pommes?(?! de terre)|prunes?|pruneaux|raisins?)\b/],
  ['vegetables', /^(?:mini )?(?:ail|artichauts?|asperges?|aubergines?|batavia|betteraves?|blettes?|carottes?|catalogna|celeri|champignons?|champ\.|chicorees?|choux?|cima rapa|concombres?|cote de blette|courges?|courgettes?|echalotes?|endives?|epinards?|fenouil|feuille de chene|haricots?|laitues?|mache|mais|manioc|navets?|oignons?|pak choi|patates?|pdt|piments?|poireaux?|pois|poivrons?|pommes? de terre|radis|rampon|roquette|salades?|tomates?)\b|^champ\./],
];

export function orderCategory(line) {
  const name = fold(line.product_name).trim();
  return categoryByLabel.get(line.category)
    ?? categoryPatterns.find(([, pattern]) => pattern.test(name))?.[0]
    ?? 'unclassified';
}

export function isBio(line) {
  return line.is_bio === true || /\b(?:bio|biologique|bnp)\b/.test(fold(line.product_name));
}

export function groupOrders(lines, query, sort) {
  const groups = Object.fromEntries(Object.keys(orders.groups).map((key) => [key, []]));
  const words = fold(query).trim().split(/\s+/);
  for (const line of lines) {
    const matchText = fold([line.product_name, line.internal_ref, line.manor_article, line.manor_variant, line.gtin].join(' '));
    if (words.every((word) => matchText.includes(word))) groups[orderCategory(line)].push(line);
  }
  const direction = sort.endsWith('Desc') ? -1 : 1;
  const byName = (a, b) => collator.compare(a.product_name, b.product_name) || a.id - b.id;
  const compare = sort.startsWith('quantity')
    ? (a, b) => direction * (a.ordered_quantity - b.ordered_quantity) || byName(a, b)
    : (a, b) => direction * byName(a, b);
  for (const rows of Object.values(groups)) {
    rows.sort((a, b) => (b.counting_status === 'cancelled') - (a.counting_status === 'cancelled') || compare(a, b));
  }
  return groups;
}

export function groupOrdersByDay(deliveries, query, sort) {
  const groups = Object.fromEntries(Object.keys(orders.groups).map((key) => [key, []]));
  for (const { date, lines } of deliveries) {
    for (const [category, matches] of Object.entries(groupOrders(lines, query, sort))) {
      if (matches.length) groups[category].push({ date, lines: matches });
    }
  }
  return groups;
}

export function orderSummaries(deliveries) {
  const groups = Object.fromEntries(Object.keys(orders.groups).map((key) => [key, []]));
  for (const { lines } of deliveries) {
    for (const line of lines) groups[orderCategory(line)].push(line);
  }
  return {
    total: orderTotals(categoryKeys.flatMap((category) => groups[category])),
    categories: Object.fromEntries(Object.entries(groups).map(([key, lines]) => [key, orderTotals(lines)])),
  };
}

export function orderTotals(lines) {
  const totals = { ordered: new Map(), confirmed: new Map(), pending: new Map() };
  function add(group, unit, quantity) {
    group.set(unit, (group.get(unit) ?? 0) + Number(quantity));
  }
  for (const line of lines) {
    if (line.counting_status !== 'active') continue;
    add(totals.ordered, line.ordered_unit_id, line.ordered_quantity);
    if (line.validated_quantity == null) add(totals.pending, line.ordered_unit_id, line.ordered_quantity);
    else add(totals.confirmed, line.validated_unit_id, line.validated_quantity);
  }
  return totals;
}

const knownOrigins = {
  159: 'MG', 160: 'EC', 170: 'US', 174: 'ES', 175: 'VN', 179: 'GR', 180: 'TR', 181: 'FR',
  186: 'NL', 188: 'PT', 192: 'PL', 201: 'IN', 211: 'PE', 224: 'IT', 225: 'FR', 228: 'CL', 246: 'IR',
  289: 'MA', 295: 'MX', 308: 'PH', 311: 'CH', 315: 'BE', 360: 'CN', 401: 'CO', 439: 'ZA', 477: 'AU',
  482: 'CI', 537: 'TN', 541: 'NZ', 547: 'TH', 621: 'GH', 622: 'BR', 624: 'CR', 684: 'KE',
  778: 'BO', 781: 'JO', 841: 'RS',
};
const countryNames = new Intl.DisplayNames(locale, { type: 'region' });

export function orderOrigin(line) {
  const code = knownOrigins[line.origin_id];
  if (!code) return { name: line.origin_id === 658 ? 'À confirmer' : line.origin_label || orders.noOrigin, flag: null };
  const flag = String.fromCodePoint(...Array.from(code, (letter) => 0x1F1E6 + letter.charCodeAt(0) - 65));
  return { name: line.origin_id === 225 ? 'Corse' : countryNames.of(code), flag };
}

const decimal = new Intl.NumberFormat(locale, { maximumFractionDigits: 3 });
const currency = Object.fromEntries(Object.entries({ 1: 'EUR', 2: 'CHF' }).map(([id, code]) => [id,
  new Intl.NumberFormat(locale, { style: 'currency', currency: code, maximumFractionDigits: 4 }),
]));

export function quantityLabel(value, unit) {
  if (value == null) return orders.unavailableValue;
  const label = orders.units[unit];
  return [decimal.format(value), label === 'pièce' && Number(value) > 1 ? 'pièces' : label].filter(Boolean).join(' ');
}

export function packageLabel(line) {
  if (line.ordered_unit_id !== 7) {
    return line.ordered_unit_id === 5 ? orders.atWeight : line.ordered_unit_id === 6 ? orders.byPiece : orders.unavailableValue;
  }
  return quantityLabel(line.per_box, line.package_quantity_unit_id);
}

export function priceLabel(line) {
  if (line.price_amount == null) return orders.unavailableValue;
  const amount = (currency[line.currency_id] ?? decimal).format(line.price_amount);
  const unit = orders.units[line.price_unit_id];
  return unit ? `${amount} / ${unit}` : amount;
}
