from flask import Blueprint

pdf_process_bp = Blueprint(
    'pdf_process',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/pdf_process'
)

from . import routes
