# Eldvakt

A night planet where people keep a fire going together, without words.

Two browsers share the same fires. There is no account. The first visit stores an anonymous id on the device. The world stays dark: land and water are two shades of night, and the fires are ember, amber, and gold.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:8647 . The dev server and the realtime room are the same process.

On a phone, tilt to look. The first time, allow motion if the browser asks. On a desktop, drag to look and scroll to move closer. Tap a glow to travel — the camera moves slowly, it does not cut. The flame button lights a fire where you are. If location is denied, it still lights, from a fallback point.

Sitting down carries you the rest of the way, until the fire is a few meters in front of you and the planet is only the ground and the horizon. Drag still looks around once you are there. The stars are the real naked-eye sky for that place, at the time on your clock. People at the fire show up as soft floating lights — tiny warm stars that hover off to the side and idle with a gentle drift. At a fire you can sit, lay a log, or press and hold the flame to throw sparks. A longer hold throws more. You can put a fire out by hand only while you sit there alone; hold the small flame until the ring closes.

On this experiment branch, open http://127.0.0.1:8647/?demo=companions to settle beside a fire without clicking through the globe. Click the scene once so the page has keyboard focus, then enter ↑↑↓↓←→←→BA Enter (arrows, then the B and A keys, then Enter). A guest grows in, stays ten seconds, and leaves as a shooting star. A soft hint appears if you are not at a fire yet.

```bash
npm test
npm run build
npm start
```

`npm start` serves the built app on the same port.
