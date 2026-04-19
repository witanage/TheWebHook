from flask import render_template, request, jsonify, Response
from . import cron_scheduler_bp
from components.utils import get_db_connection, log
import json
from datetime import datetime, timezone
import traceback
from queue import Queue, Empty
import threading

# Event queues for SSE notifications (similar to webhook_viewer pattern)
cron_event_queues = []
cron_queue_lock = threading.Lock()


def notify_cron_event(event_type, data):
    """Send SSE notification to all connected clients"""
    with cron_queue_lock:
        for queue in cron_event_queues[:]:
            try:
                queue.put({
                    'type': event_type,
                    'data': data,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                })
            except:
                cron_event_queues.remove(queue)


@cron_scheduler_bp.route("/cron-scheduler")
def cron_scheduler_page():
    """Main cron scheduler page"""
    return render_template("cron-scheduler.html")


@cron_scheduler_bp.route("/cron-scheduler/events")
def cron_scheduler_events():
    """SSE endpoint for real-time notifications"""
    def event_stream():
        queue = Queue(maxsize=50)
        with cron_queue_lock:
            cron_event_queues.append(queue)
        
        try:
            while True:
                try:
                    event = queue.get(timeout=30)
                    yield f"data: {json.dumps(event)}\n\n"
                except Empty:
                    # Send keep-alive ping
                    yield f": keep-alive\n\n"
        finally:
            with cron_queue_lock:
                if queue in cron_event_queues:
                    cron_event_queues.remove(queue)
    
    return Response(event_stream(), mimetype="text/event-stream")


# =============================================================================
# FOLDER API ROUTES
# =============================================================================

@cron_scheduler_bp.route("/api/cron-scheduler/folders", methods=["GET"])
def get_folders():
    """Get all folders"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, name, display_order, created_at, updated_at
            FROM cron_folders
            ORDER BY display_order, name
        """)
        
        folders = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return jsonify({"folders": folders}), 200
    
    except Exception as e:
        log(f"Error fetching folders: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/folders", methods=["POST"])
