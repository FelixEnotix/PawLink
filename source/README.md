# Open-source components of PawLink

This folder contains the source code of the GPL-licensed parts that PawLink ships,
including PawLink's changes, as required by their licenses. The PawLink applications
themselves are not open source (see `../LICENSE`).

| Folder | What it is | License |
|---|---|---|
| `mihomo` | mihomo v1.19.30 with PawLink patches (see `PAWLINK-MIHOMO.md`). Used by the Android core and built as `mihomo.exe` for Windows | GPL-3.0 |
| `sing-tun` | sing-tun used by mihomo on Android | GPL-3.0 |
| `gvisor` | gVisor network stack used by sing-tun | Apache-2.0 |
| `android-core` | `libpawcore.so`: the JNI bridge linked with mihomo | GPL-3.0 |
| `wdtt-plus` | WDTT-Plus: Windows client (`go_client`) and server | GPL-3.0 |
| `wdtt-android-client`, `wdtt-android-server` | WDTT client for Android (`libwdtt.so`) and the server binary installed by the app | GPL-3.0 |

## Building

Go 1.26 or newer.

- Windows mihomo: `cd mihomo && go build -tags with_gvisor -trimpath -ldflags "-s -w" -o mihomo.exe .`
- Android core (Android NDK r28, example for arm64):
  `cd android-core && GOOS=android GOARCH=arm64 CGO_ENABLED=1 CC=<ndk>/aarch64-linux-android28-clang go build -tags with_gvisor,cmfa -buildmode=c-shared -o libpawcore.so .`
- WDTT Windows client: `cd wdtt-plus/go_client && go build -o wdtt-client.exe .`
- WDTT server: `cd wdtt-plus && GOOS=linux GOARCH=amd64 go build -o wdtt-server .`
- WDTT Android client: `cd wdtt-android-client && GOOS=android GOARCH=arm64 CGO_ENABLED=1 CC=<ndk clang> go build -buildmode=pie -o libwdtt.so .`
