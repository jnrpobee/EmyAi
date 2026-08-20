// Cache of DOM element references used throughout the app, keyed by logical name.
const refs = {
  togglePlatformMetaBtn: document.getElementById("togglePlatformMetaBtn"),
  platformMetaPills: document.getElementById("platformMetaPills"),
  statusBadge: document.getElementById("statusBadge"),
  noticeText: document.getElementById("noticeText"),
  runForm: document.getElementById("runForm"),
  audioFileInput: document.getElementById("audioFileInput"),
  audioDropZone: document.getElementById("audioDropZone"),
  audioDropHint: document.getElementById("audioDropHint"),
  fileChooseBtnVisual: document.getElementById("fileChooseBtnVisual"),
  fileStatusText: document.getElementById("fileStatusText"),
  languageSelect: document.getElementById("languageSelect"),
  clearBtn: document.getElementById("clearBtn"),
  bundleBtn: document.getElementById("bundleBtn"),
  showHistoryBtn: document.getElementById("showHistoryBtn"),
  historyPanel: document.getElementById("historyPanel"),
  toggleHistorySelectBtn: document.getElementById("toggleHistorySelectBtn"),
  refreshHistoryBtn: document.getElementById("refreshHistoryBtn"),
  closeHistoryBtn: document.getElementById("closeHistoryBtn"),
  historyBulkActions: document.getElementById("historyBulkActions"),
  selectAllHistory: document.getElementById("selectAllHistory"),
  deleteHistoryBtn: document.getElementById("deleteHistoryBtn"),
  historyList: document.getElementById("historyList"),
  historyDeleteConfirmPopup: document.getElementById("historyDeleteConfirmPopup"),
  historyDeleteConfirmMessage: document.getElementById("historyDeleteConfirmMessage"),
  deleteAudioOption: document.getElementById("deleteAudioOption"),
  deleteAudioCheckbox: document.getElementById("deleteAudioCheckbox"),
  deleteTranscriptsOption: document.getElementById("deleteTranscriptsOption"),
  deleteTranscriptsCheckbox: document.getElementById("deleteTranscriptsCheckbox"),
  cancelHistoryDeleteBtn: document.getElementById("cancelHistoryDeleteBtn"),
  confirmHistoryDeleteBtn: document.getElementById("confirmHistoryDeleteBtn"),
  artifactSelect: document.getElementById("artifactSelect"),
  artifactVerbatimToggle: document.getElementById("artifactVerbatimToggle"),
  artifactStatus: document.getElementById("artifactStatus"),
  artifactDownloadLink: document.getElementById("artifactDownloadLink"),
  metricStatus: document.getElementById("metricStatus"),
  metricRuntime: document.getElementById("metricRuntime"),
  metricWords: document.getElementById("metricWords"),
  metricBullets: document.getElementById("metricBullets"),
  metricView: document.getElementById("metricView"),
  metricExports: document.getElementById("metricExports"),
  timelineList: document.getElementById("timelineList"),
  transcriptOutput: document.getElementById("transcriptOutput"),
  summaryOutput: document.getElementById("summaryOutput"),
  logOutput: document.getElementById("logOutput"),
  copyTranscriptBtn: document.getElementById("copyTranscriptBtn"),
  toggleVerbatimBtn: document.getElementById("toggleVerbatimBtn"),
  copyToast: document.getElementById("copyToast"),
  lookupInput: document.getElementById("lookupInput"),
  lookupBtn: document.getElementById("lookupBtn"),
  lookupOutput: document.getElementById("lookupOutput"),
  tabButtons: Array.from(document.querySelectorAll(".tab-btn")),
  tabPanels: Array.from(document.querySelectorAll(".tab-panel")),
  wsBadge: document.getElementById("wsBadge"),
  lastRefreshText: document.getElementById("lastRefreshText"),
  opsLanguage: document.getElementById("opsLanguage"),
  opsSourceFile: document.getElementById("opsSourceFile"),
  opsLastUpdated: document.getElementById("opsLastUpdated"),
  opsConnection: document.getElementById("opsConnection"),
  checkInput: document.getElementById("checkInput"),
  checkRun: document.getElementById("checkRun"),
  checkExport: document.getElementById("checkExport"),
};

// Mutable app-level state shared across render/update functions.
let latestState = null;
let socket = null;
let connectionState = "connecting";
let lastRefreshAt = null;
let selectedUploadName = null;
let latestArtifactUrls = {
  pdf: { clean: null, verbatim: null },
  docx: { clean: null, verbatim: null },
  json: { clean: null, verbatim: null },
  bundle: null,
};
let showingVerbatimTranscript = false;
let historyEntries = [];
let pendingDeleteHistoryStems = [];
let historySelectionMode = false;

// Static label lookup tables and the allowlist of audio file extensions accepted for upload.
const ARTIFACT_LABELS = {
  pdf: "PDF Report",
  docx: "DOCX Report",
  json: "JSON Package",
  bundle: "Bundle (ZIP)",
};
const HISTORY_FORMAT_LABELS = { pdf: "PDF", docx: "DOCX", json: "JSON" };
const ACCEPTED_AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".m4a", ".flac", ".mp4"]);
let audioDropDragDepth = 0;

// Return the currently selected translation language code (lowercased), or null if none chosen.
function getSelectedLanguage() {
  const code = (refs.languageSelect.value || "").trim().toLowerCase();
  return code || null;
}

