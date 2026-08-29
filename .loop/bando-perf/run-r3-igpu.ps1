$ErrorActionPreference = 'Stop'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$port = 9235
$userDir = Join-Path $env:TEMP 'bando-perf-chrome-r3-igpu-flag'
$outDir = 'C:\Users\mathe\Documents\dev\WebFPVSimulator\.loop\bando-perf\r3'
$url = 'http://127.0.0.1:8765/index.html?map=bando&gpu=low'
New-Item -ItemType Directory -Force -Path $userDir | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'bando-perf-chrome' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 400

$proc = $null
$ws = $null
try {
$proc = Start-Process -FilePath $chrome -PassThru -ArgumentList @(
  "--remote-debugging-port=$port",
  "--user-data-dir=$userDir",
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1600,900',
  '--force-device-scale-factor=1',
  '--force-low-power-gpu',
  '--force_low_power_gpu',
  $url
)
Start-Sleep -Seconds 4

$pages = $null
for ($i = 0; $i -lt 25; $i++) {
  try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 2
    if ($pages -and $pages.Count -gt 0) { break }
  } catch { Start-Sleep -Milliseconds 400 }
}
if (-not $pages) { throw 'chrome debugger did not come up' }
$page = $pages | Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl } | Select-Object -First 1
$wsUrl = $page.webSocketDebuggerUrl
Write-Output "cdp $wsUrl"

