from flask import render_template, session, request, jsonify
from datetime import datetime, timezone

from . import md_compare_bp
from ..utils import login_required, log, get_db_connection


@md_compare_bp.route("/md-compare")
@login_required
def md_compare():
    """Markdown comparison tool page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed Markdown comparison tool")
    return render_template("md-compare.html", username=username)


@md_compare_bp.route("/api/md-compare/save", methods=["POST"])
@login_required
def save_md_comparison():
    """Save a Markdown comparison to database"""
    user_id = session["user_id"]
    data = request.json

    md1 = data.get("md1", "")
    md2 = data.get("md2", "")
    comparison_name = data.get("comparison_name", "Untitled Comparison")
    comparison_id = data.get("comparison_id")

    if not md1 and not md2:
        return jsonify({"success": False, "error": "Nothing to save - both Markdown fields are empty"}), 400

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if comparison_id:
                cursor.execute("""
                    UPDATE md_comparisons
                    SET comparison_name = %s, md1 = %s, md2 = %s
                    WHERE id = %s AND user_id = %s
                """, (comparison_name, md1, md2, comparison_id, user_id))

                if cursor.rowcount == 0:
                    return jsonify({"success": False, "error": "Comparison not found"}), 404

                log(f"User {user_id} updated Markdown comparison {comparison_id}")
                message = "Comparison updated successfully"
            else:
                cursor.execute("""
                    INSERT INTO md_comparisons (user_id, comparison_name, md1, md2)
                    VALUES (%s, %s, %s, %s)
                """, (user_id, comparison_name, md1, md2))
                comparison_id = cursor.lastrowid
                log(f"User {user_id} saved new Markdown comparison {comparison_id}")
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
        log(f"Error saving Markdown comparison for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@md_compare_bp.route("/api/md-compare/load", methods=["GET"])
@login_required
def load_md_comparison():
    """Load a Markdown comparison from database"""
    user_id = session["user_id"]
    comparison_id = request.args.get("comparison_id")

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if comparison_id:
                cursor.execute("""
                    SELECT id, comparison_name, md1, md2, updated_at
                    FROM md_comparisons
                    WHERE id = %s AND user_id = %s
                """, (comparison_id, user_id))
            else:
                cursor.execute("""
                    SELECT id, comparison_name, md1, md2, updated_at
                    FROM md_comparisons
                    WHERE user_id = %s
                    ORDER BY updated_at DESC
                    LIMIT 1
                """, (user_id,))

            result = cursor.fetchone()

            if result:
                log(f"User {user_id} loaded Markdown comparison {result.get('id', 'N/A')}")
                return jsonify({
                    "success": True,
                    "data": {
                        "comparison_id": result["id"],
                        "comparison_name": result["comparison_name"],
                        "md1": result["md1"],
                        "md2": result["md2"],
                        "saved_at": result["updated_at"].isoformat() if result["updated_at"] else None
                    }
                })
            else:
                return jsonify({"success": False, "error": "No saved comparisons found"}), 404
    except Exception as e:
        log(f"Error loading Markdown comparison for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@md_compare_bp.route("/api/md-compare/list", methods=["GET"])
@login_required
def list_md_comparisons():
    """List all saved Markdown comparisons for the user"""
    user_id = session["user_id"]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, comparison_name, created_at, updated_at
                FROM md_comparisons
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
        log(f"Error listing Markdown comparisons for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@md_compare_bp.route("/api/md-compare/delete/<int:comparison_id>", methods=["DELETE"])
@login_required
def delete_md_comparison(comparison_id):
    """Delete a specific Markdown comparison"""
    user_id = session["user_id"]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                DELETE FROM md_comparisons
                WHERE id = %s AND user_id = %s
            """, (comparison_id, user_id))
            conn.commit()

            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Comparison not found"}), 404

            log(f"User {user_id} deleted Markdown comparison {comparison_id}")
            return jsonify({
                "success": True,
                "message": "Comparison deleted successfully"
            })
    except Exception as e:
        conn.rollback()
        log(f"Error deleting Markdown comparison {comparison_id} for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()
