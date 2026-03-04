Param(
  [string]$JarPath = "tools/poi-dsl-exporter/target/poi-dsl-exporter-0.1.0.jar",
  [string]$OutDir = "tools/poi-dsl-exporter/showcase-out",
  [string]$ExamplesDir = "tools/poi-dsl-exporter/examples",
  [bool]$CleanOutDir = $false,
  [bool]$GenerateAliasPpts = $true
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $JarPath)) {
  throw "Jar not found: $JarPath. Please run: mvn -f tools/poi-dsl-exporter/pom.xml clean package"
}
if (!(Test-Path $ExamplesDir)) {
  throw "Examples directory not found: $ExamplesDir"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

if ($CleanOutDir) {
  Get-ChildItem -Path $OutDir -File |
    Where-Object { $_.Extension -in @(".pptx", ".docx") } |
    Remove-Item -Force -ErrorAction SilentlyContinue
}

$exampleFiles = Get-ChildItem -Path $ExamplesDir -File -Filter *.json | Sort-Object Name
if ($exampleFiles.Count -eq 0) {
  throw "No json examples found under: $ExamplesDir"
}

$successes = @()
$failures = @()

function Resolve-DocType {
  param([string]$FileNameNoExt, [string]$InputPath)
  if ($FileNameNoExt.StartsWith("report", [System.StringComparison]::OrdinalIgnoreCase)) {
    return "report"
  }
  if ($FileNameNoExt.StartsWith("ppt", [System.StringComparison]::OrdinalIgnoreCase)) {
    return "ppt"
  }
  try {
    $raw = Get-Content $InputPath -Raw
    $m = [System.Text.RegularExpressions.Regex]::Match(
      $raw,
      '"docType"\s*:\s*"(report|ppt)"',
      [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
    )
    if ($m.Success) {
      return $m.Groups[1].Value.ToLowerInvariant()
    }
  } catch {
  }
  return ""
}

foreach ($example in $exampleFiles) {
  $input = $example.FullName
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($example.Name)
  $docType = Resolve-DocType -FileNameNoExt $baseName -InputPath $input
  $ext = switch ($docType) {
    "report" { "docx" }
    "ppt" { "pptx" }
    default { "" }
  }
  if ([string]::IsNullOrWhiteSpace($ext)) {
    $failures += [PSCustomObject]@{
      Example = $example.Name
      Reason = "unsupported docType: $docType"
    }
    continue
  }

  $output = Join-Path $OutDir "$baseName.$ext"
  Write-Host "Exporting $($example.Name) -> $(Split-Path $output -Leaf)"
  try {
    & java -jar $JarPath --input $input --output $output --target auto --strict
    if ($LASTEXITCODE -ne 0) {
      throw "java exited with code $LASTEXITCODE"
    }
    if (!(Test-Path $output)) {
      throw "output file missing"
    }
    $size = (Get-Item $output).Length
    if ($size -le 0) {
      throw "output file empty"
    }
    $successes += [PSCustomObject]@{
      Example = $example.Name
      Output = (Split-Path $output -Leaf)
      SizeKB = [math]::Round($size / 1KB, 1)
    }
  } catch {
    $failures += [PSCustomObject]@{
      Example = $example.Name
      Reason = $_.Exception.Message
    }
  }
}

if ($GenerateAliasPpts) {
  $seedTable = Join-Path $ExamplesDir "ppt-table-showcase.json"
  $seedPivot = Join-Path $ExamplesDir "ppt-table-pivot-showcase.json"
  $aliasNames = @(
    "ppt-table-pivot-showcase-rerun2.pptx",
    "ppt-table-showcase-rerun2.pptx",
    "ppt-table-pivot-showcase-rerun3.pptx",
    "ppt-table-showcase-rerun3.pptx",
    "ppt-table-showcase-rerun.pptx",
    "ppt-table-pivot-showcase.pptx"
  )
  if ((Test-Path $seedTable) -and (Test-Path $seedPivot)) {
    foreach ($aliasName in $aliasNames) {
      $output = Join-Path $OutDir $aliasName
      $seed = if ($aliasName -like "*pivot*") { $seedPivot } else { $seedTable }
      Write-Host "Exporting alias $aliasName"
      try {
        & java -jar $JarPath --input $seed --output $output --target auto --strict
        if ($LASTEXITCODE -ne 0) {
          throw "java exited with code $LASTEXITCODE"
        }
        if (!(Test-Path $output)) {
          throw "output file missing"
        }
        $size = (Get-Item $output).Length
        if ($size -le 0) {
          throw "output file empty"
        }
      } catch {
        $failures += [PSCustomObject]@{
          Example = $aliasName
          Reason = $_.Exception.Message
        }
      }
    }
  } else {
    $missing = @()
    if (!(Test-Path $seedTable)) { $missing += $seedTable }
    if (!(Test-Path $seedPivot)) { $missing += $seedPivot }
    $failures += [PSCustomObject]@{
      Example = "alias-seed"
      Reason = "missing table seeds: $($missing -join ', ')"
    }
  }
}

Write-Host ""
Write-Host "Export summary:"
Write-Host "  Success: $($successes.Count)"
Write-Host "  Failed : $($failures.Count)"
Write-Host "  Output : $OutDir"

if ($successes.Count -gt 0) {
  $successes | Sort-Object Example | Format-Table -AutoSize
}

if ($failures.Count -gt 0) {
  Write-Host ""
  Write-Host "Failed items:"
  $failures | Sort-Object Example | Format-Table -AutoSize
  throw "Some examples failed to export."
}
