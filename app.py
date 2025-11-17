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
import pyotp
import ntplib
import time

import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")
DEBUG = os.getenv("FLASK_DEBUG", "False").lower() == "true"
LOGGING_ENABLED = os.getenv("LOGGING_ENABLED", "False").lower() == "true"
RUNNING_HOST = os.getenv("RUNNING_HOST")
RUNNING_PORT = os.getenv("RUNNING_PORT")
SSL_CERT_PATH = os.getenv("SSL_CERT_PATH")
SSL_KEY_PATH = os.getenv("SSL_KEY_PATH")

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


def get_db_connection():
    """Helper function to get database connection"""
    return pymysql.connect(
        host=db_config["host"],
        port=db_config["port"],
        user=db_config["user"],
        password=db_config["password"],
        database=db_config["database"],
        connect_timeout=db_config["connect_timeout"],
        cursorclass=pymysql.cursors.DictCursor
    )


# Logging Configuration
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


# ==================== NTP TIME SYNCHRONIZATION ====================

# NTP configuration
NTP_SERVERS = [
    'pool.ntp.org',
    'time.google.com',
    'time.cloudflare.com',
    'time.nist.gov'
]
NTP_CACHE_DURATION = 300  # Cache NTP time for 5 minutes
ntp_offset_cache = {'offset': 0, 'timestamp': 0}
ntp_cache_lock = threading.Lock()


def get_ntp_offset():
    """
    Get the time offset from NTP servers.
    Returns the offset in seconds between system time and NTP time.
    Uses cached value if available and recent.
    """
    global ntp_offset_cache

    with ntp_cache_lock:
        # Check if we have a recent cached offset
        if time.time() - ntp_offset_cache['timestamp'] < NTP_CACHE_DURATION:
            return ntp_offset_cache['offset']

    # Try multiple NTP servers
    ntp_client = ntplib.NTPClient()

    for server in NTP_SERVERS:
        try:
            response = ntp_client.request(server, version=3, timeout=2)
            offset = response.offset

            with ntp_cache_lock:
                ntp_offset_cache = {
                    'offset': offset,
                    'timestamp': time.time()
                }

            log(f"NTP sync successful with {server}, offset: {offset:.3f}s")
            return offset
        except Exception as e:
            log(f"NTP sync failed with {server}: {e}")
            continue

    # If all servers fail, return 0 (use system time)
    log("All NTP servers failed, using system time")
    return 0


def get_ntp_time():
    """
    Get current time synchronized with NTP.
    Returns Unix timestamp (seconds since epoch) adjusted for NTP offset.
    """
    offset = get_ntp_offset()
    return time.time() + offset


# ==================== MENU ITEMS FUNCTIONS ====================

def get_all_menu_items():
    """Get all active menu items from database (for admin use)"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT id, title, description, icon, route, display_order
                FROM menu_items
                WHERE is_active = TRUE
                ORDER BY display_order ASC, title ASC
            """
            cursor.execute(sql)
            return cursor.fetchall()
    except Exception as e:
        log(f"Error loading menu items: {e}")
        return []
    finally:
        conn.close()


def get_user_menu_items(user_id):
    """Get menu items assigned to a specific user"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT DISTINCT m.id, m.title, m.description, m.icon, m.route, m.display_order
                FROM menu_items m
                INNER JOIN user_menu_items umi ON m.id = umi.menu_item_id
                WHERE m.is_active = TRUE AND umi.user_id = %s
                ORDER BY m.display_order ASC, m.title ASC
            """
            cursor.execute(sql, (user_id,))
            return cursor.fetchall()
    except pymysql.Error as e:
        log(f"Error loading user menu items for user {user_id}: {e}")
        return []
    except Exception as e:
        log(f"Error loading user menu items for user {user_id}: {e}")
        return []
    finally:
        conn.close()


@app.context_processor
def inject_menu_items():
    """Make menu items available to all templates"""
    is_admin = session.get('is_admin', 0)
    user_id = session.get('user_id')

    # Admins always see all menu items
    if is_admin:
        menu_items = get_all_menu_items()
    elif user_id:
        # Get user's assigned items
        assigned_items = get_user_menu_items(user_id)

        # If user has no assignments, show all items (default behavior)
        # This allows the system to work without configuration
        if assigned_items:
            menu_items = assigned_items
        else:
            menu_items = get_all_menu_items()
    else:
        menu_items = []

    return {'menu_items': menu_items, 'is_admin': is_admin}


# ==================== END MENU ITEMS FUNCTIONS ====================


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


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            log(f"Unauthorized access attempt to {request.path}")
            return redirect(url_for("login"))
        if not session.get("is_admin"):
            log(f"Non-admin user attempted to access {request.path}")
            return redirect(url_for("menu"))
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
    conn = None
    cursor = None
    try:
        log("Entering login route")
        if "user_id" in session:
            log(f"User {session['user_id']} already logged in, redirecting to menu")
            return redirect(url_for("menu"))

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
                    session["username"] = username
                    session["is_admin"] = user.get("is_admin", 0)
                    log(f"Login successful for user {username} (ID: {user['id']}, Admin: {user.get('is_admin', 0)})")

                    # Redirect to default app if set, otherwise to menu
                    default_app = user.get("default_app")
                    if default_app:
                        log(f"Redirecting user {username} to default app: {default_app}")
                        return redirect(default_app)
                    else:
                        return redirect(url_for("menu"))
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
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            log("Closing database connection")
            conn.close()


@app.route("/menu")
@login_required
def menu():
    user_id = session["user_id"]
    username = session.get("username")
    default_app = None

    # Fetch username and default_app from database if needed
    conn = None
    cursor = None
    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor(pymysql.cursors.DictCursor)
        cursor.execute("SELECT username, default_app FROM users WHERE id = %s", (user_id,))
        result = cursor.fetchone()
        if result:
            username = result["username"]
            default_app = result.get("default_app")
            session["username"] = username
        else:
            username = "User"
    except Exception as e:
        log(f"Error fetching user data: {str(e)}")
        username = username or "User"
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()

    return render_template("menu.html", username=username, default_app=default_app)


