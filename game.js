/**
 * 互動窗戶擦拭遊戲 - 核心邏輯 (game.js)
 *
 * 【四階段遊戲流程】：
 *   Stage 1 'wiping'    → 手勢擦霧，同時偵測紅色水瓶與阿土伯是否出現
 *   Stage 2 'countdown' → 霧氣消失，倒數讀條由右向左縮減 10 秒，相機關閉
 *   Stage 3 'question'  → 讀條歸零後出現三個選項按鈕，手勢控制選擇答案
 *   Stage 4 'result'    → 玩家選完後顯示結果文字 + 下一題 / 今天先這樣 按鈕
 *
 * 【手勢控制機制】：
 *   - 擦窗戶：用食指移動擦除霧氣
 *   - 問答：指向按鈕 1.2 秒自動選擇，或握拳確認選擇
 */

// ==========================================================================
// ★【遊戲自訂參數設定區 - 後台調整區】★
// ==========================================================================
const GAME_CONFIG = {
    WIPE_SHAPE: 'square',      // 擦除形狀：'square' (方形) 或 'circle' (圓形)
    WIPE_SIZE: 140,            // 擦除範圍大小 (單位：像素。高齡長輩友善 140px)
    LEFT_PANE_THRESHOLD: 50,   // 紅色水瓶可見即進倒數的清除率門檻 (%)
    RIGHT_PANE_THRESHOLD: 50,  // 目標人物可見即進倒數的清除率門檻 (%)
    COUNTDOWN_TIME: 10,        // 記住窗外場景的倒數時間 (秒)
};

const LEVELS = [
    {
        name: '阿土伯',
        image: 'Image/阿土伯.png',
        alt: '阿土伯',
        question: '{userTitle}！那個人在推著車子，車上放了一個好大的瓶子，還一直冒煙耶！那是什麼顏色的瓶子呀？',
        options: [
            { text: '大　紅　色', answer: 'correct' },
            { text: '天　空　藍', answer: 'wrong' },
            { text: '草　綠　色', answer: 'wrong' }
        ]
    },
    {
        name: '王媽媽',
        image: 'Image/王媽媽.png',
        alt: '王媽媽',
        question: '{userTitle}！是隔壁王媽媽耶。她手裡提著一根好大、綠色葉子的蔬菜，那是什麼菜呀？',
        options: [
            { text: '白　蘿　蔔', answer: 'correct' },
            { text: '大　鳳　梨', answer: 'wrong' },
            { text: '長　絲　瓜', answer: 'wrong' }
        ]
    },
    {
        name: '不要叫我叔叔',
        image: 'Image/不要叫我叔叔.png',
        alt: '不要叫我叔叔',
        question: '{userTitle}！那個叔叔好厲害，肩膀上扛了一個灰色、看起來好重的圓筒罐子，那是什麼桶子呀？',
        options: [
            { text: '飲　水　桶', answer: 'wrong' },
            { text: '瓦　斯　桶', answer: 'correct' },
            { text: '垃　圾　桶', answer: 'wrong' }
        ]
    },
    {
        name: '阿財伯',
        image: 'Image/阿財伯.png',
        alt: '阿財伯',
        question: '{userTitle}！阿財伯今天穿得好奇怪喔，他的腳上穿著一雙好高、黑黑的鞋子，那是做什麼用的鞋子呀？',
        options: [
            { text: '高　筒　雨　鞋', answer: 'correct' },
            { text: '藍　白　拖　鞋', answer: 'wrong' },
            { text: '運　動　跑　步　鞋', answer: 'wrong' }
        ]
    },
    {
        name: '導護小孩',
        image: 'Image/導護小孩.png',
        alt: '導護小孩',
        question: '{userTitle}！{grandchildName}下課了耶，他手上拿著一個旗子，那是什麼顏色的旗子？',
        options: [
            { text: '黑　色', answer: 'wrong' },
            { text: '白　色', answer: 'wrong' },
            { text: '黃　色', answer: 'correct' }
        ]
    }
];
let currentLevelIndex = 0;
let wipeFallbackTimeoutId = null;
// ==========================================================================
// ★【對話框文字設定區 - 後台調整區】★
// 在此修改各個階段的對話框文字（使用全形空格分隔，確保注音字型美觀不重疊）
// ==========================================================================
const DIALOGUE_TEXT = {
    // Stage 1：起霧擦拭引導文字
    wiping:    '{userTitle}，窗戶起霧了，擦一下吧。',
    // Stage 2：倒數記憶提示文字
    countdown: '{userTitle}！你要記清楚窗戶外面有甚麼喔！！',
    // Stage 3：問題描述文字（較長，允許換行，字體自動縮小）
    question:  '那個人在推著車子，車上放了一個好大的瓶子，還一直冒煙耶！那是什麼顏色的瓶子呀？',
    // Stage 4a：答對文字
    correct:   '{userTitle}你答對了！你很棒餒！要不要繼續下一題？',
    // Stage 4b：答錯文字
    wrong:     '哎呀，答錯了！沒關係，再想想看喔！',
};

