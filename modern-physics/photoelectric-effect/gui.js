// User Interface Controller and Canvas Loop
document.addEventListener('DOMContentLoaded', () => {
    // 1. DOM Elements
    const canvas = document.getElementById('physics-canvas');
    
    // Sliders
    const inputFrequency = document.getElementById('input-frequency');
    const inputIntensity = document.getElementById('input-intensity');
    const inputWorkFunction = document.getElementById('input-workfunction');
    const inputVoltage = document.getElementById('input-voltage');

    // Values labels
    const valFrequency = document.getElementById('val-frequency');
    const valIntensity = document.getElementById('val-intensity');
    const valWorkFunction = document.getElementById('val-workfunction');
    const valVoltage = document.getElementById('val-voltage');

    // Formula elements
    const valPhotonEnergy = document.getElementById('val-photon-energy');
    const valWorkFunctionEv = document.getElementById('val-work-function-ev');
    const valMaxEnergy = document.getElementById('val-max-energy');
    const valStoppingPotential = document.getElementById('val-stopping-potential');
    const rowStoppingPotential = document.getElementById('row-stopping-potential');
    const rowMaxEnergy = document.getElementById('row-max-energy');

    // Control groups & sections
    const voltageControlSection = document.getElementById('voltage-control-section');
    const graphSection = document.getElementById('graph-section');
    const btnPlayPause = document.getElementById('btn-play-pause');
    const btnReset = document.getElementById('btn-reset');
    const emissionStatus = document.getElementById('emission-status');
    const explanationText = document.getElementById('explanation-text');

    // Tab buttons & comparison cards
    const tabButtons = document.querySelectorAll('.tab-btn');
    const comparisonCards = document.querySelectorAll('.comparison-card');
    const presetButtons = document.querySelectorAll('.btn-preset');

    // SVG graph elements
    const ivCurvePath = document.getElementById('iv-curve-path');
    const ivCurrentPoint = document.getElementById('iv-current-point');

    // 2. Setup Canvas context and dimensions
    const ctx = canvas.getContext('2d');
    Physics.canvas = canvas;
    Physics.ctx = ctx;

    function resizeCanvas() {
        // Handle High-DPI displays for crisp rendering
        const rect = canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;
        
        ctx.scale(dpr, dpr);
        
        // Reinitialize lattice atoms to match new sizes
        Physics.initLattice();
    }

    // Wait a bit to ensure container has dimensions
    setTimeout(resizeCanvas, 50);
    window.addEventListener('resize', resizeCanvas);

    // 3. Helper: Update Slider & Label values
    function updateUIValues() {
        Physics.updateFormulas();

        // Update control labels
        valFrequency.innerHTML = `${Physics.frequency.toFixed(2)} &times; 10<sup>14</sup> Hz`;
        valIntensity.textContent = `${Physics.intensity}%`;
        valWorkFunction.textContent = `${Physics.workFunction.toFixed(2)} eV`;
        valVoltage.textContent = `${Physics.voltage.toFixed(2)} V`;

        // Update Math display
        valPhotonEnergy.textContent = `${Physics.photonEnergy.toFixed(2)} eV`;
        valWorkFunctionEv.textContent = `${Physics.workFunction.toFixed(2)} eV`;
        
        if (Physics.photonEnergy >= Physics.workFunction) {
            valMaxEnergy.textContent = `${Physics.maxKineticEnergy.toFixed(2)} eV`;
            rowMaxEnergy.classList.remove('negative');
        } else {
            valMaxEnergy.textContent = `0.00 eV (방출 안 됨)`;
            rowMaxEnergy.classList.add('negative');
        }
        valStoppingPotential.textContent = `${Physics.stoppingPotential.toFixed(2)} V`;

        // Emission Status overlay text on Canvas
        if (Physics.photonEnergy >= Physics.workFunction && Physics.intensity > 0) {
            emissionStatus.textContent = `광전자 방출 중 (f \u2265 f\u2080)`;
            emissionStatus.className = 'canvas-overlay success';
        } else if (Physics.intensity === 0) {
            emissionStatus.textContent = '광원이 꺼져 있습니다';
            emissionStatus.className = 'canvas-overlay';
        } else {
            emissionStatus.textContent = `전자가 방출되지 않는 상태 (f < f\u2080)`;
            emissionStatus.className = 'canvas-overlay';
        }

        // Handle Comparison Cards active highlighting
        // If intensity changed, highlight card-intensity. If frequency changed or f < f_0, highlight card-frequency.
        // We'll calculate which one to highlight based on user interaction states
        updateComparisonHighlights();

        // Update Scientific explanations box
        updateExplanationBox();

        // Update I-V curve SVG graph if in voltage tab
        if (Physics.activeTab === 'voltage') {
            drawIVGraph();
        }
    }

    // 4. Comparison Cards Highlighting Logic
    let lastModifiedInput = 'frequency'; // tracks whether user is tweaking intensity or frequency/workfunction
    
    function updateComparisonHighlights() {
        comparisonCards.forEach(card => card.classList.remove('highlighted'));
        
        if (Physics.photonEnergy < Physics.workFunction) {
            // Under threshold: frequency is the absolute deciding factor
            document.getElementById('card-frequency').classList.add('highlighted');
        } else if (lastModifiedInput === 'intensity') {
            document.getElementById('card-intensity').classList.add('highlighted');
        } else {
            document.getElementById('card-frequency').classList.add('highlighted');
        }
    }

    // 5. Dynamic Scientific Explanations Builder (in Korean)
    function updateExplanationBox() {
        let text = '';
        if (Physics.activeTab === 'basic') {
            if (Physics.intensity === 0) {
                text = '광원의 세기가 0%입니다. 빛이 없으므로 금속에 에너지가 전달되지 않으며 어떤 반응도 일어나지 않습니다.';
            } else if (Physics.photonEnergy < Physics.workFunction) {
                text = `<strong>한계 진동수 미달 (f < f₀):</strong><br>
                        빛의 진동수가 낮아 광자 1개의 에너지(${Physics.photonEnergy.toFixed(2)} eV)가 금속의 일함수(${Physics.workFunction.toFixed(2)} eV)보다 작습니다. 
                        빛의 세기를 아무리 세게 조절해 광자의 개수를 늘려도, 전자는 광자 1개와만 1:1로 상호작용하므로 에너지가 누적되지 않아 단 하나의 전지도 탈출하지 못합니다. 
                        이는 빛이 연속적인 파동이 아닌 양자화된 입자(광자)라는 강력한 증거입니다.`;
            } else {
                text = `<strong>광전자 방출 중 (f \u2265 f₀):</strong><br>
                        광자의 에너지(${Physics.photonEnergy.toFixed(2)} eV)가 금속의 일함수(${Physics.workFunction.toFixed(2)} eV)보다 커서 전자가 에너지를 흡수하고 즉시 튀어나옵니다.<br>
                        - <span style="color: #00f0ff; font-weight: 600;">청록색 전자(최대 운동에너지)</span>: 금속 표면 근처에서 방출되어 주변 격자와 충돌하지 않고 탈출한 전자로, 에너지 손실이 없어 이론상 최대값인 K<sub>max</sub> = ${Physics.maxKineticEnergy.toFixed(2)} eV의 속도로 가장 빠르게 날아갑니다.<br>
                        - <span style="color: #ff9f0a; font-weight: 600;">오렌지색 전자(일반 운동에너지)</span>: 금속 격자 깊숙이 존재하던 전자가 빛을 받아 튀어 나오면서, 금속 내의 다른 원자들과 부딪쳐 에너지를 잃고 느린 속도로 기어 나오는 현상을 시각화한 것입니다.`;
            }
        } else {
            // Voltage Tab explanations
            if (Physics.intensity === 0) {
                text = '광원이 꺼져 있어 전자가 방출되지 않으므로 전류계의 전류 값도 0입니다.';
            } else if (Physics.photonEnergy < Physics.workFunction) {
                text = `빛의 에너지가 작아 광전효과가 일어나지 않습니다. 전자가 전혀 방출되지 않으므로 인가된 전압 값에 관계없이 전류는 항상 0 V 상태를 나타냅니다.`;
            } else {
                const stoppingV = Physics.stoppingPotential;
                if (Physics.voltage > 0.05) {
                    text = `<strong>순방향 전압 (V > 0):</strong><br>
                            우측 수집판(Collector)에 (+) 전압이 걸려 전기장이 수집판 쪽으로 인력(+)을 작용합니다. 방출된 모든 전자(느린 전자 포함)가 수집판으로 가속되어 끌려가 수집되므로, 전류의 흐름이 원활해지며 포화 전류(최대값)에 도달합니다.`;
                } else if (Physics.voltage < -0.05) {
                    if (Physics.voltage <= -stoppingV) {
                        text = `<strong>저지 전압 도달 (V \u2264 -V₀):</strong><br>
                                역방향 전압이 <span style="color: #ff453a; font-weight: 600;">저지 전압(-${stoppingV.toFixed(2)} V)</span> 이하로 인가되었습니다. 
                                가장 빠른 청록색 표면 전자조차 역전기장에 막혀 수집판 직전에 운동에너지를 전부 잃어버리고(속도 0) 되돌아갑니다. 
                                이에 따라 전류계에 감지되는 광전류는 정확히 0이 됩니다. 이 임계점의 저지 전압(V₀)을 정밀 측정함으로써 전자의 최대 운동에너지(K<sub>max</sub> = e&middot;V₀)를 산출해낼 수 있습니다.`;
                    } else {
                        text = `<strong>역방향 전압 (V < 0):</strong><br>
                                수집판에 (-) 전압이 걸려 전자를 밀쳐내는 척력 전기장이 형성됩니다. 
                                에너지가 작은 <span style="color: #ff9f0a; font-weight: 600;">일반 전자(오렌지색)</span>들은 가다가 감속되어 되돌아가고, 에너지가 충만한 <span style="color: #00f0ff; font-weight: 600;">최대 에너지 전자(청록색)</span>들만 척력을 뚫고 겨우 도달하기 때문에, 전류량이 포화 상태 대비 현저히 줄어듭니다.`;
                    }
                } else {
                    text = `<strong>외부 전압 0 V:</strong><br>
                            순수하게 광전효과로 튀어나온 전자들의 초기 속도 벡터 덕분에 수집판으로 직진한 일부 전자들이 도착하고 있습니다. 이로 인해 외부 전압을 가하지 않아도 기본적으로 일정량의 광전류가 흐르게 됩니다.`;
                }
            }
        }
        explanationText.innerHTML = text;
    }

    // 6. Draw I-V Curve Graph dynamically via SVG Path
    function drawIVGraph() {
        const satCurrent = Physics.intensity / 100; // saturation current proportional to intensity (0 to 1)
        const v0 = Physics.stoppingPotential; // stopping potential in volts
        
        // Generate SVG Path for the curve
        // Domain of voltage V from -5.0 to 5.0 volts
        // Mapping equations:
        // X coord: 120 + 20 * V (x axis spans 20 to 220)
        // Y coord: 90 - 60 * I (where I is from 0 to 1, y axis spans 90 to 30)
        
        let pathD = '';
        const samples = 100;
        
        for (let i = 0; i <= samples; i++) {
            const vVal = -5.0 + (10.0 / samples) * i;
            let iVal = 0;
            
            if (v0 > 0 && satCurrent > 0) {
                if (vVal <= -v0) {
                    iVal = 0;
                } else if (vVal > -v0 && vVal < 0) {
                    // I = I_sat * (1 - (-v/v0)^2)
                    iVal = satCurrent * (1 - Math.pow(-vVal / v0, 2));
                } else {
                    // V >= 0, saturation current
                    iVal = satCurrent;
                }
            } else {
                // If f < f_0 or intensity is 0, current is always 0
                iVal = 0;
            }
            
            const x = 120 + 20 * vVal;
            const y = 90 - 60 * iVal;
            
            if (i === 0) {
                pathD += `M ${x} ${y}`;
            } else {
                pathD += ` L ${x} ${y}`;
            }
        }
        
        ivCurvePath.setAttribute('d', pathD);
        
        // Plot the current state dot on the curve
        const curV = Physics.voltage;
        let curI = 0;
        if (v0 > 0 && satCurrent > 0) {
            if (curV <= -v0) {
                curI = 0;
            } else if (curV > -v0 && curV < 0) {
                curI = satCurrent * (1 - Math.pow(-curV / v0, 2));
            } else {
                curI = satCurrent;
            }
        }
        
        const dotX = 120 + 20 * curV;
        const dotY = 90 - 60 * curI;
        ivCurrentPoint.setAttribute('cx', dotX);
        ivCurrentPoint.setAttribute('cy', dotY);
        
        // Color the dot based on current state
        if (curI === 0) {
            ivCurrentPoint.setAttribute('fill', '#ff453a'); // red (no current)
        } else {
            ivCurrentPoint.setAttribute('fill', '#30d158'); // green (current flows)
        }
    }

    // 7. Input Event Listeners
    inputFrequency.addEventListener('input', (e) => {
        Physics.frequency = parseFloat(e.target.value);
        lastModifiedInput = 'frequency';
        updateUIValues();
    });

    inputIntensity.addEventListener('input', (e) => {
        Physics.intensity = parseInt(e.target.value);
        lastModifiedInput = 'intensity';
        updateUIValues();
    });

    inputWorkFunction.addEventListener('input', (e) => {
        Physics.workFunction = parseFloat(e.target.value);
        lastModifiedInput = 'workfunction';
        
        // Remove active class from all metal presets if manual slider is tweaked
        presetButtons.forEach(btn => btn.classList.remove('active'));
        
        updateUIValues();
    });

    inputVoltage.addEventListener('input', (e) => {
        Physics.voltage = parseFloat(e.target.value);
        updateUIValues();
    });

    // Preset buttons event listener
    presetButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            presetButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const wf = parseFloat(btn.dataset.workfunction);
            Physics.workFunction = wf;
            inputWorkFunction.value = wf;
            
            lastModifiedInput = 'workfunction';
            updateUIValues();
        });
    });

    // Tab buttons event listener
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const tab = btn.dataset.tab;
            Physics.activeTab = tab;
            Physics.reset(); // clear existing particles
            
            if (tab === 'basic') {
                voltageControlSection.style.display = 'none';
                graphSection.style.display = 'none';
                rowStoppingPotential.style.display = 'none';
            } else {
                voltageControlSection.style.display = 'block';
                graphSection.style.display = 'block';
                rowStoppingPotential.style.display = 'flex';
            }
            
            updateUIValues();
        });
    });

    // Play/Pause button
    btnPlayPause.addEventListener('click', () => {
        Physics.isPaused = !Physics.isPaused;
        if (Physics.isPaused) {
            btnPlayPause.innerHTML = '<span class="icon">▶</span> 시뮬레이션 시작';
            btnPlayPause.className = 'btn btn-secondary';
        } else {
            btnPlayPause.innerHTML = '<span class="icon">⏸</span> 일시정지';
            btnPlayPause.className = 'btn btn-primary';
        }
    });

    // Reset button
    btnReset.addEventListener('click', () => {
        Physics.reset();
        inputFrequency.value = 6.5;
        inputIntensity.value = 50;
        inputVoltage.value = 0.0;
        
        Physics.frequency = 6.5;
        Physics.intensity = 50;
        Physics.voltage = 0.0;
        
        // Reset to default Cs preset
        presetButtons.forEach(b => b.classList.remove('active'));
        presetButtons[0].classList.add('active');
        const wf = parseFloat(presetButtons[0].dataset.workfunction);
        Physics.workFunction = wf;
        inputWorkFunction.value = wf;

        Physics.isPaused = false;
        btnPlayPause.innerHTML = '<span class="icon">⏸</span> 일시정지';
        btnPlayPause.className = 'btn btn-primary';

        updateUIValues();
    });

    // 8. Simulation Main Tick Loop (60fps)
    function loop() {
        Physics.update();
        Physics.draw();
        requestAnimationFrame(loop);
    }

    // Initialize values and start
    updateUIValues();
    requestAnimationFrame(loop);
});
