from flask import render_template, session

from . import md_compare_bp
from ..utils import login_required, log


@md_compare_bp.route("/md-compare")
@login_required
def md_compare():
    """Markdown file comparison tool page (diffing runs client-side)"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed Markdown comparison tool")
    return render_template("md-compare.html", username=username)
