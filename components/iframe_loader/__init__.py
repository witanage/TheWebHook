from flask import Blueprint

iframe_loader_bp = Blueprint(
    'iframe_loader',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/iframe_loader'
)

from . import routes
