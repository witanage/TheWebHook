from flask import render_template, session, request, jsonify
from datetime import datetime, timezone

from . import json_compare_bp
from ..utils import login_required, log, get_db_connection


@json_compare_bp.route("/json-compare")
@login_required
def json_compare():
    """JSON comparison tool page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed JSON comparison tool")
    return render_template("json-compare.html", username=username)


@json_compare_bp.route("/api/json-compare/save", methods=["POST"])
@login_required
def save_json_comparison():
    """Save a JSON comparison to database"""
    user_id = session["user_id"]
    data = request.json

    json1 = data.get("json1", "")
    json2 = data.get("json2", "")
    comparison_name = data.get("comparison_name", "Untitled Comparison")
    comparison_id = data.get("comparison_id")

    if not json1 and not json2:
        return jsonify({"success": False, "error": "Nothing to save - both JSON fields are empty"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if comparison_id:
                cursor.execute("""
                    UPDATE json_comparisons
                    SET comparison_name = %s, json1 = %s, json2 = %s
                    WHERE id = %s AND user_id = %s
                """, (comparison_name, json1, json2, comparison_id, user_id))

                if cursor.rowcount == 0:
                    return jsonify({"success": False, "error": "Comparison not found"}), 404

                log(f"User {user_id} updated JSON comparison {comparison_id}")
                message = "Comparison updated successfully"
            else:
                cursor.execute("""
                    INSERT INTO json_comparisons (user_id, comparison_name, json1, json2)
                    VALUES (%s, %s, %s, %s)
                """, (user_id, comparison_name, json1, json2))
                comparison_id = cursor.lastrowid
                log(f"User {user_id} saved new JSON comparison {comparison_id}")
                message = "Comparison saved successfully"

            conn.commit()

            return jsonify({
                "success": True,
                "message": message,
                "comparison_id": comparison_id,
                "saved_at": datetime.now(timezone.utc).isoformat()
            })
    except Exception as e:
        conn.rollback()
        log(f"Error saving JSON comparison for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@json_compare_bp.route("/api/json-compare/load", methods=["GET"])
@login_required
def load_json_comparison():
    """Load a JSON comparison from database"""
    user_id = session["user_id"]
    comparison_id = request.args.get("comparison_id")

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if comparison_id:
                cursor.execute("""
                    SELECT id, comparison_name, json1, json2, updated_at
                    FROM json_comparisons
                    WHERE id = %s AND user_id = %s
                """, (comparison_id, user_id))
            else:
                cursor.execute("""
                    SELECT id, comparison_name, json1, json2, updated_at
                    FROM json_comparisons
                    WHERE user_id = %s
                    ORDER BY updated_at DESC
                    LIMIT 1
                """, (user_id,))

            result = cursor.fetchone()

            if result:
                log(f"User {user_id} loaded JSON comparison {result.get('id', 'N/A')}")
                return jsonify({
                    "success": True,
                    "data": {
                        "comparison_id": result["id"],
                        "comparison_name": result["comparison_name"],
                        "json1": result["json1"],
                        "json2": result["json2"],
                        "saved_at": result["updated_at"].isoformat() if result["updated_at"] else None
                    }
                })
            else:
                return jsonify({"success": False, "error": "No saved comparisons found"}), 404
    except Exception as e:
        log(f"Error loading JSON comparison for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@json_compare_bp.route("/api/json-compare/list", methods=["GET"])
@login_required
def list_json_comparisons():
    """List all saved JSON comparisons for the user"""
    user_id = session["user_id"]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, comparison_name, created_at, updated_at
                FROM json_comparisons
                WHERE user_id = %s
                ORDER BY updated_at DESC
            """, (user_id,))

            results = cursor.fetchall()

            comparisons = []
            for row in results:
                comparisons.append({
                    "id": row["id"],
                    "name": row["comparison_name"],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                    "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None
                })

            return jsonify({
                "success": True,
                "comparisons": comparisons
            })
    except Exception as e:
        log(f"Error listing JSON comparisons for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@json_compare_bp.route("/api/json-compare/delete/<int:comparison_id>", methods=["DELETE"])
@login_required
def delete_json_comparison(comparison_id):
    """Delete a specific JSON comparison"""
    user_id = session["user_id"]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                DELETE FROM json_comparisons
                WHERE id = %s AND user_id = %s
            """, (comparison_id, user_id))
            conn.commit()

            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Comparison not found"}), 404

            log(f"User {user_id} deleted JSON comparison {comparison_id}")
            return jsonify({
                "success": True,
                "message": "Comparison deleted successfully"
            })
    except Exception as e:
        conn.rollback()
        log(f"Error deleting JSON comparison {comparison_id} for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()
