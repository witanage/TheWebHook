from flask import Blueprint

image_process_bp = Blueprint(
    'image_process',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/image_process'
)

from . import routes
