# Category Preview Image Generator
# Crops source images to 16:9 and resizes to 384x216 for high-DPI thumbnails

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDir = Join-Path $projectRoot "imagesfororganizing"
$destDir = Join-Path $projectRoot "public\previews"

if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$mappings = @(
    # Effects Tab (EFFECT_CATEGORIES)
    @{ Source = "001-This-may-contain-a-bench-sitting-in-front-of-a-tree-with-pin.jpg"; Dest = "fx-basic.jpg" }
    @{ Source = "005-This-may-contain-a-beautiful-young-woman-posing-on-a-swing.jpg"; Dest = "fx-motion.jpg" }
    @{ Source = "002-This-may-contain-a-woman-standing-on-top-of-a-beach-next-to.jpg"; Dest = "fx-light.jpg" }
    @{ Source = "002-This-may-contain-a-living-room-filled-with-furniture-and-a-f.png"; Dest = "fx-retro.jpg" }
    @{ Source = "004-This-may-contain-a-woman-with-tattoos-and-piercings-in-a-roo.jpg"; Dest = "fx-glitch.jpg" }
    @{ Source = "001-Story-pin-image.jpg"; Dest = "fx-distort.jpg" }
    @{ Source = "003-This-may-contain-a-painting-of-a-woman-with-black-hair-and-b.jpg"; Dest = "fx-stylize.jpg" }
    @{ Source = "004-This-may-contain-a-woman-with-tattoos-and-piercings-in-a-roo.jpg"; Dest = "fx-party.jpg" }
    @{ Source = "006-This-may-contain-a-young-boy-with-blue-eyes-hiding-behind-le.jpg"; Dest = "fx-frames.jpg" }
    @{ Source = "008-This-may-contain-a-man-standing-in-front-of-a-snow-covered-m.jpg"; Dest = "fx-weather.jpg" }
    @{ Source = "002-This-may-contain-a-man-standing-on-top-of-a-lush-green-field.jpg"; Dest = "fx-body.jpg" }

    # Filters Tab (FILTER_CATEGORIES)
    @{ Source = "girl1.jpg"; Dest = "filter-featured.jpg" }
    @{ Source = "girl12.jpg"; Dest = "filter-portrait.jpg" }
    @{ Source = "nature155lake.jpg"; Dest = "filter-landscape.jpg" }
    @{ Source = "005-This-may-contain-a-living-room-filled-with-lots-of-furniture.jpg"; Dest = "filter-food.jpg" }
    @{ Source = "nature1withcar.jpg"; Dest = "filter-film.jpg" }
    @{ Source = "004-This-may-contain-a-woman-with-freckled-hair-is-posing-in-the.png"; Dest = "filter-vintage.jpg" }
    @{ Source = "006-This-may-contain-a-woman-with-long-blonde-hair-and-blue-eyes.jpg"; Dest = "filter-mono.jpg" }
    @{ Source = "nature1intrain.jpg"; Dest = "filter-cinematic.jpg" }
    @{ Source = "004-This-may-contain-a-woman-with-tattoos-and-piercings-in-a-roo.jpg"; Dest = "filter-night.jpg" }
    @{ Source = "003-This-may-contain-a-woman-with-long-blonde-hair-standing-in-t.jpg"; Dest = "filter-warm.jpg" }
    @{ Source = "008-This-may-contain-a-man-standing-in-front-of-a-snow-covered-m.jpg"; Dest = "filter-cool.jpg" }

    # Transitions Tab (Dual scene sweeps: trans-a-*, trans-b-*)
    @{ Source = "nature155lake.jpg"; Dest = "trans-a-basic.jpg" }
    @{ Source = "girl1.jpg"; Dest = "trans-b-basic.jpg" }
    @{ Source = "001-This-may-contain-a-bench-sitting-in-front-of-a-tree-with-pin.jpg"; Dest = "trans-a-slide.jpg" }
    @{ Source = "nature1withcar.jpg"; Dest = "trans-b-slide.jpg" }
    @{ Source = "girl12.jpg"; Dest = "trans-a-shape.jpg" }
    @{ Source = "nature15.jpg"; Dest = "trans-b-shape.jpg" }
    @{ Source = "005-This-may-contain-a-beautiful-young-woman-posing-on-a-swing.jpg"; Dest = "trans-a-zoom.jpg" }
    @{ Source = "007-This-may-contain-a-man-walking-through-a-lush-green-field.jpg"; Dest = "trans-b-zoom.jpg" }
    @{ Source = "002-This-may-contain-a-woman-standing-on-top-of-a-beach-next-to.jpg"; Dest = "trans-a-light.jpg" }
    @{ Source = "004-This-may-contain-a-woman-with-tattoos-and-piercings-in-a-roo.jpg"; Dest = "trans-b-light.jpg" }
    @{ Source = "004-This-may-contain-a-woman-with-tattoos-and-piercings-in-a-roo.jpg"; Dest = "trans-a-glitch.jpg" }
    @{ Source = "003-This-may-contain-a-painting-of-a-woman-with-black-hair-and-b.jpg"; Dest = "trans-b-glitch.jpg" }
    @{ Source = "nature11.jpg"; Dest = "trans-a-3d.jpg" }
    @{ Source = "girl122.jpg"; Dest = "trans-b-3d.jpg" }
    @{ Source = "nature11.jpg"; Dest = "trans-a-blur.jpg" }
    @{ Source = "girl122.jpg"; Dest = "trans-b-blur.jpg" }

    # Color Tab (CATEGORIES in adjust.js)
    @{ Source = "nature155lake.jpg"; Dest = "color-layer.jpg" }
    @{ Source = "nature1withcar.jpg"; Dest = "color-luts.jpg" }
    @{ Source = "002-This-may-contain-a-woman-standing-on-top-of-a-beach-next-to.jpg"; Dest = "color-presets.jpg" }
)

