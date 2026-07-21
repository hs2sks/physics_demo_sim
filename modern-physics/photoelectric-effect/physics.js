// Vector2D Helper Class for Physics Math
class Vector2D {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    add(v) {
        return new Vector2D(this.x + v.x, this.y + v.y);
    }

    sub(v) {
        return new Vector2D(this.x - v.x, this.y - v.y);
    }

    mult(n) {
        return new Vector2D(this.x * n, this.y * n);
    }

    div(n) {
        return new Vector2D(this.x / n, this.y / n);
    }

    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    normalize() {
        const m = this.mag();
        if (m !== 0) {
            return this.div(m);
        }
        return new Vector2D(0, 0);
    }

    dist(v) {
        return Math.sqrt((this.x - v.x) ** 2 + (this.y - v.y) ** 2);
    }
}

// Global Physics Configuration & State
const Physics = {
    // Physical Constants
    h: 0.41357, // Planck's constant in eV * (10^-14 s), so E = h * f gives eV directly if f is in 10^14 Hz
    e: 1.0,     // Electron charge magnitude
    
    // User Controlled Variables
    frequency: 6.5,      // in 10^14 Hz
    intensity: 50,      // Light intensity percentage (0 to 100)
    workFunction: 2.14,  // in eV
    voltage: 0.0,        // External voltage in V (Tab 2 only)
    activeTab: 'basic',  // 'basic' or 'voltage'
    isPaused: false,

    // Simulation Constants
    c: 6,                // Visual speed of light (photons)
    electronBaseSpeed: 4,// Speed factor for electrons
    
    // Arrays of Active Entities
    photons: [],
    electrons: [],
    atoms: [],           // Metal lattice structure
    
    // Telemetry Outputs
    photonEnergy: 0,
    maxKineticEnergy: 0,
    stoppingPotential: 0,
    photocurrent: 0,     // Average number of electrons reaching collector per second
    collectedCount: 0,
    collectedHistory: [], // For averaging photocurrent
    
    // Canvas & Context references (initialized in gui.js)
    canvas: null,
    ctx: null,

    // Calculate all physics parameters
    updateFormulas() {
        this.photonEnergy = this.h * this.frequency;
        this.maxKineticEnergy = Math.max(0, this.photonEnergy - this.workFunction);
        this.stoppingPotential = this.maxKineticEnergy; // V_0 = K_max / e, since e = 1, numerically equal
    },

    // Convert frequency (10^14 Hz) to visible/UV light color with glowing RGB
    frequencyToColor(f) {
        // Frequency ranges from 3.5 to 12.0
        // Visible spectrum is roughly 4.0 (Red, 750nm) to 7.8 (Violet, 380nm)
        if (f < 4.0) {
            // Infrared (Dark Red)
            return { r: 150, g: 0, b: 0, label: 'IR' };
        } else if (f >= 4.0 && f < 4.8) {
            // Red
            const ratio = (f - 4.0) / 0.8;
            return { r: 255, g: Math.round(100 * ratio), b: 0, label: 'Red' };
        } else if (f >= 4.8 && f < 5.4) {
            // Yellow / Green-Yellow
            const ratio = (f - 4.8) / 0.6;
            return { r: Math.round(255 - 155 * ratio), g: 255, b: 0, label: 'Green-Yellow' };
        } else if (f >= 5.4 && f < 6.2) {
            // Green / Cyan-Green
            const ratio = (f - 5.4) / 0.8;
            return { r: 0, g: 255, b: Math.round(200 * ratio), label: 'Green' };
        } else if (f >= 6.2 && f < 7.0) {
            // Cyan / Blue
            const ratio = (f - 6.2) / 0.8;
            return { r: 0, g: Math.round(255 - 200 * ratio), b: 255, label: 'Blue' };
        } else if (f >= 7.0 && f < 7.8) {
            // Indigo / Violet
            const ratio = (f - 7.0) / 0.8;
            return { r: Math.round(150 * ratio), g: 0, b: 255, label: 'Violet' };
        } else {
            // UV (Ultraviolet) - Rendered as glowing neon violet-pink
            const ratio = Math.min(1, (f - 7.8) / 4.2);
            return { r: Math.round(150 + 105 * ratio), g: Math.round(50 * ratio), b: 255, label: 'UV' };
        }
    },

    // Format RGB color to CSS string
    colorToCSS(colorObj, opacity = 1) {
        return `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, ${opacity})`;
    },

    // Initialize metal lattice atoms
    initLattice() {
        this.atoms = [];
        const width = this.canvas.width;
        const height = this.canvas.height;

        if (this.activeTab === 'basic') {
            // Basic mode: metal is a horizontal block at the bottom
            const metalYStart = height - 90;
            const rows = 4;
            const cols = Math.floor(width / 30) + 2;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    // Stagger rows slightly for natural grid look
                    const offset = (r % 2) * 15;
                    this.atoms.push({
                        pos: new Vector2D(c * 30 - 15 + offset, metalYStart + r * 22 + 15),
                        radius: 8,
                        boundElectron: true // Each atom has a bound electron
                    });
                }
            }
        } else {
            // Voltage mode: metal is a vertical block on the left (Emitter)
            const emitterXStart = 70;
            const rows = Math.floor(height / 30) + 2;
            const cols = 2;
            for (let c = 0; c < cols; c++) {
                for (let r = 0; r < rows; r++) {
                    const offset = (c % 2) * 15;
                    this.atoms.push({
                        pos: new Vector2D(emitterXStart + c * 15 + 7, r * 30 - 15 + offset),
                        radius: 7,
                        boundElectron: true
                    });
                }
            }
        }
    },

    // Spawns a new photon from the light source
    spawnPhoton() {
        if (this.intensity === 0) return;

        // Scale spawn probability based on intensity
        const spawnChance = this.intensity / 100 * 0.15;
        if (Math.random() > spawnChance) return;

        const colorObj = this.frequencyToColor(this.frequency);
        const colorCSS = this.colorToCSS(colorObj, 0.85);

        if (this.activeTab === 'basic') {
            // Basic Mode: light shines from top-left to bottom-right
            const startX = Math.random() * (this.canvas.width * 0.7);
            const startY = -10;
            const angle = Math.PI / 3; // 60 degrees down-right
            
            this.photons.push({
                pos: new Vector2D(startX, startY),
                vel: new Vector2D(Math.cos(angle) * this.c, Math.sin(angle) * this.c),
                frequency: this.frequency,
                energy: this.photonEnergy,
                color: colorCSS,
                colorObj: colorObj,
                active: true
            });
        } else {
            // Voltage Mode: light shines from the external lamp (top-left) onto the Emitter plate (left)
            const startX = 25;
            const startY = 60;
            const targetY = 30 + Math.random() * (this.canvas.height - 60);
            const targetX = 85; // Emitter plate center
            
            const dir = new Vector2D(targetX - startX, targetY - startY).normalize();
            
            this.photons.push({
                pos: new Vector2D(startX, startY),
                vel: dir.mult(this.c),
                frequency: this.frequency,
                energy: this.photonEnergy,
                color: colorCSS,
                colorObj: colorObj,
                active: true
            });
        }
    },

    // Spawns a photoelectron from a collision position
    spawnElectron(collisionPos, isSurface) {
        this.updateFormulas();
        if (this.maxKineticEnergy <= 0) return;

        // Assign energy: surface electrons get maximum energy, deep electrons suffer collision loss
        let energy;
        let isMaxK = isSurface;
        
        if (isSurface) {
            energy = this.maxKineticEnergy;
        } else {
            // Deeper electrons lose 15% to 85% of energy due to random lattice collisions
            const lossFactor = 0.15 + Math.random() * 0.7;
            energy = this.maxKineticEnergy * (1 - lossFactor);
            // Some might not have enough energy to escape after losses
            if (energy < 0.05) return;
        }

        // Velocity magnitude is proportional to sqrt(energy)
        const speed = this.electronBaseSpeed * Math.sqrt(energy);
        let angle, vel;

        if (this.activeTab === 'basic') {
            // Basic mode: fly upwards with slightly random angles
            angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.6; // ~90 deg up +/- 17 deg
            vel = new Vector2D(Math.cos(angle) * speed, Math.sin(angle) * speed);
        } else {
            // Voltage mode: fly rightwards from Emitter to Collector
            angle = (Math.random() - 0.5) * 0.8; // ~0 deg right +/- 23 deg
            vel = new Vector2D(Math.cos(angle) * speed, Math.sin(angle) * speed);
        }

        this.electrons.push({
            pos: new Vector2D(collisionPos.x, collisionPos.y),
            vel: vel,
            initialK: energy,
            k: energy,
            isMaxK: isMaxK,
            active: true,
            state: isSurface ? 'free' : 'colliding',
            bounces: 0,
            path: [new Vector2D(collisionPos.x, collisionPos.y)] // Draw track trail
        });
    },

    // Core physics engine state update
    update() {
        if (this.isPaused) return;

        this.updateFormulas();
        this.spawnPhoton();

        // 1. Update Photons
        for (let i = this.photons.length - 1; i >= 0; i--) {
            const p = this.photons[i];
            p.pos = p.pos.add(p.vel);

            let hitMetal = false;

            if (this.activeTab === 'basic') {
                const metalY = this.canvas.height - 90;
                // Check if photon hits the metal surface
                if (p.pos.y >= metalY && p.pos.y <= this.canvas.height) {
                    hitMetal = true;
                }
            } else {
                const emitterRight = 100;
                // Check if photon hits the emitter plate
                if (p.pos.x >= 70 && p.pos.x <= emitterRight) {
                    hitMetal = true;
                }
            }

            if (hitMetal) {
                // Photon is absorbed
                p.active = false;
                
                // Photoelectric effect condition check: E >= Phi
                if (p.energy >= this.workFunction) {
                    // Decide whether it hits a surface atom or deep atom
                    // Basic: top row of atoms are surface, others are deep
                    const surfaceChance = 0.4;
                    const isSurface = Math.random() < surfaceChance;
                    
                    // Find a random target atom to trigger release animation
                    const candidates = this.atoms.filter(a => {
                        if (this.activeTab === 'basic') {
                            return isSurface ? (a.pos.y < this.canvas.height - 70) : (a.pos.y >= this.canvas.height - 70);
                        } else {
                            return isSurface ? (a.pos.x > 80) : (a.pos.x <= 80);
                        }
                    });

                    if (candidates.length > 0) {
                        const targetAtom = candidates[Math.floor(Math.random() * candidates.length)];
                        
                        // Spawn electron starting at that atom's position
                        this.spawnElectron(targetAtom.pos, isSurface);
                        
                        // Atom visual excitation
                        targetAtom.excited = 15; // Number of frames to draw excited glow
                    }
                } else {
                    // Under threshold: atoms just shake
                    this.atoms.forEach(a => {
                        if (p.pos.dist(a.pos) < 40) {
                            a.excited = 8; // Shake visual
                        }
                    });
                }
                this.photons.splice(i, 1);
            } else if (p.pos.x < -20 || p.pos.x > this.canvas.width + 20 || p.pos.y > this.canvas.height + 20) {
                // Out of bounds
                this.photons.splice(i, 1);
            }
        }

        // 2. Update Electrons
        const emitterRight = 100;
        const collectorLeft = this.canvas.width - 100;
        const d = collectorLeft - emitterRight; // Separation distance

        for (let i = this.electrons.length - 1; i >= 0; i--) {
            const e = this.electrons[i];

            // A. If electron is inside the metal lattice, handle collisions (Tab 1/Tab 2 general electrons)
            if (e.state === 'colliding') {
                // Apply small drag/collision interaction
                const collisionProbability = 0.08;
                if (Math.random() < collisionProbability && e.bounces < 2) {
                    // Collide with a random nearby atom
                    const nearbyAtoms = this.atoms.filter(a => a.pos.dist(e.pos) < 25);
                    if (nearbyAtoms.length > 0) {
                        const atom = nearbyAtoms[Math.floor(Math.random() * nearbyAtoms.length)];
                        // Deflect velocity and lose energy
                        const speed = e.vel.mag() * 0.7; // Lose 30% speed
                        const bounceAngle = Math.random() * Math.PI * 2;
                        e.vel = new Vector2D(Math.cos(bounceAngle) * speed, Math.sin(bounceAngle) * speed);
                        e.bounces++;
                        atom.excited = 8; // Excitation glow on collision
                    }
                }

                // Check if it has escaped the metal boundary
                let escaped = false;
                if (this.activeTab === 'basic') {
                    escaped = e.pos.y < this.canvas.height - 90;
                } else {
                    escaped = e.pos.x > emitterRight;
                }

                if (escaped) {
                    e.state = 'free';
                }
            }

            // B. Apply Electric Field Force if in Voltage Tab
            if (this.activeTab === 'voltage' && e.state === 'free') {
                // F = q * E = -e * (-V / d). Electron has negative charge q = -e.
                // In horizontal axis: Acceleration ax = e * V / d.
                // Let's normalize it to fit simulation canvas scales.
                // We want: if V = -K_max, the electron decelerates to 0 speed exactly at collectorLeft.
                // a = V_scale * V / d.
                // Let's calculate the exact acceleration:
                // Let initial horizontal velocity vx0. Horizontal kinetic energy K_x.
                // Work done: W = a * d.
                // To stop it at collectorLeft: 1/2 m vx0^2 = a * d => K_x = a * d.
                // Our speed mapping: speed = electronBaseSpeed * sqrt(K).
                // Let's set the acceleration factor to be completely physically consistent:
                // a_x = (speed_factor^2 * V) / (2 * d) = (16 * V) / (2 * d) = 8 * V / d.
                // So when V = -K, acceleration a_x will retard it exactly right!
                const ax = (32 * this.voltage) / (2 * d); // Acceleration factor calibrated
                e.vel.x += ax;

                // Limit maximum speeds
                const maxSpeed = 15;
                if (e.vel.mag() > maxSpeed) {
                    e.vel = e.vel.normalize().mult(maxSpeed);
                }
            }

            // C. Move the Electron
            e.pos = e.pos.add(e.vel);
            e.path.push(new Vector2D(e.pos.x, e.pos.y));
            if (e.path.length > 25) {
                e.path.shift();
            }

            // D. Handle Boundary Collisions / Collections
            let remove = false;

            if (this.activeTab === 'basic') {
                // If it goes off the screen, delete it
                if (e.pos.y < -10 || e.pos.x < -10 || e.pos.x > this.canvas.width + 10) {
                    remove = true;
                }
                // Re-enter metal plate from above? (gravity/attraction not modeled in Tab 1)
                if (e.pos.y > this.canvas.height) {
                    remove = true;
                }
            } else {
                // In Voltage Mode:
                // Check if it hits the Collector (right plate)
                if (e.pos.x >= collectorLeft) {
                    e.state = 'collected';
                    this.collectedCount++;
                    remove = true;
                }
                // Check if it gets pushed back and hits the Emitter (left plate)
                else if (e.pos.x <= emitterRight && e.vel.x < 0) {
                    // Reabsorbed by the metal
                    remove = true;
                }
                // Out of screen bounds
                else if (e.pos.y < -10 || e.pos.y > this.canvas.height + 10) {
                    remove = true;
                }
            }

            if (remove) {
                this.electrons.splice(i, 1);
            }
        }

        // 3. Atom visual glow animation decay
        this.atoms.forEach(a => {
            if (a.excited > 0) a.excited--;
        });

        // 4. Calculate photocurrent telemetry (Tab 2 only)
        if (this.activeTab === 'voltage') {
            this.collectedHistory.push(this.collectedCount);
            this.collectedCount = 0;
            // Keep past 60 frames (1 second at 60fps) for moving average
            if (this.collectedHistory.length > 60) {
                this.collectedHistory.shift();
            }
            const sum = this.collectedHistory.reduce((a, b) => a + b, 0);
            // photocurrent in scale units
            this.photocurrent = (sum / this.collectedHistory.length) * 60; // scale to "electrons per second"
        }
    },

    // Reset all simulation entities
    reset() {
        this.photons = [];
        this.electrons = [];
        this.collectedCount = 0;
        this.collectedHistory = [];
        this.photocurrent = 0;
        if (this.canvas) {
            this.initLattice();
        }
    },

    // Draw grid background and vacuum glass tube for UI
    drawBackground() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.fillStyle = '#040507';
        ctx.fillRect(0, 0, width, height);

        // Draw grid lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
        ctx.lineWidth = 1;
        const gridSize = 30;
        for (let x = 0; x < width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }

        if (this.activeTab === 'voltage') {
            // Draw vacuum tube envelope
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(50, 15, width - 100, height - 30, 25);
            ctx.stroke();

            // Glass specular highlights (semi-translucent diagonal gradients)
            const grad = ctx.createLinearGradient(50, 0, width - 50, height);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.03)');
            grad.addColorStop(0.3, 'rgba(255, 255, 255, 0.0)');
            grad.addColorStop(0.7, 'rgba(255, 255, 255, 0.0)');
            grad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(50, 15, width - 100, height - 30, 25);
            ctx.fill();

            // Draw Quartz Window on the left glass envelope (y in [40, 120])
            ctx.strokeStyle = 'rgba(0, 240, 255, 0.45)';
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(50, 40);
            ctx.lineTo(50, 120);
            ctx.stroke();

            // Quartz Window label tag
            ctx.font = '9px Inter';
            ctx.fillStyle = 'rgba(0, 240, 255, 0.65)';
            ctx.textAlign = 'left';
            ctx.fillText('석영창 (Quartz Window)', 58, 55);

            // Draw Electric Field Lines in the gap
            const emitterRight = 100;
            const collectorLeft = width - 100;
            if (Math.abs(this.voltage) > 0.05) {
                ctx.strokeStyle = this.voltage > 0 ? 'rgba(48, 209, 88, 0.08)' : 'rgba(255, 69, 58, 0.08)';
                ctx.lineWidth = 1.5;
                const lines = 6;
                const fieldDir = this.voltage > 0 ? -1 : 1; // voltage > 0, field points left (green)
                
                for (let i = 1; i < lines; i++) {
                    const y = (height / lines) * i;
                    ctx.beginPath();
                    ctx.moveTo(emitterRight + 10, y);
                    ctx.lineTo(collectorLeft - 10, y);
                    ctx.stroke();

                    // Draw field arrow heads in motion
                    const arrowSpacing = 60;
                    const offset = (Date.now() * 0.05 * fieldDir) % arrowSpacing;
                    
                    ctx.fillStyle = this.voltage > 0 ? 'rgba(48, 209, 88, 0.25)' : 'rgba(255, 69, 58, 0.25)';
                    for (let lx = emitterRight + 15; lx < collectorLeft - 15; lx += arrowSpacing) {
                        const ax = lx + offset;
                        if (ax > emitterRight + 10 && ax < collectorLeft - 10) {
                            ctx.beginPath();
                            ctx.moveTo(ax, y);
                            ctx.lineTo(ax - 5 * fieldDir, y - 3);
                            ctx.lineTo(ax - 5 * fieldDir, y + 3);
                            ctx.fill();
                        }
                    }
                }

                // Electric field strength indicator text overlay
                ctx.font = '10px Inter';
                ctx.fillStyle = this.voltage > 0 ? 'rgba(48, 209, 88, 0.6)' : 'rgba(255, 69, 58, 0.6)';
                ctx.textAlign = 'center';
                ctx.fillText(
                    `전기장: ${this.voltage > 0 ? '수집판 쪽으로 인력 (+)' : '방출판 쪽으로 척력 (-)'}`,
                    width / 2, 40
                );
            }
        }
    },

    // Draw entities onto the canvas
    draw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        this.drawBackground();

        // 1. Draw Plates
        if (this.activeTab === 'basic') {
            // Draw Emitter Target Metal Plate (Bottom)
            const metalY = height - 90;
            const grad = ctx.createLinearGradient(0, metalY, 0, height);
            grad.addColorStop(0, '#2d3748');
            grad.addColorStop(1, '#1a202c');
            ctx.fillStyle = grad;
            ctx.fillRect(0, metalY, width, 90);
            
            // Plate Border Shine
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, metalY);
            ctx.lineTo(width, metalY);
            ctx.stroke();

            // Label
            ctx.font = '12px Outfit';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.textAlign = 'left';
            ctx.fillText('금속판 (Target Metal Plate)', 20, metalY + 25);
            ctx.font = '11px Inter';
            ctx.fillText(`일함수 \u03A6 = ${this.workFunction.toFixed(2)} eV`, 20, metalY + 45);
        } else {
            // Voltage Mode:
            // A. Draw Emitter (Left Plate)
            const emitterGrad = ctx.createLinearGradient(70, 0, 100, 0);
            emitterGrad.addColorStop(0, '#1a202c');
            emitterGrad.addColorStop(0.8, '#2d3748');
            emitterGrad.addColorStop(1, '#4a5568');
            ctx.fillStyle = emitterGrad;
            ctx.beginPath();
            ctx.roundRect(70, 25, 30, height - 50, [5, 0, 0, 5]);
            ctx.fill();

            // Plate Border Shine
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(100, 25);
            ctx.lineTo(100, height - 25);
            ctx.stroke();

            // Emitter Label
            ctx.save();
            ctx.translate(85, height / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.font = '11px Outfit';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.textAlign = 'center';
            ctx.fillText('금속 방출판 (Emitter)', 0, 0);
            ctx.restore();

            // B. Draw Collector (Right Plate)
            const collectorGrad = ctx.createLinearGradient(width - 100, 0, width - 70, 0);
            collectorGrad.addColorStop(0, '#4a5568');
            collectorGrad.addColorStop(0.2, '#2d3748');
            collectorGrad.addColorStop(1, '#1a202c');
            ctx.fillStyle = collectorGrad;
            ctx.beginPath();
            ctx.roundRect(width - 100, 25, 30, height - 50, [0, 5, 5, 0]);
            ctx.fill();

            // Collector Border Shine
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(width - 100, 25);
            ctx.lineTo(width - 100, height - 25);
            ctx.stroke();

            // Collector Label
            ctx.save();
            ctx.translate(width - 85, height / 2);
            ctx.rotate(Math.PI / 2);
            ctx.font = '11px Outfit';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.textAlign = 'center';
            ctx.fillText('수집판 (Collector)', 0, 0);
            ctx.restore();

            // Draw Voltage source wire lines (visual connection)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(85, height - 25);
            ctx.lineTo(85, height - 10);
            ctx.lineTo(width - 85, height - 10);
            ctx.lineTo(width - 85, height - 25);
            ctx.stroke();

            // Visual Voltage indicator badge at the bottom wire
            ctx.fillStyle = '#0d1117';
            ctx.strokeStyle = this.voltage > 0 ? '#30d158' : (this.voltage < 0 ? '#ff453a' : 'rgba(255, 255, 255, 0.15)');
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(width / 2 - 40, height - 20, 80, 16, 8);
            ctx.fill();
            ctx.stroke();

            ctx.font = '10px Inter';
            ctx.fillStyle = this.voltage > 0 ? '#30d158' : (this.voltage < 0 ? '#ff453a' : 'var(--text-secondary)');
            ctx.textAlign = 'center';
            ctx.fillText(`${this.voltage.toFixed(2)} V`, width / 2, height - 8);

            // C. Draw External Light Source Casing (Lamp) & Light Cone
            const colorObj = this.frequencyToColor(this.frequency);
            const lightColor = this.colorToCSS(colorObj, 1);

            // Draw glowing light beam/cone from Lamp (25, 60) to Emitter Plate x=70
            if (this.intensity > 0) {
                const beamGrad = ctx.createLinearGradient(25, 60, 75, height / 2);
                beamGrad.addColorStop(0, this.colorToCSS(colorObj, 0.35));
                beamGrad.addColorStop(0.2, this.colorToCSS(colorObj, 0.2));
                beamGrad.addColorStop(1, this.colorToCSS(colorObj, 0.0));

                ctx.fillStyle = beamGrad;
                ctx.beginPath();
                ctx.moveTo(25, 50);
                ctx.lineTo(70, 20);
                ctx.lineTo(70, height - 20);
                ctx.lineTo(25, 70);
                ctx.closePath();
                ctx.fill();
            }

            // Draw Metallic Lamp body
            ctx.save();
            ctx.translate(15, 60);
            ctx.rotate(Math.PI / 6); // Angled down-right

            // Lamp base / mount
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(-15, -6, 8, 12);

            // Lamp shell
            const shellGrad = ctx.createLinearGradient(0, -10, 0, 10);
            shellGrad.addColorStop(0, '#475569');
            shellGrad.addColorStop(0.5, '#334155');
            shellGrad.addColorStop(1, '#1e293b');
            ctx.fillStyle = shellGrad;
            ctx.beginPath();
            ctx.roundRect(-8, -12, 24, 24, [4, 0, 0, 4]);
            ctx.fill();

            // Lamp emitter lens (glowing with current light frequency)
            ctx.fillStyle = this.intensity > 0 ? lightColor : '#1e293b';
            if (this.intensity > 0) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = lightColor;
            }
            ctx.fillRect(16, -10, 4, 20);
            ctx.shadowBlur = 0;

            ctx.restore();

            // Draw label
            ctx.font = '9px Inter';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.textAlign = 'center';
            ctx.fillText('외부 광원 (Lamp)', 25, 40);
        }

        // 2. Draw Metal Lattice Atoms (bound electrons visual representation)
        this.atoms.forEach(a => {
            let offset = new Vector2D(0, 0);
            // Shaking if excited
            if (a.excited > 0) {
                const shakeIntensity = this.photonEnergy < this.workFunction ? 1.5 : 2.5;
                offset = new Vector2D(
                    (Math.random() - 0.5) * shakeIntensity,
                    (Math.random() - 0.5) * shakeIntensity
                );
            }

            const drawPos = a.pos.add(offset);

            // Draw metal ions
            ctx.beginPath();
            ctx.arc(drawPos.x, drawPos.y, a.radius, 0, Math.PI * 2);
            
            if (a.excited > 0) {
                // Excited glow (color corresponds to incident light if escaping, red/yellow if under-limit shaking)
                if (this.photonEnergy >= this.workFunction) {
                    ctx.fillStyle = 'rgba(0, 240, 255, 0.4)';
                    ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
                } else {
                    ctx.fillStyle = 'rgba(255, 69, 58, 0.2)';
                    ctx.strokeStyle = 'rgba(255, 69, 58, 0.6)';
                }
            } else {
                // Idle state: dark metallic spheres
                ctx.fillStyle = '#1e293b';
                ctx.strokeStyle = '#334155';
            }
            ctx.lineWidth = 1.5;
            ctx.fill();
            ctx.stroke();

            // Draw bound electrons (only if they aren't knocked out, representing neutral bounds)
            if (a.boundElectron) {
                ctx.beginPath();
                ctx.arc(drawPos.x + 3, drawPos.y - 3, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#64748b';
                ctx.fill();
            }
        });

        // 3. Draw Photons
        for (let i = 0; i < this.photons.length; i++) {
            const p = this.photons[i];
            
            // Glowing trail effect
            ctx.shadowBlur = 10;
            ctx.shadowColor = p.color;

            // Draw photon body (small wave packet representation)
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2.5;
            ctx.beginPath();

            // Wave pattern relative to photon direction
            const pDir = p.vel.normalize();
            const pOrth = new Vector2D(-pDir.y, pDir.x);
            
            ctx.moveTo(p.pos.x - pDir.x * 12, p.pos.y - pDir.y * 12);
            for (let w = -12; w <= 12; w += 2) {
                const waveAmp = Math.sin(w * 0.7 + Date.now() * 0.15) * 4.5;
                const wx = p.pos.x + pDir.x * w + pOrth.x * waveAmp;
                const wy = p.pos.y + pDir.y * w + pOrth.y * waveAmp;
                if (w === -12) ctx.moveTo(wx, wy);
                else ctx.lineTo(wx, wy);
            }
            ctx.stroke();

            // Draw photon head (little bright dot)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p.pos.x + pDir.x * 12, p.pos.y + pDir.y * 12, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Clear shadow settings
            ctx.shadowBlur = 0;
        }

        // 4. Draw Electrons
        for (let i = 0; i < this.electrons.length; i++) {
            const e = this.electrons[i];

            // Draw fading trail path
            if (e.path.length > 1) {
                ctx.beginPath();
                ctx.moveTo(e.path[0].x, e.path[0].y);
                for (let k = 1; k < e.path.length; k++) {
                    ctx.lineTo(e.path[k].x, e.path[k].y);
                }
                const trailGrad = ctx.createLinearGradient(
                    e.path[0].x, e.path[0].y,
                    e.pos.x, e.pos.y
                );
                const colorHex = e.isMaxK ? 'rgba(0, 240, 255,' : 'rgba(255, 159, 10,';
                trailGrad.addColorStop(0, `${colorHex} 0.0)`);
                trailGrad.addColorStop(1, `${colorHex} 0.45)`);
                
                ctx.strokeStyle = trailGrad;
                ctx.lineWidth = e.isMaxK ? 3 : 2;
                ctx.stroke();
            }

            // Glow settings for active electron dot
            ctx.shadowBlur = 8;
            ctx.shadowColor = e.isMaxK ? 'var(--accent-blue)' : 'var(--accent-orange)';

            // Draw electron particle
            ctx.fillStyle = e.isMaxK ? '#ffffff' : '#ffd085';
            ctx.beginPath();
            ctx.arc(e.pos.x, e.pos.y, e.isMaxK ? 4.5 : 3.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = e.isMaxK ? 'var(--accent-blue)' : 'var(--accent-orange)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Visual Label on electrons (K_max tag on the fastest ones, occasionally)
            if (e.isMaxK && e.pos.x > 80 && e.pos.x < 150) {
                ctx.shadowBlur = 0;
                ctx.font = '9px Outfit';
                ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
                ctx.textAlign = 'center';
                ctx.fillText('K max', e.pos.x, e.pos.y - 10);
            }

            // Reset shadow
            ctx.shadowBlur = 0;
        }
    }
};
