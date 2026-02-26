export class UI {
  constructor() {
    this.grid = document.getElementById("grid");
    this.template = document.getElementById("cellTemplate");
    this.statusLog = document.getElementById("statusLog");
    this.peakMeter = document.getElementById("peakMeter");
    this.cells = [];

    for (let i = 0; i < 9; i += 1) {
      const fragment = this.template.content.cloneNode(true);
      const button = fragment.querySelector(".cell");
      button.dataset.index = String(i);
      button.querySelector(".cell-label").textContent = `Cell ${i + 1}`;
      this.grid.appendChild(fragment);
      this.cells.push(this.grid.lastElementChild);
    }
  }

  bindCellClick(handler) {
    this.cells.forEach((cell) => {
      cell.addEventListener("click", () => {
        handler(Number(cell.dataset.index));
      });
    });
  }

  setCellState(index, { hasSample = false, text = "Empty", recording = false, playing = false }) {
    const cell = this.cells[index];
    if (!cell) return;
    cell.classList.toggle("has-sample", hasSample);
    cell.classList.toggle("recording", recording);
    cell.classList.toggle("cell-playing", playing);
    cell.querySelector(".cell-state").textContent = text;
  }

  highlightColumn(column) {
    this.cells.forEach((cell, index) => {
      const c = index % 3;
      cell.classList.toggle("active-step", c === column);
    });
  }

  updatePeak(value) {
    this.peakMeter.style.width = `${Math.round(value * 100)}%`;
  }

  log(message) {
    const now = new Date().toLocaleTimeString();
    this.statusLog.textContent = `[${now}] ${message}\n${this.statusLog.textContent}`;
  }

  setProjectOptions(projects) {
    const select = document.getElementById("projectSelect");
    select.innerHTML = "";
    projects.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
  }
}
