param([string]$NodePath = (Get-Command node -ErrorAction Stop).Source)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$version = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
$files = @(
  '.gitignore','package.json','README.md','LICENSE','CHANGELOG.md','SECURITY.md','SYNC_NOTES.md','THIRD_PARTY_NOTICES.md',
  'index.html','style.css','app.js','planner.js','catalog.js','catalog-ui.js','account-model.js','account-ui.js',
  'server.mjs','account-client.mjs','account-device.mjs','account-controller.mjs','calculator-sync.mjs','record-verification.mjs',
  'verify.html','verify.js','start.cmd','update-data.mjs',
  'planner.test.mjs','server.test.mjs','catalog.test.mjs','account-model.test.mjs','record-verification.test.mjs','calculator-sync.test.mjs','account-device.test.mjs','account-client.test.mjs',
  'data/catalog.json','data/GENSHIN-DB-LICENSE.txt','scripts/build-release.ps1',
  '.github/workflows/test.yml','.github/ISSUE_TEMPLATE/bug_report.md'
)
$outDir = Join-Path $projectRoot 'dist'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$stage = Join-Path $outDir ('build-' + [guid]::NewGuid().ToString('N'))
$sourceName = "teyvat-resin-planner-$version-source"
$portableName = "teyvat-resin-planner-$version-windows-x64"
$sourceDir = Join-Path $stage $sourceName
$portableDir = Join-Path $stage $portableName
foreach ($file in $files) {
  foreach ($destination in @($sourceDir,$portableDir)) {
    $targetFile = Join-Path $destination $file
    New-Item -ItemType Directory -Path (Split-Path -Parent $targetFile) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $targetFile
  }
}
$nodeVersion = (& $NodePath --version).Trim()
$nodePlatform = (& $NodePath -p 'process.platform').Trim() + '/' + (& $NodePath -p 'process.arch').Trim()
if ($nodeVersion -notmatch '^v\d+\.\d+\.\d+$' -or $nodePlatform -ne 'win32/x64') { throw 'Windows x64 Node required' }
$runtimeDir = Join-Path $portableDir 'runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Copy-Item -LiteralPath $NodePath -Destination (Join-Path $runtimeDir 'node.exe')
$nodeLicenseUrl = "https://raw.githubusercontent.com/nodejs/node/$nodeVersion/LICENSE"
Invoke-WebRequest -Uri $nodeLicenseUrl -OutFile (Join-Path $runtimeDir 'LICENSE.txt') -UseBasicParsing
$nodeSignature = Get-AuthenticodeSignature -LiteralPath $NodePath
if ($nodeSignature.Status -ne 'Valid') { throw 'Node runtime signature validation failed' }
foreach ($directory in @($sourceDir,$portableDir)) {
  $manifest = [ordered]@{version=$version; runtime=if($directory -eq $portableDir){$nodeVersion}else{$null}; nodeLicenseSource=if($directory -eq $portableDir){$nodeLicenseUrl}else{$null}; files=@()}
  $manifest.files = @(Get-ChildItem -LiteralPath $directory -Recurse -File | Sort-Object FullName | ForEach-Object {
    [ordered]@{path=$_.FullName.Substring($directory.Length+1).Replace('\','/'); bytes=$_.Length; sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
  })
  $manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $directory 'release-manifest.json') -Encoding utf8
}
$sourceZip = Join-Path $outDir "$sourceName.zip"
$portableZip = Join-Path $outDir "$portableName.zip"
Compress-Archive -LiteralPath $sourceDir -DestinationPath $sourceZip -Force
Compress-Archive -LiteralPath $portableDir -DestinationPath $portableZip -Force
@($sourceZip,$portableZip) | ForEach-Object { '{0}  {1}' -f (Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant(),(Split-Path -Leaf $_) } | Set-Content -LiteralPath (Join-Path $outDir 'SHA256SUMS.txt') -Encoding ascii
Write-Output "Release packages: $outDir"
Write-Output "Staging directory retained for inspection: $stage"
