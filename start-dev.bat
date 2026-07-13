@echo off
REM CCOS Pro Dev Server — Windows quick start (ISOLATED profile)
REM Uses 'dev-test' profile — completely separate from your desktop instance
REM Open http://127.0.0.1:3456/ in browser for H5 UI

set SERVER_PORT=3456
set SERVER_HOST=127.0.0.1
set CLAUDE_H5_DIST_DIR=.\desktop\dist
set PATH=%USERPROFILE%\.bun\bin;%PATH%

echo ============================
echo   CCOS Pro Dev Server
echo   Profile: dev-test (isolated)
echo   http://127.0.0.1:3456/
echo   Press Ctrl+C to stop
echo ============================

bun -e "const { switchProfile, getProfileConfigHomeDir } = require('./src/utils/profileEngine.js'); switchProfile('dev-test'); console.log('Data dir:', getProfileConfigHomeDir()); const { startServer } = require('./src/server/index.js'); await startServer();"
