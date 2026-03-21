from flask import Blueprint

totp_authenticator_bp = Blueprint(
    'totp_authenticator',
    __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static/components/totp_authenticator'
)

from . import routes
