from flask import render_template, session, request, jsonify
from datetime import datetime, timezone
import json

from . import karate_generator_bp
from ..utils import login_required, log, get_db_connection


@karate_generator_bp.route("/karate-generator")
@login_required
def karate_generator():
    """Karate feature file generator page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    is_admin = session.get("is_admin", 0)
    log(f"User {user_id} accessed Karate generator tool")
    return render_template("karate-generator.html", username=username, is_admin=is_admin)


@karate_generator_bp.route("/api/karate-generator/save", methods=["POST"])
@login_required
def save_karate_work():
    """Save Karate generator work to database (supports multiple projects)"""
    user_id = session["user_id"]
    data = request.json

    # Validate required fields
    if not data.get("feature_config") or not data.get("scenarios_data"):
        return jsonify({"success": False, "error": "Missing required data"}), 400

    work_name = data.get("work_name", "My Work")
    feature_config = data.get("feature_config")
    scenarios_data = data.get("scenarios_data")
    env_variables = data.get("env_variables", [])
    project_id = data.get("project_id")  # Optional: for updating existing project

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if project_id:
                # Update existing project
                cursor.execute("""
                    UPDATE karate_saved_work
                    SET work_name = %s, feature_config = %s, scenarios_data = %s, env_variables = %s
                    WHERE id = %s AND user_id = %s
                """, (work_name, json.dumps(feature_config), json.dumps(scenarios_data), json.dumps(env_variables),
                      project_id, user_id))

                if cursor.rowcount == 0:
                    return jsonify({"success": False, "error": "Project not found"}), 404

                log(f"User {user_id} updated Karate project {project_id}")
                message = "Project updated successfully"
            else:
                # Insert new project
                cursor.execute("""
                    INSERT INTO karate_saved_work (user_id, work_name, feature_config, scenarios_data, env_variables)
                    VALUES (%s, %s, %s, %s, %s)
                """, (user_id, work_name, json.dumps(feature_config), json.dumps(scenarios_data),
                      json.dumps(env_variables)))
                project_id = cursor.lastrowid
                log(f"User {user_id} saved new Karate project {project_id}")
                message = "Project saved successfully"

            conn.commit()

            return jsonify({
                "success": True,
                "message": message,
                "project_id": project_id,
                "saved_at": datetime.now(timezone.utc).isoformat()
            })
    except Exception as e:
        conn.rollback()
        log(f"Error saving Karate work for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@karate_generator_bp.route("/api/karate-generator/load", methods=["GET"])
@login_required
def load_karate_work():
    """Load Karate generator work from database (most recent or by ID)"""
    user_id = session["user_id"]
    project_id = request.args.get("project_id")

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            if project_id:
                # Load specific project
                cursor.execute("""
                    SELECT id, work_name, feature_config, scenarios_data, env_variables, updated_at
                    FROM karate_saved_work
                    WHERE id = %s AND user_id = %s
                """, (project_id, user_id))
            else:
                # Load most recent project
                cursor.execute("""
                    SELECT id, work_name, feature_config, scenarios_data, env_variables, updated_at
                    FROM karate_saved_work
                    WHERE user_id = %s
                    ORDER BY updated_at DESC
                    LIMIT 1
                """, (user_id,))

            result = cursor.fetchone()

            if result:
                log(f"User {user_id} loaded Karate project {result.get('id', 'N/A')}")
                return jsonify({
                    "success": True,
                    "data": {
                        "project_id": result.get("id"),
                        "work_name": result["work_name"],
                        "feature_config": json.loads(result["feature_config"]) if isinstance(result["feature_config"],
                                                                                             str) else result[
                            "feature_config"],
                        "scenarios_data": json.loads(result["scenarios_data"]) if isinstance(result["scenarios_data"],
                                                                                             str) else result[
                            "scenarios_data"],
                        "env_variables": json.loads(result["env_variables"]) if result["env_variables"] and isinstance(
                            result["env_variables"], str) else (result["env_variables"] or []),
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


@karate_generator_bp.route("/api/karate-generator/projects", methods=["GET"])
@login_required
def list_karate_projects():
    """List all saved Karate projects for the user"""
    user_id = session["user_id"]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT id, work_name, created_at, updated_at
                FROM karate_saved_work
                WHERE user_id = %s
                ORDER BY updated_at DESC
            """, (user_id,))

            results = cursor.fetchall()

            projects = []
            for row in results:
                projects.append({
                    "id": row["id"],
                    "name": row["work_name"],
                    "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                    "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None
                })

            return jsonify({
                "success": True,
                "projects": projects
            })
    except Exception as e:
        log(f"Error listing Karate projects for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()


@karate_generator_bp.route("/api/karate-generator/delete/<int:project_id>", methods=["DELETE"])
@login_required
def delete_karate_project(project_id):
    """Delete a specific Karate project"""
    user_id = session["user_id"]

    conn = get_db_connection()
    try:
        with conn.cursor() as cursor:
            cursor.execute("""
                DELETE FROM karate_saved_work
                WHERE id = %s AND user_id = %s
            """, (project_id, user_id))
            conn.commit()

            if cursor.rowcount == 0:
                return jsonify({"success": False, "error": "Project not found"}), 404

            log(f"User {user_id} deleted Karate project {project_id}")
            return jsonify({
                "success": True,
                "message": "Project deleted successfully"
            })
    except Exception as e:
        conn.rollback()
        log(f"Error deleting Karate project {project_id} for user {user_id}: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        conn.close()
