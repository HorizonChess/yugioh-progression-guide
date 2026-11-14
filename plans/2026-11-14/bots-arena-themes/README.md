# Bots Arena: looks

Style references for the Bots Arena (`web/src/components/duel/BotsArena.tsx`, `bots-arena.css`), kept in case the look is ever a choice.

## In the app

`option-*.png` are the arena as built (desktop, phone, phone scrolled to the roster) with each set of generated textures. The textures are in `web/public/ui/bots-arena/` (`<theme>-tile.webp`, `<theme>-stage.webp`, `<theme>-wall.webp`), and each theme's colours are a `[data-theme]` block in `bots-arena.css`. Which one is used is `THEME` in `BotsArena.tsx`.

- **Sandstone** (in use): sandstone tablets with a gold-grooved border, and the chosen opponent on black obsidian, over the app's own hieroglyph wall.
- **Basalt and gold**: black basalt tablets with gold lotus borders, and the chosen opponent on pale marble in a gold scarab frame, over a dark tomb corridor.
- **Painted fresco**: cracked plaster tablets banded in ochre, turquoise and lapis, and the chosen opponent on lapis lazuli, over a painted tomb wall.

The textures were made locally with FLUX.2 Klein 9B (ComfyUI), text to image, and cut from their backgrounds.

## Earlier directions

`stone.png`, `card.png`, `steel.png` and `lacquer.png` are Klein restyles of a screenshot of the first, plain arena: temple stone (chosen), trading cards on felt, a steel duel stadium, and black lacquer with gold.

## Still open

The camera move into the arena: from the wall every page shows, round a corner, to a torch-lit wall seen at an angle, with the torch burning. Tried so far: CSS 3D panning, and Wan 2.2 first-and-last-frame videos (they morph the carvings between the two walls). Next to try: a three.js scene.
