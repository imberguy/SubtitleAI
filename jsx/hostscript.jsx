// SubtitleAI — After Effects ExtendScript host

// ---- Shared helpers -----------------------------------------------

function applyJustification(td, align) {
    if (align === "left")       td.justification = ParagraphJustification.LEFT_JUSTIFY;
    else if (align === "right") td.justification = ParagraphJustification.RIGHT_JUSTIFY;
    else                        td.justification = ParagraphJustification.CENTER_JUSTIFY;
}

// styleDoc: applies all style settings to a layer-bound TextDocument.
// Must be called on a doc obtained from sourceText.value or valueAtKey(),
// NOT on a free-standing new TextDocument() — AE rejects property writes on those.
// resetCharStyle() is called first to wipe any character-panel overrides
// (allCaps, smallCaps, etc.) before we apply our own settings.
function styleDoc(td, s) {
    td.resetCharStyle();       // clears allCaps/smallCaps and all panel overrides
    td.font         = s.fontFamily;
    td.fontSize     = s.fontSize;
    td.fillColor    = s.fillColorAE;
    td.applyFill    = true;
    td.tracking     = s.tracking || 0;
    applyJustification(td, s.align);
    if (s.strokeEnabled) {
        td.applyStroke    = true;
        td.strokeColor    = s.strokeColorAE;
        td.strokeWidth    = s.strokeWidth;
        td.strokeOverFill = true;
    } else {
        td.applyStroke = false;
    }
    return td;
}

function applyShadow(textLayer, settings) {
    var fx = textLayer.property("Effects");
    for (var fi = fx.numProperties; fi >= 1; fi--) {
        try { if (fx.property(fi).matchName === "ADBE Drop Shadow") fx.property(fi).remove(); }
        catch(_) {}
    }
    if (!settings.shadowEnabled) return;
    try {
        var shadow = fx.addProperty("ADBE Drop Shadow");
        var sRGB   = settings.shadowColorAE;
        shadow.property("ADBE Drop Shadow-0001").setValue([sRGB[0], sRGB[1], sRGB[2], (settings.shadowOpacity || 75) / 100]);
        shadow.property("ADBE Drop Shadow-0002").setValue(settings.shadowOpacity || 75);
        shadow.property("ADBE Drop Shadow-0003").setValue(135);
        shadow.property("ADBE Drop Shadow-0004").setValue(settings.shadowDistance || 3);
        shadow.property("ADBE Drop Shadow-0005").setValue(settings.shadowSoftness || 5);
    } catch(_) {}
}

function applyPosition(textLayer, comp, settings) {
    var margin = settings.margin || 80;
    var xPos   = (comp.width / 2) + (settings.hOffset || 0);
    var yPos   = settings.verticalPos === "top"    ? margin :
                 settings.verticalPos === "center" ? comp.height / 2 :
                 comp.height - margin;
    textLayer.property("Position").setValue([xPos, yPos]);
}

function findSubtitleLayer(comp) {
    for (var i = 1; i <= comp.layers.length; i++) {
        if (comp.layers[i].name === "Subtitles [SubtitleAI]") return comp.layers[i];
    }
    return null;
}

// ---- getAvailableFonts --------------------------------------------
function getAvailableFonts() {
    var fonts = [];
    try {
        var n = app.fonts.numFonts;
        for (var i = 0; i < n; i++) {
            var f = app.fonts[i];
            var display = f.family;
            if (f.style && f.style !== "Regular") display += " " + f.style;
            fonts.push({ psName: f.postScriptName, displayName: display });
        }
    } catch(e) {
        return "ERROR: " + e.toString();
    }
    fonts.sort(function(a, b) {
        return a.displayName.toLowerCase() < b.displayName.toLowerCase() ? -1 : 1;
    });
    return JSON.stringify(fonts);
}

