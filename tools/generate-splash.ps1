Add-Type -AssemblyName System.Drawing
$width = 480
$height = 280
$bmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# Background #121214
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(18, 18, 20))
$g.FillRectangle($bgBrush, 0, 0, $width, $height)

# Subtle border #27272A
$borderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(39, 39, 42), 1)
$g.DrawRectangle($borderPen, 0, 0, $width - 1, $height - 1)

# Icon
$iconPath = Join-Path $PSScriptRoot "..\build\icon.png"
if (-not (Test-Path $iconPath)) {
    $iconPath = Join-Path $PSScriptRoot "..\assets\branding\master\app-icon-master.png"
}
if (Test-Path $iconPath) {
    $iconImg = [System.Drawing.Image]::FromFile($iconPath)
    $iconSize = 100
    $iconX = [int](($width - $iconSize) / 2)
    $iconY = 40
    $g.DrawImage($iconImg, $iconX, $iconY, $iconSize, $iconSize)
    $iconImg.Dispose()
}

# Title
$titleFont = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(244, 244, 245))
$titleText = "Sibcut Video Editor"
$titleSize = $g.MeasureString($titleText, $titleFont)
$titleX = [int](($width - $titleSize.Width) / 2)
$titleY = 155
$g.DrawString($titleText, $titleFont, $titleBrush, $titleX, $titleY)

# Subtitle
$subFont = New-Object System.Drawing.Font("Segoe UI", 10, [System.Drawing.FontStyle]::Regular)
$subBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(161, 161, 170))
$subText = "Starting Portable Edition..."
$subSize = $g.MeasureString($subText, $subFont)
$subX = [int](($width - $subSize.Width) / 2)
$subY = 195
$g.DrawString($subText, $subFont, $subBrush, $subX, $subY)

# Clean up
$bgBrush.Dispose()
$borderPen.Dispose()
$titleBrush.Dispose()
$subBrush.Dispose()
$titleFont.Dispose()
$subFont.Dispose()
$g.Dispose()

$outputPath = Join-Path $PSScriptRoot "..\build\splash.bmp"
$bmp.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose()
Write-Host "Generated $outputPath ($((Get-Item $outputPath).Length) bytes)"
