/**
 * STEM Academy - Assignments Module Controller
 * Manages assignment lists, creation, and student submission workflows.
 */

class AssignmentsController {
  constructor() {
    this.assignmentsList = [];
    this.init();
  }

  async init() {
    this.bindEvents();
    if (document.getElementById('assignments-container') || document.getElementById('assignments-table-body')) {
      await this.loadAssignments();
    }

    window.addEventListener('moduleChanged', async (e) => {
      if (e.detail.module === 'assignments') {
        await this.loadAssignments();
      }
    });
  }

  bindEvents() {
    const createForm = document.getElementById('assignment-create-form');
    if (createForm) {
      createForm.addEventListener('submit', (e) => this.handleCreateAssignment(e));
    }

    const submitForm = document.getElementById('assignment-submit-form');
    if (submitForm) {
      submitForm.addEventListener('submit', (e) => this.handleSubmitAssignment(e));
    }

    const searchInput = document.getElementById('assignments-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.filterAssignments(e.target.value));
    }

    document.addEventListener('click', async (e) => {
      if (e.target.matches('.delete-assignment-btn, .delete-assignment-btn *')) {
        const btn = e.target.closest('.delete-assignment-btn');
        const id = btn?.getAttribute('data-id');
        if (id && confirm('Are you sure you want to delete this assignment?')) {
          await this.deleteAssignment(id);
        }
      }
    });
  }

  showSpinner(show = true) {
    const spinner = document.getElementById('assignments-spinner');
    if (spinner) {
      spinner.classList.toggle('hidden', !show);
    }
  }

  async loadAssignments() {
    this.showSpinner(true);
    try {
      const response = await window.StemApp.apiFetch('/api/v1/assignments');
      this.assignmentsList = response.data || [];
      this.renderAssignmentsTable(this.assignmentsList);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    } finally {
      this.showSpinner(false);
    }
  }

  renderAssignmentsTable(assignments) {
    const tbody = document.getElementById('assignments-table-body');
    if (!tbody) return;

    if (assignments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No assignments found.</td></tr>`;
      return;
    }

    tbody.innerHTML = assignments.map(asm => `
      <tr class="hover:bg-gray-50 transition-colors">
        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${asm.title}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${asm.classId}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${asm.dueDate}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${asm.maxPoints || 100}</td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${(asm.submissions || []).length} Submitted</td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
          <button class="text-primary-600 hover:text-primary-900 submit-modal-btn" data-id="${asm.id}">Submit</button>
          <button class="text-red-600 hover:text-red-900 delete-assignment-btn" data-id="${asm.id}">Delete</button>
        </td>
      </tr>
    `).join('');
  }

  filterAssignments(query) {
    const q = query.toLowerCase();
    const filtered = this.assignmentsList.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.classId.toLowerCase().includes(q)
    );
    this.renderAssignmentsTable(filtered);
  }

  async handleCreateAssignment(e) {
    e.preventDefault();
    const form = e.target;
    const title = form.querySelector('#assignment-title')?.value;
    const description = form.querySelector('#assignment-description')?.value;
    const classId = form.querySelector('#assignment-class-id')?.value;
    const dueDate = form.querySelector('#assignment-due-date')?.value;
    const maxPoints = Number(form.querySelector('#assignment-max-points')?.value || 100);

    if (!title || !classId || !dueDate) {
      window.StemApp.showErrorPopup('Title, Class ID, and Due Date are required.');
      return;
    }

    this.showSpinner(true);
    try {
      await window.StemApp.apiFetch('/api/v1/assignments', {
        method: 'POST',
        body: JSON.stringify({ title, description, classId, dueDate, maxPoints })
      });

      form.reset();
      await this.loadAssignments();
      window.StemApp.showErrorPopup('Assignment created successfully.');
    } catch (error) {
      console.error('Failed to create assignment:', error);
    } finally {
      this.showSpinner(false);
    }
  }

  async handleSubmitAssignment(e) {
    e.preventDefault();
    const form = e.target;
    const assignmentId = form.querySelector('#submit-assignment-id')?.value;
    const submissionUrl = form.querySelector('#submission-url')?.value;
    const notes = form.querySelector('#submission-notes')?.value;

    if (!assignmentId || !submissionUrl) {
      window.StemApp.showErrorPopup('Assignment ID and Submission URL are required.');
      return;
    }

    this.showSpinner(true);
    try {
      await window.StemApp.apiFetch(`/api/v1/assignments/${assignmentId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ submissionUrl, notes })
      });

      form.reset();
      window.StemApp.showErrorPopup('Assignment submitted successfully.');
    } catch (error) {
      console.error('Failed to submit assignment:', error);
    } finally {
      this.showSpinner(false);
    }
  }

  async deleteAssignment(id) {
    this.showSpinner(true);
    try {
      await window.StemApp.apiFetch(`/api/v1/assignments/${id}`, {
        method: 'DELETE'
      });
      await this.loadAssignments();
    } catch (error) {
      console.error('Failed to delete assignment:', error);
    } finally {
      this.showSpinner(false);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.AssignmentsModule = new AssignmentsController();
});
