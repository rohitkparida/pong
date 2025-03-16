// Pong PWA with Audio Data Transmission
// Main JavaScript file

// Game constants
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const BALL_RADIUS = 10;
const BALL_SPEED = 5;
const PADDLE_SPEED = 8;
const AUDIO_UPDATE_INTERVAL = 100; // ms between audio transmissions

// Game variables
let isHost = false;
let gameActive = false;
let hostPaddleY = 0;
let clientPaddleY = 0;
let ballX = 0;
let ballY = 0;
let ballVelX = 0;
let ballVelY = 0;
let hostScore = 0;
let clientScore = 0;
let lastAudioUpdate = 0;
let predictedArrivalTime = 0;
let predictedArrivalY = 0;
let lastSentPaddleY = 0;
let lastTrajectoryUpdate = 0;
let predictedPath = {
  startX: 0,
  startY: 0,
  velX: 0,
  velY: 0,
  timestamp: 0
};

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const hostBtn = document.getElementById('host-btn');
const joinBtn = document.getElementById('join-btn');
const backBtn = document.getElementById('back-btn');
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreDisplay = document.getElementById('score');
const statusMessage = document.getElementById('status-message');

// Audio context and nodes
let audioContext;
let audioSender;
let audioReceiver;

// Buffer to store recent frequencies for pattern detection
const frequencyBuffer = [];
const maxBufferSize = 20;

// Initialize the game
function init() {
  // Set up event listeners
  hostBtn.addEventListener('click', startHostGame);
  joinBtn.addEventListener('click', startClientGame);
  backBtn.addEventListener('click', returnToSetup);
  
  // Set up canvas size
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  // Set up controls
  setupControls();
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
  hostPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
  clientPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
}

