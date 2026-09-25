# Start Portfolio Servers
# Run: .\start.ps1

Write-Host "Starting Portfolio Backend (port 3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; node server.js" -WindowStyle Normal

Start-Sleep -Seconds 1

Write-Host "Starting Portfolio Frontend (port 3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot'; python -m http.server 3000" -WindowStyle Normal

Write-Host ""
Write-Host "Portfolio is live!" -ForegroundColor Green
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor Yellow
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor Yellow
Write-Host ""
Write-Host "REMINDER: Set your Gmail App Password in backend/.env" -ForegroundColor Magenta
Write-Host "  Get it at: https://myaccount.google.com/apppasswords" -ForegroundColor Magenta
