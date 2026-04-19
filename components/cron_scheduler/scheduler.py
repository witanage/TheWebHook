"""
Cron Scheduler Engine
Handles background job execution using APScheduler
"""

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED
import requests
from datetime import datetime, timezone
import pytz
import json
import traceback
from croniter import croniter
from components.utils import get_db_connection, log
import time

# Global scheduler instance
scheduler = None

# Status constants (matching cron-job.org)
STATUS_UNKNOWN = 0
STATUS_OK = 1
STATUS_DNS_ERROR = 2
STATUS_CONNECT_ERROR = 3
STATUS_HTTP_ERROR = 4
STATUS_TIMEOUT = 5
STATUS_TOO_MUCH_DATA = 6
STATUS_INVALID_URL = 7
STATUS_INTERNAL_ERROR = 8
STATUS_UNKNOWN_ERROR = 9

MAX_RESPONSE_SIZE = 10 * 1024 * 1024  # 10 MB limit
MAX_CONSECUTIVE_FAILURES = 26  # Auto-disable threshold


def init_scheduler(app):
    """Initialize the APScheduler and load all enabled jobs"""
    global scheduler
    
    try:
        log("Initializing cron scheduler...")
        
        scheduler = BackgroundScheduler(timezone=pytz.UTC)
        
        # Add event listeners
        scheduler.add_listener(job_execution_listener, EVENT_JOB_EXECUTED | EVENT_JOB_ERROR)
        
        # Load all enabled jobs from database
        load_jobs_from_db()
        
        # Start the scheduler
        scheduler.start()
        
        log(f"Cron scheduler started with {len(scheduler.get_jobs())} jobs")
        
        # Register shutdown handler
        import atexit
        atexit.register(shutdown_scheduler)
        
    except Exception as e:
        log(f"Error initializing scheduler: {str(e)}")
        log(traceback.format_exc())


def shutdown_scheduler():
    """Gracefully shutdown the scheduler"""
    global scheduler
    if scheduler and scheduler.running:
        log("Shutting down cron scheduler...")
        scheduler.shutdown(wait=False)
        log("Cron scheduler stopped")


def load_jobs_from_db():
    """Load all enabled jobs from database and add to scheduler"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, title, schedule_timezone, schedule_minutes, schedule_hours,
                   schedule_mdays, schedule_months, schedule_wdays
            FROM cron_jobs
            WHERE enabled = 1
        """)
        
        jobs = cursor.fetchall()
        cursor.close()
        conn.close()
        
        for job in jobs:
            try:
                add_job_to_scheduler(job)
            except Exception as e:
                log(f"Error loading job {job['id']}: {str(e)}")
        
        log(f"Loaded {len(jobs)} enabled jobs")
        
    except Exception as e:
        log(f"Error loading jobs from database: {str(e)}")
        log(traceback.format_exc())


def add_job_to_scheduler(job):
    """Add a job to the APScheduler"""
    try:
        job_id = job['id']
        
        # Parse schedule arrays
        minutes = json.loads(job['schedule_minutes']) if isinstance(job['schedule_minutes'], str) else job['schedule_minutes']
        hours = json.loads(job['schedule_hours']) if isinstance(job['schedule_hours'], str) else job['schedule_hours']
        mdays = json.loads(job['schedule_mdays']) if isinstance(job['schedule_mdays'], str) else job['schedule_mdays']
        months = json.loads(job['schedule_months']) if isinstance(job['schedule_months'], str) else job['schedule_months']
        wdays = json.loads(job['schedule_wdays']) if isinstance(job['schedule_wdays'], str) else job['schedule_wdays']
        
        # Convert -1 (every) to "*"
        minute_expr = "*" if -1 in minutes else ",".join(map(str, minutes))
        hour_expr = "*" if -1 in hours else ",".join(map(str, hours))
        day_expr = "*" if -1 in mdays else ",".join(map(str, mdays))
        month_expr = "*" if -1 in months else ",".join(map(str, months))
        dow_expr = "*" if -1 in wdays else ",".join(map(str, wdays))
        
        # Get timezone
        tz = pytz.timezone(job.get('schedule_timezone', 'UTC'))
        
        # Create cron trigger
        trigger = CronTrigger(
            minute=minute_expr,
            hour=hour_expr,
            day=day_expr,
            month=month_expr,
            day_of_week=dow_expr,
            timezone=tz
        )
        
        # Add job to scheduler
        scheduler.add_job(
            execute_job,
            trigger=trigger,
            id=f"cron_job_{job_id}",
            args=[job_id],
            max_instances=1,  # Prevent overlapping executions
            replace_existing=True,
            coalesce=True  # Combine missed executions
        )
        
        # Update next_execution in database
        update_next_execution(job_id, trigger, tz)
        
        log(f"Added job {job_id} ({job.get('title', 'Untitled')}) to scheduler")
        
    except Exception as e:
        log(f"Error adding job to scheduler: {str(e)}")
        log(traceback.format_exc())
        raise


