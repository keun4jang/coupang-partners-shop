@echo off
chcp 65001 >nul
rem 두 번 누르면 이 폴더에서 Claude 가 켜지고, 하던 작업을 바로 이어서 한다 (2026-11-27).
cd /d "%~dp0"
claude "이어서 진행해줘"
