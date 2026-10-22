# Parallel mobile app

Parallel is an Expo Router and Supabase mobile hangout app for friends, families, classmates, groups, and gamers. It includes text chat, groups, activities, and self-hosted LiveKit voice rooms.

## App setup

Create `.env` in this directory:

```text
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Install dependencies and run the app checks:

```powershell
npm install
npm run typecheck
npm run lint
npx expo-doctor
```

## Supabase

Migrations are stored in `supabase/migrations` and must be applied in filename order. The LiveKit Edge Functions authenticate the user, verify group membership and bans, issue short-lived audio-only tokens, and synchronize trusted participant lifecycle events.

```powershell
npx supabase@2.121.0 db push
npx supabase@2.121.0 functions deploy livekit-token
npx supabase@2.121.0 functions deploy livekit-webhook
```

Email verification setup is documented in `supabase/AUTH_SETUP.md`.

## Local self-hosted voice

LiveKit runs locally and does not require LiveKit Cloud or a paid per-minute calling API. Start Docker Desktop, find the computer's Wi-Fi/Ethernet IPv4 address with `ipconfig`, then run:

```powershell
.\scripts\configure-livekit.ps1 -LanIp YOUR_LAN_IP -ConfigureSupabase -StartServer
```

The script generates a random API key and secret, writes them only to ignored server-side `.env` files, uploads the same values as encrypted Supabase Function secrets, and starts the Compose service. More connectivity details are in `infrastructure/livekit/README.md`.

On Windows, allow inbound TCP 7880/7881 and UDP 7882 on the private network. A physical device must be on the same LAN and must use the host LAN address—not `localhost`. The Android emulator can also reach the host LAN address; `10.0.2.2` is emulator-only and should not be used when physical devices share the same token configuration.

## Development build

LiveKit contains native WebRTC code and does not work in Expo Go. Install JDK 17 and Android Studio/SDK, start an emulator or connect a USB-debugging Android device, then build the development client:

```powershell
npm run android
```

For later JavaScript-only runs, start Metro for the installed development client:

```powershell
npx expo start --dev-client --clear
```

The browser build remains available for UI testing:

```powershell
npm run web
```

Self-hosting removes vendor calling fees, but public deployment still requires a server, bandwidth, TLS/WSS, TURN, monitoring, and appropriate firewall configuration.

Do not commit `.env`, LiveKit API secrets, Supabase secret/service-role keys, signing keys, generated native folders, or build output.
