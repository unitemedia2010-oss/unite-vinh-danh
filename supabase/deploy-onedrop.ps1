param(
  [string]$ProjectRef = 'hmlnrrgzrrrambxsauec'
)

$ErrorActionPreference = 'Stop'

if ($ProjectRef -ne 'hmlnrrgzrrrambxsauec') {
  throw 'ProjectRef does not match the verified OneDrop project.'
}

$functionNames = @(
  'sync-sheet',
  'screen-api',
  'publish-release'
)

foreach ($functionName in $functionNames) {
  Write-Host "Deploying $functionName to OneDrop..."
  & npx.cmd --yes supabase@latest functions deploy $functionName --project-ref $ProjectRef
  if ($LASTEXITCODE -ne 0) {
    throw "Deploy $functionName failed. Sign in Supabase CLI with the OneDrop owner account, then retry."
  }
}

Write-Host 'All 3 Edge Functions were deployed to OneDrop.'
