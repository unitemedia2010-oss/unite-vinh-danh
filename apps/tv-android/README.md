# Vinh Danh TV — Android TV MVP

Native Kotlin player for the nine-branch recognition network. This directory is isolated from
the legacy web and backend code.

## Implemented

- Landscape immersive 16:9 UI, DPAD focus, `LEANBACK_LAUNCHER` for Google TV and regular
  `LAUNCHER` for Android boxes that do not declare Leanback.
- Server-issued six-digit pairing code. The TV registers itself, encrypts the temporary device
  token with Android Keystore, polls approval every five seconds, then stores its approved screen
  and branch configuration.
- Pilot demo/default address: `125 Trần Bình Trọng`. `683 Âu Cơ Tân Phú` remains the known CN09
  address; a paired TV always uses the branch address returned by `screen-api` status.
- Release/playlist models and atomic last-known-release JSON cache.
- Recognition screen with Top 1–3 podium and ranks 4–10. `avatarUrl`/`avatar_url` is rendered as
  the real employee photo with bounded memory and disk caches; initials remain visible when an
  image URL is absent, invalid, or offline.
- Vietnamese revenue formatting, including `156.000.000 VNĐ`.
- Media3 ExoPlayer 1.10.1 video playback with audio focus and volume enabled.
- Pre-activation download for video, image, background, logo, thumbnail, and recognition avatars.
  SHA-256 is checked when supplied, and the last-known release keeps playing while a future release
  is downloaded or when the network is offline.
- Per-slide backgrounds and custom logos are rendered from the offline cache with a short fade-in;
  the three paired recognition backgrounds and six rank badges are bundled for offline demo use,
  while slides without a rank/custom logo keep the Unite Group wordmark visible.
- One Supabase Edge Function client: `screen-api` actions `register`, `status`, `manifest`, and
  `heartbeat`.
- Heartbeat every 30 seconds; manifest polling every 60 seconds.
- Supabase Realtime Broadcast websocket on `screen-updates`, with Phoenix heartbeat and bounded
  reconnect backoff. A broadcast triggers an immediate scoped manifest fetch; REST polling remains
  the authoritative fallback.
- Demo playlist cycling recognition, an audio-enabled video, and an internal announcement.

## Local configuration

Copy `local.properties.example` to the untracked `local.properties` file:

```properties
sdk.dir=C\:\\Users\\YOUR_USER\\AppData\\Local\\Android\\Sdk
VINHDANH_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VINHDANH_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
VINHDANH_DEMO_VIDEO_URL=https://your-cdn.example/video.mp4
```

The same names may be Gradle properties or environment variables. Never place a Supabase
`service_role` key or database password in an Android client. The anon key is public by design;
the opaque device token authorizes a single registration and is encrypted locally with Android
Keystore.

## `screen-api` contract

All requests are `POST <SUPABASE_URL>/functions/v1/screen-api`, include `apikey: <anon key>`, and
have a JSON body. Registration may use `Authorization: Bearer <anon key>`. Every later action
must use `Authorization: Bearer <deviceToken>`.

### 1. Register

```json
{
  "action": "register",
  "deviceId": "local-uuid",
  "deviceName": "Google ADT-3",
  "deviceType": "android_tv",
  "appVersion": "0.1.0-mvp"
}
```

```json
{
  "registrationId": "registration-uuid",
  "pairingCode": "123456",
  "deviceToken": "short-opaque-device-token",
  "status": "pending",
  "expiresAt": "2026-07-15T12:30:00.000Z"
}
```

The pairing code comes from the server, never from a local random generator.

### 2. Poll pairing status

Request: `{ "action": "status" }` with the device token.

Pending response: `{ "status": "pending", "screen": null }`.

Approved response:

```json
{
  "status": "approved",
  "screen": {
    "id": "screen-uuid",
    "screen_code": "CN01-TV01",
    "name": "TV sảnh CN01",
    "branch_id": "branch-uuid",
    "branch": {
      "id": "branch-uuid",
      "code": "CN01",
      "name": "Chi nhánh pilot",
      "address": "125 Trần Bình Trọng"
    }
  }
}
```

### 3. Fetch manifest

Request: `{ "action": "manifest" }` with the device token.