// Format the elapsed time between two timestamps (or now, if not completed) as MM:SS.
function formatRuntime(startedAt, completedAt) {
  if (!startedAt) return "--:--";
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const min = String(Math.floor(seconds / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

// Format an ISO date/time value into a localized display string, or "--" if invalid/missing.
function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

// Format a byte count as a human-readable size string (B/KB/MB/GB).
function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

// Count whitespace-separated words in a text string.
function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Count lines that look like bullet points (start with "-").
function countBullets(text) {
  if (!text) return 0;
  return text.split("\n").filter((line) => line.trim().startsWith("-")).length;
}

// Build the notice text shown near the run controls, reflecting file selection or run state.
function getRunControlNotice(state) {
  const status = String((state && state.status) || "");
  if (status === "Idle" || !status) {
    const selectedFile = refs.audioFileInput.files && refs.audioFileInput.files[0];
    if (selectedUploadName) return `${selectedUploadName} Ready. File Selected`;
    if (selectedFile) return `${selectedFile.name} Ready. File Uploaded`;
  }
  return (state && state.notice) || "Ready.";
}

// Update the status badge's CSS class and label to match the given run status.
function setStatusBadge(status) {
  const s = status || "Idle";
  const cssClass =
    s === "Running" ? "running" : s.startsWith("Completed") ? "completed" : s.startsWith("Failed") ? "failed" : "idle";
  refs.statusBadge.className = `status-pill ${cssClass}`;
  refs.statusBadge.querySelector(".label").textContent = s;
}

// Enable a download link when a URL is available, otherwise disable it.
function setDownloadState(link, url) {
  if (!link) return;
  if (url) {
    link.href = url;
    link.classList.remove("disabled");
    link.setAttribute("aria-disabled", "false");
  } else {
    link.href = "#";
    link.classList.add("disabled");
    link.setAttribute("aria-disabled", "true");
  }
}

// Toggle the "done" class on a checklist item element.
function setChecklistState(node, done) {
  if (!node) return;
  node.classList.toggle("done", done);
}

// Update the websocket connection badges/labels to reflect connecting/connected/disconnected state.
function setConnectionState(nextState) {
  connectionState = nextState;
  const label = nextState === "connected" ? "Connected" : nextState === "disconnected" ? "Disconnected" : "Connecting";
  refs.wsBadge.textContent = label;
  refs.wsBadge.className = `ws-badge ${nextState}`;
  refs.opsConnection.textContent = label;
}

// Resize a textarea/output element's height to fit its scrollable content.
function autoSizeOutput(node) {
  if (!node) return;
  node.style.height = "auto";
  node.style.height = `${node.scrollHeight}px`;
}

// Auto-size both the transcript and summary output boxes.
function resizeResultOutputs() {
  autoSizeOutput(refs.transcriptOutput);
  autoSizeOutput(refs.summaryOutput);
}

// Derive the transcript/summary text and export download URLs to show, based on run state,
// the selected translation language, and whether the run failed.
function buildDisplayState(state) {
  const selectedLanguage = getSelectedLanguage();
  const runLanguage = state.translate_lang;
  let transcript = state.transcription_output || state.output || "";
  let summary = state.summary_output || "";
  let viewName = "Original";
  let pdfUrl = state.pdf_output ? "/api/download/pdf" : null;
  let docxUrl = state.export_files && state.export_files.docx ? "/api/download/docx" : null;
  let jsonUrl = state.export_files && state.export_files.json ? "/api/download/json" : null;
  const verbatimExports = state.verbatim_export_files || {};
  let pdfVerbatimUrl = verbatimExports.pdf ? "/api/download/pdf?verbatim=true" : null;
  let docxVerbatimUrl = verbatimExports.docx ? "/api/download/docx?verbatim=true" : null;
  let jsonVerbatimUrl = verbatimExports.json ? "/api/download/json?verbatim=true" : null;

  if (selectedLanguage && selectedLanguage === runLanguage) {
    const languageName = state.supported_languages[selectedLanguage] || selectedLanguage;
    transcript = state.translations[selectedLanguage] || transcript;
    if (state.translated_summaries[selectedLanguage]) {
      summary = state.translated_summaries[selectedLanguage];
    } else if (state.status === "Running") {
      summary = `Translation to ${languageName} loading...`;
    }
    viewName = languageName;
    pdfUrl = state.pdf_output ? `/api/download/pdf?language=${encodeURIComponent(selectedLanguage)}` : null;
    docxUrl =
      state.export_files && state.export_files.docx
        ? `/api/download/docx?language=${encodeURIComponent(selectedLanguage)}`
        : null;
    jsonUrl =
      state.export_files && state.export_files.json
        ? `/api/download/json?language=${encodeURIComponent(selectedLanguage)}`
        : null;
  }

  if (state.status && String(state.status).startsWith("Failed")) {
    transcript = `Transcription failed.\n\n${state.output || "[No output returned]"}`;
    summary = "";
    pdfUrl = null;
    docxUrl = null;
    jsonUrl = null;
    pdfVerbatimUrl = null;
    docxVerbatimUrl = null;
    jsonVerbatimUrl = null;
  }

  if (!transcript && state.status === "Running") transcript = "Transcription running...";
  if (!transcript && (!state.status || state.status === "Idle")) transcript = "Ready.";

  return {
    transcript,
    summary,
    viewName,
    pdfUrl,
    docxUrl,
    jsonUrl,
    pdfVerbatimUrl,
    docxVerbatimUrl,
    jsonVerbatimUrl,
  };
}

// Update the single artifact download link/label/status for the currently selected artifact
// type (pdf/docx/json/bundle) and verbatim toggle.
function renderArtifactSelection(running) {
  const selected = refs.artifactSelect.value || "pdf";
  const verbatim = Boolean(refs.artifactVerbatimToggle && refs.artifactVerbatimToggle.checked);
  const label = ARTIFACT_LABELS[selected] || "Artifact";
  const entry = latestArtifactUrls[selected];
  const url = entry && typeof entry === "object" ? (verbatim ? entry.verbatim : entry.clean) : entry || null;
  const supportsVerbatim = selected !== "bundle";

  if (selected === "bundle" && !url) {
    refs.artifactDownloadLink.href = "#";
    refs.artifactDownloadLink.dataset.mode = "build";
    if (running) {
      refs.artifactDownloadLink.classList.add("disabled");
      refs.artifactDownloadLink.setAttribute("aria-disabled", "true");
      refs.artifactDownloadLink.textContent = "Building...";
      refs.artifactStatus.textContent = "In progress";
    } else {
      refs.artifactDownloadLink.classList.remove("disabled");
      refs.artifactDownloadLink.setAttribute("aria-disabled", "false");
      refs.artifactDownloadLink.textContent = "Build Bundle (ZIP)";
      refs.artifactStatus.textContent = "Not built";
    }
    return;
  }

  delete refs.artifactDownloadLink.dataset.mode;
  setDownloadState(refs.artifactDownloadLink, url);
  refs.artifactDownloadLink.textContent = `Download ${label}${verbatim && supportsVerbatim ? " (Verbatim)" : ""}`;

  if (url) {
    refs.artifactStatus.textContent = "Available";
    return;
  }
  refs.artifactStatus.textContent = running ? "In progress" : "Pending";
}

// Render the run timeline list (most recent first) from an array of timeline event entries.
function renderTimeline(items) {
  refs.timelineList.replaceChildren();
  if (!items || !items.length) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "timeline-empty";
    emptyItem.textContent = "Start a run to populate timeline events.";
    refs.timelineList.append(emptyItem);
    return;
  }
  const fragment = document.createDocumentFragment();
  items
    .slice()
    .reverse()
    .forEach((item) => {
      const listItem = document.createElement("li");
      const time = document.createElement("span");
      const content = document.createElement("div");
      const label = document.createElement("p");
      const detail = document.createElement("p");

      time.className = "timeline-time";
      time.textContent = item.time || "--:--";
      label.className = "timeline-label";
      label.textContent = item.label || "Event";
      detail.className = "timeline-detail";
      detail.textContent = item.detail || "";

      content.append(label, detail);
      listItem.append(time, content);
      fragment.append(listItem);
    });
  refs.timelineList.append(fragment);
}

// Sync the "selected"/"Use" button states in the history list with the currently selected upload.
function syncUploadedFileActions() {
  const running = latestState && latestState.status === "Running";
  refs.historyList.querySelectorAll(".history-row").forEach((row) => {
    row.classList.toggle("selected", Boolean(selectedUploadName) && row.dataset.audioName === selectedUploadName);
  });
  refs.historyList.querySelectorAll("[data-action='select-upload']").forEach((button) => {
    button.disabled = Boolean(running);
    button.textContent = button.dataset.fileName === selectedUploadName ? "Selected" : "Use";
  });
}

// Clear the currently selected previously-uploaded file and refresh related UI.
function clearSelectedUpload() {
  selectedUploadName = null;
  syncAudioDropHint();
  syncUploadedFileActions();
}

// Select a previously uploaded file as the audio source for the next transcription run.
function selectUploadedFile(fileName) {
  if (!fileName) return;
  selectedUploadName = fileName;
  refs.audioFileInput.value = "";
  syncAudioDropHint();
  syncUploadedFileActions();
  refs.noticeText.textContent = `${selectedUploadName} Ready. File Selected`;
}

// Choose between the clean (display) transcript and the raw verbatim transcript, based on the toggle.
function getTranscriptDisplayText(state, display) {
  if (!showingVerbatimTranscript) return display.transcript || "";
  if (state.raw_transcript_output) return state.raw_transcript_output;
  if (state.status === "Running") return "Transcription running...";
  if (!state.status || state.status === "Idle") return "Ready.";
  return "Verbatim transcript not available.";
}

// Toggle between clean and verbatim transcript views and re-render the current state.
function toggleVerbatimTranscriptView() {
  showingVerbatimTranscript = !showingVerbatimTranscript;
  if (latestState) renderState(latestState);
}

// Main render function: given the latest run state, update the status badge, transcript/summary
// text, metrics, ops panel, checklist, timeline, and artifact download links.
function renderState(state) {
  lastRefreshAt = new Date();

  latestState = state;
  const display = buildDisplayState(state);
  const running = state.status === "Running";
  const hasExports = Object.keys(state.export_files || {}).length > 0;

  setStatusBadge(state.status || "Idle");
  refs.noticeText.textContent = getRunControlNotice(state);
  refs.transcriptOutput.value = getTranscriptDisplayText(state, display);
  refs.summaryOutput.value = display.summary || "";
  resizeResultOutputs();
  refs.logOutput.textContent = state.log_tail || "No log output yet.";

  refs.toggleVerbatimBtn.textContent = showingVerbatimTranscript ? "View Clean" : "View Verbatim";
  refs.toggleVerbatimBtn.setAttribute("aria-pressed", String(showingVerbatimTranscript));

  refs.metricStatus.textContent = state.status || "Idle";
  refs.metricRuntime.textContent = formatRuntime(state.started_at, state.completed_at);
  refs.metricWords.textContent = String(countWords(display.transcript));
  refs.metricBullets.textContent = String(countBullets(display.summary));
  refs.metricView.textContent = display.viewName;
  refs.metricExports.textContent = String(Object.keys(state.export_files || {}).length);

  refs.opsLanguage.textContent = display.viewName;
  refs.opsSourceFile.textContent = state.active_audio_name || "Not set";
  refs.opsLastUpdated.textContent = formatDateTime(state.completed_at || state.started_at);
  refs.lastRefreshText.textContent = `Last refresh: ${lastRefreshAt ? lastRefreshAt.toLocaleTimeString() : "--"}`;

  setChecklistState(refs.checkInput, Boolean(state.active_audio_name));
  setChecklistState(refs.checkRun, running || String(state.status || "").startsWith("Completed"));
  setChecklistState(refs.checkExport, hasExports);

  latestArtifactUrls = {
    pdf: { clean: display.pdfUrl, verbatim: display.pdfVerbatimUrl },
    docx: { clean: display.docxUrl, verbatim: display.docxVerbatimUrl },
    json: { clean: display.jsonUrl, verbatim: display.jsonVerbatimUrl },
    bundle: state.bundle_output ? "/api/download/bundle" : null,
  };
  renderArtifactSelection(running);

  renderTimeline(state.timeline || []);
  syncUploadedFileActions();
}

// Return the lowercased file extension (including the leading dot) of a file name.
function getFileExtension(name) {
  const value = String(name || "");
  const dotIndex = value.lastIndexOf(".");
  if (dotIndex < 0) return "";
  return value.slice(dotIndex).toLowerCase();
}

// Check whether a File is an accepted audio type, by extension first and falling back to MIME type.
function isAcceptedAudioFile(file) {
  if (!file) return false;
  const extension = getFileExtension(file.name);
  if (ACCEPTED_AUDIO_EXTENSIONS.has(extension)) return true;
  if (extension) return false;
  const type = String(file.type || "").toLowerCase();
  return [
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/flac",
    "audio/x-flac",
    "audio/mp4",
    "audio/x-m4a",
    "video/mp4",
  ].includes(
    type
  );
}

// Check whether a drag event is carrying files (as opposed to e.g. text or links).
function dragEventHasFiles(event) {
  if (!event.dataTransfer) return false;
  return Array.from(event.dataTransfer.types || []).includes("Files");
}

// Toggle the audio drop zone's "dragging" visual state.
function setAudioDropDragging(active) {
  if (!refs.audioDropZone) return;
  refs.audioDropZone.classList.toggle("dragging", Boolean(active));
}

// Update the drop zone's hint text and "has-file" classes to reflect the current file selection.
function syncAudioDropHint() {
  if (!refs.audioDropHint) return;
  const file = refs.audioFileInput.files && refs.audioFileInput.files[0];
  const hasSelection = Boolean(file) || Boolean(selectedUploadName);
  if (refs.audioDropZone) refs.audioDropZone.classList.toggle("has-file", hasSelection);
  if (refs.fileChooseBtnVisual) refs.fileChooseBtnVisual.classList.toggle("has-file", hasSelection);

  if (selectedUploadName) {
    if (refs.fileStatusText) refs.fileStatusText.textContent = "File selected";
    refs.audioDropHint.textContent = `Selected uploaded file: ${selectedUploadName}`;
    return;
  }
  if (refs.fileStatusText) refs.fileStatusText.textContent = file ? file.name : "No file chosen";
  refs.audioDropHint.textContent = file ? `Selected file: ${file.name}` : "Or drag and drop an audio file here.";
}

// Programmatically assign a dropped file to the hidden file input via the DataTransfer API,
// then dispatch a "change" event so existing input handlers pick it up.
function assignAudioFile(file) {
  if (!file) return false;
  try {
    if (typeof DataTransfer === "function") {
      // Build a synthetic FileList containing just the dropped file.
      const transfer = new DataTransfer();
      transfer.items.add(file);
      refs.audioFileInput.files = transfer.files;
      selectedUploadName = null;
    } else {
      return false;
    }
    refs.audioFileInput.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

// Handle drag-enter on the drop zone, tracking nested enter/leave depth to avoid flicker.
function onAudioDropZoneDragEnter(event) {
  if (!dragEventHasFiles(event)) return;
  event.preventDefault();
  audioDropDragDepth += 1;
  setAudioDropDragging(true);
}

// Handle drag-over on the drop zone: prevent default to allow dropping and show a "copy" cursor.
function onAudioDropZoneDragOver(event) {
  if (!dragEventHasFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

// Handle drag-leave on the drop zone, clearing the dragging state once the enter/leave depth hits zero.
function onAudioDropZoneDragLeave(event) {
  if (!dragEventHasFiles(event)) return;
  event.preventDefault();
  audioDropDragDepth = Math.max(0, audioDropDragDepth - 1);
  if (audioDropDragDepth === 0) setAudioDropDragging(false);
}

// Handle a file drop: validate the dropped file's type and assign it to the file input.
function onAudioDropZoneDrop(event) {
  if (!dragEventHasFiles(event)) return;
  event.preventDefault();
  audioDropDragDepth = 0;
  setAudioDropDragging(false);

  const files = event.dataTransfer.files || [];
  if (!files.length) return;
  const file = files[0];
  if (!isAcceptedAudioFile(file)) {
    refs.noticeText.textContent = "Unsupported file type. Use .mp3, .wav, .m4a, .flac, or .mp4.";
    return;
  }
  if (!assignAudioFile(file)) {
    refs.noticeText.textContent = "Drop detected, but file assignment was blocked. Use Choose File.";
    return;
  }
  refs.noticeText.textContent = `${file.name} Ready. File Uploaded`;
}

// Forward clicks on the drop zone's background (not its children) to the hidden file input.
function onAudioDropZoneClick(event) {
  if (!refs.audioFileInput) return;
  if (event.target === refs.audioDropZone || event.target === refs.audioDropHint) {
    refs.audioFileInput.click();
  }
}

// Allow keyboard activation (Enter/Space) of the drop zone to open the file chooser.
function onAudioDropZoneKeydown(event) {
  if (!refs.audioFileInput) return;
  if (event.target !== refs.audioDropZone) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    refs.audioFileInput.click();
  }
}

// Wire up all drag/drop, click, and keyboard handlers for the audio drop zone and file input.
function setupAudioDropZone() {
  if (!refs.audioDropZone || !refs.audioFileInput) return;
  refs.audioDropZone.addEventListener("dragenter", onAudioDropZoneDragEnter);
  refs.audioDropZone.addEventListener("dragover", onAudioDropZoneDragOver);
  refs.audioDropZone.addEventListener("dragleave", onAudioDropZoneDragLeave);
  refs.audioDropZone.addEventListener("drop", onAudioDropZoneDrop);
  refs.audioDropZone.addEventListener("click", onAudioDropZoneClick);
  refs.audioDropZone.addEventListener("keydown", onAudioDropZoneKeydown);
  // Manual file selection via the native chooser also counts as a fresh upload.
  refs.audioFileInput.addEventListener("change", () => {
    const file = refs.audioFileInput.files && refs.audioFileInput.files[0];
    if (file) {
      selectedUploadName = null;
      syncUploadedFileActions();
      refs.noticeText.textContent = `${file.name} Ready. File Uploaded`;
    }
    syncAudioDropHint();
  });
  syncAudioDropHint();
}

// Section: backend API helpers (JSON POST helper and background file-list refresh).

// POST a JSON payload to a URL and return the parsed JSON response, throwing on a non-OK status.
async function callJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({}));
    throw new Error(details.detail || `Request failed (${response.status})`);
  }
  return response.json();
}

// Reload the uploaded-files history list in the background, ignoring errors (non-critical refresh).
async function refreshUploadedFilesSilently() {
  try {
    const response = await fetch("/api/files");
    if (!response.ok) return;
    const data = await response.json();
    renderHistory(data.files || []);
  } catch {
    // no-op: this is a background refresh, surfaced errors would be noisy
  }
}

// Section: file history panel (list, selection, delete confirmation).

// Build the download URL for a history entry's export in a given format (optionally verbatim).
function buildHistoryDownloadUrl(stem, format, verbatim) {
  const params = new URLSearchParams({ stem, format });
  if (verbatim) params.set("verbatim", "true");
  return `/api/history/download?${params.toString()}`;
}

// Return the stems (file identifiers) of all checked history rows.
function getSelectedHistoryStems() {
  return Array.from(refs.historyList.querySelectorAll(".history-select:checked")).map((input) => input.value);
}

// Update bulk-action controls (delete button, select-all checkbox) based on the current history
// checkbox selection.
function syncHistorySelectionState() {
  const checkboxes = Array.from(refs.historyList.querySelectorAll(".history-select"));
  const selectedCount = checkboxes.filter((input) => input.checked).length;
  refs.deleteHistoryBtn.disabled = selectedCount === 0;
  refs.deleteHistoryBtn.setAttribute("aria-disabled", selectedCount === 0 ? "true" : "false");
  refs.selectAllHistory.disabled = checkboxes.length === 0;
  refs.selectAllHistory.checked = checkboxes.length > 0 && selectedCount === checkboxes.length;
  refs.selectAllHistory.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
  refs.historyBulkActions.hidden = selectedCount === 0;
}

// Enter or exit history multi-select mode, clearing checkboxes when exiting.
function setHistorySelectionMode(active) {
  historySelectionMode = active;
  refs.historyList.classList.toggle("selecting", active);
  refs.toggleHistorySelectBtn.textContent = active ? "Cancel" : "Select";
  refs.toggleHistorySelectBtn.setAttribute("aria-pressed", String(active));
  if (!active) {
    refs.historyList.querySelectorAll(".history-select").forEach((input) => {
      input.checked = false;
    });
  }
  syncHistorySelectionState();
}

// Toggle history multi-select mode on/off.
function toggleHistorySelectionMode() {
  setHistorySelectionMode(!historySelectionMode);
}

// Render the file history list (rows with select/use/download/delete controls) from server entries.
function renderHistory(entries) {
  historyEntries = Array.isArray(entries) ? entries : [];
  if (selectedUploadName && !historyEntries.some((entry) => entry.audio_name === selectedUploadName)) {
    selectedUploadName = null;
    syncAudioDropHint();
  }

  refs.historyList.replaceChildren();
  if (!historyEntries.length) {
    const empty = document.createElement("p");
    empty.className = "upload-empty";
    empty.textContent = "No files found.";
    refs.historyList.append(empty);
    syncHistorySelectionState();
    return;
  }

  const running = latestState && latestState.status === "Running";
  const fragment = document.createDocumentFragment();
  historyEntries.forEach((entry) => {
    const row = document.createElement("article");
    row.className = "history-row";
    row.dataset.stem = entry.stem;
    row.dataset.audioName = entry.audio_name || "";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "history-select";
    checkbox.value = entry.stem;
    checkbox.setAttribute("aria-label", `Select ${entry.audio_name || entry.stem}`);

    const details = document.createElement("div");
    details.className = "history-details";
    const name = document.createElement("p");
    name.className = "history-file-name";
    name.textContent = entry.audio_name || entry.stem;

    const metaRow = document.createElement("div");
    metaRow.className = "history-meta-row";
    const meta = document.createElement("span");
    meta.className = "history-file-meta";
    meta.textContent =
      entry.size != null ? `${formatBytes(entry.size)} | ${formatDateTime(entry.created_at)}` : formatDateTime(entry.created_at);
    const tag = document.createElement("span");
    tag.className = `history-tag ${entry.transcribed ? "done" : "pending"}`;
    tag.textContent = entry.transcribed ? "Transcribed" : "Not transcribed";
    metaRow.append(meta, tag);
    details.append(name, metaRow);

    const actions = document.createElement("div");
    actions.className = "history-row-actions";

    if (entry.audio_name) {
      const useButton = document.createElement("button");
      useButton.type = "button";
      useButton.className = "history-use-btn";
      useButton.dataset.action = "select-upload";
      useButton.dataset.fileName = entry.audio_name;
      useButton.textContent = entry.audio_name === selectedUploadName ? "Selected" : "Use";
      useButton.disabled = Boolean(running);
      actions.append(useButton);
    }

    if (entry.transcribed) {
      const hasVerbatim = Boolean(entry.verbatim_formats && entry.verbatim_formats.length);
      let verbatimToggle = null;
      if (hasVerbatim) {
        const toggleLabel = document.createElement("label");
        toggleLabel.className = "history-verbatim-toggle";
        verbatimToggle = document.createElement("input");
        verbatimToggle.type = "checkbox";
        const toggleText = document.createElement("span");
        toggleText.textContent = "Verbatim";
        toggleLabel.append(verbatimToggle, toggleText);
        actions.append(toggleLabel);
      }

      const downloadGroup = document.createElement("div");
      downloadGroup.className = "history-download-group";
      ["pdf", "docx", "json"].forEach((format) => {
        const link = document.createElement("a");
        link.className = "download";
        link.textContent = HISTORY_FORMAT_LABELS[format];

        // Refresh this format's link availability/URL based on the verbatim toggle.
        const updateLink = () => {
          const verbatim = Boolean(verbatimToggle && verbatimToggle.checked);
          const available = verbatim ? entry.verbatim_formats : entry.formats;
          setDownloadState(link, available && available.includes(format) ? buildHistoryDownloadUrl(entry.stem, format, verbatim) : null);
        };
        updateLink();
        if (verbatimToggle) verbatimToggle.addEventListener("change", updateLink);
        downloadGroup.append(link);
      });
      actions.append(downloadGroup);
    }

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "danger";
    deleteBtn.dataset.action = "delete-history";
    deleteBtn.dataset.stem = entry.stem;
    deleteBtn.textContent = "Delete";

    row.append(checkbox, details, actions, deleteBtn);
    fragment.append(row);
  });
  refs.historyList.append(fragment);
  syncHistorySelectionState();
}

// Fetch the uploaded files list from the server and render it into the history panel.
async function loadHistory() {
  try {
    refs.noticeText.textContent = "Refreshing files.";
    const response = await fetch("/api/files");
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      throw new Error(details.detail || `Request failed (${response.status})`);
    }
    const data = await response.json();
    renderHistory(data.files || []);
    refs.noticeText.textContent = `Loaded ${(data.files || []).length} file(s).`;
  } catch (error) {
    refs.noticeText.textContent = String(error.message || error);
  }
}

// Show the history panel (loading its contents) or hide it if already open.
async function toggleHistoryPanel() {
  if (refs.historyPanel.hidden) {
    refs.historyPanel.hidden = false;
    await loadHistory();
    refs.refreshHistoryBtn.focus();
  } else {
    closeHistoryPanel();
  }
}

// Hide the history panel and reset its transient UI state (selection mode, delete popup).
function closeHistoryPanel() {
  hideHistoryDeleteConfirm();
  setHistorySelectionMode(false);
  refs.historyPanel.hidden = true;
  refs.showHistoryBtn.focus();
}

// Enable the confirm-delete button only when at least one deletion option (audio/transcripts) is checked.
function updateDeleteConfirmActionable() {
  const audioChecked = !refs.deleteAudioOption.hidden && refs.deleteAudioCheckbox.checked;
  const transcriptsChecked = !refs.deleteTranscriptsOption.hidden && refs.deleteTranscriptsCheckbox.checked;
  refs.confirmHistoryDeleteBtn.disabled = !audioChecked && !transcriptsChecked;
}

// Open the delete-confirmation popup for the given history stems, showing which delete
// options (audio/transcripts) apply based on the selected entries.
function showHistoryDeleteConfirm(stems) {
  if (!stems || !stems.length) return;
  pendingDeleteHistoryStems = stems;
  const selectedEntries = stems.map((stem) => historyEntries.find((item) => item.stem === stem)).filter(Boolean);
  const anyHasAudio = selectedEntries.some((entry) => entry.audio_name);
  const anyTranscribed = selectedEntries.some((entry) => entry.transcribed);

  refs.deleteAudioOption.hidden = !anyHasAudio;
  refs.deleteAudioCheckbox.checked = true;
  refs.deleteTranscriptsOption.hidden = !anyTranscribed;
  refs.deleteTranscriptsCheckbox.checked = true;
  updateDeleteConfirmActionable();

  if (stems.length === 1) {
    const label = (selectedEntries[0] && (selectedEntries[0].audio_name || selectedEntries[0].stem)) || stems[0];
    refs.historyDeleteConfirmMessage.textContent = `Delete "${label}"? Choose what to remove below. This cannot be undone.`;
  } else {
    refs.historyDeleteConfirmMessage.textContent = `Delete ${stems.length} selected file(s)? Choose what to remove below. This cannot be undone.`;
  }
  refs.historyDeleteConfirmPopup.hidden = false;
  refs.confirmHistoryDeleteBtn.focus();
}

// Close the delete-confirmation popup and clear the pending deletion list.
function hideHistoryDeleteConfirm() {
  pendingDeleteHistoryStems = [];
  refs.historyDeleteConfirmPopup.hidden = true;
}

// Open the delete-confirmation popup for the currently checked history rows.
function requestDeleteSelectedHistory() {
  const stems = getSelectedHistoryStems();
  if (!stems.length) return;
  showHistoryDeleteConfirm(stems);
}

// Send the delete request for the pending history stems, refresh the history list, and
// refresh the current run state if the active audio file was among those deleted.
async function deleteSelectedHistory() {
  const stems = pendingDeleteHistoryStems.slice();
  if (!stems.length) return;
  const deleteAudio = !refs.deleteAudioOption.hidden && refs.deleteAudioCheckbox.checked;
  const deleteTranscripts = !refs.deleteTranscriptsOption.hidden && refs.deleteTranscriptsCheckbox.checked;
  if (!deleteAudio && !deleteTranscripts) return;
  hideHistoryDeleteConfirm();
  try {
    const data = await callJson("/api/history/delete", { stems, delete_audio: deleteAudio, delete_transcripts: deleteTranscripts });
    renderHistory(data.files || []);
    refs.noticeText.textContent =
      data.deleted_stems && data.deleted_stems.length
        ? `Deleted ${data.deleted_stems.length} file(s).`
        : "No files deleted.";
    const deletedStems = data.deleted_stems || [];
    const activeStem = latestState && latestState.active_audio_name ? latestState.active_audio_name.replace(/\.[^./]+$/, "") : null;
    if (activeStem && deletedStems.includes(activeStem)) {
      // The file backing the active run was deleted; re-pull server state to reflect that.
      const stateResponse = await fetch("/api/state");
      if (stateResponse.ok) renderState(await stateResponse.json());
    }
  } catch (error) {
    refs.noticeText.textContent = String(error.message || error);
  }
}

// Section: run actions (submit, clear, bundle, lookup, copy).

// Handle the run form submission: transcribe a freshly chosen file or reuse a previously
// selected upload, then render the resulting state.
async function submitRun(event) {
  event.preventDefault();
  const file = refs.audioFileInput.files[0];
  if (!file && !selectedUploadName) {
    refs.noticeText.textContent = "Select an audio file first.";
    return;
  }

  const language = getSelectedLanguage();

  try {
    let state;
    if (selectedUploadName) {
      state = await callJson("/api/transcribe-existing", { file_name: selectedUploadName, language });
    } else {
      const data = new FormData();
      data.append("audio_file", file);
      if (language) data.append("language", language);
      const response = await fetch("/api/transcribe", { method: "POST", body: data });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        throw new Error(details.detail || `Request failed (${response.status})`);
      }
      state = await response.json();
    }
    renderState(state);
    await refreshUploadedFilesSilently();
  } catch (error) {
    refs.noticeText.textContent = String(error.message || error);
  }
}

