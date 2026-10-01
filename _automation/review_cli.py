"""
사용법:
  python3 review_cli.py list [과목]          # 대기중 목록 (과목 생략 시 전체)
  python3 review_cli.py preview <id>        # 미리보기 URL 안내
  python3 review_cli.py approve <id>        # 승인 및 게시
  python3 review_cli.py reject <id>         # 반려

과목(과제방 category) → 갤러리 폴더 매핑은 SETS를 참고.
이미 갤러리(items.json)에 실린 제출물은 board_id로 걸러 내므로 중복 게시되지 않는다.
"""
import os, re, sys, html, sqlite3, datetime

REPO = "/home/westray/physics_demo_sim"
BOARD_DB = "/home/westray/board/board.db"
UPLOAD_DIR = "/home/westray/board/uploads"
YEAR, SEMESTER = 2026, 2
SEMESTER_DIR = os.path.join(REPO, "students", f"{YEAR}-{SEMESTER}")
INDEX_JSON = os.path.join(REPO, "students", "index.json")
HOME_HTML = os.path.join(REPO, "index.html")
# 과제방 category → students/<년도>-<학기>/<folder>/
SETS = {
    "2학년 물리학": "physics",
    "3학년 물리학2": "physics2",
    "2학년 역학과 에너지": "mechanics-energy",
}

sys.path.insert(0, os.path.dirname(__file__))
from common import git_publish, load_json, save_json

def get_conn():
    con = sqlite3.connect(BOARD_DB)
    con.row_factory = sqlite3.Row
    return con

def gallery_dir(category):
    return os.path.join(SEMESTER_DIR, SETS[category])

def items_path(category):
    return os.path.join(gallery_dir(category), "items.json")

def published_ids(category):
    return {i.get("board_id") for i in load_json(items_path(category), [])}

def render_run_html(row):
    """과제방 제출물을 단독 실행 가능한 HTML 한 장으로 만든다."""
    html_code = row["html_code"] or ""
    css, js = row["css_code"] or "", row["js_code"] or ""
    att = row["attachment_filename"]
    if len(html_code.strip()) < 200 and att and not att.endswith((".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip")):
        with open(os.path.join(UPLOAD_DIR, att), encoding="utf-8", errors="replace") as f:
            doc = f.read()
    elif re.search(r"<html", html_code, re.I) and not css.strip() and not js.strip():
        doc = html_code
    else:
        doc = ('<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
               '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
               f'<style>{css}</style></head><body>{html_code}<script>{js}</script></body></html>')
    if not re.search(r"<meta[^>]+charset", doc, re.I):
        if re.search(r"<head", doc, re.I):
            doc = re.sub(r"<head[^>]*>", lambda m: m.group(0) + '<meta charset="UTF-8">', doc, count=1, flags=re.I)
        else:
            doc = '<meta charset="UTF-8">' + doc
    if not re.search(r'name=["\']viewport', doc, re.I):
        doc = re.sub(r"<meta[^>]+charset[^>]*>",
                     lambda m: m.group(0) + '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
                     doc, count=1, flags=re.I)
    return doc

def title_of(doc):
    for pat in (r"<title>(.*?)</title>", r"<h1[^>]*>(.*?)</h1>", r"<h2[^>]*>(.*?)</h2>"):
        for m in re.finditer(pat, doc, re.S | re.I):
            t = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", m.group(1)))).strip()
            if t and t not in ("안녕하세요", "Pen"):  # 에디터 기본 문구 제외
                return t[:80]
    return "제목 없음"

def cmd_list(category=None):
    cats = [category] if category else list(SETS)
    con = get_conn()
    for cat in cats:
        if cat not in SETS:
            print(f"알 수 없는 과목: {cat!r} (가능: {', '.join(SETS)})"); return
        done = published_ids(cat)
        rows = [r for r in con.execute(
            "SELECT id, activity_note, created_at FROM code_submissions "
            "WHERE category = ? AND (published IS NULL OR published = 0) ORDER BY created_at",
            (cat,)).fetchall() if r["id"] not in done]
        print(f"[{cat}] 대기 {len(rows)}건")
        for r in rows:
            note = (r["activity_note"] or "")[:60].replace("\n", " ")
            print(f'  #{r["id"]:>4}  {r["created_at"]}  {note}')

