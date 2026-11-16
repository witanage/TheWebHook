from flask import Blueprint

md_compare_bp = Blueprint(
    'md_compare',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/md_compare'
)

from . import routes
