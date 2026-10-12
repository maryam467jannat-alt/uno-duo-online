# UNO Duo Online (2 players)

A beginner-friendly UNO-inspired online card game. It uses a Node.js + Express server and Socket.IO for real-time multiplayer. This is a fan-made prototype, not affiliated with Mattel.

## Run in Termux

1. Install Termux from a trusted source and open it.
2. Run:

```sh
pkg update && pkg upgrade
pkg install nodejs git
mkdir -p uno-duo/public
cd uno-duo
```

3. Put `server.js`, `package.json` in `uno-duo/` and `index.html` in `uno-duo/public/`.
   If you downloaded the ZIP, extract it and `cd` into the extracted `uno_duo_online` folder instead.
4. Install packages and start:

```sh
npm install
npm start
```

5. Open `http://127.0.0.1:3000` in your phone browser.

## Test with two phones on the same Wi-Fi

Find the host phone's local IP address (for example, using `ip addr` in Termux). On the second phone, open `http://HOST-LAN-IP:3000`. Both devices need the same Wi-Fi and local network access.

## Deploy online

1. Upload the project to a GitHub repository (the root must contain `package.json`, `server.js`, and `public/index.html`).
2. In Render, create **New → Web Service** and connect the repository.
3. Set:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. After deployment, open the `https://YOUR-SERVICE.onrender.com` URL on both phones. Render supports WebSockets, which Socket.IO uses. Free services may sleep when inactive and can take time to wake up.

## Android APK

The simplest reliable workflow is to get the online game working first, then package it with Capacitor on a computer with Android Studio/Android SDK, or use a configured CI build. Capacitor Android builds require Android SDK tooling; Termux alone is not a straightforward supported APK build environment. The hosted website can be installed as a home-screen web app in the meantime.

## Prototype limitations

- This is a starter prototype, not a complete official UNO rules implementation.
- In this two-player version, Skip and Reverse give the current player another turn.
- A player who draws a card automatically ends their turn.
- Refreshing/disconnecting can interrupt a match; production versions should add reconnect handling, persistent rooms, rate limits, and stronger server validation.
