# Cumin iOS

Native SwiftUI client for the Cumin API (iOS 17+). Talks to the same Go server as the web app.

**Done so far:** Google sign-in, the kanban board (drag or long-press to move items, syncs every 15s
and when the app is reopened), and a basic account screen.

## Setup

1. Install Xcode and XcodeGen (`brew install xcodegen`).
2. Create `Cumin/Config/Local.xcconfig` (gitignored) with your Apple team for signing:
   ```
   DEVELOPMENT_TEAM = <your team ID>
   CODE_SIGN_STYLE = Automatic
   ```
   A free Apple ID ("Personal Team") works; apps installed with it expire after 7 days.
3. `cd ios && xcodegen generate && open Cumin.xcodeproj`

The `.xcodeproj` and `Info.plist` are generated from `project.yml`, so edit that instead.

## Which server

| Build | API |
|---|---|
| Debug | `http://localhost:8080` (run the Go server locally) |
| Release | `https://api.cumin.ashinsabu.com` |

For local sign-in, the server's `.env` needs `AUTH_DISABLED=false` and
`GOOGLE_MOBILE_CLIENT_IDS` set to the client ID in `Cumin/Config/Shared.xcconfig`.

Google sign-in uses the iOS OAuth client in the `cumin-ios` Google Cloud project. While its consent
screen is in Testing mode, each Google account must be added there as a test user.

## Running on an iPhone

Turn on Developer Mode on the phone, select it once as the run destination in Xcode (this registers
it for signing), then build and run. From the command line:

```sh
xcodebuild -project Cumin.xcodeproj -scheme Cumin -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath build/DD -allowProvisioningUpdates build
xcrun devicectl device install app --device <device id> build/DD/Build/Products/Release-iphoneos/Cumin.app
```

If `devicectl` fails with "developer disk image could not be mounted" (an older Xcode with a newer
iOS), zip the app into an `.ipa` (`Payload/Cumin.app`) and install it over USB with
`ideviceinstaller install Cumin.ipa` (`brew install ideviceinstaller`).

## Sign-in flow

```
Google Sign-In SDK ─► Google ID token ─► POST /api/auth/google/mobile ─► { token, user }
                                                                        │
                       Keychain ◄───────────────────────────────────────┘
                          │
                          └─► every request: Authorization: Bearer <token>   (valid 30 days)
```

## Layout

```
Cumin/
  App/        CuminApp, RootView (routes on auth state), tabs, AccountView
  Auth/       AuthService (sign in/out, session restore), LoginView
  Board/      BoardStore (data, moves, sync), BoardView, ItemCard
  Core/       APIClient, KeychainStore, Models, Theme, Format, AppConfig
  Config/     xcconfigs (API URL, Google client ID; Local.xcconfig for your team)
  Resources/  Assets
```

Screens are ports of the web views in `ui/src` (same colours, priority badges, time-in-status bar).
