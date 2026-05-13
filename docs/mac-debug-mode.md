# Enabling unsigned CEP extensions on macOS

On macOS, After Effects reads the debug flag from a plist file rather than the Windows registry.

Open Terminal and run the following commands. Replace `X` with the CEP version your AE uses (use `11` for AE 2024, `12` for AE 2025/2026 — running all four is safe):

```bash
defaults write com.adobe.CSXS.9  PlayerDebugMode 1
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

Then restart After Effects. You only need to do this once per machine.

To verify:
```bash
defaults read com.adobe.CSXS.12 PlayerDebugMode
# should print: 1
```
