from flask import render_template, session, request, jsonify
import pyotp
import time

from . import totp_authenticator_bp
from ..utils import login_required, log, get_db_connection


# Import NTP functions from main app
# TODO: Move NTP functions to shared utils if needed elsewhere
def get_ntp_time():
    """Stub - uses system time. Override with actual NTP implementation if needed."""
    return time.time()


def get_ntp_offset():
    """Stub - returns 0. Override with actual NTP implementation if needed."""
    return 0


@totp_authenticator_bp.route("/totp-authenticator")
@login_required
def totp_authenticator():
    """TOTP Authenticator page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed TOTP Authenticator")
    return render_template("totp-authenticator.html", username=username)


@totp_authenticator_bp.route("/api/totp/accounts", methods=["GET"])
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


@totp_authenticator_bp.route("/api/totp/accounts", methods=["POST"])
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


@totp_authenticator_bp.route("/api/totp/accounts/<int:account_id>", methods=["PUT"])
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


@totp_authenticator_bp.route("/api/totp/accounts/<int:account_id>", methods=["DELETE"])
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


@totp_authenticator_bp.route("/api/totp/ntp-time", methods=["GET"])
@login_required
def get_ntp_synced_time():
    """Get current NTP-synchronized time for TOTP generation."""
    try:
        ntp_time = get_ntp_time()
        offset = get_ntp_offset()

        return jsonify({
            'success': True,
            'timestamp': int(ntp_time * 1000),
            'timestamp_seconds': int(ntp_time),
            'offset': offset,
            'fallback': True  # Using system time
        })
    except Exception as e:
        log(f"Error getting NTP time: {e}")
        current_time = time.time()
        return jsonify({
            'success': True,
            'timestamp': int(current_time * 1000),
            'timestamp_seconds': int(current_time),
            'offset': 0,
            'fallback': True
        })


@totp_authenticator_bp.route("/api/totp/generate/<int:account_id>", methods=["GET"])
@login_required
def generate_totp_code(account_id):
    """Generate TOTP code for a specific account using NTP-synchronized time."""
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

            # Generate TOTP
            totp = pyotp.TOTP(
                account['secret_key'],
                digits=account['digits'],
                interval=account['period']
            )

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