// ==========================================================================
// ★【問答選項設定區 - 後台調整區】★
// data-answer="correct" 為正確答案，"wrong" 為錯誤選項
// ==========================================================================
// (選項文字在 index.html 的 .qa-btn 元素中設定，data-answer 控制正誤)

window.addEventListener('DOMContentLoaded', () => {
    // ==========================================================================
    // A. 宣告變數與 DOM 元素
    // ==========================================================================
    const canvas       = document.getElementById('fog-canvas');
    const ctx          = canvas.getContext('2d');
    const windowWrapper = document.getElementById('window-wrapper');
    const windowBgImage = document.getElementById('window-bg-image');

    // 隱藏的視訊鏡頭元件
    const videoElement              = document.getElementById('webcam-video');
    const gesturePointersContainer  = document.getElementById('gesture-pointers');

    // 各階段 DOM 元素
    const dialogueTextEl    = document.getElementById('dialogue-text-element');
    const countdownContainer = document.getElementById('countdown-container');
    const countdownProgress  = document.getElementById('countdown-progress');
    const qaOverlay          = document.getElementById('qa-overlay');
    const qaButtons          = document.querySelectorAll('.qa-btn');
    const wrongResultOverlay = document.getElementById('wrong-result-overlay');
    const wrongResultImage   = document.getElementById('wrong-result-image');
    const btnRetry           = document.getElementById('btn-retry');
    const btnGiveUp          = document.getElementById('btn-giveup');
    const resultActions      = document.getElementById('result-actions');
    const btnNext            = document.getElementById('btn-next');
    const btnHome            = document.getElementById('btn-home');
    const cameraErrorOverlay = document.getElementById('camera-error-overlay');
    const cameraErrorMessage = document.getElementById('camera-error-message');
    const cameraErrorRetry   = document.getElementById('camera-error-retry');

    // 主畫面設定 UI
    const startupOverlay        = document.getElementById('startup-overlay');
    const startGameBtn         = document.getElementById('start-game-btn');
    const startupCharacterImage = document.getElementById('startup-character-image');
    const nameInput            = document.getElementById('grandchild-name-input');
    const userGenderInputs     = document.querySelectorAll('input[name="user-gender"]');
    const grandchildGenderInputs = document.querySelectorAll('input[name="grandchild-gender"]');
    const nameBadge            = document.getElementById('name-badge');
    const characterImage       = document.getElementById('character-image');

    // 使用者個人設定
    let userGender = 'female';
    let grandchildGender = 'male';
    let grandchildName = '王小明';
    let userTitle = '阿罵';
    let gameStarted = false;
    let cameraInitialized = false;

    // 微型離屏畫布 (40x25)，用於超低延遲清除率計算
    const offscreen = document.createElement('canvas');
    offscreen.width  = 40;
    offscreen.height = 25;
    const oCtx = offscreen.getContext('2d');

    // 靜態霧氣紋理
    const waterDropsImg = new Image();
    let isTextureLoaded = false;

    // 遊戲狀態機：'wiping' | 'countdown' | 'question' | 'result'
    let gameState        = 'wiping';
    let countdownInterval = null;
    let lastCheckTime    = 0;

    // 擦窗戶備援機制
    let wipeFallbackStart   = null;
    let wipeGestureCount    = 0;
    let pointerDown         = false;
    let pointerLastX        = null;
    let pointerLastY        = null;

    // ==========================================================================
    // B. 畫布初始化與霧氣繪製 (防禦性 onload 流程)
    // ==========================================================================

    waterDropsImg.onload = () => {
        isTextureLoaded = true;
        console.log('💧 靜態霧氣紋理載入成功，啟動畫布...');
        resizeCanvas();
    };

    // 先掛 onload，再賦 src，防止快取瞬間完成漏掉回呼
    waterDropsImg.src = 'Image/water_drops.jpg';
    if (waterDropsImg.complete) waterDropsImg.onload();

    function replacePlaceholders(text) {
        return text
            .replace(/\{userTitle\}/g, userTitle)
            .replace(/\{grandchildName\}/g, grandchildName);
    }

    function applyProfileSettings() {
        userGender = Array.from(userGenderInputs).find(input => input.checked)?.value || 'female';
        grandchildGender = Array.from(grandchildGenderInputs).find(input => input.checked)?.value || 'male';
        grandchildName = nameInput.value.trim() || '王小明';
        userTitle = userGender === 'male' ? '阿公' : '阿罵';

        nameBadge.textContent = grandchildName;
        const avatarFile = grandchildGender === 'female' ? 'Image/孫女1.png' : 'Image/孫子1.png';
        characterImage.src = avatarFile;
        characterImage.alt = grandchildGender === 'female' ? '孫女' : '孫子';
        if (startupCharacterImage) {
            startupCharacterImage.src = avatarFile;
            startupCharacterImage.alt = characterImage.alt;
        }

        // 若已經在問答階段，更新目前畫面中的文字
        dialogueTextEl.textContent = replacePlaceholders(dialogueTextEl.textContent);
    }

    function updateOptionSelectionStyles() {
        document.querySelectorAll('.option-pill').forEach(label => {
            const input = label.querySelector('input[type="radio"]');
            label.classList.toggle('selected', input?.checked);
        });
    }

    userGenderInputs.forEach(input => input.addEventListener('change', updateOptionSelectionStyles));
    grandchildGenderInputs.forEach(input => input.addEventListener('change', updateOptionSelectionStyles));
    updateOptionSelectionStyles();

    startGameBtn.addEventListener('click', () => {
        applyProfileSettings();
        gameStarted = true;
        if (startupOverlay) startupOverlay.classList.add('hidden');
        if (!cameraInitialized) {
            initMediapipe();
        } else if (cameraInstance && typeof cameraInstance.start === 'function') {
            cameraInstance.start();
            isWebcamActive = true;
            hideCameraError();
        }
        resizeCanvas();
    });

    function resizeCanvas() {
        if (!canvas || !windowWrapper) return;
        const w = windowWrapper.clientWidth;
        const h = windowWrapper.clientHeight;
        canvas.width  = w > 0 ? w : 1080;
        canvas.height = h > 0 ? h : 667;
        console.log(`📐 畫布大小重置為: ${canvas.width}x${canvas.height}`);
        resetFog();
    }

    /** 重新鋪霧並完整重置所有 UI 為 Stage 1 */
    function resetFog() {
        // 停止倒數
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }

        // 重置狀態
        gameState = 'wiping';
        hideCameraError();

        // 重置手勢控制相關變數
        fingerPoints = [];
        lastSelectionTime = 0;
        hoveredButtonTime = 0;
        if (currentHighlightBtn) {
            currentHighlightBtn.classList.remove('gesture-hover');
            currentHighlightBtn = null;
        }

        // 重置擦窗戶備援
        wipeFallbackStart = null;
        wipeGestureCount = 0;
        if (wipeFallbackTimeoutId) {
            clearTimeout(wipeFallbackTimeoutId);
            wipeFallbackTimeoutId = null;
        }
        pointerDown = false;
        pointerLastX = null;
        pointerLastY = null;

        // 重置所有 UI
        countdownContainer.classList.add('hidden');
        canvas.classList.remove('hidden');
        qaOverlay.classList.add('hidden');
        wrongResultOverlay.classList.add('hidden');
        resultActions.classList.add('hidden');
        dialogueTextEl.classList.remove('small');
        dialogueTextEl.textContent = replacePlaceholders(DIALOGUE_TEXT.wiping);

        // 更新當前關卡背景與錯誤 UI 圖片
        if (windowBgImage) {
            const level = LEVELS[currentLevelIndex];
            windowBgImage.src = level.image;
            windowBgImage.alt = `戶外 ${level.alt}`;
        }
        if (wrongResultImage) {
            const level = LEVELS[currentLevelIndex];
            wrongResultImage.src = level.image;
            wrongResultImage.alt = level.alt;
        }

        // 移除按鈕高亮
        qaButtons.forEach(btn => btn.classList.remove('correct-flash', 'wrong-flash'));

        // 重啟視訊手勢，僅在遊戲開始後啟動
        if (gameStarted) {
            isWebcamActive = true;
            if (!videoElement.srcObject || !videoElement.srcObject.active) {
                console.log('🔄 重新初始化 Mediapipe 與鏡頭串流...');
                initMediapipe();
            }
        }

        // 鋪底層不透明遮罩
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(235, 240, 245, 1.0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 鋪水滴紋理
        if (isTextureLoaded) {
            ctx.globalAlpha = 0.5;
            ctx.drawImage(waterDropsImg, 0, 0, canvas.width, canvas.height);
            ctx.globalAlpha = 1.0;
        }
        ctx.restore();
    }

    function showCameraError(message) {
        if (!cameraErrorOverlay || !cameraErrorMessage) return;
        cameraErrorMessage.textContent = message || '請使用本地伺服器開啟本遊戲並允許相機權限。';
        cameraErrorOverlay.classList.remove('hidden');
    }

    function showStartupScreen() {
        gameStarted = false;
        if (startupOverlay) startupOverlay.classList.remove('hidden');
        stopCamera(true);
        wrongResultOverlay.classList.add('hidden');
        qaOverlay.classList.add('hidden');
        resultActions.classList.add('hidden');
        gameState = 'wiping';
        currentLevelIndex = 0;
        resetFog();
    }

    function hideCameraError() {
        if (!cameraErrorOverlay) return;
        cameraErrorOverlay.classList.add('hidden');
    }

    window.addEventListener('resize', resizeCanvas);

    cameraErrorRetry.addEventListener('click', () => {
        hideCameraError();
        initMediapipe();
    });

    // 支援滑鼠 / 觸控擦窗戶備援
    canvas.addEventListener('pointerdown', handlePointerStart);
    canvas.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    function handlePointerStart(event) {
        if (gameState !== 'wiping') return;
        pointerDown = true;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        pointerLastX = x;
        pointerLastY = y;
        registerWipeAction();
        wipeSingleSpot(x, y);
        checkClearedPercentage();
        maybeForceCountdownFallback();
    }

    function handlePointerMove(event) {
        if (gameState !== 'wiping' || !pointerDown) return;
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (pointerLastX !== null && pointerLastY !== null) {
            wipeContinuousPath(pointerLastX, pointerLastY, x, y);
        } else {
            wipeSingleSpot(x, y);
        }
        pointerLastX = x;
        pointerLastY = y;
        registerWipeAction();
        checkClearedPercentage();
        maybeForceCountdownFallback();
    }

    function handlePointerEnd() {
        pointerDown = false;
        pointerLastX = null;
        pointerLastY = null;
    }

    function registerWipeAction() {
        if (!wipeFallbackStart) {
            wipeFallbackStart = Date.now();
            if (wipeFallbackTimeoutId) {
                clearTimeout(wipeFallbackTimeoutId);
            }
            wipeFallbackTimeoutId = setTimeout(() => {
                if (gameState === 'wiping' && wipeFallbackStart) {
                    console.log('⏱ 連續擦拭 10 秒，進入倒數階段');
                    startCountdownState();
                }
            }, 10000);
        }
        wipeGestureCount += 1;
    }

    function maybeForceCountdownFallback() {
        if (gameState !== 'wiping' || !wipeFallbackStart) return;
        const elapsed = (Date.now() - wipeFallbackStart) / 1000;
        // 若使用者已經持續擦拭超過 10 秒，則自動進入倒數階段（避免等待過久）
        if (elapsed >= 10) {
            console.log(`⏩ 使用者已擦拭 ${Math.floor(elapsed)} 秒，進入倒數階段`);
            startCountdownState();
            return;
        }

        // 保留計數式備援的記錄，但不會主動觸發（僅供 debug）
        if (wipeGestureCount >= 35) {
            console.log('⏩ 擦拭手勢次數達到備援門檻，但仍以時間為主觸發倒數');
        }
    }

    // ==========================================================================

    function wipeSingleSpot(x, y) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        const size = GAME_CONFIG.WIPE_SIZE;
        if (GAME_CONFIG.WIPE_SHAPE === 'square') {
            ctx.fillRect(x - size / 2, y - size / 2, size, size);
        } else {
            ctx.beginPath();
            ctx.arc(x, y, size / 2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function wipeContinuousPath(x1, y1, x2, y2) {
        const size = GAME_CONFIG.WIPE_SIZE;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        if (GAME_CONFIG.WIPE_SHAPE === 'square') {
            const dx = x2 - x1, dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const steps = Math.ceil(dist / 2);
            for (let i = 0; i <= steps; i++) {
                const t = steps === 0 ? 0 : i / steps;
                ctx.fillRect(x1 + dx * t - size / 2, y1 + dy * t - size / 2, size, size);
            }
        } else {
            ctx.lineWidth = size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ==========================================================================
    // D. 離屏微型畫布像素抽樣法 — 雙區域獨立判斷
    // ==========================================================================

    function checkClearedPercentage() {
        try {
            if (gameState !== 'wiping') return;
            if (canvas.width <= 0 || canvas.height <= 0) return;
            const now = Date.now();
            if (now - lastCheckTime < 300) return;
            lastCheckTime = now;

            oCtx.imageSmoothingEnabled = false;
            oCtx.mozImageSmoothingEnabled = false;
            oCtx.webkitImageSmoothingEnabled = false;
            oCtx.msImageSmoothingEnabled = false;

            oCtx.clearRect(0, 0, 40, 25);
            oCtx.drawImage(canvas, 0, 0, 40, 25);

            const data = oCtx.getImageData(0, 0, 40, 25).data;

            // 紅色水瓶區域 (Col 10~22, Row 5~20)
            let thermosCleared = 0;
            const thermosTotal = (22 - 10 + 1) * (20 - 5 + 1);

            // 阿土伯區域 (Col 24~37, Row 5~20)
            let oldmanCleared = 0;
            const oldmanTotal = (37 - 24 + 1) * (20 - 5 + 1);

            for (let y = 5; y <= 20; y++) {
                for (let x = 10; x <= 22; x++) {
                    if (data[(y * 40 + x) * 4 + 3] < 150) thermosCleared++;
                }
                for (let x = 24; x <= 37; x++) {
                    if (data[(y * 40 + x) * 4 + 3] < 150) oldmanCleared++;
                }
            }

            const thermosPercent = (thermosCleared / thermosTotal) * 100;
            const oldmanPercent  = (oldmanCleared  / oldmanTotal)  * 100;
            console.log(`🧹 水瓶: ${thermosPercent.toFixed(1)}% / 阿土伯: ${oldmanPercent.toFixed(1)}%`);

            // 只要阿土伯區域（oldman）達到門檻就進入倒數階段
            if (oldmanPercent >= GAME_CONFIG.RIGHT_PANE_THRESHOLD) {
                console.log(`✅ 阿土伯區域已清除 ${oldmanPercent.toFixed(1)}%，進入倒數`);
                startCountdownState();
            }
        } catch (err) {
            console.error('⚠️ 離屏透明度檢測模組發生異常:', err);
        }
    }

    // ==========================================================================
    // E. Stage 2 — 倒數計時 (讀條由右向左縮減)
    // ==========================================================================

    function startCountdownState() {
        if (gameState !== 'wiping') return; // 防止重複觸發
        gameState = 'countdown';
        console.log('🎉 進入第二階段：倒數記憶！');

        // 1. 隱藏霧氣畫布，顯示清晰背景
        canvas.classList.add('hidden');

        // 2. 停止手勢操控，但保留相機串流，避免重複詢問權限
        stopCamera(false);

        // 3. 顯示讀條，從 100% 開始
        countdownContainer.classList.remove('hidden');
        // 強制 reflow 使 transition 正確觸發
        countdownProgress.style.transition = 'none';
        countdownProgress.style.width = '100%';
        // 等一個 frame 再打開 transition，讓後續 width 變化有動畫
        requestAnimationFrame(() => {
            countdownProgress.style.transition = 'width 0.08s linear';
        });

        // 4. 更新對話框文字 (Stage 2)
        dialogueTextEl.classList.remove('small');
        dialogueTextEl.textContent = replacePlaceholders(DIALOGUE_TEXT.countdown);

        clearWipeFallbackTimer();

        // 5. 啟動 10 秒線性倒數，每 50ms 遞減一次
        let timeLeft = GAME_CONFIG.COUNTDOWN_TIME;
        const totalDuration = GAME_CONFIG.COUNTDOWN_TIME;

        countdownInterval = setInterval(() => {
            timeLeft -= 0.05;
            const fillPct = Math.max(0, (timeLeft / totalDuration) * 100);
            countdownProgress.style.width = `${fillPct}%`;

            if (timeLeft <= 0) {
                clearInterval(countdownInterval);
                countdownInterval = null;
                countdownProgress.style.width = '0%';
                // 倒數結束 → 進入問答階段
                setTimeout(startQuestionState, 300); // 短暫停頓後切換
            }
        }, 50);
    }

    function clearWipeFallbackTimer() {
        if (wipeFallbackTimeoutId) {
            clearTimeout(wipeFallbackTimeoutId);
            wipeFallbackTimeoutId = null;
        }
    }

    // ==========================================================================
    // F. Stage 3 — 問答選項顯示
    // ==========================================================================

    function startQuestionState() {
        gameState = 'question';
        console.log('❓ 進入第三階段：問答！');

        const level = LEVELS[currentLevelIndex];

        // 隱藏讀條
        countdownContainer.classList.add('hidden');

        // 顯示問答選項覆蓋層（在窗戶上方）
        qaOverlay.classList.remove('hidden');

        // 更新對話框文字 (Stage 3)
        dialogueTextEl.classList.add('small');
        dialogueTextEl.textContent = replacePlaceholders(level.question || DIALOGUE_TEXT.question);

        // 更新問答選項文字與正確答案
        qaButtons.forEach((btn, index) => {
            const option = level.options[index];
            if (option) {
                btn.textContent = option.text;
                btn.dataset.answer = option.answer;
            }
        });

        // 用水滴遮罩擋住圖片，避免答題時直接看到答案
        if (windowBgImage) {
            windowBgImage.src = 'Image/water_drops.jpg';
            windowBgImage.alt = '遮蔽圖片';
        }

        // 重置按鈕樣式和手勢追蹤狀態
        qaButtons.forEach(btn => btn.classList.remove('correct-flash', 'wrong-flash', 'gesture-hover'));
        currentHighlightBtn = null;
        hoveredButtonTime = 0;

        // 重新啟動相機以支持手勢控制
        isWebcamActive = true;
        console.log('📸 手勢控制已啟動，指向按鈕以選擇答案...');
        if (!cameraInitialized) {
            initMediapipe();
        }
    }

    // ==========================================================================
    // G. 問答按鈕點擊處理 → Stage 4
    // ==========================================================================

    qaButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (gameState !== 'question') return;
            gameState = 'result';

            const isCorrect = btn.dataset.answer === 'correct';

            // 短暫視覺回饋動畫
            btn.classList.add(isCorrect ? 'correct-flash' : 'wrong-flash');

            // 短暫延遲後切換到結果畫面
            setTimeout(() => startResultState(isCorrect), 600);
        });
    });

    // ==========================================================================
    // H. Stage 4 — 結果畫面 (答對/答錯文字 + 操作按鈕)
    // ==========================================================================

    function startResultState(isCorrect) {
        gameState = 'result';
        console.log(`🏆 進入第四階段：結果 (${isCorrect ? '答對' : '答錯'})`);

        const level = LEVELS[currentLevelIndex];
        if (windowBgImage && level) {
            windowBgImage.src = level.image;
            windowBgImage.alt = `戶外 ${level.alt}`;
        }

        // 隱藏問答按鈕
        qaOverlay.classList.add('hidden');
        wrongResultOverlay.classList.add('hidden');
        resultActions.classList.add('hidden');

        // 顯示結果文字
        dialogueTextEl.classList.remove('small');
        dialogueTextEl.textContent = replacePlaceholders(isCorrect ? DIALOGUE_TEXT.correct : DIALOGUE_TEXT.wrong);

        if (isCorrect) {
            // 正確時顯示原本的結果按鈕列
            resultActions.classList.remove('hidden');
        } else {
            // 答錯時顯示專屬錯誤 UI
            wrongResultOverlay.classList.remove('hidden');
        }
    }

    // 「再試一次」按鈕 → 回到問答階段
    btnRetry.addEventListener('click', () => {
        if (gameState !== 'result') return;
        console.log('▶ 再試一次，回到問答畫面');
        wrongResultOverlay.classList.add('hidden');
        startQuestionState();
    });

    // 「先回去」按鈕 → 回到主畫面
    btnGiveUp.addEventListener('click', () => {
        if (gameState !== 'result') return;
        console.log('🏠 先回到主畫面');
        wrongResultOverlay.classList.add('hidden');
        showStartupScreen();
    });

    // 「下一題」按鈕 → 進入下一關或回到第一關
    btnNext.addEventListener('click', () => {
        if (gameState !== 'result') return;
        if (currentLevelIndex < LEVELS.length - 1) {
            currentLevelIndex += 1;
            console.log(`▶ 進入下一關：${LEVELS[currentLevelIndex].name}`);
        } else {
            currentLevelIndex = 0;
            console.log('▶ 已完成所有關卡，返回第一關');
        }
        resizeCanvas(); // resizeCanvas 內部會呼叫 resetFog
    });

    // 「今天先這樣」按鈕 → 也重置（可根據需求改為返回主選單等）
    btnHome.addEventListener('click', () => {
        if (gameState !== 'result') return;
        console.log('🏠 今天先這樣，回到主畫面...');
        showStartupScreen();
    });

    // ==========================================================================
    // I. 相機關閉輔助函式
    // ==========================================================================

    function stopCamera(stopStream = false) {
        isWebcamActive = false;
        gesturePointersContainer.innerHTML = '';
        
        // 清除手勢控制狀態
        fingerPoints = [];
        lastSelectionTime = 0;
        if (currentHighlightBtn) {
            currentHighlightBtn.classList.remove('gesture-hover');
            currentHighlightBtn = null;
        }
        
        if (stopStream && cameraInstance && typeof cameraInstance.stop === 'function') {
            try {
                cameraInstance.stop();
                console.log('📹 Mediapipe 鏡頭已停止。');
            } catch (stopError) {
                console.warn('停止鏡頭時發生錯誤：', stopError);
            }
        }
    }

    // ==========================================================================
    // J. Mediapipe 手勢識別 (自動相機載入 + 食指追蹤 + 安全沙盒容錯)
    // ==========================================================================

    let isWebcamActive = false;
    let cameraInstance = null;
    let gestureLastX   = null;
    let gestureLastY   = null;
    let fingerPoints = []; // 存儲最近的手指位置用於握拳檢測
    let currentHighlightBtn = null; // 當前高亮的按鈕
    let lastSelectionTime = 0; // 防止快速重複選擇
    let hoveredButtonTime = 0; // 追蹤指向同一按鈕的時間

    function initMediapipe() {
        console.log('正在啟動 Mediapipe 手勢後台...');

        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });

        hands.onResults(onHandResults);

        cameraInstance = new Camera(videoElement, {
            onFrame: async () => {
                if (isWebcamActive) await hands.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });

        cameraInstance.start()
            .then(() => {
                cameraInitialized = true;
                isWebcamActive = true;
                hideCameraError();
                console.log('📸 背景視訊鏡頭已順利開啟，手勢偵測就緒！');
            })
            .catch(err => {
                console.warn('無法啟動相機 (file:// 協議限制或無相機設備)：', err);
                const message = window.location.protocol === 'file:'
                    ? '請使用本地伺服器啟動此遊戲，然後在 Chrome 中開啟 http://localhost:8000，並允許相機權限。'
                    : `相機無法啟動：${err.name || err.message || 'Permission denied'}`;
                showCameraError(message);
            });
    }

    function onHandResults(results) {
        try {
            if (!isWebcamActive) {
                gesturePointersContainer.innerHTML = '';
                return;
            }
            gesturePointersContainer.innerHTML = '';

            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const landmarks    = results.multiHandLandmarks[0];
                const indexFingerTip = landmarks[8];
                const thumbTip = landmarks[4];
                
                if (!indexFingerTip) return;

                // ============================================================
                // 計算食指在屏幕上的位置
                // ============================================================
                const rect    = canvas.getBoundingClientRect();
                const screenX = (1 - indexFingerTip.x) * rect.width;
                const screenY = indexFingerTip.y * rect.height;
                const canvasX = (1 - indexFingerTip.x) * canvas.width;
                const canvasY = indexFingerTip.y * canvas.height;

                // ============================================================
                // 根據遊戲狀態進行不同的手勢處理
                // ============================================================
                if (gameState === 'wiping') {
                    if (gestureLastX !== null && gestureLastY !== null) {
                        wipeContinuousPath(gestureLastX, gestureLastY, canvasX, canvasY);
                    } else {
                        wipeSingleSpot(canvasX, canvasY);
                    }
                    gestureLastX = canvasX;
                    gestureLastY = canvasY;
                    registerWipeAction();
                    checkClearedPercentage();
                    maybeForceCountdownFallback();
                    createVisualPointer(screenX, screenY);
                } else if (gameState === 'question') {
                    // ========================================================
                    // Stage 3：問答階段的手勢控制
                    // ========================================================
                    gestureLastX = null;
                    gestureLastY = null;

                    // 儲存最近的手指點位用於握拳檢測
                    fingerPoints.push({
                        indexTip: { x: indexFingerTip.x, y: indexFingerTip.y },
                        thumbTip: { x: thumbTip.x, y: thumbTip.y },
                        time: Date.now()
                    });

                    // 只保留最近 5 個點
                    if (fingerPoints.length > 5) {
                        fingerPoints.shift();
                    }

                    // 檢測握拳手勢（手指和拇指距離很近）
                    detectFistGesture(landmarks, indexFingerTip, thumbTip);

                    // 高亮指向的按鈕
                    highlightButtonByGesture(screenX, screenY);
                    
                    // 在窗戶上顯示食指指針
                    createVisualPointer(screenX, screenY);
                } else {
                    gestureLastX = null;
                    gestureLastY = null;
                }
            } else {
                gestureLastX = null;
                gestureLastY = null;
                // 移除高亮
                if (currentHighlightBtn) {
                    currentHighlightBtn.classList.remove('gesture-hover');
                    currentHighlightBtn = null;
                }
            }
        } catch (error) {
            console.error('⚠️ 手勢背景處理發生容錯異常:', error);
            gestureLastX = null;
            gestureLastY = null;
        }
    }

    // ======================================================================
    // 檢測握拳手勢
    // ======================================================================
    function detectFistGesture(landmarks, indexTip, thumbTip) {
        if (gameState !== 'question') return;
        
        // 方法 1：檢測握拳（手指和拇指距離近）
        const indexThumbDist = Math.sqrt(
            Math.pow(indexTip.x - thumbTip.x, 2) + 
            Math.pow(indexTip.y - thumbTip.y, 2)
        );

        // 距離小於 0.1 表示握拳（可調整閾值）
        if (indexThumbDist < 0.1) {
            const now = Date.now();
            if (now - lastSelectionTime > 800) { // 800ms 防抖
                if (currentHighlightBtn) {
                    console.log('✋ 握拳手勢偵測 - 選擇：', currentHighlightBtn.textContent);
                    currentHighlightBtn.click(); // 模擬點擊
                    lastSelectionTime = now;
                }
            }
        }
    }

    // ======================================================================
    // 根據食指位置高亮相應按鈕 + 超時自動選擇
    // ======================================================================
    function highlightButtonByGesture(screenX, screenY) {
        if (gameState !== 'question') return;

        let targetBtn = null;
        const now = Date.now();

        // 檢查食指指向哪個按鈕
        qaButtons.forEach(btn => {
            const rect = btn.getBoundingClientRect();
            
            // 判斷食指是否在按鈕範圍內（擴展範圍以提高容易度）
            const margin = 30; // 擴展 30px 的觸發範圍
            if (screenX >= rect.left - margin && screenX <= rect.right + margin &&
                screenY >= rect.top - margin && screenY <= rect.bottom + margin) {
                targetBtn = btn;
            }
        });

        // 更新高亮狀態和超時計時器
        if (targetBtn !== currentHighlightBtn) {
            // 移除舊的高亮
            if (currentHighlightBtn) {
                currentHighlightBtn.classList.remove('gesture-hover');
            }
            
            // 添加新的高亮
            if (targetBtn) {
                targetBtn.classList.add('gesture-hover');
                hoveredButtonTime = now; // 重置計時器
                console.log('👆 指向按鈕：' + targetBtn.textContent + ' (1.2秒後自動選擇)');
            }
            
            currentHighlightBtn = targetBtn;
        } else if (targetBtn && now - hoveredButtonTime > 1200) {
            // 指向同一按鈕超過 1.2 秒，自動選擇
            if (now - lastSelectionTime > 800) {
                console.log('⏱️ 超時自動選擇：' + targetBtn.textContent);
                targetBtn.click();
                lastSelectionTime = now;
                hoveredButtonTime = now; // 重置計時器
            }
        }
    }

    function createVisualPointer(x, y) {
        if (gameState !== 'wiping' && gameState !== 'question') return;

        const pointer = document.createElement('div');
        pointer.className = 'finger-pointer';
        if (GAME_CONFIG.WIPE_SHAPE === 'square') pointer.style.borderRadius = '4px';

        const indicatorSize = gameState === 'wiping' 
            ? Math.max(20, GAME_CONFIG.WIPE_SIZE * 0.25)
            : 20; // 問答階段用較小的指針
            
        pointer.style.width  = `${indicatorSize}px`;
        pointer.style.height = `${indicatorSize}px`;
        pointer.style.left   = `${x}px`;
        pointer.style.top    = `${y}px`;
        gesturePointersContainer.appendChild(pointer);
    }
});
