# Developer commands for the Tower of Hanoi proof of concept.
# The base page stays plain HTML/JavaScript. The React + AI SDK island is bundled
# from src/react-island.jsx into dist/react-island.js.

.PHONY: install build serve open check

# Install pinned npm dependencies from package-lock.json.
install:
	npm ci

# Build the embedded React island bundle used by index.html.
build:
	npm run build

# Serve the current directory locally so the browser can load index.html and dist/.
serve: build
	python3 -m http.server 8000

# Open the app directly in the default browser on macOS.
open: build
	open index.html

# Basic sanity check: build and ensure generated/static files exist.
check:
	npm run check
