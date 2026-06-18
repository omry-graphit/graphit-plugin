@echo off
REM Graphit CLI plugin wrapper for Windows (Project #246). The directly-runnable
REM entry point: delegates to graphit.ps1, which reads/validates the resolver
REM cache and runs the current @graphit/cli via npx (falling back to the stamped
REM floor version). PowerShell is used because it can parse + validate JSON.
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0graphit.ps1" %*
exit /b %ERRORLEVEL%
