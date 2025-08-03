# Webhook Viewer Application

A real-time webhook monitoring and management application built with Flask and JavaScript. This application allows users to receive, view, and manage webhooks with a modern, responsive interface.

## Features

### Core Functionality
- **Real-time Webhook Reception**: Capture HTTP requests sent to unique webhook endpoints
- **Live Updates**: Server-Sent Events (SSE) for instant webhook notifications
- **Multi-User Support**: Secure authentication system with individual user accounts
- **Smart Webhook Management**: Organize webhooks by unique webhook IDs

### User Interface
- **Modern Design**: Clean, responsive interface with dark/light/system theme support
- **Real-time Notifications**: Badge notifications for new webhooks
- **Advanced Search**: Global search across all webhooks with highlighting
- **JSON Viewer**: Syntax-highlighted JSON display with search functionality
- **Export Options**: Download webhooks in JSON, XML, or CSV formats

### Key Features
- **Smart Dropdown**: Auto-refreshing webhook selector with new webhook indicators
- **Request Details**: View complete request information including headers, body, and metadata
- **Client IP Tracking**: Captures client IP addresses with proxy support
- **Bulk Operations**: Mark all as read, delete individual requests
- **Mobile Responsive**: Fully functional on mobile devices

## Tech Stack

### Backend
- **Flask**: Python web framework
- **MySQL**: Database for persistent storage
- **PyMySQL**: MySQL database connector
- **bcrypt**: Password hashing
- **Server-Sent Events**: Real-time communication

### Frontend
- **Vanilla JavaScript**: No framework dependencies
- **Prism.js**: Syntax highlighting
- **CSS3**: Modern styling with CSS variables
- **HTML5**: Semantic markup

## Installation

### Prerequisites
- Python 3.7+
- MySQL 5.7+
- pip (Python package manager)

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd webhook-viewer
   ```

2. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up the database**
   ```sql
   CREATE DATABASE webhook_viewer;
   USE webhook_viewer;

   CREATE TABLE users (
       id INT AUTO_INCREMENT PRIMARY KEY,
       username VARCHAR(255) UNIQUE NOT NULL,
       password_hash VARCHAR(255) NOT NULL,
       status TINYINT DEFAULT 0
   );

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
   ```

4. **Configure environment variables**
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

5. **Run the application**
   ```bash
   python app.py
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:5000`

## Usage

### Creating an Account
1. Navigate to `/register`
2. Enter username and password
3. Contact admin to activate account (accounts are disabled by default)

### Receiving Webhooks
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

### Viewing Webhooks
1. Log in to the application
2. Select a webhook ID from the dropdown
3. Click on any request to view details
4. Use search to find specific content

### Keyboard Shortcuts
- `Ctrl/Cmd + K`: Open global search
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
- `GET /dashboard`: Main application interface
- `GET /logout`: Logout user
- `GET /webhook_ids/{user_id}`: Get user's webhook IDs
- `POST /search_webhooks`: Global search
- `POST /change_password`: Change user password
- `POST /mark_as_read/{request_id}`: Mark webhook as read
- `GET /get_notifications`: Get unread notifications
- `POST /mark_all_notifications_read`: Mark all as read
- `DELETE /delete_request/{request_id}`: Delete a webhook
- `GET /events/{user_id}`: SSE endpoint for real-time updates

## Features in Detail

### Real-time Updates
The application uses Server-Sent Events to provide real-time updates without polling. When a new webhook arrives:
- The webhook list updates automatically
- Notifications appear instantly
- The UI updates smoothly without refresh

### Smart Webhook Selector
- Auto-refreshes when clicked or focused
- Shows new webhook IDs with 🆕 indicator
- Preserves selection during updates
- Animates when new webhooks arrive

### Search Capabilities
- **Global Search**: Search across all webhooks and webhook IDs
- **JSON Search**: Search within displayed JSON with highlighting
- **Real-time Results**: Instant search results as you type

### Theme Support
- Dark theme (default)
- Light theme with custom color palette
- System theme (follows OS preference)
- Persistent theme selection

## Security Features
- Password hashing with bcrypt
- Session-based authentication
- SQL injection prevention
- XSS protection
- CSRF protection via session validation

## Browser Support
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Contributing
1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
[Specify your license here]

## Troubleshooting

### Common Issues

1. **SSE Connection Fails**
   - Check if your reverse proxy supports SSE
   - Ensure `X-Accel-Buffering: no` header is set

2. **Database Connection Error**
   - Verify MySQL is running
   - Check database credentials in `.env`
   - Ensure database and tables exist

3. **Webhooks Not Appearing**
   - Verify correct user_id and webhook_id in URL
   - Check browser console for errors
   - Ensure SSE connection is established

4. **Theme Not Persisting**
   - Check if localStorage is enabled
   - Clear browser cache

## Support
For issues and questions, please create an issue in the repository.