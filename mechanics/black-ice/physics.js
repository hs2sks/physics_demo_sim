// R&E High School Science Lab Physics Engine
class Vector2D {
    constructor(x, y) {
        this.x = x || 0;
        this.y = y || 0;
    }
    add(v) {
        return new Vector2D(this.x + v.x, this.y + v.y);
    }
}

const Physics = {
    // Physical Constant
    g: 9.81,

    // Active Lab Tab Selection
    activeLab: 'runoff', // 'runoff', 'friction', 'freezer', 'acoustic'
    isPaused: false,
    isExperimentRunning: false,
    experimentTime: 0.0,
    selectedSensorTrack: 3, // Default to D. Leaf-vein (0=Flat, 1=Long, 2=Trans, 3=Leaf)

    // Control Variables (Lab inputs)
    slope: 5.0,             // Slope angle in degrees (Lab 1)
    waterVolume: 50.0,      // Injected water volume in mL (Lab 1)
    roadCondition: 'frozen',// 'dry', 'wet', 'frozen' (Lab 2)
    carWeight: 150.0,       // Added weight in grams (Lab 2)
    freezerTemp: -5.0,      // Temperature in °C (Lab 3)
    sprayCount: 15.0,       // Spray count in times (Lab 3)
    entryHeight: 25.0,      // Release height in cm (Lab 4)

    // Simulation Entities (4 tracks parallel)
    cars: [],               // Toy cars [4 lanes]
    cylinders: [],          // Cylinder drainage collection status (mL) [4 lanes]
    trackWater: [],         // Active surface water film heights [4 lanes]
    trackIce: [],           // Ice thickness progress [4 lanes]
    skidDistance: [0,0,0,0],// Final stopping skid marks in cm [4 lanes]
    calculatedMu: [0,0,0,0],// Derived friction coefficient mu [4 lanes]
    freezingStarts: [0,0,0,0], // Time when ice begins to form (min) [4 lanes]
    freezingCompletes: [0,0,0,0], // Time when fully frozen (min) [4 lanes]
    acousticNoise: [0,0,0,0], // Peak decibel values recorded [4 lanes]
    vibeGForce: [0,0,0,0],   // Vibration amplitude in Gs [4 lanes]

    // Particle Systems
    waterParticles: [],     // Blue water droplets flowing in grooves
    vibeHistory: [],        // Wave history for smartphone display
    skidParticles: [],      // Tire smoke particles

    // Canvas settings
    canvas: null,
    ctx: null,

    // Define lanes coordinates
    getLaneY(index) {
        const laneHeight = this.canvas.height / 4;
        return laneHeight * index + laneHeight / 2;
    },

    // Setup initial conditions for the chosen experiment
    initLab() {
        if (!this.canvas) return;

        const width = this.canvas.width;
        this.experimentTime = 0.0;
        this.isExperimentRunning = false;
        this.waterParticles = [];
        this.vibeHistory = [];
        this.skidParticles = [];

        // 1. Initialize Toy Cars
        this.cars = [];
        for (let i = 0; i < 4; i++) {
            this.cars.push({
                x: 20,                // starts at top of entry ramp
                y: this.getLaneY(i),
                speed: 0.0,
                active: false,
                finished: false,
                skidMarks: []
            });
        }

        // 2. Initialize Drainage cylinders
        this.cylinders = [0.0, 0.0, 0.0, 0.0];

        // 3. Initialize Water & Ice profiles
        this.trackWater = [0.0, 0.0, 0.0, 0.0];
        this.trackIce = [0.0, 0.0, 0.0, 0.0];
        this.skidDistance = [0.0, 0.0, 0.0, 0.0];
        this.calculatedMu = [0.0, 0.0, 0.0, 0.0];
        this.freezingStarts = [0.0, 0.0, 0.0, 0.0];
        this.freezingCompletes = [0.0, 0.0, 0.0, 0.0];
        this.acousticNoise = [0.0, 0.0, 0.0, 0.0];
        this.vibeGForce = [0.0, 0.0, 0.0, 0.0];

        // Hide overlay by default
        document.getElementById('freezer-frost-overlay').style.opacity = 0;
    },

    // Triggered when user clicks "RUN"
    runExperiment() {
        this.initLab();
        this.isExperimentRunning = true;

        if (this.activeLab === 'freezer') {
            // Fades in the freezer frost overlay
            document.getElementById('freezer-frost-overlay').style.opacity = 0.8;
        }
    },

    // Reset simulator
    reset() {
        this.initLab();
    },

    // Sample friction coefficient dynamically based on road conditions & weight
    getFrictionForTrack(trackIndex) {
        const cond = this.roadCondition;
        // Added weight slightly increases normal force but decreases skid distance slightly due to kinetic energy.
        // We model friction coefficient slightly decreasing under high pressure/weight (real rubber tire physics)
        const weightFactor = 1.0 - (this.carWeight - 150) * 0.0003;

        let baseMu = 0.85; // dry asphalt

        if (cond === 'wet') {
            if (trackIndex === 0) baseMu = 0.48;      // Flat (aquaplaning)
            else if (trackIndex === 1) baseMu = 0.62; // Longitudinal
            else if (trackIndex === 2) baseMu = 0.68; // Transverse
            else if (trackIndex === 3) baseMu = 0.76; // Leaf-vein (dendritic capillary drainage)
        } else if (cond === 'frozen') {
            if (trackIndex === 0) baseMu = 0.08;      // Flat (smooth ice slide)
            else if (trackIndex === 1) baseMu = 0.15; // Longitudinal (minor interlocking)
            else if (trackIndex === 2) baseMu = 0.33; // Transverse (strong perpendicular rib interlocking)
            else if (trackIndex === 3) baseMu = 0.26; // Leaf-vein (multi-directional rib grip)
        }

        return baseMu * weightFactor;
    },

    // Main frame loop physics update
    update() {
        if (this.isPaused || !this.isExperimentRunning) return;

        const width = this.canvas.width;
        const rampEndX = 100;
        const trackEndX = width - 100;
        const dt = 0.016; // 60 FPS delta
        this.experimentTime += dt;

        // ----------------------------------------------------
        // [LAB 1: Water Runoff Lab Update]
        // ----------------------------------------------------
        if (this.activeLab === 'runoff') {
            // Drainage scale changes with slope
            const slopeCoeff = 1.0 + (this.slope - 5.0) * 0.15;
            
            // Flow speeds for water droplets
            const flowSpeeds = [
                0.8 * slopeCoeff,  // Flat (slow pool drainage)
                2.2 * slopeCoeff,  // Longitudinal (fast along grooves)
                1.4 * slopeCoeff,  // Transverse (drains out to borders)
                2.8 * slopeCoeff   // Leaf-vein (diagonal wicking w/ Laplace pressure)
            ];

            // Target volume collected at end (mL)
            const targetVolumes = [
                this.waterVolume * 0.15, // Flat drains 15%
                this.waterVolume * 0.55, // Longitudinal drains 55%
                this.waterVolume * 0.35, // Transverse drains 35%
                this.waterVolume * 0.85  // Leaf-vein drains 85%
            ];

            // Spawn water droplets on tracks
            if (this.experimentTime < 3.0 && Math.random() < 0.6) {
                for (let i = 0; i < 4; i++) {
                    const sx = rampEndX + Math.random() * (trackEndX - rampEndX - 20);
                    let sy = this.getLaneY(i);
                    this.waterParticles.push({
                        lane: i,
                        pos: new Vector2D(sx, sy),
                        life: 1.0,
                        speed: flowSpeeds[i]
                    });
                }
            }

            // Update water droplets flow & accumulate in cylinders
            for (let i = this.waterParticles.length - 1; i >= 0; i--) {
                const p = this.waterParticles[i];
                const roadY = this.getLaneY(p.lane);
                
                if (p.lane === 0) {
                    // Flat: horizontal slow flow
                    p.pos.x += p.speed;
                } else if (p.lane === 1) {
                    // Longitudinal: straight horizontal drainage
                    p.pos.x += p.speed;
                } else if (p.lane === 2) {
                    // Transverse: flows vertically outwards
                    const dir = p.pos.y > roadY ? 1.0 : -1.0;
                    p.pos.y += dir * p.speed * 0.8;
                    p.pos.x += p.speed * 0.2; // slight gravity pull
                } else if (p.lane === 3) {
                    // Leaf-vein: diagonal branching chevron flow
                    const dir = p.pos.y > roadY ? 1.0 : -1.0;
                    p.pos.x += p.speed * 0.8;
                    p.pos.y += dir * p.speed * 0.5;
                }

                // Decay particle life
                p.life -= 0.005;

                // Check if droplet exits track into cylinder
                if (p.pos.x >= trackEndX) {
                    // Add volume fraction to cylinder
                    const addVolume = (targetVolumes[p.lane] / 120); // fill speed factor
                    if (this.cylinders[p.lane] < targetVolumes[p.lane]) {
                        this.cylinders[p.lane] += addVolume;
                    }
                    this.waterParticles.splice(i, 1);
                } else if (p.life <= 0 || p.pos.y < roadY - 18 || p.pos.y > roadY + 18) {
                    // Stagnated or fell off side boundaries
                    this.waterParticles.splice(i, 1);
                }
            }

            // Stop condition when runoff finished
            if (this.experimentTime >= 6.0) {
                this.isExperimentRunning = false;
                for (let i = 0; i < 4; i++) {
                    this.cylinders[i] = targetVolumes[i]; // Snap to exact volume
                }
            }
        }

        // ----------------------------------------------------
        // [LAB 2: Toy Car Friction Lab Update]
        // ----------------------------------------------------
        if (this.activeLab === 'friction') {
            let activeCars = 0;
            const entryVelocity = 14.5; // constant speed entering track
            const scale = (trackEndX - rampEndX) / 50.0; // 50cm track scale

            for (let i = 0; i < 4; i++) {
                const car = this.cars[i];
                if (car.finished) continue;
                activeCars++;

                if (car.x < rampEndX) {
                    // 1. Ramp acceleration phase
                    car.speed += 8.0 * dt; // gravity acceleration down ramp
                    car.x += car.speed;
                    if (car.x >= rampEndX) {
                        car.x = rampEndX;
                        car.speed = entryVelocity;
                    }
                } else {
                    // 2. Plaster track deceleration phase (Locked wheels)
                    const mu = this.getFrictionForTrack(i);
                    this.calculatedMu[i] = mu;
                    const decel = mu * this.g; // a = mu * g
                    
                    car.speed -= decel * dt * 3.5; // physics time scale factor
                    if (car.speed < 0) car.speed = 0;

                    const stepDist = car.speed * dt * scale * 3.5;
                    car.x += stepDist;

                    // Skid marks and smoke
                    if (car.speed > 0.5) {
                        car.skidMarks.push(car.x);
                        if (Math.random() < 0.25) {
                            this.skidParticles.push({
                                x: car.x - 8,
                                y: car.y + (Math.random() - 0.5) * 6,
                                size: 2 + Math.random() * 4,
                                life: 1.0
                            });
                        }
                    }

                    // Stop check
                    if (car.speed <= 0.05) {
                        car.speed = 0;
                        car.finished = true;
                        
                        // Distance in cm: (carX - rampEndX) / scale
                        this.skidDistance[i] = (car.x - rampEndX) / scale;
                    }
                }

                // Crash check
                if (car.x >= trackEndX) {
                    car.x = trackEndX;
                    car.speed = 0;
                    car.finished = true;
                    this.skidDistance[i] = 50.0; // Maximum skid length is 50cm
                }
            }

            // Update skid smoke particles
            for (let i = this.skidParticles.length - 1; i >= 0; i--) {
                const sp = this.skidParticles[i];
                sp.life -= 0.03;
                if (sp.life <= 0) this.skidParticles.splice(i, 1);
            }

            if (activeCars === 0) {
                this.isExperimentRunning = false;
            }
        }

        // ----------------------------------------------------
        // [LAB 3: Freezer Ice Delay Lab Update]
        // ----------------------------------------------------
        if (this.activeLab === 'freezer') {
            // Freezer temp scales cooling speed
            const tempCoeff = 1.0 + (Math.abs(this.freezerTemp) - 5.0) * 0.06;
            // More water spray delays freezing
            const sprayCoeff = 1.0 - (this.sprayCount - 15.0) * 0.02;

            // Ice growth rates (Flat freezes first, Leaf-vein is delayed most)
            // Starts: flat (15m), longitudinal (28m), transverse (35m), leaf (52m)
            const freezeStartsMinutes = [
                15.0 / (tempCoeff * sprayCoeff),
                28.0 / (tempCoeff * sprayCoeff),
                35.0 / (tempCoeff * sprayCoeff),
                52.0 / (tempCoeff * sprayCoeff)
            ];

            const freezeCompletesMinutes = [
                25.0 / (tempCoeff * sprayCoeff),
                45.0 / (tempCoeff * sprayCoeff),
                55.0 / (tempCoeff * sprayCoeff),
                78.0 / (tempCoeff * sprayCoeff)
            ];

            // 1. Update freezing timer (accelerated: 1 second physical = 12 minutes freezer time)
            const freezerMinutes = this.experimentTime * 12.0;

            for (let i = 0; i < 4; i++) {
                if (freezerMinutes >= freezeStartsMinutes[i]) {
                    this.freezingStarts[i] = freezeStartsMinutes[i];
                    
                    // Linear interpolation for ice thickness
                    const totalTime = freezeCompletesMinutes[i] - freezeStartsMinutes[i];
                    const elapsed = freezerMinutes - freezeStartsMinutes[i];
                    let iceProgress = elapsed / totalTime;
                    if (iceProgress > 1.0) {
                        iceProgress = 1.0;
                        this.freezingCompletes[i] = freezeCompletesMinutes[i];
                    }
                    this.trackIce[i] = iceProgress;
                }
            }

            // Stop freezer lab at 90 simulated minutes
            if (freezerMinutes >= 90.0) {
                this.isExperimentRunning = false;
                for (let i = 0; i < 4; i++) {
                    this.freezingStarts[i] = freezeStartsMinutes[i];
                    this.freezingCompletes[i] = freezeCompletesMinutes[i];
                    this.trackIce[i] = 1.0;
                }
            }
        }

        // ----------------------------------------------------
        // [LAB 4: Acoustic & Vibration Lab Update]
        // ----------------------------------------------------
        if (this.activeLab === 'acoustic') {
            // Speed depends on entryHeight (v = sqrt(2gh))
            const entryVel = Math.sqrt(2 * this.g * (this.entryHeight / 100)) * 10;
            const car = this.cars[this.selectedSensorTrack];
            
            // Peak decibels & vibration values
            const peakDbs = [58.2, 64.5, 82.8, 68.0];
            const maxVibes = [0.05, 0.15, 0.85, 0.25];

            // Drive active sensor car across the board
            if (car.x < trackEndX) {
                car.speed = entryVel;
                car.x += car.speed * 0.28; // speed scale

                // Generate real-time sine wave vibration and noise decibels when on plaster track
                if (car.x >= rampEndX && car.x < trackEndX - 10) {
                    let waveVal = 0.0;
                    
                    if (this.selectedSensorTrack === 0) {
                        // Flat: very small noise, smooth baseline
                        waveVal = (Math.random() - 0.5) * 2;
                        this.acousticNoise[0] = peakDbs[0] + (Math.random() - 0.5) * 1.5;
                        this.vibeGForce[0] = maxVibes[0] + (Math.random() - 0.5) * 0.01;
                    } else if (this.selectedSensorTrack === 1) {
                        // Longitudinal: minor hum
                        waveVal = Math.sin(car.x * 0.25) * 5 + (Math.random() - 0.5) * 2;
                        this.acousticNoise[1] = peakDbs[1] + (Math.random() - 0.5) * 1.5;
                        this.vibeGForce[1] = maxVibes[1] + (Math.random() - 0.5) * 0.02;
                    } else if (this.selectedSensorTrack === 2) {
                        // Transverse: heavy vertical hammer resonance (peaky spikes)
                        waveVal = Math.sin(car.x * 0.85) * 35 + (Math.random() - 0.5) * 6;
                        if (Math.abs(waveVal) > 30) waveVal *= 1.2; // spike exaggeration
                        this.acousticNoise[2] = peakDbs[2] + (Math.random() - 0.5) * 2.0;
                        this.vibeGForce[2] = maxVibes[2] + (Math.random() - 0.5) * 0.05;
                    } else if (this.selectedSensorTrack === 3) {
                        // Leaf-vein: diagonal veins distribute hits, smoother sine wave
                        waveVal = Math.sin(car.x * 0.45) * 12 + (Math.random() - 0.5) * 3;
                        this.acousticNoise[3] = peakDbs[3] + (Math.random() - 0.5) * 1.5;
                        this.vibeGForce[3] = maxVibes[3] + (Math.random() - 0.5) * 0.03;
                    }

                    // Feed wave history to smartphone display
                    this.vibeHistory.push(waveVal);
                    if (this.vibeHistory.length > 50) {
                        this.vibeHistory.shift();
                    }
                }
            } else {
                car.x = trackEndX;
                car.speed = 0;
                this.isExperimentRunning = false;
            }
        }
    },

    // Visual road rendering function
    drawRoad(ctx, width, height) {
        const laneHeight = height / 4;
        const rampEndX = 100;
        const trackEndX = width - 100;

        for (let i = 0; i < 4; i++) {
            const laneY = this.getLaneY(i);
            const ry = laneY - 20;

            // 1. Draw starting entry ramp (Slope)
            ctx.fillStyle = '#334155'; // steel gray ramp
            ctx.beginPath();
            ctx.moveTo(0, ry + 5);
            ctx.lineTo(rampEndX, ry + 20);
            ctx.lineTo(rampEndX, ry + 22);
            ctx.lineTo(0, ry + 22);
            ctx.closePath();
            ctx.fill();

            // Draw ramp supports
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 2.0;
            ctx.beginPath();
            ctx.moveTo(30, ry + 10);
            ctx.lineTo(30, ry + 22);
            ctx.moveTo(70, ry + 15);
            ctx.lineTo(70, ry + 22);
            ctx.stroke();

            // 2. Draw Plaster Test Track pavement
            ctx.fillStyle = '#d1d5db'; // light plaster gray texture
            ctx.fillRect(rampEndX, ry, trackEndX - rampEndX, 36);

            // Side border guides
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(rampEndX, ry);
            ctx.lineTo(trackEndX, ry);
            ctx.moveTo(rampEndX, ry + 36);
            ctx.lineTo(trackEndX, ry + 36);
            ctx.stroke();

            // 3. Draw Grooving Patterns on plaster road surface
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
            ctx.lineWidth = 1.2;

            if (i === 1) {
                // Longitudinal Grooves: horizontal straight lines
                for (let gy = ry + 6; gy < ry + 36; gy += 6) {
                    ctx.beginPath();
                    ctx.moveTo(rampEndX, gy);
                    ctx.lineTo(trackEndX, gy);
                    ctx.stroke();
                }
            } else if (i === 2) {
                // Transverse Grooves: vertical straight lines
                for (let gx = rampEndX + 10; gx < trackEndX; gx += 12) {
                    ctx.beginPath();
                    ctx.moveTo(gx, ry);
                    ctx.lineTo(gx, ry + 36);
                    ctx.stroke();
                }
            } else if (i === 3) {
                // Biomimetic Leaf-vein Chevrons
                for (let gx = rampEndX + 15; gx < trackEndX; gx += 16) {
                    ctx.beginPath();
                    ctx.moveTo(gx, laneY);
                    ctx.lineTo(gx - 10, ry + 2);
                    ctx.moveTo(gx, laneY);
                    ctx.lineTo(gx - 10, ry + 34);
                    ctx.stroke();
                }
            }

            // 4. Draw drainage collection cylinders (Lab 1) or target markers
            if (this.activeLab === 'runoff') {
                const cx = trackEndX + 40;
                // Draw measuring cup glass borders
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.lineWidth = 2.0;
                ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
                ctx.beginPath();
                ctx.moveTo(cx - 15, ry - 4);
                ctx.lineTo(cx - 15, ry + 32);
                ctx.lineTo(cx + 15, ry + 32);
                ctx.lineTo(cx + 15, ry - 4);
                ctx.stroke();
                ctx.fill();

                // Fills cup with blue liquid collected
                const fillHeight = 36 * (this.cylinders[i] / this.waterVolume); // map capacity
                ctx.fillStyle = 'rgba(0, 240, 255, 0.65)'; // dyed blue water
                ctx.fillRect(cx - 13, ry + 30 - fillHeight, 26, fillHeight);

                // Graduated marks on cylinder
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1.0;
                for (let m = ry; m < ry + 32; m += 8) {
                    ctx.beginPath();
                    ctx.moveTo(cx - 15, m);
                    ctx.lineTo(cx - 10, m);
                    ctx.stroke();
                }
            } else if (this.activeLab === 'friction') {
                // Draw yellow tape measure scale under tracks
                ctx.fillStyle = '#eab308'; // yellow ruler background
                ctx.fillRect(rampEndX, ry + 36, trackEndX - rampEndX, 4);

                ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.font = '8px Share Tech Mono';
                ctx.textAlign = 'center';
                
                // Draw ruler markings every 10cm (5 steps)
                const scale = (trackEndX - rampEndX) / 50.0;
                for (let cm = 0; cm <= 50; cm += 10) {
                    const rx = rampEndX + cm * scale;
                    ctx.fillStyle = '#eab308';
                    ctx.fillRect(rx - 0.5, ry + 36, 1, 6);
                    
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                    ctx.fillText(`${cm}cm`, rx, ry + 46);
                }
            } else if (this.activeLab === 'freezer') {
                // Draw frosty ice overlay inside the tracks
                if (this.trackIce[i] > 0.05) {
                    ctx.fillStyle = `rgba(200, 240, 255, ${0.15 + this.trackIce[i] * 0.35})`;
                    ctx.fillRect(rampEndX, ry, trackEndX - rampEndX, 36);

                    // Draw freeze crystal sparkles
                    ctx.fillStyle = '#fff';
                    for (let x = rampEndX + 20; x < trackEndX; x += 60) {
                        if (x % (i + 2) === 0) {
                            ctx.fillRect(x + Math.sin(x) * 10, ry + 12 + Math.cos(x) * 6, 2, 2);
                        }
                    }
                }
            }

            // Labels of tracks on left
            ctx.fillStyle = '#f8fafc';
            ctx.font = 'bold 11px Outfit';
            ctx.textAlign = 'left';
            const labelNames = ['A. 평면 노면 (Flat)', 'B. 종방향 홈 (Long)', 'C. 횡방향 홈 (Trans)', 'D. 나뭇잎 홈 (Leaf)'];
            ctx.fillText(labelNames[i], 12, ry - 6);
        }
    },

    // Draw main simulator viewport entities
    draw() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;
        const laneHeight = height / 4;
        const rampEndX = 100;
        const trackEndX = width - 100;

        ctx.fillStyle = '#06090e';
        ctx.fillRect(0, 0, width, height);

        // 1. Draw Road and structures
        this.drawRoad(ctx, width, height);

        // 2. Draw Skid smoke particles (Lab 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        this.skidParticles.forEach(sp => {
            ctx.save();
            ctx.globalAlpha = sp.life;
            ctx.beginPath();
            ctx.arc(sp.x, sp.y, sp.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // 3. Draw Water Runoff Droplets (Lab 1)
        if (this.activeLab === 'runoff') {
            ctx.fillStyle = '#38bdf8'; // blue water droplet color
            for (let i = 0; i < this.waterParticles.length; i++) {
                const p = this.waterParticles[i];
                ctx.save();
                ctx.globalAlpha = p.life * 0.8;
                ctx.beginPath();
                ctx.arc(p.pos.x, p.pos.y, 2.0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // 4. Draw Toy Cars (Lab 2 and Lab 4)
        if (this.activeLab === 'friction' || this.activeLab === 'acoustic') {
            const drawCount = this.activeLab === 'acoustic' ? 1 : 4;
            const targetTracks = this.activeLab === 'acoustic' ? [this.selectedSensorTrack] : [0, 1, 2, 3];

            targetTracks.forEach(i => {
                const car = this.cars[i];
                ctx.save();
                
                // Set visual alignment orientation
                ctx.translate(car.x, car.y);

                // Car body (colorful plastic toy cars theme)
                const bodyColors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981']; // Red, Yellow, Blue, Green
                ctx.fillStyle = bodyColors[i];
                ctx.beginPath();
                
                // Safe fallback for rounded rectangle
                if (ctx.roundRect) {
                    ctx.roundRect(-10, -5, 20, 10, 2);
                } else {
                    ctx.rect(-10, -5, 20, 10);
                }
                ctx.fill();

                // Black rubber wheels
                ctx.fillStyle = '#000';
                ctx.fillRect(-8, -6, 4, 1);
                ctx.fillRect(4, -6, 4, 1);
                ctx.fillRect(-8, 5, 4, 1);
                ctx.fillRect(4, 5, 4, 1);

                // Plastic windshield
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, -3, 3, 6);

                ctx.restore();

                // Draw G-sensor badge if in Lab 4
                if (this.activeLab === 'acoustic' && this.isExperimentRunning && car.x > rampEndX) {
                    ctx.font = 'bold 9px Share Tech Mono';
                    ctx.fillStyle = '#30d158'; // green sensor badge
                    ctx.textAlign = 'center';
                    ctx.fillText('📱 SENSOR ACTIVE', car.x, car.y - 12);
                }
            });
        }
    }
};
