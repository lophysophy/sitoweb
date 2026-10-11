# lophysophy.com

Portfolio of Sofia Lucarelli (Lophy Sophy): visual development, character design and 2D animation.

Built with [Astro](https://astro.build) as a static site and published to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`.

## Work on it

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
```

## Add or change artwork

Everything comes from the folders in `src/work/`, no code to touch:

```
src/work/<CATEGORY>/<N>. <PROJECT>/<index> <label>.<ext>
src/work/<CATEGORY>/<N>. <PROJECT>/<subfolder>/...      a grid with its own title (e.g. storyboard)
src/work/<CATEGORY>/<N>. <PROJECT>/project.md           optional details
src/work/<CATEGORY>/preview/<N>. <PROJECT>/...          optional custom crops for the previews
```

- The number in front of a project folder sets its order in the category.
- The number in front of a file sets its order in the project. `2.1` is a variant of `2`
  (e.g. the COMP) and is shown beside it.
- Run `npm run media` after adding PNG/JPG/GIF files: it converts them to AVIF/MP4 (needs ffmpeg).

`project.md` (all fields optional):

```yaml
---
title: A un passo dal cielo     # otherwise taken from the folder name
description: One line for Google and social previews.
year: 2025
role: Visual development, colour keys
team: Solo project
tools: Photoshop, Procreate
youtube: 2AmUoiHabYk            # the full film, embedded at the end
preview: ["2.1", "2", "4"]      # order of the hover previews, by file index
---
Text written here appears under the project title.
```

Categories, nav labels and page texts live in `src/lib/site.ts`.
