# Pong PWA with Audio Data Transmission

A Progressive Web App implementation of the classic Pong game that uses audio signals to transmit game data between two devices, eliminating the need for traditional network connections.

## Features

- **Two-Player Gameplay**: Each player uses a separate device to control their paddle.
- **Audio-Based Communication**: Game state is encoded into audio signals and transmitted between devices.
- **PWA Capabilities**: Installable on devices and works offline (though gameplay requires two devices).
- **Vanilla Implementation**: Built solely with HTML, CSS, and JavaScript - no external libraries or frameworks.

## How It Works

The game uses a host-client model:

1. **Host Device**:
   - Manages the main game state (ball position, velocity, etc.)
   - Receives the client's paddle position via audio
   - Sends its own paddle position and ball data to the client

2. **Client Device**:
   - Sends its paddle position to the host
   - Receives the host's paddle position and ball data
   - Renders the game based on received data

## Audio Transmission

Game data is encoded into audio frequencies:
- Paddle positions are mapped to frequencies between 300Hz and 2000Hz
- The host sends predictive data about the ball's trajectory
- Each device decodes the audio signals to update the game state

## How to Play

1. Open the app on two devices in close proximity
2. One device selects "Host Game"
3. The other device selects "Join Game"
4. Allow microphone access when prompted
5. Use touch, mouse, or arrow keys to control your paddle
6. Score points by getting the ball past your opponent's paddle

## Installation

As a PWA, you can install this app on your device:

1. Open the app in a modern browser
2. Look for the "Add to Home Screen" or "Install" option
3. Follow the prompts to install

## Development

This project is built with:
- HTML5 Canvas for rendering
- Web Audio API for audio transmission
- Service Workers for PWA functionality

## Browser Compatibility

Best experienced in modern browsers that support:
- Web Audio API
- Canvas API
- Service Workers
- getUserMedia API

## License

MIT 