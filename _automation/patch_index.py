import re
path = "/home/westray/physics_demo_sim/students/index.html"
with open(path, encoding="utf-8") as f:
    content = f.read()

new_script = '''<script>
"use strict";
fetch('index.json').then(r=>r.json()).then(submissions=>{
  const host = document.getElementById("list");
  if (!submissions.length) { host.innerHTML = '<p class="empty">아직 등록된 자료가 없습니다.</p>'; return; }
  const years = [...new Set(submissions.map((s) => s.year))].sort((a, b) => b - a);
  host.innerHTML = years.map((yr) => {
    const items = submissions.filter((s) => s.year === yr).sort((a, b) => a.semester - b.semester);
    const cards = items.map((s) => `
      <a class="card" href="${s.path}">
        <div class="sem">${s.year}학년도 ${s.semester}학기</div>
        <div class="title">${s.subject} · ${s.unit}</div>
        <div class="desc">${s.desc}</div>
        <div class="meta">제출 <b>${s.count}</b>명</div>
      </a>`).join("");
    return `<h2>${yr}학년도 <span class="yr-en">${yr}</span></h2><div class="grid">${cards}</div>`;
  }).join("");
}).catch(()=>{ document.getElementById("list").innerHTML = '<p class="empty">목록을 불러오지 못했습니다.</p>'; });
</script>'''

pattern = re.compile(r"<script>\s*\"use strict\";.*?</script>", re.DOTALL)
if not pattern.search(content):
    raise SystemExit("기존 script 블록을 찾지 못했습니다 — 수동 확인 필요")
content = pattern.sub(new_script, content, count=1)
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
print("index.html 패치 완료 (json 방식 전환)")
