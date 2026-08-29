$root = 'C:\Users\mathe\Documents\dev\WebFPVSimulator'
$port = 8765
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.wasm' = 'application/wasm'
  '.css'  = 'text/css; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.ico'  = 'image/x-icon'
  '.mp3'  = 'audio/mpeg'
  '.webm' = 'video/webm'
  '.rec'  = 'application/octet-stream'
  '.diff' = 'text/plain; charset=utf-8'
}
$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$port/"
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Output "AGENT_LOOP_SERVE_bando_perf listening $prefix"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($rel -eq '/') { $rel = '/index.html' }
    $rel = $rel.TrimStart('/').Replace('/', [IO.Path]::DirectorySeparatorChar)
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    $rootFull = [IO.Path]::GetFullPath($root)
    if (-not $path.StartsWith($rootFull)) {
      $res.StatusCode = 403
      $res.Close()
      continue
    }
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes('not found')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }
    $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
    $type = $mime[$ext]
    if (-not $type) { $type = 'application/octet-stream' }
    $res.ContentType = $type
    $bytes = [IO.File]::ReadAllBytes($path)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
  } catch {
    try { $res.StatusCode = 500; $res.Close() } catch {}
  }
}
