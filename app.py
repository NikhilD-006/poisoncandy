# app.py - The single Flask server for routing and WebSocket game logic

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
from threading import Lock

app = Flask(__name__)
app.config['SECRET_KEY'] = 'a-very-secret-key-that-should-be-changed'
# Initialize Flask-SocketIO
socketio = SocketIO(app, async_mode='threading')

# A single lobby for matchmaking and the game state
lobby = {
    'players': {},      # Stores player session IDs and their index
    'game_state': None,
    'lock': Lock()      # To prevent race conditions
}

def create_new_game_state():
    """Initializes a new game state."""
    return {
        'candies': [True] * 15,
        'poisonCandies': {},
        'turn': 0,
        'timer': 30,
        'gameOver': False,
        'winner': None
    }

def game_loop():
    """The main timer loop for the game, runs in a background thread."""
    while lobby.get('game_state') and not lobby['game_state']['gameOver']:
        socketio.sleep(1)
        if lobby.get('game_state'):
            lobby['game_state']['timer'] -= 1
            if lobby['game_state']['timer'] < 0:
                winner_index = 1 - lobby['game_state']['turn']
                end_game(winner_index)
            else:
                emit('updateTimer', {'timer': lobby['game_state']['timer']}, broadcast=True)

def end_game(winner_identifier):
    """Ends the current game and notifies players."""
    with lobby['lock']:
        if lobby.get('game_state'):
            lobby['game_state']['gameOver'] = True
            lobby['game_state']['winner'] = winner_identifier
            emit('gameOver', {
                'winner': winner_identifier,
                'finalState': lobby['game_state'],
                'canReplay': len(lobby['players']) == 2
            }, broadcast=True)
            lobby['game_state'] = None

# --- HTTP Route to serve the webpage ---
@app.route('/')
def index():
    """Serves the main index.html file from the templates folder."""
    return render_template('index.html')

# --- WebSocket Event Handlers ---
@socketio.on('connect')
def handle_connect():
    """Handles a new player connecting to the lobby."""
    with lobby['lock']:
        if len(lobby['players']) >= 2:
            emit('error', {'payload': 'Lobby is full. Please try again later.'})
            return

        player_index = len(lobby['players'])
        lobby['players'][request.sid] = player_index
        emit('joinedLobby', {'playerIndex': player_index})

        if len(lobby['players']) == 2:
            lobby['game_state'] = create_new_game_state()
            emit('startPoisonSelection', broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    """Handles a player disconnecting, returning the other to the lobby."""
    with lobby['lock']:
        if request.sid in lobby['players']:
            lobby['players'].pop(request.sid)
            lobby['game_state'] = None

            if lobby['players']:
                remaining_sid = list(lobby['players'].keys())[0]
                lobby['players'][remaining_sid] = 0
                emit('returnToWaiting', {'playerIndex': 0}, room=remaining_sid)

@socketio.on('selectPoison')
def handle_select_poison(data):
    player_index = lobby['players'].get(request.sid)
    if lobby.get('game_state') and player_index is not None:
        lobby['game_state']['poisonCandies'][player_index] = data['index']
        if len(lobby['game_state']['poisonCandies']) == 2:
            lobby['game_state']['turn'] = 0
            emit('gameStart', lobby['game_state'], broadcast=True)
            socketio.start_background_task(game_loop)

@socketio.on('takeCandy')
def handle_take_candy(data):
    player_index = lobby['players'].get(request.sid)
    game = lobby.get('game_state')
    if game and not game['gameOver'] and player_index == game['turn']:
        index = data['index']
        
        if index in game['poisonCandies'].values():
            end_game(1 - game['turn'])
        else:
            game['candies'][index] = False
            remaining_candies = {i for i, v in enumerate(game['candies']) if v}
            poison_candies = set(game['poisonCandies'].values())
            
            if remaining_candies == poison_candies:
                end_game('both')
            else:
                game['turn'] = 1 - game['turn']
                game['timer'] = 30
                emit('updateState', game, broadcast=True)

@socketio.on('requestReplay')
def handle_request_replay():
    with lobby['lock']:
        if len(lobby['players']) == 2:
            lobby['game_state'] = create_new_game_state()
            emit('startPoisonSelection', broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True)
