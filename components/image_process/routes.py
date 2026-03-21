from flask import render_template, session

from . import image_process_bp
from ..utils import login_required, log


@image_process_bp.route("/image-process")
@login_required
def image_process():
    """Image Process page - all-in-one image tools"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    is_admin = session.get("is_admin", 0)
    log(f"User {user_id} accessed Image Process")
    return render_template("image-process.html", username=username, is_admin=is_admin)
