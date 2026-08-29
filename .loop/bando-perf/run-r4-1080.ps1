$ErrorActionPreference = 'Stop'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$outDir = 'C:\Users\mathe\Documents\dev\WebFPVSimulator\.loop\bando-perf\r4'
$url = 'http://127.0.0.1:8765/index.html?map=bando&gpu=low'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Stop-ProbeChrome {
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where-Object { $_.CommandLine -match 'bando-perf-chrome' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Invoke-BandoProbe {
  param(
    [int]$Port,
    [string]$UserDir,
    [string[]]$ExtraArgs,
    [string]$Tag
  )
  New-Item -ItemType Directory -Force -Path $UserDir | Out-Null
  $proc = $null
  $ws = $null
  $script:cdpId = 0
  $recvBuf = New-Object byte[] (2MB)
  try {
    $args = @(
      "--remote-debugging-port=$Port",
      "--user-data-dir=$UserDir",
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1920,1080',
      '--force-device-scale-factor=1',
      '--force-low-power-gpu',
      '--force_low_power_gpu'
    ) + $ExtraArgs + @($url)
    $proc = Start-Process -FilePath $chrome -PassThru -ArgumentList $args
    Start-Sleep -Seconds 4
    $pages = $null
    for ($i = 0; $i -lt 25; $i++) {
      try {
        $pages = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 2
        if ($pages -and $pages.Count -gt 0) { break }
      } catch { Start-Sleep -Milliseconds 400 }
    }
    if (-not $pages) { throw "chrome debugger did not come up ($Tag)" }
    $page = $pages | Where-Object { $_.type -eq 'page' -and $_.webSocketDebuggerUrl } | Select-Object -First 1
    $ws = [System.Net.WebSockets.ClientWebSocket]::new()
    $ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null

    function Send-Cdp([string]$method, $params) {
      $script:cdpId += 1
      $id = $script:cdpId
      $obj = @{ id = $id; method = $method }
      if ($null -ne $params) { $obj.params = $params }
      $json = $obj | ConvertTo-Json -Compress -Depth 12
      $bytes = [Text.Encoding]::UTF8.GetBytes($json)
      $ws.SendAsync([ArraySegment[byte]]::new($bytes), [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
      return $id
    }
    function Recv-Cdp($wantId) {
      while ($true) {
        $ms = New-Object System.IO.MemoryStream
        do {
          $r = $ws.ReceiveAsync([ArraySegment[byte]]::new($recvBuf), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
          $ms.Write($recvBuf, 0, $r.Count)
        } while (-not $r.EndOfMessage)
        $msg = ([Text.Encoding]::UTF8.GetString($ms.ToArray())) | ConvertFrom-Json
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
      return Recv-Cdp (Send-Cdp $method $params)
    }

    Send-Cdp 'Runtime.enable' @{} | Out-Null
    Recv-Cdp $script:cdpId | Out-Null
    Send-Cdp 'Page.enable' @{} | Out-Null
    Recv-Cdp $script:cdpId | Out-Null
    Cdp-Call 'Emulation.setDeviceMetricsOverride' @{
      width = 1920; height = 1080; deviceScaleFactor = 1; mobile = $false
    } | Out-Null

    $ready = $false
    for ($i = 0; $i -lt 120; $i++) {
      try {
        if ((Eval-Js '!!(window.__shellReady && window.__map && window.__map())') -eq $true) { $ready = $true; break }
      } catch {}
      Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw "page never became ready ($Tag)" }

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
    Start-Sleep -Milliseconds 400
    Eval-Js '(function(){ var n = document.getElementById("ui"); if (n) n.style.display = "none"; return "hidden"; })()' | Out-Null

    $gpu = Eval-Js 'window.__pace().gpu'
    Write-Output ("$Tag gpu " + ($gpu | ConvertTo-Json -Compress))
    $gname = [string]$gpu.name
    if ($gname -match 'NVIDIA|5080|GeForce') { throw "$Tag still on discrete GPU: $gname" }
    if ($gname -match 'SwiftShader|Basic Render|llvmpipe') { throw "$Tag software rasteriser: $gname" }

    function Wait-Frames($n) {
      $start = [int](Eval-Js 'window.__boot().frames')
      for ($i = 0; $i -lt 600; $i++) {
        $now = [int](Eval-Js 'window.__boot().frames')
        if ($now -ge ($start + $n)) { return $now }
        Start-Sleep -Milliseconds 50
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
    pipelineScale: m && m.pipelineScale,
    pipelineSize: m && m.pipelineSize,
    pipelineCss: m && m.pipelineCss,
    canvas: canvas && { w: canvas.width, h: canvas.height, cssW: canvas.clientWidth, cssH: canvas.clientHeight },
    dpr: window.devicePixelRatio,
    scaleAt: { p1080: window.__scaleAt(1920, 1080), p1440: window.__scaleAt(2560, 1440), p4k: window.__scaleAt(3840, 2160) },
    pace: window.__pace(),
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
    $pack = @{
      capturedAt = (Get-Date).ToString('o')
      tag = $Tag
      adapter = 'igpu-low-power'
      cpu = 'AMD Ryzen 7 7800X3D'
      css = @(1920, 1080)
      establishing = $est
      hall = $hall
    }
    $path = Join-Path $outDir "pace-$Tag.json"
    ($pack | ConvertTo-Json -Depth 20) | Set-Content -Path $path -Encoding utf8
    Write-Output ("$Tag establishing {0}x{1} scale={2} ema={3:N3} p95={4:N3} fps={5:N2} render={6:N3} shell={7:N3} dtN={8} changes={9}" -f $est.canvas.w, $est.canvas.h, $est.pace.scale, $est.pace.emaMs, $est.pace.p95Ms, $est.pace.fps, $est.pace.renderEma, $est.pace.shellEma, $est.pace.dtN, $est.pace.changes)
    Write-Output ("$Tag hall ema={0:N3} p95={1:N3} fps={2:N2} render={3:N3} calls={4}" -f $hall.pace.emaMs, $hall.pace.p95Ms, $hall.pace.fps, $hall.pace.renderEma, $hall.stats.calls)
    return $pack
  }
  finally {
    try { if ($ws) { $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null } } catch {}
    if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
    Stop-ProbeChrome
  }
}

Stop-ProbeChrome
Start-Sleep -Milliseconds 400
Invoke-BandoProbe -Port 9236 -UserDir (Join-Path $env:TEMP 'bando-perf-chrome-r4-vsync') -ExtraArgs @() -Tag '1080-vsync'
Start-Sleep -Milliseconds 800
Invoke-BandoProbe -Port 9237 -UserDir (Join-Path $env:TEMP 'bando-perf-chrome-r4-unlock') -ExtraArgs @('--disable-frame-rate-limit', '--disable-gpu-vsync') -Tag '1080-unlock'
