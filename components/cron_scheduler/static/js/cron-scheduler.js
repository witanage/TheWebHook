class CronScheduler {
    constructor() {
        this.jobs = [];
        this.folders = [];
        this.currentFolder = 'all';
        this.currentJob = null;
        this.editingJobId = null;
        this.editingFolderId = null;
        this.eventSource = null;
    }
    
    init() {
        this.setupEventListeners();
        this.loadDashboard();
        this.loadFolders();
        this.loadJobs();
        this.setupSSE();
        this.initializeScheduleBuilder();
    }
    
    setupEventListeners() {
        // New job button
        document.getElementById('new-job-btn').addEventListener('click', () => this.openJobModal());
        
        // Save job button
        document.getElementById('save-job-btn').addEventListener('click', () => this.saveJob());
        
        // Test job button
        document.getElementById('test-job-btn').addEventListener('click', () => this.testJob());
        
        // Add folder button
        document.getElementById('add-folder-btn').addEventListener('click', () => this.openFolderModal());
        
        // Save folder button
        document.getElementById('save-folder-btn').addEventListener('click', () => this.saveFolder());
        
        // Search input
        document.getElementById('search-input').addEventListener('input', (e) => this.filterJobs(e.target.value));
        
        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modalOverlay = e.target.closest('.modal-overlay');
                modalOverlay.classList.remove('active');
                
                // Reset editing IDs when closing modals
                if (modalOverlay.id === 'job-modal') {
                    this.editingJobId = null;
                } else if (modalOverlay.id === 'folder-modal') {
                    this.editingFolderId = null;
                }
            });
        });
        
        // Tab switching
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });
        
        // Auth checkbox
        document.getElementById('job-auth-enabled').addEventListener('change', (e) => {
            document.getElementById('auth-fields').style.display = e.target.checked ? 'block' : 'none';
        });
        
        // Add header button
        document.getElementById('add-header-btn').addEventListener('click', () => this.addHeaderRow());
        
        // Schedule presets
        document.querySelectorAll('.preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.applySchedulePreset(e.target.dataset.preset));
        });
        
        // Schedule controls
        document.querySelectorAll('.toggle-all').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleScheduleAll(e.target.dataset.field, true));
        });
        
        document.querySelectorAll('.toggle-none').forEach(btn => {
            btn.addEventListener('click', (e) => this.toggleScheduleAll(e.target.dataset.field, false));
        });
    }
    
    setupSSE() {
        this.eventSource = new EventSource('/cron-scheduler/events');
        
        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleSSEEvent(data);
            } catch (e) {
                console.error('Error parsing SSE event:', e);
            }
        };
        
        this.eventSource.onerror = (error) => {
            console.error('SSE connection error:', error);
        };
    }
    
    handleSSEEvent(event) {
        const { type, data } = event;
        
        switch (type) {
            case 'job_failure':
                this.showToast(`Job "${data.title}" failed (${data.consecutive_failures} consecutive failures)`, 'error');
                this.loadJobs(); // Refresh job list
                this.loadDashboard();
                break;
            case 'job_recovered':
                this.showToast(`Job "${data.title}" recovered`, 'success');
                this.loadJobs();
                this.loadDashboard();
                break;
            case 'job_disabled':
                this.showToast(`Job "${data.title}" was auto-disabled after ${data.consecutive_failures} failures`, 'warning');
                this.loadJobs();
                this.loadDashboard();
                break;
        }
    }
    
    async loadDashboard() {
        try {
            const response = await fetch('/api/cron-scheduler/dashboard');
            const data = await response.json();
            
            document.getElementById('stat-total').textContent = data.total_jobs;
            document.getElementById('stat-active').textContent = data.active_jobs;
            document.getElementById('stat-failing').textContent = data.failing_jobs;
            document.getElementById('stat-executions').textContent = data.recent_executions;
        } catch (error) {
            console.error('Error loading dashboard:', error);
        }
    }
    
    async loadFolders() {
        try {
            const response = await fetch('/api/cron-scheduler/folders');
            const data = await response.json();
            this.folders = data.folders;
            this.renderFolders();
            this.populateFolderDropdown();
        } catch (error) {
            console.error('Error loading folders:', error);
        }
    }
    
    renderFolders() {
        const container = document.getElementById('folders-container');
        container.innerHTML = '';
        
        this.folders.forEach(folder => {
            const folderEl = document.createElement('div');
            folderEl.className = 'folder-item';
            folderEl.dataset.folderId = folder.id;
            folderEl.innerHTML = `
                <span class="folder-icon">📁</span>
                <span class="folder-name">${this.escapeHtml(folder.name)}</span>
                <span class="job-count" id="folder-${folder.id}-count">0</span>
                <div class="folder-actions">
                    <button class="btn-icon" onclick="cronScheduler.editFolder(${folder.id}, '${this.escapeHtml(folder.name)}')">✎</button>
                    <button class="btn-icon" onclick="cronScheduler.deleteFolder(${folder.id})">🗑</button>
                </div>
            `;
            folderEl.addEventListener('click', (e) => {
                if (!e.target.closest('.folder-actions')) {
                    this.selectFolder(folder.id);
                }
            });
            container.appendChild(folderEl);
        });
        
        // Update job counts
        this.updateFolderCounts();
    }
    
    updateFolderCounts() {
        const counts = { root: 0, all: this.jobs.length };
        
        this.jobs.forEach(job => {
            if (job.folder_id) {
                counts[job.folder_id] = (counts[job.folder_id] || 0) + 1;
            } else {
                counts.root++;
            }
        });
        
        document.getElementById('all-jobs-count').textContent = counts.all;
        document.getElementById('root-jobs-count').textContent = counts.root;
        
        this.folders.forEach(folder => {
            const el = document.getElementById(`folder-${folder.id}-count`);
            if (el) {
                el.textContent = counts[folder.id] || 0;
            }
        });
    }
    
    populateFolderDropdown() {
        const select = document.getElementById('job-folder');
        select.innerHTML = '<option value="">Root</option>';
        
        this.folders.forEach(folder => {
            const option = document.createElement('option');
            option.value = folder.id;
            option.textContent = folder.name;
            select.appendChild(option);
        });
    }
    
    selectFolder(folderId) {
        this.currentFolder = folderId;
        
        document.querySelectorAll('.folder-item').forEach(el => {
            el.classList.remove('active');
        });
        
        const selectedEl = document.querySelector(`.folder-item[data-folder-id="${folderId}"]`);
        if (selectedEl) {
            selectedEl.classList.add('active');
        }
        
        this.renderJobs();
    }
    
    async loadJobs() {
        try {
            const response = await fetch('/api/cron-scheduler/jobs');
            const data = await response.json();
            this.jobs = data.jobs;
            this.renderJobs();
            this.updateFolderCounts();
        } catch (error) {
            console.error('Error loading jobs:', error);
        }
    }
    
    renderJobs() {
        const tbody = document.getElementById('jobs-table-body');
        tbody.innerHTML = '';
        
        let filteredJobs = this.jobs;
        
        // Filter by folder
        if (this.currentFolder !== 'all') {
            if (this.currentFolder === 'root') {
                filteredJobs = filteredJobs.filter(job => !job.folder_id);
            } else {
                filteredJobs = filteredJobs.filter(job => job.folder_id == this.currentFolder);
            }
        }
        
        // Filter by search
        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        if (searchTerm) {
            filteredJobs = filteredJobs.filter(job => 
                job.title.toLowerCase().includes(searchTerm) ||
                job.url.toLowerCase().includes(searchTerm)
            );
        }
        
        if (filteredJobs.length === 0) {
            tbody.innerHTML = '<tr class="no-jobs-row"><td colspan="8" style="text-align: center; padding: 40px;">No jobs found</td></tr>';
            return;
        }
        
        filteredJobs.forEach(job => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="col-enabled">
                    <label class="toggle-switch">
                        <input type="checkbox" ${job.enabled ? 'checked' : ''} onchange="cronScheduler.toggleJob(${job.id})">
                        <span class="slider"></span>
                    </label>
                </td>
                <td class="col-title">${this.escapeHtml(job.title)}</td>
                <td class="col-url" title="${this.escapeHtml(job.url)}">
                    <span class="url-truncate">${this.escapeHtml(job.url)}</span>
                </td>
                <td class="col-schedule">${this.formatSchedule(job)}</td>
                <td class="col-status">
                    <span class="status-badge status-${this.getStatusClass(job.last_status)}">
                        ${this.getStatusText(job.last_status)}
                    </span>
                </td>
                <td class="col-last-exec">${this.formatDateTime(job.last_execution)}</td>
                <td class="col-next-exec">${this.formatDateTime(job.next_execution)}</td>
                <td class="col-actions">
                    <button class="btn-icon" onclick="cronScheduler.editJob(${job.id})" title="Edit">✎</button>
                    <button class="btn-icon" onclick="cronScheduler.deleteJob(${job.id})" title="Delete">🗑</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    filterJobs(searchTerm) {
        this.renderJobs();
    }
    
    getStatusClass(status) {
        switch (status) {
            case 0: return 'unknown';
            case 1: return 'ok';
            default: return 'error';
        }
    }
    
    getStatusText(status) {
        const statusMap = {
            0: 'Unknown',
            1: 'OK',
            2: 'DNS Error',
            3: 'Connection Error',
            4: 'HTTP Error',
            5: 'Timeout',
            6: 'Too Much Data',
            7: 'Invalid URL',
            8: 'Internal Error',
            9: 'Unknown Error'
        };
        return statusMap[status] || 'Unknown';
    }
    
    formatSchedule(job) {
        const mins = job.schedule_minutes || [-1];
        const hours = job.schedule_hours || [-1];
        const mdays = job.schedule_mdays || [-1];
        const months = job.schedule_months || [-1];
        const wdays = job.schedule_wdays || [-1];
        
        if (mins.includes(-1) && hours.includes(-1) && mdays.includes(-1) && months.includes(-1) && wdays.includes(-1)) {
            return 'Every minute';
        }
        
        let parts = [];
        if (!mins.includes(-1)) parts.push(`min: ${mins.join(',')}`);
        if (!hours.includes(-1)) parts.push(`hr: ${hours.join(',')}`);
        if (!mdays.includes(-1)) parts.push(`day: ${mdays.join(',')}`);
        if (!months.includes(-1)) parts.push(`mo: ${months.join(',')}`);
        if (!wdays.includes(-1)) parts.push(`dow: ${wdays.join(',')}`);
        
        return parts.join(' | ') || 'Custom';
    }
    
    formatDateTime(dateStr) {
        if (!dateStr) return '—';
        const date = new Date(dateStr);
        return date.toLocaleString();
    }
    
    openJobModal(jobId = null) {
        this.editingJobId = jobId;
        const modal = document.getElementById('job-modal');
        const title = document.getElementById('modal-title');
        const saveBtn = document.getElementById('save-job-btn');
        
        if (jobId) {
            title.textContent = 'Edit Job';
            saveBtn.textContent = 'Update Job';
            document.getElementById('test-job-btn').style.display = 'inline-block';
            this.loadJobData(jobId);
        } else {
            title.textContent = 'New Job';
            saveBtn.textContent = 'Save Job';
            document.getElementById('test-job-btn').style.display = 'none';
            this.resetJobForm();
        }
        
        modal.classList.add('active');
        this.switchTab('general');
    }
    
    resetJobForm() {
        document.getElementById('job-title').value = '';
        document.getElementById('job-url').value = '';
        document.getElementById('job-method').value = 'GET';
        document.getElementById('job-folder').value = '';
        document.getElementById('job-timeout').value = '30';
        document.getElementById('job-enabled').checked = true;
        document.getElementById('job-save-responses').checked = false;
        document.getElementById('job-redirect-success').checked = false;
        document.getElementById('job-timezone').value = 'UTC';
        document.getElementById('job-auth-enabled').checked = false;
        document.getElementById('job-auth-user').value = '';
        document.getElementById('job-auth-password').value = '';
        document.getElementById('job-body').value = '';
        document.getElementById('job-notify-failure').checked = false;
        document.getElementById('job-failure-count').value = '1';
        document.getElementById('job-notify-success').checked = false;
        document.getElementById('job-notify-disable').checked = false;
        
        // Reset headers
        document.getElementById('headers-container').innerHTML = `
            <div class="header-row">
                <input type="text" class="form-control header-key" placeholder="Header name">
                <input type="text" class="form-control header-value" placeholder="Header value">
                <button class="btn-remove-header" onclick="this.parentElement.remove()">−</button>
            </div>
        `;
        
        // Reset schedule (every minute)
        this.applySchedulePreset('every-minute');
    }
    
    async loadJobData(jobId) {
        try {
            const response = await fetch(`/api/cron-scheduler/jobs/${jobId}`);
            const data = await response.json();
            const job = data.job;
            
            document.getElementById('job-title').value = job.title;
            document.getElementById('job-url').value = job.url;
            document.getElementById('job-method').value = job.request_method;
            document.getElementById('job-folder').value = job.folder_id || '';
            document.getElementById('job-timeout').value = job.request_timeout;
            document.getElementById('job-enabled').checked = job.enabled;
            document.getElementById('job-save-responses').checked = job.save_responses;
            document.getElementById('job-redirect-success').checked = job.redirect_success;
            document.getElementById('job-timezone').value = job.schedule_timezone;
            document.getElementById('job-auth-enabled').checked = job.auth_enabled;
            document.getElementById('job-auth-user').value = job.auth_user || '';
            document.getElementById('job-auth-password').value = job.auth_password || '';
            document.getElementById('job-body').value = job.body || '';
            document.getElementById('job-notify-failure').checked = job.notify_on_failure;
            document.getElementById('job-failure-count').value = job.notify_failure_count;
            document.getElementById('job-notify-success').checked = job.notify_on_success;
            document.getElementById('job-notify-disable').checked = job.notify_on_disable;
            
            document.getElementById('auth-fields').style.display = job.auth_enabled ? 'block' : 'none';
            
            // Load headers
            const headers = job.headers || {};
            const headersContainer = document.getElementById('headers-container');
            headersContainer.innerHTML = '';
            
            if (Object.keys(headers).length === 0) {
                this.addHeaderRow();
            } else {
                Object.entries(headers).forEach(([key, value]) => {
                    this.addHeaderRow(key, value);
                });
            }
            
            // Load schedule
            this.setScheduleValues('minutes', job.schedule_minutes);
            this.setScheduleValues('hours', job.schedule_hours);
            this.setScheduleValues('mdays', job.schedule_mdays);
            this.setScheduleValues('months', job.schedule_months);
            this.setScheduleValues('wdays', job.schedule_wdays);
            
            // Load predictions
            if (job.predictions && job.predictions.length > 0) {
                const list = document.getElementById('next-executions-list');
                list.innerHTML = job.predictions.map(ts => {
                    const date = new Date(ts * 1000);
                    return `<div>${date.toLocaleString()}</div>`;
                }).join('');
            }
            
            // Load history
            this.loadJobHistory(jobId);
            
        } catch (error) {
            console.error('Error loading job data:', error);
            this.showToast('Error loading job data', 'error');
        }
    }
    
    async loadJobHistory(jobId) {
        try {
            const response = await fetch(`/api/cron-scheduler/jobs/${jobId}/history`);
            const data = await response.json();
            
            const tbody = document.getElementById('history-table-body');
            const table = document.getElementById('history-table');
            const loading = document.getElementById('history-loading');
            
            if (data.history.length === 0) {
                loading.innerHTML = '<em>No execution history yet</em>';
                table.style.display = 'none';
                return;
            }
            
            loading.style.display = 'none';
            table.style.display = 'table';
            tbody.innerHTML = '';
            
            data.history.forEach(entry => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${this.formatDateTime(entry.date_executed)}</td>
                    <td><span class="status-badge status-${this.getStatusClass(entry.status)}">${this.getStatusText(entry.status)}</span></td>
                    <td>${entry.duration_ms}ms</td>
                    <td>${entry.http_status || '—'}</td>
                    <td><button class="btn btn-sm" onclick="cronScheduler.viewHistoryDetail(${jobId}, ${entry.id})">View</button></td>
                `;
                tbody.appendChild(tr);
            });
            
        } catch (error) {
            console.error('Error loading history:', error);
        }
    }
    
    async viewHistoryDetail(jobId, historyId) {
        try {
            const response = await fetch(`/api/cron-scheduler/jobs/${jobId}/history/${historyId}`);
            const data = await response.json();
            const entry = data.history;
            
            const content = document.getElementById('history-detail-content');
            content.innerHTML = `
                <div class="history-detail">
                    <div class="detail-row">
                        <strong>Executed:</strong> ${this.formatDateTime(entry.date_executed)}
                    </div>
                    <div class="detail-row">
                        <strong>Planned:</strong> ${this.formatDateTime(entry.date_planned)}
                    </div>
                    <div class="detail-row">
                        <strong>Jitter:</strong> ${entry.jitter_ms}ms
                    </div>
                    <div class="detail-row">
                        <strong>Status:</strong> <span class="status-badge status-${this.getStatusClass(entry.status)}">${this.getStatusText(entry.status)}</span>
                    </div>
                    <div class="detail-row">
                        <strong>HTTP Status:</strong> ${entry.http_status || '—'}
                    </div>
                    <div class="detail-row">
                        <strong>Duration:</strong> ${entry.duration_ms}ms
                    </div>
                    <div class="detail-row">
                        <strong>URL:</strong> ${this.escapeHtml(entry.url)}
                    </div>
                    ${entry.response_headers ? `
                        <div class="detail-section">
                            <strong>Response Headers:</strong>
                            <pre>${this.escapeHtml(entry.response_headers)}</pre>
                        </div>
                    ` : ''}
                    ${entry.response_body ? `
                        <div class="detail-section">
                            <strong>Response Body:</strong>
                            <pre>${this.escapeHtml(entry.response_body.substring(0, 5000))}</pre>
                        </div>
                    ` : ''}
                </div>
            `;
            
            document.getElementById('history-detail-modal').classList.add('active');
            
        } catch (error) {
            console.error('Error loading history detail:', error);
            this.showToast('Error loading history detail', 'error');
        }
    }
    
    addHeaderRow(key = '', value = '') {
        const container = document.getElementById('headers-container');
        const row = document.createElement('div');
        row.className = 'header-row';
        row.innerHTML = `
            <input type="text" class="form-control header-key" placeholder="Header name" value="${this.escapeHtml(key)}">
            <input type="text" class="form-control header-value" placeholder="Header value" value="${this.escapeHtml(value)}">
            <button class="btn-remove-header" onclick="this.parentElement.remove()">−</button>
        `;
        container.appendChild(row);
    }
    
    async saveJob() {
        const title = document.getElementById('job-title').value.trim();
        const url = document.getElementById('job-url').value.trim();
        
        if (!title || !url) {
            this.showToast('Title and URL are required', 'error');
            return;
        }
        
        // Collect headers
        const headers = {};
        document.querySelectorAll('.header-row').forEach(row => {
            const key = row.querySelector('.header-key').value.trim();
            const value = row.querySelector('.header-value').value.trim();
            if (key) {
                headers[key] = value;
            }
        });
        
        // Collect schedule
        const schedule_minutes = this.getScheduleValues('minutes');
        const schedule_hours = this.getScheduleValues('hours');
        const schedule_mdays = this.getScheduleValues('mdays');
        const schedule_months = this.getScheduleValues('months');
        const schedule_wdays = this.getScheduleValues('wdays');
        
        const jobData = {
            title,
            url,
            request_method: document.getElementById('job-method').value,
            folder_id: document.getElementById('job-folder').value || null,
            request_timeout: parseInt(document.getElementById('job-timeout').value),
            enabled: document.getElementById('job-enabled').checked ? 1 : 0,
            save_responses: document.getElementById('job-save-responses').checked ? 1 : 0,
            redirect_success: document.getElementById('job-redirect-success').checked ? 1 : 0,
            schedule_timezone: document.getElementById('job-timezone').value,
            auth_enabled: document.getElementById('job-auth-enabled').checked ? 1 : 0,
            auth_user: document.getElementById('job-auth-user').value,
            auth_password: document.getElementById('job-auth-password').value,
            headers,
            body: document.getElementById('job-body').value,
            notify_on_failure: document.getElementById('job-notify-failure').checked ? 1 : 0,
            notify_failure_count: parseInt(document.getElementById('job-failure-count').value),
            notify_on_success: document.getElementById('job-notify-success').checked ? 1 : 0,
            notify_on_disable: document.getElementById('job-notify-disable').checked ? 1 : 0,
            schedule_minutes,
            schedule_hours,
            schedule_mdays,
            schedule_months,
            schedule_wdays
        };
        
        try {
            let response;
            
            if (this.editingJobId) {
                response = await fetch(`/api/cron-scheduler/jobs/${this.editingJobId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(jobData)
                });
            } else {
                response = await fetch('/api/cron-scheduler/jobs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(jobData)
                });
            }
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast(this.editingJobId ? 'Job updated successfully' : 'Job created successfully', 'success');
                document.getElementById('job-modal').classList.remove('active');
                this.editingJobId = null;
                this.loadJobs();
                this.loadDashboard();
            } else {
                this.showToast(data.error || 'Error saving job', 'error');
            }
            
        } catch (error) {
            console.error('Error saving job:', error);
            this.showToast('Error saving job', 'error');
        }
    }
    
    async editJob(jobId) {
        this.openJobModal(jobId);
    }
    
    async deleteJob(jobId) {
        showConfirmModal(
            'Delete Cron Job',
            'Are you sure you want to delete this job? This will also delete all execution history.',
            async () => {
                try {
                    const response = await fetch(`/api/cron-scheduler/jobs/${jobId}`, {
                        method: 'DELETE'
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        this.showToast('Job deleted successfully', 'success');
                        this.loadJobs();
                        this.loadDashboard();
                    } else {
                        this.showToast(data.error || 'Error deleting job', 'error');
                    }
                    
                } catch (error) {
                    console.error('Error deleting job:', error);
                    this.showToast('Error deleting job', 'error');
                }
            }
        );
    }
    
    async toggleJob(jobId) {
        try {
            const response = await fetch(`/api/cron-scheduler/jobs/${jobId}/toggle`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast(`Job ${data.enabled ? 'enabled' : 'disabled'}`, 'success');
                this.loadJobs();
                this.loadDashboard();
            } else {
                this.showToast(data.error || 'Error toggling job', 'error');
                this.loadJobs(); // Revert UI
            }
            
        } catch (error) {
            console.error('Error toggling job:', error);
            this.showToast('Error toggling job', 'error');
            this.loadJobs();
        }
    }
    
    async testJob() {
        if (!this.editingJobId) {
            this.showToast('Please save the job first', 'error');
            return;
        }
        
        try {
            const response = await fetch(`/api/cron-scheduler/jobs/${this.editingJobId}/test`, {
                method: 'POST'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast('Test run started. Check the History tab for results.', 'success');
                
                // Reload history after a short delay
                setTimeout(() => {
                    this.loadJobHistory(this.editingJobId);
                }, 2000);
            } else {
                this.showToast(data.error || 'Error starting test run', 'error');
            }
            
        } catch (error) {
            console.error('Error testing job:', error);
            this.showToast('Error starting test run', 'error');
        }
    }
    
    openFolderModal(folderId = null, folderName = '') {
        this.editingFolderId = folderId;
        const modal = document.getElementById('folder-modal');
        const title = document.getElementById('folder-modal-title');
        const input = document.getElementById('folder-name');
        const saveBtn = document.getElementById('save-folder-btn');
        
        if (folderId) {
            title.textContent = 'Edit Folder';
            saveBtn.textContent = 'Update';
            input.value = folderName;
        } else {
            title.textContent = 'New Folder';
            saveBtn.textContent = 'Save';
            input.value = '';
        }
        
        modal.classList.add('active');
    }
    
    async saveFolder() {
        const name = document.getElementById('folder-name').value.trim();
        
        if (!name) {
            this.showToast('Folder name is required', 'error');
            return;
        }
        
        try {
            let response;
            if (this.editingFolderId) {
                response = await fetch(`/api/cron-scheduler/folders/${this.editingFolderId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
            } else {
                response = await fetch('/api/cron-scheduler/folders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });
            }
            
            const data = await response.json();
            
            if (response.ok) {
                this.showToast(this.editingFolderId ? 'Folder updated' : 'Folder created', 'success');
                document.getElementById('folder-modal').classList.remove('active');
                this.editingFolderId = null;
                this.loadFolders();
            } else {
                this.showToast(data.error || 'Error saving folder', 'error');
            }
            
        } catch (error) {
            console.error('Error saving folder:', error);
            this.showToast('Error saving folder', 'error');
        }
    }
    
    editFolder(folderId, folderName) {
        this.openFolderModal(folderId, folderName);
    }
    
    async deleteFolder(folderId) {
        showConfirmModal(
            'Delete Folder',
            'Delete this folder? Jobs inside will be moved to Root folder.',
            async () => {
                try {
                    const response = await fetch(`/api/cron-scheduler/folders/${folderId}`, {
                        method: 'DELETE'
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        this.showToast('Folder deleted', 'success');
                        this.loadFolders();
                        this.loadJobs();
                    } else {
                        this.showToast(data.error || 'Error deleting folder', 'error');
                    }
                    
                } catch (error) {
                    console.error('Error deleting folder:', error);
                    this.showToast('Error deleting folder', 'error');
                }
            }
        );
    }
    
    switchTab(tabName) {
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });
        
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tab === tabName);
        });
    }
    
    initializeScheduleBuilder() {
        // Minutes (0-59)
        this.createScheduleGrid('minutes', 60, 10);
        
        // Hours (0-23)
        this.createScheduleGrid('hours', 24, 12);
        
        // Days of month (1-31)
        this.createScheduleGrid('mdays', 31, 10, 1);
        
        // Months (1-12)
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        this.createScheduleGrid('months', 12, 12, 1, monthNames);
        
        // Days of week (0-6: Sun-Sat)
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        this.createScheduleGrid('wdays', 7, 7, 0, dayNames);
    }
    
    createScheduleGrid(field, count, columns, offset = 0, labels = null) {
        const grid = document.getElementById(`${field}-grid`);
        grid.innerHTML = '';
        grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        
        for (let i = 0; i < count; i++) {
            const value = i + offset;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'schedule-btn';
            btn.dataset.field = field;
            btn.dataset.value = value;
            btn.textContent = labels ? labels[i] : value;
            btn.addEventListener('click', (e) => {
                e.target.classList.toggle('active');
            });
            grid.appendChild(btn);
        }
    }
    
    applySchedulePreset(preset) {
        // Clear all first
        ['minutes', 'hours', 'mdays', 'months', 'wdays'].forEach(field => {
            this.toggleScheduleAll(field, false);
        });
        
        switch (preset) {
            case 'every-minute':
                this.toggleScheduleAll('minutes', true);
                this.toggleScheduleAll('hours', true);
                this.toggleScheduleAll('mdays', true);
                this.toggleScheduleAll('months', true);
                this.toggleScheduleAll('wdays', true);
                break;
            case 'every-15-min':
                [0, 15, 30, 45].forEach(m => this.toggleScheduleValue('minutes', m, true));
                this.toggleScheduleAll('hours', true);
                this.toggleScheduleAll('mdays', true);
                this.toggleScheduleAll('months', true);
                this.toggleScheduleAll('wdays', true);
                break;
            case 'hourly':
                this.toggleScheduleValue('minutes', 0, true);
                this.toggleScheduleAll('hours', true);
                this.toggleScheduleAll('mdays', true);
                this.toggleScheduleAll('months', true);
                this.toggleScheduleAll('wdays', true);
                break;
            case 'daily':
                this.toggleScheduleValue('minutes', 0, true);
                this.toggleScheduleValue('hours', 0, true);
                this.toggleScheduleAll('mdays', true);
                this.toggleScheduleAll('months', true);
                this.toggleScheduleAll('wdays', true);
                break;
            case 'weekly':
                this.toggleScheduleValue('minutes', 0, true);
                this.toggleScheduleValue('hours', 0, true);
                this.toggleScheduleAll('mdays', true);
                this.toggleScheduleAll('months', true);
                this.toggleScheduleValue('wdays', 0, true); // Sunday
                break;
            case 'monthly':
                this.toggleScheduleValue('minutes', 0, true);
                this.toggleScheduleValue('hours', 0, true);
                this.toggleScheduleValue('mdays', 1, true);
                this.toggleScheduleAll('months', true);
                this.toggleScheduleAll('wdays', true);
                break;
        }
    }
    
    toggleScheduleAll(field, active) {
        document.querySelectorAll(`.schedule-btn[data-field="${field}"]`).forEach(btn => {
            if (active) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }
    
    toggleScheduleValue(field, value, active) {
        const btn = document.querySelector(`.schedule-btn[data-field="${field}"][data-value="${value}"]`);
        if (btn) {
            if (active) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    }
    
    getScheduleValues(field) {
        const activeButtons = Array.from(document.querySelectorAll(`.schedule-btn[data-field="${field}"].active`));
        
        if (activeButtons.length === 0) {
            return [-1]; // None selected = every
        }
        
        const total = field === 'minutes' ? 60 : field === 'hours' ? 24 : field === 'mdays' ? 31 : field === 'months' ? 12 : 7;
        
        if (activeButtons.length === total) {
            return [-1]; // All selected = every
        }
        
        return activeButtons.map(btn => parseInt(btn.dataset.value));
    }
    
    setScheduleValues(field, values) {
        this.toggleScheduleAll(field, false);
        
        if (values.includes(-1)) {
            this.toggleScheduleAll(field, true);
        } else {
            values.forEach(value => {
                this.toggleScheduleValue(field, value, true);
            });
        }
    }
    
    showToast(message, type = 'info') {
        showToast(message, type);
    }
    
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
