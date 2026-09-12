// Game Constants
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;
const ALTITUDE_SCALE = 16;
const COLLISION_ALTITUDE_THRESHOLD = 15;

const FORWARD_SPEED = 3; // Reduced for better playability
const LATERAL_SPEED = 4;
const ALTITUDE_SPEED = 4;

const PROJECTILE_SPEED = 12;
const PROJECTILE_RANGE = 40;

const MAP_GRID_WIDTH = 12; // Narrower grid for more focused gameplay
const CHUNK_SIZE = 20;
const STAGE_LENGTH = 100; // World Y units before boss spawns

const BOSS_CONFIG = {
    hp: 2000,
    speed: 2,
    shootRate: 1500, // ms
    color: 0xff0000
};

const COLORS = {
    player: 0x00ffcc,      // Neon Cyan
    enemy: 0xff0066,       // Neon Pink
    projectile: 0xffff00,  // Yellow
    floor: 0x1a1a2e,       // Deep Blue/Black
    wall: 0x16213e,        // Dark Metallic Blue
    wallGlow: 0x0f3460,    // Lighter Blue Glow
    fuel: 0x00ff00,        // Green
    turret: 0x950740,      // Maroon/Red
    shadow: 0x000000
};
