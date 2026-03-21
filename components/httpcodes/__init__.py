from flask import Blueprint

httpcodes_bp = Blueprint(
    'httpcodes',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/httpcodes'
)

from . import routes
