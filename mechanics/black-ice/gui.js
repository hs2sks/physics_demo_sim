// UI Controller for High School Science Lab
document.addEventListener('DOMContentLoaded', () => {
    // 1. DOM Elements
    const canvas = document.getElementById('physics-canvas');
    
    // Control variables inputs
    const inputSlope = document.getElementById('input-slope');
    const inputWater = document.getElementById('input-water');
    const inputRoadCond = document.getElementById('input-road-cond');
    const inputCarWeight = document.getElementById('input-car-weight');
    const inputFreezerTemp = document.getElementById('input-freezer-temp');
    const inputSprayCount = document.getElementById('input-spray-count');
    const inputEntryHeight = document.getElementById('input-entry-height');

    // Labels
    const valSlope = document.getElementById('val-slope');
    const valWater = document.getElementById('val-water');
    const valCarWeight = document.getElementById('val-car-weight');
    const valFreezerTemp = document.getElementById('val-freezer-temp');
    const valSprayCount = document.getElementById('val-spray-count');
    const valEntryHeight = document.getElementById('val-entry-height');

    // Controls blocks
    const varRunoff = document.getElementById('variables-runoff');
    const varFriction = document.getElementById('variables-friction');
    const varFreezer = document.getElementById('variables-freezer');
    const varAcoustic = document.getElementById('variables-acoustic');

    // View Titles
    const viewTitle = document.getElementById('view-title');
    const viewDesc = document.getElementById('view-desc');
    const explanationText = document.getElementById('explanation-text');
    
    // Action buttons
    const btnRunLab = document.getElementById('btn-run-lab');
    const btnResetLab = document.getElementById('btn-reset-lab');
    const tabButtons = document.querySelectorAll('.tab-btn');

    // Telemetry panels
    const phoneVibeSection = document.getElementById('phone-vibe-section');
    const lblPhoneDb = document.getElementById('lbl-phone-db');
    const vibeWavePath = document.getElementById('vibe-wave-path');

    // Data table elements
    const thMetric1 = document.getElementById('th-metric-1');
    const thMetric2 = document.getElementById('th-metric-2');
    const thMetric3 = document.getElementById('th-metric-3');

    // 4 Tracks cells
    const flatCells = [document.getElementById('flat-m1'), document.getElementById('flat-m2'), document.getElementById('flat-m3')];
    const longCells = [document.getElementById('long-m1'), document.getElementById('long-m2'), document.getElementById('long-m3')];
    const transCells = [document.getElementById('trans-m1'), document.getElementById('trans-m2'), document.getElementById('trans-m3')];
    const leafCells = [document.getElementById('leaf-m1'), document.getElementById('leaf-m2'), document.getElementById('leaf-m3')];

    // 2. Setup Canvas Context
    const ctx = canvas.getContext('2d');
    Physics.canvas = canvas;
    Physics.ctx = ctx;

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        Physics.reset();
        updateUI();
    }

    setTimeout(resizeCanvas, 60);
    window.addEventListener('resize', resizeCanvas);

    // Click on canvas to attach/change active smartphone sensor track (Lab 4)
    canvas.addEventListener('click', (e) => {
        if (Physics.activeLab !== 'acoustic') return;
        const rect = canvas.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const laneHeight = canvas.height / 4;
        
        // Find which lane index clicked [0 to 3]
        const clickedLane = Math.floor(clickY / laneHeight);
        if (clickedLane >= 0 && clickedLane < 4) {
            Physics.selectedSensorTrack = clickedLane;
            Physics.resetCar();
            Physics.vibeHistory = [];
            Physics.runExperiment(); // Restart sensor drive on click
        }
    });

    // 3. Tab switching logic
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const lab = btn.dataset.lab;
            Physics.activeLab = lab;
            Physics.reset();

            // Toggle variables panel
            varRunoff.style.display = lab === 'runoff' ? 'block' : 'none';
            varFriction.style.display = lab === 'friction' ? 'block' : 'none';
            varFreezer.style.display = lab === 'freezer' ? 'block' : 'none';
            varAcoustic.style.display = lab === 'acoustic' ? 'block' : 'none';

            // Show smartphone sensor view only in Lab 4
            phoneVibeSection.style.display = lab === 'acoustic' ? 'block' : 'none';

            // Swap titles and data table column headers
            if (lab === 'runoff') {
                viewTitle.textContent = '실험 1: 수막 배수 효율 측정실';
                viewDesc.textContent = '4종의 노면 모형 시편 경사각에 따라 물이 홈을 통해 배출되는 양(mL)과 배출 시간을 계측합니다.';
                thMetric1.textContent = '유출 시간';
                thMetric2.textContent = '유출량(mL)';
                thMetric3.textContent = '잔류수막(mm)';
            } else if (lab === 'friction') {
                viewTitle.textContent = '실험 2: 모형차 제동 마찰 시험실';
                viewDesc.textContent = '바퀴가 묶인 모형 미니카를 일정한 속도로 활강시켜 노면별 순수 미끄럼 거리(cm)와 마찰계수를 계측합니다.';
                thMetric1.textContent = '노면 상태';
                thMetric2.textContent = '미끄럼거리(cm)';
                thMetric3.textContent = '마찰계수(μ)';
            } else if (lab === 'freezer') {
                viewTitle.textContent = '실험 3: 냉동실 동결 지연 시험실';
                viewDesc.textContent = '분무기로 미세 습기를 공급하고 냉동실 온도에 따른 시편 요철 상부의 동결 및 결빙 시작 시간을 관찰합니다.';
                thMetric1.textContent = '냉동 온도';
                thMetric2.textContent = '동결시작(min)';
                thMetric3.textContent = '완전결빙(min)';
            } else if (lab === 'acoustic') {
                viewTitle.textContent = '실험 4: 소음 및 상하 진동 분석실';
                viewDesc.textContent = '모형차가 그루빙 요철 주행 시 발생하는 상하 충격 가속도(G) 및 타이어 마찰 노면 소음(dB)을 스마트폰 센서로 측정합니다.';
                thMetric1.textContent = '진입 속도';
                thMetric2.textContent = '평균소음(dB)';
                thMetric3.textContent = '상하가속도(G)';
            }

            clearDataTable();
            updateUI();
        });
    });

    // Clear data table cells
    function clearDataTable() {
        const cells = [...flatCells, ...longCells, ...transCells, ...leafCells];
        cells.forEach(c => c.textContent = '--');
    }

    // 4. Update UI labels and sensors
    function updateUI() {
        // Runoff Labels
        valSlope.textContent = `${Physics.slope.toFixed(0)} °`;
        valWater.textContent = `${Physics.waterVolume.toFixed(0)} mL`;
        
        // Friction Labels
        valCarWeight.textContent = `${Physics.carWeight.toFixed(0)} g`;
        
        // Freezer Labels
        valFreezerTemp.textContent = `${Physics.freezerTemp.toFixed(1)} °C`;
        valSprayCount.textContent = `${Physics.sprayCount.toFixed(0)} 회`;

        // Acoustic Labels
        valEntryHeight.textContent = `${Physics.entryHeight.toFixed(0)} cm`;

        // Update Study explanation box in Korean
        updateScienceJournal();
    }

    // Interactive updates in loop
    function updateTableLog() {
        const time = Physics.experimentTime;
        const running = Physics.isExperimentRunning;

        if (Physics.activeLab === 'runoff') {
            // Drainage integration updates
            const timeScales = [1.08, 0.63, 0.83, 0.40]; // Flat, Long, Trans, Leaf
            const finalTimes = [6.50, 3.80, 5.00, 2.40];
            const rates = [0.15, 0.55, 0.35, 0.85];
            const maxStagnant = [6.0, 2.5, 4.0, 0.5];

            const cells = [flatCells, longCells, transCells, leafCells];

            for (let i = 0; i < 4; i++) {
                const vol = Physics.cylinders[i];
                let curTime = time * timeScales[i];
                if (curTime > finalTimes[i]) curTime = finalTimes[i];
                
                if (vol > 0.01) {
                    cells[i][0].textContent = `${curTime.toFixed(2)}s`;
                    cells[i][1].textContent = `${vol.toFixed(1)}`;
                    
                    const st = maxStagnant[i] - (vol / (Physics.waterVolume * rates[i])) * (maxStagnant[i] * 0.9);
                    cells[i][2].textContent = `${Math.max(0.1, st).toFixed(1)}mm`;
                } else if (running) {
                    cells[i][0].textContent = `0.00s`;
                    cells[i][1].textContent = `0.0`;
                    cells[i][2].textContent = `${maxStagnant[i].toFixed(1)}mm`;
                }
            }
        } else if (Physics.activeLab === 'friction') {
            // Toy car friction stops updates
            const condName = Physics.roadCondition === 'dry' ? '건조' : Physics.roadCondition === 'wet' ? '습윤' : '결빙';
            const cells = [flatCells, longCells, transCells, leafCells];

            for (let i = 0; i < 4; i++) {
                const dist = Physics.skidDistance[i];
                cells[i][0].textContent = condName;
                if (dist > 0.1) {
                    cells[i][1].textContent = `${dist.toFixed(1)}cm`;
                    cells[i][2].textContent = `${Physics.calculatedMu[i].toFixed(2)}`;
                }
            }
        } else if (Physics.activeLab === 'freezer') {
            // Freezer starts & completes times
            const cells = [flatCells, longCells, transCells, leafCells];
            for (let i = 0; i < 4; i++) {
                cells[i][0].textContent = `${Physics.freezerTemp.toFixed(1)}°C`;
                
                if (Physics.freezingStarts[i] > 0.1) {
                    cells[i][1].textContent = `${Physics.freezingStarts[i].toFixed(1)}분`;
                } else if (running) {
                    cells[i][1].textContent = '대기..';
                }
                
                if (Physics.freezingCompletes[i] > 0.1) {
                    cells[i][2].textContent = `${Physics.freezingCompletes[i].toFixed(1)}분`;
                } else if (running) {
                    cells[i][2].textContent = '대기..';
                }
            }
        } else if (Physics.activeLab === 'acoustic') {
            // G-Sensor heights and Db metrics
            const v0 = Math.sqrt(2 * Physics.g * (Physics.entryHeight / 100)) * 3.6; // speed in km/h
            const cells = [flatCells, longCells, transCells, leafCells];
            
            const activeIdx = Physics.selectedSensorTrack;
            cells[activeIdx][0].textContent = `${v0.toFixed(1)}km/h`;
            
            if (Physics.acousticNoise[activeIdx] > 0.1) {
                cells[activeIdx][1].textContent = `${Physics.acousticNoise[activeIdx].toFixed(1)}dB`;
                cells[activeIdx][2].textContent = `${Physics.vibeGForce[activeIdx].toFixed(2)}G`;
            }

            // Draw real-time smartphone waveform
            drawSmartphoneWave();
        }
    }

    // Draw smartphone wave graph in SVG path
    function drawSmartphoneWave() {
        const history = Physics.vibeHistory;
        let pathD = '';
        const startX = 10;
        const endX = 230;
        const yCenter = 50;

        if (history.length === 0) {
            vibeWavePath.setAttribute('d', `M ${startX} ${yCenter} L ${endX} ${yCenter}`);
            lblPhoneDb.textContent = '00.0 dB';
            return;
        }

        const stepX = (endX - startX) / 50;
        
        for (let i = 0; i < history.length; i++) {
            const x = startX + i * stepX;
            // history ranges roughly from -45 to +45. Map to screen y: 50 - waveVal
            const y = yCenter - history[i];
            
            if (i === 0) {
                pathD += `M ${x} ${y}`;
            } else {
                pathD += ` L ${x} ${y}`;
            }
        }

        // Draw flat line for empty tail
        if (history.length < 50) {
            const lastX = startX + history.length * stepX;
            pathD += ` L ${endX} ${yCenter}`;
        }

        vibeWavePath.setAttribute('d', pathD);
        
        // Update noise label decibel
        const currentNoise = Physics.acousticNoise[Physics.selectedSensorTrack];
        lblPhoneDb.textContent = `${currentNoise.toFixed(1)} dB`;
    }

    // Explanations Box Text generator (R&E research tips)
    function updateScienceJournal() {
        let text = '';
        const lab = Physics.activeLab;

        if (lab === 'runoff') {
            text = `<strong>🧪 실험 1: 배수 탐구 요점</strong><br>
                    지점토 시편 경사각과 살수량을 늘리며 4종 노면의 배수 실린더 유출량을 관찰합니다.<br><br>
                    <strong>💡 R&E 작성 팁:</strong><br>
                    - <strong>나뭇잎 패턴</strong>은 사선 엽맥의 대칭 배치와 중력 구배의 벡터 합력에 의해 물방울을 최단 사선 거리로 방출하여 배수 수율이 85%에 이릅니다.<br>
                    - <strong>종방향(가로)</strong> 홈은 흐름 저항이 적어 배수 속도가 빠른 편이나 중심 차선에 일부 체류가 발생하며, **횡방향(세로)** 홈은 물이 가로로 빠져나가기 때문에 끝 실린더 회수율이 매우 떨어집니다.`;
        } else if (lab === 'friction') {
            text = `<strong>🚗 실험 2: 제동 접지 탐구 요점</strong><br>
                    바퀴를 고무줄로 묶어 브레이크 잠김(ABS 오작동) 미끄럼 마찰 실험을 수행합니다. 노면에 물을 뿌리거나 얼려서 검증해 보세요.<br><br>
                    <strong>💡 R&E 작성 팁:</strong><br>
                    - <strong>결빙(Frozen)</strong> 상태에서 평면 아스팔트는 슬라이딩 미끄럼 거리가 최대화되어 마찰계수가 $\\mu \\approx 0.08$까지 저하됩니다.<br>
                    - **횡방향 홈 그루빙**은 제동 슬라이드 방향과 수직인 깎임 각도로 타이어가 접착해 미세 기계적 맞물림(Hysteresis Friction) 효과가 발생하여 $30\\text{cm}$ 대역에서 가장 먼저 정지합니다.<br>
                    - 나뭇잎 홈은 $28\\text{cm}$급 제동 안정성과 스핀 방지 성능을 입증합니다.`;
        } else if (lab === 'freezer') {
            text = `<strong>❄️ 실험 3: 동결 지연 탐구 요점</strong><br>
                    노면에 습기를 미세 공급한 뒤 냉동실에 집어넣어, 타이어가 직접 만나게 되는 노면 상부 요철(철부)이 성에로 덮이는 동결 시간을 비교합니다.<br><br>
                    <strong>💡 R&E 작성 팁:</strong><br>
                    - <strong>나뭇잎 패턴</strong>은 미세 모세관 배수 유도력이 작동해, 뿌려진 물막이 요철 하단 홈 속으로 신속하게 가라앉아 윗돌기가 가장 늦게 얼어붙습니다 (동결 지연시간 약 $52$분 달성).<br>
                    - 반면 <strong>평면 노면</strong>은 물막이 표면에 상시 덮여 있어 $15$분 만에 즉각 서리 블랙아이스가 완전히 도포됩니다.`;
        } else if (lab === 'acoustic') {
            text = `<strong>📱 실험 4: 스마트폰 센서 탐구 요점</strong><br>
                    모형차가 그루빙 홈을 넘으며 발생시키는 상하 충격가속도(G) 및 타이어 노면 진동 주파수 소음을 가상 Phyphox 단말로 계측합니다.<br>
                    <em>*캔버스의 트랙(A, B, C, D)을 클릭하면 해당 트랙의 센서 프로브로 교체됩니다.*</em><br><br>
                    <strong>💡 R&E 작성 팁:</strong><br>
                    - <strong>횡방향 그루빙</strong>은 진행 방향 수직 홈 충격음이 주기 주파수($f = v/L$)로 증폭되어 가장 높은 소음 진동(최대 82dB, 0.85G)이 그려집니다.<br>
                    - **나뭇잎 패턴**은 홈 각도가 사선으로 틀어져 있어 충격 파형이 매끄러운 완화 사선 파형을 띠어 소음 진동이 대폭 분쇄됨을 가속도 그래프로 증명할 수 있습니다.`;
        }

        explanationText.innerHTML = text;
    }

    // 5. Input Event Listeners
    inputSlope.addEventListener('input', (e) => {
        Physics.slope = parseFloat(e.target.value);
        updateUI();
    });

    inputWater.addEventListener('input', (e) => {
        Physics.waterVolume = parseFloat(e.target.value);
        updateUI();
    });

    inputRoadCond.addEventListener('change', (e) => {
        Physics.roadCondition = e.target.value;
        updateUI();
    });

    inputCarWeight.addEventListener('input', (e) => {
        Physics.carWeight = parseFloat(e.target.value);
        updateUI();
    });

    inputFreezerTemp.addEventListener('input', (e) => {
        Physics.freezerTemp = parseFloat(e.target.value);
        updateUI();
    });

    inputSprayCount.addEventListener('input', (e) => {
        Physics.sprayCount = parseFloat(e.target.value);
        updateUI();
    });

    inputEntryHeight.addEventListener('input', (e) => {
        Physics.entryHeight = parseFloat(e.target.value);
        updateUI();
    });

    // Run lab test
    btnRunLab.addEventListener('click', () => {
        Physics.runExperiment();
    });

    // Reset lab
    btnResetLab.addEventListener('click', () => {
        Physics.reset();
        
        // Reset defaults
        inputSlope.value = 5;
        inputWater.value = 50;
        inputRoadCond.value = 'frozen';
        inputCarWeight.value = 150;
        inputFreezerTemp.value = -5.0;
        inputSprayCount.value = 15;
        inputEntryHeight.value = 25;

        Physics.slope = 5;
        Physics.waterVolume = 50;
        Physics.roadCondition = 'frozen';
        Physics.carWeight = 150;
        Physics.freezerTemp = -5.0;
        Physics.sprayCount = 15;
        Physics.entryHeight = 25;

        clearDataTable();
        updateUI();
    });

    // 6. Main loop simulation tick (60fps)
    function loop() {
        Physics.update();
        Physics.draw();
        updateTableLog();
        requestAnimationFrame(loop);
    }

    // Initialize values and begin loop
    updateUI();
    clearDataTable();
    requestAnimationFrame(loop);
});