def remove_job_from_scheduler(job_id):
    """Remove a job from the APScheduler"""
    try:
        scheduler.remove_job(f"cron_job_{job_id}")
        log(f"Removed job {job_id} from scheduler")
    except Exception as e:
        log(f"Error removing job from scheduler: {str(e)}")


def update_job_in_scheduler(job):
    """Update an existing job in the scheduler"""
    remove_job_from_scheduler(job['id'])
    add_job_to_scheduler(job)


def update_next_execution(job_id, trigger=None, tz=None):
    """Update the next_execution field in database"""
    try:
        if trigger is None:
            # Fetch job config to build trigger
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                SELECT schedule_timezone, schedule_minutes, schedule_hours,
                       schedule_mdays, schedule_months, schedule_wdays
                FROM cron_jobs WHERE id = %s
            """, (job_id,))
            job = cursor.fetchone()
            cursor.close()
            conn.close()
            
            if not job:
                return
            
            minutes = json.loads(job['schedule_minutes']) if isinstance(job['schedule_minutes'], str) else job['schedule_minutes']
            hours = json.loads(job['schedule_hours']) if isinstance(job['schedule_hours'], str) else job['schedule_hours']
            mdays = json.loads(job['schedule_mdays']) if isinstance(job['schedule_mdays'], str) else job['schedule_mdays']
            months = json.loads(job['schedule_months']) if isinstance(job['schedule_months'], str) else job['schedule_months']
            wdays = json.loads(job['schedule_wdays']) if isinstance(job['schedule_wdays'], str) else job['schedule_wdays']
            
            minute_expr = "*" if -1 in minutes else ",".join(map(str, minutes))
            hour_expr = "*" if -1 in hours else ",".join(map(str, hours))
            day_expr = "*" if -1 in mdays else ",".join(map(str, mdays))
            month_expr = "*" if -1 in months else ",".join(map(str, months))
            dow_expr = "*" if -1 in wdays else ",".join(map(str, wdays))
            
            tz = pytz.timezone(job.get('schedule_timezone', 'UTC'))
            
            trigger = CronTrigger(
                minute=minute_expr,
                hour=hour_expr,
                day=day_expr,
                month=month_expr,
                day_of_week=dow_expr,
                timezone=tz
            )
        
        # Get next execution time
        next_run = trigger.get_next_fire_time(None, datetime.now(tz))
        
        if next_run:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE cron_jobs
                SET next_execution = %s
                WHERE id = %s
            """, (next_run, job_id))
            conn.commit()
            cursor.close()
            conn.close()
        
    except Exception as e:
        log(f"Error updating next execution: {str(e)}")


def get_next_executions(job_id, count=3):
    """Get next N execution times for a job"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT schedule_timezone, schedule_minutes, schedule_hours,
                   schedule_mdays, schedule_months, schedule_wdays
            FROM cron_jobs
            WHERE id = %s
        """, (job_id,))
        
        job = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not job:
            return []
        
        # Parse schedule
        minutes = json.loads(job['schedule_minutes']) if isinstance(job['schedule_minutes'], str) else job['schedule_minutes']
        hours = json.loads(job['schedule_hours']) if isinstance(job['schedule_hours'], str) else job['schedule_hours']
        mdays = json.loads(job['schedule_mdays']) if isinstance(job['schedule_mdays'], str) else job['schedule_mdays']
        months = json.loads(job['schedule_months']) if isinstance(job['schedule_months'], str) else job['schedule_months']
        wdays = json.loads(job['schedule_wdays']) if isinstance(job['schedule_wdays'], str) else job['schedule_wdays']
        
        minute_expr = "*" if -1 in minutes else ",".join(map(str, minutes))
        hour_expr = "*" if -1 in hours else ",".join(map(str, hours))
        day_expr = "*" if -1 in mdays else ",".join(map(str, mdays))
        month_expr = "*" if -1 in months else ",".join(map(str, months))
        dow_expr = "*" if -1 in wdays else ",".join(map(str, wdays))
        
        # Build cron expression
        cron_expr = f"{minute_expr} {hour_expr} {day_expr} {month_expr} {dow_expr}"
        
        # Use croniter to get next executions
        tz = pytz.timezone(job.get('schedule_timezone', 'UTC'))
        now = datetime.now(tz)
        cron = croniter(cron_expr, now)
        
        predictions = []
        for _ in range(count):
            next_time = cron.get_next(datetime)
            predictions.append(int(next_time.timestamp()))
        
        return predictions
        
    except Exception as e:
        log(f"Error getting next executions: {str(e)}")
        log(traceback.format_exc())
        return []


