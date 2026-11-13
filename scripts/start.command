#!/bin/zsh
set -e
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 24.14 或更新的 24.x 版本。'
  read '?按回车关闭…'
  exit 1
fi
if [[ ! -d node_modules ]]; then
  npm ci --cache ../npm-cache
fi
npm run build
print 'CVOS 正在启动。使用完毕后在此窗口按 Ctrl+C，再断开外置硬盘。'
(sleep 2; open "http://127.0.0.1:${PORT:-3210}") &
npm start
