import subprocess, os, re, json, fcntl

REPO_DIR = "/home/westray/physics_demo_sim"
LOCK_FILE = os.path.join(REPO_DIR, "_automation", ".git.lock")

def slugify(text):
    text = text.strip().lower()
    text = re.sub(r"[^a-z0-9\-]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text or "item"

def run(cmd):
    result = subprocess.run(cmd, cwd=REPO_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"명령 실패: {' '.join(cmd)}\n{result.stdout}\n{result.stderr}")
    return result.stdout

def git_publish(message):
    os.makedirs(os.path.dirname(LOCK_FILE), exist_ok=True)
    with open(LOCK_FILE, "w") as lockf:
        fcntl.flock(lockf, fcntl.LOCK_EX)
        try:
            run(["git", "add", "-A"])
            status = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=REPO_DIR)
            if status.returncode == 0:
                print("변경사항 없음, 커밋 생략")
                return False
            run(["git", "commit", "-m", message])
            run(["git", "pull", "--rebase", "origin", "main"])
            run(["git", "push", "origin", "main"])
            return True
        finally:
            fcntl.flock(lockf, fcntl.LOCK_UN)

def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
