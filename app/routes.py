"""
Flask API routes for the Blackjack game.
Uses a simple in-memory game store (fine for single-user dev/demo).
"""

import threading
from flask import Blueprint, jsonify, request
from app.models import Game

api = Blueprint('api', __name__)

# Single-instance game store (demo mode — one game at a time)
_game_store: dict[str, Game] = {}
_game_lock = threading.Lock()
GAME_KEY = 'current'


def _get_game() -> Game | None:
    return _game_store.get(GAME_KEY)


def _set_game(game: Game):
    _game_store[GAME_KEY] = game


# ------------------------------------------------------------------
# Routes
# ------------------------------------------------------------------

@api.route('/start', methods=['POST'])
def start():
    """Initialize (or restart) a new game."""
    with _game_lock:
        game = Game()
        _set_game(game)
        return jsonify(game.get_state())


@api.route('/hit', methods=['POST'])
def hit():
    """Player draws a card."""
    with _game_lock:
        game = _get_game()
        if game is None:
            return jsonify({'error': 'No active game. Call /start first.'}), 400
        if game.status != Game.STATUS_PLAYING:
            return jsonify({'error': 'Game is already over. Start a new game.'}), 400
        state = game.player_hit()
        return jsonify(state)


@api.route('/stand', methods=['POST'])
def stand():
    """Player stands; AI dealer plays."""
    with _game_lock:
        game = _get_game()
        if game is None:
            return jsonify({'error': 'No active game. Call /start first.'}), 400
        if game.status != Game.STATUS_PLAYING:
            return jsonify({'error': 'Game is already over. Start a new game.'}), 400
        state = game.player_stand()
        return jsonify(state)


@api.route('/state', methods=['GET'])
def state():
    """Return current game state."""
    with _game_lock:
        game = _get_game()
        if game is None:
            return jsonify({'error': 'No active game. Call /start first.'}), 400
        return jsonify(game.get_state())
