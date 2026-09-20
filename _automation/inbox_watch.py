import os, re, sys, time, shutil

REPO = "/home/westray/physics_demo_sim"
INBOX = os.path.join(REPO, "_inbox")
MARKER = '<!-- AUTO:CARDS:END -->'
STABLE_SECONDS = 60

sys.path.insert(0, os.path.dirname(__file__))
from common import slugify, git_publish

META_RE = re.compile(r"<!--claude-meta\s*(.*?)-->", re.DOTALL)

def parse_meta(text):
    m = META_RE.search(text)
    if not m:
        return None
    fields = {}
    for line in m.group(1).strip().splitlines():
        if ":" in line:
            k, v = line.split(":", 1)
            fields[k.strip()] = v.strip()
    return fields

def card_html(slug, meta):
    icon = meta.get("icon", "🔧")
    title = meta.get("title", slug)
    desc = meta.get("desc", "")
    return f'''    <a class="card" href="{slug}/index.html">
      <div class="icon">{icon}</div>
      <div class="title">{title}</div>
      <div class="desc">{desc}</div>
    </a>'''

def process_file(fname):
    path = os.path.join(INBOX, fname)
    if time.time() - os.path.getmtime(path) < STABLE_SECONDS:
        print(f"[skip] {fname}: 최근 수정됨, 다음 실행에 재확인")
        return

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    meta = parse_meta(content)
    if not meta:
        with open(path + ".error", "w", encoding="utf-8") as f:
            f.write("메타데이터 주석(<!--claude-meta ... -->)이 없습니다.")
        print(f"[error] {fname}: 메타데이터 없음")
        return

    category = meta.get("category")
    slug = meta.get("slug") or slugify(meta.get("title", fname))
    cat_dir = os.path.join(REPO, category) if category else None
    if not category or not os.path.isdir(cat_dir):
        with open(path + ".error", "w", encoding="utf-8") as f:
            f.write(f"알 수 없는 category: {category!r}")
        print(f"[error] {fname}: 잘못된 category {category!r}")
        return

    target_dir = os.path.join(cat_dir, slug)
    os.makedirs(target_dir, exist_ok=True)
    target_path = os.path.join(target_dir, "index.html")
    if os.path.exists(target_path):
        print(f"[error] {fname}: {target_path} 이미 존재 — slug를 바꿔주세요")
        return

    shutil.move(path, target_path)

    cat_index = os.path.join(cat_dir, "index.html")
    with open(cat_index, "r", encoding="utf-8") as f:
        cat_content = f.read()
    if MARKER not in cat_content:
        print(f"[error] {category}/index.html에 마커가 없습니다. setup.py를 먼저 실행하세요.")
        return
    snippet = card_html(slug, meta)
    cat_content = cat_content.replace(MARKER, snippet + "\n    " + MARKER, 1)
    with open(cat_index, "w", encoding="utf-8") as f:
        f.write(cat_content)

    title = meta.get("title", slug)
    ok = git_publish(f"auto: {category}에 '{title}' 추가")
    print(f"[ok] {fname} -> {category}/{slug}/index.html (git_publish={ok})")

def main():
    if not os.path.isdir(INBOX):
        os.makedirs(INBOX, exist_ok=True)
        return
    for fname in sorted(os.listdir(INBOX)):
        if not fname.endswith(".html"):
            continue
        try:
            process_file(fname)
        except Exception as e:
            print(f"[exception] {fname}: {e}")

if __name__ == "__main__":
    main()
