from flask import Blueprint

code_formatter_bp = Blueprint(
    'code_formatter',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/code_formatter'
)

from . import routes
