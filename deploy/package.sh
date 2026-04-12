#!/bin/bash
# Package the extension for intranet distribution
# Output: deploy/release/
#   ├── offline-capture.zip        ← users download this
#   ├── icon-128.png               ← for install page
#   └── index.html                 ← install page

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$SCRIPT_DIR/release"

echo "Building extension..."
cd "$PROJECT_DIR"
npm run build

echo "Packaging..."
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# Create ZIP from dist/
cd "$PROJECT_DIR/dist"
zip -r "$RELEASE_DIR/offline-capture.zip" . -x "*.map"
cd "$PROJECT_DIR"

# Copy install page
cp "$SCRIPT_DIR/install-page/index.html" "$RELEASE_DIR/index.html"
cp "$PROJECT_DIR/src/assets/icon-128.png" "$RELEASE_DIR/icon-128.png"

# Show result
echo ""
echo "=== Release package ready ==="
echo "  $RELEASE_DIR/"
ls -lh "$RELEASE_DIR/"
echo ""
echo "Deploy: copy the release/ folder to your intranet HTTP server."
echo "Users visit: http://your-server/index.html"