// ---- createSubtitleLayer ------------------------------------------
function createSubtitleLayer(jsonString) {
    var data, subtitles, settings;
    try {
        data      = JSON.parse(jsonString);
        subtitles = data.subtitles;
        settings  = data.settings;
    } catch(e) {
        return "ERROR: JSON parse failed — " + e.toString();
    }

    if (!subtitles || subtitles.length === 0) return "ERROR: No subtitle segments received.";

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return "ERROR: No active composition. Open a comp first.";

    app.beginUndoGroup("SubtitleAI: Create Subtitle Layer");
    try {
        var old = findSubtitleLayer(comp);
        if (old) old.remove();

        var textLayer  = comp.layers.addText("");
        textLayer.name = "Subtitles [SubtitleAI]";
        textLayer.inPoint  = 0;
        textLayer.outPoint = comp.duration;
        textLayer.moveToBeginning();

        var sourceText = textLayer.property("Source Text");

        // Helper: get the layer-bound TextDocument, wipe panel state, apply style, set text.
        // We always re-fetch from sourceText.value so the doc stays bound to the layer.
        function stamp(time, text) {
            var td = sourceText.value;  // layer-bound — required for styleDoc
            styleDoc(td, settings);     // resetCharStyle() is called inside styleDoc
            td.text = text;
            sourceText.setValueAtTime(time, td);
        }

        // Anchor at t=0 (empty)
        stamp(0, "");

        for (var k = 0; k < subtitles.length; k++) {
            var sub = subtitles[k];
            stamp(sub.start, sub.text.replace(/\n/g, "\r"));
            stamp(sub.end,   "");
        }

        // All keyframes → HOLD
        for (var ki = 1; ki <= sourceText.numKeys; ki++) {
            sourceText.setInterpolationTypeAtKey(ki,
                KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
        }

        applyPosition(textLayer, comp, settings);
        applyShadow(textLayer, settings);

        app.endUndoGroup();
        return "SUCCESS";
    } catch(e) {
        app.endUndoGroup();
        return "ERROR: " + e.toString();
    }
}

// ---- updateSubtitleStyle ------------------------------------------
function updateSubtitleStyle(jsonString) {
    var data, settings;
    try {
        data     = JSON.parse(jsonString);
        settings = data.settings;
    } catch(e) {
        return "ERROR: " + e.toString();
    }

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return "SKIP";

    var textLayer = findSubtitleLayer(comp);
    if (!textLayer) return "SKIP";

    app.beginUndoGroup("SubtitleAI: Update Style");
    try {
        var sourceText = textLayer.property("Source Text");

        for (var k = 1; k <= sourceText.numKeys; k++) {
            var td   = sourceText.valueAtKey(k);
            var text = td.text;
            styleDoc(td, settings);
            td.text = text;
            sourceText.setValueAtKey(k, td);
        }

        applyPosition(textLayer, comp, settings);
        applyShadow(textLayer, settings);

        app.endUndoGroup();
        return "SUCCESS";
    } catch(e) {
        app.endUndoGroup();
        return "ERROR: " + e.toString();
    }
}

// ---- findReplaceSubtitles -----------------------------------------
// Iterates every Source Text keyframe, replaces all occurrences of
// `find` with `replace`. Styling and timing are never touched.
// Returns "REPLACED:N" or "ERROR: ...".
//
// Avoids three ExtendScript pitfalls:
//  1. setValueAtKey is unreliable for TextDocument — we snapshot all
//     keyframe times/values first, then write back via setValueAtTime
//     and re-stamp HOLD interpolation afterwards.
//  2. Global-flagged RegExp reused across iterations drifts its lastIndex
//     in ES3 — we use plain string operations instead.
//  3. String.replace treats "$" in the replacement as a back-reference
//     pattern — split/join never does.
function findReplaceSubtitles(jsonString) {
    var data;
    try { data = JSON.parse(jsonString); }
    catch(e) { return "ERROR: " + e.toString(); }

    var needle        = data.find;
    var replacement   = data.replace;
    var caseSensitive = (data.caseSensitive !== false);

    if (!needle || needle.length === 0) return "ERROR: Search term is empty.";

    var comp = app.project.activeItem;
    if (!comp || !(comp instanceof CompItem)) return "ERROR: No active composition.";

    var textLayer = findSubtitleLayer(comp);
    if (!textLayer) return "ERROR: No subtitle layer found. Generate subtitles first.";

    var sourceText = textLayer.property("Source Text");
    var numKeys    = sourceText.numKeys;
    if (numKeys === 0) return "REPLACED:0";

    // -- Plain-string replace helpers (no regex, no $-interpretation) --

    function replaceAllCS(str, find, repl) {
        // Case-sensitive: split on exact match and rejoin
        return str.split(find).join(repl);
    }

    function countCS(str, find) {
        return str.split(find).length - 1;
    }

    function replaceAllCI(str, find, repl) {
        // Case-insensitive: manual indexOf loop, preserves original casing
        var lower  = str.toLowerCase();
        var needle = find.toLowerCase();
        var out    = "";
        var pos    = 0;
        while (true) {
            var idx = lower.indexOf(needle, pos);
            if (idx === -1) { out += str.substring(pos); break; }
            out += str.substring(pos, idx) + repl;
            pos  = idx + needle.length;
        }
        return out;
    }

    function countCI(str, find) {
        var lower  = str.toLowerCase();
        var needle = find.toLowerCase();
        var count  = 0;
        var pos    = 0;
        while (true) {
            var idx = lower.indexOf(needle, pos);
            if (idx === -1) break;
            count++;
            pos = idx + needle.length;
        }
        return count;
    }

    // -- Snapshot all keyframes (time + TextDocument) --
    var frames = [];
    for (var k = 1; k <= numKeys; k++) {
        frames.push({ time: sourceText.keyTime(k), td: sourceText.valueAtKey(k) });
    }

    // -- Apply replacements to the snapshots --
    var totalCount = 0;
    for (var i = 0; i < frames.length; i++) {
        var original = frames[i].td.text;
        if (!original) continue;

        var hits = caseSensitive ? countCS(original, needle) : countCI(original, needle);
        if (hits === 0) continue;

        totalCount += hits;
        frames[i].td.text = caseSensitive
            ? replaceAllCS(original, needle, replacement)
            : replaceAllCI(original, needle, replacement);
    }

    if (totalCount === 0) return "REPLACED:0";

    // -- Write back every keyframe and restore HOLD interpolation --
    app.beginUndoGroup("SubtitleAI: Find & Replace");
    try {
        for (var i = 0; i < frames.length; i++) {
            sourceText.setValueAtTime(frames[i].time, frames[i].td);
        }
        for (var k = 1; k <= sourceText.numKeys; k++) {
            sourceText.setInterpolationTypeAtKey(
                k, KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD
            );
        }
        app.endUndoGroup();
        return "REPLACED:" + totalCount;
    } catch(e) {
        app.endUndoGroup();
        return "ERROR: " + e.toString();
    }
}