// Reset the current run/state on the server and clear related UI (selection, lookup output).
async function clearRun() {
  try {
    const state = await callJson("/api/clear", {});
    clearSelectedUpload();
    refs.audioFileInput.value = "";
    refs.lookupOutput.textContent = "";
    renderState(state);
  } catch (error) {
    refs.noticeText.textContent = String(error.message || error);
  }
}

// Ask the server to build a downloadable ZIP bundle of the current run's exports.
async function buildBundle() {
  try {
    await callJson("/api/bundle", { language: getSelectedLanguage() });
    if (latestState) {
      latestState.bundle_output = "ready";
      renderState(latestState);
    }
    refs.noticeText.textContent = "Bundle ready for download.";
  } catch (error) {
    refs.noticeText.textContent = String(error.message || error);
  }
}

// Send a lookup query (with selected language) to the server and display the result.
async function runLookup() {
  try {
    const payload = { query: refs.lookupInput.value || "", language: getSelectedLanguage() };
    const response = await callJson("/api/lookup", payload);
    refs.lookupOutput.textContent = response.result || "";
  } catch (error) {
    refs.lookupOutput.textContent = String(error.message || error);
  }
}

// Copy the transcript text to the clipboard and show a brief confirmation toast.
async function copyTranscript() {
  try {
    await navigator.clipboard.writeText(refs.transcriptOutput.value || "");
    refs.copyToast.textContent = "Transcript copied.";
  } catch {
    refs.copyToast.textContent = "Copy failed.";
  }
  refs.copyToast.classList.add("show");
  setTimeout(() => refs.copyToast.classList.remove("show"), 1600);
}

