# SubtitleAI — After Effects CEP Panel

An Adobe After Effects panel that transcribes an audio or video file using [ElevenLabs Scribe](https://elevenlabs.io/speech-to-text) and writes the result as a single, fully keyframed subtitle text layer directly inside your composition.

![SubtitleAI panel screenshot](docs/screenshot.png)

---

## Features

- **AI transcription** — sends your audio/video to ElevenLabs Scribe (word-level timestamps)
- **Smart segmentation** — groups words into subtitle lines respecting max chars, max words, max lines, silence gaps, and maximum duration
- **Single text layer** — one `Subtitles [SubtitleAI]` layer with HOLD keyframes; re-running replaces it cleanly
- **Live style sync** — changing font, size, colour, shadow, or position instantly updates every existing keyframe without regenerating
- **Full font picker** — searchable dropdown populated directly from After Effects' own font list
- **Templates** — save and load complete style + timing presets (stored in `localStorage`)
- **Settings modal** — API key is stored once and lives behind a gear icon, out of the way

---

## Requirements

| Requirement | Version |
|---|---|
| Adobe After Effects | 2019 (v16) or later — tested on **AE 2026 (v26.2)** |
| CEP runtime | 9.0 + |
| ElevenLabs account | Free tier works; [get a key](https://elevenlabs.io/app/settings/api-keys) |

---

## Installation

### 1 — Enable unsigned extensions (one-time)

Double-click **`SubtitleAI_EnableDebug.reg`** (included in the repo root) and accept the UAC prompt. This sets `PlayerDebugMode=1` in the Windows registry for all CEP versions so After Effects will load unsigned panels.

> **Mac:** run the equivalent Terminal commands — see [docs/mac-debug-mode.md](docs/mac-debug-mode.md).

### 2 — Copy the extension folder

Place the `SubtitleAI` folder in After Effects' CEP extensions directory:

| OS | Path |
|---|---|
| Windows (per-user) | `%APPDATA%\Adobe\CEP\extensions\` |
| Windows (all users) | `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\` |
| macOS (per-user) | `~/Library/Application Support/Adobe/CEP/extensions/` |
| macOS (all users) | `/Library/Application Support/Adobe/CEP/extensions/` |

### 3 — Restart After Effects

Open (or restart) After Effects, then go to **Window → Extensions (Legacy) → SubtitleAI**.

---

## First use

1. Click the **⚙ gear icon** in the panel header and paste your ElevenLabs API key. It saves automatically.
2. Drop an audio or video file onto the panel (or click **browse**).
3. Adjust style, position, and timing settings (or load a saved template).
4. Click **Generate Subtitles**.

The panel uploads your file to ElevenLabs, segments the transcript, and writes a single `Subtitles [SubtitleAI]` text layer at the top of the active composition.

---

## Settings reference

### Text Style

| Field | Description |
|---|---|
| Font | Searchable picker — lists every font available in AE |
| Size | Font size in pixels |
| Tracking | Character spacing (AE units) |
| Fill / Opacity | Text colour and opacity |
| Stroke | Optional outline — colour and width |
| Shadow | Drop shadow — colour, distance, softness, opacity |
| Align | Left / Centre / Right paragraph alignment |

### Position

| Field | Description |
|---|---|
| Vertical | Top / Mid / Bottom of the composition |
| Margin | Distance in pixels from the chosen edge |
| H offset | Horizontal offset from comp centre |

### Timing & Segmentation

| Field | Default | Description |
|---|---|---|
| Lines / sub | 2 | Max lines per subtitle card |
| Max chars/line | 42 | Line breaks at this many characters |
| Max words/line | 7 | Line breaks at this many words |
| Gap break | 0.5 s | Silence longer than this starts a new card |
| Max dur | 5.0 s | A card never lasts longer than this |
| End pad | 0.1 s | Extra time the card stays on screen after the last word |

---

## Project structure

```
SubtitleAI/
├── CSXS/
│   └── manifest.xml          # CEP extension manifest
├── css/
│   └── style.css             # Dark-theme panel styles
├── docs/
│   ├── mac-debug-mode.md     # macOS PlayerDebugMode instructions
│   └── screenshot.png        # Panel screenshot
├── js/
│   ├── CSInterface.js        # Minimal Adobe CEP bridge
│   └── main.js               # Panel logic: API calls, segmentation, font picker, style sync
├── jsx/
│   └── hostscript.jsx        # ExtendScript: layer creation, style update, font enumeration
├── .debug                    # CEP remote-debug config (port 8888)
├── index.html                # Panel HTML
├── SubtitleAI_EnableDebug.reg  # Windows registry helper (enables unsigned extensions)
└── README.md
```

---

## Architecture

```
Panel (HTML/CSS/JS)
│
├── ElevenLabs Scribe API  ←  audio file
│   └── word[] with start/end timestamps
│
├── segmentWords()         ←  timing + line settings
│   └── subtitle[] {text, start, end}
│
└── CSInterface.evalScript()
    └── hostscript.jsx (ExtendScript)
        ├── createSubtitleLayer()   — builds HOLD keyframes on Source Text
        ├── updateSubtitleStyle()   — live-updates all keyframes when style changes
        └── getAvailableFonts()     — queries app.fonts for the picker
```

### Key design decisions

- **Single text layer + HOLD keyframes** — one layer is easier to manage than hundreds of individual text layers; expressions or other scripts can target it predictably.
- **`resetCharStyle()` before every write** — AE inherits `allCaps`/`smallCaps` and other character-panel state onto new TextDocument objects. Resetting first guarantees consistent output regardless of what the user had open in the Character panel.
- **JSX loaded at runtime** — `ScriptPath` in the manifest caused silent panel-open failures on AE 2026; we read and eval the `.jsx` file ourselves via `window.cep.fs` after the panel loads.
- **`new TextDocument()` is not used** — AE rejects style-property writes on detached TextDocuments; all styling is applied to layer-bound documents obtained from `sourceText.value` or `valueAtKey()`.

---

## Development

### Debugging the panel

With `.debug` present and `PlayerDebugMode=1` set, open Chrome and navigate to:

```
http://localhost:8888
```

while After Effects is running. This opens Chrome DevTools for the panel's CEF browser.

### Debugging ExtendScript

Use **Edit → Run Script File** in After Effects to run `hostscript.jsx` manually, or use the ExtendScript Toolkit / VS Code with the `after-effects` extension.

### Modifying segmentation

The word-grouping algorithm lives in `segmentWords()` in [js/main.js](js/main.js). It processes the `words[]` array returned by ElevenLabs (filtered to `type === "word"`) and emits `{text, start, end}` objects.

### Switching transcription providers

Swap out the `transcribe()` function in `main.js`. The function must return a `Promise<Word[]>` where each word has `{ text: string, type: "word"|"spacing"|..., start: number, end: number }`. The rest of the pipeline is provider-agnostic.

---

## Roadmap / ideas

- [ ] macOS support + test pass
- [ ] Language selector for Scribe
- [ ] Speaker diarisation (different styles per speaker)
- [ ] Export subtitles as SRT / VTT
- [ ] Multiple text layers (one per subtitle card) as an option
- [ ] Per-word highlight animation presets
- [ ] UXP migration when Adobe adds UXP support to After Effects

---

## Contributing

PRs and issues are welcome. Please open an issue first for large changes so we can discuss the approach.

1. Fork the repo
2. Make your changes in a feature branch
3. Test in After Effects (see [Development](#development))
4. Open a PR with a clear description of what changed and why

---

## License

MIT — see [LICENSE](LICENSE).
