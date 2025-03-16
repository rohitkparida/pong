// Pong PWA with Audio Data Transmission
// Main JavaScript file - P2P Version

// Game constants
const PADDLE_HEIGHT = 80;
const PADDLE_WIDTH = 10;
const BALL_RADIUS = 10;
const BALL_SPEED = 5;
const PADDLE_SPEED = 8;
const AUDIO_UPDATE_INTERVAL = 100; // ms between audio transmissions

// Audio constants
const FREQ_MIN = 18000; // Start of ultrasonic range
const FREQ_MAX = 20000; // End of ultrasonic range
const FREQ_STEP = 200;  // Space between frequencies
const FREQ_ERROR_MARGIN = 50; // Tolerance for frequency detection
const DURATION = 100;   // Duration of each tone in ms
const MIN_SIGNAL_THRESHOLD = 20; // Minimum signal strength to consider
const NOISE_SAMPLES = 10; // Number of samples to collect for noise floor

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
let noiseFloor = 0; // Average noise level
let signalThreshold = MIN_SIGNAL_THRESHOLD; // Dynamic threshold for signal detection
let consecutiveFailedTransmissions = 0; // Count of failed transmissions

// Audio protocol frequencies
const PROTOCOL = {
  START: 18000,    // Start marker
  END: 18200,      // End marker
  DATA_START: 18400, // Start of data frequencies
  ACK: 19800       // Acknowledgment tone
};

// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const gameScreen = document.getElementById('game-screen');
const startBtn = document.getElementById('start-btn');
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
  startBtn.addEventListener('click', startGame);
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
  
  // Stop audio
  if (audioSender) {
    audioSender.gain.setValueAtTime(0, audioContext.currentTime);
  }
}

