# Local LiveKit development

This configuration runs the open-source LiveKit SFU locally. It does not use LiveKit Cloud or a paid per-minute calling provider.

## Configure

1. Start Docker Desktop.
2. Run `ipconfig` and identify the Windows host's LAN IPv4 address.
3. From the app root, run the setup command below. It generates a random key and secret, writes them only to ignored server-side `.env` files, uploads the matching encrypted Supabase function secrets, and starts LiveKit.

```powershell
.\scripts\configure-livekit.ps1 -LanIp YOUR_LAN_IP -ConfigureSupabase -StartServer
```

To rotate credentials, run the same command again and restart the LiveKit container.

The API secret belongs only in ignored local environment files, Docker runtime configuration, and Supabase secrets. It must never use an `EXPO_PUBLIC_` name.

## Start and inspect

```powershell
cd infrastructure/livekit
docker compose up -d
docker compose logs -f livekit
```

Verify signaling from the development computer:

```powershell
Test-NetConnection YOUR_LAN_IP -Port 7880
Test-NetConnection YOUR_LAN_IP -Port 7881
```

Allow inbound TCP 7880/7881 and UDP 7882 in Windows Firewall for the private network. The Android phone and development computer must be on the same LAN and client isolation must be disabled.

For the Android emulator, the signaling URL can be `ws://10.0.2.2:7880`, but `LIVEKIT_NODE_IP` must still be an address advertised by the server that the emulator can reach. A physical device must use the host LAN address, never `localhost` or `10.0.2.2`.

This single-node configuration is for local development. Public deployment requires TLS (`wss://`), TURN, firewall configuration, monitoring, backups, and sufficient server bandwidth. Self-hosting removes vendor per-minute fees but does not remove hosting and bandwidth costs.
