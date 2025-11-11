# TheWebHook - Developer Tools Dashboard

A comprehensive multi-application dashboard built with Flask and JavaScript. TheWebHook provides a suite of developer tools including real-time webhook monitoring, JSON comparison, HTTP status code testing, and AWS log analysis - all in one unified platform with a modern, theme-aware interface.

## Features

### Core Platform
- **Multi-Application Dashboard**: Unified interface for multiple developer tools
- **User Management**: Secure authentication with role-based access control
- **Admin Panel**: Comprehensive user and application management
- **Theme Support**: Dark/Light/System theme modes with persistent settings
- **Real-time Updates**: Server-Sent Events (SSE) for live notifications
- **Responsive Design**: Fully functional on desktop and mobile devices

### Available Applications

#### 1. Webhook Viewer
Real-time webhook monitoring and management application.
- **Live Updates**: Instant webhook notifications via SSE
- **Request Details**: View headers, body, query parameters, and metadata
- **Smart Organization**: Group webhooks by unique webhook IDs
- **Search & Filter**: Global search across all webhooks with highlighting
- **Export Options**: Download webhooks in JSON, XML, or CSV formats
- **Client IP Tracking**: Captures client IP addresses with proxy support
- **Bulk Operations**: Mark all as read, delete individual requests

#### 2. JSON Comparison Tool
Compare two JSON objects and visualize their differences.
- **Side-by-Side Comparison**: View JSON objects in parallel
- **Visual Diff Highlighting**: Color-coded additions, removals, and changes
- **Format & Validate**: Auto-format and validate JSON syntax
- **Sample Data**: Load sample JSON for testing
- **Statistics**: Count of added, removed, and changed fields

#### 3. HTTP Status Code Tester
Test and simulate different HTTP status codes.
- **Complete Status Code Coverage**: Support for 100-599 status codes
- **Multiple HTTP Methods**: GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS
- **Quick Links**: One-click access to common status codes
- **Request/Response Details**: View complete HTTP transaction information
- **Documentation**: Built-in reference for HTTP status codes

#### 4. AWS Log CSV Comparison Tool (Enhanced with AI-like Intelligence)
Compare AWS CloudWatch log exports and identify changes with advanced intelligent analysis.

**Core Features:**
- **File Upload or Paste**: Support for CSV/TSV file upload or direct paste
- **Smart Key Detection**: Advanced algorithm that scores columns based on:
  - Name patterns (id, requestId, uuid, etc.)
  - Uniqueness ratio (perfect uniqueness scores highest)
  - Sequential number detection
  - UUID and timestamp pattern recognition
  - Null value analysis
- **Change Tracking**: Identify added, removed, modified, and fuzzy-matched log entries
- **Visual Diff**: Color-coded row highlighting with enhanced change details
- **Statistics Dashboard**: Comprehensive summary of changes with counts
- **Export Results**: Download comparison results as CSV
- **Flexible Filtering**: Show/hide different change types

**Intelligent Analysis Features:**
- **Fuzzy Matching**: Find similar records even when keys don't match exactly (85% similarity threshold)
  - Uses Levenshtein distance algorithm
  - Helps identify records with minor key variations
  - Shows similarity percentage for each match
- **Semantic Change Detection**:
  - Numeric changes with percentage calculation (e.g., "+10.5 (+25%)")
  - Timestamp shifts with time difference (e.g., "+3.5 hours")
  - Type change detection (string → number)
- **Pattern Detection**:
  - Identifies columns that consistently change across records
  - Detects bulk insert/delete operations
  - Recognizes field renaming (e.g., "userId" → "user_id")
  - Finds consistent patterns in modifications
- **Data Quality Analysis**:
  - Duplicate key detection in both datasets
  - High null/empty value rate warnings (>10%)
  - Data type consistency validation
  - Schema mismatch identification
- **Smart Recommendations**:
  - Capacity planning suggestions for data growth
  - Data retention policy confirmations
  - Schema change documentation reminders
  - Data validation recommendations
  - Fuzzy match verification prompts

**Insights Panel:**
- Summary of comparison results
- Detected patterns and anomalies
- Data quality issues with severity levels
- Actionable recommendations for next steps

### Admin Features
- **User Management**: Create, activate/deactivate, and delete users
- **Application Assignment**: Control which applications users can access
- **Menu Management**: Add, edit, reorder, and remove applications
- **Bulk Operations**: Manage multiple users simultaneously
- **Audit Trail**: Track user access and application usage

## Tech Stack

### Backend
- **Flask** - Python web framework
- **MySQL** - Database for persistent storage
- **PyMySQL** - MySQL database connector
- **bcrypt** - Secure password hashing
- **Server-Sent Events** - Real-time communication

