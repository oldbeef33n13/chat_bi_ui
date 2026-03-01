Param(
  [string]$JarPath = "tools/poi-dsl-exporter/target/poi-dsl-exporter-0.1.0.jar",
  [string]$OutDir = "tools/poi-dsl-exporter/showcase-out"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $JarPath)) {
  throw "Jar not found: $JarPath. Please run: mvn -f tools/poi-dsl-exporter/pom.xml clean package"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$examples = @(
  @{ Input = "tools/poi-dsl-exporter/examples/report-weekly-ops.json"; Output = "$OutDir/report-weekly-ops.docx" },
  @{ Input = "tools/poi-dsl-exporter/examples/report-rca.json"; Output = "$OutDir/report-rca.docx" },
  @{ Input = "tools/poi-dsl-exporter/examples/report-exec.json"; Output = "$OutDir/report-exec.docx" },
  @{ Input = "tools/poi-dsl-exporter/examples/report-monthly-ops-enterprise.json"; Output = "$OutDir/report-monthly-ops-enterprise.docx" },
  @{ Input = "tools/poi-dsl-exporter/examples/report-quarterly-transformation-showcase.json"; Output = "$OutDir/report-quarterly-transformation-showcase.docx" },
  @{ Input = "tools/poi-dsl-exporter/examples/report-chart-types-showcase.json"; Output = "$OutDir/report-chart-types-showcase.docx" },
  @{ Input = "tools/poi-dsl-exporter/examples/ppt-ops-review.json"; Output = "$OutDir/ppt-ops-review.pptx" },
  @{ Input = "tools/poi-dsl-exporter/examples/ppt-incident.json"; Output = "$OutDir/ppt-incident.pptx" },
  @{ Input = "tools/poi-dsl-exporter/examples/ppt-business.json"; Output = "$OutDir/ppt-business.pptx" },
  @{ Input = "tools/poi-dsl-exporter/examples/ppt-cover-layouts.json"; Output = "$OutDir/ppt-cover-layouts.pptx" },
  @{ Input = "tools/poi-dsl-exporter/examples/ppt-quarterly-board-review.json"; Output = "$OutDir/ppt-quarterly-board-review.pptx" },
  @{ Input = "tools/poi-dsl-exporter/examples/ppt-quarterly-transformation-showcase.json"; Output = "$OutDir/ppt-quarterly-transformation-showcase.pptx" },
  @{ Input = "tools/poi-dsl-exporter/examples/ppt-chart-types-showcase.json"; Output = "$OutDir/ppt-chart-types-showcase.pptx" }
)

foreach ($item in $examples) {
  Write-Host "Exporting $($item.Input) -> $($item.Output)"
  java -jar $JarPath --input $item.Input --output $item.Output --target auto --strict
}

Write-Host "Done. Files generated at: $OutDir"
