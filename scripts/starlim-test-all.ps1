param()

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

function Resolve-Python {
    $commands = @('python', 'python3')
    foreach ($cmd in $commands) {
        $found = Get-Command $cmd -ErrorAction SilentlyContinue
        if ($found -and $found.Source) {
            return @($found.Source)
        }
    }

    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py -and $py.Source) {
        return @($py.Source, '-3')
    }

    $codexPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
    if (Test-Path $codexPython) {
        return @($codexPython)
    }

    throw 'No se encontro Python. Instalar Python 3 o ejecutar desde Codex con runtime empaquetado.'
}

$pg8000Path = Join-Path $env:TEMP 'codex_pg8000_pkg'
if (Test-Path $pg8000Path) {
    if ($env:PYTHONPATH) {
        $env:PYTHONPATH = "$pg8000Path;$env:PYTHONPATH"
    } else {
        $env:PYTHONPATH = $pg8000Path
    }
}

$python = @(Resolve-Python)
$pythonExe = $python[0]
$pythonArgs = @()
if ($python.Length -gt 1) {
    $pythonArgs = $python[1..($python.Length - 1)]
}

& $pythonExe @pythonArgs 'scripts\starlim_repair_audit.py'
exit $LASTEXITCODE
