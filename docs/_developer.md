# Developer help

## Testing on Mobile Devices

When developing Element Call locally, you may want to test on physical mobile devices (iOS/Android)
on the same WiFi network.

**Known Limitations:** For now this setup allows to use your local EC server but not yet the SFUs and Synapses.

### Prerequisites

1. **Start the dev server**

   ```bash
   pnpm dev
   ```

Check the output for the `➜  Network` (this will contain the local IP address of your laptop)

```
  ➜  Local:   https://m.localhost:3000/                                                                                                                                                                 12:06:48
  ➜  Local:   https://vite.m.localhost:3000/                                                                                                                                                            12:06:48
  ➜  Local:   https://vite.othersite.m.localhost:3000/                                                                                                                                                  12:06:48
  ➜  Local:   https://vite.nip.io:3000/                                                                                                                                                                 12:06:48
  ➜  Network: https://192.168.0.122:3000/
```

2. **Transfer the CA certificate to your phone**

   The file is located at `backend/dev_tls_local-ca.crt`. Transfer it via:
   - Matrix room
   - AirDrop for iphone

### IOS Setup

**Install the certificate profile on iPhone**

- Open the `dev_tls_local-ca.crt` file on your iPhone
- You'll see "Profile Downloaded"
- Go to **Settings → General → VPN & Device Management** (or **Settings → General → Profiles**)
- Tap the "Element Call Dev CA" profile
- Tap **Install** and enter your passcode
- Confirm by tapping **Install** again

**Enable full trust (Critical!)**

- Go to **Settings → General → About → Certificate Trust Settings**
- Under "Enable Full Trust for Root Certificates"
- Toggle **ON** for "Element Call Dev CA"
- Confirm the security warning

**Access Element Call**

Find your laptop's IP address (e.g., `192.168.0.122`) and use one of these URLs in Safari to validate:

```
https://192-168-0-122.nip.io:3000/
```

**For Element X iOS Developer Tools**

In Element X's developer settings, set the Element Call URL to the nip.io url (replace . with - in the IP address):

```
https://192-168-0-122.nip.io:3000/room
```

### Android Setup

**Transfer the CA certificate to your Android device**

The file is located at `backend/dev_tls_local-ca.crt`.

**Install the certificate**

This might vary by Android version and manufacturer, but generally:

- Open **Settings** search for "CA Certificate"/"Certificate"
- Tap **Install a certificate** or **Install from storage**
- Select **CA certificate**
- Confirm the security warning
- Navigate to and select the `dev_tls_local-ca.crt` file
- Give it a name like "Element Call Dev CA"

**Access Element Call**

Find your laptop's IP address (e.g., `192.168.0.122`) and use one of these URLs in Chrome to validate:

```
https://192-168-0-122.nip.io:3000/
```

**For Element X Android Developer Tools**

In Element X's developer settings, set the Element Call URL to the nip.io url (replace . with - in the IP address):

```
https://192-168-0-122.nip.io:3000/room
```

### Why nip.io?

[nip.io](https://nip.io) is a free wildcard DNS service that automatically resolves domain names containing IP addresses. For example, `192-168-0-122.nip.io` automatically resolves to `192.168.0.122`. This means:

- No need to regenerate certificates when your laptop's IP changes
- Works from any device without DNS configuration
- iOS/Android treat it as a proper domain name, not an IP address
- One-time certificate setup works for all future IP addresses

> [!IMPORTANT]
> Make sure your network router doesn't enforce DNS rebinding protection (which will
> break nip.io). If it does, try allow-listing nip.io in your router's administration interface.
