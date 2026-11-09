/**
 * STEM Academy - Attendance Module Controller
 * Manages daily attendance tracking, roster rendering, and attendance submission.
 */

class AttendanceController {
  constructor() {
    this.attendanceList = [];
    this.classesList = [];
    this.init();
  }

  async init() {
    this.bindEvents();
    if (document.getElementById('attendance-container') || document.getElementById('attendance-table-body')) {
      await this.loadAttendanceData();
    }

    // Listen for global module switch events to refresh view if needed
    window.addEventListener('moduleChanged', async (e) => {
      if (e.detail.module === 'attendance') {
        await this.loadAttendanceData();
      }
    });
  }

  bindEvents() {
    const createForm = document.getElementById('attendance-create-form');
    if (createForm) {
      createForm.addEventListener('submit', (e) => this.handleCreateAttendance(e));
    }

    const searchInput = document.getElementById('attendance-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.filterAttendance(e.target.value));
    }

    // Event delegation for table actions (View, Edit, Delete)
    document.addEventListener('click', async (e) => {
      if (e.target.matches('.delete-attendance-btn, .delete-attendance-btn *')) {
        const btn = e.target.closest('.delete-attendance-btn');
        const recordId = btn?.getAttribute('data-id');
        if (recordId && confirm('Are you sure you want to delete this attendance record?')) {
          await this.deleteAttendance(recordId);
        }
      }
    });
  }

  showSpinner(show = true) {
    const spinner = document.getElementById('attendance-spinner');
    if (spinner) {
      spinner.classList.toggle('hidden', !show);
    }
  }

  async loadAttendanceData() {
    this.showSpinner(true);
    try {
      const response = await window.StemApp.apiFetch('/api/v1/attendance');
      this.attendanceList = response.data || [];
      this.renderAttendanceTable(this.attendanceList);
    } catch (error) {
      console.error('Failed to load attendance records:', error);
      window.StemApp.showErrorPopup('Failed to load attendance data.');
    } finally {
      this.showSpinner(false);
    }
  }

  renderAttendanceTable(records) {
    const tbody = document.getElementById('attendance-table-body');
    if (!tbody) return;

    if (records.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-4 text-center text-gray-500">No attendance records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = records.map(record => {
      const presentCount = (record.records || []).filter(r => r.status === 'present').length;
      const totalCount = (record.records || []).length;
      return `
        <tr class="hover:bg-gray-50 transition-colors">
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${record.id}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${record.classId}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${record.date}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">${presentCount} / ${totalCount} Present</td>
          <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
            <button class="text-red-600 hover:text-red-900 delete-attendance-btn" data-id="${record.id}">Delete</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  filterAttendance(query) {
    const q = query.toLowerCase();
    const filtered = this.attendanceList.filter(item => 
      item.classId.toLowerCase().includes(q) || 
      item.date.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q)
    );
    this.renderAttendanceTable(filtered);
  }

  async handleCreateAttendance(e) {
    e.preventDefault();
    const form = e.target;
    const classId = form.querySelector('#attendance-class-id')?.value;
    const date = form.querySelector('#attendance-date')?.value;

    if (!classId || !date) {
      window.StemApp.showErrorPopup('Class ID and Date are required.');
      return;
    }

    // Collect dynamic student attendance rows if present in form
    const records = [];
    form.querySelectorAll('.student-attendance-row').forEach(row => {
      const studentId = row.getAttribute('data-student-id');
      const statusSelect = row.querySelector('.student-status-select');
      if (studentId) {
        records.push({
          studentId,
          status: statusSelect ? statusSelect.value : 'present'
        });
      }
    });

    this.showSpinner(true);
    try {
      await window.StemApp.apiFetch('/api/v1/attendance', {
        method: 'POST',
        body: JSON.stringify({ classId, date, records })
      });

      form.reset();
      await this.loadAttendanceData();
      window.StemApp.showErrorPopup('Attendance marked successfully.'); // Or success toast
    } catch (error) {
      console.error('Failed to create attendance:', error);
    } finally {
      this.showSpinner(false);
    }
  }

  async deleteAttendance(id) {
    this.showSpinner(true);
    try {
      await window.StemApp.apiFetch(`/api/v1/attendance/${id}`, {
        method: 'DELETE'
      });
      await this.loadAttendanceData();
    } catch (error) {
      console.error('Failed to delete attendance record:', error);
    } finally {
      this.showSpinner(false);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.AttendanceModule = new AttendanceController();
});
