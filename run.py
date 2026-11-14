"""
Blackjack Flask Application Entry Point
"""

import os
from flask import Flask, send_from_directory
from app.routes import api


def create_app() -> Flask:
    app = Flask(__name__, static_folder='static', template_folder='templates')
    app.secret_key = os.environ.get('SECRET_KEY', 'blackjack-secret-dev-key-2024')

    # Register API blueprint
    app.register_blueprint(api, url_prefix='/api')

    # Serve the frontend
    @app.route('/')
    def index():
        return send_from_directory('templates', 'index.html')

    return app


if __name__ == '__main__':
    app = create_app()
    app.run(debug=True, port=5000)
