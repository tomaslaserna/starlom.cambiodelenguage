param()

$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'starlim-test-all.ps1')
exit $LASTEXITCODE
