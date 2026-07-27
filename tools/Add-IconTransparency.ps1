param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [double]$Inset,

    [Parameter(Mandatory = $true)]
    [double]$Radius
)

Add-Type -AssemblyName System.Drawing

$resolvedPath = (Resolve-Path -LiteralPath $Path).Path
$source = [System.Drawing.Bitmap]::FromFile($resolvedPath)
$output = [System.Drawing.Bitmap]::new(
    $source.Width,
    $source.Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)

try {
    $right = $source.Width - 1 - $Inset
    $bottom = $source.Height - 1 - $Inset
    $centerLeft = $Inset + $Radius
    $centerRight = $right - $Radius
    $centerTop = $Inset + $Radius
    $centerBottom = $bottom - $Radius

    for ($y = 0; $y -lt $source.Height; $y++) {
        for ($x = 0; $x -lt $source.Width; $x++) {
            $nearestX = [Math]::Max($centerLeft, [Math]::Min($centerRight, $x))
            $nearestY = [Math]::Max($centerTop, [Math]::Min($centerBottom, $y))
            $distance = [Math]::Sqrt(
                [Math]::Pow($x - $nearestX, 2) + [Math]::Pow($y - $nearestY, 2)
            ) - $Radius

            # A two-pixel transition retains the source artwork's smooth edge.
            $alpha = [Math]::Max(0, [Math]::Min(255, [Math]::Round((0.5 - $distance / 2.0) * 255)))
            $color = $source.GetPixel($x, $y)
            $output.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
        }
    }

    $temporaryPath = "$resolvedPath.transparent.png"
    $output.Save($temporaryPath, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $source.Dispose()
    $output.Dispose()
}

Move-Item -LiteralPath $temporaryPath -Destination $resolvedPath -Force
