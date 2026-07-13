#!/bin/bash
# CCOS Pro — Ubuntu Development Environment Setup
# Run this on the Ubuntu VM
set -euo pipefail

echo "=== 1. System dependencies ==="
sudo apt update
sudo apt install -y build-essential git curl libfuse2 file

echo "=== 2. Install Bun ==="
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

echo "=== 3. Install Node.js 22 ==="
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs

echo "=== 4. Clone CCOS Pro ==="
git clone https://github.com/kenszx/ccos-pro.git ~/ccos-pro
cd ~/ccos-pro

echo "=== 5. Install dependencies ==="
bun install
cd desktop && bun install && cd ..

echo "=== 6. Build test ==="
cd desktop
bun run build
bun run build:electron
echo "Build OK"

echo ""
echo "=== Ready ==="
echo "Full build command: cd ~/ccos-pro && bun run build:windows-x64 || true"
echo "Linux build:       cd ~/ccos-pro/desktop && bun run build && bun run build:electron && npx electron-builder --linux deb --x64"
echo ""