```json
{
  "release": {
    "id": "release-uuid",
    "release_version": "2026.07.3",
    "period_id": "period-uuid",
    "status": "published",
    "activate_at": "2026-07-15T13:00:00.000Z",
    "updated_at": "2026-07-15T12:55:00.000Z",
    "manifest": {
      "items": [
        {
          "key": "leader-board",
          "type": "recognition",
          "title": "Bảng Vinh Danh Leader",
          "durationSeconds": 20,
          "recognitionBoard": {
            "periodLabel": "Kỳ doanh số tháng 07/2026",
            "categoryLabel": "PHƯỢNG HOÀNG · 100–199 TRIỆU",
            "entries": [
              {
                "rank": 1,
                "employeeId": "NV001",
                "name": "Nguyễn Minh Anh",
                "role": "Leader · Phượng Hoàng",
                "revenue": 156000000,
                "avatarUrl": "https://cdn.example/NV001.jpg"
              }
            ]
          }
        },
        {
          "key": "internal-video",
          "type": "video",
          "title": "Video truyền thông nội bộ",
          "durationSeconds": 45,
          "mediaPath": "internal/company-update.mp4",
          "mediaUrl": "https://signed-url-returned-by-screen-api",
          "mediaSha256": "optional-lowercase-sha256"
        },
        {
          "key": "notice",
          "type": "announcement",
          "title": "THÔNG BÁO QUAN TRỌNG",
          "durationSeconds": 12,
          "announcementBody": "Nội dung thông báo"
        }
      ]
    }
  },
  "currentReleaseId": "previous-release-uuid",
  "screenId": "screen-uuid",
  "serverTime": "2026-07-15T12:55:10.000Z"
}
```

The decoder also accepts the MVP snake_case equivalents (`playlist`, `duration_seconds`,
`recognition_board`, `avatar_url`, and `media_url`) for cached/legacy manifests.

### 4. Heartbeat

Sent every 30 seconds with the device token:

```json
{
  "action": "heartbeat",
  "currentReleaseId": "release-uuid",
  "readyReleaseId": null,
  "currentItemKey": "leader-board",
  "lastError": null,
  "appVersion": "0.1.0-mvp",
  "cacheState": { "state": "video-cache-hit" },
  "deviceInfo": {
    "deviceId": "local-uuid",
    "screenId": "screen-uuid",
    "branchId": "branch-uuid",
    "playbackState": "playing-recognition"
  }
}
```

## Offline, audio, and realtime behavior

- On startup, the app immediately opens the atomic last-known active manifest. A future release is
  kept separately as `ready_release.json`, so restarting before `activate_at` never leaves the TV
  blank or activates content early. If no active release exists, the pilot demo remains available.
- Future release media is downloaded before `activate_at`; required media must be ready before the
  TV reports `readyReleaseId` or activates the release. Videos are then played from local files.
  The general media cache is bounded to 500 MB per file and 1 GB total. Avatar cache is 8 MB per
  image and 100 MB total, with stale-cache fallback for offline playback.
- ExoPlayer requests media audio focus, sets movie/media audio attributes, and plays at volume 1.
  The TV/box and HDMI output must still be unmuted.
- `SupabaseReleaseBroadcast` joins `realtime:screen-updates`, matching the topic used by
  `publish-release`. Every TV receives only the release signal and then calls authenticated
  `screen-api`; the function returns the manifest assigned to that paired screen.
- Manifest polling runs every 60 seconds and is protected against overlapping requests. Realtime
  reconnects with bounded exponential backoff, while polling continues even when the websocket is
  unavailable.
- Heartbeat reports both the active release and a cached/scheduled ready manifest. HTTP 401/410
  clears the revoked/expired pairing and returns the TV to the secure pairing screen.

## Build and install

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"
.\gradlew.bat :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
& "$env:ANDROID_HOME\platform-tools\adb.exe" install -r app\build\outputs\apk\debug\app-debug.apk
```

APK output: `app/build/outputs/apk/debug/app-debug.apk`.

Bản pilot đã đóng gói với URL + publishable key của OneDrop (không chứa
service-role key) nằm tại:

`releases/Unite-VinhDanh-TV-pilot-v0.2.0.apk`

Đây là debug APK cho pilot nội bộ. Trước khi phát hành rộng, tạo release APK/AAB
được ký bằng keystore production riêng và lưu keystore ngoài repository.
