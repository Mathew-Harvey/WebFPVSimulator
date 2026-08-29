$ErrorActionPreference = 'Stop'
$w = if ($env:BANDO_W) { $env:BANDO_W } else { '1600' }
$h = if ($env:BANDO_H) { $env:BANDO_H } else { '900' }
$tag = if ($env:BANDO_TAG) { $env:BANDO_TAG } else { '' }
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$port = if ($env:BANDO_CDP) { [int]$env:BANDO_CDP } else { 9229 }
$userDir = Join-Path $env:TEMP "bando-perf-chrome-$w-$h"
$outDir = 'C:\Users\mathe\Documents\dev\WebFPVSimulator\.loop\bando-perf\r1'
$url = 'http://127.0.0.1:8765/index.html?map=bando'
New-Item -ItemType Directory -Force -Path $userDir | Out-Null
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$proc = Start-Process -FilePath $chrome -PassThru -ArgumentList @(
  "--remote-debugging-port=$port",
  "--user-data-dir=$userDir",
  '--no-first-run',
  '--no-default-browser-check',
  "--window-size=$w,$h",
  '--force-device-scale-factor=1',
  $url
)
Start-Sleep -Seconds 3

$pages = $null
for ($i = 0; $i -lt 20; $i++) {
  try {
    $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/list" -TimeoutSec 2
    if ($pages -and $pages.Count -gt 0) { break }
  } catch {
    Start-Sleep -Milliseconds 400
  }
}
if (-not $pages) { throw 'chrome debugger did not come up' }
$page = $pages | Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl } | Select-Object -First 1
if (-not $page) { $page = $pages | Where-Object { $_.webSocketDebuggerUrl } | Select-Object -First 1 }
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
    if ($null -eq $wantId) { return $msg }
  }
}

function Eval-Js([string]$expr) {
  $id = Send-Cdp 'Runtime.evaluate' @{
    expression = $expr
    returnByValue = $true
    awaitPromise = $false
  }
  $msg = Recv-Cdp $id
  if ($msg.result.exceptionDetails) {
    throw ("eval failed: " + ($msg.result.exceptionDetails.exception.description))
  }
  return $msg.result.result.value
}

Send-Cdp 'Runtime.enable' @{} | Out-Null
Recv-Cdp $script:cdpId | Out-Null
Send-Cdp 'Page.enable' @{} | Out-Null
Recv-Cdp $script:cdpId | Out-Null

$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $v = Eval-Js '!!(window.__shellReady && window.__map && window.__map())'
    if ($v -eq $true) { $ready = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 500
}
if (-not $ready) { throw 'page never became ready' }

$seed = @'
(function(){
  var k = 'webfpv.settings.v3';
  var s = {};
  try { s = JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { s = {}; }
  s.graphics = 'high';
  s.graphicsAuto = false;
  s.map = 'bando';
  localStorage.setItem(k, JSON.stringify(s));
  return s.graphics;
})()
'@
$g = Eval-Js $seed
Write-Output "graphics $g"

function Wait-Frames($n) {
  $start = [int](Eval-Js 'window.__boot().frames')
  for ($i = 0; $i -lt 120; $i++) {
    $now = [int](Eval-Js 'window.__boot().frames')
    if ($now -ge ($start + $n)) { return $now }
    Start-Sleep -Milliseconds 100
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
  $js = @'
(function(){
  var canvas = document.querySelector('canvas');
  var m = window.__map();
  return {
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
    budget: window.__budget('establishing')
  };
})()
'@
  $raw = Eval-Js $js
  return $raw
}

Park 62 24 44 16 12 0
$est = Dump-View 'establishing'
Park -8 3.4 0 -46 8 0
$hall = Dump-View 'hall'

$out = @{
  capturedAt = (Get-Date).ToString('o')
  userAgent = Eval-Js 'navigator.userAgent'
  establishing = $est
  hall = $hall
}
$json = $out | ConvertTo-Json -Depth 20
$paceName = if ($tag) { "pace-$tag.json" } else { 'pace.json' }
$probeName = if ($tag) { "probe-$tag.json" } else { 'probe.json' }
Set-Content -Path (Join-Path $outDir $paceName) -Value $json -Encoding utf8
Set-Content -Path (Join-Path $outDir $probeName) -Value ($est | ConvertTo-Json -Depth 20) -Encoding utf8
Write-Output "wrote $paceName and $probeName"
Write-Output ($est.pace | ConvertTo-Json -Compress)
Write-Output ("calls={0} tris={1} p5={2}" -f $est.stats.calls, $est.stats.triangles, $est.budget.p5_target_MB_at_1080p)

try { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null } catch {}
if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
