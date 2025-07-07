# PowerShell script to create a square icon from the existing PNG
# This script helps resize the icon to a square format

$originalIcon = "assets\icon.png"
$squareIcon = "assets\icon-square.png"

Write-Host "=== AI Markdown Editor Icon Converter ===" -ForegroundColor Green
Write-Host ""

if (Test-Path $originalIcon) {
    Write-Host "✓ Original icon found: $originalIcon" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "To create a square icon, you can:" -ForegroundColor Yellow
    Write-Host "1. Use online tools:" -ForegroundColor White
    Write-Host "   • https://www.iloveimg.com/resize-image" -ForegroundColor Cyan
    Write-Host "   • https://photopea.com/ (free online editor)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "2. Resize to 512x512 or 256x256 pixels" -ForegroundColor White
    Write-Host "3. Save as: $squareIcon" -ForegroundColor White
    Write-Host ""
    Write-Host "4. For Windows installer, convert to .ico:" -ForegroundColor White
    Write-Host "   • https://convertio.co/png-ico/" -ForegroundColor Cyan
    Write-Host "   • Save as: assets\icon.ico" -ForegroundColor White
    Write-Host ""
    
    if (Test-Path $squareIcon) {
        Write-Host "✓ Square icon already exists: $squareIcon" -ForegroundColor Green
    } else {
        Write-Host "⚠ Square icon not found. Please create: $squareIcon" -ForegroundColor Yellow
    }
    
} else {
    Write-Host "❌ Original icon not found: $originalIcon" -ForegroundColor Red
}

Write-Host ""
Write-Host "Press any key to continue..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")