$ws = [System.Net.WebSockets.ClientWebSocket]::new()
$ws.ConnectAsync([Uri]$wsUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
$script:cdpId = 0
$recvBuf = New-Object byte[] (2MB)

function Send-Cdp([string]$method, $params) {
  $script:cdpId += 1
  $id = $script:cdpId
  $obj = @{ id = $id; method = $method }
  if ($null -ne $params) { $obj.params = $params }
  $json = $obj | ConvertTo-Json -Compress -Depth 12
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $seg = [ArraySegment[byte]]::new($bytes)
  $ws.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
  return $id
}
function Recv-Cdp($wantId) {
  while ($true) {
    $ms = New-Object System.IO.MemoryStream
    do {
      $seg = [ArraySegment[byte]]::new($recvBuf)
      $r = $ws.ReceiveAsync($seg, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      $ms.Write($recvBuf, 0, $r.Count)
    } while (-not $r.EndOfMessage)
    $text = [Text.Encoding]::UTF8.GetString($ms.ToArray())
    $msg = $text | ConvertFrom-Json
    if ($null -ne $wantId -and $msg.id -eq $wantId) { return $msg }
  }
}
function Eval-Js([string]$expr) {
  $id = Send-Cdp 'Runtime.evaluate' @{ expression = $expr; returnByValue = $true; awaitPromise = $false }
  $msg = Recv-Cdp $id
  if ($msg.result.exceptionDetails) {
    throw ("eval failed: " + ($msg.result.exceptionDetails.exception.description))
  }
  return $msg.result.result.value
}
function Cdp-Call([string]$method, $params) {
  $id = Send-Cdp $method $params
  return Recv-Cdp $id
}

Send-Cdp 'Runtime.enable' @{} | Out-Null
Recv-Cdp $script:cdpId | Out-Null
Send-Cdp 'Page.enable' @{} | Out-Null
Recv-Cdp $script:cdpId | Out-Null
Cdp-Call 'Emulation.setDeviceMetricsOverride' @{
  width = 1600; height = 900; deviceScaleFactor = 1; mobile = $false
} | Out-Null

$ready = $false
for ($i = 0; $i -lt 120; $i++) {
  try {
    if ((Eval-Js '!!(window.__shellReady && window.__map && window.__map())') -eq $true) { $ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'page never became ready' }

Eval-Js @'
(function(){
  var k = "webfpv.settings.v3";
  var s = {};
  try { s = JSON.parse(localStorage.getItem(k) || "{}"); } catch (e) { s = {}; }
  s.graphics = "high"; s.graphicsAuto = false; s.map = "bando";
  localStorage.setItem(k, JSON.stringify(s));
  return s.graphics;
})()
'@ | Out-Null

Eval-Js 'window.dispatchEvent(new Event("resize")); "resized"' | Out-Null
Start-Sleep -Milliseconds 500
Eval-Js '(function(){ var n = document.getElementById("ui"); if (n) n.style.display = "none"; return "hidden"; })()' | Out-Null

$gpu = Eval-Js 'window.__pace().gpu'
Write-Output ('gpu ' + ($gpu | ConvertTo-Json -Compress))
$gname = [string]$gpu.name
if ($gname -match 'NVIDIA|5080|GeForce') {
  throw "still on discrete GPU: $gname"
}
if ($gname -match 'SwiftShader|Basic Render|llvmpipe') {
  throw "software rasteriser: $gname"
}

function Wait-Frames($n) {
  $start = [int](Eval-Js 'window.__boot().frames')
  for ($i = 0; $i -lt 600; $i++) {
    $now = [int](Eval-Js 'window.__boot().frames')
    if ($now -ge ($start + $n)) { return $now }
    Start-Sleep -Milliseconds 80
  }
  return [int](Eval-Js 'window.__boot().frames')
}
function Park($px,$py,$pz,$tx,$ty,$tz) {
  Eval-Js "void(window.__setCam($px,$py,$pz,$tx,$ty,$tz),window.__camMark=window.__boot().frames)" | Out-Null
  Wait-Frames 8 | Out-Null
}
function Dump-View($name) {
  Eval-Js 'window.__paceReset()' | Out-Null
  Wait-Frames 200 | Out-Null
  $js = @"
(function(){
  var canvas = document.querySelector("canvas");
  var m = window.__map();
  return {
    view: "$name",
    map: m && m.id,
    leftoverOverlap: m && m.leftoverOverlap,
    leftoverDeath: m && m.leftoverDeath,
    pointLights: m && m.pointLights,
    casters: m && m.casters,
    pipelineScale: m && m.pipelineScale,
    pipelineSize: m && m.pipelineSize,
    pipelineCss: m && m.pipelineCss,
    canvas: canvas && { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight },
    dpr: window.devicePixelRatio,
    scaleAt: {
      p1080: window.__scaleAt(1920, 1080),
      p1440: window.__scaleAt(2560, 1440),
      p4k: window.__scaleAt(3840, 2160)
    },
    pace: window.__pace(),
    boot: window.__boot(),
    stats: window.__renderStats(),
    budget: window.__budget("$name")
  };
})()
"@
  return Eval-Js $js
}

Park 62 24 44 16 12 0
$est = Dump-View 'establishing'
Park 0.2 3.4 4.8 -46 8 0
$hall = Dump-View 'hall'

Cdp-Call 'Emulation.setDeviceMetricsOverride' @{
  width = 3840; height = 2160; deviceScaleFactor = 1; mobile = $false
} | Out-Null
Eval-Js 'window.dispatchEvent(new Event("resize")); "resized4k"' | Out-Null
Wait-Frames 20 | Out-Null
Park 62 24 44 16 12 0
$est4k = Dump-View 'establishing'
Park 0.2 3.4 4.8 -46 8 0
$hall4k = Dump-View 'hall'

$out = @{
  capturedAt = (Get-Date).ToString('o')
  adapter = 'igpu-low-power'
  cpu = 'AMD Ryzen 7 7800X3D'
  userAgent = Eval-Js 'navigator.userAgent'
  css1600 = @{ establishing = $est; hall = $hall }
  css4k = @{ establishing = $est4k; hall = $hall4k }
}
($out | ConvertTo-Json -Depth 20) | Set-Content -Path (Join-Path $outDir 'pace.json') -Encoding utf8
($est | ConvertTo-Json -Depth 20) | Set-Content -Path (Join-Path $outDir 'probe.json') -Encoding utf8
Write-Output ("gpu={0} software={1}" -f $est.pace.gpu.name, $est.pace.gpu.software)
Write-Output ("1600 establishing {0}x{1} scale={2} ema={3} p95={4} fps={5} render={6} changes={7}" -f $est.canvas.w, $est.canvas.h, $est.pace.scale, $est.pace.emaMs, $est.pace.p95Ms, $est.pace.fps, $est.pace.renderEma, $est.pace.changes)
Write-Output ("1600 hall ema={0} p95={1} fps={2} calls={3}" -f $hall.pace.emaMs, $hall.pace.p95Ms, $hall.pace.fps, $hall.stats.calls)
Write-Output ("4k establishing {0}x{1} scale={2} ema={3} p95={4} fps={5} render={6} changes={7}" -f $est4k.canvas.w, $est4k.canvas.h, $est4k.pace.scale, $est4k.pace.emaMs, $est4k.pace.p95Ms, $est4k.pace.fps, $est4k.pace.renderEma, $est4k.pace.changes)
Write-Output ("4k hall ema={0} p95={1} fps={2}" -f $hall4k.pace.emaMs, $hall4k.pace.p95Ms, $hall4k.pace.fps)
}
finally {
  try {
    if ($ws) {
      $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
    }
  } catch {}
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where-Object { $_.CommandLine -match 'bando-perf-chrome' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
