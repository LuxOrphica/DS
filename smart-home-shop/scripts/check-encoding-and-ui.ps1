param(
  [ValidateSet("gate", "step")]
  [string]$Mode = "gate",
  [string]$Target = "public/admin-new.js",
  [string]$StepCommand = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Assert-Tool {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required tool is missing: $Name"
  }
}

function Get-Hash {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Target file not found: $Path"
  }
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash
}

function Invoke-RgMatches {
  param(
    [string]$Pattern,
    [string[]]$Paths,
    [switch]$Regex
  )
  $safePaths = @()
  foreach ($p in $Paths) {
    if (Test-Path -LiteralPath $p) { $safePaths += $p }
  }
  if ($safePaths.Count -eq 0) { return @() }
  $args = @("-n", "--color", "never")
  if ($Regex) { $args += @("--pcre2", $Pattern) } else { $args += @("--fixed-strings", $Pattern) }
  $out = & rg @args @safePaths 2>$null
  if ($LASTEXITCODE -eq 0) { return @($out) }
  return @()
}

function Test-Mojibake {
  param([string]$PathToCheck)
  $matches = @()
  $matches += Invoke-RgMatches -Pattern "(?:[РС]\\p{Cyrillic}){2,}" -Paths @($PathToCheck) -Regex
  $matches += Invoke-RgMatches -Pattern "Ð|Ñ|�" -Paths @($PathToCheck) -Regex
  return @($matches | Where-Object { $_ } | Select-Object -Unique)
}

function Test-MojibakeRepo {
  $matches = @()
  $targets = @("public", "db", "scripts", "server.js")
  $matches += Invoke-RgMatches -Pattern "(?:[РС]\\p{Cyrillic}){2,}" -Paths $targets -Regex
  $matches += Invoke-RgMatches -Pattern "Ð|Ñ|�" -Paths $targets -Regex
  return @($matches | Where-Object { $_ } | Select-Object -Unique)
}

function Run-EncodingCheck {
  Write-Host ">> npm run encoding:check"
  & npm run encoding:check
  if ($LASTEXITCODE -ne 0) {
    throw "encoding:check failed"
  }
}

function Show-GitDiff {
  param([string]$PathToCheck)
  Write-Host ">> git diff -- $PathToCheck"
  & git diff -- $PathToCheck
}

Assert-Tool "git"
Assert-Tool "npm"
Assert-Tool "rg"

if (-not (Test-Path -LiteralPath $Target)) {
  throw "Target file not found: $Target"
}

$beforeHash = Get-Hash -Path $Target
Write-Host "Target: $Target"
Write-Host "Before hash: $beforeHash"

$beforeHits = @(Test-Mojibake -PathToCheck $Target)
if ($beforeHits.Count -gt 0) {
  Write-Host ""
  Write-Host "Mojibake markers found in target BEFORE any step:" -ForegroundColor Yellow
  $beforeHits | Select-Object -First 60 | ForEach-Object { Write-Host $_ }
  throw "Target is not clean before checks"
}

if ($Mode -eq "step") {
  if ([string]::IsNullOrWhiteSpace($StepCommand)) {
    throw "Mode=step requires -StepCommand"
  }
  Write-Host ">> step command: $StepCommand"
  & cmd /c $StepCommand
  if ($LASTEXITCODE -ne 0) {
    throw "Step command failed with code $LASTEXITCODE"
  }
}

$afterHash = Get-Hash -Path $Target
Write-Host "After hash:  $afterHash"
if ($beforeHash -ne $afterHash) {
  Write-Host "Hash changed for $Target" -ForegroundColor Yellow
} else {
  Write-Host "Hash unchanged for $Target"
}

$afterHits = @(Test-Mojibake -PathToCheck $Target)
if ($afterHits.Count -gt 0) {
  Write-Host ""
  Write-Host "Mojibake markers found in target AFTER checks:" -ForegroundColor Red
  $afterHits | Select-Object -First 80 | ForEach-Object { Write-Host $_ }
  throw "Target got mojibake markers after run"
}

$repoHits = @(Test-MojibakeRepo)
if ($repoHits.Count -gt 0) {
  Write-Host ""
  Write-Host "Potential mojibake markers in repository (sample):" -ForegroundColor Yellow
  $repoHits | Select-Object -First 120 | ForEach-Object { Write-Host $_ }
}

Run-EncodingCheck
Show-GitDiff -PathToCheck $Target

Write-Host ""
Write-Host "PASS: encoding gate checks completed."
Write-Host "Manual UI check required: open /admin and verify changed + neighbor blocks visually."