def create_folder():
    """Create new folder"""
    try:
        data = request.get_json()
        name = data.get("name", "").strip()
        
        if not name:
            return jsonify({"error": "Folder name is required"}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get max display_order
        cursor.execute("SELECT COALESCE(MAX(display_order), 0) + 1 FROM cron_folders")
        display_order = cursor.fetchone()["COALESCE(MAX(display_order), 0) + 1"]
        
        cursor.execute("""
            INSERT INTO cron_folders (name, display_order)
            VALUES (%s, %s)
        """, (name, display_order))
        
        conn.commit()
        folder_id = cursor.lastrowid
        
        cursor.close()
        conn.close()
        
        return jsonify({"id": folder_id, "name": name, "display_order": display_order}), 201
    
    except Exception as e:
        log(f"Error creating folder: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/folders/<int:folder_id>", methods=["PUT"])
def update_folder(folder_id):
    """Update folder name"""
    try:
        data = request.get_json()
        name = data.get("name", "").strip()
        
        if not name:
            return jsonify({"error": "Folder name is required"}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            UPDATE cron_folders
            SET name = %s
            WHERE id = %s
        """, (name, folder_id))
        
        conn.commit()
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return jsonify({"error": "Folder not found"}), 404
        
        cursor.close()
        conn.close()
        
        return jsonify({"message": "Folder updated successfully"}), 200
    
    except Exception as e:
        log(f"Error updating folder: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/folders/<int:folder_id>", methods=["DELETE"])
def delete_folder(folder_id):
    """Delete folder (moves jobs to root)"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Move all jobs in this folder to root (folder_id = NULL)
        cursor.execute("""
            UPDATE cron_jobs
            SET folder_id = NULL
            WHERE folder_id = %s
        """, (folder_id,))
        
        # Delete the folder
        cursor.execute("DELETE FROM cron_folders WHERE id = %s", (folder_id,))
        
        conn.commit()
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return jsonify({"error": "Folder not found"}), 404
        
        cursor.close()
        conn.close()
        
        return jsonify({"message": "Folder deleted successfully"}), 200
    
    except Exception as e:
        log(f"Error deleting folder: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# =============================================================================
# JOB API ROUTES (will be completed in next iteration)
# =============================================================================

@cron_scheduler_bp.route("/api/cron-scheduler/jobs", methods=["GET"])
def get_jobs():
    """Get all jobs"""
    try:
        folder_id = request.args.get("folder_id")
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        if folder_id:
            cursor.execute("""
                SELECT * FROM cron_jobs
                WHERE folder_id = %s
                ORDER BY title
            """, (folder_id,))
        else:
            cursor.execute("""
                SELECT * FROM cron_jobs
                ORDER BY title
            """)
        
        jobs = cursor.fetchall()
        
        # Parse JSON fields
        for job in jobs:
            if job.get('headers'):
                job['headers'] = json.loads(job['headers']) if isinstance(job['headers'], str) else job['headers']
            if job.get('schedule_minutes'):
                job['schedule_minutes'] = json.loads(job['schedule_minutes']) if isinstance(job['schedule_minutes'], str) else job['schedule_minutes']
            if job.get('schedule_hours'):
                job['schedule_hours'] = json.loads(job['schedule_hours']) if isinstance(job['schedule_hours'], str) else job['schedule_hours']
            if job.get('schedule_mdays'):
                job['schedule_mdays'] = json.loads(job['schedule_mdays']) if isinstance(job['schedule_mdays'], str) else job['schedule_mdays']
            if job.get('schedule_months'):
                job['schedule_months'] = json.loads(job['schedule_months']) if isinstance(job['schedule_months'], str) else job['schedule_months']
            if job.get('schedule_wdays'):
                job['schedule_wdays'] = json.loads(job['schedule_wdays']) if isinstance(job['schedule_wdays'], str) else job['schedule_wdays']
        
        cursor.close()
        conn.close()
        
        return jsonify({"jobs": jobs}), 200
    
    except Exception as e:
        log(f"Error fetching jobs: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/jobs/<int:job_id>", methods=["GET"])
def get_job(job_id):
    """Get job details with next execution predictions"""
    try:
        from .scheduler import get_next_executions
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT * FROM cron_jobs WHERE id = %s", (job_id,))
        job = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        if not job:
            return jsonify({"error": "Job not found"}), 404
        
        # Parse JSON fields
        if job.get('headers'):
            job['headers'] = json.loads(job['headers']) if isinstance(job['headers'], str) else job['headers']
        if job.get('schedule_minutes'):
            job['schedule_minutes'] = json.loads(job['schedule_minutes']) if isinstance(job['schedule_minutes'], str) else job['schedule_minutes']
        if job.get('schedule_hours'):
            job['schedule_hours'] = json.loads(job['schedule_hours']) if isinstance(job['schedule_hours'], str) else job['schedule_hours']
        if job.get('schedule_mdays'):
            job['schedule_mdays'] = json.loads(job['schedule_mdays']) if isinstance(job['schedule_mdays'], str) else job['schedule_mdays']
        if job.get('schedule_months'):
            job['schedule_months'] = json.loads(job['schedule_months']) if isinstance(job['schedule_months'], str) else job['schedule_months']
        if job.get('schedule_wdays'):
            job['schedule_wdays'] = json.loads(job['schedule_wdays']) if isinstance(job['schedule_wdays'], str) else job['schedule_wdays']
        
        # Get next execution predictions
        predictions = get_next_executions(job_id, 3)
        job['predictions'] = predictions
        
        return jsonify({"job": job}), 200
    
    except Exception as e:
        log(f"Error fetching job: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/jobs", methods=["POST"])
def create_job():
    """Create new cron job"""
    try:
        from .scheduler import add_job_to_scheduler, scheduler
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get("url"):
            return jsonify({"error": "URL is required"}), 400
        
        if not data.get("title"):
            return jsonify({"error": "Title is required"}), 400
        
        # Validate URL scheme
        url = data["url"]
        if url.startswith("file://"):
            return jsonify({"error": "file:// URLs are not allowed"}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Prepare data
        headers = json.dumps(data.get("headers", {}))
        schedule_minutes = json.dumps(data.get("schedule_minutes", [-1]))
        schedule_hours = json.dumps(data.get("schedule_hours", [-1]))
        schedule_mdays = json.dumps(data.get("schedule_mdays", [-1]))
        schedule_months = json.dumps(data.get("schedule_months", [-1]))
        schedule_wdays = json.dumps(data.get("schedule_wdays", [-1]))
        
        cursor.execute("""
            INSERT INTO cron_jobs (
                folder_id, enabled, title, url, request_method, request_timeout,
                save_responses, redirect_success, auth_enabled, auth_user, auth_password,
                headers, body, notify_on_failure, notify_failure_count, notify_on_success,
                notify_on_disable, schedule_timezone, schedule_minutes, schedule_hours,
                schedule_mdays, schedule_months, schedule_wdays, schedule_expires_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            data.get("folder_id"),
            data.get("enabled", 1),
            data["title"],
            data["url"],
            data.get("request_method", "GET"),
            data.get("request_timeout", 30),
            data.get("save_responses", 0),
            data.get("redirect_success", 0),
            data.get("auth_enabled", 0),
            data.get("auth_user"),
            data.get("auth_password"),
            headers,
            data.get("body"),
            data.get("notify_on_failure", 0),
            data.get("notify_failure_count", 1),
            data.get("notify_on_success", 0),
            data.get("notify_on_disable", 0),
            data.get("schedule_timezone", "UTC"),
            schedule_minutes,
            schedule_hours,
            schedule_mdays,
            schedule_months,
            schedule_wdays,
            data.get("schedule_expires_at")
        ))
        
        conn.commit()
        job_id = cursor.lastrowid
        
        # Fetch the created job
        cursor.execute("SELECT * FROM cron_jobs WHERE id = %s", (job_id,))
        job = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        # Add to scheduler if enabled
        if job['enabled'] and scheduler:
            try:
                add_job_to_scheduler(job)
            except Exception as e:
                log(f"Error adding job to scheduler: {str(e)}")
        
        return jsonify({"id": job_id, "message": "Job created successfully"}), 201
    
    except Exception as e:
        log(f"Error creating job: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/jobs/<int:job_id>", methods=["PUT"])
def update_job(job_id):
    """Update existing cron job"""
    try:
        from .scheduler import update_job_in_scheduler, remove_job_from_scheduler, scheduler
        
        data = request.get_json()
        
        # Validate URL if provided
        if data.get("url") and data["url"].startswith("file://"):
            return jsonify({"error": "file:// URLs are not allowed"}), 400
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Build update query dynamically
        update_fields = []
        update_values = []
        
        field_mapping = {
            "folder_id": "folder_id",
            "enabled": "enabled",
            "title": "title",
            "url": "url",
            "request_method": "request_method",
            "request_timeout": "request_timeout",
            "save_responses": "save_responses",
            "redirect_success": "redirect_success",
            "auth_enabled": "auth_enabled",
            "auth_user": "auth_user",
            "auth_password": "auth_password",
            "body": "body",
            "notify_on_failure": "notify_on_failure",
            "notify_failure_count": "notify_failure_count",
            "notify_on_success": "notify_on_success",
            "notify_on_disable": "notify_on_disable",
            "schedule_timezone": "schedule_timezone",
            "schedule_expires_at": "schedule_expires_at"
        }
        
        for key, db_field in field_mapping.items():
            if key in data:
                update_fields.append(f"{db_field} = %s")
                update_values.append(data[key])
        
        # Handle JSON fields
        if "headers" in data:
            update_fields.append("headers = %s")
            update_values.append(json.dumps(data["headers"]))
        
        if "schedule_minutes" in data:
            update_fields.append("schedule_minutes = %s")
            update_values.append(json.dumps(data["schedule_minutes"]))
        
        if "schedule_hours" in data:
            update_fields.append("schedule_hours = %s")
            update_values.append(json.dumps(data["schedule_hours"]))
        
        if "schedule_mdays" in data:
            update_fields.append("schedule_mdays = %s")
            update_values.append(json.dumps(data["schedule_mdays"]))
        
        if "schedule_months" in data:
            update_fields.append("schedule_months = %s")
            update_values.append(json.dumps(data["schedule_months"]))
        
        if "schedule_wdays" in data:
            update_fields.append("schedule_wdays = %s")
            update_values.append(json.dumps(data["schedule_wdays"]))
        
        if not update_fields:
            return jsonify({"error": "No fields to update"}), 400
        
        update_values.append(job_id)
        
        cursor.execute(f"""
            UPDATE cron_jobs
            SET {', '.join(update_fields)}
            WHERE id = %s
        """, update_values)
        
        conn.commit()
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return jsonify({"error": "Job not found"}), 404
        
        # Fetch updated job
        cursor.execute("SELECT * FROM cron_jobs WHERE id = %s", (job_id,))
        job = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        # Update in scheduler
        if scheduler:
            if job['enabled']:
                try:
                    update_job_in_scheduler(job)
                except Exception as e:
                    log(f"Error updating job in scheduler: {str(e)}")
            else:
                remove_job_from_scheduler(job_id)
        
        return jsonify({"message": "Job updated successfully"}), 200
    
    except Exception as e:
        log(f"Error updating job: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/jobs/<int:job_id>", methods=["DELETE"])
def delete_job(job_id):
    """Delete cron job"""
    try:
        from .scheduler import remove_job_from_scheduler, scheduler
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Delete job (cascade will delete history)
        cursor.execute("DELETE FROM cron_jobs WHERE id = %s", (job_id,))
        conn.commit()
        
        if cursor.rowcount == 0:
            cursor.close()
            conn.close()
            return jsonify({"error": "Job not found"}), 404
        
        cursor.close()
        conn.close()
        
        # Remove from scheduler
        if scheduler:
            try:
                remove_job_from_scheduler(job_id)
            except Exception as e:
                log(f"Error removing job from scheduler: {str(e)}")
        
        return jsonify({"message": "Job deleted successfully"}), 200
    
    except Exception as e:
        log(f"Error deleting job: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/jobs/<int:job_id>/toggle", methods=["POST"])
def toggle_job(job_id):
    """Toggle job enabled/disabled"""
    try:
        from .scheduler import add_job_to_scheduler, remove_job_from_scheduler, scheduler
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get current state
        cursor.execute("SELECT enabled FROM cron_jobs WHERE id = %s", (job_id,))
        result = cursor.fetchone()
        
        if not result:
            cursor.close()
            conn.close()
            return jsonify({"error": "Job not found"}), 404
        
        new_enabled = 0 if result['enabled'] else 1
        
        # Update state
        cursor.execute("UPDATE cron_jobs SET enabled = %s WHERE id = %s", (new_enabled, job_id))
        conn.commit()
        
        # Fetch updated job
        cursor.execute("SELECT * FROM cron_jobs WHERE id = %s", (job_id,))
        job = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        # Update scheduler
        if scheduler:
            if new_enabled:
                try:
                    add_job_to_scheduler(job)
                except Exception as e:
                    log(f"Error adding job to scheduler: {str(e)}")
            else:
                remove_job_from_scheduler(job_id)
        
        return jsonify({"enabled": new_enabled, "message": "Job toggled successfully"}), 200
    
    except Exception as e:
        log(f"Error toggling job: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/jobs/<int:job_id>/test", methods=["POST"])
def test_job(job_id):
    """Execute job immediately (test run)"""
    try:
        from .scheduler import execute_job
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("SELECT id FROM cron_jobs WHERE id = %s", (job_id,))
        if not cursor.fetchone():
            cursor.close()
            conn.close()
            return jsonify({"error": "Job not found"}), 404
        
        cursor.close()
        conn.close()
        
        # Execute job in background thread
        import threading
        thread = threading.Thread(target=execute_job, args=(job_id,))
        thread.start()
        
        return jsonify({"message": "Test run started"}), 200
    
    except Exception as e:
        log(f"Error running test: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


# =============================================================================
# HISTORY API ROUTES
# =============================================================================

@cron_scheduler_bp.route("/api/cron-scheduler/jobs/<int:job_id>/history", methods=["GET"])
def get_job_history(job_id):
    """Get execution history for a job"""
    try:
        from .scheduler import get_next_executions
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get history (last 25 entries)
        cursor.execute("""
            SELECT id, job_id, date_executed, date_planned, jitter_ms, url,
                   duration_ms, status, status_text, http_status,
                   stats_total, created_at
            FROM cron_job_history
            WHERE job_id = %s
            ORDER BY date_executed DESC
            LIMIT 25
        """, (job_id,))
        
        history = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        # Get predictions
        predictions = get_next_executions(job_id, 3)
        
        return jsonify({"history": history, "predictions": predictions}), 200
    
    except Exception as e:
        log(f"Error fetching history: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/jobs/<int:job_id>/history/<int:history_id>", methods=["GET"])
def get_history_detail(job_id, history_id):
    """Get detailed history entry with full response"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM cron_job_history
            WHERE id = %s AND job_id = %s
        """, (history_id, job_id))
        
        history = cursor.fetchone()
        
        cursor.close()
        conn.close()
        
        if not history:
            return jsonify({"error": "History entry not found"}), 404
        
        return jsonify({"history": history}), 200
    
    except Exception as e:
        log(f"Error fetching history detail: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500


@cron_scheduler_bp.route("/api/cron-scheduler/dashboard", methods=["GET"])
def get_dashboard():
    """Get dashboard statistics"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Total jobs
        cursor.execute("SELECT COUNT(*) as total FROM cron_jobs")
        total_jobs = cursor.fetchone()["total"]
        
        # Active jobs
        cursor.execute("SELECT COUNT(*) as active FROM cron_jobs WHERE enabled = 1")
        active_jobs = cursor.fetchone()["active"]
        
        # Failing jobs (last_status != 1 and enabled)
        cursor.execute("SELECT COUNT(*) as failing FROM cron_jobs WHERE enabled = 1 AND last_status > 1")
        failing_jobs = cursor.fetchone()["failing"]
        
        # Recent executions (last 24 hours)
        cursor.execute("""
            SELECT COUNT(*) as recent
            FROM cron_job_history
            WHERE date_executed >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
        """)
        recent_executions = cursor.fetchone()["recent"]
        
        cursor.close()
        conn.close()
        
        return jsonify({
            "total_jobs": total_jobs,
            "active_jobs": active_jobs,
            "failing_jobs": failing_jobs,
            "recent_executions": recent_executions
        }), 200
    
    except Exception as e:
        log(f"Error fetching dashboard stats: {str(e)}")
        log(traceback.format_exc())
        return jsonify({"error": str(e)}), 500
