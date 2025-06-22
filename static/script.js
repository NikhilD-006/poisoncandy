// script.js - Client-side logic for the Poison Candy Game

document.addEventListener('DOMContentLoaded', () => {

    // --- Screen Elements ---
    const startScreen = document.getElementById('start-screen');
    const waitingScreen = document.getElementById('waiting-screen');
    const gameScreen = document.getElementById('game-screen');
    const gameOverScreen = document.getElementById('game-over-screen');

    // --- UI Components ---
    const startBtn = document.getElementById('start-btn');
    const messageArea = document.getElementById('message-area');
    const timerArea = document.getElementById('timer-area');
    const candyArea = document.getElementById('candy-area');
    const gameOverTitle = document.getElementById('game-over-title');
    const playAgainBtn = document.getElementById('play-again-btn');

    // --- Game State ---
    let socket;
    let myPlayerIndex = -1;
    let currentPhase = 'lobby';

    function showScreen(screen) {
        startScreen.classList.add('hidden');
        waitingScreen.classList.add('hidden');
        gameScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        screen.classList.remove('hidden');
    }

    startBtn.addEventListener('click', () => {
        startBtn.disabled = true;
        startBtn.textContent = 'Connecting...';
        socket = io();
        setupSocketListeners();
    });
    
    playAgainBtn.addEventListener('click', () => {
        playAgainBtn.disabled = true;
        socket.emit('requestReplay');
    });
    
    function setupSocketListeners() {
        socket.on('connect', () => console.log('Connected to lobby server.'));
        socket.on('disconnect', () => {
            showScreen(startScreen);
            startBtn.disabled = false;
            startBtn.textContent = 'Start';
            document.body.className = '';
        });

        socket.on('joinedLobby', (data) => {
            myPlayerIndex = data.playerIndex;
            showScreen(waitingScreen);
        });
        
        socket.on('startPoisonSelection', () => {
            currentPhase = 'poison-selection';
            showScreen(gameScreen);
            messageArea.textContent = 'Choose your POISON candy!';
            timerArea.classList.add('hidden');
            renderCandies({ candies: Array(15).fill(true) }, true);
        });
        
        socket.on('gameStart', (gameState) => {
            currentPhase = 'playing';
            timerArea.classList.remove('hidden');
            updateGameState(gameState);
        });

        socket.on('updateState', (gameState) => {
            currentPhase = 'playing';
            updateGameState(gameState);
        });
        
        socket.on('updateTimer', (data) => {
            timerArea.textContent = `Time: ${data.timer}`;
        });

        socket.on('gameOver', (data) => {
            currentPhase = 'gameover';
            showScreen(gameOverScreen);
            
            if (data.winner === 'both') {
                gameOverTitle.textContent = '🎉 It\'s a Tie! Both Win! 🎉';
            } else if (data.winner === myPlayerIndex) {
                gameOverTitle.textContent = '🎉 You Win! 🎉';
            } else {
                gameOverTitle.textContent = '😢 You Lose 😢';
            }

            playAgainBtn.disabled = !data.canReplay;
            playAgainBtn.textContent = data.canReplay ? 'Play Again' : 'Opponent Left';
        });
        
        socket.on('returnToWaiting', (data) => {
            myPlayerIndex = data.playerIndex;
            showScreen(waitingScreen);
            document.body.className = '';
        });

        socket.on('error', (data) => {
            alert(`Server Error: ${data.payload}`);
            startBtn.disabled = false;
            startBtn.textContent = 'Start';
        });
    }
    
    function handleCandyClick(index) {
        if (currentPhase === 'poison-selection') {
            messageArea.textContent = 'Waiting for Opponent...';
            socket.emit('selectPoison', { index });
            candyArea.querySelectorAll('.candy').forEach(c => c.classList.add('taken'));
        } else if (currentPhase === 'playing') {
            socket.emit('takeCandy', { index });
        }
    }

    function renderCandies(gameState, isPoisonSelection = false) {
        candyArea.innerHTML = '';
        const candyColors = ['#ff4757', '#ffc312', '#2ed573', '#1e90ff', '#be2edd'];
        gameState.candies.forEach((isAvailable, i) => {
            const candy = document.createElement('div');
            candy.classList.add('candy');
            if (!isAvailable) candy.classList.add('taken');
            
            if (isPoisonSelection) candy.classList.add('poison-select');

            if (!isPoisonSelection && gameState.poisonCandies && gameState.poisonCandies[myPlayerIndex] === i) {
                candy.classList.add('my-poison-candy');
            }
            
            candy.style.backgroundColor = candyColors[i % candyColors.length];
            candy.addEventListener('click', () => handleCandyClick(i));
            candyArea.appendChild(candy);
        });
    }

    function updateGameState(gameState) {
        renderCandies(gameState);
        timerArea.textContent = `Time: ${gameState.timer}`;

        if (gameState.turn === myPlayerIndex) {
            messageArea.textContent = "It's YOUR turn!";
            document.body.className = 'your-turn';
        } else {
            messageArea.textContent = "Opponent's turn...";
            document.body.className = 'opponent-turn';
        }
    }
});