### Frontend
- **Vanilla JavaScript** - No framework dependencies
- **CSS3** - Modern styling with CSS variables and theming
- **Prism.js** - Syntax highlighting
- **HTML5** - Semantic markup

## Installation

### Prerequisites
- Python 3.7+
- MySQL 5.7+
- pip (Python package manager)

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd TheWebHook
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up the database**
   ```sql
   CREATE DATABASE webhook_viewer;
   USE webhook_viewer;

   -- Users table
   CREATE TABLE users (
       id INT AUTO_INCREMENT PRIMARY KEY,
       username VARCHAR(255) UNIQUE NOT NULL,
       password_hash VARCHAR(255) NOT NULL,
       status TINYINT DEFAULT 0,
       is_admin TINYINT DEFAULT 0
   );

   -- Webhook responses table
   CREATE TABLE webhook_responses (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL,
       webhook_id VARCHAR(255) NOT NULL,
       method VARCHAR(10),
       headers TEXT,
       body TEXT,
       query_params TEXT,
       timestamp DATETIME NOT NULL,
       is_read TINYINT DEFAULT 0,
       client_ip VARCHAR(45),
       FOREIGN KEY (user_id) REFERENCES users(id)
   );

   -- Menu items table (applications)
   CREATE TABLE menu_items (
       id INT AUTO_INCREMENT PRIMARY KEY,
       title VARCHAR(255) NOT NULL,
       description TEXT,
       icon VARCHAR(50),
       route VARCHAR(255) NOT NULL,
       display_order INT DEFAULT 0,
       is_active TINYINT DEFAULT 1,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );

   -- User menu assignments (optional - for per-user app access)
   CREATE TABLE user_menu_items (
       id INT AUTO_INCREMENT PRIMARY KEY,
       user_id INT NOT NULL,
       menu_item_id INT NOT NULL,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
       FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE,
       UNIQUE KEY unique_user_menu (user_id, menu_item_id)
   );

   -- Create indexes for performance
   CREATE INDEX idx_user_id ON user_menu_items(user_id);
   CREATE INDEX idx_menu_item_id ON user_menu_items(menu_item_id);
   ```

4. **Insert default applications**
   ```sql
   INSERT INTO menu_items (title, description, icon, route, display_order) VALUES
   ('Webhook Viewer', 'Monitor and manage webhooks in real-time', '📡', '/webhook-viewer', 1),
   ('JSON Comparison Tool', 'Compare two JSON objects and visualize differences', '🔄', '/json-compare', 2),
   ('HTTP Status Code Tester', 'Test and simulate different HTTP status codes', '🌐', '/http-codes', 3),
   ('AWS Log Comparison Tool', 'Compare AWS CloudWatch log exports', '📊', '/aws-log-compare', 4);
   ```

5. **Configure environment variables**
   Create a `.env` file in the root directory:
   ```env
   # Flask Configuration
   SECRET_KEY=your-secret-key-here
   FLASK_DEBUG=False
   LOGGING_ENABLED=True

   # Server Configuration
   RUNNING_HOST=0.0.0.0
   RUNNING_PORT=5000

   # Database Configuration
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=your-db-user
   DB_PASSWORD=your-db-password
   DB_NAME=webhook_viewer
   ```

6. **Run the application**
   ```bash
   python app.py
   ```

7. **Access the application**
   Open your browser and navigate to `http://localhost:5000`

## Usage

### Creating an Account
1. Navigate to `/register`
2. Enter username and password
3. Contact admin to activate account (accounts are disabled by default)

### Admin Access
1. Set a user as admin in the database:
   ```sql
   UPDATE users SET is_admin = 1 WHERE username = 'your-username';
   ```
2. Admins can access the admin panel via the header menu
3. Manage users, applications, and permissions from `/admin/users` and `/admin/menu-items`

### Using Applications

#### Webhook Viewer
Send HTTP requests to:
```
http://your-domain:5000/webhook/{user_id}/{webhook_id}
```

Example using curl:
```bash
curl -X POST http://localhost:5000/webhook/1/test-webhook \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, World!"}'
```

#### JSON Comparison Tool
1. Paste or type JSON in left and right panels
2. Click "Compare" to see differences
3. View added (green), removed (red), and changed (yellow) fields

#### HTTP Status Code Tester
1. Access the tester at `/http-codes`
2. Click on any status code link or use the endpoint directly
3. Test endpoint: `/httpcode/{code}` (e.g., `/httpcode/404`)

#### AWS Log Comparison Tool
1. Upload or paste CSV/TSV log files (original and new)
2. Select or auto-detect key column for comparison
3. Click "Compare Logs" to see differences
4. Filter by change type (Added/Removed/Modified/Unchanged)
5. Export results as CSV

### Keyboard Shortcuts
- `Ctrl/Cmd + K`: Open global search (Webhook Viewer)
- `Enter`: Navigate through search results
- `Escape`: Close modals and clear searches

