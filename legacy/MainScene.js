class MainScene extends Phaser.Scene {
    constructor() {
        super('MainScene');
    }

    preload() {
        this.createTextures();
    }

    createTextures() {
        // Player: Sleek Sci-Fi ship
        this.drawTexture('player', (g) => {
            g.fillStyle(COLORS.player, 1);
            g.beginPath();
            g.moveTo(20, 0); g.lineTo(40, 30); g.lineTo(0, 30);
            g.closePath(); g.fillPath();
            g.fillStyle(0xffffff, 0.5); // Cockpit
            g.fillEllipse(20, 15, 10, 15);
        }, 40, 30);

        // Floor: Hexagonal or Square grid with neon borders
        this.drawTexture('floor', (g) => {
            g.fillStyle(COLORS.floor, 1);
            g.lineStyle(2, 0x00ffff, 0.1);
            g.beginPath();
            g.moveTo(TILE_WIDTH / 2, 0); g.lineTo(TILE_WIDTH, TILE_HEIGHT / 2);
            g.lineTo(TILE_WIDTH / 2, TILE_HEIGHT); g.lineTo(0, TILE_HEIGHT / 2);
            g.closePath(); g.fillPath(); g.strokePath();
        }, TILE_WIDTH, TILE_HEIGHT);

        // Wall: Metallic with glow trim
        this.drawTexture('wall', (g) => {
            g.fillStyle(COLORS.wall, 1);
            g.lineStyle(2, 0x00ffff, 0.4);
            g.beginPath();
            g.moveTo(TILE_WIDTH / 2, 0); g.lineTo(TILE_WIDTH, TILE_HEIGHT / 2);
            g.lineTo(TILE_WIDTH / 2, TILE_HEIGHT); g.lineTo(0, TILE_HEIGHT / 2);
            g.closePath(); g.fillPath(); g.strokePath();
        }, TILE_WIDTH, TILE_HEIGHT);

        // Fuel Tank: Glowing canister
        this.drawTexture('fuel', (g) => {
            g.fillStyle(COLORS.fuel, 1);
            g.fillRoundedRect(4, 4, 32, 24, 6);
            g.lineStyle(2, 0xffffff, 0.8);
            g.strokeRoundedRect(4, 4, 32, 24, 6);
        }, 40, 32);

        // Turret: Techy base
        this.drawTexture('turret', (g) => {
            g.fillStyle(COLORS.turret, 1);
            g.fillRect(8, 8, 24, 16);
            g.fillStyle(0x333333, 1);
            g.fillRect(16, 0, 8, 24);
        }, 40, 32);

        // Boss: Large monolithic ship
        this.drawTexture('boss', (g) => {
            g.fillStyle(BOSS_CONFIG.color, 1);
            g.lineStyle(4, 0xffffff, 0.6);
            g.beginPath();
            g.moveTo(0, 0); g.lineTo(120, 40); g.lineTo(0, 80);
            g.closePath(); g.fillPath(); g.strokePath();
            g.fillStyle(0x00ffff, 0.8);
            g.fillRect(20, 20, 30, 40);
        }, 120, 80);

        // Enemy Ship: Faster, different shape
        this.drawTexture('enemyShip', (g) => {
            g.fillStyle(COLORS.enemy, 1);
            g.beginPath();
            g.moveTo(0, 15); g.lineTo(30, 0); g.lineTo(30, 30);
            g.closePath(); g.fillPath();
            g.fillStyle(0xffffff, 0.4);
            g.fillRect(10, 10, 5, 10);
        }, 32, 32);

        // Shadow: Simple oval
        this.drawTexture('shadow', (g) => {
            g.fillStyle(0x000000, 0.4);
            g.fillEllipse(20, 10, 40, 20);
        }, 40, 20);

        // Projectile: Glowing laser
        this.drawTexture('laser', (g) => {
            g.fillStyle(COLORS.projectile, 1);
            g.fillEllipse(8, 4, 16, 8);
        }, 16, 8);

        // Particles
        this.drawTexture('particle', (g) => {
            g.fillStyle(0xffffff, 1);
            g.fillRect(0, 0, 4, 4);
        }, 4, 4);

        // Power-Ups
        this.drawTexture('shieldUP', (g) => {
            g.fillStyle(0x00aaff, 1);
            g.fillCircle(16, 16, 14);
            g.lineStyle(2, 0xffffff, 1);
            g.strokeCircle(16, 16, 14);
            g.fillStyle(0xffffff, 1);
            g.fillRect(10, 10, 12, 12);
        }, 32, 32);

        this.drawTexture('spreadUP', (g) => {
            g.fillStyle(0xffaa00, 1);
            g.fillCircle(16, 16, 14);
            g.lineStyle(2, 0xffffff, 1);
            g.strokeCircle(16, 16, 14);
            g.fillStyle(0xffffff, 1);
            g.beginPath();
            g.moveTo(16, 8); g.lineTo(24, 24); g.lineTo(8, 24);
            g.closePath(); g.fillPath();
        }, 32, 32);

        // Interceptor: Faster, hunting ship
        this.drawTexture('interceptor', (g) => {
            g.fillStyle(0xff00ff, 1);
            g.beginPath();
            g.moveTo(0, 10); g.lineTo(32, 0); g.lineTo(32, 20); g.lineTo(0, 30);
            g.closePath(); g.fillPath();
            g.fillStyle(0xffff00, 1);
            g.fillRect(10, 12, 10, 6);
        }, 32, 32);

        // Asteroid: Craggy gray rock
        this.drawTexture('asteroid', (g) => {
            g.fillStyle(0x888888, 1);
            g.beginPath();
            g.moveTo(10, 0); g.lineTo(25, 5); g.lineTo(32, 16); g.lineTo(25, 27);
            g.lineTo(7, 32); g.lineTo(0, 18); g.lineTo(5, 5);
            g.closePath(); g.fillPath();
            g.fillStyle(0x555555, 1);
            g.fillRect(10, 10, 4, 4);
            g.fillRect(20, 18, 5, 5);
        }, 32, 32);

        // Electric Grid: Shimmering cyan bar
        this.drawTexture('gridHazard', (g) => {
            g.fillStyle(0x00ffff, 0.5);
            g.fillRect(0, 0, TILE_WIDTH, 4);
            g.lineStyle(1, 0xffffff, 0.8);
            g.strokeRect(0, 0, TILE_WIDTH, 4);
        }, TILE_WIDTH, 4);
    }

    drawTexture(key, drawFn, w, h) {
        const g = this.add.graphics();
        drawFn(g);
        g.generateTexture(key, w, h);
        g.destroy();
    }

    create() {
        this.isGameOver = false;
        this.score = 0;
        this.fuel = 100;
        this.currentWorldY = 0;

        // Groups
        this.tiles = this.add.group();
        this.obstacles = this.add.group();
        this.projectiles = this.add.group();
        this.fuelTanks = this.add.group();
        this.powerUps = this.add.group();
        this.hazards = this.add.group();
        this.shadows = this.add.group();

        // Player setup
        this.player = this.add.sprite(0, 0, 'player').setOrigin(0.5, 1);
        this.player.worldX = MAP_GRID_WIDTH / 2;
        this.player.worldY = 2; // Move worldY forward
        this.player.worldZ = 5;
        this.player.hasShield = false;
        this.player.shotType = 'normal';
        this.player.powerUpTimer = 0;
        this.playerShadow = this.add.sprite(0, 0, 'shadow').setOrigin(0.5, 0.5);
        this.shadows.add(this.playerShadow);

        this.playerShield = this.add.circle(0, 0, 25, 0x00aaff, 0.2).setStrokeStyle(2, 0x00aaff);
        this.playerShield.setVisible(false);

        // Camera
        this.cameras.main.setBackgroundColor('#000000');

        // HUD
        this.createHUD();

        // Input
        this.cursors = this.input.keyboard.createCursorKeys();
        this.input.keyboard.on('keydown-SPACE', () => this.shoot());
        this.input.on('pointerdown', () => {
            if (this.isGameOver) this.scene.restart();
            else audio.resume();
        });

        // Level Gen
        this.mapData = new Map();
        this.isBossSpawned = false;
        this.stageCount = 1;
        this.generateChunk(0);
        this.generateChunk(CHUNK_SIZE);
        this.generateChunk(CHUNK_SIZE * 2);

        // Particle Emitter
        this.emitter = this.add.particles(0, 0, 'particle', {
            speed: { min: 50, max: 200 },
            scale: { start: 1.5, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: 1000,
            emitting: false
        });

        // Background: Starfield & Nebulae
        this.stars = [];
        for (let i = 0; i < 200; i++) {
            const s = this.add.circle(Phaser.Math.Between(-2000, 6000), Phaser.Math.Between(-1000, 3000), 1, 0xffffff, Math.random());
            s.setScrollFactor(Phaser.Math.FloatBetween(0.1, 0.4));
            this.stars.push(s);
        }

        this.nebulae = [];
        const nebulaColors = [0x440044, 0x002244, 0x004422];
        for (let i = 0; i < 5; i++) {
            const n = this.add.graphics();
            n.fillStyle(nebulaColors[i % 3], 0.2);
            n.fillEllipse(0, 0, 800, 400);
            const container = this.add.container(Phaser.Math.Between(0, 4000), Phaser.Math.Between(0, 1000), [n]);
            container.setScrollFactor(0.05 + Math.random() * 0.1);
            this.nebulae.push(container);
        }

        audio.init();

        // Responsive
        window.addEventListener('resize', () => {
            this.scale.resize(window.innerWidth, window.innerHeight);
            if (this.hudContainer) this.hudContainer.setPosition(20, 20);
        });
    }

    createHUD() {
        this.hudContainer = this.add.container(20, 20).setScrollFactor(0).setDepth(2000);

        this.scoreText = this.add.text(0, 0, 'SCORE: 00000', { fontSize: '24px', color: '#0ff', fontStyle: 'bold' });
        this.fuelLabel = this.add.text(0, 35, 'FUEL:', { fontSize: '18px', color: '#0f0' });
        this.fuelBarBg = this.add.rectangle(60, 45, 200, 15, 0x333333).setOrigin(0, 0.5);
        this.fuelBar = this.add.rectangle(60, 45, 200, 15, 0x00ff00).setOrigin(0, 0.5);

        this.altLabel = this.add.text(0, 70, 'ALTITUDE:', { fontSize: '18px', color: '#ff0' });
        this.altScale = this.add.rectangle(110, 80, 100, 10, 0x333333).setOrigin(0, 0.5);
        this.altIndicator = this.add.rectangle(110, 80, 5, 15, 0xffff00).setOrigin(0, 0.5);

        // Power-Up Icons
        this.shieldIcon = this.add.sprite(10, 110, 'shieldUP').setScale(0.8).setOrigin(0).setVisible(false);
        this.spreadIcon = this.add.sprite(45, 110, 'spreadUP').setScale(0.8).setOrigin(0).setVisible(false);

        // Boss Health Bar (hidden until boss spawns)
        this.bossHud = this.add.container(400, 20).setVisible(false);
        const bossBarBg = this.add.rectangle(0, 0, 300, 20, 0x333333).setOrigin(0.5);
        this.bossBar = this.add.rectangle(0, 0, 300, 20, 0xff0000).setOrigin(0.5);
        const bossLabel = this.add.text(0, -20, 'COMMAND SHIP DETECTED', { fontSize: '16px', color: '#f00', fontStyle: 'bold' }).setOrigin(0.5);
        this.bossHud.add([bossBarBg, this.bossBar, bossLabel]);

        this.hudContainer.add([this.scoreText, this.fuelLabel, this.fuelBarBg, this.fuelBar, this.altLabel, this.altScale, this.altIndicator, this.shieldIcon, this.spreadIcon, this.bossHud]);

        this.gameOverUI = this.add.container(window.innerWidth / 2, window.innerHeight / 2).setScrollFactor(0).setDepth(2001).setVisible(false);
        const bg = this.add.rectangle(0, 0, 500, 400, 0x000000, 0.9);
        const text = this.add.text(0, -150, 'MISSION FAILED', { fontSize: '40px', color: '#f06', align: 'center', fontStyle: 'bold' }).setOrigin(0.5);
        this.leaderboardText = this.add.text(0, 0, 'FETCHING LEADERBOARD...', { fontSize: '18px', color: '#0ff', align: 'center', lineSpacing: 10 }).setOrigin(0.5);
        const restartText = this.add.text(0, 160, 'CLICK TO RESTART', { fontSize: '24px', color: '#fff', align: 'center' }).setOrigin(0.5);
        this.gameOverUI.add([bg, text, this.leaderboardText, restartText]);
    }

    update(time, delta) {
        if (this.isGameOver) return;

        const dt = delta / 1000;

        // Progress Forward (Auto-Scroll)
        this.player.worldY += FORWARD_SPEED * dt;
        this.fuel -= 1.5 * dt;

        // Dynamic Sound & Urgency
        if (this.fuel < 20) {
            if (this.time.now > (this.nextAlarm || 0)) {
                audio.playAlarm();
                this.nextAlarm = this.time.now + 1000;
            }
            audio.setBGMDelay(300); // Faster
        } else if (this.boss && this.boss.active) {
            audio.setBGMDelay(350);
        } else {
            audio.setBGMDelay(500);
        }

        if (this.player.powerUpTimer > 0) {
            this.player.powerUpTimer -= dt;
            if (this.player.powerUpTimer <= 0) {
                this.player.shotType = 'normal';
            }
        }

        // Player Controls
        if (this.cursors.left.isDown) this.player.worldX += LATERAL_SPEED * dt;
        if (this.cursors.right.isDown) this.player.worldX -= LATERAL_SPEED * dt;
        if (this.cursors.up.isDown) this.player.worldZ += ALTITUDE_SPEED * dt;
        if (this.cursors.down.isDown) this.player.worldZ -= ALTITUDE_SPEED * dt;

        // Clamp
        this.player.worldX = Phaser.Math.Clamp(this.player.worldX, 0, MAP_GRID_WIDTH - 1);
        this.player.worldZ = Phaser.Math.Clamp(this.player.worldZ, 0, 15);

        if (this.fuel <= 0) this.gameOver("OUT OF FUEL");

        this.updatePositions();
        this.updateProjectiles(dt);
        this.updateEnemies(dt);
        this.updateBoss(dt);
        this.updatePowerUps(dt);
        this.updateHazards(dt);
        this.checkCollisions();
        this.checkLevelGen();
        this.updateHUD();
        this.updateCamera();
    }

    updateHazards(dt) {
        this.hazards.getChildren().forEach(h => {
            if (h.isAsteroid) {
                h.worldX += h.vx * dt;
                h.worldY += h.vy * dt;
                h.angle += h.rotSpeed * dt;
            }
            if (h.isGrid) {
                h.alpha = 0.4 + Math.sin(this.time.now / 200) * 0.3;
            }
            h.setPosition(projectX(h.worldX, h.worldY), projectY(h.worldX, h.worldY, h.worldZ));
            h.depth = h.y + 10;
        });
    }

    updatePowerUps(dt) {
        this.powerUps.getChildren().forEach(p => {
            p.setPosition(projectX(p.worldX, p.worldY), projectY(p.worldX, p.worldY, p.worldZ));
            p.depth = p.y + 10;
        });
    }

    updateBoss(dt) {
        if (!this.boss || !this.boss.active) return;

        // Follow player worldY but stay ahead
        this.boss.worldY = this.player.worldY + 15;

        // Movement pattern: Sine wave on worldX and altitude
        this.boss.worldX = (MAP_GRID_WIDTH / 2) + Math.sin(this.time.now / 1000) * 4;
        this.boss.worldZ = 7 + Math.cos(this.time.now / 1500) * 5;

        const bx = projectX(this.boss.worldX, this.boss.worldY);
        const by = projectY(this.boss.worldX, this.boss.worldY, this.boss.worldZ);
        this.boss.setPosition(bx, by);
        this.boss.depth = by + 200;

        if (this.bossShadow) {
            this.bossShadow.setPosition(projectX(this.boss.worldX, this.boss.worldY), projectY(this.boss.worldX, this.boss.worldY, 0));
            this.bossShadow.depth = by - 5;
            this.bossShadow.setScale(1.5);
        }

        // Shooting pattern
        if (this.time.now > (this.nextBossShot || 0)) {
            this.spawnBossProjectile();
            this.nextBossShot = this.time.now + BOSS_CONFIG.shootRate;
        }
    }

    spawnBossProjectile() {
        const p = this.add.sprite(this.boss.x, this.boss.y, 'laser').setOrigin(0.5, 0.5).setTint(0xff0000);
        p.worldX = this.boss.worldX;
        p.worldY = this.boss.worldY;
        p.worldZ = this.boss.worldZ;
        p.isEnemy = true;
        this.projectiles.add(p);
    }

    updateEnemies(dt) {
        this.enemies.getChildren().forEach(e => {
            if (e.isInterceptor) {
                // Interceptor AI: Seek player X and Z
                const dx = this.player.worldX - e.worldX;
                const dz = this.player.worldZ - e.worldZ;
                e.worldX += Math.sign(dx) * 1.5 * dt;
                e.worldZ += Math.sign(dz) * 1.5 * dt;
                e.worldY -= (FORWARD_SPEED * 1.2) * dt;
            } else if (e.isTurret) {
                // Turret AI: Shoot at player if in range
                const distY = e.worldY - this.player.worldY;
                if (distY < 30 && distY > 5) {
                    if (this.time.now > (e.nextShootTime || 0)) {
                        this.spawnTurretProjectile(e);
                        e.nextShootTime = this.time.now + 2500;
                    }
                }
            } else {
                e.worldY -= (FORWARD_SPEED * 0.5) * dt;
            }

            const ex = projectX(e.worldX, e.worldY);
            const ey = projectY(e.worldX, e.worldY, e.worldZ);
            e.setPosition(ex, ey);
            e.depth = ey + 50;

            if (e.shadow) {
                e.shadow.setPosition(projectX(e.worldX, e.worldY), projectY(e.worldX, e.worldY, 0));
                e.shadow.depth = e.depth - 2;
                e.shadow.setScale(e.worldZ > 0 ? 0.8 : 1);
            }

            if (e.worldY < this.player.worldY - 10) {
                if (e.shadow) e.shadow.destroy();
                e.destroy();
            }
        });
    }

    spawnTurretProjectile(t) {
        const p = this.add.sprite(t.x, t.y, 'laser').setOrigin(0.5, 0.5).setTint(0xff8800);
        p.worldX = t.worldX;
        p.worldY = t.worldY;
        p.worldZ = t.worldZ;
        p.isEnemy = true;
        const dx = this.player.worldX - t.worldX;
        const dz = this.player.worldZ - t.worldZ;
        const mag = Math.sqrt(dx * dx + dz * dz) || 1;
        p.vx = (dx / mag) * 3;
        p.vz = (dz / mag) * 3;
        this.projectiles.add(p);
    }

    updatePositions() {
        const px = projectX(this.player.worldX, this.player.worldY);
        const py = projectY(this.player.worldX, this.player.worldY, this.player.worldZ);
        this.player.setPosition(px, py);
        this.player.depth = py + 100;

        const sx = projectX(this.player.worldX, this.player.worldY);
        const sy = projectY(this.player.worldX, this.player.worldY, 0);
        this.playerShadow.setPosition(sx, sy);
        this.playerShadow.depth = sy - 1;
        // Shadow scaling based on altitude
        const scale = 1 - (this.player.worldZ / 30);
        this.playerShadow.setScale(scale);

        if (this.player.hasShield) {
            this.playerShield.setPosition(px, py - 10);
            this.playerShield.depth = py + 101;
            this.playerShield.setVisible(true);
        } else {
            this.playerShield.setVisible(false);
        }
    }

    updateHUD() {
        this.scoreText.setText(`SCORE: ${Math.floor(this.score).toString().padStart(5, '0')}`);
        this.fuelBar.width = Math.max(0, (this.fuel / 100) * 200);
        if (this.fuel < 30) this.fuelBar.setFillStyle(0xff0000);
        else this.fuelBar.setFillStyle(0x00ff00);

        this.altIndicator.x = 110 + (this.player.worldZ / 15) * 100;

        this.shieldIcon.setVisible(this.player.hasShield);
        this.spreadIcon.setVisible(this.player.shotType === 'spread');

        if (this.boss && this.boss.active) {
            this.bossBar.width = (this.boss.hp / BOSS_CONFIG.hp) * 300;
        }
    }

    updateCamera() {
        const tx = this.player.x - (window.innerWidth / 4);
        const ty = this.player.y - (window.innerHeight / 2);
        this.cameras.main.scrollX = Phaser.Math.Linear(this.cameras.main.scrollX, tx, 0.1);
        this.cameras.main.scrollY = Phaser.Math.Linear(this.cameras.main.scrollY, ty, 0.1);
    }

    generateChunk(startY) {
        // Stage Manager logic
        const targetY = this.stageCount * STAGE_LENGTH;

        for (let y = startY; y < startY + CHUNK_SIZE; y++) {
            if (y >= targetY && !this.isBossSpawned) {
                this.spawnBoss(y + 10);
                this.isBossSpawned = true;
                break;
            }

            if (this.isBossSpawned) break;

            // Floor tiles
            for (let x = 0; x < MAP_GRID_WIDTH; x++) {
                const tx = projectX(x, y);
                const ty = projectY(x, y, 0);
                const tile = this.add.image(tx, ty, 'floor').setOrigin(0.5, 1);
                tile.depth = ty - 100;
                tile.worldX = x;
                tile.worldY = y;
                this.tiles.add(tile);
            }

            // Obstacles
            if (y > 20) {
                if (y % 15 === 0) {
                    const holeX = Phaser.Math.Between(2, MAP_GRID_WIDTH - 3);
                    for (let x = 0; x < MAP_GRID_WIDTH; x++) {
                        if (Math.abs(x - holeX) > 1.5) {
                            this.addObstacle(x, y, 'wall', 8);
                        }
                    }
                } else if (Math.random() < 0.06) {
                    this.addObstacle(Phaser.Math.Between(1, MAP_GRID_WIDTH - 2), y, 'fuel', 0, true);
                } else if (Math.random() < 0.04) {
                    this.addObstacle(Phaser.Math.Between(1, MAP_GRID_WIDTH - 2), y, 'turret', 2);
                } else if (Math.random() < 0.03) {
                    this.spawnEnemyShip(Phaser.Math.Between(1, MAP_GRID_WIDTH - 2), y);
                } else if (Math.random() < 0.02) {
                    this.spawnInterceptor(Phaser.Math.Between(1, MAP_GRID_WIDTH - 2), y);
                } else if (Math.random() < 0.04) {
                    this.spawnAsteroid(Phaser.Math.Between(0, MAP_GRID_WIDTH), y);
                } else if (y % 25 === 12) {
                    this.spawnElectricGrid(y);
                } else if (Math.random() < 0.01) {
                    this.spawnPowerUp(Phaser.Math.Between(2, MAP_GRID_WIDTH - 3), y);
                }
            }
        }
    }

    spawnAsteroid(x, y) {
        const a = this.add.sprite(0, 0, 'asteroid').setOrigin(0.5, 0.5);
        a.worldX = x;
        a.worldY = y;
        a.worldZ = Phaser.Math.Between(2, 12);
        a.vx = (Math.random() - 0.5) * 2;
        a.vy = -Math.random() * 1;
        a.rotSpeed = (Math.random() - 0.5) * 100;
        a.isAsteroid = true;
        this.hazards.add(a);
    }

    spawnElectricGrid(y) {
        // Grid spans across but has a "gap" or required altitude
        const gapZ = Phaser.Math.Between(4, 10);
        for (let x = 0; x < MAP_GRID_WIDTH; x++) {
            const h = this.add.sprite(0, 0, 'gridHazard').setOrigin(0.5, 0.5);
            h.worldX = x;
            h.worldY = y;
            h.worldZ = gapZ; // Only active at this altitude
            h.isGrid = True;
            this.hazards.add(h);
        }
    }

    spawnInterceptor(x, y) {
        const i = this.add.sprite(0, 0, 'interceptor').setOrigin(0.5, 0.5);
        i.worldX = x;
        i.worldY = y;
        i.worldZ = 5;
        i.isInterceptor = true;
        i.shadow = this.add.sprite(0, 0, 'shadow').setOrigin(0.5, 0.5);
        this.shadows.add(i.shadow);
        this.enemies.add(i);
    }

    spawnPowerUp(x, y) {
        const type = Math.random() < 0.5 ? 'shieldUP' : 'spreadUP';
        const p = this.add.sprite(0, 0, type);
        p.worldX = x;
        p.worldY = y;
        p.worldZ = 5;
        p.powerType = type;
        this.powerUps.add(p);
    }

    spawnBoss(y) {
        console.log("BOSS SPAWNED!");
        this.boss = this.add.sprite(0, 0, 'boss').setOrigin(0.5, 0.5);
        this.boss.worldX = MAP_GRID_WIDTH / 2;
        this.boss.worldY = y;
        this.boss.worldZ = 10;
        this.boss.hp = BOSS_CONFIG.hp;
        this.boss.active = true;
        this.bossShadow = this.add.sprite(0, 0, 'shadow').setOrigin(0.5, 0.5);
        this.shadows.add(this.bossShadow);
        this.bossHud.setVisible(true);
        this.cameras.main.shake(500, 0.01);
    }

    spawnEnemyShip(x, y) {
        const obs = this.add.sprite(projectX(x, y), projectY(x, y, 5), 'enemyShip').setOrigin(0.5, 0.5);
        obs.worldX = x;
        obs.worldY = y;
        obs.worldZ = 5;
        obs.shadow = this.add.sprite(obs.x, obs.y, 'shadow').setOrigin(0.5, 0.5);
        this.shadows.add(obs.shadow);
        this.enemies.add(obs);
    }

    addObstacle(x, y, type, z, isFuel = false) {
        const ox = projectX(x, y);
        const oy = projectY(x, y, 0);
        const obs = this.add.sprite(ox, oy, type).setOrigin(0.5, 1);
        obs.depth = oy;
        obs.worldX = x;
        obs.worldY = y;
        obs.worldZ = z;
        obs.isFuel = isFuel;
        obs.isTurret = (type === 'turret');

        const shad = this.add.sprite(ox, oy, 'shadow').setOrigin(0.5, 0.5);
        shad.depth = oy - 1;
        shad.setScale(0.8);
        this.shadows.add(shad);

        if (type === 'wall' && z > 0) {
            for (let h = 2; h < z; h += 2) {
                const stack = this.add.image(projectX(x, y), projectY(x, y, h), 'wall').setOrigin(0.5, 1);
                stack.depth = oy + h;
                this.obstacles.add(stack);
            }
        }

        if (isFuel) this.fuelTanks.add(obs);
        else if (obs.isTurret) this.enemies.add(obs);
        else this.obstacles.add(obs);

        this.mapData.set(`${Math.round(x)},${Math.round(y)}`, z);
    }

    shoot() {
        if (this.isGameOver) return;
        audio.play(audio.shootBuffer);

        const shootOne = (ox = 0, oz = 0) => {
            const p = this.add.sprite(this.player.x, this.player.y, 'laser').setOrigin(0.5, 0.5);
            p.worldX = this.player.worldX + ox;
            p.worldY = this.player.worldY;
            p.worldZ = this.player.worldZ + oz;
            this.projectiles.add(p);
        };

        if (this.player.shotType === 'spread') {
            shootOne();
            shootOne(-0.5, 0);
            shootOne(0.5, 0);
        } else {
            shootOne();
        }
    }

    updateProjectiles(dt) {
        this.projectiles.getChildren().forEach(p => {
            const speed = p.isEnemy ? -PROJECTILE_SPEED * 0.8 : PROJECTILE_SPEED;
            p.worldY += speed * dt;
            if (p.isEnemy && p.vx !== undefined) {
                p.worldX += p.vx * dt;
                p.worldZ += p.vz * dt;
            }
            p.setPosition(projectX(p.worldX, p.worldY), projectY(p.worldX, p.worldY, p.worldZ));
            p.depth = p.y + 50;
            if (Math.abs(p.worldY - this.player.worldY) > PROJECTILE_RANGE) p.destroy();
        });
    }

    checkCollisions() {
        const gx = Math.round(this.player.worldX);
        const gy = Math.round(this.player.worldY);
        const wallZ = this.mapData.get(`${gx},${gy}`) || 0;

        if (this.player.worldZ < wallZ) {
            if (this.player.hasShield) {
                this.player.hasShield = false;
                this.cameras.main.shake(300, 0.02);
                this.player.worldZ += 2;
            } else {
                this.gameOver("CRASHED!");
            }
        }

        // Power-Up collection
        this.powerUps.getChildren().forEach(p => {
            if (check3DDistance(this.player, p, 1.5)) {
                if (p.powerType === 'shieldUP') {
                    this.player.hasShield = true;
                } else {
                    this.player.shotType = 'spread';
                    this.player.powerUpTimer = 10; // 10 seconds
                }
                this.score += 100;
                p.destroy();
                audio.play(audio.fuelBuffer);
                this.cameras.main.flash(200, 0, 255, 255);
            }
        });

        // Hazard collisions
        this.hazards.getChildren().forEach(h => {
            if (check3DDistance(this.player, h, 1.5)) {
                if (h.isGrid) {
                    // Electric grid only hurts if you are at its altitude
                    if (Math.abs(this.player.worldZ - h.worldZ) < 1) {
                        this.handleDamage("SHOCKED!");
                    }
                } else {
                    this.handleDamage("COLLISION!");
                    h.destroy();
                }
            }
        });

        // Projectile collisions
        this.projectiles.getChildren().forEach(p => {
            if (p.isEnemy) {
                // Player vs Enemy Projectile
                if (check3DDistance(p, this.player, 1.5)) {
                    this.handleDamage("BLASTED!");
                    p.destroy();
                }
                return;
            }

            // Vs Hazards
            this.hazards.getChildren().forEach(h => {
                if (h.isAsteroid && check3DDistance(p, h, 1.5)) {
                    this.explode(h.x, h.y);
                    this.score += 50;
                    h.destroy();
                    p.destroy();
                }
            });

            // Player Projectile vs Boss
            if (this.boss && this.boss.active) {
                if (check3DDistance(p, this.boss, 10)) {
                    this.boss.hp -= 100;
                    this.cameras.main.shake(100, 0.005);
                    this.explode(p.x, p.y);
                    p.destroy();
                    if (this.boss.hp <= 0) {
                        this.bossDefeated();
                    }
                }
            }

            // Vs Obstacles
            this.obstacles.getChildren().forEach(o => {
                if (check3DDistance(p, o, 1.5)) {
                    this.explode(o.x, o.y);
                    p.destroy();
                    if (o.texture.key === 'turret') {
                        this.score += 150;
                        o.destroy();
                        audio.play(audio.explosionBuffer);
                    }
                }
            });
            // Vs Enemies
            this.enemies.getChildren().forEach(e => {
                if (check3DDistance(p, e, 1.5)) {
                    this.explode(e.x, e.y);
                    this.score += 200;
                    p.destroy();
                    if (e.shadow) e.shadow.destroy();
                    e.destroy();
                    audio.play(audio.explosionBuffer);
                }
            });
        });

        // Player vs Enemy Ships
        this.enemies.getChildren().forEach(e => {
            if (check3DDistance(this.player, e, 1.5)) {
                this.gameOver("COLLISION!");
            }
        });

        this.fuelTanks.getChildren().forEach(f => {
            if (check3DDistance(this.player, f, 1.5)) {
                this.fuel = Math.min(100, this.fuel + 25);
                this.score += 50;
                f.destroy();
                audio.play(audio.fuelBuffer);
            }
        });
    }

    bossDefeated() {
        this.explode(this.boss.x, this.boss.y);
        this.explode(this.boss.x + 20, this.boss.y - 10);
        this.explode(this.boss.x - 20, this.boss.y + 10);
        this.boss.active = false;
        this.boss.destroy();
        if (this.bossShadow) this.bossShadow.destroy();
        this.bossHud.setVisible(false);
        this.score += 2000;
        this.isBossSpawned = false;
        this.stageCount++;
        this.cameras.main.flash(1000, 0, 255, 255);
        this.cameras.main.shake(500, 0.03);
        audio.play(audio.explosionBuffer);

        // Minor Upgrade: Juice - Big text on stage clear
        const clearText = this.add.text(window.innerWidth / 2, window.innerHeight / 2, `STAGE ${this.stageCount - 1} CLEAR\nHYPER-SPEED ENGAGED`, {
            fontSize: '48px', color: '#0ff', fontStyle: 'bold', align: 'center'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(3000);

        this.tweens.add({
            targets: clearText,
            alpha: { from: 1, to: 0 },
            y: '-=100',
            duration: 3000,
            onComplete: () => clearText.destroy()
        });

        // Spawn more chunks immediately to continue
        this.generateChunk(this.player.worldY + CHUNK_SIZE);
    }

    explode(x, y) {
        this.emitter.emitParticleAt(x, y, 15);
        this.cameras.main.shake(200, 0.008);
    }

    checkLevelGen() {
        if (this.player.worldY > this.currentWorldY + CHUNK_SIZE) {
            this.currentWorldY += CHUNK_SIZE;
            this.generateChunk(this.currentWorldY + CHUNK_SIZE);
            // Cleanup
            const cleanup = (group) => {
                group.getChildren().forEach(c => {
                    if (c.worldY < this.player.worldY - CHUNK_SIZE) {
                        this.mapData.delete(`${Math.round(c.worldX)},${Math.round(c.worldY)}`);
                        c.destroy();
                    }
                });
            };
            [this.tiles, this.obstacles, this.fuelTanks, this.shadows, this.enemies, this.powerUps, this.hazards].forEach(cleanup);
        }
    }

    handleDamage(msg) {
        if (this.player.hasShield) {
            this.player.hasShield = false;
            this.cameras.main.shake(300, 0.02);
            this.player.setTint(0xffffff); // Blink effect
            this.time.delayedCall(100, () => this.player.clearTint());
        } else {
            this.gameOver(msg);
        }
    }

    gameOver(msg) {
        this.isGameOver = true;
        audio.stopBGM();
        audio.play(audio.explosionBuffer);
        this.player.setTint(0xff0000);
        this.gameOverUI.setVisible(true);
        this.gameOverUI.getAt(1).setText(`${msg}`);

        const playerName = prompt("MISSION OVER! Enter your Call Sign:", "PILOT") || "UNKNOWN";
        this.submitScore(playerName, Math.floor(this.score));
    }

    async submitScore(name, score) {
        try {
            await fetch('/scores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, score })
            });
            this.fetchLeaderboard();
        } catch (e) {
            console.error("Score submission failed", e);
            this.leaderboardText.setText("OFFLINE MODE - SCORE LOCAL ONLY");
        }
    }

    async fetchLeaderboard() {
        try {
            const res = await fetch('/scores');
            const data = await res.json();
            let table = "--- GALACTIC ELITE ---\n\n";
            data.forEach((entry, i) => {
                table += `${i + 1}. ${entry.name.padEnd(10, '.')} ${entry.score}\n`;
            });
            this.leaderboardText.setText(table);
        } catch (e) {
            this.leaderboardText.setText("COULD NOT RETRIEVE LEADERBOARD");
        }
    }
}
