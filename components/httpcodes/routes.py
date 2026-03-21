from flask import render_template, session

from . import httpcodes_bp
from ..utils import login_required, log


@httpcodes_bp.route("/http-codes")
@login_required
def http_codes():
    """HTTP Codes Tester documentation page"""
    user_id = session["user_id"]
    username = session.get("username", "User")
    log(f"User {user_id} accessed HTTP codes tester")
    return render_template("httpcodes.html", username=username, user_id=user_id)
