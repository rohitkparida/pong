// Pong PWA with Audio Data Transmission
// Main JavaScript file - P2P Version using Quiet.js

// Game constants
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const BALL_RADIUS = 10;
const BALL_SPEED = 5;
const PADDLE_SPEED = 8;
const AUDIO_UPDATE_INTERVAL = 200; // ms between audio transmissions (increased for Quiet.js)

// Game variables
let isLeftPlayer = true; // By default, player is on left side
let gameActive = false;
let leftPaddleY = 0;
let rightPaddleY = 0;
let ballX = 0;
let ballY = 0;
let ballVelX = 0;
let ballVelY = 0;
let leftScore = 0;
let rightScore = 0;
let lastAudioUpdate = 0;
let hasBallControl = false; // Whether this player currently controls the ball
let lastTrajectoryUpdate = 0;
let receivedTrajectory = {
  startX: 0,
  startY: 0,
  velX: 0,
  velY: 0,
  timestamp: 0
};

// Quiet.js transmitters and receivers
let trajectoryTransmitter;
let trajectoryReceiver;
let paddleTransmitter;
let paddleReceiver;
let quietReady = false;

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const startBtn = document.getElementById('start-btn');
const backBtn = document.getElementById('back-btn');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const statusMessage = document.getElementById('status-message');

// Initialize the game
function init() {
  // Set up event listeners
  startBtn.addEventListener('click', startGame);
  backBtn.addEventListener('click', returnToSetup);
  
  // Set up canvas size
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Set up controls
  setupControls();
  
  // Initialize Quiet.js when the window loads
  Quiet.addReadyCallback(initQuiet, onQuietFail);
}

// Initialize Quiet.js
function initQuiet() {
  try {
    // Create transmitters and receivers
    trajectoryTransmitter = Quiet.transmitter({
      profile: 'pong-ultrasonic',
      clampFrame: false
    });
    
    trajectoryReceiver = Quiet.receiver({
      profile: 'pong-ultrasonic'
    });
    
    paddleTransmitter = Quiet.transmitter({
      profile: 'pong-paddle',
      clampFrame: false
    });
    
    paddleReceiver = Quiet.receiver({
      profile: 'pong-paddle'
    });
    
    // Set up data handlers
    trajectoryReceiver.on('data', receiveTrajectoryData);
    paddleReceiver.on('data', receivePaddleData);
    
    // Set up error handlers
    trajectoryReceiver.on('error', onQuietError);
    paddleReceiver.on('error', onQuietError);
    
    quietReady = true;
    console.log('Quiet.js initialized successfully');
  } catch (e) {
    console.error('Failed to initialize Quiet.js:', e);
    quietReady = false;
  }
}

// Handle Quiet.js initialization failure
function onQuietFail(reason) {
  console.error('Quiet.js failed to initialize:', reason);
  quietReady = false;
  statusMessage.textContent = 'Error: Audio system failed to initialize';
}

// Handle Quiet.js errors
function onQuietError(reason) {
  console.warn('Quiet.js error:', reason);
}

// Resize canvas to fit the screen while maintaining aspect ratio
function resizeCanvas() {
  const containerWidth = gameScreen.clientWidth;
  const containerHeight = gameScreen.clientHeight * 0.8;
  const aspectRatio = 16 / 9;
  
  let width = containerWidth;
  let height = width / aspectRatio;
  
  if (height > containerHeight) {
    height = containerHeight;
    width = height * aspectRatio;
  }
  
  canvas.width = width;
  canvas.height = height;
  
  // Reset paddle positions after resize
  leftPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
  rightPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
}