def execute_job(job_id):
    """Execute a cron job (main execution function)"""
    date_planned = datetime.now(timezone.utc)
    
    try:
        # Fetch job configuration
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM cron_jobs WHERE id = %s
        """, (job_id,))
        
        job = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if not job:
            log(f"Job {job_id} not found")
            return
        
        if not job['enabled']:
            log(f"Job {job_id} is disabled, skipping execution")
            return
        
        # Parse JSON fields
        headers = json.loads(job['headers']) if job.get('headers') else {}
        
        # Prepare request
        url = job['url']
        method = job['request_method']
        timeout = job['request_timeout']
        body = job.get('body')
        
        # Add authentication if enabled
        auth = None
        if job['auth_enabled'] and job.get('auth_user'):
            auth = (job['auth_user'], job['auth_password'] or '')
        
        # Execute request
        date_executed = datetime.now(timezone.utc)
        start_time = time.time()
        
        status = STATUS_UNKNOWN
        status_text = "Unknown"
        http_status = None
        response_headers = None
        response_body = None
        duration_ms = 0
        
        # Timing stats (in microseconds)
        stats_name_lookup = None
        stats_connect = None
        stats_tls = None
        stats_transfer_start = None
        stats_total = None
        
        try:
            # Make HTTP request
            response = requests.request(
                method=method,
                url=url,
                headers=headers,
                data=body,
                auth=auth,
                timeout=timeout,
                allow_redirects=not job['redirect_success'],
                stream=True
            )
            
            # Capture timing
            end_time = time.time()
            duration_ms = int((end_time - start_time) * 1000)
            stats_total = int((end_time - start_time) * 1000000)
            
            # Get HTTP status
            http_status = response.status_code
            
            # Check if redirect should be treated as success
            if job['redirect_success'] and 300 <= http_status < 400:
                status = STATUS_OK
                status_text = "OK (Redirect)"
            elif 200 <= http_status < 300:
                status = STATUS_OK
                status_text = "OK"
            else:
                status = STATUS_HTTP_ERROR
                status_text = f"HTTP {http_status}"
            
            # Save response if configured
            if job['save_responses']:
                response_headers = str(dict(response.headers))
                
                # Read response body with size limit
                content = b''
                size = 0
                for chunk in response.iter_content(chunk_size=8192):
                    content += chunk
                    size += len(chunk)
                    if size > MAX_RESPONSE_SIZE:
                        status = STATUS_TOO_MUCH_DATA
                        status_text = "Too much response data"
                        break
                
                if size <= MAX_RESPONSE_SIZE:
                    try:
                        response_body = content.decode('utf-8', errors='replace')
                    except:
                        response_body = str(content)[:10000]  # Truncate binary data
            
        except requests.exceptions.Timeout:
            status = STATUS_TIMEOUT
            status_text = "Timeout"
            duration_ms = int(timeout * 1000)
            
        except requests.exceptions.ConnectionError as e:
            status = STATUS_CONNECT_ERROR
            status_text = f"Connection error: {str(e)[:100]}"
            duration_ms = int((time.time() - start_time) * 1000)
            
        except requests.exceptions.InvalidURL:
            status = STATUS_INVALID_URL
            status_text = "Invalid URL"
            
        except Exception as e:
            status = STATUS_INTERNAL_ERROR
            status_text = f"Error: {str(e)[:100]}"
            duration_ms = int((time.time() - start_time) * 1000)
            log(f"Error executing job {job_id}: {str(e)}")
            log(traceback.format_exc())
        
        # Calculate jitter
        jitter_ms = int((date_executed - date_planned).total_seconds() * 1000)
        
        # Save execution history
        save_execution_history(
            job_id=job_id,
            date_executed=date_executed,
            date_planned=date_planned,
            jitter_ms=jitter_ms,
            url=url,
            duration_ms=duration_ms,
            status=status,
            status_text=status_text,
            http_status=http_status,
            response_headers=response_headers,
            response_body=response_body,
            stats_total=stats_total
        )
        
        # Update job status
        update_job_status(job_id, status, duration_ms, date_executed)
        
        # Handle notifications
        handle_job_notifications(job, status)
        
        # Cleanup old history
        cleanup_old_history(job_id)
        
    except Exception as e:
        log(f"Fatal error executing job {job_id}: {str(e)}")
        log(traceback.format_exc())


def save_execution_history(job_id, date_executed, date_planned, jitter_ms, url, duration_ms,
                          status, status_text, http_status, response_headers, response_body, stats_total):
    """Save execution history to database"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            INSERT INTO cron_job_history (
                job_id, date_executed, date_planned, jitter_ms, url, duration_ms,
                status, status_text, http_status, response_headers, response_body, stats_total
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (job_id, date_executed, date_planned, jitter_ms, url, duration_ms,
              status, status_text, http_status, response_headers, response_body, stats_total))
        
        conn.commit()
        cursor.close()
        conn.close()
        
    except Exception as e:
        log(f"Error saving execution history: {str(e)}")
        log(traceback.format_exc())


