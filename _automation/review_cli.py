"""
사용법:
  python3 review_cli.py list            # 대기중 목록
  python3 review_cli.py preview <id>    # 미리보기 URL 안내
  python3 review_cli.py approve <id>    # 승인 및 게시
  python3 review_cli.py reject <id>     # 반려
"""
import os, sys, sqlite3, datetime

REPO = "/home/westray/physics_demo_sim"
BOARD_DB = "/home/westray/board/board.db"
SEMESTER_DIR = os.path.join(REPO, "students", "2026-2")
GALLERY_JSON = os.path.join(SEMESTER_DIR, "physics2-waves.json")
RUNS_DIR = os.path.join(SEMESTER_DIR, "runs")
INDEX_JSON = os.path.join(REPO, "students", "index.json")
YEAR, SEMESTER, UNIT = 2026, 2, "파동"

sys.path.insert(0, os.path.dirname(__file__))
from common import git_publish, load_json, save_json

def get_conn():
    con = sqlite3.connect(BOARD_DB)
    con.row_factory = sqlite3.Row
    return con

def cmd_list():
    con = get_conn()
    rows = con.execute(
        "SELECT id, class_info, activity_note, created_at FROM code_submissions "
        "WHERE published IS NULL OR published = 0 ORDER BY created_at"
    ).fetchall()
    if not rows:
        print("대기 중인 제출물이 없습니다.")
        return
    for r in rows:
        note = (r["activity_note"] or "")[:60].replace("\n", " ")
        print(f'#{r["id"]:>4}  {r["created_at"]}  {note}')

def render_run_html(row):
    return f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>학생 제출 코드</title><style>{row['css_code'] or ''}</style></head>
<body>{row['html_code'] or ''}<script>{row['js_code'] or ''}</script></body></html>"""

def cmd_preview(sub_id):
    con = get_conn()
    row = con.execute("SELECT * FROM code_submissions WHERE id=?", (sub_id,)).fetchone()
    if not row:
        print("해당 id 없음"); return
    print(f"미리보기: http://100.126.112.100:5091/preview/{sub_id}  (Tailscale 필요)")
    print(f"활동 요약: {row['activity_note']}")
    print(f"(내부 확인용, 게시 안 됨) 반 정보: {row['class_info']}")

def next_no():
    items = load_json(GALLERY_JSON, [])
    return (max([i["no"] for i in items], default=0)) + 1

def cmd_approve(sub_id):
    con = get_conn()
    row = con.execute("SELECT * FROM code_submissions WHERE id=?", (sub_id,)).fetchone()
    if not row:
        print("해당 id 없음"); return
    if row["published"]:
        print("이미 처리된 항목입니다."); return

    no = next_no()
    os.makedirs(RUNS_DIR, exist_ok=True)
    with open(os.path.join(RUNS_DIR, f"{no:03d}.html"), "w", encoding="utf-8") as f:
        f.write(render_run_html(row))

    items = load_json(GALLERY_JSON, [])
    summary = (row["activity_note"] or "").strip() or "요약 없음"
    items.append({"no": no, "summary": summary, "run": f"runs/{no:03d}.html"})
    save_json(GALLERY_JSON, items)

    idx = load_json(INDEX_JSON, [])
    found = False
    for e in idx:
        if e["year"] == YEAR and e["semester"] == SEMESTER and e["unit"] == UNIT:
            e["count"] = len(items); found = True
    if not found:
        idx.append({"year": YEAR, "semester": SEMESTER, "subject": "물리학2", "unit": UNIT,
                     "count": len(items), "desc": f"바이브 코딩 수행평가 — {UNIT} 단원 학생 제작 시뮬레이션",
                     "path": "2026-2/physics2-waves.html"})
    save_json(INDEX_JSON, idx)

    con.execute("UPDATE code_submissions SET published=1, published_no=?, reviewed_at=? WHERE id=?",
                (no, datetime.datetime.now().isoformat(), sub_id))
    con.commit()

    ok = git_publish(f"auto: 학생 제출물 #{no} 게시 (파동 갤러리)")
    print(f"승인 완료 -> 학생{no:02d}로 게시 (git_publish={ok})")

def cmd_reject(sub_id):
    con = get_conn()
    con.execute("UPDATE code_submissions SET published=-1, reviewed_at=? WHERE id=?",
                (datetime.datetime.now().isoformat(), sub_id))
    con.commit()
    print(f"#{sub_id} 반려 처리(게시 안 함)")

def main():
    if len(sys.argv) < 2:
        print(__doc__); return
    cmd = sys.argv[1]
    arg = int(sys.argv[2]) if len(sys.argv) > 2 else None
    {"list": cmd_list, "preview": lambda: cmd_preview(arg),
     "approve": lambda: cmd_approve(arg), "reject": lambda: cmd_reject(arg)}.get(cmd, lambda: print(__doc__))()

if __name__ == "__main__":
    main()
