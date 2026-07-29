$ErrorActionPreference = "Stop"

$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoDir = (Resolve-Path (Join-Path $projectDir "..\..")).Path
$webEnvFile = Join-Path $repoDir "apps\web-control\.env.local"
$gradle = Join-Path $projectDir "gradlew.bat"
$javaHome = "C:\Program Files\Android\Android Studio\jbr"
$androidHome = Join-Path $env:LOCALAPPDATA "Android\Sdk"

if (-not (Test-Path -LiteralPath $webEnvFile)) {
    throw "Thiếu $webEnvFile. Hãy cấu hình Web Admin trước khi đóng gói APK."
}

$values = @{}
Get-Content -LiteralPath $webEnvFile -Encoding UTF8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
        return
    }
    $separator = $line.IndexOf("=")
    if ($separator -le 0) {
        return
    }
    $key = $line.Substring(0, $separator).Trim()
    $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
}

$supabaseUrl = $values["VITE_SUPABASE_URL"]
$supabaseAnonKey = $values["VITE_SUPABASE_ANON_KEY"]
if (-not $supabaseUrl -or -not $supabaseAnonKey) {
    throw "Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local."
}

if (-not (Test-Path -LiteralPath $javaHome)) {
    throw "Không tìm thấy Java của Android Studio tại $javaHome."
}
if (-not (Test-Path -LiteralPath $androidHome)) {
    throw "Không tìm thấy Android SDK tại $androidHome."
}

$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:VINHDANH_SUPABASE_URL = $supabaseUrl
$env:VINHDANH_SUPABASE_ANON_KEY = $supabaseAnonKey

Push-Location $projectDir
try {
    & $gradle --no-daemon :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build thất bại với mã $LASTEXITCODE."
    }
} finally {
    Pop-Location
}

$sourceApk = Join-Path $projectDir "app\build\outputs\apk\debug\app-debug.apk"
$releaseDir = Join-Path $repoDir "releases"
$releaseApk = Join-Path $releaseDir "Unite-VinhDanh-Android-TV-Tablet-v0.2.1.apk"

New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
Copy-Item -LiteralPath $sourceApk -Destination $releaseApk -Force

$buildConfig = Join-Path $projectDir "app\build\generated\source\buildConfig\debug\vn\unite\vinhdanh\tv\BuildConfig.java"
$buildConfigText = Get-Content -LiteralPath $buildConfig -Raw -Encoding UTF8
if ($buildConfigText -match 'SUPABASE_URL = "";' -or $buildConfigText -match 'SUPABASE_ANON_KEY = "";') {
    throw "APK đã build nhưng thiếu cấu hình Supabase; không phát hành file này."
}

$hash = (Get-FileHash -LiteralPath $releaseApk -Algorithm SHA256).Hash
$sizeMb = [Math]::Round((Get-Item -LiteralPath $releaseApk).Length / 1MB, 2)
Write-Host "APK sẵn sàng: $releaseApk"
Write-Host "Dung lượng: $sizeMb MB"
Write-Host "SHA-256: $hash"
