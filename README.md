# BrowserFL

A beginner-friendly music studio that runs in your web browser, inspired by the FL Studio workflow.
You don't need to install anything, and every sound is generated live, so there are no sample files to download.

## How to open it

Double-click `index.html`. It works straight from the file in Chrome, Edge or Firefox.
(You can also host the folder on GitHub Pages or any static web host.)

The first time it opens, a short guided tour walks you through everything. Press **?** to see it again.

## The four windows

| Window | Shortcut | What it's for |
| --- | --- | --- |
| **Channel Rack** | F6 | Your instruments. Click squares to make a beat. **Right-click** a lit square for hi-hat rolls (2×, 3×, 4×). |
| **Piano Roll** | F7 | Draw melodies, chords and 808 lines. Pick a **scale** and the notes that fit light up. "Click places → Scale chord" drops a full chord with one click. |
| **Playlist** | F5 | Arrange your patterns into a full song. Click the bar numbers to play from that point. |
| **Mixer** | F9 | Volume, panning, filter, reverb and delay for every channel, plus master controls. |

## Beginner tips

- Hover over anything: the **hint bar** at the bottom explains what it does.
- Load a **Template** (Trap, House, Lo-fi) and take it apart to learn how beats are built.
- **PAT** mode loops the pattern you're editing. **SONG** mode plays the Playlist.
- 4 squares = 1 beat, 16 squares = 1 bar.
- Made a mistake? **Ctrl+Z** undoes it.
- Double-click any slider to reset it.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space | Play / stop |
| F5 / F6 / F7 / F9 | Playlist / Channel Rack / Piano Roll / Mixer |
| Ctrl+Z, Ctrl+Shift+Z | Undo, redo |
| A W S E D F T G Y H U J K | Play the selected instrument like a piano |
| Z / X | Computer keyboard octave down / up |

## Saving and exporting

- Your work **auto-saves** in the browser after every change.
- **Save / Open** stores named projects in the browser, or downloads/opens a `.json` project file.
- **Export WAV** renders the whole song, or the current pattern looped, to a 44.1 kHz stereo WAV file.

## Built-in sounds

Drums: Kick, Snare, Clap, Hi-Hat, Open Hat, Rim, Tom, Crash.
Melodic: 808, Synth Bass, Keys, Pluck, Lead, Pad, Bell.

## Code layout

Plain HTML, CSS and JavaScript with no build step.

- `js/instruments.js`: the synthesized instruments (Web Audio API)
- `js/project.js`: project data, templates, undo and saving
- `js/audio.js`: mixer, playback scheduler and WAV export
- `js/ui-*.js`: Channel Rack, Piano Roll, Playlist and Mixer screens
- `js/app.js`: toolbar, tooltips, guided tour and keyboard shortcuts
