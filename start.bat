@echo off
cd /d "%~dp0"
echo ================================================
echo   Axis AI Console - run locally
echo ================================================
echo.
set /p OPENAI_API_KEY=Paste your OpenAI API key (sk-...) then press Enter:
echo.
echo Opening http://localhost:5050 in your browser...
echo Keep THIS window open. Press Ctrl+C here to stop the server.
echo.
start "" http://localhost:5050
node local-server.js
echo.
echo Server stopped. If you saw an error above, copy it and send it over.
pause
