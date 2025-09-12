from flask import Flask, request, jsonify, render_template, redirect, url_for, session, Response
import pymysql
import bcrypt
import json
from datetime import datetime, timezone
from functools import wraps
import logging
import traceback
import sys
import threading
from queue import Queue, Empty

import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"
LOGGING_ENABLED = os.getenv("LOGGING_ENABLED", "False").lower() == "true"
RUNNING_HOST = os.getenv("RUNNING_HOST")
RUNNING_PORT = os.getenv("RUNNING_PORT")

app = Flask(__name__)
app.secret_key = SECRET_KEY

# Configuration for SSE compatibility
app.config['PROPAGATE_EXCEPTIONS'] = True
app.config['PRESERVE_CONTEXT_ON_EXCEPTION'] = False

db_config = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT")),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "connect_timeout": 10
}

# Logging Configuration
LOGGING_ENABLED = LOGGING_ENABLED
logging.basicConfig(
    filename='app.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s: %(message)s'
)
logger = logging.getLogger(__name__)

# SSE event queues for each user
user_event_queues = {}
queue_lock = threading.Lock()


def log(message):
    if LOGGING_ENABLED:
        logger.info(message)


# Global exception handler
def handle_uncaught_exception(exc_type, exc_value, exc_traceback):
    log(f"Unhandled exception: {exc_type.__name__}: {exc_value}\nStack trace: {''.join(traceback.format_tb(exc_traceback))}")
    sys.__excepthook__(exc_type, exc_value, exc_traceback)


sys.excepthook = handle_uncaught_exception


def get_client_ip():
    """
    Get the client's IP address, accounting for proxies and load balancers.
    Checks headers in order of preference: X-Forwarded-For, X-Real-IP, then remote_addr.
    """
    # Check X-Forwarded-For header (most common for proxies/load balancers)
    if request.environ.get('HTTP_X_FORWARDED_FOR'):
        # X-Forwarded-For can contain multiple IPs, take the first one (original client)
        forwarded_ips = request.environ.get('HTTP_X_FORWARDED_FOR').split(',')
        client_ip = forwarded_ips[0].strip()
    # Check X-Real-IP header (used by some proxies like nginx)
    elif request.environ.get('HTTP_X_REAL_IP'):
        client_ip = request.environ.get('HTTP_X_REAL_IP')
    # Fallback to direct connection IP
    else:
        client_ip = request.environ.get('REMOTE_ADDR')

    return client_ip


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            log(f"Unauthorized access attempt to {request.path}")
            return redirect(url_for("login"))
        return f(*args, **kwargs)

    return decorated_function


def notify_user_webhook(user_id, webhook_id, webhook_data):
    """Send SSE notification to specific user about new webhook"""
    with queue_lock:
        if user_id in user_event_queues:
            # Send to all active connections for this user
            for queue in user_event_queues[user_id]:
                event_data = {
                    'type': 'new_webhook',
                    'webhook_id': webhook_id,
                    'data': webhook_data
                }
                queue.put(json.dumps(event_data))


def notify_user_notification(user_id, webhook_id, webhook_data):
    """Send SSE notification about webhooks from other webhook IDs"""
    with queue_lock:
        if user_id in user_event_queues:
            # Send notification event to all active connections for this user
            for queue in user_event_queues[user_id]:
                event_data = {
                    'type': 'new_notification',
                    'webhook_id': webhook_id,
                    'data': webhook_data
                }
                queue.put(json.dumps(event_data))


