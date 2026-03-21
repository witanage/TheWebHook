from flask import render_template, session

from . import pdf_process_bp
from ..utils import login_required, log


@pdf_process_bp.route("/pdf-process")
@login_required
def pdf_process():
    """PDF Process page - all-in-one PDF tools"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    is_admin = session.get("is_admin", 0)
    log(f"User {user_id} accessed PDF Process")
    return render_template("pdf-process.html", username=username, is_admin=is_admin)