// Set up keyboard and touch controls
function setupControls() {
  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    
    const paddleY = isLeftPlayer ? leftPaddleY : rightPaddleY;
    let newPaddleY = paddleY;
    
    if (e.key === 'ArrowUp') {
      newPaddleY = Math.max(0, paddleY - PADDLE_SPEED);
    } else if (e.key === 'ArrowDown') {
      newPaddleY = Math.min(canvas.height - PADDLE_HEIGHT, paddleY + PADDLE_SPEED);
    }
    
    if (isLeftPlayer) {
      leftPaddleY = newPaddleY;
    } else {
      rightPaddleY = newPaddleY;
    }
  });
  
  // Touch controls
  canvas.addEventListener('touchmove', (e) => {
    if (!gameActive) return;
    e.preventDefault();
    
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const y = touch.clientY - rect.top;
    
    // Calculate new paddle position
    let newPaddleY = y - PADDLE_HEIGHT / 2;
    newPaddleY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, newPaddleY));
    
    if (isLeftPlayer) {
      leftPaddleY = newPaddleY;
    } else {
      rightPaddleY = newPaddleY;
    }
  }, { passive: false });
  
  // Mouse controls (for desktop)
  canvas.addEventListener('mousemove', (e) => {
    if (!gameActive) return;
    
    const rect = canvas.getBoundingClientRect();
    const y = e.clientY - rect.top;
    
    // Calculate new paddle position
    let newPaddleY = y - PADDLE_HEIGHT / 2;
    newPaddleY = Math.max(0, Math.min(canvas.height - PADDLE_HEIGHT, newPaddleY));
    
    if (isLeftPlayer) {
      leftPaddleY = newPaddleY;
    } else {
      rightPaddleY = newPaddleY;
    }
  });
}