@app.route("/webhook-viewer")
@login_required
def webhook_viewer():
    """Webhook viewer application"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed webhook viewer")

    conn = None
    cursor = None
    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor()

        # Get webhook IDs
        cursor.execute(
            "SELECT r.webhook_id FROM webhook_responses r INNER JOIN (SELECT webhook_id, MAX(timestamp) AS max_ts FROM webhook_responses WHERE user_id = %s GROUP BY webhook_id) latest ON r.webhook_id = latest.webhook_id AND r.timestamp = latest.max_ts WHERE r.user_id = %s ORDER BY r.timestamp DESC",
            (user_id, user_id))
        webhook_ids = [row[0] for row in cursor.fetchall()]

    except pymysql.MySQLError as err:
        log(f"Database error fetching data: {str(err)}")
        return jsonify({"error": str(err)}), 500
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()

    return render_template("webhook-viewer.html", webhook_ids=webhook_ids, user_id=user_id, username=username)


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
    # Redirect old dashboard URL to new menu
    return redirect(url_for("menu"))


@app.route("/webhook_ids/<user_id>")
@login_required
def webhook_ids(user_id):
    # Only allow the logged‑in user to fetch their own IDs
    if str(session["user_id"]) != user_id:
        return jsonify({"error": "Unauthorized"}), 403

    conn = None
    cursor = None
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
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
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

    conn = None
    cursor = None
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
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        log(f"Registration attempt for username: {username}")

        conn = None
        cursor = None
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
            if cursor is not None:
                cursor.close()
            if conn is not None and conn.open:
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

    conn = None
    cursor = None
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
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()


@app.route("/api/set-default-app", methods=["POST"])
@login_required
def set_default_app():
    """Set the user's default application"""
    user_id = session["user_id"]
    data = request.get_json()

    default_app = data.get("default_app")

    # Allow null/empty to clear the default app
    if default_app == "":
        default_app = None

    log(f"Setting default app for user {user_id} to: {default_app}")

    conn = None
    cursor = None
    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor(pymysql.cursors.DictCursor)

        # Update user's default app
        cursor.execute("UPDATE users SET default_app = %s WHERE id = %s",
                      (default_app, user_id))
        conn.commit()

        log(f"Default app updated successfully for user {user_id}")
        return jsonify({"message": "Default app updated successfully", "default_app": default_app}), 200

    except pymysql.MySQLError as err:
        log(f"Database error during default app update: {str(err)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        log(f"Unexpected error during default app update: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()


@app.route("/mark_as_read/<int:request_id>", methods=["POST"])
@login_required
def mark_as_read(request_id):
    user_id = session["user_id"]
    log(f"User {user_id} marking request {request_id} as read")

    conn = None
    cursor = None
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
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()

    return jsonify({"message": "Request marked as read"}), 200


@app.route("/get_notifications")
@login_required
def get_notifications():
    user_id = session["user_id"]
    log(f"User {user_id} fetching notifications")

    conn = None
    cursor = None
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
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()


@app.route("/mark_all_notifications_read", methods=["POST"])
@login_required
def mark_all_notifications_read():
    user_id = session["user_id"]
    log(f"User {user_id} marking all notifications as read")

    conn = None
    cursor = None
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
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()


@app.route("/delete_request/<int:request_id>", methods=["DELETE"])
@login_required
def delete_request(request_id):
    user_id = session["user_id"]
    log(f"User {user_id} deleting request {request_id}")

    conn = None
    cursor = None
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
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()


@app.route("/webhook/<user_id>/<webhook_id>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
def handle_webhook(user_id, webhook_id):
    # Handle GET requests to retrieve webhook data (original behavior)
    if request.method == "GET":
        log(f"Webhook GET request for user {user_id}, webhook {webhook_id}")
        conn = None
        cursor = None
        try:
            conn = pymysql.connect(**db_config)
            cursor = conn.cursor(pymysql.cursors.DictCursor)
            cursor.execute("""
                    SELECT id, webhook_id, method, headers, body, query_params, timestamp, is_read, client_ip
                    FROM webhook_responses
                    WHERE user_id = %s AND webhook_id = %s
                    ORDER BY timestamp DESC
                """, (user_id, webhook_id))
            data = cursor.fetchall()
            log(f"Webhook data retrieved for user {user_id}, webhook {webhook_id}")
        except pymysql.MySQLError as err:
            log(f"Database error in webhook GET: {str(err)}")
            return jsonify({"error": str(err)}), 500
        finally:
            if cursor is not None:
                cursor.close()
            if conn is not None and conn.open:
                conn.close()

        return jsonify(data), 200

    # Handle all other HTTP methods (POST, PUT, DELETE, PATCH, HEAD, OPTIONS)
    else:
        # Get client IP address
        client_ip = get_client_ip()
        log(f"Webhook {request.method} received from IP {client_ip} for user {user_id}, webhook {webhook_id}")

        conn = None
        cursor = None
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
                'webhook_id': webhook_id,
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
            if cursor is not None:
                cursor.close()
            if conn is not None and conn.open:
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


@app.route("/http-codes")
@login_required
def http_codes():
    """HTTP Codes Tester documentation page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed HTTP codes tester")
    return render_template("httpcodes.html", username=username, user_id=user_id)


@app.route("/json-compare")
@login_required
def json_compare():
    """JSON comparison tool page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed JSON comparison tool")
    return render_template("json-compare.html", username=username)


@app.route("/aws-log-compare")
@login_required
def aws_log_compare():
    """AWS Log CSV Comparison tool page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed AWS Log comparison tool")
    return render_template("aws-log-compare.html", username=username)


@app.route("/karate-generator")
@login_required
def karate_generator():
    """Karate feature file generator page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    is_admin = session.get("is_admin", 0)
    log(f"User {user_id} accessed Karate generator tool")
    return render_template("karate-generator.html", username=username, is_admin=is_admin)


@app.route("/api/karate-generator/save", methods=["POST"])
@login_required
def save_karate_work():
    """Save Karate generator work to database"""
    user_id = session["user_id"]
    data = request.json

    # Validate required fields
    if not data.get("feature_config") or not data.get("scenarios_data"):
        return jsonify({"success": False, "error": "Missing required data"}), 400

    work_name = data.get("work_name", "My Work")
    feature_config = data.get("feature_config")
    scenarios_data = data.get("scenarios_data")
    env_variables = data.get("env_variables", [])

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Delete previous save (only keep one save per user for now)
            cursor.execute("DELETE FROM karate_saved_work WHERE user_id = %s", (user_id,))

            # Insert new save
            cursor.execute("""
                INSERT INTO karate_saved_work (user_id, work_name, feature_config, scenarios_data, env_variables)
                VALUES (%s, %s, %s, %s, %s)
            """, (user_id, work_name, json.dumps(feature_config), json.dumps(scenarios_data), json.dumps(env_variables)))
            conn.commit()

            log(f"User {user_id} saved Karate generator work")
            return jsonify({
                "success": True,
                "message": "Work saved successfully",
                "saved_at": datetime.now(timezone.utc).isoformat()
            })
    except Exception as e:
        conn.rollback()
        log(f"Error saving Karate work for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/karate-generator/load", methods=["GET"])
@login_required
def load_karate_work():
    """Load Karate generator work from database"""
    user_id = session["user_id"]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT work_name, feature_config, scenarios_data, env_variables, updated_at
                FROM karate_saved_work
                WHERE user_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
            """, (user_id,))

            result = cursor.fetchone()

            if result:
                log(f"User {user_id} loaded Karate generator work")
                return jsonify({
                    "success": True,
                    "data": {
                        "work_name": result["work_name"],
                        "feature_config": json.loads(result["feature_config"]) if isinstance(result["feature_config"], str) else result["feature_config"],
                        "scenarios_data": json.loads(result["scenarios_data"]) if isinstance(result["scenarios_data"], str) else result["scenarios_data"],
                        "env_variables": json.loads(result["env_variables"]) if result["env_variables"] and isinstance(result["env_variables"], str) else (result["env_variables"] or []),
                        "saved_at": result["updated_at"].isoformat() if result["updated_at"] else None
                    }
                })
            else:
                return jsonify({"success": False, "error": "No saved work found"}), 404
    except Exception as e:
        log(f"Error loading Karate work for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


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


def get_http_status_message(code):
    """Get standard HTTP status message for a given code"""
    status_messages = {
        100: "Continue", 101: "Switching Protocols",
        200: "OK", 201: "Created", 202: "Accepted", 203: "Non-Authoritative Information",
        204: "No Content", 205: "Reset Content", 206: "Partial Content",
        300: "Multiple Choices", 301: "Moved Permanently", 302: "Found", 303: "See Other",
        304: "Not Modified", 307: "Temporary Redirect", 308: "Permanent Redirect",
        400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
        405: "Method Not Allowed", 406: "Not Acceptable", 408: "Request Timeout",
        409: "Conflict", 410: "Gone", 422: "Unprocessable Entity", 429: "Too Many Requests",
        500: "Internal Server Error", 501: "Not Implemented", 502: "Bad Gateway",
        503: "Service Unavailable", 504: "Gateway Timeout"
    }
    return status_messages.get(code, "Unknown Status")


# ==================== SEQUENCE ENDPOINTS API ====================
# Combines features from Special Endpoints (delays, custom codes) and
# Rotating Endpoints (sequence rotation) for advanced testing scenarios

@app.route("/api/sequence-endpoints", methods=["GET"])
@login_required
def get_sequence_endpoints():
    """Get all sequence endpoints for the current user"""
    user_id = session.get("user_id")

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, endpoint_name, sequence_config, current_index, description, is_active, created_at, updated_at
                FROM sequence_endpoints
                WHERE user_id = %s
                ORDER BY created_at DESC
            """, (user_id,))
            endpoints = cursor.fetchall()
            return jsonify({"success": True, "endpoints": endpoints})
    except Exception as e:
        log(f"Error fetching sequence endpoints: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/sequence-endpoints", methods=["POST"])
@login_required
def create_sequence_endpoint():
    """Create a new sequence endpoint"""
    user_id = session.get("user_id")
    data = request.json

    # Validate required fields
    if not data.get("endpoint_name"):
        return jsonify({"success": False, "error": "Endpoint name is required"}), 400
    if not data.get("sequence_config") or not isinstance(data.get("sequence_config"), list):
        return jsonify({"success": False, "error": "Sequence configuration array is required"}), 400
    if len(data.get("sequence_config")) == 0:
        return jsonify({"success": False, "error": "At least one sequence step is required"}), 400

    # Validate sequence steps
    sequence_config = data.get("sequence_config")
    for i, step in enumerate(sequence_config):
        if not isinstance(step, dict):
            return jsonify({"success": False, "error": f"Step {i+1} must be an object"}), 400

        # Validate HTTP code
        if "http_code" not in step:
            return jsonify({"success": False, "error": f"Step {i+1} missing http_code"}), 400
        try:
            code_int = int(step["http_code"])
            if code_int < 100 or code_int > 599:
                return jsonify({"success": False, "error": f"Step {i+1}: HTTP code must be between 100 and 599"}), 400
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": f"Step {i+1}: Invalid HTTP code"}), 400

        # Validate delay_ms
        if "delay_ms" not in step:
            return jsonify({"success": False, "error": f"Step {i+1} missing delay_ms"}), 400
        try:
            delay_int = int(step["delay_ms"])
            if delay_int < 0 or delay_int > 60000:
                return jsonify({"success": False, "error": f"Step {i+1}: Delay must be between 0 and 60000 ms"}), 400
        except (ValueError, TypeError):
            return jsonify({"success": False, "error": f"Step {i+1}: Invalid delay value"}), 400

        # Validate payload if provided
        if "payload" in step and step["payload"]:
            if isinstance(step["payload"], str):
                try:
                    json.loads(step["payload"])
                except json.JSONDecodeError:
                    return jsonify({"success": False, "error": f"Step {i+1}: Invalid JSON payload"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                INSERT INTO sequence_endpoints (user_id, endpoint_name, sequence_config, current_index, description, is_active)
                VALUES (%s, %s, %s, 0, %s, %s)
            """, (user_id, data.get("endpoint_name"), json.dumps(sequence_config),
                  data.get("description", ""), data.get("is_active", 1)))
            conn.commit()
            endpoint_id = cursor.lastrowid
            return jsonify({"success": True, "id": endpoint_id})
    except Exception as e:
        conn.rollback()
        log(f"Error creating sequence endpoint: {str(e)}")
        if "Duplicate entry" in str(e):
            return jsonify({"success": False, "error": "An endpoint with this name already exists"}), 400
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/sequence-endpoints/<int:endpoint_id>", methods=["PUT"])
@login_required
def update_sequence_endpoint(endpoint_id):
    """Update an existing sequence endpoint"""
    user_id = session.get("user_id")
    data = request.json

    # Validate sequence_config if provided
    if data.get("sequence_config"):
        if not isinstance(data.get("sequence_config"), list):
            return jsonify({"success": False, "error": "Sequence configuration must be an array"}), 400
        if len(data.get("sequence_config")) == 0:
            return jsonify({"success": False, "error": "At least one sequence step is required"}), 400

        sequence_config = data.get("sequence_config")
        for i, step in enumerate(sequence_config):
            if not isinstance(step, dict):
                return jsonify({"success": False, "error": f"Step {i+1} must be an object"}), 400

            # Validate HTTP code
            if "http_code" not in step:
                return jsonify({"success": False, "error": f"Step {i+1} missing http_code"}), 400
            try:
                code_int = int(step["http_code"])
                if code_int < 100 or code_int > 599:
                    return jsonify({"success": False, "error": f"Step {i+1}: HTTP code must be between 100 and 599"}), 400
            except (ValueError, TypeError):
                return jsonify({"success": False, "error": f"Step {i+1}: Invalid HTTP code"}), 400

            # Validate delay_ms
            if "delay_ms" not in step:
                return jsonify({"success": False, "error": f"Step {i+1} missing delay_ms"}), 400
            try:
                delay_int = int(step["delay_ms"])
                if delay_int < 0 or delay_int > 60000:
                    return jsonify({"success": False, "error": f"Step {i+1}: Delay must be between 0 and 60000 ms"}), 400
            except (ValueError, TypeError):
                return jsonify({"success": False, "error": f"Step {i+1}: Invalid delay value"}), 400

            # Validate payload if provided
            if "payload" in step and step["payload"]:
                if isinstance(step["payload"], str):
                    try:
                        json.loads(step["payload"])
                    except json.JSONDecodeError:
                        return jsonify({"success": False, "error": f"Step {i+1}: Invalid JSON payload"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Build dynamic update query
            update_fields = []
            params = []

            if data.get("endpoint_name"):
                update_fields.append("endpoint_name = %s")
                params.append(data.get("endpoint_name"))
            if data.get("sequence_config"):
                update_fields.append("sequence_config = %s")
                params.append(json.dumps(data.get("sequence_config")))
                # Reset current_index when sequence is updated
                update_fields.append("current_index = 0")
            if data.get("description") is not None:
                update_fields.append("description = %s")
                params.append(data.get("description"))
            if data.get("is_active") is not None:
                update_fields.append("is_active = %s")
                params.append(data.get("is_active"))

            if not update_fields:
                return jsonify({"success": False, "error": "No fields to update"}), 400

            params.extend([user_id, endpoint_id])

            cursor.execute(f"""
                UPDATE sequence_endpoints
                SET {', '.join(update_fields)}
                WHERE user_id = %s AND id = %s
            """, params)
            conn.commit()

            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Endpoint not found"}), 404

            return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        log(f"Error updating sequence endpoint: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/sequence-endpoints/<int:endpoint_id>", methods=["DELETE"])
@login_required
def delete_sequence_endpoint(endpoint_id):
    """Delete a sequence endpoint"""
    user_id = session.get("user_id")

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                DELETE FROM sequence_endpoints
                WHERE user_id = %s AND id = %s
            """, (user_id, endpoint_id))
            conn.commit()

            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Endpoint not found"}), 404

            return jsonify({"success": True})
    except Exception as e:
        conn.rollback()
        log(f"Error deleting sequence endpoint: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/sequence-endpoints/<int:endpoint_id>/reset", methods=["POST"])
@login_required
def reset_sequence_endpoint(endpoint_id):
    """Reset the sequence counter to start from the beginning"""
    user_id = session.get("user_id")

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # First check if endpoint exists
            cursor.execute("""
                SELECT id, current_index FROM sequence_endpoints
                WHERE user_id = %s AND id = %s
            """, (user_id, endpoint_id))
            endpoint = cursor.fetchone()

            if not endpoint:
                return jsonify({"success": False, "error": "Endpoint not found"}), 404

            # Check if already at beginning
            if endpoint['current_index'] == 0:
                return jsonify({"success": True, "message": "Sequence is already at the beginning"})

            # Reset to beginning
            cursor.execute("""
                UPDATE sequence_endpoints
                SET current_index = 0
                WHERE user_id = %s AND id = %s
            """, (user_id, endpoint_id))
            conn.commit()

            return jsonify({"success": True, "message": "Sequence reset to beginning"})
    except Exception as e:
        conn.rollback()
        log(f"Error resetting sequence endpoint: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@app.route("/sequence-endpoint/<int:user_id>/<endpoint_name>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
def sequence_endpoint_handler(user_id, endpoint_name):
    """Handle sequence endpoint requests - cycles through configured steps with delays and custom responses"""
    import time

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Verify user exists
            cursor.execute("SELECT id FROM users WHERE id = %s", (user_id,))
            user_result = cursor.fetchone()

            if not user_result:
                return jsonify({
                    "error": "User not found",
                    "user_id": user_id
                }), 404

            # Get sequence endpoint configuration with row lock for atomic update
            cursor.execute("""
                SELECT id, sequence_config, current_index, description
                FROM sequence_endpoints
                WHERE user_id = %s AND endpoint_name = %s AND is_active = 1
                FOR UPDATE
            """, (user_id, endpoint_name))
            endpoint = cursor.fetchone()

            if not endpoint:
                return jsonify({
                    "error": "Sequence endpoint not found or inactive",
                    "user_id": user_id,
                    "endpoint_name": endpoint_name
                }), 404

            # Parse sequence configuration
            sequence_config = json.loads(endpoint["sequence_config"]) if isinstance(endpoint["sequence_config"], str) else endpoint["sequence_config"]
            current_index = endpoint["current_index"]

            # Get current step
            current_step = sequence_config[current_index]
            http_code = int(current_step["http_code"])
            delay_ms = int(current_step["delay_ms"])
            payload = current_step.get("payload")

            # Apply delay if configured
            if delay_ms > 0:
                time.sleep(delay_ms / 1000.0)

            # Calculate next index (circular rotation)
            next_index = (current_index + 1) % len(sequence_config)

            # Update current index for next call
            cursor.execute("""
                UPDATE sequence_endpoints
                SET current_index = %s
                WHERE id = %s
            """, (next_index, endpoint["id"]))
            conn.commit()

            # Prepare response
            # Use custom payload if provided and HTTP code is 200, otherwise use default response
            if payload and http_code == 200:
                response_data = payload
            else:
                # Get next step info for response
                next_step = sequence_config[next_index]

                response_data = {
                    "status": http_code,
                    "message": get_http_status_message(http_code),
                    "endpoint_name": endpoint_name,
                    "user_id": user_id,
                    "description": endpoint["description"],
                    "current_step_index": current_index,
                    "total_steps": len(sequence_config),
                    "next_step": {
                        "http_code": next_step["http_code"],
                        "delay_ms": next_step["delay_ms"]
                    },
                    "current_step": {
                        "http_code": http_code,
                        "delay_ms": delay_ms
                    },
                    "method": request.method,
                    "path": request.path,
                    "timestamp": datetime.now().isoformat()
                }

            # Include request data if present (only for default response, not custom payload)
            if not (payload and http_code == 200) and request.method in ["POST", "PUT", "PATCH"]:
                if request.is_json:
                    response_data["received_data"] = request.get_json()
                elif request.form:
                    response_data["received_data"] = dict(request.form)
                elif request.data:
                    response_data["received_data"] = request.data.decode('utf-8', errors='ignore')

            # Handle special HTTP codes that need special responses
            if http_code == 204:
                # No Content - return empty response
                response = Response('', status=http_code)
            else:
                response = jsonify(response_data)
                response.status_code = http_code

            # Add special headers based on status code
            if http_code == 401:
                response.headers['WWW-Authenticate'] = 'Basic realm="Authentication Required"'
            elif http_code in [301, 302, 307, 308]:
                response.headers['Location'] = '/'
            elif http_code == 429:
                response.headers['Retry-After'] = '60'
            elif http_code == 503:
                response.headers['Retry-After'] = '120'

            return response

    except Exception as e:
        log(f"Error handling sequence endpoint: {str(e)}")
        return jsonify({"error": "Internal server error", "details": str(e)}), 500
    finally:
        conn.close()


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


@app.route("/health", methods=["GET"])
def health_check():
    """
    Health check endpoint to verify server and database connectivity
    """
    health_status = {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {
            "server": "ok",
            "database": "unknown",
            "ssl": "unknown"
        }
    }

    # Check database connectivity
    conn = None
    cursor = None
    try:
        conn = pymysql.connect(**db_config)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        health_status["checks"]["database"] = "ok"
    except Exception as e:
        health_status["status"] = "degraded"
        health_status["checks"]["database"] = "error"
        health_status["error"] = str(e)
        log(f"Health check database error: {str(e)}")
    finally:
        if cursor:
            cursor.close()
        if conn and conn.open:
            conn.close()

    # Check SSL status
    if request.is_secure:
        health_status["checks"]["ssl"] = "enabled"
    else:
        health_status["checks"]["ssl"] = "disabled"
        health_status["warnings"] = ["SSL/HTTPS is not enabled"]

    # Determine overall status
    if health_status["checks"]["database"] == "error":
        health_status["status"] = "unhealthy"
        return jsonify(health_status), 503

    return jsonify(health_status), 200


@app.route("/.well-known/pki-validation/<path:filename>")
def pki_validation(filename):
    try:
        from flask import send_from_directory
        # Serve the file from the .well-known/pki-validation directory
        return send_from_directory('.well-known/pki-validation', filename)
    except FileNotFoundError:
        log(f"PKI validation file not found: {filename}")
        return jsonify({"error": "File not found"}), 404
    except Exception as e:
        log(f"Error serving PKI validation file {filename}: {str(e)}")
        return jsonify({"error": "Error serving file"}), 500


# ==================== MENU ITEMS API ROUTES ====================

@app.route('/api/menu-items', methods=['GET'])
def api_get_menu_items():
    """Get all active menu items"""
    menu_items = get_all_menu_items()
    return jsonify({'success': True, 'menu_items': menu_items})


@app.route('/api/menu-items/<int:item_id>', methods=['GET'])
@login_required
def api_get_menu_item(item_id):
    """Get single menu item by ID"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "SELECT * FROM menu_items WHERE id = %s"
            cursor.execute(sql, (item_id,))
            item = cursor.fetchone()
            if item:
                return jsonify({'success': True, 'item': item})
            return jsonify({'success': False, 'error': 'Item not found'}), 404
    finally:
        conn.close()


@app.route('/api/menu-items', methods=['POST'])
@login_required
def api_create_menu_item():
    """Create a new menu item"""
    data = request.json

    # Validate required fields
    required = ['title', 'description', 'icon', 'route']
    for field in required:
        if field not in data:
            return jsonify({'success': False, 'error': f'Missing field: {field}'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO menu_items (title, description, icon, route, display_order)
                VALUES (%s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (
                data['title'],
                data['description'],
                data['icon'],
                data['route'],
                data.get('display_order', 0)
            ))
            conn.commit()
            return jsonify({
                'success': True,
                'message': 'Menu item created successfully',
                'item_id': cursor.lastrowid
            })
    except Exception as e:
        log(f"Error creating menu item: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/menu-items/<int:item_id>', methods=['PUT'])
@login_required
def api_update_menu_item(item_id):
    """Update a menu item"""
    data = request.json

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Build dynamic UPDATE query
            allowed_fields = ['title', 'description', 'icon', 'route', 'display_order', 'is_active']
            updates = []
            values = []

            for field in allowed_fields:
                if field in data:
                    updates.append(f"{field} = %s")
                    values.append(data[field])

            if not updates:
                return jsonify({'success': False, 'error': 'No fields to update'}), 400

            values.append(item_id)
            sql = f"UPDATE menu_items SET {', '.join(updates)} WHERE id = %s"
            cursor.execute(sql, values)
            conn.commit()

            if cursor.rowcount > 0:
                return jsonify({'success': True, 'message': 'Menu item updated successfully'})
            return jsonify({'success': False, 'error': 'Item not found'}), 404
    except Exception as e:
        log(f"Error updating menu item: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/menu-items/<int:item_id>', methods=['DELETE'])
@login_required
def api_delete_menu_item(item_id):
    """Delete a menu item (soft delete)"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "UPDATE menu_items SET is_active = FALSE WHERE id = %s"
            cursor.execute(sql, (item_id,))
            conn.commit()

            if cursor.rowcount > 0:
                return jsonify({'success': True, 'message': 'Menu item deleted successfully'})
            return jsonify({'success': False, 'error': 'Item not found'}), 404
    except Exception as e:
        log(f"Error deleting menu item: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/menu-items/reorder', methods=['POST'])
@login_required
def api_reorder_menu_items():
    """Reorder menu items"""
    data = request.json
    items = data.get('items', [])

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            for item in items:
                sql = "UPDATE menu_items SET display_order = %s WHERE id = %s"
                cursor.execute(sql, (item['display_order'], item['id']))
            conn.commit()
            return jsonify({'success': True, 'message': 'Menu items reordered successfully'})
    except Exception as e:
        log(f"Error reordering menu items: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/admin/menu-items')
@admin_required
def admin_menu_items():
    """Admin page to manage menu items"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "SELECT * FROM menu_items ORDER BY display_order ASC, title ASC"
            cursor.execute(sql)
            menu_items = cursor.fetchall()
            return render_template('admin/menu_items.html',
                                   menu_items=menu_items,
                                   username=session.get('username'))
    finally:
        conn.close()


# ==================== USER MENU ITEMS ASSIGNMENT API ROUTES ====================

@app.route('/api/users/<int:user_id>/menu-items', methods=['GET'])
@admin_required
def api_get_user_menu_assignments(user_id):
    """Get menu items assigned to a specific user"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT m.id, m.title, m.icon
                FROM menu_items m
                INNER JOIN user_menu_items umi ON m.id = umi.menu_item_id
                WHERE umi.user_id = %s AND m.is_active = TRUE
                ORDER BY m.display_order ASC
            """
            cursor.execute(sql, (user_id,))
            assigned_items = cursor.fetchall()
            return jsonify({'success': True, 'menu_items': assigned_items})
    except pymysql.Error as e:
        log(f"Error getting user menu assignments: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        log(f"Error getting user menu assignments: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/users/<int:user_id>/menu-items', methods=['POST'])
@admin_required
def api_assign_menu_item_to_user(user_id):
    """Assign a menu item to a user"""
    data = request.json
    menu_item_id = data.get('menu_item_id')

    if not menu_item_id:
        return jsonify({'success': False, 'error': 'menu_item_id is required'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check if assignment already exists
            check_sql = "SELECT id FROM user_menu_items WHERE user_id = %s AND menu_item_id = %s"
            cursor.execute(check_sql, (user_id, menu_item_id))
            existing = cursor.fetchone()

            if existing:
                return jsonify({'success': True, 'message': 'Menu item already assigned to user'})

            # Create new assignment
            sql = "INSERT INTO user_menu_items (user_id, menu_item_id) VALUES (%s, %s)"
            cursor.execute(sql, (user_id, menu_item_id))
            conn.commit()
            return jsonify({'success': True, 'message': 'Menu item assigned successfully'})
    except pymysql.Error as e:
        log(f"Error assigning menu item to user: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        log(f"Error assigning menu item to user: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/users/<int:user_id>/menu-items/<int:menu_item_id>', methods=['DELETE'])
@admin_required
def api_unassign_menu_item_from_user(user_id, menu_item_id):
    """Unassign a menu item from a user"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = "DELETE FROM user_menu_items WHERE user_id = %s AND menu_item_id = %s"
            cursor.execute(sql, (user_id, menu_item_id))
            conn.commit()

            if cursor.rowcount > 0:
                return jsonify({'success': True, 'message': 'Menu item unassigned successfully'})
            return jsonify({'success': False, 'error': 'Assignment not found'}), 404
    except pymysql.Error as e:
        log(f"Error unassigning menu item from user: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        log(f"Error unassigning menu item from user: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/users/<int:user_id>/menu-items/bulk', methods=['POST'])
@admin_required
def api_bulk_assign_menu_items(user_id):
    """Bulk assign menu items to a user (replaces all existing assignments)"""
    data = request.json
    menu_item_ids = data.get('menu_item_ids', [])

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Delete all existing assignments for this user
            delete_sql = "DELETE FROM user_menu_items WHERE user_id = %s"
            cursor.execute(delete_sql, (user_id,))

            # Insert new assignments
            if menu_item_ids:
                insert_sql = "INSERT INTO user_menu_items (user_id, menu_item_id) VALUES (%s, %s)"
                for menu_item_id in menu_item_ids:
                    cursor.execute(insert_sql, (user_id, menu_item_id))

            conn.commit()
            return jsonify({'success': True, 'message': 'Menu items assigned successfully'})
    except pymysql.Error as e:
        log(f"Error bulk assigning menu items: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        log(f"Error bulk assigning menu items: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


# ==================== END USER MENU ITEMS ASSIGNMENT API ROUTES ====================
# ==================== END MENU ITEMS API ROUTES ====================
# ==================== ADMIN USER MANAGEMENT ROUTES ====================
# Add these routes to app.py after the menu items routes

@app.route('/admin/users')
@admin_required
def admin_users():
    """Admin page to manage users"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT id, username, status, is_admin, created_at,
                (SELECT COUNT(*) FROM webhook_responses WHERE user_id = users.id) as webhook_count
                FROM users
                ORDER BY created_at DESC
            """
            cursor.execute(sql)
            users = cursor.fetchall()
            return render_template('admin/users.html',
                                   users=users,
                                   username=session.get('username'))
    finally:
        conn.close()


@admin_required
@app.route('/api/admin/users', methods=['GET'])
@admin_required
def api_get_users():
    """Get all users"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT id, username, status, is_admin, created_at,
                (SELECT COUNT(*) FROM webhook_responses WHERE user_id = users.id) as webhook_count
                FROM users
                ORDER BY created_at DESC
            """
            cursor.execute(sql)
            users = cursor.fetchall()
            return jsonify({'success': True, 'users': users})
    except Exception as e:
        log(f"Error fetching users: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@admin_required
@app.route('/api/admin/users/<int:user_id>', methods=['GET'])
@admin_required
def api_get_user(user_id):
    """Get single user by ID"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT id, username, status, is_admin, created_at,
                (SELECT COUNT(*) FROM webhook_responses WHERE user_id = users.id) as webhook_count
                FROM users
                WHERE id = %s
            """
            cursor.execute(sql, (user_id,))
            user = cursor.fetchone()
            if user:
                return jsonify({'success': True, 'user': user})
            return jsonify({'success': False, 'error': 'User not found'}), 404
    finally:
        conn.close()


@admin_required
@app.route('/api/admin/users', methods=['POST'])
@admin_required
def api_create_user():
    """Create a new user"""
    data = request.json

    # Validate required fields
    if 'username' not in data or 'password' not in data:
        return jsonify({'success': False, 'error': 'Username and password required'}), 400

    username = data['username']
    password = data['password']
    status = data.get('status', 1)  # Default active
    is_admin = data.get('is_admin', 0)  # Default normal user

    # Validate password length
    if len(password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check if username exists
            cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
            if cursor.fetchone():
                return jsonify({'success': False, 'error': 'Username already exists'}), 400

            # Hash password
            hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

            # Insert user
            sql = "INSERT INTO users (username, password_hash, status, is_admin) VALUES (%s, %s, %s, %s)"
            cursor.execute(sql, (username, hashed_password, status, is_admin))
            conn.commit()

            log(f"Admin created user: {username}")
            return jsonify({
                'success': True,
                'message': 'User created successfully',
                'user_id': cursor.lastrowid
            })
    except Exception as e:
        log(f"Error creating user: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@admin_required
@app.route('/api/admin/users/<int:user_id>/status', methods=['PUT'])
@admin_required
def api_toggle_user_status(user_id):
    """Toggle user active/inactive status"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Get current status
            cursor.execute("SELECT username, status FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({'success': False, 'error': 'User not found'}), 404

            # Toggle status
            new_status = 0 if user['status'] == 1 else 1
            cursor.execute("UPDATE users SET status = %s WHERE id = %s", (new_status, user_id))
            conn.commit()

            status_text = 'activated' if new_status == 1 else 'deactivated'
            log(f"Admin {status_text} user: {user['username']}")

            return jsonify({
                'success': True,
                'message': f'User {status_text} successfully',
                'new_status': new_status,
                'username': user['username'],
                'user_id': user_id
            })
    except Exception as e:
        log(f"Error toggling user status: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@app.route('/api/admin/users/<int:user_id>', methods=['PUT'])
@admin_required
def api_update_user(user_id):
    """Update user details (admin)"""
    data = request.json

    if 'username' not in data:
        return jsonify({'success': False, 'error': 'Username required'}), 400

    username = data['username']
    status = data.get('status', 1)
    is_admin = data.get('is_admin', 0)

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check if user exists
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({'success': False, 'error': 'User not found'}), 404

            # Check if new username already exists (if changing username)
            if username != user['username']:
                cursor.execute("SELECT id FROM users WHERE username = %s AND id != %s", (username, user_id))
                if cursor.fetchone():
                    return jsonify({'success': False, 'error': 'Username already exists'}), 400

            # Update user
            cursor.execute(
                "UPDATE users SET username = %s, status = %s, is_admin = %s WHERE id = %s",
                (username, status, is_admin, user_id)
            )
            conn.commit()

            log(f"Admin updated user: {username}")

            return jsonify({
                'success': True,
                'message': 'User updated successfully'
            })
    except Exception as e:
        log(f"Error updating user: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@admin_required
@app.route('/api/admin/users/<int:user_id>/password', methods=['PUT'])
@admin_required
def api_reset_user_password(user_id):
    """Reset user password (admin)"""
    data = request.json

    if 'password' not in data:
        return jsonify({'success': False, 'error': 'Password required'}), 400

    new_password = data['password']

    if len(new_password) < 6:
        return jsonify({'success': False, 'error': 'Password must be at least 6 characters'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check if user exists
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({'success': False, 'error': 'User not found'}), 404

            # Hash new password
            hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

            # Update password
            cursor.execute("UPDATE users SET password_hash = %s WHERE id = %s", (hashed_password, user_id))
            conn.commit()

            log(f"Admin reset password for user: {user['username']}")

            return jsonify({
                'success': True,
                'message': 'Password reset successfully'
            })
    except Exception as e:
        log(f"Error resetting password: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@admin_required
@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def api_delete_user(user_id):
    """Delete user (admin)"""
    # Prevent deleting yourself
    if user_id == session.get('user_id'):
        return jsonify({'success': False, 'error': 'Cannot delete your own account'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Check if user exists
            cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
            user = cursor.fetchone()

            if not user:
                return jsonify({'success': False, 'error': 'User not found'}), 404

            # Delete user
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
            conn.commit()

            log(f"Admin deleted user: {user['username']}")

            return jsonify({
                'success': True,
                'message': 'User deleted successfully'
            })
    except Exception as e:
        log(f"Error deleting user: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


@admin_required
@app.route('/api/admin/stats', methods=['GET'])
@admin_required
def api_admin_stats():
    """Get admin dashboard statistics"""
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            stats = {}

            # Total users
            cursor.execute("SELECT COUNT(*) as count FROM users")
            stats['total_users'] = cursor.fetchone()['count']

            # Active users
            cursor.execute("SELECT COUNT(*) as count FROM users WHERE status = 1")
            stats['active_users'] = cursor.fetchone()['count']

            # Total webhooks
            cursor.execute("SELECT COUNT(*) as count FROM webhook_responses")
            stats['total_webhooks'] = cursor.fetchone()['count']

            # Webhooks today
            cursor.execute("""
                SELECT COUNT(*) as count FROM webhook_responses 
                WHERE DATE(timestamp) = CURDATE()
            """)
            stats['webhooks_today'] = cursor.fetchone()['count']

            return jsonify({'success': True, 'stats': stats})
    except Exception as e:
        log(f"Error fetching admin stats: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    finally:
        conn.close()


# ==================== END ADMIN USER MANAGEMENT ROUTES ====================


# ==================== TOTP AUTHENTICATOR ROUTES ====================

@app.route("/totp-authenticator")
@login_required
def totp_authenticator():
    """TOTP Authenticator page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed TOTP Authenticator")
    return render_template("totp-authenticator.html", username=username)


@app.route("/api/totp/accounts", methods=["GET"])
@login_required
def get_totp_accounts():
    """Get all TOTP accounts for the current user"""
    user_id = session["user_id"]
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                SELECT id, service_name, account_identifier, secret_key, issuer,
                       digits, period, algorithm, color, icon, created_at, updated_at
                FROM totp_accounts
                WHERE user_id = %s
                ORDER BY created_at DESC
            """
            cursor.execute(sql, (user_id,))
            accounts = cursor.fetchall()

            log(f"User {user_id} retrieved {len(accounts)} TOTP accounts")
            return jsonify({'success': True, 'accounts': accounts})
    except Exception as e:
        log(f"Error fetching TOTP accounts for user {user_id}: {e}")
        return jsonify({'success': False, 'message': 'Failed to load accounts'}), 500
    finally:
        conn.close()


@app.route("/api/totp/accounts", methods=["POST"])
@login_required
def create_totp_account():
    """Create a new TOTP account"""
    user_id = session["user_id"]
    data = request.get_json()

    # Validate required fields
    required_fields = ['service_name', 'secret_key']
    for field in required_fields:
        if not data.get(field):
            return jsonify({'success': False, 'message': f'Missing required field: {field}'}), 400

    # Validate secret key format
    try:
        # Test if the secret key is valid by trying to create a TOTP object
        pyotp.TOTP(data['secret_key'])
    except Exception as e:
        log(f"Invalid TOTP secret key provided by user {user_id}: {e}")
        return jsonify({'success': False, 'message': 'Invalid secret key format'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            sql = """
                INSERT INTO totp_accounts
                (user_id, service_name, account_identifier, secret_key, issuer,
                 digits, period, algorithm, color, icon)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """
            cursor.execute(sql, (
                user_id,
                data.get('service_name'),
                data.get('account_identifier', ''),
                data.get('secret_key'),
                data.get('issuer', ''),
                data.get('digits', 6),
                data.get('period', 30),
                data.get('algorithm', 'SHA1'),
                data.get('color', '#007bff'),
                data.get('icon', '')
            ))
            conn.commit()

            account_id = cursor.lastrowid
            log(f"User {user_id} created TOTP account {account_id} for service: {data.get('service_name')}")
            return jsonify({'success': True, 'account_id': account_id, 'message': 'Account created successfully'})
    except Exception as e:
        log(f"Error creating TOTP account for user {user_id}: {e}")
        return jsonify({'success': False, 'message': 'Failed to create account'}), 500
    finally:
        conn.close()


@app.route("/api/totp/accounts/<int:account_id>", methods=["PUT"])
@login_required
def update_totp_account(account_id):
    """Update an existing TOTP account"""
    user_id = session["user_id"]
    data = request.get_json()

    # Validate secret key format if provided
    if 'secret_key' in data:
        try:
            pyotp.TOTP(data['secret_key'])
        except Exception as e:
            log(f"Invalid TOTP secret key provided by user {user_id}: {e}")
            return jsonify({'success': False, 'message': 'Invalid secret key format'}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # First verify the account belongs to the user
            cursor.execute("SELECT id FROM totp_accounts WHERE id = %s AND user_id = %s", (account_id, user_id))
            if not cursor.fetchone():
                return jsonify({'success': False, 'message': 'Account not found'}), 404

            # Update the account
            sql = """
                UPDATE totp_accounts
                SET service_name = %s, account_identifier = %s, secret_key = %s,
                    issuer = %s, digits = %s, period = %s, color = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s AND user_id = %s
            """
            cursor.execute(sql, (
                data.get('service_name'),
                data.get('account_identifier', ''),
                data.get('secret_key'),
                data.get('issuer', ''),
                data.get('digits', 6),
                data.get('period', 30),
                data.get('color', '#007bff'),
                account_id,
                user_id
            ))
            conn.commit()

            log(f"User {user_id} updated TOTP account {account_id}")
            return jsonify({'success': True, 'message': 'Account updated successfully'})
    except Exception as e:
        log(f"Error updating TOTP account {account_id} for user {user_id}: {e}")
        return jsonify({'success': False, 'message': 'Failed to update account'}), 500
    finally:
        conn.close()


@app.route("/api/totp/accounts/<int:account_id>", methods=["DELETE"])
@login_required
def delete_totp_account(account_id):
    """Delete a TOTP account"""
    user_id = session["user_id"]
    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            # Verify the account belongs to the user before deleting
            cursor.execute("SELECT id FROM totp_accounts WHERE id = %s AND user_id = %s", (account_id, user_id))
            if not cursor.fetchone():
                return jsonify({'success': False, 'message': 'Account not found'}), 404

            # Delete the account
            cursor.execute("DELETE FROM totp_accounts WHERE id = %s AND user_id = %s", (account_id, user_id))
            conn.commit()

            log(f"User {user_id} deleted TOTP account {account_id}")
            return jsonify({'success': True, 'message': 'Account deleted successfully'})
    except Exception as e:
        log(f"Error deleting TOTP account {account_id} for user {user_id}: {e}")
        return jsonify({'success': False, 'message': 'Failed to delete account'}), 500
    finally:
        conn.close()


@app.route("/api/totp/ntp-time", methods=["GET"])
@login_required
def get_ntp_synced_time():
    """
    Get current NTP-synchronized time for TOTP generation.
    Returns Unix timestamp in milliseconds and seconds, plus offset information.
    """
    try:
        ntp_time = get_ntp_time()
        offset = get_ntp_offset()

        return jsonify({
            'success': True,
            'timestamp': int(ntp_time * 1000),  # milliseconds for JavaScript
            'timestamp_seconds': int(ntp_time),  # seconds for TOTP calculation
            'offset': offset,
            'cached': (time.time() - ntp_offset_cache['timestamp']) < NTP_CACHE_DURATION
        })
    except Exception as e:
        log(f"Error getting NTP time: {e}")
        # Fallback to system time if NTP fails
        current_time = time.time()
        return jsonify({
            'success': True,
            'timestamp': int(current_time * 1000),
            'timestamp_seconds': int(current_time),
            'offset': 0,
            'cached': False,
            'fallback': True
        })


@app.route("/api/totp/generate/<int:account_id>", methods=["GET"])
@login_required
def generate_totp_code(account_id):
    """
    Generate TOTP code for a specific account using NTP-synchronized time.
    This ensures the code matches standard authenticators.
    """
    user_id = session["user_id"]
    conn = get_db_connection()

    try:
        with conn.cursor() as cursor:
            # Fetch account details
            cursor.execute(
                "SELECT secret_key, digits, period FROM totp_accounts WHERE id = %s AND user_id = %s",
                (account_id, user_id)
            )
            account = cursor.fetchone()

            if not account:
                return jsonify({'success': False, 'message': 'Account not found'}), 404

            # Generate TOTP using NTP-synchronized time
            totp = pyotp.TOTP(
                account['secret_key'],
                digits=account['digits'],
                interval=account['period']
            )

            # Use NTP time for generation
            ntp_time = get_ntp_time()
            code = totp.at(ntp_time)

            # Calculate time remaining
            period = account['period']
            epoch = int(ntp_time)
            time_remaining = period - (epoch % period)

            return jsonify({
                'success': True,
                'code': code,
                'time_remaining': time_remaining,
                'period': period
            })

    except Exception as e:
        log(f"Error generating TOTP code for account {account_id}: {e}")
        return jsonify({'success': False, 'message': 'Failed to generate code'}), 500
    finally:
        conn.close()


# ==================== END TOTP AUTHENTICATOR ROUTES ====================


# ==================== CODE FORMATTER ROUTES ====================

@app.route("/code-formatter")
@login_required
def code_formatter():
    """Code Formatter page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed Code Formatter")
    return render_template("code-formatter.html", username=username)


@app.route("/api/code-formatter/format", methods=["POST"])
@login_required
def format_code():
    """Format code based on selected mode"""
    user_id = session["user_id"]
    data = request.json

    code = data.get("code", "")
    language = data.get("language", "javascript")
    mode = data.get("mode", "standard")  # 'standard' or 'oneline'

    if not code:
        return jsonify({"success": False, "error": "No code provided"}), 400

    try:
        if mode == "oneline":
            # Convert to one line (minify)
            formatted_code = minify_code(code, language)
        else:
            # Standard IntelliJ-style formatting
            formatted_code = format_code_standard(code, language)

        log(f"User {user_id} formatted {language} code in {mode} mode")
        return jsonify({
            "success": True,
            "formatted_code": formatted_code
        })
    except Exception as e:
        log(f"Error formatting code for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500


def minify_code(code, language):
    """Convert code to single line (minify)"""
    import re

    # Remove comments based on language
    if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript"]:
        # Remove single-line comments
        code = re.sub(r'//.*?$', '', code, flags=re.MULTILINE)
        # Remove multi-line comments
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    elif language in ["python", "ruby", "bash", "shell"]:
        # Remove single-line comments
        code = re.sub(r'#.*?$', '', code, flags=re.MULTILINE)
    elif language in ["sql"]:
        # Remove SQL comments
        code = re.sub(r'--.*?$', '', code, flags=re.MULTILINE)
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)
    elif language in ["html", "xml"]:
        # Remove HTML/XML comments
        code = re.sub(r'<!--.*?-->', '', code, flags=re.DOTALL)
    elif language in ["css", "scss", "less"]:
        # Remove CSS comments
        code = re.sub(r'/\*.*?\*/', '', code, flags=re.DOTALL)

    # Replace multiple spaces with single space
    code = re.sub(r'[ \t]+', ' ', code)

    # Remove all newlines and replace with space
    code = re.sub(r'\n+', ' ', code)

    # Remove spaces around operators and special characters (language-specific)
    if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript"]:
        code = re.sub(r'\s*([{}();,:])\s*', r'\1', code)
        code = re.sub(r'\s*([=+\-*/<>!&|])\s*', r'\1', code)
    elif language == "python":
        # Python needs spaces around operators
        code = re.sub(r'\s*([{}();,:])\s*', r'\1', code)

    # Clean up extra spaces
    code = re.sub(r'\s+', ' ', code)
    code = code.strip()

    return code


def format_code_standard(code, language):
    """Format code with Postman-style beautify (2-space indentation)"""
    import re
    import json

    # Special handling for JSON
    if language == "json":
        try:
            parsed = json.loads(code)
            return json.dumps(parsed, indent=2, ensure_ascii=False)
        except:
            pass  # Fall back to regular formatting if JSON parsing fails

    # First, split code by common delimiters to ensure proper line breaks
    if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript", "css", "scss", "less", "php"]:
        # Add line breaks after opening braces and before closing braces
        code = re.sub(r'\{', '{\n', code)
        code = re.sub(r'\}', '\n}\n', code)
        code = re.sub(r';', ';\n', code)
        # Clean up multiple newlines
        code = re.sub(r'\n+', '\n', code)

    lines = code.split('\n')
    formatted_lines = []
    indent_level = 0
    indent_char = '  '  # 2 spaces (Postman/Beautify style)

    for line in lines:
        stripped = line.strip()

        if not stripped:
            continue

        # Decrease indent for closing braces/brackets
        if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript", "css", "scss", "less", "php", "json"]:
            if stripped.startswith('}') or stripped.startswith(']'):
                indent_level = max(0, indent_level - 1)
        elif language == "python":
            # Python indentation based on dedent keywords
            if stripped.startswith('elif ') or stripped.startswith('else:') or stripped.startswith('except') or stripped.startswith('finally:'):
                indent_level = max(0, indent_level - 1)
        elif language in ["html", "xml"]:
            if stripped.startswith('</'):
                indent_level = max(0, indent_level - 1)

        # Add indented line
        formatted_lines.append(indent_char * indent_level + stripped)

        # Increase indent for opening braces/brackets
        if language in ["javascript", "java", "c", "cpp", "csharp", "go", "rust", "swift", "kotlin", "typescript", "css", "scss", "less", "php", "json"]:
            if stripped.endswith('{') or stripped.endswith('['):
                indent_level += 1
            # Handle closing and opening on same line like "}, {"
            if re.search(r'\},\s*\{', stripped):
                indent_level = max(0, indent_level - 1)
        elif language == "python":
            # Python indentation based on colon
            if stripped.endswith(':'):
                indent_level += 1
        elif language in ["html", "xml"]:
            # HTML/XML opening tags
            if re.match(r'<[^/][^>]*>$', stripped) and not re.match(r'<[^>]*/>$', stripped):
                indent_level += 1
        elif language == "sql":
            # SQL formatting - major keywords on new lines
            if any(stripped.upper().startswith(keyword) for keyword in ['FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'GROUP BY', 'ORDER BY', 'HAVING']):
                indent_level = 1

    formatted_code = '\n'.join(formatted_lines)

    # Clean up excessive blank lines
    formatted_code = re.sub(r'\n{3,}', '\n\n', formatted_code)

    return formatted_code


# ==================== END CODE FORMATTER ROUTES ====================


if __name__ == "__main__":
    log("Starting Flask application")
    log(f"Using pymysql version: {pymysql.__version__}")

    # SSL configuration
    ssl_context = None
    if SSL_CERT_PATH and SSL_KEY_PATH:
        ssl_context = (SSL_CERT_PATH, SSL_KEY_PATH)
        log(f"SSL enabled with cert: {SSL_CERT_PATH}")
    else:
        log("SSL not configured - running without HTTPS")
        ssl_context = None

    app.run(host=RUNNING_HOST, port=RUNNING_PORT, debug=DEBUG, threaded=True, ssl_context=ssl_context)