## API Endpoints

### Public Endpoints
- `GET /`: Login page
- `POST /`: Process login
- `GET /register`: Registration page
- `POST /register`: Process registration
- `GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS /webhook/{user_id}/{webhook_id}`: Webhook receiver

### Authenticated Endpoints
- `GET /dashboard`: Main dashboard with application menu
- `GET /webhook-viewer`: Webhook monitoring application
- `GET /json-compare`: JSON comparison tool
- `GET /http-codes`: HTTP status code tester
- `GET /aws-log-compare`: AWS log comparison tool
- `GET /logout`: Logout user
- `POST /change_password`: Change user password
- `GET /events/{user_id}`: SSE endpoint for real-time updates

### Admin Endpoints
- `GET /admin/users`: User management interface
- `GET /admin/menu-items`: Application management interface
- `GET /api/users`: List all users
- `POST /api/users`: Create new user
- `PUT /api/users/{id}`: Update user
- `DELETE /api/users/{id}`: Delete user
- `GET /api/menu-items`: List all applications
- `POST /api/menu-items`: Create new application
- `PUT /api/menu-items/{id}`: Update application
- `DELETE /api/menu-items/{id}`: Remove application

## Security Features
- **Password Hashing**: bcrypt with salt rounds
- **Session Management**: Secure session-based authentication
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Input sanitization and output encoding
- **CSRF Protection**: Session validation
- **Role-Based Access**: Admin and user permissions
- **Per-User App Access**: Optional application-level restrictions

## Browser Support
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Project Structure
```
TheWebHook/
├── app.py                  # Main Flask application
├── requirements.txt        # Python dependencies
├── .env                    # Environment configuration
├── templates/              # HTML templates
│   ├── base.html          # Base template with header/nav
│   ├── menu.html          # Dashboard/menu page
│   ├── webhook-viewer.html
│   ├── json-compare.html
│   ├── httpcodes.html
│   ├── aws-log-compare.html
│   └── admin/             # Admin templates
├── static/                 # Static assets
│   ├── css/               # Stylesheets
│   │   ├── global-styles.css
│   │   ├── styles.css
│   │   ├── json-compare-styles.css
│   │   ├── httpcodes-styles.css
│   │   └── aws-log-compare-styles.css
│   └── js/                # JavaScript files
│       ├── global-functions.js
│       ├── modal-utils.js
│       ├── webhook-viewer.js
│       ├── json-compare.js
│       ├── httpcodes.js
│       └── aws-log-compare.js
└── README.md
```

## Adding New Applications

1. **Create template** in `templates/your-app.html` extending `base.html`
2. **Create CSS** in `static/css/your-app-styles.css`
3. **Create JS** in `static/js/your-app.js`
4. **Add route** in `app.py`:
   ```python
   @app.route("/your-app")
   @login_required
   def your_app():
       return render_template("your-app.html", username=session.get("username"))
   ```
5. **Register in database** via Admin UI at `/admin/menu-items`
6. **Assign to users** via Admin UI at `/admin/users`

## Troubleshooting

### Common Issues

1. **SSE Connection Fails**
   - Check if your reverse proxy supports SSE
   - Ensure `X-Accel-Buffering: no` header is set for nginx
   - Verify EventSource is not blocked by CORS

2. **Database Connection Error**
   - Verify MySQL is running: `systemctl status mysql`
   - Check database credentials in `.env`
   - Ensure database and tables exist
   - Test connection: `mysql -u user -p database_name`

3. **Webhooks Not Appearing**
   - Verify correct user_id and webhook_id in URL
   - Check browser console for errors
   - Ensure SSE connection is established
   - Check logs: `tail -f app.log`

4. **Theme Not Persisting**
   - Check if localStorage is enabled in browser
   - Clear browser cache and cookies
   - Try in incognito/private mode

5. **Applications Not Showing**
   - Ensure `menu_items` table has entries
   - Check user assignments in `user_menu_items`
   - Verify user account is activated (`status = 1`)
   - Check browser console for JavaScript errors

6. **Admin Panel Access Denied**
   - Verify user has admin privileges: `SELECT is_admin FROM users WHERE username = 'your-username'`
   - Set admin flag: `UPDATE users SET is_admin = 1 WHERE username = 'your-username'`
   - Log out and log back in

## Contributing
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request

## License
MIT License - See LICENSE file for details

## Support
For issues and questions, please create an issue in the repository.

## Changelog

### Version 2.0
- Refactored to multi-application platform
- Added application management system
- Added user-specific application access control
- Added AWS Log Comparison Tool
- Improved theme system with base template
- Enhanced admin panel capabilities

### Version 1.0
- Initial release with Webhook Viewer
- JSON Comparison Tool
- HTTP Status Code Tester
- Basic user authentication
- Theme support