// Draw the game
function drawGame() {
  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw center line
  ctx.strokeStyle = '#333';
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw paddles
  ctx.fillStyle = '#fff';
  // Left paddle
  ctx.fillRect(0, leftPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
  // Right paddle
  ctx.fillRect(canvas.width - PADDLE_WIDTH, rightPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
  
  // Draw ball
  ctx.beginPath();
  ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw debug info if needed
  if (!isLeftPlayer && !hasBallControl) {
    // Draw trajectory path
    ctx.strokeStyle = '#333';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(receivedTrajectory.startX, receivedTrajectory.startY);
    ctx.lineTo(ballX, ballY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Show game screen
function showGameScreen() {
  setupScreen.style.display = 'none';
  gameScreen.style.display = 'block';
}

// Return to setup screen
function returnToSetup() {
  gameActive = false;
  setupScreen.style.display = 'flex';
  gameScreen.style.display = 'none';
  
  // Stop Quiet.js receivers
  if (trajectoryReceiver) {
    trajectoryReceiver.destroy();
  }
  if (paddleReceiver) {
    paddleReceiver.destroy();
  }
}

// Start game
async function startGame() {
  try {
    statusMessage.textContent = 'Initializing audio...';
    
    // Check if Quiet.js is ready
    if (!quietReady) {
      // Try to initialize again
      Quiet.addReadyCallback(initQuiet, onQuietFail);
      throw new Error('Audio system not ready. Please try again.');
    }
    
    // Initialize game state
    resetGameState();
    
    // Start game loop
    gameActive = true;
    showGameScreen();
    requestAnimationFrame(gameLoop);
    
    statusMessage.textContent = 'Game started';
  } catch (error) {
    console.error('Failed to start game:', error);
    statusMessage.textContent = 'Error: ' + error.message;
  }
}

// Reset game state
function resetGameState() {
  leftPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
  rightPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
  ballX = canvas.width / 2;
  ballY = canvas.height / 2;
  ballVelX = isLeftPlayer ? BALL_SPEED : -BALL_SPEED;
  ballVelY = (Math.random() * 1.5 - 0.75) * BALL_SPEED; // Values between -0.75 and 0.75
  if (Math.abs(ballVelY) < BALL_SPEED / 2) { // Ensure it's not too slow vertically
      ballVelY = Math.sign(ballVelY) * BALL_SPEED / 2;
  }
  leftScore = 0;
  rightScore = 0;
  updateScore();
}

// Update score display
function updateScore() {
  scoreDisplay.textContent = `${leftScore} - ${rightScore}`;
}

// Main game loop
function gameLoop(timestamp) {
  if (!gameActive) return;
  
  // Update game state
  if (isLeftPlayer) {
    // Left player: Update ball position and handle collisions
    updateBall();
    
    // Send game state updates via audio
    if (timestamp - lastAudioUpdate > AUDIO_UPDATE_INTERVAL) {
      sendTrajectoryData();
      lastAudioUpdate = timestamp;
    }
  } else {
    // Right player: Calculate ball position based on trajectory
    if (hasBallControl) {
      updateBall();
      
      // Send trajectory updates when ball hits paddle or walls
      if (timestamp - lastTrajectoryUpdate > AUDIO_UPDATE_INTERVAL) {
        sendTrajectoryData();
        lastTrajectoryUpdate = timestamp;
      }
    } else {
      updateBallFromTrajectory(timestamp);
    }
    
    // Send paddle position updates to left player
    if (timestamp - lastAudioUpdate > AUDIO_UPDATE_INTERVAL) {
      sendPaddleData();
      lastAudioUpdate = timestamp;
    }
  }
  
  // Draw game
  drawGame();
  
  // Continue game loop
  requestAnimationFrame(gameLoop);
}

// Update ball position and handle collisions
function updateBall() {
  // Move ball
  ballX += ballVelX;
  ballY += ballVelY;
  
  // Wall collisions (top and bottom)
  if (ballY - BALL_RADIUS < 0 || ballY + BALL_RADIUS > canvas.height) {
    ballVelY = -ballVelY;
    ballY = ballY - BALL_RADIUS < 0 ? BALL_RADIUS : canvas.height - BALL_RADIUS;
    // Send trajectory update on wall bounce
    sendTrajectoryData();
  }
  
  // Paddle collisions
  // Left paddle (left player)
  if (ballX - BALL_RADIUS < PADDLE_WIDTH && 
      ballY > leftPaddleY && 
      ballY < leftPaddleY + PADDLE_HEIGHT) {
    ballVelX = Math.abs(ballVelX);
    // Adjust y velocity based on where ball hits paddle
    const hitPosition = (ballY - leftPaddleY) / PADDLE_HEIGHT;
    ballVelY = (hitPosition - 0.5) * 2 * BALL_SPEED;
    // Send trajectory update on paddle hit
    sendTrajectoryData();
  }
  
  // Right paddle (right player)
  if (ballX + BALL_RADIUS > canvas.width - PADDLE_WIDTH && 
      ballY > rightPaddleY && 
      ballY < rightPaddleY + PADDLE_HEIGHT) {
    ballVelX = -Math.abs(ballVelX);
    // Adjust y velocity based on where ball hits paddle
    const hitPosition = (ballY - rightPaddleY) / PADDLE_HEIGHT;
    ballVelY = (hitPosition - 0.5) * 2 * BALL_SPEED;
    // Send trajectory update on paddle hit
    sendTrajectoryData();
  }
  
  // Scoring
  if (ballX < 0) {
    // Right player scores
    rightScore++;
    updateScore();
    resetBall(-BALL_SPEED);
    sendTrajectoryData();
  } else if (ballX > canvas.width) {
    // Left player scores
    leftScore++;
    updateScore();
    resetBall(BALL_SPEED);
    sendTrajectoryData();
  }
}

// Reset ball after scoring
function resetBall(initialVelX) {
  ballX = canvas.width / 2;
  ballY = canvas.height / 2;
  ballVelX = initialVelX;
  ballVelY = (Math.random() * 1.5 - 0.75) * BALL_SPEED;
  if (Math.abs(ballVelY) < BALL_SPEED / 2) {
    ballVelY = Math.sign(ballVelY) * BALL_SPEED / 2;
  }
  
  // If we're the left player, we control the ball after reset
  if (isLeftPlayer) {
    hasBallControl = true;
    sendTrajectoryData();
  }
}

// Update ball position based on trajectory (right player only)
function updateBallFromTrajectory(timestamp) {
  const deltaTime = (timestamp - receivedTrajectory.timestamp) / 1000; // Convert to seconds
  
  // Calculate current position based on trajectory
  ballX = receivedTrajectory.startX + receivedTrajectory.velX * deltaTime;
  ballY = receivedTrajectory.startY + receivedTrajectory.velY * deltaTime;
  
  // Handle wall bounces
  if (ballY < BALL_RADIUS || ballY > canvas.height - BALL_RADIUS) {
    receivedTrajectory.velY = -receivedTrajectory.velY;
    receivedTrajectory.startY = ballY;
    receivedTrajectory.startX = ballX;
    receivedTrajectory.timestamp = timestamp;
  }
}

// Send trajectory data using Quiet.js
function sendTrajectoryData() {
  if (!trajectoryTransmitter || !quietReady) return;
  
  try {
    // Create trajectory data object
    const trajectoryData = {
      type: 'trajectory',
      ballX: ballX / canvas.width,
      ballY: ballY / canvas.height,
      ballVelX: (ballVelX + BALL_SPEED) / (2 * BALL_SPEED),
      ballVelY: (ballVelY + BALL_SPEED) / (2 * BALL_SPEED),
      timestamp: performance.now()
    };
    
    // Convert to JSON and transmit
    const jsonString = JSON.stringify(trajectoryData);
    trajectoryTransmitter.transmit(Quiet.str2ab(jsonString));
    
    console.log('Sent trajectory data');
    lastTrajectoryUpdate = performance.now();
  } catch (e) {
    console.error('Error sending trajectory data:', e);
  }
}

// Send paddle position data using Quiet.js
function sendPaddleData() {
  if (!paddleTransmitter || !quietReady || isLeftPlayer) return;
  
  try {
    // Create paddle data object
    const paddleData = {
      type: 'paddle',
      position: rightPaddleY / canvas.height
    };
    
    // Convert to JSON and transmit
    const jsonString = JSON.stringify(paddleData);
    paddleTransmitter.transmit(Quiet.str2ab(jsonString));
    
    console.log('Sent paddle position data');
  } catch (e) {
    console.error('Error sending paddle position data:', e);
  }
}

// Receive trajectory data from Quiet.js
function receiveTrajectoryData(arrayBuffer) {
  try {
    // Convert array buffer to string and parse JSON
    const jsonString = Quiet.ab2str(arrayBuffer);
    const data = JSON.parse(jsonString);
    
    // Verify this is trajectory data
    if (data.type !== 'trajectory') return;
    
    // Update received trajectory
    receivedTrajectory = {
      startX: data.ballX * canvas.width,
      startY: data.ballY * canvas.height,
      velX: (data.ballVelX * 2 - 1) * BALL_SPEED,
      velY: (data.ballVelY * 2 - 1) * BALL_SPEED,
      timestamp: performance.now()
    };
    
    // Update ball position
    ballX = receivedTrajectory.startX;
    ballY = receivedTrajectory.startY;
    ballVelX = receivedTrajectory.velX;
    ballVelY = receivedTrajectory.velY;
    
    // Ball control transfers to right player if we're the right player
    if (!isLeftPlayer) {
      hasBallControl = true;
    }
    
    console.log('Received trajectory data');
  } catch (e) {
    console.error('Error processing received trajectory data:', e);
  }
}

// Receive paddle position data from Quiet.js
function receivePaddleData(arrayBuffer) {
  try {
    // Convert array buffer to string and parse JSON
    const jsonString = Quiet.ab2str(arrayBuffer);
    const data = JSON.parse(jsonString);
    
    // Verify this is paddle data
    if (data.type !== 'paddle') return;
    
    // Update right paddle position if we're the left player
    if (isLeftPlayer) {
      rightPaddleY = data.position * canvas.height;
      console.log('Received paddle position data');
    }
  } catch (e) {
    console.error('Error processing received paddle data:', e);
  }
}

// Start the game when the page loads
window.onload = init; 