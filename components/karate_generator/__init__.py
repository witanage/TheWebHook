from flask import Blueprint

karate_generator_bp = Blueprint(
    'karate_generator',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/karate_generator'
)

from . import routes
