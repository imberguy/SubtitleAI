/* ============================================================
   SubtitleAI — Panel Logic
   ElevenLabs Scribe → After Effects keyframed text layer
   ============================================================ */

(function () {
  'use strict';

  const csInterface = new CSInterface();

  // ---- State ---------------------------------------------------
  let selectedFile    = null;
  let selectedAlign   = 'center';
  let selectedVertPos = 'bottom';
  let allFonts        = [];      // [{psName, displayName}]
  let selectedFontPS  = 'Arial-BoldMT';

  // ---- Shorthand -----------------------------------------------
  const $  = id => document.getElementById(id);
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);

  // ---- Utility -------------------------------------------------
  function debounce(fn, delay) {
    let t;
    return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
  }

  // ---- Boot ----------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    restoreApiKey();
    initSettings();
    initFileDrop();
    initSegmentedGroups();
    initTemplates();
    initGenerate();
    initFontPicker();
    initStyleSync();
    initFindReplace();
    loadHostScript();
  });

  // ---- Load JSX into AE ----------------------------------------
  function loadHostScript() {
    try {
      const extPath = csInterface.getSystemPath(SystemPath.EXTENSION);
      const jsxPath = extPath + '/jsx/hostscript.jsx';
      const res     = window.cep.fs.readFile(jsxPath);
      if (res.err === 0) {
        csInterface.evalScript(res.data, result => {
          if (result === 'EvalScript error.') {
            console.error('SubtitleAI: failed to load hostscript.jsx');
          } else {
            loadFontList(); // JSX is ready — fetch AE's font list
          }
        });
      } else {
        console.error('SubtitleAI: could not read hostscript.jsx, err=' + res.err);
      }
    } catch(e) {
      console.error('SubtitleAI: loadHostScript exception', e);
    }
  }

  // ---- Font picker --------------------------------------------
  function initFontPicker() {
    const trigger  = $('fontTrigger');
    const dropdown = $('fontDropdown');
    const search   = $('fontSearch');

    trigger.addEventListener('click', () => {
      dropdown.classList.contains('hidden') ? openFontPicker() : closeFontPicker();
    });

    search.addEventListener('input', () => filterFontList(search.value));

    // Close when clicking outside the picker
    document.addEventListener('click', e => {
      if (!$('fontPicker').contains(e.target)) closeFontPicker();
    });

    // Keyboard nav
    search.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.stopPropagation(); closeFontPicker(); }
    });
  }

  function openFontPicker() {
    $('fontDropdown').classList.remove('hidden');
    $('fontTrigger').classList.add('open');
    $('fontSearch').value = '';
    filterFontList('');
    $('fontSearch').focus();
    // Scroll selected item into view
    setTimeout(() => {
      const sel = $('fontListWrap').querySelector('.selected');
      if (sel) sel.scrollIntoView({ block: 'center' });
    }, 30);
  }

  function closeFontPicker() {
    $('fontDropdown').classList.add('hidden');
    $('fontTrigger').classList.remove('open');
  }

  function filterFontList(query) {
    const q = query.toLowerCase();
    $('fontListWrap').querySelectorAll('.font-item').forEach(item => {
      const match = !q
        || item.dataset.display.toLowerCase().includes(q)
        || item.dataset.ps.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
    });
  }

  function selectFont(psName, displayName) {
    selectedFontPS = psName;
    $('fontFamily').value       = psName;
    $('fontDisplayName').textContent = displayName;
    $('fontListWrap').querySelectorAll('.font-item').forEach(item =>
      item.classList.toggle('selected', item.dataset.ps === psName)
    );
    closeFontPicker();
    syncStyleToLayer();
  }

  function populateFontList(fonts) {
    allFonts = fonts;
    const wrap = $('fontListWrap');
    wrap.innerHTML = '';
    fonts.forEach(f => {
      const div = document.createElement('div');
      div.className       = 'font-item';
      div.dataset.ps      = f.psName;
      div.dataset.display = f.displayName;
      div.textContent     = f.displayName;
      if (f.psName === selectedFontPS) div.classList.add('selected');
      div.addEventListener('click', () => selectFont(f.psName, f.displayName));
      wrap.appendChild(div);
    });
    // Sync display name for the current default
    const cur = fonts.find(f => f.psName === selectedFontPS);
    if (cur) $('fontDisplayName').textContent = cur.displayName;
  }

  function loadFontList() {
    evalAsync('getAvailableFonts()').then(result => {
      if (!result || result.startsWith('ERROR')) {
        console.warn('SubtitleAI: font list unavailable —', result);
        $('fontListWrap').innerHTML = '<div class="font-loading">Font list unavailable.<br>Type a PostScript name manually.</div>';
        return;
      }
      try { populateFontList(JSON.parse(result)); }
      catch(e) { console.warn('SubtitleAI: font list parse error', e); }
    });
  }

  // ---- Live style sync ----------------------------------------
  function initStyleSync() {
    const debouncedSync = debounce(syncStyleToLayer, 300);
    const STYLE_IDS = [
      'fontSize', 'tracking', 'fillColor', 'fillOpacity',
      'strokeEnabled', 'strokeColor', 'strokeWidth',
      'shadowEnabled', 'shadowColor', 'shadowDistance', 'shadowSoftness', 'shadowOpacity',
      'margin', 'hOffset'
    ];
    STYLE_IDS.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('input',  debouncedSync);
      el.addEventListener('change', debouncedSync);
    });
  }

  function syncStyleToLayer() {
    const settings = captureSettings();
    const payload  = {
      settings: {
        ...settings,
        fillColorAE:   hexToAE(settings.fillColor),
        strokeColorAE: hexToAE(settings.strokeColor),
        shadowColorAE: hexToAE(settings.shadowColor),
      }
    };
    evalAsync(`updateSubtitleStyle(${JSON.stringify(JSON.stringify(payload))})`)
      .then(r => { if (r && r.startsWith('ERROR')) console.warn('Style sync:', r); })
      .catch(() => {});
  }

  // ---- Settings modal -----------------------------------------
  function restoreApiKey() {
    const k = localStorage.getItem('sai_api_key');
    if (k) $('apiKey').value = k;
    updateKeyDot();
  }

  function updateKeyDot() {
    $('keyDot').classList.toggle('hidden', !!$('apiKey').value.trim());
  }

  function initSettings() {
    on('settingsBtn',   'click', openSettings);
    on('settingsClose', 'click', closeSettings);
    on('toggleApiKey',  'click', () => {
      const inp = $('apiKey');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    on('apiKey', 'input', () => {
      localStorage.setItem('sai_api_key', $('apiKey').value);
      updateKeyDot();
    });
    on('apiKeyLink', 'click', () =>
      csInterface.openURLInDefaultBrowser('https://elevenlabs.io/app/settings/api-keys')
    );
    // Close on backdrop click
    $('settingsOverlay').addEventListener('click', e => {
      if (e.target === $('settingsOverlay')) closeSettings();
    });
    // Close on Escape
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeSettings();
    });
  }

  function openSettings() {
    $('settingsOverlay').classList.remove('hidden');
    $('apiKey').focus();
  }

  function closeSettings() {
    $('settingsOverlay').classList.add('hidden');
  }

  function flashSettingsBtn() {
    const btn = $('settingsBtn');
    btn.classList.remove('flash');
    void btn.offsetWidth; // reflow to restart animation
    btn.classList.add('flash');
  }

  // ---- File drop -----------------------------------------------
  function initFileDrop() {
    const zone   = $('fileDrop');
    const input  = $('audioFile');
    const inner  = $('fileDropInner');

    zone.addEventListener('click', () => input.click());
    $('browseLink').addEventListener('click', e => { e.stopPropagation(); input.click(); });
    input.addEventListener('change', e => e.target.files[0] && setFile(e.target.files[0]));

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const f = e.dataTransfer.files[0];
      if (f) setFile(f);
    });
  }

  function setFile(file) {
    selectedFile = file;
    const zone  = $('fileDrop');
    const inner = $('fileDropInner');
    zone.classList.add('has-file');
    inner.innerHTML = `
      <div class="file-icon" style="color:#3dbf6e">&#10003;</div>
      <div style="color:#dcdcdc;font-weight:600;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${file.name}</div>
      <div class="file-hint">${fmtBytes(file.size)}</div>`;
    setStatus('', '');
  }

  function fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }

  // ---- Segmented button groups --------------------------------
  function initSegmentedGroups() {
    $('alignGroup').querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $('alignGroup').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('seg-active'));
        btn.classList.add('seg-active');
        selectedAlign = btn.dataset.align;
        syncStyleToLayer();
      });
    });
    selectedAlign = 'center';

    $('vertGroup').querySelectorAll('.seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $('vertGroup').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('seg-active'));
        btn.classList.add('seg-active');
        selectedVertPos = btn.dataset.pos;
        syncStyleToLayer();
      });
    });
    selectedVertPos = 'bottom';
  }

  // ---- Templates ----------------------------------------------
  function initTemplates() {
    refreshTemplateList();
    on('saveTemplate',   'click', saveTemplate);
    on('loadTemplate',   'click', loadTemplate);
    on('deleteTemplate', 'click', deleteTemplate);
  }

  function allTemplates() {
    try { return JSON.parse(localStorage.getItem('sai_templates') || '{}'); }
    catch(e) { return {}; }
  }

  function saveTemplates(obj) {
    localStorage.setItem('sai_templates', JSON.stringify(obj));
  }

  function refreshTemplateList() {
    const sel  = $('templateSelect');
    const prev = sel.value;
    const tmpl = allTemplates();
    sel.innerHTML = '<option value="">— select —</option>';
    Object.keys(tmpl).sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = opt.textContent = name;
      sel.appendChild(opt);
    });
    if (prev) sel.value = prev;
  }

  function captureSettings() {
    return {
      fontFamily:     $('fontFamily').value,
      fontSize:       +$('fontSize').value,
      tracking:       +$('tracking').value,
      fillColor:      $('fillColor').value,
      fillOpacity:    +$('fillOpacity').value,
      strokeEnabled:  $('strokeEnabled').checked,
      strokeColor:    $('strokeColor').value,
      strokeWidth:    +$('strokeWidth').value,
      shadowEnabled:  $('shadowEnabled').checked,
      shadowColor:    $('shadowColor').value,
      shadowDistance: +$('shadowDistance').value,
      shadowSoftness: +$('shadowSoftness').value,
      shadowOpacity:  +$('shadowOpacity').value,
      align:          selectedAlign,
      verticalPos:    selectedVertPos,
      margin:         +$('margin').value,
      hOffset:        +$('hOffset').value,
      maxLines:       +$('maxLines').value,
      maxChars:       +$('maxChars').value,
      maxWords:       +$('maxWords').value,
      gapThreshold:   +$('gapThreshold').value,
      maxDuration:    +$('maxDuration').value,
      endPad:         +$('endPad').value,
    };
  }

  function applySettings(s) {
    const set = (id, v) => { if ($(id) && v !== undefined) $(id).value = v; };
    const chk = (id, v) => { if ($(id) && v !== undefined) $(id).checked = v; };

    // Font picker: update hidden field + display label + selected state in list
    if (s.fontFamily) {
      selectedFontPS = s.fontFamily;
      $('fontFamily').value = s.fontFamily;
      const match = allFonts.find(f => f.psName === s.fontFamily);
      $('fontDisplayName').textContent = match ? match.displayName : s.fontFamily;
      $('fontListWrap').querySelectorAll('.font-item').forEach(item =>
        item.classList.toggle('selected', item.dataset.ps === s.fontFamily)
      );
    }

    set('fontSize',       s.fontSize);
    set('tracking',       s.tracking);
    set('fillColor',      s.fillColor);
    set('fillOpacity',    s.fillOpacity);
    chk('strokeEnabled',  s.strokeEnabled);
    set('strokeColor',    s.strokeColor);
    set('strokeWidth',    s.strokeWidth);
    chk('shadowEnabled',  s.shadowEnabled);
    set('shadowColor',    s.shadowColor);
    set('shadowDistance', s.shadowDistance);
    set('shadowSoftness', s.shadowSoftness);
    set('shadowOpacity',  s.shadowOpacity);
    set('margin',         s.margin);
    set('hOffset',        s.hOffset);
    set('maxLines',       s.maxLines);
    set('maxChars',       s.maxChars);
    set('maxWords',       s.maxWords);
    set('gapThreshold',   s.gapThreshold);
    set('maxDuration',    s.maxDuration);
    set('endPad',         s.endPad);

    if (s.align) {
      $('alignGroup').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('seg-active'));
      const ab = $('alignGroup').querySelector(`[data-align="${s.align}"]`);
      if (ab) ab.classList.add('seg-active');
      selectedAlign = s.align;
    }
    if (s.verticalPos) {
      $('vertGroup').querySelectorAll('.seg-btn').forEach(b => b.classList.remove('seg-active'));
      const vb = $('vertGroup').querySelector(`[data-pos="${s.verticalPos}"]`);
      if (vb) vb.classList.add('seg-active');
      selectedVertPos = s.verticalPos;
    }
  }

  function saveTemplate() {
    const name = $('templateName').value.trim();
    if (!name) { setStatus('Enter a template name first.', 'warn'); return; }
    const tmpl = allTemplates();
    tmpl[name] = captureSettings();
    saveTemplates(tmpl);
    refreshTemplateList();
    $('templateSelect').value = name;
    setStatus(`Template "${name}" saved.`, 'ok');
  }

  function loadTemplate() {
    const name = $('templateSelect').value;
    if (!name) { setStatus('Select a template to load.', 'warn'); return; }
    const tmpl = allTemplates();
    if (tmpl[name]) {
      applySettings(tmpl[name]);
      $('templateName').value = name;
      setStatus(`Template "${name}" loaded.`, 'ok');
    }
  }

  function deleteTemplate() {
    const name = $('templateSelect').value;
    if (!name) return;
    const tmpl = allTemplates();
    delete tmpl[name];
    saveTemplates(tmpl);
    refreshTemplateList();
    setStatus(`Template "${name}" deleted.`, '');
  }

  // ---- Subtitle segmentation ----------------------------------
  // Builds segments of up to maxLines lines, each line up to maxChars / maxWords.
  // Breaks on silence gaps, duration limit, or when all lines in a segment are full.
  function segmentWords(words, s) {
    const only = words.filter(w => w.type === 'word');
    const segs = [];

    let lines        = [[]];   // current segment: array of lines, each line = word[]
    let segStartTime = null;

    const curLine  = () => lines[lines.length - 1];
    const flatAll  = () => lines.flat();

    function flushSegment() {
      const flat = flatAll();
      if (!flat.length) return;
      segs.push({
        text:  lines.map(ln => ln.map(w => w.text).join(' ')).join('\n'),
        start: flat[0].start,
        end:   flat[flat.length - 1].end + s.endPad
      });
      lines        = [[]];
      segStartTime = null;
    }

    function lineWouldOverflow(word) {
      const ln = curLine();
      if (!ln.length) return false;
      const chars = ln.map(w => w.text).join(' ').length + 1 + word.text.length;
      return chars > s.maxChars || ln.length >= s.maxWords;
    }

    only.forEach(word => {
      const flat = flatAll();
      const last = flat.length ? flat[flat.length - 1] : null;

      // Silence gap → flush and start fresh segment
      if (last && (word.start - last.end) > s.gapThreshold) {
        flushSegment();
      }

      if (segStartTime === null) segStartTime = word.start;

      // Duration cap → flush
      if (last && (word.end - segStartTime) > s.maxDuration) {
        flushSegment();
        segStartTime = word.start;
      }

      // Current line is full
      if (lineWouldOverflow(word)) {
        if (lines.length >= s.maxLines) {
          // All lines full → new segment
          flushSegment();
          segStartTime = word.start;
          lines = [[word]];
        } else {
          // Wrap to next line in same segment
          lines.push([word]);
        }
      } else {
        curLine().push(word);
      }
    });

    flushSegment();

    // Guard: clip end so consecutive segments never overlap
    for (let i = 0; i < segs.length - 1; i++) {
      if (segs[i].end > segs[i + 1].start) {
        segs[i].end = segs[i + 1].start - 0.001;
      }
    }

    return segs;
  }

  // ---- Hex → AE [r,g,b] (0-1) ---------------------------------
  function hexToAE(hex) {
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255
    ];
  }

  // ---- Find & Replace -----------------------------------------
  function initFindReplace() {
    on('frBtn', 'click', runFindReplace);
    // Clear result when either input changes
    on('frFind',    'input', () => hideFrResult());
    on('frReplace', 'input', () => hideFrResult());
  }

  function hideFrResult() {
    const el = $('frResult');
    el.textContent = '';
    el.className = 'fr-result hidden';
  }

  async function runFindReplace() {
    const find    = $('frFind').value;
    const replace = $('frReplace').value;

    if (!find.trim()) { showFrResult('Enter a search term.', 'warn'); return; }

    // Show immediate feedback so the user knows the click registered
    showFrResult('Replacing…', '');
    $('frBtn').disabled = true;

    // Build the entire find-replace logic as a self-contained inline IIFE.
    // We do NOT call findReplaceSubtitles() by name because in newer AE/CEP
    // versions, calling an undefined function silently hangs evalScript's
    // callback instead of returning "EvalScript error." — leaving the Promise
    // pending forever. Inlining the script removes that dependency entirely.
    const needle        = find;
    const repl          = replace;
    const cs            = $('frCaseSensitive').checked;

    const script = `(function () {
  var needle = ${JSON.stringify(needle)};
  var repl   = ${JSON.stringify(repl)};
  var cs     = ${cs ? 'true' : 'false'};

  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) return "ERROR: No active composition.";

  // Prefer the first selected layer that has Source Text keyframes
  var layer = null;
  var sel   = comp.selectedLayers;
  for (var si = 0; si < sel.length; si++) {
    try { var st = sel[si].property("Source Text"); if (st && st.numKeys > 0) { layer = sel[si]; break; } } catch(e) {}
  }
  // Fall back to the SubtitleAI layer
  if (!layer) {
    for (var li = 1; li <= comp.layers.length; li++) {
      if (comp.layers[li].name === "Subtitles [SubtitleAI]") { layer = comp.layers[li]; break; }
    }
  }
  if (!layer) return "ERROR: No text layer with keyframes found. Select a subtitle layer first.";

  var sourceProp = layer.property("Source Text");
  var nKeys      = sourceProp.numKeys;
  if (nKeys === 0) return "ERROR: Layer has no Source Text keyframes.";

  // Read phase — snapshot every keyframe time + text
  var times = [], oldTexts = [], newTexts = [];
  var needleLo = needle.toLowerCase();
  var totalCount = 0;

  for (var k = 1; k <= nKeys; k++) {
    var t    = sourceProp.keyTime(k);
    var orig = sourceProp.valueAtKey(k).text || "";
    times.push(t);
    oldTexts.push(orig);

    var compare = cs ? orig : orig.toLowerCase();
    var search  = cs ? needle : needleLo;
    if (compare.indexOf(search) === -1) { newTexts.push(null); continue; }

    // Replace with plain split/join (never mis-interprets "$" in the replacement)
    var out = ""; var pos = 0; var count = 0;
    while (true) {
      var idx = compare.indexOf(search, pos);
      if (idx === -1) { out += orig.substring(pos); break; }
      out += orig.substring(pos, idx) + repl;
      pos = idx + needle.length;
      count++;
    }
    newTexts.push(out);
    totalCount += count;
  }

  if (totalCount === 0) {
    var sample = oldTexts[0] ? oldTexts[0].substring(0, 50) : "(empty)";
    return "REPLACED:0|sample:" + sample;
  }

  // Write phase — use sourceText.value (live, layer-bound) + setValueAtTime,
  // the same proven pattern as createSubtitleLayer
  app.beginUndoGroup("SubtitleAI: Find & Replace");
  try {
    var liveTD = sourceProp.value;
    for (var i = 0; i < newTexts.length; i++) {
      if (newTexts[i] === null) continue;
      liveTD.text = newTexts[i];
      sourceProp.setValueAtTime(times[i], liveTD);
    }
    // Restore HOLD on every keyframe
    for (var k = 1; k <= sourceProp.numKeys; k++) {
      sourceProp.setInterpolationTypeAtKey(k,
        KeyframeInterpolationType.HOLD, KeyframeInterpolationType.HOLD);
    }
    app.endUndoGroup();
    return "REPLACED:" + totalCount;
  } catch (e) {
    app.endUndoGroup();
    return "ERROR: write failed: " + e.toString();
  }
})()`;

    let result;
    try {
      result = await evalAsync(script);
    } catch(e) {
      showFrResult('ExtendScript bridge error: ' + e.message, 'err');
      $('frBtn').disabled = false;
      return;
    }

    $('frBtn').disabled = false;

    if (!result || result === 'EvalScript error.' || result.startsWith('ERROR')) {
      showFrResult(result || 'Unknown error.', 'err');
      return;
    }

    const parts = result.split('|');
    const count = parseInt(parts[0].split(':')[1], 10);
    if (isNaN(count)) { showFrResult('Unexpected response: ' + result, 'err'); return; }

    if (count === 0) {
      const sample = parts[1] ? parts[1].replace('sample:', '') : '';
      const hint   = sample ? ` — keyframe text: "${sample}"` : '';
      showFrResult(`"${find}" not found.${hint}`, 'warn');
    } else {
      showFrResult(`${count} replacement${count !== 1 ? 's' : ''} made.`, '');
    }
  }

  function showFrResult(msg, cls) {
    const el = $('frResult');
    el.textContent = msg;
    el.className = 'fr-result' + (cls ? ' ' + cls : '');
  }

  // ---- Generate -----------------------------------------------
  function initGenerate() {
    on('generateBtn', 'click', onGenerate);
  }

  async function onGenerate() {
    const apiKey = $('apiKey').value.trim();
    if (!apiKey) {
      setStatus('Add your API key in Settings ⚙', 'err');
      flashSettingsBtn();
      return;
    }
    if (!selectedFile) { setStatus('Select an audio file first.', 'err'); return; }

    setBusy(true);
    setStatus('Uploading to ElevenLabs Scribe…', '');
    $('previewLine').textContent = '';

    try {
      const words = await transcribe(apiKey, selectedFile);
      setStatus('Segmenting…', '');

      const settings = captureSettings();
      const segs     = segmentWords(words, settings);

      if (!segs.length) {
        setStatus('No speech detected in the audio.', 'warn');
        setBusy(false);
        return;
      }

      $('previewLine').textContent =
        `${segs.length} subtitle segment${segs.length !== 1 ? 's' : ''} — ${fmtDur(segs[segs.length-1].end)}`;

      setStatus('Writing layer in After Effects…', '');

      const payload = {
        subtitles: segs,
        settings: {
          ...settings,
          fillColorAE:   hexToAE(settings.fillColor),
          strokeColorAE: hexToAE(settings.strokeColor),
          shadowColorAE: hexToAE(settings.shadowColor),
        }
      };

      const result = await evalAsync(
        `createSubtitleLayer(${JSON.stringify(JSON.stringify(payload))})`
      );

      if (result && result.startsWith('ERROR')) {
        setStatus(result, 'err');
      } else {
        setStatus(`Done — ${segs.length} subtitles created.`, 'ok');
      }

    } catch (err) {
      setStatus('Error: ' + err.message, 'err');
      console.error(err);
    } finally {
      setBusy(false);
    }
  }

  function fmtDur(sec) {
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(1);
    return `${m}:${s.padStart(4, '0')}`;
  }

  // ---- ElevenLabs Scribe API ----------------------------------
  async function transcribe(apiKey, file) {
    const form = new FormData();
    form.append('file', file, file.name);   // ElevenLabs requires field name 'file'
    form.append('model_id', 'scribe_v1');
    form.append('timestamps_granularity', 'word');

    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form
    });

    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        msg = body.detail?.message || body.detail || msg;
      } catch(_) {}
      throw new Error(msg);
    }

    const data = await res.json();
    if (!data.words || !data.words.length)
      throw new Error('No words returned — check audio quality or file format.');

    return data.words;
  }

  // ---- CSInterface promise wrapper ----------------------------
  function evalAsync(script) {
    return new Promise((resolve, reject) => {
      csInterface.evalScript(script, res => {
        if (res === 'EvalScript error.') reject(new Error('ExtendScript failed. Check AE console.'));
        else resolve(res);
      });
    });
  }

  // ---- UI helpers ---------------------------------------------
  function setBusy(on) {
    const btn  = $('generateBtn');
    const lbl  = $('generateBtnLabel');
    const spin = $('spinner');
    btn.disabled = on;
    lbl.textContent = on ? 'Processing…' : 'Generate Subtitles';
    spin.classList.toggle('hidden', !on);
  }

  function setStatus(msg, cls) {
    const el = $('statusMsg');
    el.textContent = msg;
    el.className = 'status' + (cls ? ' ' + cls : '');
  }

})();
