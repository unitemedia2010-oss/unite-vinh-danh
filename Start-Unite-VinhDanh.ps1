param(
    [ValidateSet('admin', 'screen')]
    [string]$View = 'admin',
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$webDirectory = Join-Path $projectRoot 'apps\web-control'
$runtimeDirectory = Join-Path $env:LOCALAPPDATA 'UniteVinhDanh'
$localAdminUrl = 'http://localhost:5173/#/admin/dashboard'
$localScreenUrl = 'http://localhost:5173/#/screen?branch=br-01'

function Test-VinhDanhServer {
    $response = $null
    try {
        $request = [System.Net.HttpWebRequest]::Create('http://127.0.0.1:5173/')
        $request.Proxy = $null
        $request.Timeout = 2000
        $request.ReadWriteTimeout = 2000
        $request.KeepAlive = $false
        $response = $request.GetResponse()
        return [int]$response.StatusCode -eq 200
    }
    catch {
        return $false
    }
    finally {
        if ($response) { $response.Close() }
    }
}

function Show-LauncherError([string]$message) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        $message,
        'UNITE VINH DANH',
        [System.Windows.MessageBoxButton]::OK,
        [System.Windows.MessageBoxImage]::Error
    ) | Out-Null
}

function Stop-StaleVinhDanhServer {
    $listener = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) { return }
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)" `
        -ErrorAction SilentlyContinue
    if ($process.CommandLine -like "*$webDirectory*" -and $process.CommandLine -like '*vite*') {
        Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }
}

try {
    if (-not (Test-Path -LiteralPath $webDirectory)) {
        throw "Web app folder was not found: $webDirectory"
    }

    if (-not (Test-VinhDanhServer)) {
        New-Item -ItemType Directory -Path $runtimeDirectory -Force | Out-Null
        Stop-StaleVinhDanhServer
        $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
        $vitePath = Join-Path $webDirectory 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vitePath)) {
            throw "Vite was not found. Run npm install in: $webDirectory"
        }

        Start-Process `
            -FilePath $nodePath `
            -ArgumentList @($vitePath, '--host', '0.0.0.0', '--port', '5173', '--strictPort') `
            -WorkingDirectory $webDirectory `
            -WindowStyle Hidden | Out-Null

        for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
            if (Test-VinhDanhServer) { break }
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not (Test-VinhDanhServer)) {
        throw 'The app server did not start on port 5173.'
    }

    $lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -notlike '127.*' -and
            $_.IPAddress -notlike '169.254.*' -and
            $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Virtual|Bluetooth'
        } |
        Sort-Object @{ Expression = { if ($_.InterfaceAlias -match 'Wi-Fi|Ethernet') { 0 } else { 1 } } } |
        Select-Object -First 1 -ExpandProperty IPAddress

    if ($lanIp) {
        $desktop = Join-Path $env:USERPROFILE 'Desktop'
        if (-not (Test-Path -LiteralPath $desktop)) {
            $desktop = [Environment]::GetFolderPath('Desktop')
        }
        $phoneLinkFile = Join-Path $desktop 'LINK-DIEN-THOAI-VINH-DANH.txt'
        $phoneLinks = @(
            'UNITE VINH DANH - LINK DIEN THOAI (cung Wi-Fi voi may tinh)'
            ''
            "Admin: http://${lanIp}:5173/#/admin/dashboard"
            "TV truc tuyen: http://${lanIp}:5173/#/tv"
            ''
            'May tinh phai dang mo va app UNITE VINH DANH dang chay.'
        )
        [System.IO.File]::WriteAllLines(
            $phoneLinkFile,
            $phoneLinks,
            (New-Object System.Text.UTF8Encoding($true))
        )
    }

    $url = if ($View -eq 'screen') { $localScreenUrl } else { $localAdminUrl }
    if (-not $NoBrowser) {
        Start-Process $url
    }
}
catch {
    if ($NoBrowser) {
        Write-Error $_.Exception.Message
        exit 1
    }
    Show-LauncherError $_.Exception.Message
    exit 1
}
