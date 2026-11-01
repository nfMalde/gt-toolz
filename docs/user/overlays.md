# OBS overlays

The **OBS overlays** module shows your driving values live on your stream: throttle and brake, steering angle, tyre temperatures, speed, gear, laps and times. OBS needs just **one browser source**. You put the overlay together in the app by drag and drop, and OBS shows every change at once.

The overlay runs on this computer only, without internet. Other devices in your network cannot reach it.

## Switch it on

The module is off by default. Open **Modules** at the top of the navigation and switch **OBS overlays** on (or do it in the first step of the setup assistant). The page **Browser sources** then appears in the navigation, under **OBS overlays**.

While the module is on, a small web server runs on `127.0.0.1` (this computer only). Switch the module off and the server stops.

## Add it to OBS

1. Open **Browser sources** in GT Toolz.
2. In the card **How to add it in OBS**, click **Copy** next to the address. The default address is `http://127.0.0.1:4790/overlay`. One address for everything.
3. In OBS: in your scene, add a source (**+**), pick **Browser**, and paste the address as the URL.
4. Set **Width** and **Height** to your OBS canvas size (OBS: Settings → Video → Base (Canvas) Resolution), for example 1920 × 1080. The OBS default of 800 × 600 does not fit.
5. Put the overlay together in the editor below. OBS shows every change at once.

**View** opens the overlay in your web browser, to have a look.

If the browser source has another shape than the canvas you chose in GT Toolz, the overlay shows an orange hint at the top left with the size to set, because OBS would stretch it.

## On this PC

| Setting | Default | What it does |
|---|---|---|
| **Hide automatically** | on | The overlay shows only in races, time trials and qualifying. After the chequered flag, in menus, loading screens and replays it stays invisible. |
| **Port** | 4790 | The port of the overlay address. Change it only if another program already uses it. 1024 to 65535. Click **Save**. Then copy the new address into OBS. |

Below it you see the state: **Running on this PC, port 4790.**, or **Port … is already in use. Pick another one.**

When GT7 sends nothing for 2 seconds, the elements dim. The labels follow the app language, in OBS too.

## Design the overlay

The editor shows the canvas as OBS shows it, on a checkerboard for transparent areas. Until GT7 sends, it shows sample values (**Sample values until GT7 sends**); then the live values (**Live values from GT7**).

### Elements

Drag an element from **Elements** onto the canvas, or click it. Up to 24 elements.

| Element | What it shows |
|---|---|
| **Speed** | km/h |
| **Gear** | the current gear |
| **Throttle & brake** | two bars |
| **Pedal trace** | throttle and brake over the last seconds |
| **Tyres** | the four tyre temperatures: blue when cold (below 55 °C), green, red when hot (above 100 °C) |
| **Lap** | the lap with its running time |
| **Lap times** | the last and the best lap |
| **Δ target** | the last lap against the reference's target time |
| **Position (race)** | your race position, only in races |
| **Steering angle** | the steering wheel's angle |

**Steering angle** has three displays. Select the element and choose under **Display**:

- **Bar**: two bars fill from the middle to the side you steer to, the angle in degrees between them.
- **Wheel**: a wheel that turns with the angle, the angle below it.
- **Wheel and bar**: the wheel above the bar.

### Moving and sizing

- **Drag** an element to move it. It snaps to a 10-pixel grid; hold **Alt** to place it freely.
- **Drag the corner** to change its size, or use the **Size** slider (50 to 300 %). With an element selected the slider changes only that one (**Size: Speed**); otherwise all of them (**Size of all elements**). **+** and **−** work too.
- **Arrow keys** move the selected element by one pixel; with **Shift**, by ten.
- **Delete** (or the **×** on the element) removes it.

Elements always stay fully on the canvas.

### Look

| Option | Default | Choices |
|---|---|---|
| **Style** | Light | **Panel** (a frame around each element), **Light** (thin, no frame) or **Values only** (no panel, the values with a shadow) |
| **Background** | 50 % | How opaque the panels are. Not used with **Values only**. |
| **Canvas (as in OBS)** | 1080p | **720p**, **1080p** or **1440p**. Pick your OBS canvas size. Switching keeps the elements in place. |

**Default** brings back the default layout: speed, gear, throttle & brake and tyres at the bottom left; lap, lap times and Δ target at the top right. **Clear** removes everything.

## Tips

- **The overlay shows only a corner, too big, or cut off?** The browser source's width and height do not match the canvas. Set them to your OBS canvas size.
- **The overlay is invisible?** With **Hide automatically** on, it shows only on track in races, time trials and qualifying. Check that GT Toolz is running and the module is on.
- **The overlay looks like an older version after an update?** In OBS, open the browser source's properties and click **Refresh cache of current page**, or restart OBS.
- The overlay shows no IP addresses, names or paths, so it is safe on stream also without streamer mode.
