// Projection Helpers for Left-to-Right Scrolling

/**
 * Standard Isometric Projection rotated to scroll Left-to-Right
 * worldX: Lateral (Vertical screen axis)
 * worldY: Forward (Horizontal screen axis)
 * worldZ: Altitude
 */

function projectX(worldX, worldY) {
    // Forward movement (worldY) increases screen X
    // Lateral movement (worldX) also contributes to screen X for isometric tilt
    return (worldY + worldX) * (TILE_WIDTH / 2);
}

function projectY(worldX, worldY, worldZ) {
    // Symmetric isometric Y mapping
    // altitude (worldZ) moves sprite vertically up
    return (worldY - worldX) * (TILE_HEIGHT / 4) - worldZ * ALTITUDE_SCALE;
}

// Check 3D distance between two objects
function check3DDistance(objA, objB, threshold) {
    const dx = objA.worldX - objB.worldX;
    const dy = objA.worldY - objB.worldY;
    const dz = objA.worldZ - objB.worldZ;
    const distSq = dx * dx + dy * dy;
    return distSq < threshold * threshold && Math.abs(dz) < COLLISION_ALTITUDE_THRESHOLD;
}
