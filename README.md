# SurfHaven

An endless rail-runner for your phone. Open it in Safari, tap **Share → Add to Home Screen**, and it launches full-screen like a real app with the SurfHaven icon.

**Play:** https://0rderless.github.io/surfhaven/

## Controls
- Swipe **left / right** to switch lanes
- Swipe **up** to jump, **down** to roll (rolling in the air slams you back down)
- Keyboard works too: arrows / WASD / space, `P` to pause

## Features
- 3 lanes with parked trains, oncoming trains (headlights, horn and a ⚠ TRAIN! warning when one is in your lane), ramps up onto train roofs, low barriers (jump) and DUCK bars (roll)
- Power-ups: **Jetpack**, **Jumping Boots**, **Coin Magnet**, **2x Score**, plus **Keys**
- Keys pay for "Save Me" after a crash (1, 2, 4… per run)
- Side-scrape a train and a security drone starts chasing you; scrape again while it's on you and you're caught
- Pause menu with an **Invincible** toggle (can't crash or get caught) and a sound toggle
- Shop where everything is free: 7 characters (Haven, School Boy, Tattoo Girl, Black Boy, Void, Blaze, Volt), power-up upgrades, free keys
- Progress (best score, coins, keys, upgrades, character) is saved on the device
- Works offline after the first load (service worker)

## Credits
- Character rig and run/idle/death animations: Mixamo (Adobe), via the open-source [Dive](https://github.com/Mugen87/dive) project by Mugen87 (MIT) — the same base as Overcharge. Every outfit, face, hairstyle, hat and accessory is built in code (`characters.js`).
- 3D engine: [three.js](https://threejs.org) (MIT).