// Start game
async function startGame() {
  try {
    statusMessage.textContent = 'Initializing audio...';
    
    // Initialize audio context
    if (!await initAudio()) {
      throw new Error('Failed to initialize audio');
    }
    
    // Set up audio sender and receiver
    if (!await setupAudioReceiver()) {
      throw new Error('Failed to setup audio receiver');
    }
    
    if (!setupAudioSender()) {
      throw new Error('Failed to setup audio sender');
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
  
  // Process any received audio data
  decodeAudioData();
  processFrequencyBuffer();
  
  // Update game state
  if (isLeftPlayer) {
    // Left player: Update ball position and handle collisions
    updateBall();
    
    // Send game state updates via audio
    if (timestamp - lastAudioUpdate > AUDIO_UPDATE_INTERVAL) {
      sendTrajectoryViaAudio();
      lastAudioUpdate = timestamp;
    }
    
    // Retry sending if we've had consecutive failures and enough time has passed
    if (consecutiveFailedTransmissions > 0 && 
        timestamp - lastAudioUpdate > AUDIO_UPDATE_INTERVAL / 2) {
      console.log(`Retrying transmission after ${consecutiveFailedTransmissions} failures`);
      sendTrajectoryViaAudio();
      lastAudioUpdate = timestamp;
    }
  } else {
    // Right player: Calculate ball position based on trajectory
    if (hasBallControl) {
      updateBall();
      
      // Send trajectory updates when ball hits paddle or walls
      if (timestamp - lastTrajectoryUpdate > AUDIO_UPDATE_INTERVAL) {
        sendTrajectoryViaAudio();
        lastTrajectoryUpdate = timestamp;
      }
      
      // Retry sending if we've had consecutive failures and enough time has passed
      if (consecutiveFailedTransmissions > 0 && 
          timestamp - lastTrajectoryUpdate > AUDIO_UPDATE_INTERVAL / 2) {
        console.log(`Retrying transmission after ${consecutiveFailedTransmissions} failures`);
        sendTrajectoryViaAudio();
        lastTrajectoryUpdate = timestamp;
      }
    } else {
      updateBallFromTrajectory(timestamp);
    }
    
    // Send paddle position updates to left player
    if (timestamp - lastAudioUpdate > AUDIO_UPDATE_INTERVAL) {
      sendRightPaddlePosition();
      lastAudioUpdate = timestamp;
    }
  }
  
  // Adjust audio parameters based on transmission success
  if (consecutiveFailedTransmissions > 3) {
    // If we've had multiple failures, try increasing the gain
    const newGain = Math.min(1.0, 0.8 + (consecutiveFailedTransmissions - 3) * 0.05);
    console.log(`Adjusting audio gain to ${newGain.toFixed(2)} after ${consecutiveFailedTransmissions} failures`);
  }
  
  // Draw game
  drawGame();
  
  // Continue game loop
  requestAnimationFrame(gameLoop);
}

// Update ball position and handle collisions (left player only)
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
  // Left paddle (left player)
  if (ballX - BALL_RADIUS < PADDLE_WIDTH && 
      ballY > leftPaddleY && 
      ballY < leftPaddleY + PADDLE_HEIGHT) {
    ballVelX = Math.abs(ballVelX);
    // Adjust y velocity based on where ball hits paddle
    const hitPosition = (ballY - leftPaddleY) / PADDLE_HEIGHT;
    ballVelY = (hitPosition - 0.5) * 2 * BALL_SPEED;
    // Send trajectory update on paddle hit
    sendTrajectoryViaAudio();
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
    sendTrajectoryViaAudio();
  }
  
  // Scoring
  if (ballX < 0) {
    // Right player scores
    rightScore++;
    updateScore();
    resetBall(-BALL_SPEED);
    sendTrajectoryViaAudio();
  } else if (ballX > canvas.width) {
    // Left player scores
    leftScore++;
    updateScore();
    resetBall(BALL_SPEED);
    sendTrajectoryViaAudio();
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
    sendTrajectoryViaAudio();
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

// Initialize audio context
async function initAudio() {
  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create audio analyzer for receiving data
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    analyzer.fftSize = 32768; // Large FFT for better frequency resolution
    analyzer.smoothingTimeConstant = 0.2;
    source.connect(analyzer);
    
    // Store analyzer for later use
    audioReceiver = analyzer;
    
    console.log('Audio initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to initialize audio:', error);
    return false;
  }
}

// Setup audio sender
function setupAudioSender() {
  try {
    // Create oscillator for sending data
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(0, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start();
    
    // Store oscillator for later use
    audioSender = oscillator;
    audioSender.gain = gainNode.gain;
    
    console.log('Audio sender initialized successfully');
    return true;
  } catch (error) {
    console.error('Failed to setup audio sender:', error);
    return false;
  }
}

// Setup audio receiver
async function setupAudioReceiver() {
  if (!audioReceiver) {
    console.error('Audio not initialized');
    return false;
  }
  
  console.log('Audio receiver initialized successfully');
  return true;
}

// Send game state via audio (left player only)
function sendGameStateViaAudio() {
  if (!audioSender) return;
  
  const now = audioContext.currentTime;
  const stepDuration = 0.01; // 10ms per value
  
  // Restore gain to allow sound
  if (audioSender.gainNode) {
    audioSender.gainNode.gain.setValueAtTime(0.8, now);
  }
  
  // Only send full game state when ball crosses center line from left to right
  if (ballX > canvas.width / 2 && ballX - ballVelX <= canvas.width / 2) {
    // Ball just crossed to right side - send full state
    const normalizedBallVelX = (ballVelX + BALL_SPEED) / (2 * BALL_SPEED);
    const normalizedBallVelY = (ballVelY + BALL_SPEED) / (2 * BALL_SPEED);
    const normalizedPredTime = Math.min(1, receivedTrajectory.timestamp / 5); // Cap at 5 seconds
    const normalizedPredY = receivedTrajectory.startY / canvas.height;
    
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
    
    // Set gain back to 0 after sending
    if (audioSender.gainNode) {
      audioSender.gainNode.gain.setValueAtTime(0, now + stepDuration * 6);
    }
  } else {
    // Only send paddle position updates
    const normalizedLeftPaddle = leftPaddleY / canvas.height;
    const freqLeftPaddle = 300 + normalizedLeftPaddle * 1700;
    
    audioSender.frequency.setValueAtTime(2300, now); // Paddle update marker
    audioSender.frequency.setValueAtTime(freqLeftPaddle, now + stepDuration);
    audioSender.frequency.setValueAtTime(2400, now + stepDuration * 2);
    
    // Set gain back to 0 after sending
    if (audioSender.gainNode) {
      audioSender.gainNode.gain.setValueAtTime(0, now + stepDuration * 3);
    }
  }
}

// Send trajectory via audio
function sendTrajectoryViaAudio() {
  if (!audioSender) return;
  
  try {
    const now = audioContext.currentTime;
    const stepDuration = DURATION / 1000; // Convert ms to seconds
    
    // Adjust gain based on transmission success
    const gain = Math.min(1.0, 0.8 + (consecutiveFailedTransmissions * 0.05));
    
    // Turn on oscillator
    audioSender.gain.setValueAtTime(gain, now);
    
    // Send START marker
    audioSender.frequency.setValueAtTime(PROTOCOL.START, now);
    
    // Normalize values between 0-1
    const normalizedBallX = ballX / canvas.width;
    const normalizedBallY = ballY / canvas.height;
    const normalizedBallVelX = (ballVelX + BALL_SPEED) / (2 * BALL_SPEED);
    const normalizedBallVelY = (ballVelY + BALL_SPEED) / (2 * BALL_SPEED);
    
    // Calculate simple checksum (sum of all values * 100, then take last 3 digits)
    const checksum = Math.floor((normalizedBallX + normalizedBallY + normalizedBallVelX + normalizedBallVelY) * 100) % 1000;
    const normalizedChecksum = checksum / 1000; // Convert to 0-1 range
    
    // Map normalized values to frequencies
    const freqX = PROTOCOL.DATA_START + normalizedBallX * FREQ_STEP;
    const freqY = PROTOCOL.DATA_START + normalizedBallY * FREQ_STEP;
    const freqVelX = PROTOCOL.DATA_START + normalizedBallVelX * FREQ_STEP;
    const freqVelY = PROTOCOL.DATA_START + normalizedBallVelY * FREQ_STEP;
    const freqChecksum = PROTOCOL.DATA_START + normalizedChecksum * FREQ_STEP;
    
    // Send data frequencies
    audioSender.frequency.setValueAtTime(freqX, now + stepDuration);
    audioSender.frequency.setValueAtTime(freqY, now + stepDuration * 2);
    audioSender.frequency.setValueAtTime(freqVelX, now + stepDuration * 3);
    audioSender.frequency.setValueAtTime(freqVelY, now + stepDuration * 4);
    audioSender.frequency.setValueAtTime(freqChecksum, now + stepDuration * 5);
    
    // Send END marker
    audioSender.frequency.setValueAtTime(PROTOCOL.END, now + stepDuration * 6);
    
    // Turn off oscillator
    audioSender.gain.setValueAtTime(0, now + stepDuration * 7);
    
    console.log('Sent trajectory update with checksum:', checksum);
    lastTrajectoryUpdate = performance.now();
  } catch(e) {
    console.error('Error sending trajectory:', e);
  }
}

// Decode audio data from frequency buffer
function decodeAudioData() {
  if (!audioReceiver) return;
  
  try {
    // Get frequency data
    const bufferLength = audioReceiver.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    audioReceiver.getByteFrequencyData(dataArray);
    
    // Calculate noise floor in the ultrasonic range
    const minBin = Math.floor(FREQ_MIN * bufferLength / audioContext.sampleRate);
    const maxBin = Math.ceil(FREQ_MAX * bufferLength / audioContext.sampleRate);
    
    // Sample noise levels from bins outside our frequency range
    let noiseSamples = [];
    for (let i = Math.max(0, minBin - 20); i < minBin; i++) {
      noiseSamples.push(dataArray[i]);
    }
    for (let i = maxBin + 1; i < Math.min(maxBin + 20, bufferLength); i++) {
      noiseSamples.push(dataArray[i]);
    }
    
    // Calculate average noise level
    if (noiseSamples.length > 0) {
      const avgNoise = noiseSamples.reduce((sum, val) => sum + val, 0) / noiseSamples.length;
      // Smooth noise floor calculation
      noiseFloor = noiseFloor * 0.9 + avgNoise * 0.1;
      
      // Adjust signal threshold based on noise floor
      signalThreshold = Math.max(MIN_SIGNAL_THRESHOLD, noiseFloor * 1.5);
    }
    
    // Find peak frequency in ultrasonic range
    let maxValue = 0;
    let peakFrequency = 0;
    
    for (let i = minBin; i <= maxBin; i++) {
      if (dataArray[i] > maxValue) {
        maxValue = dataArray[i];
        peakFrequency = i * audioContext.sampleRate / bufferLength;
      }
    }
    
    // Only process if signal is strong enough compared to noise floor
    if (maxValue > signalThreshold) {
      // Add to buffer
      frequencyBuffer.push(peakFrequency);
      if (frequencyBuffer.length > maxBufferSize) {
        frequencyBuffer.shift();
      }
      
      // Log strong signals for debugging
      if (maxValue > signalThreshold * 2) {
        console.log(`Strong signal detected: ${peakFrequency.toFixed(0)}Hz (${maxValue})`);
      }
    }
  } catch (e) {
    console.error('Error decoding audio data:', e);
  }
}

// Send right paddle position to left player
function sendRightPaddlePosition() {
  if (!audioSender || isLeftPlayer) return;
  
  try {
    const now = audioContext.currentTime;
    const stepDuration = DURATION / 1000; // Convert ms to seconds
    
    // Adjust gain based on transmission success
    const gain = Math.min(1.0, 0.8 + (consecutiveFailedTransmissions * 0.05));
    
    // Turn on oscillator
    audioSender.gain.setValueAtTime(gain, now);
    
    // Normalize paddle position
    const normalizedRightPaddle = rightPaddleY / canvas.height;
    const freqRightPaddle = 300 + normalizedRightPaddle * 1700;
    
    // Send paddle update with markers
    audioSender.frequency.setValueAtTime(2500, now); // Right paddle update marker
    audioSender.frequency.setValueAtTime(freqRightPaddle, now + stepDuration);
    audioSender.frequency.setValueAtTime(2600, now + stepDuration * 2);
    audioSender.frequency.setValueAtTime(0, now + stepDuration * 3); // Reset to silence
    
    // Turn off oscillator
    audioSender.gain.setValueAtTime(0, now + stepDuration * 4);
    
    console.log('Sent right paddle position');
  } catch(e) {
    console.error('Error sending right paddle position:', e);
  }
}

// Process the frequency buffer to extract data
function processFrequencyBuffer() {
  if (frequencyBuffer.length < 3) return;
  
  if (!isLeftPlayer) {
    // Right player: Look for start and end markers for trajectory data
    const startIndex = findFrequencyInBuffer(PROTOCOL.START, FREQ_ERROR_MARGIN);
    const endIndex = findFrequencyInBuffer(PROTOCOL.END, FREQ_ERROR_MARGIN);
    
    if (startIndex >= 0 && endIndex > startIndex && endIndex - startIndex >= 6) { // Now expecting 5 data points + checksum
      // Extract data frequencies
      const frequencies = frequencyBuffer.slice(startIndex + 1, endIndex);
      
      // Convert frequencies back to normalized values
      const normalizedValues = frequencies.map(freq => 
        (freq - PROTOCOL.DATA_START) / FREQ_STEP
      );
      
      if (normalizedValues.length >= 5) { // 4 data points + checksum
        // Extract data and checksum
        const receivedX = normalizedValues[0];
        const receivedY = normalizedValues[1];
        const receivedVelX = normalizedValues[2];
        const receivedVelY = normalizedValues[3];
        const receivedChecksum = normalizedValues[4];
        
        // Calculate checksum from received data
        const calculatedChecksum = Math.floor((receivedX + receivedY + receivedVelX + receivedVelY) * 100) % 1000 / 1000;
        
        // Verify checksum (with some margin for error due to audio transmission)
        const checksumValid = Math.abs(receivedChecksum - calculatedChecksum) < 0.05;
        
        if (checksumValid) {
          // Update received trajectory
          receivedTrajectory = {
            startX: receivedX * canvas.width,
            startY: receivedY * canvas.height,
            velX: (receivedVelX * 2 - 1) * BALL_SPEED,
            velY: (receivedVelY * 2 - 1) * BALL_SPEED,
            timestamp: performance.now()
          };
          
          // Update ball position
          ballX = receivedTrajectory.startX;
          ballY = receivedTrajectory.startY;
          ballVelX = receivedTrajectory.velX;
          ballVelY = receivedTrajectory.velY;
          
          // Ball control transfers to right player
          hasBallControl = true;
          
          // Reset failed transmission counter on success
          consecutiveFailedTransmissions = 0;
          
          console.log('Received valid trajectory update');
          
          // Send acknowledgment tone
          sendAcknowledgment();
          
          // Clear the buffer after successful processing
          frequencyBuffer.length = 0;
        } else {
          console.warn('Received trajectory with invalid checksum');
          // Increment failed transmission counter
          consecutiveFailedTransmissions++;
          
          // Don't clear buffer completely, shift a bit to look for valid data
          for (let i = 0; i < 3; i++) {
            if (frequencyBuffer.length > 0) {
              frequencyBuffer.shift();
            }
          }
        }
      }
    }
  } else {
    // Left player: Look for right paddle position updates
    const startIndex = findFrequencyInBuffer(2500, FREQ_ERROR_MARGIN); // Right paddle marker
    const endIndex = findFrequencyInBuffer(2600, FREQ_ERROR_MARGIN);
    
    if (startIndex >= 0 && endIndex > startIndex && endIndex - startIndex >= 1) {
      // Get the paddle position frequency
      const paddleFreq = frequencyBuffer[startIndex + 1];
      
      if (paddleFreq >= 300 && paddleFreq <= 2000) {
        // Convert frequency to normalized position
        const normalizedPosition = (paddleFreq - 300) / 1700;
        
        // Update right paddle position
        rightPaddleY = normalizedPosition * canvas.height;
        console.log('Received right paddle position update');
        
        // Reset failed transmission counter on success
        consecutiveFailedTransmissions = 0;
        
        // Clear the buffer after successful processing
        frequencyBuffer.length = 0;
      }
    }
    
    // Look for acknowledgment tone
    const ackIndex = findFrequencyInBuffer(PROTOCOL.ACK, FREQ_ERROR_MARGIN);
    if (ackIndex >= 0) {
      console.log('Received acknowledgment');
      // Reset failed transmission counter on acknowledgment
      consecutiveFailedTransmissions = 0;
      // Clear the buffer
      frequencyBuffer.length = 0;
    }
  }
}

// Send acknowledgment tone
function sendAcknowledgment() {
  if (!audioSender) return;
  
  try {
    const now = audioContext.currentTime;
    const stepDuration = DURATION / 1000; // Convert ms to seconds
    
    // Turn on oscillator
    audioSender.gain.setValueAtTime(0.8, now);
    
    // Send ACK tone
    audioSender.frequency.setValueAtTime(PROTOCOL.ACK, now);
    
    // Turn off oscillator
    audioSender.gain.setValueAtTime(0, now + stepDuration);
    
    console.log('Sent acknowledgment');
  } catch(e) {
    console.error('Error sending acknowledgment:', e);
  }
}

// Find a frequency in the buffer within error margin
function findFrequencyInBuffer(targetFreq, errorMargin) {
  // Adjust error margin based on consecutive failures
  const adjustedMargin = errorMargin * (1 + (consecutiveFailedTransmissions * 0.2));
  
  for (let i = 0; i < frequencyBuffer.length; i++) {
    if (Math.abs(frequencyBuffer[i] - targetFreq) <= adjustedMargin) {
      return i;
    }
  }
  return -1;
}

// Start the game when the page loads
window.onload = init; 