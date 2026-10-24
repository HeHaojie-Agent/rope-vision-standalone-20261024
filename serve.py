from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import os
import webbrowser

os.chdir(Path(__file__).parent / "docs")
SimpleHTTPRequestHandler.extensions_map.update({".wasm":"application/wasm", ".mjs":"application/javascript"})
print("Rope Vision: http://127.0.0.1:8080", flush=True)
webbrowser.open("http://127.0.0.1:8080")
ThreadingHTTPServer(("127.0.0.1",8080),SimpleHTTPRequestHandler).serve_forever()