// Set up keyboard and touch controls
function setupControls() {
  // Keyboard controls
  document.addEventListener('keydown', (e) => {
    if (!gameActive) return;
    
    const paddleY = isHost ? hostPaddleY : clientPaddleY;
    let newPaddleY = paddleY;
    
    if (e.key === 'ArrowUp') {
      newPaddleY = Math.max(0, paddleY - PADDLE_SPEED);
    } else if (e.key === 'ArrowDown') {
      newPaddleY = Math.min(canvas.height - PADDLE_HEIGHT, paddleY + PADDLE_SPEED);
    }
    
    if (isHost) {
      hostPaddleY = newPaddleY;
    } else {
      clientPaddleY = newPaddleY;
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
    
    if (isHost) {
      hostPaddleY = newPaddleY;
    } else {
      clientPaddleY = newPaddleY;
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
    
    if (isHost) {
      hostPaddleY = newPaddleY;
    } else {
      clientPaddleY = newPaddleY;
    }
  });
}

// Switch to game screen
function showGameScreen() {
  setupScreen.classList.remove('active');
  gameScreen.classList.add('active');
}

// Return to setup screen
function returnToSetup() {
  gameScreen.classList.remove('active');
  setupScreen.classList.add('active');
  stopGame();
}

// Start game as host
async function startHostGame() {
  try {
    isHost = true;
    statusMessage.textContent = 'Initializing audio...';
    
    // Initialize audio context
    await initAudio();
    
    // Set up audio sender and receiver for host
    setupAudioSender();
    await setupAudioReceiver();
    
    // Initialize game state
    resetGameState();
    
    // Start game loop
    gameActive = true;
    showGameScreen();
    requestAnimationFrame(gameLoop);
    
    statusMessage.textContent = '';
  } catch (error) {
    console.error('Failed to start host game:', error);
    statusMessage.textContent = 'Error: ' + error.message;
  }
}

// Start game as client
async function startClientGame() {
  try {
    isHost = false;
    statusMessage.textContent = 'Initializing audio...';
    
    // Initialize audio context
    await initAudio();
    
    // Set up audio receiver and sender for client
    await setupAudioReceiver();
    setupAudioSender();
    
    // Initialize game state
    resetGameState();
    
    // Start game loop
    gameActive = true;
    showGameScreen();
    requestAnimationFrame(gameLoop);
    
    statusMessage.textContent = '';
  } catch (error) {
    console.error('Failed to start client game:', error);
    statusMessage.textContent = 'Error: ' + error.message;
  }
}

// Stop the game
function stopGame() {
  gameActive = false;
  
  // Clean up audio
  if (audioContext) {
    if (audioSender) {
      audioSender.disconnect();
    }
    if (audioReceiver) {
      audioReceiver.disconnect();
    }
    audioContext.close();
    audioContext = null;
  }
}

// Reset game state
function resetGameState() {
  hostPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
  clientPaddleY = (canvas.height - PADDLE_HEIGHT) / 2;
  ballX = canvas.width / 2;
  ballY = canvas.height / 2;
  ballVelX = isHost ? BALL_SPEED : -BALL_SPEED;
  ballVelY = (Math.random() * 1.5 - 0.75) * BALL_SPEED; // Values between -0.75 and 0.75
  if (Math.abs(ballVelY) < BALL_SPEED / 2) { // Ensure it's not too slow vertically
      ballVelY = Math.sign(ballVelY) * BALL_SPEED / 2;
  }
  hostScore = 0;
  clientScore = 0;
  updateScore();
}

// Update score display
function updateScore() {
  scoreDisplay.textContent = `${hostScore} - ${clientScore}`;
}

// Main game loop
function gameLoop(timestamp) {
  if (!gameActive) return;
  
  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Decode incoming audio data
  decodeAudioData();
  
  if (isHost) {
    // Host: Update ball position and handle collisions
    updateBall();
    
    // Send game state via audio
    if (timestamp - lastAudioUpdate > AUDIO_UPDATE_INTERVAL) {
      sendGameStateViaAudio();
      lastAudioUpdate = timestamp;
    }
  } else {
    // Client: Calculate ball position based on trajectory
    updateBallFromTrajectory(timestamp);
  }
  
  // Draw game elements
  drawGame();
  
  // Continue game loop
  requestAnimationFrame(gameLoop);
}

// Update ball position and handle collisions (host only)
function updateBall() {
  // Move ball
  ballX += ballVelX;
  ballY += ballVelY;
  
  // Wall collisions (top and bottom)
  if (ballY - BALL_RADIUS < 0 || ballY + BALL_RADIUS > canvas.height) {
    ballVelY = -ballVelY;
    ballY = ballY - BALL_RADIUS < 0 ? BALL_RADIUS : canvas.height - BALL_RADIUS;
    // Send trajectory update on wall bounce
    sendTrajectoryViaAudio();
  }
  
  // Paddle collisions
  // Left paddle (host)
  if (ballX - BALL_RADIUS < PADDLE_WIDTH && 
      ballY > hostPaddleY && 
      ballY < hostPaddleY + PADDLE_HEIGHT) {
    ballVelX = Math.abs(ballVelX);
    // Adjust y velocity based on where ball hits paddle
    const hitPosition = (ballY - hostPaddleY) / PADDLE_HEIGHT;
    ballVelY = (hitPosition - 0.5) * 2 * BALL_SPEED;
    // Send trajectory update on paddle hit
    sendTrajectoryViaAudio();
  }
  
  // Right paddle (client)
  if (ballX + BALL_RADIUS > canvas.width - PADDLE_WIDTH && 
      ballY > clientPaddleY && 
      ballY < clientPaddleY + PADDLE_HEIGHT) {
    ballVelX = -Math.abs(ballVelX);
    // Adjust y velocity based on where ball hits paddle
    const hitPosition = (ballY - clientPaddleY) / PADDLE_HEIGHT;
    ballVelY = (hitPosition - 0.5) * 2 * BALL_SPEED;
    // Send trajectory update on paddle hit
    sendTrajectoryViaAudio();
  }
  
  // Scoring
  if (ballX < 0) {
    // Client scores
    clientScore++;
    updateScore();
    resetBall(-BALL_SPEED);
    sendTrajectoryViaAudio();
  } else if (ballX > canvas.width) {
    // Host scores
    hostScore++;
    updateScore();
    resetBall(BALL_SPEED);
    sendTrajectoryViaAudio();
  }
}

// Reset ball after scoring
function resetBall(directionX) {
  ballX = canvas.width / 2;
  ballY = canvas.height / 2;
  ballVelX = directionX;
  ballVelY = (Math.random() * 2 - 1) * BALL_SPEED;
}

// Update ball position based on trajectory (client only)
function updateBallFromTrajectory(timestamp) {
  const deltaTime = (timestamp - predictedPath.timestamp) / 1000; // Convert to seconds
  
  // Calculate current position based on trajectory
  ballX = predictedPath.startX + predictedPath.velX * deltaTime;
  ballY = predictedPath.startY + predictedPath.velY * deltaTime;
  
  // Handle wall bounces
  if (ballY < BALL_RADIUS || ballY > canvas.height - BALL_RADIUS) {
    predictedPath.velY = -predictedPath.velY;
    predictedPath.startY = ballY;
    predictedPath.startX = ballX;
    predictedPath.timestamp = timestamp;
  }
}

// Draw game elements
function drawGame() {
  // Clear canvas
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Draw center line
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.strokeStyle = '#333';
  ctx.stroke();
  ctx.setLineDash([]);
  
  // Draw paddles
  ctx.fillStyle = '#fff';
  if (isHost) {
    ctx.fillRect(0, hostPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
  } else {
    ctx.fillRect(canvas.width - PADDLE_WIDTH, clientPaddleY, PADDLE_WIDTH, PADDLE_HEIGHT);
  }
  
  // Draw ball
  ctx.fillStyle = '#0f0';
  ctx.beginPath();
  ctx.arc(ballX, ballY, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  
  // Draw predicted path
  if (!isHost) {
    ctx.strokeStyle = '#333';
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(ballX, ballY);
    
    // Calculate and draw future positions
    let futureX = ballX;
    let futureY = ballY;
    let futureVelX = ballVelX;
    let futureVelY = ballVelY;
    
    for (let i = 0; i < 50; i++) {
      futureX += futureVelX;
      futureY += futureVelY;
      
      // Handle wall bounces in prediction
      if (futureY < BALL_RADIUS || futureY > canvas.height - BALL_RADIUS) {
        futureVelY = -futureVelY;
      }
      
      ctx.lineTo(futureX, futureY);
      
      // Stop drawing if ball would hit paddle or go off screen
      if (futureX < 0 || futureX > canvas.width) break;
    }
    
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// Initialize audio context and nodes
async function initAudio() {
  // Request microphone permission
  try {
    await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  catch(e) {
    alert('Microphone access is required to play the game!');
    return;
  }

  // Create audio context
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

// Set up audio sender
function setupAudioSender() {
  audioSender = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  audioSender.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  gainNode.gain.value = 0.3; // Set volume
  audioSender.start();
}

// Set up audio receiver
async function setupAudioReceiver() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(stream);
  
  audioReceiver = audioContext.createAnalyser();
  audioReceiver.fftSize = 2048;
  
  source.connect(audioReceiver);
}

// Send game state via audio (host)
function sendGameStateViaAudio() {
  if (!audioSender) return;
  
  const now = audioContext.currentTime;
  const stepDuration = 0.01; // 10ms per value
  
  // Only send full game state when ball crosses center line from left to right
  if (ballX > canvas.width / 2 && ballX - ballVelX <= canvas.width / 2) {
    // Ball just crossed to right side - send full state
    const normalizedBallVelX = (ballVelX + BALL_SPEED) / (2 * BALL_SPEED);
    const normalizedBallVelY = (ballVelY + BALL_SPEED) / (2 * BALL_SPEED);
    const normalizedPredTime = Math.min(1, predictedArrivalTime / 5); // Cap at 5 seconds
    const normalizedPredY = predictedArrivalY / canvas.height;
    
    // Convert to frequencies (300Hz - 2000Hz range)
    const freqBallVelX = 300 + normalizedBallVelX * 1700;
    const freqBallVelY = 300 + normalizedBallVelY * 1700;
    const freqPredTime = 300 + normalizedPredTime * 1700;
    const freqPredY = 300 + normalizedPredY * 1700;
    
    // Send crossing marker and prediction data
    audioSender.frequency.setValueAtTime(2100, now); // Start marker
    audioSender.frequency.setValueAtTime(freqBallVelX, now + stepDuration);
    audioSender.frequency.setValueAtTime(freqBallVelY, now + stepDuration * 2);
    audioSender.frequency.setValueAtTime(freqPredTime, now + stepDuration * 3);
    audioSender.frequency.setValueAtTime(freqPredY, now + stepDuration * 4);
    audioSender.frequency.setValueAtTime(2200, now + stepDuration * 5); // End marker
  } else {
    // Only send paddle position updates
    const normalizedHostPaddle = hostPaddleY / canvas.height;
    const freqHostPaddle = 300 + normalizedHostPaddle * 1700;
    
    audioSender.frequency.setValueAtTime(2300, now); // Paddle update marker
    audioSender.frequency.setValueAtTime(freqHostPaddle, now + stepDuration);
    audioSender.frequency.setValueAtTime(2400, now + stepDuration * 2);
  }
}

// Send trajectory via audio
function sendTrajectoryViaAudio() {
  if (!audioSender) return;
  
  const now = audioContext.currentTime;
  const stepDuration = 0.01;
  
  // Normalize values to frequency range (300Hz - 2000Hz)
  const normalizedX = ballX / canvas.width;
  const normalizedY = ballY / canvas.height;
  const normalizedVelX = (ballVelX + BALL_SPEED) / (2 * BALL_SPEED);
  const normalizedVelY = (ballVelY + BALL_SPEED) / (2 * BALL_SPEED);
  
  // Convert to frequencies
  const freqX = 300 + normalizedX * 1700;
  const freqY = 300 + normalizedY * 1700;
  const freqVelX = 300 + normalizedVelX * 1700;
  const freqVelY = 300 + normalizedVelY * 1700;
  
  // Send trajectory data
  audioSender.frequency.setValueAtTime(2100, now); // Trajectory marker
  audioSender.frequency.setValueAtTime(freqX, now + stepDuration);
  audioSender.frequency.setValueAtTime(freqY, now + stepDuration * 2);
  audioSender.frequency.setValueAtTime(freqVelX, now + stepDuration * 3);
  audioSender.frequency.setValueAtTime(freqVelY, now + stepDuration * 4);
  audioSender.frequency.setValueAtTime(2200, now + stepDuration * 5);
  
  lastTrajectoryUpdate = performance.now();
}

// Decode audio data from receiver
function decodeAudioData() {
  if (!audioReceiver) return;
  
  const bufferLength = audioReceiver.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  audioReceiver.getByteFrequencyData(dataArray);
  
  // Find dominant frequency
  let maxValue = 0;
  let maxIndex = 0;
  
  for (let i = 0; i < bufferLength; i++) {
    if (dataArray[i] > maxValue) {
      maxValue = dataArray[i];
      maxIndex = i;
    }
  }
  
  // Only process if signal is strong enough
  if (maxValue < 50) return;
  
  // Convert index to frequency
  const frequency = maxIndex * audioContext.sampleRate / (2 * bufferLength);
  
  // Store the frequency for pattern detection
  updateFrequencyBuffer(frequency);
  
  // Process the frequency buffer to extract data
  processFrequencyBuffer();
}

// Update the frequency buffer with a new frequency
function updateFrequencyBuffer(frequency) {
  frequencyBuffer.push(frequency);
  
  // Keep buffer at max size
  if (frequencyBuffer.length > maxBufferSize) {
    frequencyBuffer.shift();
  }
}

// Process the frequency buffer to extract data
function processFrequencyBuffer() {
  if (frequencyBuffer.length < 3) return;
  
  if (!isHost) {
    // Client only needs trajectory updates
    const startMarkerIndex = findFrequencyInBuffer(2100, 100);
    const endMarkerIndex = findFrequencyInBuffer(2200, 100);
    
    if (startMarkerIndex >= 0 && endMarkerIndex > startMarkerIndex && 
        endMarkerIndex - startMarkerIndex >= 5) {
      
      // Extract trajectory data
      const xFreq = frequencyBuffer[startMarkerIndex + 1];
      const yFreq = frequencyBuffer[startMarkerIndex + 2];
      const velXFreq = frequencyBuffer[startMarkerIndex + 3];
      const velYFreq = frequencyBuffer[startMarkerIndex + 4];
      
      // Decode trajectory
      if (xFreq >= 300 && xFreq <= 2000 && 
          yFreq >= 300 && yFreq <= 2000 &&
          velXFreq >= 300 && velXFreq <= 2000 &&
          velYFreq >= 300 && velYFreq <= 2000) {
        
        const normalizedX = (xFreq - 300) / 1700;
        const normalizedY = (yFreq - 300) / 1700;
        const normalizedVelX = (velXFreq - 300) / 1700;
        const normalizedVelY = (velYFreq - 300) / 1700;
        
        // Update predicted path
        predictedPath = {
          startX: normalizedX * canvas.width,
          startY: normalizedY * canvas.height,
          velX: (normalizedVelX * 2 - 1) * BALL_SPEED,
          velY: (normalizedVelY * 2 - 1) * BALL_SPEED,
          timestamp: performance.now()
        };
        
        // Set initial ball position
        ballX = predictedPath.startX;
        ballY = predictedPath.startY;
        ballVelX = predictedPath.velX;
        ballVelY = predictedPath.velY;
      }
    }
  }
  
  // Clear the buffer after processing
  frequencyBuffer.length = 0;
}

// Find a frequency in the buffer within a tolerance
function findFrequencyInBuffer(targetFreq, tolerance) {
  for (let i = 0; i < frequencyBuffer.length; i++) {
    if (Math.abs(frequencyBuffer[i] - targetFreq) <= tolerance) {
      return i;
    }
  }
  return -1;
}

// Find the average frequency between two indices
function findAverageFrequencyBetween(startIdx, endIdx) {
  let sum = 0;
  let count = 0;
  
  for (let i = startIdx; i < endIdx && i < frequencyBuffer.length; i++) {
    if (frequencyBuffer[i] >= 300 && frequencyBuffer[i] <= 2000) {
      sum += frequencyBuffer[i];
      count++;
    }
  }
  
  return count > 0 ? sum / count : 0;
}

// Start the game when the page loads
window.addEventListener('load', init); 