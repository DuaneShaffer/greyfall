# Greyfall title-screen parallax art

The six production layers are in `layers/`, back to front:

1. `01_sky.png`
2. `02_far_skyline.png`
3. `03_near_city.png`
4. `04_pit_wall.png`
5. `05_conduit.png`
6. `06_title_plate.png`

All layers are 3968 × 2480 RGBA PNGs. This is the 2× base frame (3200 × 2000) plus 12% overscan on each side. The base-frame crop begins at `(384, 240)` and ends at `(3584, 2240)`.

The title plate shares the common overscan canvas for drop-in alignment, but its painted content remains inside the base frame. Its base-frame bounds are `(832, 420)` to `(2400, 900)`.

`layers/greyfall_title_preview_1600x1000.png` is the centered base-frame preview. `layers/greyfall_title_composite_overscan.png` is a full-resolution alignment proof and is not a substitute for the six production layers.

`generation-prompts.md` records the final normalized prompt set used for the six assets.

Alpha on layers 2–6 is hard binary alpha with transparent pixels cleared to black, preventing light matte fringes. Layer 1 is deliberately opaque. Runtime ash and live title/tagline type are not baked into the art.