@app.route("/", methods=["GET", "POST"])
def login():
    try:
        log("Entering login route")
        if "user_id" in session:
            log(f"User {session['user_id']} already logged in, redirecting to dashboard")
            return redirect(url_for("dashboard"))

        if request.method == "POST":
            log("Processing POST request")
            username = request.form.get("username")
            password = request.form.get("password")
            if not username or not password:
                log("Missing username or password in form data")
                return render_template("login.html", error="Username and password are required")

            log(f"Login attempt for username: {username}")

            log(f"Attempting database connection with config: {db_config}")
            try:
                conn = pymysql.connect(
                    host=db_config["host"],
                    port=db_config["port"],
                    user=db_config["user"],
                    password=db_config["password"],
                    database=db_config["database"],
                    connect_timeout=db_config["connect_timeout"]
                )
                log("Database connection successful")
            except pymysql.MySQLError as db_err:
                log(f"Failed to connect to database: {str(db_err)}")
                return render_template("login.html", error=f"Database connection failed: {str(db_err)}"), 500
            except Exception as conn_err:
                log(f"Unexpected connection error: {str(conn_err)}\nStack trace: {traceback.format_exc()}")
                return render_template("login.html", error="Unexpected database connection error"), 500

            cursor = conn.cursor(pymysql.cursors.DictCursor)  # Use DictCursor for dictionary results
            log("Executing query to fetch user")
            cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
            user = cursor.fetchone()
            log(f"Query result: user = {user}")

            if user:
                log(f"User found: {user}")
                if user.get("status") == 0:
                    log(f"Login failed: Account disabled for {username}")
                    return render_template("login.html", error="Your account is disabled. Please contact support.")

                if "password_hash" not in user or not user["password_hash"]:
                    log(f"Login failed: No password hash for {username}")
                    return render_template("login.html", error="Invalid user data")

                log("Checking password with bcrypt")
                if bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
                    session["user_id"] = user["id"]
                    log(f"Login successful for user {username} (ID: {user['id']})")
                    return redirect(url_for("dashboard"))
                else:
                    log(f"Login failed: Incorrect password for {username}")
                    return render_template("login.html", error="Invalid username or password")
            else:
                log(f"Login failed: No user found for {username}")
                return render_template("login.html", error="Invalid username or password")

        log("Rendering login page for GET request")
        return render_template("login.html")

    except Exception as e:
        log(f"Unexpected error during login: {str(e)}\nStack trace: {traceback.format_exc()}")
        return jsonify({"error": "An unexpected error occurred"}), 500
    finally:
        if 'conn' in locals() and conn.open:
            log("Closing database connection")
            cursor.close()
            conn.close()


@app.route("/logout")
@login_required
def logout():
    user_id = session.get("user_id")
    session.pop("user_id", None)
    log(f"User {user_id} logged out")
    return redirect(url_for("login"))


@app.route("/dashboard")
@login_required
def dashboard():
    user_id = session["user_id"]
    log(f"User {user_id} accessed dashboard")

    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor()

        # Get webhook IDs
        cursor.execute(
            "SELECT r.webhook_id FROM webhook_responses r INNER JOIN (SELECT webhook_id, MAX(timestamp) AS max_ts FROM webhook_responses WHERE user_id = %s GROUP BY webhook_id) latest ON r.webhook_id = latest.webhook_id AND r.timestamp = latest.max_ts WHERE r.user_id = %s ORDER BY r.timestamp DESC",
            (user_id, user_id))
        webhook_ids = [row[0] for row in cursor.fetchall()]

        # Get username for display
        cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
        user_result = cursor.fetchone()
        username = user_result[0] if user_result else "User"

    except pymysql.MySQLError as err:
        log(f"Database error fetching data: {str(err)}")
        return jsonify({"error": str(err)}), 500
    finally:
        if conn.open:
            cursor.close()
            conn.close()

    return render_template("index.html", webhook_ids=webhook_ids, user_id=user_id, username=username)


