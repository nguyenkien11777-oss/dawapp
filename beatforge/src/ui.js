import { STEPS } from "./constants.js";

export class UI {
  constructor() {
    this.dashboard = document.getElementById("dashboard");
    this.sequencer = document.getElementById("sequencerScreen");
    this.projectCards = document.getElementById("projectCards");
    this.recRows = document.getElementById("recRows");
    this.presetRows = document.getElementById("presetRows");
    this.timer = document.getElementById("transportTimer");
    this.statusLog = document.getElementById("statusLog");
  }

  showDashboard() { this.dashboard.hidden = false; this.sequencer.hidden = true; }
  showSequencer() { this.dashboard.hidden = true; this.sequencer.hidden = false; }

  renderProjectCards(cards, handlers) {
    this.projectCards.innerHTML = "";
    cards.forEach((card) => {
      const el = document.createElement("article");
      el.className = "project-card";
      el.innerHTML = `<h3>${card.name}</h3><p>BPM ${card.bpm} · ${card.subdivision}</p><p>Rows ${card.row_count} · Master ${card.has_master ? "Yes" : "No"}</p><p>Created ${card.created || "-"}</p><p>Modified ${card.modified || "-"}</p>
      <div><button data-a='open'>Open</button><button data-a='rename'>Rename</button><button data-a='duplicate'>Duplicate</button><button data-a='delete'>Delete</button></div>`;
      el.querySelector("[data-a='open']").onclick = () => handlers.open(card.name);
      el.querySelector("[data-a='rename']").onclick = () => handlers.rename(card.name);
      el.querySelector("[data-a='duplicate']").onclick = () => handlers.duplicate(card.name);
      el.querySelector("[data-a='delete']").onclick = () => handlers.delete(card.name);
      this.projectCards.appendChild(el);
    });
  }

  renderRows(rows, container, type, opts = {}) {
    container.innerHTML = "";
    rows.forEach((row, rowIndex) => {
      const wrap = document.createElement("div");
      wrap.className = "seq-row";
      const controls = document.createElement("div");
      controls.className = "row-controls";
      controls.innerHTML = `<button data-del>-</button>${type === "rec" ? "<button data-rec>REC</button>" : ""}<input data-vol type='range' min='0' max='1' step='0.01' value='${row.volume}' /><button data-mute>${row.mute ? "Unmute" : "Mute"}</button>${type === "preset" ? "<select data-sound></select>" : ""}`;
      wrap.appendChild(controls);
      const steps = document.createElement("div");
      steps.className = "steps";
      row.steps.forEach((active, stepIndex) => {
        const b = document.createElement("button");
        b.className = `step ${active ? "on" : ""}`;
        b.textContent = String(stepIndex + 1);
        b.onclick = () => opts.onStep?.(type, rowIndex, stepIndex);
        steps.appendChild(b);
      });
      wrap.appendChild(steps);

      controls.querySelector("[data-del]").onclick = () => opts.onDelete?.(type, rowIndex);
      controls.querySelector("[data-vol]").oninput = (e) => opts.onVolume?.(type, rowIndex, Number(e.target.value));
      controls.querySelector("[data-mute]").onclick = () => opts.onMute?.(type, rowIndex);
      if (type === "rec") {
        const recBtn = controls.querySelector("[data-rec]");
        recBtn.textContent = opts.recordingRow === rowIndex ? "STOP REC" : "REC";
        recBtn.disabled = Boolean(opts.lockRec) || (opts.recordingRow !== null && opts.recordingRow !== rowIndex);
        recBtn.onclick = () => opts.onRec?.(rowIndex);
      }
      if (type === "preset") {
        const select = controls.querySelector("[data-sound]");
        (opts.samples ?? []).forEach((sample) => {
          const option = document.createElement("option");
          option.value = sample;
          option.textContent = sample.split(/[\\/]/).pop();
          select.appendChild(option);
        });
        select.value = row.sound ?? "";
        select.onchange = (e) => opts.onSound?.(rowIndex, e.target.value);
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
