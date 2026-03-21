from flask import Blueprint

webhook_viewer_bp = Blueprint(
    'webhook_viewer',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/webhook_viewer'
)

from . import routes