@app.route("/webhook_ids/<user_id>")
@login_required
def webhook_ids(user_id):
    # Only allow the logged‑in user to fetch their own IDs
    if str(session["user_id"]) != user_id:
        return jsonify({"error": "Unauthorized"}), 403

    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT r.webhook_id
            FROM webhook_responses r
            INNER JOIN (
                SELECT webhook_id, MAX(timestamp) AS max_ts
                FROM webhook_responses
                WHERE user_id = %s
                GROUP BY webhook_id
            ) latest ON r.webhook_id = latest.webhook_id
                AND r.timestamp = latest.max_ts
            WHERE r.user_id = %s
            ORDER BY latest.max_ts DESC
        """, (user_id, user_id))

        ids = [row[0] for row in cursor.fetchall()]
        return jsonify({"ids": ids}), 200

    except pymysql.MySQLError as err:
        log(f"Database error fetching webhook IDs: {err}")
        return jsonify({"error": "Database error"}), 500

    finally:
        if conn.open:
            cursor.close()
            conn.close()


@app.route("/search_webhooks", methods=["POST"])
@login_required
def search_webhooks():
    user_id = session["user_id"]
    data = request.get_json()
    search_term = data.get("search_term", "").strip()
    start_date = data.get("start_date", "")
    end_date = data.get("end_date", "")

    log(f"User {user_id} searching for: '{search_term}', date range: {start_date} to {end_date}")

    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor(pymysql.cursors.DictCursor)

        # Base query
        query = """
            SELECT id, webhook_id, method, headers, body, query_params, 
                   timestamp, is_read, client_ip
            FROM webhook_responses
            WHERE user_id = %s
        """
        params = [user_id]

        # Add search term conditions only if search term is provided
        if search_term:
            query += """ 
            AND (
                body LIKE %s 
                OR headers LIKE %s 
                OR query_params LIKE %s
                OR webhook_id LIKE %s
                OR method LIKE %s
            )
            """
            search_pattern = f"%{search_term}%"
            params.extend([search_pattern] * 5)

        # Add date range conditions
        if start_date:
            query += " AND timestamp >= %s"
            params.append(start_date)

        if end_date:
            query += " AND timestamp <= %s"
            params.append(end_date)

        query += " ORDER BY timestamp DESC LIMIT 100"

        cursor.execute(query, params)
        results = cursor.fetchall()

        # Add context for each result only if there's a search term
        for result in results:
            result['match_context'] = []

            if search_term:
                # Check where the match occurred
                if search_term.lower() in str(result.get('body', '')).lower():
                    result['match_context'].append('body')
                if search_term.lower() in str(result.get('headers', '')).lower():
                    result['match_context'].append('headers')
                if search_term.lower() in str(result.get('query_params', '')).lower():
                    result['match_context'].append('query_params')
                if search_term.lower() in result.get('webhook_id', '').lower():
                    result['match_context'].append('webhook_id')
                if search_term.lower() in result.get('method', '').lower():
                    result['match_context'].append('method')

        log(f"Found {len(results)} results for search with term='{search_term}', start={start_date}, end={end_date}")
        return jsonify({"results": results}), 200

    except pymysql.MySQLError as err:
        log(f"Database error during search: {str(err)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        log(f"Unexpected error during search: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500
    finally:
        if conn.open:
            cursor.close()
            conn.close()


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        log(f"Registration attempt for username: {username}")

        try:
            conn = pymysql.connect(**db_config)
            cursor = conn.cursor()
            cursor.execute("INSERT INTO users (username, password_hash, status) VALUES (%s, %s, 0)",
                           (username, hashed_password))
            conn.commit()
            log(f"User {username} registered successfully")
            return redirect(url_for("login"))
        except pymysql.MySQLError as err:
            log(f"Database error during registration: {str(err)}")
            return jsonify({"error": str(err)}), 500
        finally:
            if conn.open:
                cursor.close()
                conn.close()

    return render_template("register.html")


@app.route("/change_password", methods=["POST"])
@login_required
def change_password():
    user_id = session["user_id"]
    data = request.get_json()

    old_password = data.get("old_password")
    new_password = data.get("new_password")

    if not old_password or not new_password:
        return jsonify({"error": "Both old and new passwords are required"}), 400

    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters long"}), 400

    log(f"Password change attempt for user {user_id}")

    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor(pymysql.cursors.DictCursor)

        # Get current password hash
        cursor.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
        user = cursor.fetchone()

        if not user:
            log(f"User {user_id} not found during password change")
            return jsonify({"error": "User not found"}), 404

        # Verify old password
        if not bcrypt.checkpw(old_password.encode("utf-8"), user["password_hash"].encode("utf-8")):
            log(f"Invalid old password for user {user_id}")
            return jsonify({"error": "Current password is incorrect"}), 401

        # Hash new password
        new_password_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

        # Update password
        cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                       (new_password_hash, user_id))
        conn.commit()

        log(f"Password changed successfully for user {user_id}")
        return jsonify({"message": "Password changed successfully"}), 200

    except pymysql.MySQLError as err:
        log(f"Database error during password change: {str(err)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        log(f"Unexpected error during password change: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500
    finally:
        if conn.open:
            cursor.close()
            conn.close()


@app.route("/mark_as_read/<int:request_id>", methods=["POST"])
@login_required
def mark_as_read(request_id):
    user_id = session["user_id"]
    log(f"User {user_id} marking request {request_id} as read")

    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE webhook_responses
            SET is_read = 1
            WHERE id = %s AND user_id = %s
        """, (request_id, user_id))
        conn.commit()
        log(f"Request {request_id} marked as read by user {user_id}")
    except pymysql.MySQLError as err:
        log(f"Database error marking request as read: {str(err)}")
        return jsonify({"error": str(err)}), 500
    finally:
        if conn.open:
            cursor.close()
            conn.close()

    return jsonify({"message": "Request marked as read"}), 200


