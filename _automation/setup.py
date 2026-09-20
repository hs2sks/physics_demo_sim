import os, re, sqlite3, json

REPO = "/home/westray/physics_demo_sim"
BOARD_DB = "/home/westray/board/board.db"
MARKER = "<!-- AUTO:CARDS:END -->"
CATEGORIES = ["mechanics","electromagnetism","optics","modern-physics",
              "semiconductor","thermodynamics","interdisciplinary","tools"]

def insert_marker_in_first_grid(path):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    if MARKER in content:
        print(f"  이미 마커 있음: {path}")
        return
    m = re.search(r'<div class="grid">', content)
    if not m:
        print(f"  grid를 못찾음: {path} (수동 확인 필요)")
        return
    depth = 1
    i = m.end()
    tag_re = re.compile(r"<div\b|</div>")
    m2 = None
    while depth > 0:
        m2 = tag_re.search(content, i)
        if not m2:
            print(f"  닫는 태그를 못찾음: {path}")
            return
        depth += 1 if m2.group().startswith("<div") else -1
        i = m2.end()
    new_content = content[:m2.start()] + "    " + MARKER + "\n" + content[m2.start():]
    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"  마커 삽입 완료: {path}")

def main():
    os.makedirs(os.path.join(REPO, "_inbox"), exist_ok=True)
    os.makedirs(os.path.join(REPO, "_automation"), exist_ok=True)
    os.makedirs(os.path.join(REPO, "students", "2026-2", "runs"), exist_ok=True)
    print("폴더 생성 완료")

    print("카테고리 index.html 마커 삽입:")
    for cat in CATEGORIES:
        path = os.path.join(REPO, cat, "index.html")
        if os.path.exists(path):
            insert_marker_in_first_grid(path)
        else:
            print(f"  건너뜀 (파일 없음): {path}")

    con = sqlite3.connect(BOARD_DB)
    cur = con.cursor()
    cur.execute("PRAGMA table_info(code_submissions)")
    cols = [r[1] for r in cur.fetchall()]
    for col, ddl in [
        ("published", "ALTER TABLE code_submissions ADD COLUMN published INTEGER DEFAULT 0"),
        ("published_no", "ALTER TABLE code_submissions ADD COLUMN published_no INTEGER"),
        ("reviewed_at", "ALTER TABLE code_submissions ADD COLUMN reviewed_at TEXT"),
    ]:
        if col not in cols:
            cur.execute(ddl)
            print(f"  DB 컬럼 추가: {col}")
        else:
            print(f"  이미 있음: {col}")
    con.commit()
    con.close()

    index_json_path = os.path.join(REPO, "students", "index.json")
    if not os.path.exists(index_json_path):
        data = [
            {"year": 2026, "semester": 1, "subject": "물리학2", "unit": "역학",
             "count": 31, "desc": "바이브 코딩 수행평가 — 원운동·포물선·충돌·케플러·열역학 등 학생 제작 시뮬레이션",
             "path": "2026-1/physics2-mechanics.html"},
            {"year": 2026, "semester": 2, "subject": "물리학2", "unit": "파동",
             "count": 0, "desc": "바이브 코딩 수행평가 — 파동 단원 학생 제작 시뮬레이션",
             "path": "2026-2/physics2-waves.html"},
        ]
        with open(index_json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print("students/index.json 생성 완료")
    else:
        print("students/index.json 이미 존재")

    gallery_json = os.path.join(REPO, "students", "2026-2", "physics2-waves.json")
    if not os.path.exists(gallery_json):
        with open(gallery_json, "w", encoding="utf-8") as f:
            json.dump([], f)
        print("2026-2 갤러리 json 생성 완료")

    gallery_html = os.path.join(REPO, "students", "2026-2", "physics2-waves.html")
    if not os.path.exists(gallery_html):
        with open(gallery_html, "w", encoding="utf-8") as f:
            f.write(GALLERY_HTML_TEMPLATE)
        print("2026-2 갤러리 html 생성 완료")

    print("설치 완료.")

GALLERY_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>물리학2 파동 시뮬레이션 · 제출 기록 (공개용)</title>
<style>
  :root{--paper:#f6f7f5;--panel:#fff;--ink:#1c2230;--muted:#6b7280;--line:#e2e4e0;--accent:#e0602a;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:"Segoe UI","Malgun Gothic",sans-serif;}
  .wrap{max-width:960px;margin:0 auto;padding:48px 20px 80px;}
  a.home{color:var(--muted);text-decoration:none;font-size:.9em;}
  h1{font-size:1.6em;margin:14px 0 8px;}
  .sub{color:var(--muted);font-size:.92em;max-width:640px;line-height:1.6;}
  .count{font-size:.85em;color:var(--muted);margin:20px 0 10px;}
  .log{display:flex;flex-direction:column;gap:8px;}
  .row{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;display:grid;grid-template-columns:64px 1fr auto;align-items:center;gap:16px;}
  .runid{font-family:monospace;font-weight:600;}
  .summary{font-size:.92em;line-height:1.5;}
  .go{font-size:.85em;font-weight:600;text-decoration:none;color:#fff;background:var(--accent);padding:8px 14px;border-radius:8px;white-space:nowrap;}
  .empty{text-align:center;padding:60px 20px;color:var(--muted);}
  footer{margin-top:36px;color:var(--muted);font-size:.82em;text-align:center;}
  @media (max-width:620px){.row{grid-template-columns:1fr;}.runid{display:none;}}
</style>
</head>
<body>
<div class="wrap">
  <a class="home" href="../../index.html">← 홈으로</a>
  <h1>🌊 물리학2 파동 시뮬레이션 · 제출 기록</h1>
  <p class="sub">학생이 제작한 파동 시뮬레이션 제출 기록입니다. 개인 식별 정보(이름·반)는 제외하고 순번으로 표시했습니다. 승인되는 즉시 이 목록에 자동으로 추가됩니다.</p>
  <div class="count" id="count"></div>
  <div class="log" id="log"></div>
  <div class="empty" id="empty" style="display:none;">아직 등록된 자료가 없습니다.</div>
  <footer>제출 데이터는 과제방(board) 제출 후 검토·승인을 거쳐 게시됩니다.</footer>
</div>
<script>
fetch('physics2-waves.json').then(r=>r.json()).then(items=>{
  const log = document.getElementById('log');
  const empty = document.getElementById('empty');
  document.getElementById('count').innerHTML = `<b>${items.length}</b>건 게시됨`;
  if(!items.length){ empty.style.display='block'; return; }
  log.innerHTML = items.map(s=>`
    <div class="row">
      <div class="runid">학생${String(s.no).padStart(2,'0')}</div>
      <div class="summary">${s.summary}</div>
      <a class="go" href="${s.run}" target="_blank" rel="noopener">코드 보기 →</a>
    </div>`).join('');
}).catch(()=>{ document.getElementById('empty').style.display='block'; });
</script>
</body>
</html>
"""

if __name__ == "__main__":
    main()