// Expand or collapse the platform highlights pill list.
function togglePlatformMeta() {
  const expanded = refs.togglePlatformMetaBtn.getAttribute("aria-expanded") === "true";
  const next = !expanded;
  refs.togglePlatformMetaBtn.setAttribute("aria-expanded", String(next));
  refs.togglePlatformMetaBtn.setAttribute("aria-label", next ? "Collapse platform highlights" : "Expand platform highlights");
  refs.togglePlatformMetaBtn.title = next ? "Collapse" : "Expand";
  refs.platformMetaPills.hidden = !next;
}

// Switch the active tab button/panel to the given tab name.
function activateTab(tabName) {
  refs.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });
  refs.tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${tabName}`);
  });
  resizeResultOutputs();
}

// Section: websocket handling for live run-state updates.

// Open the websocket connection for live state updates, and automatically reconnect on close.
function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  setConnectionState("connecting");
  socket = new WebSocket(`${protocol}://${window.location.host}/ws/state`);

  socket.onopen = () => {
    setConnectionState("connected");
  };

  socket.onmessage = (event) => {
    const state = JSON.parse(event.data);
    renderState(state);
  };

  socket.onerror = () => {
    setConnectionState("disconnected");
  };

  socket.onclose = () => {
    setConnectionState("disconnected");
    // Retry the connection after a short delay rather than giving up permanently.
    setTimeout(connectWebSocket, 1400);
  };
}

