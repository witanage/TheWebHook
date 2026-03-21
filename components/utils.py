"""
Shared utilities for component blueprints
"""
from flask import session, redirect, url_for, request, jsonify
from functools import wraps
import logging
import pymysql
import os
import threading
import json
from queue import Queue
from dotenv import load_dotenv

load_dotenv()

# Database configuration
db_config = {
    "host": os.getenv("DB_HOST"),
    "port": int(os.getenv("DB_PORT", "3306")),
    "user": os.getenv("DB_USER"),
    "password": os.getenv("DB_PASSWORD"),
    "database": os.getenv("DB_NAME"),
    "connect_timeout": 10
}

# Logging configuration
LOGGING_ENABLED = os.getenv("LOGGING_ENABLED", "False").lower() == "true"
logger = logging.getLogger(__name__)

# SSE event queues for each user (shared globally)
user_event_queues = {}
queue_lock = threading.Lock()


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
    """Decorator to require login for routes"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if "user_id" not in session:
            log(f"Unauthorized access attempt to {request.path}")
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function


def admin_required(f):
    """Decorator to require admin privileges for routes"""
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


def token_required(f):
    """Decorator for API token authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Check for API token in headers
        api_token = request.headers.get('X-API-Token') or request.headers.get('Authorization')
        
        # Also check query parameters as fallback
        if not api_token:
            api_token = request.args.get('api_token')
        
        if not api_token:
            return jsonify({"success": False, "error": "API token required"}), 401
        
        # Remove 'Bearer ' prefix if present
        if api_token.startswith('Bearer '):
            api_token = api_token[7:]
        
        # Validate token
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            cursor.execute("SELECT id as user_id FROM users WHERE api_token = %s AND status = 1", (api_token,))
            result = cursor.fetchone()
            
            if not result:
                return jsonify({"success": False, "error": "Invalid API token"}), 401
            
            # Store user_id in request for use in route
            request.token_user_id = result['user_id']
            
            return f(*args, **kwargs)
            
        except Exception as e:
            log(f"Error validating API token: {str(e)}")
            return jsonify({"success": False, "error": "Token validation failed"}), 500
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
    
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


def log(message):
    """Logging function with toggle"""
    if LOGGING_ENABLED:
        logger.info(message)