# JPEG codec
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]85)

$targetW = 384
$targetH = 216
$targetRatio = 16.0 / 9.0

Write-Host "Processing $($mappings.Count) category preview images..."

foreach ($m in $mappings) {
    $srcPath = Join-Path $sourceDir $m.Source
    $dstPath = Join-Path $destDir $m.Dest

    if (-not (Test-Path $srcPath)) {
        Write-Warning "Source image not found: $srcPath"
        continue
    }

    # Load image via stream to avoid file locking
    $bytes = [System.IO.File]::ReadAllBytes($srcPath)
    $ms = New-Object System.IO.MemoryStream(,$bytes)
    $srcImg = [System.Drawing.Image]::FromStream($ms)

    $srcW = $srcImg.Width
    $srcH = $srcImg.Height
    $srcRatio = $srcW / [double]$srcH

    if ($srcRatio -gt $targetRatio) {
        $cropH = $srcH
        $cropW = [int]($srcH * $targetRatio)
        $cropX = [int](($srcW - $cropW) / 2)
        $cropY = 0
    } else {
        $cropW = $srcW
        $cropH = [int]($srcW / $targetRatio)
        $cropX = 0
        $cropY = [int](($srcH - $cropH) / 2)
    }

    $destBmp = New-Object System.Drawing.Bitmap($targetW, $targetH, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $destRect = New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)
    $srcRect = New-Object System.Drawing.Rectangle($cropX, $cropY, $cropW, $cropH)

    $g.DrawImage($srcImg, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)

    $destBmp.Save($dstPath, $jpegCodec, $encoderParams)

    $g.Dispose()
    $destBmp.Dispose()
    $srcImg.Dispose()
    $ms.Dispose()

    $fileSize = (Get-Item $dstPath).Length
    Write-Host "Generated: $($m.Dest) ($([math]::Round($fileSize / 1KB, 1)) KB)"
}

Write-Host "Done! All preview images generated in $destDir"
