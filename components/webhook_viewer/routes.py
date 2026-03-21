from flask import render_template, session, request, jsonify, Response
import pymysql
import os
import json
import time
from datetime import datetime, timezone
from queue import Queue, Empty
from dotenv import load_dotenv

from . import webhook_viewer_bp
from ..utils import (
    login_required, 
    token_required, 
    log, 
    get_db_connection, 
    get_client_ip,
    notify_user_webhook,
    notify_user_notification,
    user_event_queues,
    queue_lock
)

load_dotenv()


@webhook_viewer_bp.route("/webhook-viewer")
@login_required
def webhook_viewer():
    """Webhook viewer application"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed webhook viewer")

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Get webhook IDs
        cursor.execute(
            "SELECT r.webhook_id FROM webhook_responses r INNER JOIN (SELECT webhook_id, MAX(timestamp) AS max_ts FROM webhook_responses WHERE user_id = %s GROUP BY webhook_id) latest ON r.webhook_id = latest.webhook_id AND r.timestamp = latest.max_ts WHERE r.user_id = %s ORDER BY r.timestamp DESC",
            (user_id, user_id))
        webhook_ids = [row['webhook_id'] for row in cursor.fetchall()]

    except pymysql.MySQLError as err:
        log(f"Database error fetching data: {str(err)}")
        return jsonify({"error": str(err)}), 500
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()

    # Get base URL for webhook endpoints
    base_url = request.url_root.rstrip('/')

    return render_template("webhook-viewer.html", webhook_ids=webhook_ids, user_id=user_id, username=username,
                           base_url=base_url)


@webhook_viewer_bp.route("/webhook_ids/<user_id>")
@login_required
def webhook_ids(user_id):
    """Get webhook IDs for a user"""
    # Only allow the logged‑in user to fetch their own IDs
    if str(session["user_id"]) != user_id:
        return jsonify({"error": "Unauthorized"}), 403

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
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

        ids = [row['webhook_id'] for row in cursor.fetchall()]
        return jsonify({"ids": ids}), 200

    except pymysql.MySQLError as err:
        log(f"Database error fetching webhook IDs: {err}")
        return jsonify({"error": "Database error"}), 500

    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()


@webhook_viewer_bp.route("/search_webhooks", methods=["POST"])
@login_required
def search_webhooks():
    """Search across all webhooks for a user"""
    user_id = session["user_id"]
    data = request.get_json()
    search_term = data.get("search_term", "").strip()
    start_date = data.get("start_date", "")
    end_date = data.get("end_date", "")

    log(f"User {user_id} searching for: '{search_term}', date range: {start_date} to {end_date}")

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

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


@webhook_viewer_bp.route("/search_thread", methods=["POST"])
@login_required
def search_thread():
    """Search within a specific webhook ID"""
    user_id = session["user_id"]
    data = request.get_json()
    search_term = data.get("search_term", "").strip()
    webhook_id = data.get("webhook_id", "").strip()
    start_date = data.get("start_date", "")
    end_date = data.get("end_date", "")

    log(f"User {user_id} searching thread '{webhook_id}' for: '{search_term}', date range: {start_date} to {end_date}")

    if not webhook_id:
        return jsonify({"error": "Webhook ID is required"}), 400

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Base query - filter by user_id AND webhook_id
        query = """
            SELECT id, webhook_id, method, headers, body, query_params,
                   timestamp, is_read, client_ip
            FROM webhook_responses
            WHERE user_id = %s AND webhook_id = %s
        """
        params = [user_id, webhook_id]

        # Add search term conditions only if search term is provided
        if search_term:
            query += """
            AND (
                body LIKE %s
                OR headers LIKE %s
                OR query_params LIKE %s
                OR method LIKE %s
            )
            """
            search_pattern = f"%{search_term}%"
            params.extend([search_pattern] * 4)

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
                if search_term.lower() in result.get('method', '').lower():
                    result['match_context'].append('method')

        log(f"Found {len(results)} results for thread search in webhook '{webhook_id}' with term='{search_term}', start={start_date}, end={end_date}")
        return jsonify({"results": results}), 200

    except pymysql.MySQLError as err:
        log(f"Database error during thread search: {str(err)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        log(f"Unexpected error during thread search: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500
    finally:
        if cursor is not None:
            cursor.close()
        if conn is not None and conn.open:
            conn.close()


@webhook_viewer_bp.route("/mark_as_read/<int:request_id>", methods=["POST"])
@login_required
def mark_as_read(request_id):
    """Mark a webhook request as read"""
    user_id = session["user_id"]
    log(f"User {user_id} marking request {request_id} as read")

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
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


@webhook_viewer_bp.route("/get_notifications")
@login_required
def get_notifications():
    """Get unread webhook notifications for a user"""
    user_id = session["user_id"]
    log(f"User {user_id} fetching notifications")

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

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


@webhook_viewer_bp.route("/mark_all_notifications_read", methods=["POST"])
@login_required
def mark_all_notifications_read():
    """Mark all notifications as read for a user"""
    user_id = session["user_id"]
    log(f"User {user_id} marking all notifications as read")

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
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


@webhook_viewer_bp.route("/delete_request/<int:request_id>", methods=["DELETE"])
@login_required
def delete_request(request_id):
    """Delete a webhook request"""
    user_id = session["user_id"]
    log(f"User {user_id} deleting request {request_id}")

    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # First verify the request belongs to this user
        cursor.execute("SELECT webhook_id FROM webhook_responses WHERE id = %s AND user_id = %s",
                       (request_id, user_id))
        result = cursor.fetchone()

        if not result:
            log(f"Request {request_id} not found or doesn't belong to user {user_id}")
            return jsonify({"error": "Request not found or unauthorized"}), 404

        webhook_id = result['webhook_id']

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


@webhook_viewer_bp.route("/webhook/<user_id>/<webhook_id>", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
def handle_webhook(user_id, webhook_id):
    """Main webhook handler - receives and stores webhooks"""
    # Handle GET requests to retrieve webhook data (original behavior)
    if request.method == "GET":
        log(f"Webhook GET request for user {user_id}, webhook {webhook_id}")
        conn = None
        cursor = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
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
            conn = get_db_connection()
            cursor = conn.cursor()

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
            """, (user_id, webhook_id, method, json.dumps(headers, sort_keys=False), json.dumps(body, sort_keys=False), json.dumps(query_params, sort_keys=False),
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
                'headers': json.dumps(headers, sort_keys=False),
                'body': json.dumps(body, sort_keys=False),
                'query_params': json.dumps(query_params, sort_keys=False),
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


@webhook_viewer_bp.route("/events/<user_id>")
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


# ==================== WEBHOOK-OUT API ENDPOINT ====================

@webhook_viewer_bp.route("/api/webhook-out", methods=["POST"])
@token_required
def webhook_out():
    """
    Webhook-out endpoint to search for latest webhook response.
    
    Requires API token authentication via:
    - Header: X-API-Token: <your_token>
    - Header: Authorization: Bearer <your_token>
    - Query param: ?api_token=<your_token>
    
    Request body:
    {
        "webhook_id": "my-webhook",
        "content": "search term",           # Optional: search in body/headers/params
        "json_path": "path.to.field",       # Optional: specific JSON path to match
        "json_value": "expected value",     # Optional: value to match at json_path
        "wait_timeout": 180                 # Optional: seconds to wait for webhook (default 0, max 180)
    }
    
    Response:
    {
        "success": true,
        "webhook": {
            "id": 123,
            "webhook_id": "my-webhook",
            "method": "POST",
            "headers": {...},
            "body": {...},
            "query_params": {...},
            "timestamp": "2026-03-18T...",
            "client_ip": "192.168.1.1"
        }
    }
    """
    user_id = request.token_user_id
    data = request.get_json()
    
    if not data:
        return jsonify({"success": False, "error": "JSON body required"}), 400
    
    webhook_id = data.get("webhook_id")
    if not webhook_id:
        return jsonify({"success": False, "error": "webhook_id is required"}), 400
    
    content = data.get("content", "").strip()
    json_path = data.get("json_path", "").strip()
    json_value = data.get("json_value")
    
    # Get wait_timeout parameter (default 0, max 180 seconds = 3 minutes)
    wait_timeout = min(int(data.get("wait_timeout", 0)), 180)
    
    log(f"Webhook-out search: user={user_id}, webhook_id={webhook_id}, content={content}, json_path={json_path}, wait_timeout={wait_timeout}s")
    
    start_time = time.time()
    poll_interval = 1  # Check every 1 second
    attempts = 0
    last_checked_timestamp = None  # Track the latest timestamp we've already checked
    
    # Poll for webhook with timeout
    while True:
        attempts += 1
        conn = None
        cursor = None
        
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            
            # Determine how many webhooks to check
            # On first attempt, check multiple existing webhooks
            # On subsequent attempts, check only new webhooks (LIMIT 1)
            limit = 1 if last_checked_timestamp is not None else 100
            
            # Base query to get webhooks
            query = """
                SELECT id, webhook_id, method, headers, body, query_params,
                       timestamp, client_ip, is_read
                FROM webhook_responses
                WHERE user_id = %s AND webhook_id = %s
            """
            params = [user_id, webhook_id]
            
            # On subsequent attempts, only check webhooks newer than what we've already seen
            if last_checked_timestamp is not None:
                query += " AND timestamp > %s"
                params.append(last_checked_timestamp)
            
            # Add content search if provided
            if content:
                query += """
                    AND (
                        body LIKE %s
                        OR headers LIKE %s
                        OR query_params LIKE %s
                    )
                """
                search_pattern = f"%{content}%"
                params.extend([search_pattern, search_pattern, search_pattern])
            
            query += f" ORDER BY timestamp DESC LIMIT {limit}"
            
            cursor.execute(query, params)
            results = cursor.fetchall()  # Fetch all matching webhooks
            
            # Close connection immediately after query
            cursor.close()
            conn.close()
            cursor = None
            conn = None
            
            # Process each webhook to find a match
            for result in results:
                # Parse JSON fields - preserve key order
                try:
                    result['headers'] = json.loads(result['headers'], object_pairs_hook=dict) if result['headers'] else {}
                    result['body'] = json.loads(result['body'], object_pairs_hook=dict) if result['body'] else None
                    result['query_params'] = json.loads(result['query_params'], object_pairs_hook=dict) if result['query_params'] else {}
                except json.JSONDecodeError:
                    pass  # Keep as string if not valid JSON
                
                # If json_path is specified, validate it matches
                if json_path and json_value is not None:
                    body = result.get('body')
                    if isinstance(body, dict):
                        # Navigate the JSON path
                        path_parts = json_path.split('.')
                        current = body
                        
                        validation_passed = True
                        try:
                            for part in path_parts:
                                if isinstance(current, dict):
                                    current = current.get(part)
                                elif isinstance(current, list) and part.isdigit():
                                    current = current[int(part)]
                                else:
                                    current = None
                                    break
                            
                            # Check if value matches
                            if current != json_value:
                                validation_passed = False
                                log(f"JSON path value mismatch in webhook id={result['id']}: expected={json_value}, got={current}")
                                continue  # Try next webhook in the list
                                    
                        except (KeyError, IndexError, TypeError):
                            log(f"JSON path traversal failed for webhook id={result['id']}: {json_path}")
                            continue  # Try next webhook in the list
                    else:
                        # Body is not a dict, skip this webhook
                        continue
                
                # Webhook found and validated successfully
                # Convert timestamp to ISO format
                if result.get('timestamp'):
                    result['timestamp'] = result['timestamp'].isoformat()
                
                elapsed = time.time() - start_time
                log(f"Webhook-out search success: found webhook id={result['id']} after {attempts} attempts ({round(elapsed, 2)}s)")
                
                return jsonify({
                    "success": True,
                    "webhook": result,
                    "waited_seconds": round(elapsed, 2) if wait_timeout > 0 else 0
                })
            
            # No matching webhook found in this batch
            elapsed = time.time() - start_time
            
            # Track the latest timestamp we've seen to avoid re-checking same webhooks
            if results:
                # Update the baseline to the most recent webhook we just checked
                # This ensures on next iteration we only check newer webhooks
                if last_checked_timestamp is None or results[0]['timestamp'] > last_checked_timestamp:
                    last_checked_timestamp = results[0]['timestamp']
                    log(f"Checked {len(results)} webhooks, none matched. Last checked timestamp: {last_checked_timestamp}")
            elif last_checked_timestamp is None:
                # No webhooks exist at all yet, set baseline to now
                last_checked_timestamp = datetime.now(timezone.utc)
                log(f"No webhooks found yet. Will wait for new webhooks after {last_checked_timestamp}")
            
            # Check if we should continue waiting
            if wait_timeout > 0 and elapsed < wait_timeout:
                log(f"Webhook not found yet (attempt {attempts}), waiting... ({round(elapsed, 2)}s elapsed)")
                time.sleep(poll_interval)
                continue
            else:
                # Timeout or no wait requested
                log(f"No webhook found for user={user_id}, webhook_id={webhook_id} after {attempts} attempts ({round(elapsed, 2)}s)")
                return jsonify({
                    "success": False,
                    "error": "No matching webhook found",
                    "waited_seconds": round(elapsed, 2) if wait_timeout > 0 else 0
                }), 404
            
        except Exception as e:
            log(f"Error in webhook-out search: {str(e)}")
            return jsonify({
                "success": False,
                "error": "Internal server error"
            }), 500
        finally:
            # Clean up any remaining connections
            if cursor:
                try:
                    cursor.close()
                except:
                    pass
            if conn:
                try:
                    conn.close()
                except:
                    pass
