export class Dashboard {
  constructor(projectManager, ui) {
    this.projectManager = projectManager;
    this.ui = ui;
  }

  async refresh(handlers) {
    const cards = await this.projectManager.listProjectCards();
    this.ui.renderProjectCards(cards, handlers);
  }
}
