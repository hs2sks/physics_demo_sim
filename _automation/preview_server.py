from flask import Flask, abort, Response
import sqlite3

BOARD_DB = "/home/westray/board/board.db"
app = Flask(__name__)

def render(row):
    return f"""<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>미리보기 #{row['id']}</title><style>{row['css_code'] or ''}</style></head>
<body>{row['html_code'] or ''}<script>{row['js_code'] or ''}</script></body></html>"""

@app.route("/preview/<int:sub_id>")
def preview(sub_id):
    con = sqlite3.connect(BOARD_DB)
    con.row_factory = sqlite3.Row
    row = con.execute("SELECT * FROM code_submissions WHERE id=?", (sub_id,)).fetchone()
    if not row:
        abort(404)
    return Response(render(row), mimetype="text/html")

if __name__ == "__main__":
    app.run(host="100.126.112.100", port=5091)
