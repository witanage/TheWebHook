class WebhookViewer {
    constructor() {
        this.refreshInterval = null;
        this.currentRequests = [];
        this.activeRequestId = null;
        this.isLoading = false;
        this.userId = document.querySelector('meta[name="user-id"]')?.content || window.userId;
        this.eventSource = null;
        this.currentWebhookId = null;
        this.notifications = [];
        this.unreadCount = 0;
        this.selectRefreshed = false;

        this.currentSearchTerm = '';
        this.originalJsonContent = null;
        this.jsonSearchMatches = [];
        this.currentMatchIndex = -1;
        this.currentJsonRaw = null;

        this.globalSearchTimeout = null;
        this.globalSearchResults = [];
        this.dateRangePicker = null;

        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadInitialData();
        this.setupSSE();
        this.loadNotifications();
        this.initializeDateRangePicker();
    }

    async testWebhook() {
        const webhookSelect = document.getElementById('webhookSelect');
        let webhookId = webhookSelect.value;

        // If no webhook ID exists, prompt user to create one
        if (!webhookId || webhookSelect.options.length === 0) {
            this.showNewWebhookModal();
            return;
        }

        const testButton = document.getElementById('testWebhookBtn');
        const originalText = testButton.innerHTML;

        // Show loading state
        testButton.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; margin-right: 8px; display: inline-block;"></div> Testing...';
        testButton.disabled = true;

        try {
            const response = await fetch(`/webhook/${this.userId}/${webhookId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Test-Webhook': 'true'
                },
                body: JSON.stringify({
                    test: true,
                    message: 'Test webhook from built-in tester',
                    timestamp: new Date().toISOString(),
                    test_info: {
                        browser: navigator.userAgent,
                        protocol: window.location.protocol,
                        host: window.location.host
                    }
                })
            });

            if (response.ok) {
                this.showNotification('Test webhook sent successfully! Check the webhook list.', 'success');

                // Reload webhooks after a short delay to show the test
                setTimeout(() => {
                    this.loadWebhooks();
                }, 500);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Test webhook failed:', error);

            // Check if it's an HTTPS issue
            if (window.location.protocol === 'http:' && error.message.includes('Failed to fetch')) {
                this.showNotification('Connection failed! You might have lost HTTPS. Please check your SSL certificate.', 'error');
            } else {
                this.showNotification(`Test failed: ${error.message}`, 'error');
            }
        } finally {
            // Restore button state
            testButton.innerHTML = originalText;
            testButton.disabled = false;
        }
    }

    showNewWebhookModal() {
        const modal = document.getElementById('newWebhookModal');
        const input = document.getElementById('newWebhookIdInput');
        modal.classList.add('show');
        input.focus();
        input.value = this.generateWebhookId();
    }

    closeNewWebhookModal() {
        const modal = document.getElementById('newWebhookModal');
        modal.classList.remove('show');
    }

    generateWebhookId() {
        // Generate a random webhook ID suggestion
        const adjectives = ['swift', 'smart', 'rapid', 'live', 'instant', 'quick', 'fast', 'real'];
        const nouns = ['hook', 'endpoint', 'api', 'service', 'test', 'demo', 'app', 'data'];
        const random = Math.floor(Math.random() * 1000);
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        return `${adj}-${noun}-${random}`;
    }

    async createAndTestWebhook() {
        const input = document.getElementById('newWebhookIdInput');
        const webhookId = input.value.trim();

        if (!webhookId) {
            this.showNotification('Please enter a webhook ID', 'error');
            return;
        }

        // Validate webhook ID (alphanumeric, hyphens, underscores)
        if (!/^[a-zA-Z0-9-_]+$/.test(webhookId)) {
            this.showNotification('Webhook ID can only contain letters, numbers, hyphens, and underscores', 'error');
            return;
        }

        // Close modal
        this.closeNewWebhookModal();

        // Add to select if not exists
        const webhookSelect = document.getElementById('webhookSelect');
        const existingOption = Array.from(webhookSelect.options).find(opt => opt.value === webhookId);

        if (!existingOption) {
            const option = document.createElement('option');
            option.value = webhookId;
            option.textContent = webhookId;
            webhookSelect.appendChild(option);
        }

        // Select the new webhook ID
        webhookSelect.value = webhookId;
        this.currentWebhookId = webhookId;

        // Send test webhook
        const testButton = document.getElementById('testWebhookBtn');
        const originalText = testButton.innerHTML;

        testButton.innerHTML = '<div class="spinner" style="width: 16px; height: 16px; margin-right: 8px; display: inline-block;"></div> Testing...';
        testButton.disabled = true;

        try {
            const response = await fetch(`/webhook/${this.userId}/${webhookId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Test-Webhook': 'true'
                },
                body: JSON.stringify({
                    test: true,
                    message: 'First test webhook for new endpoint',
                    timestamp: new Date().toISOString(),
                    webhook_id: webhookId,
                    test_info: {
                        browser: navigator.userAgent,
                        protocol: window.location.protocol,
                        host: window.location.host
                    }
                })
            });

            if (response.ok) {
                this.showNotification(`Webhook "${webhookId}" created and tested successfully!`, 'success');

                // Reload webhooks after a short delay
                setTimeout(() => {
                    this.refreshWebhookSelect(true);
                    this.loadWebhooks();
                }, 500);
            } else {
                throw new Error(`HTTP ${response.status}`);
            }
        } catch (error) {
            console.error('Test webhook failed:', error);
            this.showNotification(`Failed to test webhook: ${error.message}`, 'error');
        } finally {
            testButton.innerHTML = originalText;
            testButton.disabled = false;
        }
    }

    // Add connection health check method
    async checkConnectionHealth() {
        try {
            const response = await fetch('/health', {
                method: 'GET',
                cache: 'no-cache'
            });

            if (!response.ok) {
                throw new Error(`Health check failed: ${response.status}`);
            }

            const data = await response.json();

            // Update connection status indicator
            const statusElement = document.getElementById('connectionStatus');
            const statusDot = statusElement.querySelector('.status-dot');
            const statusText = statusElement.querySelector('.status-text');

            if (data.status === 'healthy') {
                statusElement.classList.add('connected');
                statusText.textContent = 'Connected';

                // Check SSL status
                if (window.location.protocol === 'http:') {
                    this.showNotification('Warning: Connection is not secure (HTTP). Consider using HTTPS.', 'warning');
                }
            } else {
                statusElement.classList.remove('connected');
                statusText.textContent = 'Issues Detected';
            }

            return data;
        } catch (error) {
            console.error('Health check error:', error);

            // Update UI to show disconnected state
            const statusElement = document.getElementById('connectionStatus');
            statusElement.classList.remove('connected');
            statusElement.querySelector('.status-text').textContent = 'Disconnected';

            return {
                status: 'error',
                message: error.message
            };
        }
    }

    initializeDateRangePicker() {
        const self = this; // Store reference to 'this'

        const picker = flatpickr("#dateRangePicker", {
            mode: "range",
            enableTime: false,
            dateFormat: "M d, Y",
            showMonths: 2,
            animate: false,
            placeholder: "Select date range...",
            maxDate: "today",
            onChange: (selectedDates, dateStr, instance) => {
                // Don't trigger on single date selection, wait for range
                if (selectedDates.length === 2) {
                    // Small delay to ensure UI updates
                    setTimeout(() => {
                        self.performGlobalSearch();
                    }, 100);
                }
            },
            onClose: (selectedDates, dateStr, instance) => {
                // Trigger search when calendar closes with valid range
                if (selectedDates.length === 2) {
                    setTimeout(() => {
                        self.performGlobalSearch();
                    }, 100);
                }
            },
            onReady: function(dateObj, dateStr, instance) {
                // Add custom shortcuts
                const customShortcuts = document.createElement("div");
                customShortcuts.className = "flatpickr-shortcuts";

                // Create buttons programmatically to ensure proper event binding
                const shortcuts = [{
                        label: 'Today',
                        preset: 'today'
                    },
                    {
                        label: 'Yesterday',
                        preset: 'yesterday'
                    },
                    {
                        label: 'Last 7 Days',
                        preset: 'last7days'
                    },
                    {
                        label: 'Last 30 Days',
                        preset: 'last30days'
                    },
                    {
                        label: 'This Month',
                        preset: 'thisMonth'
                    }
                ];

                shortcuts.forEach(shortcut => {
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.textContent = shortcut.label;
                    button.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        self.setDateRangePreset(shortcut.preset);
                    });
                    customShortcuts.appendChild(button);
                });

                instance.calendarContainer.appendChild(customShortcuts);
            }
        });

        this.dateRangePicker = picker;
    }

    // NEW METHOD
    setDateRangePreset(preset) {
        const now = new Date();
        let startDate, endDate;

        console.log('=== DATE PRESET DEBUG ===');
        console.log('Preset selected:', preset);
        console.log('Current date (now):', now.toISOString());

        switch (preset) {
            case 'today':
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'yesterday':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setDate(endDate.getDate() - 1);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'last7days':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 6); // 7 days including today
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'last30days':
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 29); // 30 days including today
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'thisMonth':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                startDate.setHours(0, 0, 0, 0);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
            default:
                console.error('Unknown preset:', preset);
                return;
        }

        console.log('Calculated dates:');
        console.log('  Start:', startDate.toISOString(), '(' + startDate.toLocaleString() + ')');
        console.log('  End:', endDate.toISOString(), '(' + endDate.toLocaleString() + ')');

        // Set the date in flatpickr
        if (this.dateRangePicker) {
            console.log('Setting flatpickr dates...');
            this.dateRangePicker.setDate([startDate, endDate], false);

            // Verify what flatpickr actually has
            console.log('Flatpickr selected dates:', this.dateRangePicker.selectedDates);
            console.log('Flatpickr selected dates length:', this.dateRangePicker.selectedDates.length);

            // Close the picker
            this.dateRangePicker.close();
        }

        // Instead of relying on flatpickr's onChange, directly call the search with the dates
        console.log('Calling executeGlobalSearch directly...');

        // Get search term from input
        const searchInput = document.getElementById('globalSearchInput');
        const searchTerm = searchInput ? searchInput.value.trim() : '';

        // Format dates for the API (matching the format used in performGlobalSearch)
        const startDateStr = startDate.toISOString().slice(0, 19);
        const endDateStr = endDate.toISOString().slice(0, 19);

        console.log('Formatted for API:');
        console.log('  startDate:', startDateStr);
        console.log('  endDate:', endDateStr);
        console.log('  searchTerm:', searchTerm);

        // Show loading state
        document.getElementById('globalSearchResults').innerHTML = `
        <div class="global-search-loading">
            <div class="spinner"></div>
            <p>Searching...</p>
        </div>
    `;

        // Directly execute the search
        setTimeout(() => {
            this.executeGlobalSearch(searchTerm, startDateStr, endDateStr);
        }, 100);

        console.log('=== END DATE PRESET DEBUG ===');
    }

    clearDateRange() {
        // Clear the date range picker
        if (this.dateRangePicker) {
            this.dateRangePicker.clear();
        }

        // Clear the search input
        const searchInput = document.getElementById('globalSearchInput');
        if (searchInput) {
            searchInput.value = '';
        }

        // Clear the search results
        document.getElementById('globalSearchResults').innerHTML = `
        <div class="search-no-results">
            <p>Enter a search term or select a date range to search across all your webhooks</p>
        </div>
    `;
    }

    performGlobalSearch(event) {
        // Handle keyboard events
        if (event && event.key === 'Escape') {
            this.closeGlobalSearch();
            return;
        }

        // Get search term from the input field directly
        const searchInput = document.getElementById('globalSearchInput');
        const searchTerm = searchInput ? searchInput.value.trim() : '';

        let startDate = '';
        let endDate = '';

        // Get date range if selected
        if (this.dateRangePicker && this.dateRangePicker.selectedDates.length === 2) {
            // Set start date to beginning of day
            const start = new Date(this.dateRangePicker.selectedDates[0]);
            start.setHours(0, 0, 0, 0);
            startDate = start.toISOString().slice(0, 19);

            // Set end date to end of day
            const end = new Date(this.dateRangePicker.selectedDates[1]);
            end.setHours(23, 59, 59, 999);
            endDate = end.toISOString().slice(0, 19);

            console.log('Date range selected:', {
                startDate,
                endDate
            }); // Debug log

        }

        // Clear timeout from previous keystroke
        if (this.globalSearchTimeout) {
            clearTimeout(this.globalSearchTimeout);
        }

        // Allow search with just date range (no text required)
        if (searchTerm.length < 2 && !startDate && !endDate) {
            document.getElementById('globalSearchResults').innerHTML = `
            <div class="search-no-results">
                <p>Enter at least 2 characters to search or select a date range</p>
            </div>
        `;
            return;
        }

        // Show loading state
        document.getElementById('globalSearchResults').innerHTML = `
        <div class="global-search-loading">
            <div class="spinner"></div>
            <p>Searching...</p>
        </div>
    `;

        // Debounce the search
        this.globalSearchTimeout = setTimeout(() => {
            this.executeGlobalSearch(searchTerm, startDate, endDate);
        }, 300);
    }

    openGlobalSearch() {
        const modal = document.getElementById('globalSearchModal');
        const input = document.getElementById('globalSearchInput');

        modal.classList.add('show');
        input.focus();
        input.value = '';

        // Clear date range picker
        if (this.dateRangePicker) {
            this.dateRangePicker.clear();
        }

        // Clear previous results
        document.getElementById('globalSearchResults').innerHTML = `
        <div class="search-no-results">
            <p>Enter a search term or select a date range to search across all your webhooks</p>
        </div>
    `;

        // Remove any existing event listener and add new one
        input.removeEventListener('keyup', this.boundPerformGlobalSearch);
        input.removeEventListener('input', this.boundPerformGlobalSearch);

        // Create bound function to preserve 'this' context
        this.boundPerformGlobalSearch = (event) => this.performGlobalSearch(event);

        // Add event listeners
        input.addEventListener('keyup', this.boundPerformGlobalSearch);
        input.addEventListener('input', this.boundPerformGlobalSearch);
    }

    setupEventListeners() {
        // Smart webhook select - refresh on focus
        const webhookSelect = document.getElementById('webhookSelect');
        webhookSelect.addEventListener('focus', () => {
            this.refreshWebhookSelect(true);
        });

        // Also refresh when clicking on it (for better UX)
        webhookSelect.addEventListener('click', () => {
            if (!this.selectRefreshed) {
                this.refreshWebhookSelect(true);
                this.selectRefreshed = true;
                // Reset the flag after a short delay
                setTimeout(() => {
                    this.selectRefreshed = false;
                }, 1000);
            }
        });

        // Refresh indicator click handler (if element exists)
        const refreshIndicatorLink = document.getElementById('refreshIndicatorLink');
        if (refreshIndicatorLink) {
            refreshIndicatorLink.addEventListener('click', (e) => {
                e.preventDefault();
                location.reload();
            });
        }

        // Handle window resize for responsive layout
        window.addEventListener('resize', this.debounce(() => {
            this.handleResize();
        }, 250));

        // Clean up SSE on page unload
        window.addEventListener('beforeunload', () => {
            if (this.eventSource) {
                this.eventSource.close();
            }
        });

        // Close dropdowns when clicking outside
        document.addEventListener('click', (event) => {
            const profileMenu = document.querySelector('.profile-menu');
            const profileDropdown = document.getElementById('profileDropdown');
            const notificationIcon = document.querySelector('.notification-icon');
            const notificationDropdown = document.getElementById('notificationDropdown');

            if (!profileMenu.contains(event.target)) {
                profileDropdown.classList.remove('show');
            }

            if (!notificationIcon.contains(event.target)) {
                notificationDropdown.classList.remove('show');
            }
        });

        // Global keyboard shortcuts
        document.addEventListener('keydown', (event) => {
            // Ctrl/Cmd + K for global search
            if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
                event.preventDefault();
                this.openGlobalSearch();
            }
        });

        // Password form submission
        document.getElementById('passwordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.changePassword();
        });
    }

    setupSSE() {
        // Set up Server-Sent Events for real-time updates
        this.eventSource = new EventSource(`/events/${this.userId}`);

        this.eventSource.onopen = () => {
            console.log('SSE connection established');
            this.updateConnectionStatus(true); // This will now show "Connected"
        };

        // Add periodic health checks
        this.healthCheckInterval = setInterval(() => {
            this.checkConnectionHealth();
        }, 60000);


        this.eventSource.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);

                if (data.type === 'new_webhook') {
                    // Refresh webhook select to show any new webhook IDs
                    this.refreshWebhookSelect(true);
                    // Check if this webhook is for the currently selected webhook ID
                    if (data.webhook_id === this.currentWebhookId) {
                        this.handleNewWebhook(data.data);
                    }
                } else if (data.type === 'new_notification') {
                    // Refresh webhook select to show any new webhook IDs
                    this.refreshWebhookSelect(true);
                    // Handle notifications for other webhook IDs
                    if (data.webhook_id !== this.currentWebhookId) {
                        this.handleNewNotification(data);
                        this.animateNotificationIcon();
                    }
                } else if (data.type === 'webhook_deleted') {
                    // Handle webhook deletion
                    if (data.webhook_id === this.currentWebhookId) {
                        this.handleWebhookDeleted(data.request_id);
                    }
                } else if (data.type === 'notifications_cleared') {
                    // Handle all notifications cleared
                    this.updateNotificationBadge(0);
                    this.loadNotifications();
                } else if (data.type === 'connected') {
                    console.log('SSE connected successfully');
                }
            } catch (error) {
                console.error('Error processing SSE message:', error);
            }
        };

        this.eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            this.updateConnectionStatus(false);

            // Attempt to reconnect after 5 seconds
            setTimeout(() => {
                if (this.eventSource.readyState === EventSource.CLOSED) {
                    console.log('Attempting to reconnect SSE...');
                    this.setupSSE();
                }
            }, 5000);
        };
    }

    toggleDownloadMenu() {
        const dropdown = document.getElementById('downloadDropdown');
        dropdown.classList.toggle('show');

        // Close on click outside
        const closeDropdown = (e) => {
            if (!e.target.closest('.download-dropdown-container')) {
                dropdown.classList.remove('show');
                document.removeEventListener('click', closeDropdown);
            }
        };

        if (dropdown.classList.contains('show')) {
            setTimeout(() => {
                document.addEventListener('click', closeDropdown);
            }, 0);
        }
    }

    downloadWebhook(format) {
        // Close the dropdown
        document.getElementById('downloadDropdown').classList.remove('show');

        // Get the current active request
        const activeRequest = this.currentRequests.find(r => r.id === this.activeRequestId);
        if (!activeRequest) {
            this.showNotification('No webhook selected', 'error');
            return;
        }

        let content, mimeType, extension;

        try {
            const webhookData = {
                id: activeRequest.id,
                webhook_id: activeRequest.webhook_id,
                method: activeRequest.method || 'POST',
                timestamp: activeRequest.timestamp,
                client_ip: activeRequest.client_ip || 'Unknown',
                headers: JSON.parse(activeRequest.headers || '{}'),
                query_params: JSON.parse(activeRequest.query_params || '{}'),
                body: JSON.parse(activeRequest.body || '{}')
            };

            switch (format) {
                case 'json':
                    content = JSON.stringify(webhookData, null, 2);
                    mimeType = 'application/json';
                    extension = 'json';
                    break;

                case 'xml':
                    content = this.convertToXML(webhookData);
                    mimeType = 'application/xml';
                    extension = 'xml';
                    break;

                case 'csv':
                    content = this.convertToCSV(webhookData);
                    mimeType = 'text/csv';
                    extension = 'csv';
                    break;

                default:
                    throw new Error('Unsupported format');
            }

            // Create download
            const blob = new Blob([content], {
                type: mimeType
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `webhook_${activeRequest.webhook_id}_${activeRequest.id}_${new Date().getTime()}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            this.showNotification(`Downloaded as ${format.toUpperCase()}`, 'success');

        } catch (error) {
            console.error('Download error:', error);
            this.showNotification('Failed to download webhook data', 'error');
        }
    }

    convertToXML(data) {
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<webhook>\n';

        const addXMLNode = (key, value, indent = '  ') => {
            if (value === null || value === undefined) {
                return `${indent}<${key}/>\n`;
            } else if (typeof value === 'object' && !Array.isArray(value)) {
                let result = `${indent}<${key}>\n`;
                for (const [k, v] of Object.entries(value)) {
                    result += addXMLNode(this.sanitizeXMLKey(k), v, indent + '  ');
                }
                result += `${indent}</${key}>\n`;
                return result;
            } else if (Array.isArray(value)) {
                let result = `${indent}<${key}>\n`;
                value.forEach((item, index) => {
                    result += addXMLNode('item', item, indent + '  ');
                });
                result += `${indent}</${key}>\n`;
                return result;
            } else {
                const escapedValue = this.escapeXML(String(value));
                return `${indent}<${key}>${escapedValue}</${key}>\n`;
            }
        };

        for (const [key, value] of Object.entries(data)) {
            xml += addXMLNode(this.sanitizeXMLKey(key), value);
        }

        xml += '</webhook>';
        return xml;
    }

    convertToCSV(data) {
        const rows = [];

        // Headers
        rows.push(['Field', 'Value']);

        // Basic fields
        rows.push(['ID', data.id]);
        rows.push(['Webhook ID', data.webhook_id]);
        rows.push(['Method', data.method]);
        rows.push(['Timestamp', data.timestamp]);
        rows.push(['Client IP', data.client_ip]);

        // Headers section
        rows.push(['', '']); // Empty row
        rows.push(['Headers', '']);
        for (const [key, value] of Object.entries(data.headers)) {
            rows.push([`  ${key}`, value]);
        }

        // Query params section
        if (Object.keys(data.query_params).length > 0) {
            rows.push(['', '']); // Empty row
            rows.push(['Query Parameters', '']);
            for (const [key, value] of Object.entries(data.query_params)) {
                rows.push([`  ${key}`, value]);
            }
        }

        // Body section
        rows.push(['', '']); // Empty row
        rows.push(['Body', '']);

        // Flatten body data
        const flattenObject = (obj, prefix = '') => {
            const flattened = [];
            for (const [key, value] of Object.entries(obj)) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    flattened.push(...flattenObject(value, newKey));
                } else {
                    flattened.push([`  ${newKey}`, JSON.stringify(value)]);
                }
            }
            return flattened;
        };

        if (typeof data.body === 'object' && data.body !== null) {
            rows.push(...flattenObject(data.body));
        } else {
            rows.push(['  content', JSON.stringify(data.body)]);
        }

        // Convert to CSV string
        return rows.map(row =>
            row.map(cell => {
                // Escape quotes and wrap in quotes if contains comma, newline, or quotes
                const cellStr = String(cell);
                if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
                    return `"${cellStr.replace(/"/g, '""')}"`;
                }
                return cellStr;
            }).join(',')
        ).join('\n');
    }

    sanitizeXMLKey(key) {
        // XML element names must start with letter or underscore
        // and can only contain letters, digits, hyphens, underscores, and periods
        return key.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/^[^a-zA-Z_]/, '_');
    }

    escapeXML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    copyJsonFromControl() {
        if (!this.currentJsonRaw) {
            this.showNotification('No JSON data to copy', 'error');
            return;
        }

        const button = document.getElementById('copyJsonBtn');
        this.copyToClipboard(this.currentJsonRaw, button);
    }

    openGlobalSearch() {
        const modal = document.getElementById('globalSearchModal');
        const input = document.getElementById('globalSearchInput');

        modal.classList.add('show');
        input.focus();
        input.value = '';

        // Clear previous results
        document.getElementById('globalSearchResults').innerHTML = `
            <div class="search-no-results">
                <p>Enter a search term to search across all your webhooks</p>
            </div>
        `;
    }

    closeGlobalSearch() {
        const modal = document.getElementById('globalSearchModal');
        modal.classList.remove('show');
    }

    async executeGlobalSearch(searchTerm, startDate, endDate) {
        console.log('Executing search with:', {
            searchTerm,
            startDate,
            endDate
        }); // Debug log

        try {
            const response = await fetch('/search_webhooks', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    search_term: searchTerm,
                    start_date: startDate,
                    end_date: endDate
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            this.globalSearchResults = data.results;

            console.log('Search results:', data.results.length); // Debug log

            this.renderGlobalSearchResults(searchTerm, startDate, endDate);

        } catch (error) {
            console.error('Error performing global search:', error);
            document.getElementById('globalSearchResults').innerHTML = `
                <div class="search-no-results">
                    <p>Error performing search. Please try again.</p>
                </div>
            `;
        }
    }

    // NEW METHOD
    renderGlobalSearchResults(searchTerm, startDate, endDate) {
        const resultsContainer = document.getElementById('globalSearchResults');

        if (this.globalSearchResults.length === 0) {
            let message = 'No results found';
            if (searchTerm) message += ` for "${this.escapeHtml(searchTerm)}"`;
            if (startDate || endDate) message += ' in the selected date range';

            resultsContainer.innerHTML = `
            <div class="search-no-results">
                <p>${message}</p>
            </div>
        `;
            return;
        }

        const resultsHtml = this.globalSearchResults.map(result => {
            const timestamp = new Date(result.timestamp);
            const timeString = timestamp.toLocaleString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            // Always create preview text for consistency
            let previewText = '';
            let matchLocation = '';

            // If search term exists, show where it was found and highlight it
            if (searchTerm && result.match_context && result.match_context.length > 0) {
                matchLocation = `Found in: ${result.match_context.join(', ')}`;

                if (result.match_context.includes('body')) {
                    try {
                        const body = JSON.parse(result.body);
                        previewText = JSON.stringify(body).substring(0, 150) + '...';
                    } catch {
                        previewText = result.body.substring(0, 150) + '...';
                    }
                } else if (result.match_context.includes('headers')) {
                    previewText = `Headers: ${result.headers.substring(0, 150)}...`;
                } else if (result.match_context.includes('query_params')) {
                    previewText = `Query: ${result.query_params.substring(0, 150)}...`;
                }

                // Highlight search term in preview
                const regex = new RegExp(`(${this.escapeRegExp(searchTerm)})`, 'gi');
                previewText = this.escapeHtml(previewText).replace(regex, '<span class="search-match-highlight">$1</span>');
            } else {
                // For date-only searches, always show body preview
                try {
                    const body = JSON.parse(result.body);
                    const bodyStr = JSON.stringify(body);
                    if (bodyStr && bodyStr !== '{}' && bodyStr !== 'null') {
                        previewText = bodyStr.substring(0, 150) + '...';
                    }
                } catch {
                    if (result.body && result.body !== '{}' && result.body !== 'null') {
                        previewText = result.body.substring(0, 150) + '...';
                    }
                }

                // If no body, show headers or query params if available
                if (!previewText) {
                    try {
                        const headers = JSON.parse(result.headers);
                        if (headers && Object.keys(headers).length > 0) {
                            previewText = `Headers: ${JSON.stringify(headers).substring(0, 150)}...`;
                        }
                    } catch {}
                }

                if (!previewText) {
                    try {
                        const queryParams = JSON.parse(result.query_params);
                        if (queryParams && Object.keys(queryParams).length > 0) {
                            previewText = `Query: ${JSON.stringify(queryParams).substring(0, 150)}...`;
                        }
                    } catch {}
                }

                // Escape HTML for non-highlighted previews
                if (previewText) {
                    previewText = this.escapeHtml(previewText);
                }
            }

            return `
            <div class="search-result-item" onclick="webhookViewer.selectFromGlobalSearch('${result.webhook_id}', ${result.id})">
                <div class="search-result-header">
                    <div>
                        <span class="search-result-webhook-id">${this.escapeHtml(result.webhook_id)}</span>
                        <span class="search-result-meta"> - ${result.method}</span>
                    </div>
                    <div class="search-result-meta">${timeString}</div>
                </div>
                ${matchLocation ? `<div class="search-result-meta">${matchLocation}</div>` : ''}
                ${previewText ? `<div class="search-result-preview">${previewText}</div>` : ''}
            </div>
        `;
        }).join('');

        let headerText = `Found ${this.globalSearchResults.length} results`;
        if (searchTerm) headerText += ` for "${this.escapeHtml(searchTerm)}"`;
        if (startDate || endDate) headerText += ' in the selected date range';

        resultsContainer.innerHTML = `
        <div style="margin-bottom: 1rem; color: var(--text-secondary);">
            ${headerText}
        </div>
        ${resultsHtml}
    `;
    }

    selectFromGlobalSearch(webhookId, requestId) {
        // Close the search modal
        this.closeGlobalSearch();

        // Show loader in the request list
        const requestsList = document.getElementById("requestsList");
        requestsList.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                Loading requests...
            </div>
        `;

        // Show loader in the details pane
        document.getElementById("requestDetails").innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                Loading...
            </div>
        `;

        // Change the webhook select dropdown
        const webhookSelect = document.getElementById('webhookSelect');
        webhookSelect.value = webhookId;

        // Load the webhook and select the specific request
        this.loadWebhooks().then(() => {
            // Find and select the request
            const request = this.currentRequests.find(r => r.id === requestId);
            if (request) {
                this.selectRequest(requestId);

                // Scroll the request into view in the list
                setTimeout(() => {
                    const requestElement = document.querySelector(`[data-request-id="${requestId}"]`);
                    if (requestElement) {
                        requestElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        });
                    }
                }, 100);
            }
        });
    }

    async loadNotifications() {
        try {
            const response = await fetch('/get_notifications');
            const data = await response.json();

            this.notifications = data.notifications;
            this.unreadCount = data.unread_count;

            this.updateNotificationBadge(this.unreadCount);
            this.renderNotifications();
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    async refreshWebhookSelect(preserveSelection = true) {
        try {
            const select = document.getElementById('webhookSelect');
            const currentValue = select.value;
            const previousIds = Array.from(select.options).map(opt => opt.value);

            const res = await fetch(`/webhook_ids/${this.userId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const {
                ids
            } = await res.json();

            // Find new webhook IDs
            const newIds = ids.filter(id => !previousIds.includes(id));

            // Build options with new indicator
            const optionsHtml = ids.map(id => {
                const isNew = newIds.includes(id);
                const label = isNew ? `${id} 🆕` : id;
                return `<option value="${id}" ${isNew ? 'class="new-webhook-id"' : ''}>${label}</option>`;
            }).join('');

            select.innerHTML = optionsHtml;

            // Restore previous selection if it still exists
            if (preserveSelection && ids.includes(currentValue)) {
                select.value = currentValue;
            } else if (ids.length > 0) {
                // Select the first (most recent) webhook
                select.value = ids[0];
                // Load it if selection changed
                if (currentValue !== ids[0]) {
                    this.loadWebhooks();
                }
            }

            // Animate new webhook IDs
            if (newIds.length > 0) {
                this.animateNewWebhookIds();
                // Auto-select the newest webhook if user has no selection
                if (!preserveSelection || !currentValue) {
                    select.value = ids[0];
                    this.loadWebhooks();
                }
            }

            return newIds;
        } catch (err) {
            console.error('Error refreshing webhookSelect:', err);
            return [];
        }
    }

    animateNewWebhookIds() {
        const select = document.getElementById('webhookSelect');
        const newOptions = select.querySelectorAll('.new-webhook-id');

        // Animate the select element
        select.classList.add('webhook-select-highlight');
        setTimeout(() => {
            select.classList.remove('webhook-select-highlight');
        }, 1000);

        newOptions.forEach(option => {
            // Remove the new indicator after 5 seconds
            setTimeout(() => {
                option.textContent = option.value;
                option.classList.remove('new-webhook-id');
            }, 5000);
        });
    }

    renderNotifications() {
        const notificationList = document.getElementById('notificationList');

        if (this.notifications.length === 0) {
            notificationList.innerHTML = `
                <div class="notification-empty">
                    <p>No new notifications</p>
                </div>
            `;
            return;
        }

        notificationList.innerHTML = this.notifications.map(notification => {
            const timestamp = new Date(notification.timestamp);
            const timeString = timestamp.toLocaleString();

            return `
                <div class="notification-item" onclick="webhookViewer.selectWebhookFromNotification('${notification.webhook_id}', ${notification.id})">
                    <div class="webhook-id">${notification.webhook_id}</div>
                    <div class="details">
                        <span>${notification.method} - ${timeString}</span>
                        <span>${notification.client_ip || 'Unknown IP'}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    selectWebhookFromNotification(webhookId, requestId) {
        // Change the webhook select dropdown
        const webhookSelect = document.getElementById('webhookSelect');
        webhookSelect.value = webhookId;

        // Close notification dropdown
        document.getElementById('notificationDropdown').classList.remove('show');

        // Load the webhook and select the specific request
        this.loadWebhooks().then(() => {
            // Find and select the request
            const request = this.currentRequests.find(r => r.id === requestId);
            if (request) {
                this.selectRequest(requestId);
            }
        });
    }

    updateNotificationBadge(count) {
        const badge = document.getElementById('notificationBadge');
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.toggle('show', count > 0);
    }

    handleNewNotification(data) {
        // Update notification count
        this.unreadCount++;
        this.updateNotificationBadge(this.unreadCount);

        // Reload notifications
        this.loadNotifications();

        // Show toast notification
        this.showNotification(`New webhook received in ${data.webhook_id}!`, 'success');

        // Play notification sound
        this.playNotificationSound();
    }

    animateNotificationIcon() {
        const notificationIcon = document.querySelector('.notification-icon svg');
        notificationIcon.classList.add('pulse');
        setTimeout(() => {
            notificationIcon.classList.remove('pulse');
        }, 2000);
    }

    updateConnectionStatus(connected) {
        const status = document.getElementById('connectionStatus');
        const statusText = status.querySelector('.status-text');

        if (connected) {
            status.classList.add('connected');
            statusText.textContent = 'Connected';
        } else {
            status.classList.remove('connected');
            statusText.textContent = 'Reconnecting...';
        }
    }

    handleNewWebhook(webhookData) {
        // Add the webhook_id to the data if it's missing
        webhookData.webhook_id = this.currentWebhookId;

        // Add the new webhook to the beginning of the list
        this.currentRequests.unshift(webhookData);

        // Re-render the list with animation
        this.renderRequestsList(true);

        // Flash notification
        this.showNotification('New webhook received!');

        // Play a subtle sound (optional)
        this.playNotificationSound();
    }

    handleWebhookDeleted(requestId) {
        // Remove the deleted webhook from the list
        const deletedIndex = this.currentRequests.findIndex(r => r.id === requestId);
        this.currentRequests = this.currentRequests.filter(r => r.id !== requestId);

        // If the deleted webhook was active, handle selection
        if (this.activeRequestId === requestId) {
            if (this.currentRequests.length > 0) {
                // Select the next webhook in the list (or previous if it was the last)
                const nextIndex = Math.min(deletedIndex, this.currentRequests.length - 1);
                const nextRequest = this.currentRequests[nextIndex];
                this.selectRequest(nextRequest.id);
            } else {
                // No requests left in current webhook ID, try to switch to next webhook ID
                this.switchToNextWebhookId();
            }
        }

        // Re-render the list
        this.renderRequestsList();
    }

    async switchToNextWebhookId() {
        try {
            // Get all webhook IDs
            const res = await fetch(`/webhook_ids/${this.userId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const {
                ids
            } = await res.json();

            if (ids.length > 1) {
                // Find current webhook ID index
                const currentIndex = ids.indexOf(this.currentWebhookId);

                // Get next webhook ID (wrap around to first if at the end)
                const nextIndex = (currentIndex + 1) % ids.length;
                const nextWebhookId = ids[nextIndex];

                // Update the select dropdown
                const webhookSelect = document.getElementById('webhookSelect');
                webhookSelect.value = nextWebhookId;

                // Load the new webhook
                await this.loadWebhooks();
            } else {
                // No other webhook IDs available
                this.activeRequestId = null;
                document.getElementById("requestDetails").innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📡</div>
                        <h3>No webhooks available</h3>
                        <p>All webhooks have been deleted. Send a new request to any webhook endpoint.</p>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error switching to next webhook ID:', error);
            this.activeRequestId = null;
            document.getElementById("requestDetails").innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📡</div>
                    <h3>Select a request to view details</h3>
                    <p>Choose a webhook request from the list to see its details, headers, and payload.</p>
                </div>
            `;
        }
    }

    async changePassword() {
        const oldPassword = document.getElementById('oldPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Clear previous errors
        document.getElementById('oldPasswordError').textContent = '';
        document.getElementById('newPasswordError').textContent = '';
        document.getElementById('confirmPasswordError').textContent = '';

        // Validate passwords
        if (newPassword !== confirmPassword) {
            document.getElementById('confirmPasswordError').textContent = 'Passwords do not match';
            return;
        }

        if (newPassword.length < 6) {
            document.getElementById('newPasswordError').textContent = 'Password must be at least 6 characters long';
            return;
        }

        try {
            const response = await fetch('/change_password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    old_password: oldPassword,
                    new_password: newPassword
                })
            });

            const data = await response.json();

            if (response.ok) {
                this.showNotification('Password changed successfully!');
                closePasswordModal();
                document.getElementById('passwordForm').reset();
            } else {
                if (response.status === 401) {
                    document.getElementById('oldPasswordError').textContent = data.error;
                } else {
                    this.showNotification(data.error || 'Failed to change password', 'error');
                }
            }
        } catch (error) {
            console.error('Error changing password:', error);
            this.showNotification('Failed to change password', 'error');
        }
    }

    showNotification(message, type = 'success') {
        // Create a temporary notification
        const notification = document.createElement('div');
        notification.className = `notification ${type === 'error' ? 'error' : ''}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    playNotificationSound() {
        // Create a simple beep sound using Web Audio API
        try {
            const audioContext = new(window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.1;

            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (e) {
            // Ignore audio errors
        }
    }

    handleResize() {
        // Additional responsive handling if needed
        this.adjustLayoutForScreen();
    }

    adjustLayoutForScreen() {
        const container = document.querySelector('.requests-container');
        if (window.innerWidth <= 768) {
            container.style.gridTemplateColumns = '1fr';
        } else {
            container.style.gridTemplateColumns = 'minmax(250px, 25%) 1fr';
        }
    }

    async loadInitialData() {
        try {
            await this.loadWebhooks();
            if (this.currentRequests.length > 0) {
                // Auto-select the most recent request
                const latestRequest = this.currentRequests[0];
                this.displayDetails(latestRequest);
                this.setActiveRequest(latestRequest.id);
            }
        } catch (error) {
            console.error("Error loading initial data:", error);
            this.showError("Failed to load initial data");
        }
    }

    async loadWebhooks() {
        if (this.isLoading) return;

        this.isLoading = true;
        const webhookId = document.getElementById("webhookSelect").value;

        // Check if no webhook ID is selected
        if (!webhookId) {
            this.isLoading = false;
            // Show helpful empty state instead of error
            document.getElementById("requestsList").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🚀</div>
                <p>No webhooks yet</p>
                <small>Click "Test Webhook" to create your first one!</small>
            </div>
        `;
            document.getElementById("requestDetails").innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📡</div>
                <h3>Welcome to Webhook Viewer!</h3>
                <p>Start by creating a webhook ID using the "Test Webhook" button above.</p>
            </div>
        `;
            this.activeRequestId = null;
            return;
        }

        this.currentWebhookId = webhookId;

        // Show loader in the request list
        const requestsList = document.getElementById("requestsList");
        requestsList.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
            Loading requests...
        </div>
    `;

        try {
            const response = await fetch(`/webhook/${this.userId}/${webhookId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            // Sort by timestamp (newest first)
            this.currentRequests = data.sort((a, b) =>
                new Date(b.timestamp) - new Date(a.timestamp)
            );

            this.renderRequestsList();

            // Always display the most recent webhook when switching
            if (this.currentRequests.length > 0) {
                const latestRequest = this.currentRequests[0];
                this.displayDetails(latestRequest);
                this.setActiveRequest(latestRequest.id);
                this.markAsRead(latestRequest.id);
            } else {
                // Show friendly empty state instead of generic message
                document.getElementById("requestDetails").innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📡</div>
                    <h3>No webhooks received yet</h3>
                    <p>Send a request to your webhook endpoint:</p>
                    <code style="display: block; margin: 1rem 0; padding: 0.75rem; background: var(--bg-tertiary); border-radius: var(--radius); font-size: 0.85rem;">
                        https://webhook.agechecked.com/webhook/${this.userId}/${webhookId}
                    </code>
                    <p style="margin-top: 1rem;">Or use the "Test Webhook" button above to send a test request.</p>
                </div>
            `;
                this.activeRequestId = null;
            }

        } catch (error) {
            console.error("Error loading webhooks:", error);
            // Don't show error for expected empty states
            if (error.message.includes('404')) {
                document.getElementById("requestsList").innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <p>No data found</p>
                </div>
            `;
            } else {
                this.showError("Failed to load webhook data");
            }
        } finally {
            this.isLoading = false;
        }
    }

    renderRequestsList(animate = false) {
        const requestsList = document.getElementById("requestsList");

        if (this.currentRequests.length === 0) {
            requestsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📭</div>
                    <p>No requests found</p>
                </div>
            `;
            return;
        }

        requestsList.innerHTML = this.currentRequests.map((request, index) => {
            const isActive = this.activeRequestId === request.id;
            const isUnread = request.is_read === 0;
            const timestamp = new Date(request.timestamp);
            const timeString = timestamp.toLocaleString();
            const clientIp = request.client_ip || 'Unknown';
            const animationClass = animate && index === 0 ? 'new-item' : '';

            return `
                <div class="request-item ${isActive ? 'active' : ''} ${isUnread ? 'unread' : ''} ${animationClass}"
                     data-request-id="${request.id}"
                     onclick="webhookViewer.selectRequest(${request.id})"
                     title="${timeString} - ${request.method || 'POST'} - IP: ${clientIp}">
                    <div class="request-item-header">
                        <div class="timestamp" style="font-weight: ${isUnread ? 'bold' : 'normal'};">
                            ${timeString}
                        </div>
                        <svg class="delete-icon" onclick="event.stopPropagation(); webhookViewer.confirmDelete(${request.id})"
                             xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" title="Delete">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                </svg>
                            </div>
        <div class="webhook-id-display">
        Webhook: ${this.escapeHtml(request.webhook_id)}
        </div>
                            <div class="method-ip-row">
                                <div class="method">${request.method || 'POST'}</div>
                                <div class="client-ip">${clientIp}</div>
                            </div>
                        </div>
                    `;
        }).join('');
    }

    confirmDelete(requestId) {
        // Create confirmation dialog
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';

        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML = `
                    <h3>Delete Request?</h3>
                    <p>Are you sure you want to delete this webhook request? This action cannot be undone.</p>
                    <div class="actions">
                        <button class="btn-primary" onclick="webhookViewer.cancelDelete()">Cancel</button>
                        <button class="btn-danger" onclick="webhookViewer.deleteRequest(${requestId})">Delete</button>
                    </div>
                `;

        document.body.appendChild(overlay);
        document.body.appendChild(dialog);

        // Store references for cleanup
        this.confirmOverlay = overlay;
        this.confirmDialog = dialog;
    }

    cancelDelete() {
        if (this.confirmOverlay) {
            this.confirmOverlay.remove();
            this.confirmOverlay = null;
        }
        if (this.confirmDialog) {
            this.confirmDialog.remove();
            this.confirmDialog = null;
        }
    }

    async deleteRequest(requestId) {
        this.cancelDelete(); // Close confirmation dialog

        try {
            const response = await fetch(`/delete_request/${requestId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Add deleting animation
            const item = document.querySelector(`[data-request-id="${requestId}"]`);
            if (item) {
                item.classList.add('deleting');

                // Wait for animation to complete
                setTimeout(() => {
                    // Remove from local array
                    const deletedIndex = this.currentRequests.findIndex(r => r.id === requestId);
                    this.currentRequests = this.currentRequests.filter(r => r.id !== requestId);

                    // If this was the active request, handle selection
                    if (this.activeRequestId === requestId) {
                        if (this.currentRequests.length > 0) {
                            // Select the next webhook in the list (or previous if it was the last)
                            const nextIndex = Math.min(deletedIndex, this.currentRequests.length - 1);
                            const nextRequest = this.currentRequests[nextIndex];
                            this.selectRequest(nextRequest.id);
                        } else {
                            // No requests left in current webhook ID, try to switch to next webhook ID
                            this.switchToNextWebhookId();
                        }
                    }

                    // Re-render list
                    this.renderRequestsList();

                    // Show success notification
                    this.showNotification('Request deleted successfully');
                }, 300);
            }
        } catch (error) {
            console.error('Error deleting request:', error);
            this.showNotification('Failed to delete request', 'error');
        }
    }

    selectRequest(requestId) {
        const request = this.currentRequests.find(r => r.id === requestId);
        if (request) {
            this.displayDetails(request);
            this.setActiveRequest(requestId);
            this.markAsRead(requestId);
        }
    }

    setActiveRequest(requestId) {
        this.activeRequestId = requestId;

        // Update visual state
        document.querySelectorAll('.request-item').forEach(item => {
            item.classList.remove('active');
        });

        const activeItem = document.querySelector(`[data-request-id="${requestId}"]`);
        if (activeItem) {
            activeItem.classList.add('active');
        }
    }

    async markAsRead(requestId) {
        try {
            await fetch(`/mark_as_read/${requestId}`, {
                method: "POST"
            });

            // Update local state
            const request = this.currentRequests.find(r => r.id === requestId);
            if (request) {
                request.is_read = 1;
                this.renderRequestsList();
            }

            // Reload notifications to update count
            this.loadNotifications();
        } catch (error) {
            console.error("Error marking as read:", error);
        }
    }

    displayDetails(request) {
        try {
            const formattedJson = JSON.stringify(
                JSON.parse(request.body || "{}"),
                null,
                2
            );
            const highlightedJson = Prism.highlight(
                formattedJson,
                Prism.languages.json,
                "json"
            );

            const headers = JSON.parse(request.headers || "{}");
            const timestamp = new Date(request.timestamp);
            const clientIp = request.client_ip || 'Unknown';

            const detailsContainer = document.getElementById("requestDetails");
            detailsContainer.innerHTML = `
                        <div class="details-card">
                            <div class="details-header">
                                <h3>Request Details</h3>
                                <div style="font-size: 0.9rem; color: var(--text-secondary);">
                                    ID: ${request.id}
                                </div>
                            </div>

                            <div class="details-meta">
                                <div class="meta-item">
                                    <div class="meta-label">Method</div>
                                    <div class="meta-value">${request.method || 'POST'}</div>
                                </div>
                                <div class="meta-item">
                                    <div class="meta-label">Timestamp</div>
                                    <div class="meta-value">${timestamp.toLocaleString()}</div>
                                </div>
                                <div class="meta-item">
                                    <div class="meta-label">Client IP</div>
                                    <div class="meta-value">${clientIp}</div>
                                </div>
                            </div>

        <div class="json-section">
    <div class="section-header">
       <div class="section-title">Request Body</div>
    </div>
    <pre class="pretty-json language-json" id="jsonContent">${highlightedJson}</pre>
    </div>

    ${Object.keys(headers).length > 0 ? `
        <div class="json-section">
            <div class="section-header">
                <div class="section-title">Request Headers</div>
            </div>
            <table class="headers-table">
                <thead>
                    <tr>
                        <th>Header</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    ${Object.entries(headers).map(([key, value]) => `
                        <tr>
                            <td>${this.escapeHtml(key)}</td>
                            <td>${this.escapeHtml(value)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    ` : ''}
                        </div>
                    `;

            // Store the original content for search functionality
            this.originalJsonContent = highlightedJson;
            this.currentSearchTerm = '';
            this.jsonSearchMatches = [];
            this.currentMatchIndex = -1;
            this.currentJsonRaw = formattedJson;

            // Clear any previous search
            const searchInput = document.getElementById('jsonSearchInput');
            if (searchInput) {
                searchInput.value = '';
            }

            const jsonTools = document.getElementById('jsonTools');
            if (jsonTools) {
                jsonTools.style.display = 'flex';
            }

        } catch (error) {
            console.error("Error displaying details:", error);
            this.showError("Failed to display request details");
        }
    }

    async copyToClipboard(text, button) {
        try {
            await navigator.clipboard.writeText(text);

            const originalText = button.textContent;
            button.textContent = "Copied!";
            button.classList.add('copied');
            button.disabled = true;

            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
                button.disabled = false;
            }, 2000);
        } catch (error) {
            console.error("Failed to copy to clipboard:", error);
            // Fallback for older browsers
            this.fallbackCopyTextToClipboard(text);
        }
    }

    fallbackCopyTextToClipboard(text) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Fallback: Unable to copy', err);
        }

        document.body.removeChild(textArea);
    }

    searchJson(searchTerm) {
        const jsonPre = document.getElementById('jsonContent');
        const searchInfo = document.getElementById('searchInfo');
        const clearButton = document.getElementById('jsonSearchClear');

        if (!jsonPre || !this.originalJsonContent) return;

        this.currentSearchTerm = searchTerm.trim();

        // Show/hide clear button
        if (clearButton) {
            clearButton.classList.toggle('show', this.currentSearchTerm.length > 0);
        }

        if (!this.currentSearchTerm) {
            // Reset to original content
            jsonPre.innerHTML = this.originalJsonContent;
            searchInfo.textContent = '';
            this.jsonSearchMatches = [];
            this.currentMatchIndex = -1;
            return;
        }

        // Create a temporary element to work with text content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = this.originalJsonContent;
        const textContent = tempDiv.textContent || tempDiv.innerText || '';

        // Find all matches
        this.jsonSearchMatches = [];
        const regex = new RegExp(this.escapeRegExp(this.currentSearchTerm), 'gi');
        let match;

        while ((match = regex.exec(textContent)) !== null) {
            this.jsonSearchMatches.push({
                index: match.index,
                length: match[0].length
            });
        }

        if (this.jsonSearchMatches.length === 0) {
            searchInfo.textContent = 'No matches found';
            searchInfo.style.color = 'var(--danger-color)';
            return;
        }

        // Highlight all matches
        let highlightedContent = this.originalJsonContent;
        const searchRegex = new RegExp(`(${this.escapeRegExp(this.currentSearchTerm)})`, 'gi');

        // Replace within text nodes only, preserving HTML structure
        highlightedContent = this.highlightSearchTerms(highlightedContent, searchRegex);

        jsonPre.innerHTML = highlightedContent;

        // Update search info
        this.currentMatchIndex = 0;
        this.updateSearchInfo();

        // Scroll to and highlight first match
        this.scrollToMatch(0);
        this.highlightCurrentMatch(0);
    }

    highlightSearchTerms(html, regex) {
        // Parse HTML and only replace in text nodes
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;

        const walker = document.createTreeWalker(
            tempDiv,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );

        const textNodes = [];
        let node;

        while (node = walker.nextNode()) {
            textNodes.push(node);
        }

        textNodes.forEach(textNode => {
            const text = textNode.textContent;
            const matches = [...text.matchAll(regex)];

            if (matches.length > 0) {
                const span = document.createElement('span');
                let lastIndex = 0;

                matches.forEach(match => {
                    // Add text before match
                    if (match.index > lastIndex) {
                        span.appendChild(
                            document.createTextNode(text.substring(lastIndex, match.index))
                        );
                    }

                    // Add highlighted match
                    const highlight = document.createElement('span');
                    highlight.className = 'json-highlight';
                    highlight.textContent = match[0];
                    span.appendChild(highlight);

                    lastIndex = match.index + match[0].length;
                });

                // Add remaining text
                if (lastIndex < text.length) {
                    span.appendChild(
                        document.createTextNode(text.substring(lastIndex))
                    );
                }

                textNode.parentNode.replaceChild(span, textNode);
            }
        });

        return tempDiv.innerHTML;
    }

    handleSearchKeydown(event) {
        if (event.key === 'Enter' || event.key === 'ArrowDown') {
            event.preventDefault();
            if (this.jsonSearchMatches.length > 0) {
                // Move to next match
                this.currentMatchIndex = (this.currentMatchIndex + 1) % this.jsonSearchMatches.length;
                this.updateSearchInfo();
                this.scrollToMatch(this.currentMatchIndex);
                this.highlightCurrentMatch(this.currentMatchIndex);
            }
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            if (this.jsonSearchMatches.length > 0) {
                // Move to previous match
                this.currentMatchIndex = this.currentMatchIndex - 1;
                if (this.currentMatchIndex < 0) {
                    this.currentMatchIndex = this.jsonSearchMatches.length - 1;
                }
                this.updateSearchInfo();
                this.scrollToMatch(this.currentMatchIndex);
                this.highlightCurrentMatch(this.currentMatchIndex);
            }
        } else if (event.key === 'Escape') {
            this.clearJsonSearch();
        }
    }

    updateSearchInfo() {
        const searchInfo = document.getElementById('searchInfo');
        if (this.jsonSearchMatches.length > 0) {
            searchInfo.innerHTML = `
            <span>${this.currentMatchIndex + 1} of ${this.jsonSearchMatches.length}</span>
            <span style="margin-left: 10px; font-size: 0.75rem; opacity: 0.7;">
                ↑↓ to navigate
            </span>
        `;
            searchInfo.style.color = 'var(--text-secondary)';
        }
    }

    scrollToMatch(index) {
        const highlights = document.querySelectorAll('.json-highlight');
        if (highlights[index]) {
            highlights[index].scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            // Add a temporary animation to draw attention
            highlights[index].style.animation = 'pulse 1s ease-out';
            setTimeout(() => {
                highlights[index].style.animation = '';
            }, 1000);
        }
    }

    highlightCurrentMatch(index) {
        // Remove previous current match highlight
        document.querySelectorAll('.json-highlight-current').forEach(el => {
            el.classList.remove('json-highlight-current');
        });

        // Add current match highlight
        const highlights = document.querySelectorAll('.json-highlight');
        if (highlights[index]) {
            highlights[index].classList.add('json-highlight-current');
        }
    }

    clearJsonSearch() {
        const searchInput = document.getElementById('jsonSearchInput');
        const jsonPre = document.getElementById('jsonContent');
        const searchInfo = document.getElementById('searchInfo');
        const clearButton = document.getElementById('jsonSearchClear');

        if (searchInput) searchInput.value = '';
        if (jsonPre && this.originalJsonContent) {
            jsonPre.innerHTML = this.originalJsonContent;
        }
        if (searchInfo) searchInfo.textContent = '';
        if (clearButton) clearButton.classList.remove('show');

        this.currentSearchTerm = '';
        this.jsonSearchMatches = [];
        this.currentMatchIndex = -1;
    }

    escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    showError(message) {
        const requestDetails = document.getElementById("requestDetails");
        requestDetails.innerHTML = `
                    <div class="details-card">
                        <div class="empty-state">
                            <div class="empty-state-icon">⚠️</div>
                            <h3>Error</h3>
                            <p>${message}</p>
                            <button onclick="webhookViewer.loadWebhooks()" class="btn-primary">
                                Try Again
                            </button>
                        </div>
                    </div>
                `;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeForAttribute(text) {
        return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Global functions
function toggleProfileMenu() {
    const dropdown = document.getElementById('profileDropdown');
    dropdown.classList.toggle('show');
}

function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    dropdown.classList.toggle('show');
    // refresh the <select> each time the bell is clicked
    window.webhookViewer.refreshWebhookSelect();
}

async function markAllNotificationsRead() {
    try {
        const response = await fetch('/mark_all_notifications_read', {
            method: 'POST'
        });

        if (response.ok) {
            window.webhookViewer.loadNotifications();
            window.webhookViewer.showNotification('All notifications cleared');
        }
    } catch (error) {
        console.error('Error clearing notifications:', error);
    }
}

function openPasswordModal() {
    document.getElementById('passwordModal').classList.add('show');
    document.getElementById('profileDropdown').classList.remove('show');
    // Clear any previous errors
    document.getElementById('passwordForm').reset();
    document.querySelectorAll('.error').forEach(el => el.textContent = '');
}

function closePasswordModal() {
    document.getElementById('passwordModal').classList.remove('show');
    document.getElementById('passwordForm').reset();
    document.querySelectorAll('.error').forEach(el => el.textContent = '');
}

function openAboutModal() {
    document.getElementById('aboutModal').classList.add('show');
    document.getElementById('profileDropdown').classList.remove('show');
    // Set user ID in the URL example
    const userId = document.querySelector('meta[name="user-id"]')?.content || 'YOUR_USER_ID';
    document.querySelector('.endpoint-url .highlight').textContent = userId;
}

function closeAboutModal() {
    document.getElementById('aboutModal').classList.remove('show');
}

function copyWebhookUrlToClipboard() {
    const urlElement = document.querySelector('.endpoint-url .url-text');
    const text = urlElement.textContent || urlElement.innerText;
    navigator.clipboard.writeText(text).then(() => {}).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Close modal when clicking outside
document.getElementById('aboutModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closeAboutModal();
    }
});

function logout() {
    window.location.href = "/logout";
}

// Initialize the application
document.addEventListener("DOMContentLoaded", () => {
    window.webhookViewer = new WebhookViewer();
});

// Close modal when clicking outside
document.getElementById('passwordModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
        closePasswordModal();
    }
});