import { STEPS } from "./constants.js";

export class UI {
  constructor() {
    this.dashboard = document.getElementById("dashboard");
    this.sequencer = document.getElementById("sequencerScreen");
    this.audioEditor = document.getElementById("audioEditorScreen");
    this.themeScreen = document.getElementById("themeScreen");
    this.projectCards = document.getElementById("projectCards");
    this.recRows = document.getElementById("recRows");
    this.presetRows = document.getElementById("presetRows");
    this.timer = document.getElementById("transportTimer");
    this.statusLog = document.getElementById("statusLog");
  }

  showDashboard() { this.dashboard.hidden = false; this.sequencer.hidden = true; this.audioEditor.hidden = true; this.themeScreen.hidden = true; }
  showSequencer() { this.dashboard.hidden = true; this.sequencer.hidden = false; this.audioEditor.hidden = true; this.themeScreen.hidden = true; }
  showAudioEditor() { this.dashboard.hidden = true; this.sequencer.hidden = true; this.audioEditor.hidden = false; this.themeScreen.hidden = true; }
  showThemeScreen() { this.dashboard.hidden = true; this.sequencer.hidden = true; this.audioEditor.hidden = true; this.themeScreen.hidden = false; }

  renderProjectCards(cards, handlers) {
    this.projectCards.innerHTML = "";
    cards.forEach((card) => {
      const el = document.createElement("article");
      el.className = "project-card";

      const title = document.createElement("h3");
      title.textContent = card.name;
      title.title = card.name;
      const bpm = document.createElement("p");
      bpm.textContent = `BPM ${card.bpm}`;
      const rows = document.createElement("p");
      rows.textContent = `Rows ${card.row_count} · Master ${card.has_master ? "Yes" : "No"}`;
      const created = document.createElement("p");
      created.textContent = `Created ${card.created || "-"}`;
      const modified = document.createElement("p");
      modified.textContent = `Modified ${card.modified || "-"}`;
      const actions = document.createElement("div");

      const openBtn = document.createElement("button");
      openBtn.textContent = "Open";
      openBtn.onclick = () => handlers.open(card.name);
      const renameBtn = document.createElement("button");
      renameBtn.textContent = "Rename";
      renameBtn.onclick = () => handlers.rename(card.name);
      const duplicateBtn = document.createElement("button");
      duplicateBtn.textContent = "Duplicate";
      duplicateBtn.onclick = () => handlers.duplicate(card.name);
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Delete";
      deleteBtn.onclick = () => handlers.delete(card.name);

      actions.append(openBtn, renameBtn, duplicateBtn, deleteBtn);
      el.append(title, bpm, rows, created, modified, actions);
      this.projectCards.appendChild(el);
    });
  }

  renderLayoutSuggestions(suggestions, onSelect) {
    const host = document.getElementById("layoutSuggestions");
    if (!host) return;
    host.innerHTML = "";
    suggestions.forEach((item) => {
      const card = document.createElement("article");
      card.className = "layout-card";
      const title = document.createElement("h4");
      title.textContent = item.name;
      const description = document.createElement("p");
      description.textContent = item.description;
      const tracks = document.createElement("small");
      tracks.textContent = item.tracks.join(" · ");
      const button = document.createElement("button");
      button.textContent = "Generate & Auto-Apply";
      button.onclick = () => onSelect(item.id);
      card.append(title, description, tracks, button);
      host.appendChild(card);
    });
  }

  renderRows(rows, container, type, opts = {}) {
    const invokeCallback = (callback, ...args) => {
      try {
        const result = callback?.(...args);
        if (result && typeof result.then === "function") {
          result.catch((err) => {
            console.error("UI callback async error:", err);
          });
        }
      } catch (err) {
        console.error("UI callback sync error:", err);
      }
    };

    container.innerHTML = "";
    rows.forEach((row, rowIndex) => {
      const wrap = document.createElement("div");
      wrap.className = "seq-row";
      const controls = document.createElement("div");
      controls.className = `row-controls ${type === "rec" ? "rec-strip" : "preset-strip"}`;
      controls.innerHTML = `<button data-del title='Delete Row'>−</button>${type === "rec" ? "<button data-rec title='Record Row'>REC</button>" : ""}<input data-vol type='range' min='0' max='1' step='0.01' value='${row.volume}' title='Volume' /><button data-mute>${row.mute ? "Unmute" : "Mute"}</button>${type === "preset" ? "<select data-sound></select>" : ""}`;
      wrap.appendChild(controls);
      const steps = document.createElement("div");
      steps.className = "steps";
      row.steps.forEach((active, stepIndex) => {
        const b = document.createElement("button");
        b.className = `step ${active ? "on" : ""}`;
        b.textContent = String(stepIndex + 1);
        b.onclick = () => invokeCallback(opts.onStep, type, rowIndex, stepIndex);
        steps.appendChild(b);
      });
      wrap.appendChild(steps);

      controls.querySelector("[data-del]").onclick = () => invokeCallback(opts.onDelete, type, rowIndex);
      controls.querySelector("[data-vol]").oninput = (e) => invokeCallback(opts.onVolume, type, rowIndex, Number(e.target.value));
      controls.querySelector("[data-mute]").onclick = () => invokeCallback(opts.onMute, type, rowIndex);
      if (type === "rec") {
        const recBtn = controls.querySelector("[data-rec]");
        recBtn.textContent = opts.recordingRow === rowIndex ? "STOP REC" : "REC";
        recBtn.disabled = Boolean(opts.lockRec) || (opts.recordingRow !== null && opts.recordingRow !== rowIndex);
        recBtn.onclick = () => invokeCallback(opts.onRec, rowIndex);
      }
      if (type === "preset") {
        const select = controls.querySelector("[data-sound]");
        (opts.samples ?? []).forEach((sample) => {
          const option = document.createElement("option");
          option.value = sample;
          const rawName = sample.split(/[\\/]/).pop() ?? sample;
          const noExt = rawName.replace(/\.wav$/i, "");
          option.textContent = noExt.length > 20 ? `${noExt.slice(0, 17)}...` : noExt;
          option.title = noExt;
          select.appendChild(option);
        });
        select.value = row.sound ?? "";
        select.onchange = (e) => invokeCallback(opts.onSound, rowIndex, e.target.value);
        select.disabled = Boolean(opts.lockSoundChange);
      }
      container.appendChild(wrap);
    });
  }

  highlightStep(step) {
    document.querySelectorAll(".step").forEach((el, i) => {
      const inCol = (i % STEPS) === step;
      el.classList.toggle("playing", inCol);
    });
  }

  setTimer(seconds) {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    this.timer.textContent = `${mm}:${ss}`;
  }

  log(message) {
    const now = new Date().toLocaleTimeString();
    this.statusLog.textContent = `[${now}] ${message}\n${this.statusLog.textContent}`;
  }
}
