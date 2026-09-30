# Astra DB for AI agents — Windows installer.
#   irm https://raw.githubusercontent.com/jestatsio/astra-db-plugin/main/install.ps1 | iex
$ErrorActionPreference = "Stop"
$package = "@erichare/astra-mcp@2"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "astra-db: Node.js 20+ is required (https://nodejs.org), then run: npx -y $package init"
  exit 1
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
  Write-Host "astra-db: Node.js $major found; 20 or newer is required (https://nodejs.org)."
  exit 1
}
& npx -y $package init @args
exit $LASTEXITCODE