def cmd_preview(sub_id):
    con = get_conn()
    row = con.execute("SELECT * FROM code_submissions WHERE id=?", (sub_id,)).fetchone()
    if not row:
        print("해당 id 없음"); return
    print(f"과목: {row['category']}")
    print(f"미리보기: http://100.126.112.100:5091/preview/{sub_id}  (Tailscale 필요)")
    print(f"제목(추정): {title_of(render_run_html(row))}")
    print(f"활동 요약: {row['activity_note']}")
    print(f"(내부 확인용, 게시 안 됨) 반 정보: {row['class_info']}")

def update_counts(category, count):
    """학생 자료 목록(index.json)과 홈페이지 카드의 작품 수를 맞춘다."""
    path = f"{YEAR}-{SEMESTER}/{SETS[category]}/index.html"
    idx = load_json(INDEX_JSON, [])
    for e in idx:
        if e["path"] == path:
            e["count"] = count; break
    else:
        idx.append({"year": YEAR, "semester": SEMESTER, "subject": category, "unit": "",
                    "count": count, "desc": "학생 제작 시뮬레이션", "path": path})
    save_json(INDEX_JSON, idx)

    with open(HOME_HTML, encoding="utf-8") as f:
        home = f.read()
    pat = re.compile(r'(href="students/' + re.escape(path) + r'">.*?<span class="pill done">작품 )\d+', re.S)
    home, n = pat.subn(lambda m: m.group(1) + str(count), home, count=1)
    if n:
        with open(HOME_HTML, "w", encoding="utf-8") as f:
            f.write(home)
    else:
        print("주의: 홈페이지에서 이 과목 카드를 찾지 못해 작품 수를 갱신하지 못했습니다.")

def cmd_approve(sub_id):
    con = get_conn()
    row = con.execute("SELECT * FROM code_submissions WHERE id=?", (sub_id,)).fetchone()
    if not row:
        print("해당 id 없음"); return
    cat = row["category"]
    if cat not in SETS:
        print(f"거부: #{sub_id}의 과목 '{cat}'에 연결된 갤러리가 없습니다 (SETS 확인)."); return
    if row["published"] or sub_id in published_ids(cat):
        print("이미 처리된 항목입니다."); return

    items = load_json(items_path(cat), [])
    no = max([i["no"] for i in items], default=0) + 1
    doc = render_run_html(row)
    runs_dir = os.path.join(gallery_dir(cat), "runs")
    os.makedirs(runs_dir, exist_ok=True)
    with open(os.path.join(runs_dir, f"{no:03d}.html"), "w", encoding="utf-8") as f:
        f.write(doc)

    items.append({"no": no, "title": title_of(doc), "date": row["created_at"][:10],
                  "run": f"runs/{no:03d}.html", "board_id": sub_id})
    save_json(items_path(cat), items)
    update_counts(cat, len(items))

    con.execute("UPDATE code_submissions SET published=1, published_no=?, reviewed_at=? WHERE id=?",
                (no, datetime.datetime.now().isoformat(), sub_id))
    con.commit()

    ok = git_publish(f"auto: 학생 제출물 게시 ({cat} 학생-{no:02d})")
    print(f"승인 완료 -> [{cat}] 학생-{no:02d}로 게시 (git_publish={ok})")

def cmd_reject(sub_id):
    con = get_conn()
    row = con.execute("SELECT category FROM code_submissions WHERE id=?", (sub_id,)).fetchone()
    if not row:
        print("해당 id 없음"); return
    if row["category"] in SETS and sub_id in published_ids(row["category"]):
        print(f"#{sub_id}는 이미 갤러리에 게시되어 있습니다. items.json에서 직접 빼야 합니다."); return
    con.execute("UPDATE code_submissions SET published=-1, reviewed_at=? WHERE id=?",
                (datetime.datetime.now().isoformat(), sub_id))
    con.commit()
    print(f"#{sub_id} 반려 처리(게시 안 함)")

def main():
    if len(sys.argv) < 2:
        print(__doc__); return
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "list":
        cmd_list(" ".join(args) or None)
    elif cmd in ("preview", "approve", "reject") and args:
        {"preview": cmd_preview, "approve": cmd_approve, "reject": cmd_reject}[cmd](int(args[0]))
    else:
        print(__doc__)

if __name__ == "__main__":
    main()
