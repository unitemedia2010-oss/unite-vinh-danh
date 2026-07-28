# Google Apps Script watcher

This optional, bound Apps Script gives the accounting workbook near-real-time,
debounced sync. It is recommended for daily formula updates because `onEdit`
does **not** run when `QUERY`, `IMPORTRANGE` or another formula recalculates by
itself. A time trigger therefore polls display values and formulas as a fallback.

It never approves or publishes. The Edge Function creates an immutable snapshot
with `needs_review`; an Admin must approve it before a release can reach TV or
the public share page.

## One-time setup

1. Open the accounting Sheet, then **Extensions -> Apps Script**.
2. Replace `Code.gs` with this directory's `Code.gs`. In **Project Settings**,
   enable the manifest file and replace it with `appsscript.json`.
3. In **Project Settings -> Script properties**, add:

   - `SYNC_ENDPOINT` = `https://<project-ref>.supabase.co/functions/v1/sync-sheet`
   - `SYNC_SHARED_SECRET` = the same random secret stored in the Supabase Edge
     Function secret; use at least 32 random characters.
   - `SPREADSHEET_ID` = the accounting workbook ID.
   - `POLL_MINUTES` = `5` (use `1` only during month-end close if quota permits).
   - `STABLE_SECONDS` = `60`.
   - Optional `SOURCE_ID` = the UUID from `sheet_sources`.
   - Optional `WATCH_RANGES_JSON` =
     `["DS-KV!B1:N20","DS-TEAM!B1:S1000"]`.

4. In Supabase, generate and set the secret without writing it to a file or
   putting the value in PowerShell history. The last line copies it so it can be
   pasted into Apps Script Script Properties:

   ```powershell
   $secretBytes = New-Object byte[] 32
   $rng = [System.Security.Cryptography.RNGCryptoServiceProvider]::Create()
   $rng.GetBytes($secretBytes)
   $syncSecret = -join ($secretBytes | ForEach-Object { $_.ToString('x2') })
   npx supabase secrets set "SYNC_SHARED_SECRET=$syncSecret" --project-ref <project-ref>
   Set-Clipboard -Value $syncSecret
   $rng.Dispose()
   ```

5. Run `installVinhDanhSync` once and accept permissions. Reload the Sheet; the
   **UNITE Vinh Danh** menu shows status and permits a manual check.

## Behavior

- Direct edits only mark the workbook dirty and schedule a deferred check.
- A changed fingerprint must remain stable before the Edge Function is called.
- A periodic poll catches formula-only recalculation even without `onEdit`.
- Apps Script's document lock prevents overlapping trigger executions.
- The Edge Function re-reads the canonical Sheet; it does not trust values sent
  by Apps Script. Its source hash plus atomic database RPC make retries
  idempotent and serialize concurrent Admin/trigger calls.
- If Sheet parsing fails, columns disappear, formulas error, or warnings exist,
  the previous published release stays live. Automation never calls publish.

The secret must stay in Script Properties. Do not paste it into `Code.gs`, the
web app, GitHub variables, APK resources, screenshots or support messages.