// Load the initial run state and file history when the page first loads.
async function initialLoad() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) return;
    const state = await response.json();
    renderState(state);
  } catch {
    // no-op
  }
  await refreshUploadedFilesSilently();
}

// Section: wire up all event listeners for controls, panels, and modals.
refs.runForm.addEventListener("submit", submitRun);
refs.clearBtn.addEventListener("click", clearRun);
refs.bundleBtn.addEventListener("click", buildBundle);
refs.lookupBtn.addEventListener("click", runLookup);
refs.showHistoryBtn.addEventListener("click", toggleHistoryPanel);
refs.toggleHistorySelectBtn.addEventListener("click", toggleHistorySelectionMode);
refs.closeHistoryBtn.addEventListener("click", closeHistoryPanel);
// Close the history panel when clicking its backdrop; handle the refresh button via delegation.
refs.historyPanel.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target === refs.historyPanel) {
    closeHistoryPanel();
    return;
  }
  const refreshButton = event.target.closest("#refreshHistoryBtn");
  if (refreshButton) {
    event.preventDefault();
    loadHistory();
  }
});
// Delegate clicks within the history list to the "use" / "delete" row actions.
refs.historyList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const useButton = event.target.closest("[data-action='select-upload']");
  if (useButton) {
    selectUploadedFile(useButton.dataset.fileName || "");
    return;
  }
  const deleteButton = event.target.closest("[data-action='delete-history']");
  if (deleteButton) showHistoryDeleteConfirm([deleteButton.dataset.stem || ""].filter(Boolean));
});
refs.historyList.addEventListener("change", (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.classList.contains("history-select")) syncHistorySelectionState();
});
refs.selectAllHistory.addEventListener("change", () => {
  refs.historyList.querySelectorAll(".history-select").forEach((input) => {
    input.checked = refs.selectAllHistory.checked;
  });
  syncHistorySelectionState();
});
refs.deleteHistoryBtn.addEventListener("click", () => {
  if (!refs.deleteHistoryBtn.disabled) requestDeleteSelectedHistory();
});
refs.deleteAudioCheckbox.addEventListener("change", updateDeleteConfirmActionable);
refs.deleteTranscriptsCheckbox.addEventListener("change", updateDeleteConfirmActionable);
refs.cancelHistoryDeleteBtn.addEventListener("click", hideHistoryDeleteConfirm);
refs.confirmHistoryDeleteBtn.addEventListener("click", deleteSelectedHistory);
// Escape closes the delete-confirmation popup, or the history panel if that's open instead.
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!refs.historyDeleteConfirmPopup.hidden) {
    hideHistoryDeleteConfirm();
    return;
  }
  if (!refs.historyPanel.hidden) {
    closeHistoryPanel();
  }
});
// Submit the lookup query when pressing Enter in the lookup input.
refs.lookupInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    runLookup();
  }
});
refs.copyTranscriptBtn.addEventListener("click", copyTranscript);
refs.toggleVerbatimBtn.addEventListener("click", toggleVerbatimTranscriptView);
refs.languageSelect.addEventListener("change", () => {
  if (latestState) renderState(latestState);
});
// If the bundle hasn't been built yet, clicking the link builds it instead of navigating.
refs.artifactDownloadLink.addEventListener("click", (event) => {
  if (refs.artifactDownloadLink.dataset.mode === "build") {
    event.preventDefault();
    if (!refs.artifactDownloadLink.classList.contains("disabled")) buildBundle();
  }
});
refs.artifactSelect.addEventListener("change", () => {
  const running = latestState && latestState.status === "Running";
  renderArtifactSelection(Boolean(running));
});
refs.artifactVerbatimToggle.addEventListener("change", () => {
  const running = latestState && latestState.status === "Running";
  renderArtifactSelection(Boolean(running));
});
refs.tabButtons.forEach((button) => {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
});
refs.togglePlatformMetaBtn.addEventListener("click", togglePlatformMeta);
window.addEventListener("resize", resizeResultOutputs);

// Kick off the app: wire the drop zone, load initial state/history, then open the websocket.
setupAudioDropZone();
initialLoad();
connectWebSocket();
