"""本地预览 dist/：python3 tools/serve.py [端口]，默认 8848。每次响应都禁止缓存，改完 npm run build 刷新即见。"""
import functools, http.server, os, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8848
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dist")
handler = functools.partial(NoCache, directory=root)
print(f"http://localhost:{port}/")
http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
