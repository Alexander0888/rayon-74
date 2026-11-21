import hashlib
import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import date, datetime
from decimal import Decimal
from io import BytesIO
from pathlib import Path

from openpyxl import load_workbook


COLUMNS = {
    0: "Magasin", 2: "Rayon", 3: "N° document", 7: "Date de l'enregistrement",
    8: "Opérateur de saisie", 11: "Motif de correction", 14: "Variante",
    16: "Description variante", 20: "Quantité", 22: "PA", 24: "Ventes",
}
MEASURES = ("quantity", "pa", "ventes")
EMPTY = (None, "")
# Excel totals can differ from the exact sum of the exported cells by floating-point noise.
FOOTER_TOLERANCE = Decimal("0.000001")


def report_date(value):
    if not isinstance(value, date):
        raise ValueError("date Excel manquante ou invalide")
    return value.date() if isinstance(value, datetime) else value


def measures(row):
    values = (row[20], row[22], row[24])
    if any(type(value) not in (int, float) for value in values):
        raise ValueError("Quantité, PA ou Ventes invalide")
    result = [Decimal(str(value)) for value in values]
    if not all(value.is_finite() for value in result):
        raise ValueError("Quantité, PA ou Ventes invalide")
    return result


def add(totals, values):
    for index, value in enumerate(values):
        totals[index] += value


def serialized(values):
    return {label: str(value) for label, value in zip(MEASURES, values)}


def parse_report(path, evidence):
    source = path.read_bytes()
    wb = load_workbook(BytesIO(source), read_only=True, data_only=True, keep_links=False)
    try:
        if len(wb.sheetnames) != 1:
            raise ValueError("une seule feuille Correction de stocks est attendue")
        sheet = wb.active
        rows = sheet.iter_rows(min_col=1, max_col=26, values_only=True)
        heading = [next(rows, ()) for _ in range(21)]
        if not heading[20] or heading[1][0] != "Correction de stocks" or any(
            heading[20][column] != name for column, name in COLUMNS.items()
        ):
            raise ValueError("colonnes Correction de stocks non reconnues")
        if heading[4][12] != "Du:" or heading[9][12] != "Au:":
            raise ValueError("période Du / Au introuvable")
        start, end = report_date(heading[4][15]), report_date(heading[8][15])
        if start > end:
            raise ValueError("période Du / Au invalide")
        if any(heading[row][column] not in EMPTY for row, column in ((4, 23), (8, 23), (15, 6), (14, 15))):
            raise ValueError("rapport filtré par opérateur, document, article ou motif")

        accepted_count = 0
        skipped = Counter()
        daily = defaultdict(lambda: [0, Decimal(0), Decimal(0), Decimal(0)])
        report_totals = [Decimal(0)] * 3
        accepted_totals = [Decimal(0)] * 3
        footer = None
        for line, row in enumerate(rows, start=22):
            if all(value in EMPTY for value in row):
                continue
            try:
                if footer is not None:
                    raise ValueError("ligne après les totaux")
                values = measures(row)
                identity_columns = (0, 2, 3, 7, 8, 11, 14, 16)
                if all(row[column] in EMPTY for column in identity_columns):
                    footer = values
                    continue
                if row[0] in EMPTY or row[2] in EMPTY:
                    raise ValueError("magasin ou rayon manquant")
                add(report_totals, values)
                store, department = str(row[0]), str(row[2])
                if (store, department) != ("SIN", "74"):
                    skipped[(store, department)] += 1
                    continue
                day = report_date(row[7])
                variant, name = row[14], row[16]
                if not start <= day <= end:
                    raise ValueError("date de ligne hors période")
                if not all(isinstance(value, str) and value.strip() for value in (variant, name)):
                    raise ValueError("Variante ou Description variante manquante ou invalide")

                accepted_count += 1
                add(accepted_totals, values)
                bucket = daily[(day, variant, name)]
                bucket[0] += 1
                for index, value in enumerate(values, start=1):
                    bucket[index] += value
                evidence[(variant, name)] |= values[0] % 1 != 0
            except ValueError as error:
                raise ValueError(f"ligne {line} : {error}") from error

        if footer is None or any(abs(a - b) > FOOTER_TOLERANCE for a, b in zip(report_totals, footer)):
            raise ValueError("totaux Excel absents ou différents des lignes")
        scope_matches = heading[5][6] in ("SIN", "SINS") and str(heading[10][6]).split(" - ")[0] == "74"
        applicable = accepted_count > 0 or (not skipped and scope_matches)
        return {
            "report": {
                "filename": path.name, "fingerprint": hashlib.sha256(source).hexdigest(),
                "covered_from": start.isoformat(), "covered_to": end.isoformat(),
                "source_row_count": accepted_count, "skipped_row_count": sum(skipped.values()),
                **serialized(accepted_totals),
            },
            "rows": [
                {
                    "recorded_on": day.isoformat(), "variant": variant, "source_name": name,
                    "scan_count": scans, **serialized(values),
                }
                for (day, variant, name), (scans, *values) in sorted(daily.items())
            ],
            "applicable": applicable,
            "skipped": [
                {"store": store, "department": department, "count": count}
                for (store, department), count in sorted(skipped.items())
            ],
        }
    finally:
        wb.close()


