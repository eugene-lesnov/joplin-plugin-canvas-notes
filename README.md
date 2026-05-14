# Canvas Notes

A Joplin plugin that turns a note into an interactive canvas: note and task cards, links between them, free-form layout, and auto-saving to SVG.

## Features

- Create a Canvas Note with a single command (`Tools → Canvas Notes → Create Canvas Note`).
- Visual editor with note/task cards and connections between them.
- Drag & drop, context menu, toolbar.
- Cards linked to existing Joplin notes.
- Localization support.
- Canvas state stored as an embedded SVG resource of the note.

## Requirements

Joplin **3.5** or newer.

## Installation

**From Joplin:** Tools → Options → Plugins → search for *Calendar Notes*.

**Manual:** Tools → Options → Plugins → *Install from file* → select the `.jpl` file.

## Usage

1. `Tools → Canvas Notes → Create Canvas Note` — creates a new canvas note.
2. For an existing note already recognized as a canvas: `Tools → Canvas Notes → Open Canvas Editor`.
3. The editor opens automatically for notes whose body is detected as a canvas.

> Do not edit the body of a Canvas Note manually in the markdown editor — this will break the embedded SVG resource that stores the canvas state.

## License

MIT