def update_job_status(job_id, status, duration_ms, last_execution):
    """Update job's last execution status"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Update consecutive failures
        if status == STATUS_OK:
            consecutive_failures = 0
        else:
            cursor.execute("SELECT consecutive_failures FROM cron_jobs WHERE id = %s", (job_id,))
            result = cursor.fetchone()
            consecutive_failures = (result['consecutive_failures'] if result else 0) + 1
        
        # Auto-disable if too many consecutive failures
        enabled = 1
        if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
            enabled = 0
            log(f"Auto-disabling job {job_id} after {consecutive_failures} consecutive failures")
        
        cursor.execute("""
            UPDATE cron_jobs
            SET last_status = %s,
                last_duration = %s,
                last_execution = %s,
                consecutive_failures = %s,
                enabled = %s
            WHERE id = %s
        """, (status, duration_ms, last_execution, consecutive_failures, enabled, job_id))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        # If auto-disabled, remove from scheduler
        if not enabled:
            remove_job_from_scheduler(job_id)
        
    except Exception as e:
        log(f"Error updating job status: {str(e)}")
        log(traceback.format_exc())


def handle_job_notifications(job, status):
    """Handle job execution notifications"""
    try:
        from .routes import notify_cron_event
        
        # Notify on failure
        if status != STATUS_OK and job['notify_on_failure']:
            if job['consecutive_failures'] + 1 >= job['notify_failure_count']:
                notify_cron_event('job_failure', {
                    'job_id': job['id'],
                    'title': job['title'],
                    'url': job['url'],
                    'status': status,
                    'consecutive_failures': job['consecutive_failures'] + 1
                })
        
        # Notify on success after failure
        if status == STATUS_OK and job['consecutive_failures'] > 0 and job['notify_on_success']:
            notify_cron_event('job_recovered', {
                'job_id': job['id'],
                'title': job['title'],
                'url': job['url']
            })
        
        # Notify on auto-disable
        if job['consecutive_failures'] + 1 >= MAX_CONSECUTIVE_FAILURES and job['notify_on_disable']:
            notify_cron_event('job_disabled', {
                'job_id': job['id'],
                'title': job['title'],
                'url': job['url'],
                'consecutive_failures': MAX_CONSECUTIVE_FAILURES
            })
        
    except Exception as e:
        log(f"Error handling notifications: {str(e)}")


def cleanup_old_history(job_id, keep_count=25):
    """Delete old history entries, keeping only the most recent ones"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            DELETE FROM cron_job_history
            WHERE job_id = %s
            AND id NOT IN (
                SELECT id FROM (
                    SELECT id FROM cron_job_history
                    WHERE job_id = %s
                    ORDER BY date_executed DESC
                    LIMIT %s
                ) AS keep_records
            )
        """, (job_id, job_id, keep_count))
        
        deleted_count = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        
        if deleted_count > 0:
            log(f"Cleaned up {deleted_count} old history entries for job {job_id}")
        
    except Exception as e:
        log(f"Error cleaning up old history: {str(e)}")
        log(traceback.format_exc())


def job_execution_listener(event):
    """APScheduler event listener for job executions"""
    if event.exception:
        log(f"Job {event.job_id} raised exception: {event.exception}")
    else:
        log(f"Job {event.job_id} executed successfully")