@app.route("/get_notifications")
@login_required
def get_notifications():
    user_id = session["user_id"]
    log(f"User {user_id} fetching notifications")

    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor(pymysql.cursors.DictCursor)

        # Get recent unread webhooks from all webhook IDs
        cursor.execute("""
            SELECT id, webhook_id, method, timestamp, client_ip
            FROM webhook_responses
            WHERE user_id = %s AND is_read = 0
            ORDER BY timestamp DESC
            LIMIT 10
        """, (user_id,))

        notifications = cursor.fetchall()

        # Get count of all unread
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM webhook_responses
            WHERE user_id = %s AND is_read = 0
        """, (user_id,))

        count_result = cursor.fetchone()
        unread_count = count_result['count'] if count_result else 0

        log(f"Found {unread_count} unread notifications for user {user_id}")

        return jsonify({
            "notifications": notifications,
            "unread_count": unread_count
        }), 200

    except pymysql.MySQLError as err:
        log(f"Database error fetching notifications: {str(err)}")
        return jsonify({"error": str(err)}), 500
    finally:
        if conn.open:
            cursor.close()
            conn.close()


@app.route("/mark_all_notifications_read", methods=["POST"])
@login_required
def mark_all_notifications_read():
    user_id = session["user_id"]
    log(f"User {user_id} marking all notifications as read")

    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE webhook_responses
            SET is_read = 1
            WHERE user_id = %s AND is_read = 0
        """, (user_id,))

        affected_rows = cursor.rowcount
        conn.commit()

        log(f"Marked {affected_rows} notifications as read for user {user_id}")

        # Notify clients about the update
        with queue_lock:
            if user_id in user_event_queues:
                for queue in user_event_queues[user_id]:
                    event_data = {
                        'type': 'notifications_cleared',
                        'count': 0
                    }
                    queue.put(json.dumps(event_data))

        return jsonify({"message": f"Marked {affected_rows} notifications as read"}), 200

    except pymysql.MySQLError as err:
        log(f"Database error marking notifications as read: {str(err)}")
        return jsonify({"error": str(err)}), 500
    finally:
        if conn.open:
            cursor.close()
            conn.close()


@app.route("/delete_request/<int:request_id>", methods=["DELETE"])
@login_required
def delete_request(request_id):
    user_id = session["user_id"]
    log(f"User {user_id} deleting request {request_id}")

    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor()

        # First verify the request belongs to this user
        cursor.execute("SELECT webhook_id FROM webhook_responses WHERE id = %s AND user_id = %s",
                       (request_id, user_id))
        result = cursor.fetchone()

        if not result:
            log(f"Request {request_id} not found or doesn't belong to user {user_id}")
            return jsonify({"error": "Request not found or unauthorized"}), 404

        webhook_id = result[0]

        # Delete the request
        cursor.execute("DELETE FROM webhook_responses WHERE id = %s AND user_id = %s",
                       (request_id, user_id))
        conn.commit()

        # Notify connected clients about the deletion
        event_data = {
            'type': 'webhook_deleted',
            'webhook_id': webhook_id,
            'request_id': request_id
        }

        with queue_lock:
            if user_id in user_event_queues:
                for queue in user_event_queues[user_id]:
                    queue.put(json.dumps(event_data))

        log(f"Request {request_id} deleted successfully by user {user_id}")
        return jsonify({"message": "Request deleted successfully"}), 200

    except pymysql.MySQLError as err:
        log(f"Database error deleting request: {str(err)}")
        return jsonify({"error": str(err)}), 500
    finally:
        if conn.open:
            cursor.close()
            conn.close()


