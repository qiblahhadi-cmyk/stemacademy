/**
 * STEM Academy - Assessments Module Controller
 * Manages quizzes, exams, grading tables, and score entries.
 */

class AssessmentsController {
  constructor() {
    this.assessmentsList = [];
    this.init();
  }

  async init() {
    this.bindEvents();
    if (document.getElementById('assessments-container') || document.getElementById('assessments-table-body')) {
      await this.loadAssessments();
    }

    window.addEventListener('moduleChanged', async (e) => {
      if (e.detail.module === 'assessments') {
        await this.loadAssessments();
      }
    });
  }

  bindEvents() {
    const createForm = document.getElementById('assessment-create-form');
    if (createForm) {
      createForm.addEventListener('submit', (e) => this.handleCreateAssessment(e));
    }

    const searchInput = document.getElementById('assessments-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.filterAssessments(e.target.value));
    }

    document.addEventListener('click', async (e) => {
      if (e.target.matches('.delete-assessment-btn, .delete-assessment-btn *')) {
        const btn = e.target.closest('.delete-assessment-btn');
        const id = btn?.getAttribute('data-id');
        if (id && confirm('Are you sure you want to delete this assessment?')) {
          await this.deleteAssessment(id);
        }
      }
    });
  }

  showSpinner(show = true) {
    const spinner = document.getElementById('assessments-spinner');
    if (spinner) {
      spinner.classList.toggle('hidden', !show);
    }
  }

  async loadAssessments() {
    this.showSpinner(true);
    try {
      const response = await window.StemApp.apiFetch('/api/v1/assessments');
      this.assessmentsList = response.data || [];
      this.renderAssessmentsTable(this.assessmentsList);
    } catch (error) {
      console.error('Failed to load assessments:', error);
    } finally {
      this.showSpinner(false);
    }
  }

  renderAssessmentsTable(assessments) {
    const tbody = document.getElementById('assessments-table-body');
    if (!tbody) return;

    if (assessments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No assessments found.</td></tr>`;
      return;
    }

    tbody.innerHTML = assessments.map(ast => `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${ast.title}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 uppercase">${ast.type}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${ast.classId}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${ast.date}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${ast.totalMarks || 100}</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
          <button class="text-red-600 hover:text-red-900 delete-assessment-btn" data-id="${ast.id}">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  filterAssessments(query) {
    const q = query.toLowerCase();
    const filtered = this.assessmentsList.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q) ||
      item.classId.toLowerCase().includes(q)
    );
    this.renderAssessmentsTable(filtered);
  }

  async handleCreateAssessment(e) {
    e.preventDefault();
    const form = e.target;
    const title = form.querySelector('#assessment-title')?.value;
    const type = form.querySelector('#assessment-type')?.value;
    const classId = form.querySelector('#assessment-class-id')?.value;
    const date = form.querySelector('#assessment-date')?.value;
    const totalMarks = Number(form.querySelector('#assessment-total-marks')?.value || 100);

    if (!title || !type || !classId || !date) {
      window.StemApp.showErrorPopup('Title, Type, Class ID, and Date are required.');
      return;
    }

    this.showSpinner(true);
    try {
      await window.StemApp.apiFetch('/api/v1/assessments', {
        method: 'POST',
        body: JSON.stringify({ title, type, classId, date, totalMarks })
      });

      form.reset();
      await this.loadAssessments();
      window.StemApp.showErrorPopup('Assessment created successfully.');
    } catch (error) {
      console.error('Failed to create assessment:', error);
    } finally {
      this.showSpinner(false);
    }
  }

  async deleteAssessment(id) {
    this.showSpinner(true);
    try {
      await window.StemApp.apiFetch(`/api/v1/assessments/${id}`, {
        method: 'DELETE'
      });
      await this.loadAssessments();
    } catch (error) {
      console.error('Failed to delete assessment:', error);
    } finally {
      this.showSpinner(false);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.AssessmentsModule = new AssessmentsController();
});
