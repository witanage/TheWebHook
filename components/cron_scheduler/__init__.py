from flask import Blueprint

cron_scheduler_bp = Blueprint(
    'cron_scheduler',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/cron_scheduler'
)

from . import routes