@app.route("/webhook/<user_id>/<webhook_id>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
def handle_webhook(user_id, webhook_id):
    # Handle GET requests to retrieve webhook data (original behavior)
    if request.method == "GET":
        log(f"Webhook GET request for user {user_id}, webhook {webhook_id}")
        try:
            conn = pymysql.connect(**db_config)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            cursor.execute("""
                    SELECT id, webhook_id, method, headers, body, query_params, timestamp, is_read, client_ip
                    FROM webhook_responses
                    WHERE user_id = %s AND webhook_id = %s
                    ORDER BY timestamp DESC
                    LIMIT 20
                """, (user_id, webhook_id))
            data = cursor.fetchall()
            log(f"Webhook data retrieved for user {user_id}, webhook {webhook_id}")
        except pymysql.MySQLError as err:
            log(f"Database error in webhook GET: {str(err)}")
            return jsonify({"error": str(err)}), 500
        finally:
            if conn.open:
                cursor.close()
                conn.close()

        return jsonify(data), 200

    # Handle all other HTTP methods (POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
    else:
        # Get client IP address
        client_ip = get_client_ip()
        log(f"Webhook {request.method} received from IP {client_ip} for user {user_id}, webhook {webhook_id}")

        try:
            conn = pymysql.connect(**db_config)
            cursor = conn.cursor(pymysql.cursors.DictCursor)

            # Verify user exists
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()
            if not user:
                log(f"Webhook failed: User {user_id} does not exist")
                return jsonify({"error": "User does not exist"}), 404

            method = request.method
            headers = dict(request.headers)
            query_params = request.args.to_dict()

            # Handle different content types for body
            body = None
            if request.content_type and 'application/json' in request.content_type:
                body = request.get_json(silent=True)
            elif request.content_type and 'application/x-www-form-urlencoded' in request.content_type:
                body = request.form.to_dict()
            elif request.content_type and 'multipart/form-data' in request.content_type:
                body = {
                    'form_data': request.form.to_dict(),
                    'files': {key: {'filename': file.filename, 'content_type': file.content_type}
                              for key, file in request.files.items()}
                }
            else:
                # For other content types, get raw data
                try:
                    body = request.data.decode("utf-8") if request.data else ""
                except UnicodeDecodeError:
                    body = f"<Binary data: {len(request.data)} bytes>"

            # Insert webhook data including client IP
            timestamp = datetime.now(timezone.utc)
            cursor.execute("""
                INSERT INTO webhook_responses (user_id, webhook_id, method, headers, body, query_params, timestamp, client_ip)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """, (user_id, webhook_id, method, json.dumps(headers), json.dumps(body), json.dumps(query_params),
                  timestamp, client_ip))
            conn.commit()

            # Get the inserted ID
            webhook_response_id = cursor.lastrowid

            log(f"Webhook data stored for user {user_id}, webhook {webhook_id} - Method: {method}, IP: {client_ip}")

            # Prepare webhook data for SSE notification
            webhook_data = {
                'id': webhook_response_id,
                'webhook_id': webhook_id,  # Add this line
                'method': method,
                'headers': json.dumps(headers),
                'body': json.dumps(body),
                'query_params': json.dumps(query_params),
                'timestamp': timestamp.isoformat(),
                'client_ip': client_ip,
                'is_read': 0
            }

            # Notify connected clients via SSE
            notify_user_webhook(user_id, webhook_id, webhook_data)

            # Also send as notification for other webhook IDs
            notify_user_notification(user_id, webhook_id, webhook_data)

        except pymysql.MySQLError as err:
            log(f"Database error in webhook {request.method}: {str(err)}")
            return jsonify({"error": str(err)}), 500
        finally:
            if conn.open:
                cursor.close()
                conn.close()

        # Return appropriate response based on method
        if request.method == "HEAD":
            return "", 200
        elif request.method == "OPTIONS":
            response = jsonify({"message": "Options request received and logged successfully"})
            response.headers["Allow"] = "GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS"
            return response, 200
        else:
            return jsonify({"message": f"{request.method} webhook received and logged successfully"}), 200


@app.route("/httpcode/<int:code>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
def http_status_test(code):
    """
    Simple HTTP status code tester endpoint
    Returns the specified HTTP status code
    """
    # Validate status code range
    if code < 100 or code > 599:
        return jsonify({"error": "Invalid status code. Must be between 100-599"}), 400

    # Get request data if present
    request_data = None
    if request.method in ["POST", "PUT", "PATCH"]:
        if request.content_type and 'application/json' in request.content_type:
            request_data = request.get_json(silent=True)
        else:
            request_data = request.data.decode("utf-8") if request.data else None

    # Standard status messages
    status_messages = {
        200: "OK", 201: "Created", 204: "No Content",
        301: "Moved Permanently", 302: "Found", 304: "Not Modified",
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
        404: "Not Found", 405: "Method Not Allowed", 422: "Unprocessable Entity",
        429: "Too Many Requests", 500: "Internal Server Error",
        502: "Bad Gateway", 503: "Service Unavailable", 504: "Gateway Timeout"
    }

    status_message = status_messages.get(code, "Custom Status Code")

    # Handle special cases
    if code == 204:  # No Content - return empty response
        return "", code

    # Build response
    response_body = {
        "status": code,
        "message": status_message,
        "method": request.method,
        "path": request.path,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

    # Include request data in response if present
    if request_data:
        response_body["received_data"] = request_data

    # Add special headers for certain status codes
    response = jsonify(response_body)

    if code == 401:
        response.headers['WWW-Authenticate'] = 'Basic realm="Authentication Required"'
    elif code in [301, 302, 307, 308]:
        response.headers['Location'] = '/'
    elif code == 429:
        response.headers['Retry-After'] = '60'
    elif code == 503:
        response.headers['Retry-After'] = '120'

    return response, code

@app.route("/events/<user_id>")
@login_required
def events(user_id):
    """Server-Sent Events endpoint for real-time webhook notifications"""
    # Verify the user is accessing their own events
    if str(session.get("user_id")) != user_id:
        return jsonify({"error": "Unauthorized"}), 403

    def generate():
        # Create a queue for this connection
        event_queue = Queue()

        # Register this connection for the user
        with queue_lock:
            if user_id not in user_event_queues:
                user_event_queues[user_id] = []
            user_event_queues[user_id].append(event_queue)

        try:
            # Send initial connection event
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"

            while True:
                try:
                    # Wait for events with timeout to allow periodic heartbeat
                    event_data = event_queue.get(timeout=30)
                    yield f"data: {event_data}\n\n"
                except Empty:
                    # Queue timeout - send heartbeat to keep connection alive
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                except GeneratorExit:
                    # Re-raise to be caught by outer try-except
                    raise
                except Exception as e:
                    # Log unexpected errors but continue
                    log(f"Error in SSE event loop for user {user_id}: {str(e)}")
                    continue

        except GeneratorExit:
            # Client disconnected, clean up gracefully
            log(f"SSE client disconnected for user {user_id}")
        except Exception as e:
            # Log any other exceptions
            log(f"SSE error for user {user_id}: {str(e)}")
        finally:
            # Clean up on disconnect
            with queue_lock:
                if user_id in user_event_queues:
                    try:
                        user_event_queues[user_id].remove(event_queue)
                        if not user_event_queues[user_id]:
                            del user_event_queues[user_id]
                    except (ValueError, KeyError):
                        # Queue already removed or user_id not in dict
                        pass
            log(f"SSE cleanup completed for user {user_id}")

    response = Response(generate(), mimetype="text/event-stream")
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Connection'] = 'keep-alive'
    return response


if __name__ == "__main__":
    log("Starting Flask application")
    log(f"Using pymysql version: {pymysql.__version__}")
    # Disable debug mode for SSE to work properly
    # Debug mode causes issues with streaming responses
    app.run(host=RUNNING_HOST, port=RUNNING_PORT, debug=DEBUG, threaded=True)
