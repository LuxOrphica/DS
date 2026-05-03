#!/usr/bin/env python3
import argparse
import json
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import pdfplumber
from pypdf import PdfReader

try:
    from PIL import ImageFilter
except Exception:
    ImageFilter = None


ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "shop.db"
PDF_PATH = ROOT / "larnitech_catalogue_04_23_web.pdf"
DETAILS_PATH = ROOT / "data" / "larnitech_detailed_specs.json"
IMG_DIR = ROOT / "public" / "images" / "larnitech_pdf"
PDF_PUBLIC_URL = "/docs/larnitech_catalogue_04_23_web.pdf"
FORCED_PAGE_BY_ID = {
    "DEIPCAM": 65,
    "DELS": 24,
    "DWLS01": 61,
    "DWLS02": 58,
    "DWLS03": 62,
    "DWPANEL": 66,
    "DWWLS": 62,
}


def norm(value: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def norm_text(value: str) -> str:
    return re.sub(r"[\W_]+", "", str(value or "").lower(), flags=re.UNICODE)


def safe_slug(value: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", (value or "").lower())
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or "item"


def clean_lines(text: str):
    lines = []
    for raw in (text or "").splitlines():
        line = " ".join(raw.split()).strip()
        if not line:
            continue
        if re.fullmatch(r"\d{1,3}", line):
            continue
        if set(line) <= {".", "-", " "}:
            continue
        line = re.sub(r"\.{3,}", " ", line).strip()
        if line:
            lines.append(line)
    return lines


def build_description(text: str, article: str, name: str = "") -> str:
    lines = clean_lines(text)
    if not lines:
        return ""

    upper_text = "\n".join(lines).upper()
    cut_markers = [
        "\u0425\u0410\u0420\u0410\u041a\u0422\u0415\u0420\u0418\u0421\u0422\u0418\u041a\u0418 \u041c\u041e\u0414\u0423\u041b\u042f",
        "\u041d\u0410\u0417\u0412\u0410\u041d\u0418\u0415 \u041f\u0410\u0420\u0410\u041c\u0415\u0422\u0420\u0410",
        "\u0412\u042b\u0425\u041e\u0414\u041d\u042b\u0415 \u041a\u0410\u041d\u0410\u041b\u042b \u041a\u041e\u041b-\u0412\u041e",
        "\u0412\u0425\u041e\u0414\u041d\u041e\u0415 \u041d\u0410\u041f\u0420\u042f\u0416\u0415\u041d\u0418\u0415",
        "\u0424\u0423\u041d\u041a\u0426\u0418\u0418",
        "\u041f\u0420\u0418\u041c\u0415\u0420 \u041f\u041e\u0414\u041a\u041b\u042e\u0427\u0415\u041d\u0418\u042f",
    ]
    cut_pos = len(upper_text)
    for marker in cut_markers:
        pos = upper_text.find(marker)
        if pos >= 0:
            cut_pos = min(cut_pos, pos)

    raw_prefix = "\n".join(lines)[:cut_pos]
    src_lines = [x.strip() for x in raw_prefix.splitlines() if x.strip()]

    good_keywords = (
        "\u043c\u043e\u0434\u0443\u043b",
        "\u043a\u043e\u043d\u0442\u0440\u043e\u043b",
        "\u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432",
        "\u0434\u0430\u0442\u0447\u0438\u043a",
        "\u043f\u0430\u043d\u0435\u043b",
        "\u0448\u043b\u044e\u0437",
        "\u043f\u0440\u0435\u0434\u043d\u0430\u0437\u043d\u0430\u0447",
        "\u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442",
        "\u0443\u043f\u0440\u0430\u0432\u043b\u0435\u043d",
        "\u043f\u043e\u0437\u0432\u043e\u043b\u044f",
        "\u0438\u0441\u043f\u043e\u043b\u044c\u0437",
    )

    def is_noise(line: str) -> bool:
        s = str(line or "").strip()
        if not s:
            return True
        u = s.upper()
        if "GO TO CONTENTS" in u or "LARNITECH.COM" in u:
            return True
        if norm(s) in {"", norm(article), norm(name)}:
            return True
        if re.fullmatch(r"\d{1,4}", s):
            return True
        if re.fullmatch(r"[A-Z0-9\-\s]{3,}", s):
            return True
        if "(cid:" in s:
            return True
        return False

    preferred = []
    fallback = []
    for line in src_lines:
        if is_noise(line):
            continue
        compact = " ".join(line.split())
        starts = [
            "\u042d\u0442\u043e\u0442 \u043c\u043e\u0434\u0443\u043b\u044c",
            "\u041c\u043e\u0434\u0443\u043b\u044c",
            "\u0413\u043e\u0442\u043e\u0432\u044b\u0439 \u043d\u0430\u0431\u043e\u0440",
            "\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u043b\u0435\u0440",
            "\u041f\u0430\u043d\u0435\u043b\u044c",
            "\u0428\u043b\u044e\u0437",
            "\u0414\u0430\u0442\u0447\u0438\u043a",
            "\u0423\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e",
        ]
        for st in starts:
            pos = compact.find(st)
            if pos > 0:
                compact = compact[pos:]
                break
        low = compact.lower()
        if any(k in low for k in good_keywords):
            preferred.append(compact)
        else:
            fallback.append(compact)

    picked = preferred[:4] if preferred else fallback[:4]
    if not picked:
        picked = [x for x in src_lines if not is_noise(x)][:3]

    desc = " ".join(picked).strip()
    desc = re.sub(r"\s{2,}", " ", desc).strip(" ,;-")
    desc = re.sub(r"\b\d+-\u041a\u0410\u041d\u0410\u041b\u042c\u041d\u041e\u0415\b\s*", "", desc, flags=re.I).strip(" ,;-")
    desc = re.sub(r"\b\d+-\u041a\u0410\u041d\u0410\u041b\u042c\u041d\u042b\u0419\b\s*", "", desc, flags=re.I).strip(" ,;-")
    desc = re.sub(r"\s+\d+\s*$", "", desc).strip(" ,;-")
    desc = re.sub(r"\b\u0430\s+\u0442\u0430\u043a\u0436\u0435\s*$", "", desc, flags=re.I).strip(" ,;-")
    parts = [x.strip() for x in re.split(r"(?<=[.!?])\s+", desc) if x.strip()]
    if parts:
        desc = " ".join(parts[:2]).strip()
    if not desc:
        base = " ".join([x for x in lines[:6] if not is_noise(x)]).strip()
        desc = base

    if article and norm(article) not in norm(desc):
        desc = f"{article}. {desc}"
    return desc[:900].strip()

def looks_dirty_description(text: str) -> bool:
    t = str(text or "").strip()
    if not t:
        return True
    u = t.upper()
    bad_markers = [
        "GO TO CONTENTS",
        "LARNITECH.COM",
        "(CID:",
        "\u0425\u0410\u0420\u0410\u041a\u0422\u0415\u0420\u0418\u0421\u0422\u0418\u041a\u0418 \u041c\u041e\u0414\u0423\u041b\u042f",
        "\u041d\u0410\u0417\u0412\u0410\u041d\u0418\u0415 \u041f\u0410\u0420\u0410\u041c\u0415\u0422\u0420\u0410",
        "\u0424\u0423\u041d\u041a\u0426\u0418\u0418",
        "\u041f\u0420\u0418\u041c\u0415\u0420 \u041f\u041e\u0414\u041a\u041b\u042e\u0427\u0415\u041d\u0418\u042f",
        "\u0415\u0418\u041d\u0410\u0412\u041e\u0414\u0423\u0420\u041e\u0411\u041e",
        "\u0415\u041e\u041d\u0427\u0415\u0415\u0420",
    ]
    if any(x in u for x in bad_markers):
        return True
    if u.count("?") + u.count("?") + u.count("?") >= 2:
        return True
    return False

def build_specs_from_tables(tables):
    out = []
    if not isinstance(tables, list):
        return out
    for table in tables:
        if not isinstance(table, list):
            continue
        for row in table:
            if not isinstance(row, list):
                continue
            cells = [" ".join(str(c or "").split()).strip() for c in row]
            cells = [c for c in cells if c]
            if len(cells) < 2:
                continue
            key = cells[0]
            val = " | ".join(cells[1:])
            if len(key) < 2 or len(val) < 1:
                continue
            out.append(f"{key}: {val}")
    dedup = []
    seen = set()
    for line in out:
        k = norm(line)
        if not k or k in seen:
            continue
        seen.add(k)
        dedup.append(line)
    return dedup


def build_attributes_from_tables(tables):
    out = []
    if not isinstance(tables, list):
        return out

    def clean_cell(value):
        s = " ".join(str(value or "").split()).strip()
        s = s.replace("(cid:6)", "").replace("(cid:7)", "").strip()
        return s

    for table in tables:
        if not isinstance(table, list):
            continue
        for row in table:
            if not isinstance(row, list):
                continue
            cells = [clean_cell(c) for c in row]
            cells = [c for c in cells if c]
            if len(cells) < 2:
                continue
            name = cells[0]
            value = " | ".join(cells[1:])
            if not name or not value:
                continue
            nname = norm_text(name)
            if nname in {"РЅР°Р·РІР°РЅРёРµРїР°СЂР°РјРµС‚СЂР°", "РїР°СЂР°РјРµС‚СЂ", "Р·РЅР°С‡РµРЅРёРµ"}:
                continue
            if len(name) < 2:
                continue
            out.append({"name": name, "value": value})

    dedup = []
    seen = set()
    for item in out:
        key = f"{norm_text(item.get('name'))}:{norm_text(item.get('value'))}"
        if not key or key in seen:
            continue
        seen.add(key)
        dedup.append(item)
    return dedup


def extract_function_lines(text: str):
    text_raw = str(text or "")
    lines = text_raw.splitlines()
    if not lines and not text_raw:
        return []

    start = None
    end = None
    for idx, line in enumerate(lines):
        upper = line.upper()
        if start is None and ("Р¤РЈРќРљР¦Р" in upper or "FUNCTIONS" in upper):
            start = idx
            continue
        if start is not None and ("РџР РРњР•Р  РџРћР”РљР›Р®Р§Р•РќРРЇ" in upper or "CONNECTION EXAMPLE" in upper):
            end = idx
            break
    if start is None:
        for idx, line in enumerate(lines):
            s = str(line or "").strip()
            if re.match(r"^[\u25AA\u25AB\u2022\-\*]", s):
                start = idx
                break
        if start is None:
            return []
    if end is None:
        end = min(len(lines), start + 80)

    block = "\n".join(lines[start:end])
    if not block:
        block = text_raw

    # OCR often places multiple bullet items in one physical line.
    chunks = re.split(r"[\u25AA\u25AB\u2022]+", block)
    out = []
    for chunk in chunks:
        s = " ".join(str(chunk or "").split()).strip()
        if not s:
            continue
        up = s.upper()
        if "Р¤РЈРќРљР¦Р" in up or "FUNCTIONS" in up:
            # Keep only text after the marker if it is embedded in the same chunk.
            s = re.split(r"Р¤РЈРќРљР¦Р[РРЇРA-Z]*|FUNCTIONS", s, flags=re.I)[-1].strip()
        if not s:
            continue
        if len(s) < 3:
            continue
        if len(s) > 280:
            continue
        if "РџСЂРёРјРµСЂ РїРѕРґРєР»СЋС‡РµРЅРёСЏ" in s or "Connection example" in s:
            continue
        sl = s.lower()
        if (
            "РєР»Р°СЃСЃ Р·Р°С‰РёС‚С‹" in sl
            or "С‚РµРјРїРµСЂР°С‚СѓСЂРЅС‹Р№ РґРёР°РїР°Р·РѕРЅ" in sl
            or "РіР°Р±Р°СЂРёС‚С‹" in sl
            or "РјР°СЃСЃР°" in sl
            or "С‚РёРї РјРѕРЅС‚Р°Р¶Р°" in sl
            or "РјР°С‚РµСЂРёР°Р» РєРѕСЂРїСѓСЃР°" in sl
            or "С‚РёРї С€РёРЅС‹" in sl
        ):
            continue
        out.append(s)

    dedup = []
    seen = set()
    for x in out:
        k = norm_text(x)
        if not k or k in seen:
            continue
        seen.add(k)
        dedup.append(x)
    return dedup[:24]


def build_specs_from_text(text: str):
    lines = clean_lines(text)
    out = []
    for line in lines:
        if ":" in line:
            out.append(line)
            continue
        if re.search(r"\b(IP\d{2}|CAN|KNX|RS485|RS232|UART|DALI|V|W|A|mA|В°C|MHz)\b", line, re.IGNORECASE):
            out.append(line)
    dedup = []
    seen = set()
    for line in out:
        k = norm(line)
        if k and k not in seen:
            seen.add(k)
            dedup.append(line)
    return dedup[:20]


def alias_tokens(article: str):
    n = norm(article)
    tokens = {n, n.replace("O", "0"), n.replace("0", "O")}
    manual = {
        "DWHTO7": {"DWHT07"},
        "DWDALI": {"DWDALI2"},
        "DEGWKNX": {"DEGW"},
        "DEMGDALI": {"DEMG", "DWDALI2"},
        "CWMII": {"CWMII", "CWM"},
        "CWMSDII": {"CWMSDII", "CWMSD"},
    }
    tokens.update(manual.get(n, set()))
    return {t for t in tokens if t}


def load_details():
    if not DETAILS_PATH.exists():
        return {}
    try:
        data = json.loads(DETAILS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    out = {}
    if not isinstance(data, dict):
        return out
    for key, rec in data.items():
        if not isinstance(rec, dict):
            continue
        article = str(rec.get("article") or key or "").strip()
        if not article:
            continue
        out[norm(article)] = rec
        out[norm(str(key))] = rec
    return out


def choose_page(product_id: str, article: str, reader: PdfReader, normalized_page_texts, has_large_img, details):
    pid = norm(product_id)
    nk = norm(article)
    forced = FORCED_PAGE_BY_ID.get(pid)
    if forced and 1 <= forced <= len(reader.pages):
        return forced
    detail = details.get(nk)
    if detail:
        page = int(detail.get("page") or 0)
        if page > 0 and page <= len(reader.pages):
            return page

    tokens = alias_tokens(article)
    best = None
    best_score = -10**9
    for idx, ptxt in enumerate(normalized_page_texts, start=1):
        score = 0
        hit = False
        for token in tokens:
            if token and token in ptxt:
                hit = True
                score += 80
                if token == nk:
                    score += 40
        if not hit:
            continue
        if idx == 2:
            score -= 100
        if idx <= 5:
            score -= 30
        if has_large_img[idx - 1]:
            score += 20
        if idx >= 60:
            score += 8
        if score > best_score:
            best_score = score
            best = idx
    return best


def save_product_image(pdf, page_num: int, product_id: str) -> str:
    def save_high_quality_png(image_obj, target_path):
        img = image_obj
        try:
            img = img.convert("RGBA")
        except Exception:
            pass
        w, h = img.size
        min_side = min(w, h)
        target_min_side = 1000
        if min_side > 0 and min_side < target_min_side:
            scale = min(2.4, target_min_side / float(min_side))
            nw = max(1, int(round(w * scale)))
            nh = max(1, int(round(h * scale)))
            img = img.resize((nw, nh), resample=3)  # LANCZOS
        if ImageFilter is not None:
            try:
                img = img.filter(ImageFilter.UnsharpMask(radius=1.2, percent=130, threshold=3))
            except Exception:
                pass
        img.save(target_path, format="PNG", optimize=True, compress_level=6)

    page = pdf.pages[page_num - 1]
    images = []
    for im in page.images:
        w = float(im.get("width") or 0)
        h = float(im.get("height") or 0)
        area = w * h
        if w < 60 or h < 60 or area < 10000:
            continue
        if float(im.get("top") or 0) < 45:
            continue
        images.append((area, im))
    images.sort(key=lambda x: x[0], reverse=True)

    IMG_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{safe_slug(product_id)}_p{page_num}.png"
    out_path = IMG_DIR / filename

    if images:
        im = images[0][1]
        x0 = max(0.0, float(im["x0"]))
        y0 = max(0.0, float(im["top"]))
        x1 = min(float(page.width), float(im["x1"]))
        y1 = min(float(page.height), float(im["bottom"]))
        if x1 - x0 < 10 or y1 - y0 < 10:
            rendered = page.to_image(resolution=320)
            save_high_quality_png(rendered.original, out_path)
            return f"/images/larnitech_pdf/{filename}"
        bbox = (x0, y0, x1, y1)
        crop = page.crop(bbox)
        rendered = crop.to_image(resolution=420)
        save_high_quality_png(rendered.original, out_path)
    else:
        rendered = page.to_image(resolution=320)
        save_high_quality_png(rendered.original, out_path)

    return f"/images/larnitech_pdf/{filename}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="Update all Larnitech rows, not only rows with empty image")
    args = parser.parse_args()

    if not PDF_PATH.exists():
        raise SystemExit(f"PDF not found: {PDF_PATH}")

    details = load_details()
    reader = PdfReader(str(PDF_PATH))
    page_texts = [(p.extract_text() or "") for p in reader.pages]
    normalized_page_texts = [norm(t) for t in page_texts]

    with pdfplumber.open(str(PDF_PATH)) as pdf:
        has_large_img = []
        for page in pdf.pages:
            ok = False
            for im in page.images:
                w = float(im.get("width") or 0)
                h = float(im.get("height") or 0)
                if w >= 80 and h >= 80 and (w * h) >= 15000:
                    ok = True
                    break
            has_large_img.append(ok)

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()

        where = "brand='Larnitech' AND id!='direction-larnitech'"
        if not args.all:
            where += " AND IFNULL(TRIM(image),'')=''"

        rows = cur.execute(
            f"SELECT id, article, name, image, gallery_json, description, specs, attributes_json, documents_json FROM products WHERE {where} ORDER BY id"
        ).fetchall()

        updated = 0
        updated_images = 0
        updated_text = 0
        no_page = []
        now = datetime.now(timezone.utc).isoformat()

        for row in rows:
            pid = str(row["id"] or "").strip()
            article = str(row["article"] or pid).strip()
            page = choose_page(pid, article, reader, normalized_page_texts, has_large_img, details)
            if not page:
                no_page.append(pid)
                continue

            img_url = save_product_image(pdf, page, pid)
            gallery = [img_url]

            detail = details.get(norm(article)) or details.get(norm(pid))
            if detail:
                raw_text = str(detail.get("text") or "")
                table_specs = build_specs_from_tables(detail.get("tables"))
                table_attrs = build_attributes_from_tables(detail.get("tables"))
            else:
                raw_text = page_texts[page - 1]
                table_specs = []
                table_attrs = []

            desc = build_description(raw_text, article, str(row["name"] or ""))
            specs_lines = table_specs or build_specs_from_text(raw_text)
            specs = "\n".join(specs_lines[:24]).strip()
            function_lines = extract_function_lines(raw_text)

            cur_desc = str(row["description"] or "").strip()
            cur_specs = str(row["specs"] or "").strip()
            cur_attrs_raw = str(row["attributes_json"] or "[]").strip()
            try:
                cur_attrs = json.loads(cur_attrs_raw) if cur_attrs_raw else []
                if not isinstance(cur_attrs, list):
                    cur_attrs = []
            except Exception:
                cur_attrs = []

            next_desc = cur_desc
            next_specs = cur_specs
            next_attrs = cur_attrs
            changed_text = False
            if desc and desc != cur_desc:
                next_desc = desc
                changed_text = True
            if specs and (len(specs) > len(cur_specs) or len(cur_specs) < 90):
                next_specs = specs
                changed_text = True
            if table_attrs:
                merged = list(table_attrs)
                for f in function_lines:
                    merged.append({"name": "Р¤СѓРЅРєС†РёСЏ", "value": f})
                next_attrs = merged
                changed_text = True

            docs = []
            try:
                docs = json.loads(str(row["documents_json"] or "[]"))
                if not isinstance(docs, list):
                    docs = []
            except Exception:
                docs = []
            page_doc_url = f"{PDF_PUBLIC_URL}#page={page}"
            if not any(str((d or {}).get("url") or "").strip() == page_doc_url for d in docs):
                docs.append(
                    {
                        "title": f"Larnitech catalogue 2023, page {page}",
                        "url": page_doc_url,
                        "meta": "Official Larnitech catalogue page",
                    }
                )

            cur.execute(
                """
                UPDATE products
                SET image=?,
                    gallery_json=?,
                    description=?,
                    specs=?,
                    attributes_json=?,
                    documents_json=?,
                    updated_at=?
                WHERE id=?
                """,
                (
                    img_url,
                    json.dumps(gallery, ensure_ascii=False),
                    next_desc,
                    next_specs,
                    json.dumps(next_attrs, ensure_ascii=False),
                    json.dumps(docs, ensure_ascii=False),
                    now,
                    pid,
                ),
            )
            updated += 1
            updated_images += 1
            if changed_text:
                updated_text += 1

        conn.commit()
        total_larnitech = cur.execute("SELECT COUNT(*) FROM products WHERE brand='Larnitech'").fetchone()[0]
        no_image = cur.execute(
            "SELECT COUNT(*) FROM products WHERE brand='Larnitech' AND IFNULL(TRIM(image),'')=''"
        ).fetchone()[0]
        no_gallery = cur.execute(
            "SELECT COUNT(*) FROM products WHERE brand='Larnitech' AND IFNULL(TRIM(gallery_json),'') IN ('','[]')"
        ).fetchone()[0]
        conn.close()

    print(
        json.dumps(
            {
                "ok": True,
                "mode": "all" if args.all else "missing_only",
                "processedRows": len(rows),
                "updatedRows": updated,
                "updatedImages": updated_images,
                "updatedTextFields": updated_text,
                "noPageMatch": no_page,
                "stats": {
                    "totalLarnitech": total_larnitech,
                    "noImage": no_image,
                    "noGallery": no_gallery,
                },
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()



