# KnotzAxxon - Galactic Remake

A modern, polished isometric remake of the classic arcade space-shooter Zaxxon, powered by Phaser 3 and a hardened FastAPI backend.

## 🚀 Getting Started

### Local Development (Frontend Only)

Simply open `index.html` in any modern web browser to play immediately.

### Production-Ready Backend (Python)

To run the game through the hardened Python backend:

1. Ensure you have **Python 3.8+** installed.
2. Run the provided batch file:

   ```bash
   run_server.bat
   ```

3. Open your browser to: `http://localhost:8000`

### 🐳 Docker Deployment (Recommended for Distribution)

1. **Build the Image**:

   ```bash
   docker build -t knotzaxxon .
   ```

2. **Run the Container**:

   ```bash
   docker run -p 8000:8000 knotzaxxon
   ```

3. Open `http://localhost:8000` to play!

### 🎮 Gameplay Guide

- **Arrows**: Move Ship (X/Z Plane)
- **Space**: Fire Laser
- **Shields (Blue)**: Absorbs 1 hit or crash.
- **Spread (Orange)**: Triple-fire laser for 10 seconds.
- **Fuel (Yellow)**: Collect tanks to stay in the air!

---
**Developed with ❤️ by Antigravity**

## 🕹️ Controls

- **Arrow Keys (Left/Right)**: Lateral movement.
- **Arrow Keys (Up/Down)**: Altitude control.
- **Spacebar**: Fire Lasers.

## 🛠️ Tech Stack

- **Frontend**: Phaser 3 (JavaScript), Modular Architecture.
- **Backend**: Python 3.11, FastAPI, Uvicorn.
- **Hardening**: Security Headers (CSP, XSS, Frame Options), Logging, Rate-limit ready.

## 📁 Project Structure

- `MainScene.js` - Core game logic and rendering.
- `constants.js` - Game balancing and visual tokens.
- `audioManager.js` - Dynamic sound synthesis.
- `utils.js` - Isometric projection and utility functions.
- `server.py` - Hardened backend entry point.
