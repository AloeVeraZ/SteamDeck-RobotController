@echo off
set ELECTRON_RUN_AS_NODE=
start "" "%~dp0runtime\electron.exe" "%~dp0app"
