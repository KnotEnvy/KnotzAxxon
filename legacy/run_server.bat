@echo off
echo Setting up KnotzAxxon Backend...
python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt
echo.
echo Starting server...
python server.py
pause
