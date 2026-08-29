$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function HexAt($bmp, $x, $y) {
  $c = $bmp.GetPixel($x, $y)
  return ('{0:X2}{1:X2}{2:X2}' -f $c.R, $c.G, $c.B)
}

function UniqueStep4($bmp) {
  $set = @{}
  for ($y = 0; $y -lt $bmp.Height; $y += 4) {
    for ($x = 0; $x -lt $bmp.Width; $x += 4) {
      $set[(HexAt $bmp $x $y)] = $true
    }
  }
  return $set.Count
}

function FaceCoreDelta($a, $b) {
  $n = 0
  for ($y = 120; $y -le 380; $y++) {
    for ($x = 40; $x -le 260; $x++) {
      if ((HexAt $a $x $y) -ne (HexAt $b $x $y)) { $n++ }
    }
  }
  return $n
}

$r2 = 'C:\Users\mathe\Documents\dev\WebFPVSimulator\.loop\bando-perf\r2'
$r11 = 'C:\Users\mathe\Documents\dev\WebFPVSimulator\.loop\bando-aaa\r11'
$names = @('hall-west','kiln-bore','gantry','hopper','preheater','establishing')
$rows = @()
foreach ($n in $names) {
  $p2 = Join-Path $r2 "$n.png"
  $p11 = Join-Path $r11 "$n.png"
  $h2 = (Get-FileHash $p2 -Algorithm SHA256).Hash.Substring(0,16)
  $h11 = (Get-FileHash $p11 -Algorithm SHA256).Hash.Substring(0,16)
  $b2 = [System.Drawing.Bitmap]::FromFile($p2)
  $b11 = [System.Drawing.Bitmap]::FromFile($p11)
  $row = [ordered]@{
    name = $n
    w = $b2.Width
    h = $b2.Height
    sha16_r2 = $h2
    sha16_r11 = $h11
    ident = ($h2 -eq $h11)
    unique4_r2 = (UniqueStep4 $b2)
    unique4_r11 = (UniqueStep4 $b11)
    p200_200_r2 = (HexAt $b2 200 200)
    p200_200_r11 = (HexAt $b11 200 200)
    p200_400_r2 = (HexAt $b2 200 400)
    p200_400_r11 = (HexAt $b11 200 400)
    p400_250_r2 = (HexAt $b2 400 250)
    p400_250_r11 = (HexAt $b11 400 250)
  }
  if ($n -eq 'hall-west') {
    $row.faceCoreDelta = (FaceCoreDelta $b2 $b11)
  }
  $b2.Dispose(); $b11.Dispose()
  $rows += [pscustomobject]$row
  Write-Output (($row | ConvertTo-Json -Compress))
}
($rows | ConvertTo-Json -Depth 6) | Set-Content -Path (Join-Path $r2 'stills-compare.json') -Encoding utf8
Write-Output 'wrote stills-compare.json'
