from flask import Blueprint

json_compare_bp = Blueprint(
    'json_compare',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/json_compare'
)

from . import routes
