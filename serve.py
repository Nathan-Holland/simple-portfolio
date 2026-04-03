import http.server
import os

os.chdir('/Users/nateholland/Documents/VibeCoding/simpleFolio')

import sys
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
handler = http.server.SimpleHTTPRequestHandler
httpd = http.server.HTTPServer(('', port), handler)
httpd.serve_forever()