GROUPS = {
    "Courgettes": "courgett", "Fraises": "fraise", "Avocats": "avocat",
    "Tomates": "tomat", "Raisins": "raisin", "Poires": "poire", "Pommes": "pomme",
    "Pommes de terre": "pdt", "Carottes": "carotte", "Aubergines": "aubergin",
    "Choux": "chou", "Brocolis": "brocoli", "Salades": "salade batavia laitue lollo rampon iceberg rucola roquette",
    "Poivrons": "poivron", "Champignons": "champ chanterelle", "Oignons": "oignon",
    "Haricots": "haricot", "Pêches": "peche", "Melons": "melon limelon",
    "Kiwis": "kiwi", "Courges": "courge", "Mangues": "mangue", "Nectarines": "nectarine",
    "Ail": "ail", "Citrons": "citron lime", "Asperges": "asperge", "Figues": "figue",
    "Cerises": "cerise", "Prunes": "prune mirabelle", "Ananas": "ananas",
    "Oranges": "orange", "Clémentines": "clementine", "Concombres": "concombr",
    "Bananes": "banane", "Olives": "olive", "Abricots": "abricot", "Framboises": "framboise",
    "Mûres": "mure", "Myrtilles": "myrtille", "Kakis": "kaki", "Fenouils": "fenouil",
    "Endives": "endive", "Maïs": "mais", "Pastèques": "pasteque", "Céleri": "celeri",
    "Épinards": "epinard", "Poireaux": "poireau", "Navets": "navet", "Radis": "radis",
    "Betteraves": "betterave", "Échalotes": "echalot", "Patates douces": "patate",
    "Rhubarbe": "rhubarbe", "Rutabagas": "rutabaga",
}
GROUP_PREFIXES = sorted(
    ((prefix, group) for group, aliases in GROUPS.items() for prefix in aliases.split()),
    key=lambda pair: len(pair[0]), reverse=True,
)
HERBS = "aneth basilic cerfeuil ciboulette coriandre estragon menthe origan persil romarin sauge thym".split()
PACK_WEIGHT = re.compile(r"\b(\d+(?:[.,]\d+)?)\s*(kg|gr|g)\b")


def suggest(name, fractional):
    normalized = "".join(
        char for char in unicodedata.normalize("NFD", name.lower()) if not unicodedata.combining(char)
    )
    tokens = re.findall(r"[a-z0-9]+", normalized)
    if not tokens or tokens[0] in {"mix", "selection", "wok"}:
        return {"category": None, "subcategory": None, "unit": "KG" if fractional else None}
    category = None
    herb = None
    for token in tokens:
        if token in HERBS:
            category, herb = "Herbes aromatiques", token.capitalize()
            break
        category = next(
            (group for prefix, group in GROUP_PREFIXES if token.startswith(prefix)),
            None,
        )
        if category:
            break
    if "pomme de terre" in normalized:
        category = "Pommes de terre"

    top_price = "tp" in tokens or "top price" in normalized
    pack_weight = PACK_WEIGHT.search(normalized)
    pack = bool(pack_weight or {"barquette", "emballe", "emballee", "sachet"}.intersection(tokens)
                or (top_price and category == "Courgettes"))
    unit = None if fractional and pack else "KG" if fractional else "PCE" if pack else None

    local = bool({"local", "lokal"}.intersection(tokens))
    bio = herb is None and bool({"bio", "bnp", "biologique", "organic"}.intersection(tokens))
    group = " ".join(filter(None, ("Lokal" if local else None, herb or category, "Bio" if bio else None)))
    details = []
    if top_price:
        details.append("Top Price")
    for token, label in (("premium", "Premium"),
                         ("jaune", "jaunes"), ("ronde", "rondes")):
        if token in tokens and (token == "premium" or category == "Courgettes"):
            details.append(label)
    if pack_weight and unit == "PCE":
        number, label = pack_weight.groups()
        weight = Decimal(number.replace(",", ".")) * (1000 if label == "kg" else 1)
        details.append(f"{weight.normalize():f} g")
    subcategory = " ".join([group, *details, unit]) if category and unit else None
    return {"category": group if category else None, "subcategory": subcategory, "unit": unit}


def main(paths):
    evidence = defaultdict(bool)
    reports = []
    for source in paths:
        path = Path(source)
        try:
            reports.append(parse_report(path, evidence))
        except (OSError, ValueError) as error:
            raise SystemExit(f"{path.name} — {error}") from error
    proposals = {pair: suggest(pair[1], fractional) for pair, fractional in evidence.items()}
    for report in reports:
        for row in report["rows"]:
            row.update(proposals[(row["variant"], row["source_name"])])
    print(json.dumps(reports, ensure_ascii=False))


if __name__ == "__main__":
    main(sys.argv[1:])
