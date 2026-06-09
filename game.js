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
    WIPE_SHAPE: 'square',
    WIPE_SIZE: 140,
    LEFT_PANE_THRESHOLD: 50,
    RIGHT_PANE_THRESHOLD: 50,
    COUNTDOWN_TIME: 10,
};

const LEVELS = [
    {
        id: '阿土伯',
        name: '阿土伯',
        image: 'Image/阿土伯.png',
        alt: '阿土伯',
        safeObjects: ['阿土伯', '推車', '紅色瓶子', '白色煙霧', '窗外場景'],
        allowedQuestionTypes: ['顏色', '物件', '數量', '明顯位置'],
        fallbackQuestion: {
            question: '{userTitle}！那個人在推著車子，車上放了一個好大的瓶子，還一直冒煙耶！那是什麼顏色的瓶子呀？',
            options: ['大紅色', '天空藍', '草綠色'],
            correctIndex: 0,
            hint: '想想看推車上最明顯的瓶子是什麼顏色。'
        }
    },
    {
        id: '王媽媽',
        name: '王媽媽',
        image: 'Image/王媽媽.png',
        alt: '王媽媽',
        safeObjects: ['王媽媽', '白蘿蔔', '綠色葉子', '手提蔬菜'],
        allowedQuestionTypes: ['物件', '顏色', '人物動作'],
        fallbackQuestion: {
            question: '{userTitle}！是隔壁王媽媽耶。她手裡提著一根好大、綠色葉子的蔬菜，那是什麼菜呀？',
            options: ['白蘿蔔', '大鳳梨', '長絲瓜'],
            correctIndex: 0,
            hint: '想想看她手上那根白白長長的蔬菜。'
        }
    },
    {
        id: '不要叫我叔叔',
        name: '不要叫我叔叔',
        image: 'Image/不要叫我叔叔.png',
        alt: '不要叫我叔叔',
        safeObjects: ['叔叔', '灰色圓筒罐', '瓦斯桶', '肩膀扛著桶子'],
        allowedQuestionTypes: ['物件', '顏色', '人物動作'],
        fallbackQuestion: {
            question: '{userTitle}！那個叔叔好厲害，肩膀上扛了一個灰色、看起來好重的圓筒罐子，那是什麼桶子呀？',
            options: ['飲水桶', '瓦斯桶', '垃圾桶'],
            correctIndex: 1,
            hint: '想想看那個灰色、很重的圓筒罐。'
        }
    },
    {
        id: '阿財伯',
        name: '阿財伯',
        image: 'Image/阿財伯.png',
        alt: '阿財伯',
        safeObjects: ['阿財伯', '黑色高筒雨鞋', '鞋子', '腳上穿著高筒鞋'],
        allowedQuestionTypes: ['物件', '顏色', '人物動作'],
        fallbackQuestion: {
            question: '{userTitle}！阿財伯今天穿得好奇怪喔，他的腳上穿著一雙好高、黑黑的鞋子，那是做什麼用的鞋子呀？',
            options: ['高筒雨鞋', '藍白拖鞋', '運動鞋'],
            correctIndex: 0,
            hint: '想想看他腳上那雙黑黑高高的鞋。'
        }
    },
    {
        id: '導護小孩',
        name: '導護小孩',
        image: 'Image/導護小孩.png',
        alt: '導護小孩',
        safeObjects: ['小孩', '黃色旗子', '手上拿旗子', '導護場景'],
        allowedQuestionTypes: ['顏色', '物件', '人物動作'],
        fallbackQuestion: {
            question: '{userTitle}！{grandchildName}下課了耶，他手上拿著一個旗子，那是什麼顏色的旗子？',
            options: ['黑色', '白色', '黃色'],
            correctIndex: 2,
            hint: '想想看他手上那面亮亮的旗子。'
        }
    }
];

let currentLevelIndex = 0;
let wipeFallbackTimeoutId = null;

// AI 出題相關狀態變數
let currentQuestionData = null;
let aiQuestionCache = {};
let hintTimerId = null;
let hintShown = false;
let isGeneratingQuestion = false;

// ============================================================
// AI 出題輔助函式（模組層級，不依賴 DOM）
// ============================================================

function normalizeQuestionData(data, level) {
    const fallback = level.fallbackQuestion;
    if (!data || typeof data !== 'object') return fallback;
    if (!data.question || typeof data.question !== 'string') return fallback;
    if (!Array.isArray(data.options) || data.options.length !== 3) return fallback;
    if (![0, 1, 2].includes(data.correctIndex)) return fallback;
    if (!data.hint || typeof data.hint !== 'string') return fallback;
    return {
        question: data.question,
        options: data.options.slice(0, 3),
        correctIndex: data.correctIndex,
        hint: data.hint,
        targetObject: data.targetObject || '',
        questionType: data.questionType || ''
    };
}

function getFallbackQuestion(level) {
    return { ...level.fallbackQuestion, source: 'fallback' };
}

async function generateQuestionForLevel(level) {
    if (aiQuestionCache[level.id]) {
        return aiQuestionCache[level.id];
    }
    try {
        isGeneratingQuestion = true;
        const response = await fetch('/api/generate-question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                levelId: level.id || level.name,
                imagePath: level.image,
                safeObjects: level.safeObjects,
                allowedQuestionTypes: level.allowedQuestionTypes,
                fallbackQuestion: level.fallbackQuestion
            })
        });
        const result = await response.json();
        const questionData = normalizeQuestionData(result.questionData, level);
        aiQuestionCache[level.id] = { ...questionData, source: result.source || 'gemini' };
        return aiQuestionCache[level.id];
    } catch (error) {
        console.warn('Gemini 出題失敗，使用 fallback 題目。', error);
        return getFallbackQuestion(level);
    } finally {
        isGeneratingQuestion = false;
    }
}

async function getQuestionBeforeQuestionStage(level) {
    if (currentQuestionData) return currentQuestionData;
    const timeoutPromise = new Promise(resolve => {
        setTimeout(() => resolve(getFallbackQuestion(level)), 1000);
    });
    const aiPromise = generateQuestionForLevel(level);
    currentQuestionData = await Promise.race([aiPromise, timeoutPromise]);
    return currentQuestionData;
}

function formatOptionText(text) {
    if (!text) return '';
    const clean = String(text).replace(/\s/g, '');
    if (clean.length <= 4) {
        return clean.split('').join('　');
    }
    return clean;
}

// ==========================================================================
// ★【對話框文字設定區 - 後台調整區】★
// ==========================================================================
const DIALOGUE_TEXT = {
    wiping:    '{userTitle}，窗戶起霧了，擦一下吧。',
    countdown: '{userTitle}！你要記清楚窗戶外面有甚麼喔！！',
    question:  '那個人在推著車子，車上放了一個好大的瓶子，還一直冒煙耶！那是什麼顏色的瓶子呀？',
    correct:   '{userTitle}你答對了！你很棒餒！要不要繼續下一題？',
    wrong:     '哎呀，答錯了！沒關係，再想想看喔！',
};

window.addEventListener('DOMContentLoaded', () => {
    const canvas       = document.getElementById('fog-canvas');
    const ctx          = canvas.getContext('2d');
    const windowWrapper = document.getElementById('window-wrapper');
    const windowBgImage = document.getElementById('window-bg-image');
    const videoElement              = document.getElementById('webcam-video');
    const gesturePointersContainer  = document.getElementById('gesture-pointers');
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
    const startupOverlay        = document.getElementById('startup-overlay');
    const startGameBtn         = document.getElementById('start-game-btn');
    const startupCharacterImage = document.getElementById('startup-character-image');
    const nameInput            = document.getElementById('grandchild-name-input');
    const userGenderInputs     = document.querySelectorAll('input[name="user-gender"]');
    const grandchildGenderInputs = document.querySelectorAll('input[name="grandchild-gender"]');
    const nameBadge            = document.getElementById('name-badge');
    const characterImage       = document.getElementById('character-image');

    let userGender = 'female';
    let grandchildGender = 'male';
    let grandchildName = '王小明';
    let userTitle = '阿罵';
    let gameStarted = false;
    let cameraInitialized = false;

    const offscreen = document.createElement('canvas');
    offscreen.width  = 40;
    offscreen.height = 25;
    const oCtx = offscreen.getContext('2d');

    const waterDropsImg = new Image();
    let isTextureLoaded = false;

    let gameState        = 'wiping';
    let countdownInterval = null;
    let lastCheckTime    = 0;

    let wipeFallbackStart   = null;
    let wipeGestureCount    = 0;
    let pointerDown         = false;
    let pointerLastX        = null;
    let pointerLastY        = null;

    waterDropsImg.onload = () => {
        isTextureLoaded = true;
        console.log('💧 靜態霧氣紋理載入成功，啟動畫布...');
        resizeCanvas();
    };
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

    function resetFog() {
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        gameState = 'wiping';
        hideCameraError();
        fingerPoints = [];
        lastSelectionTime = 0;
        hoveredButtonTime = 0;
        if (currentHighlightBtn) {
            currentHighlightBtn.classList.remove('gesture-hover');
            currentHighlightBtn = null;
        }
        wipeFallbackStart = null;
        wipeGestureCount = 0;
        if (wipeFallbackTimeoutId) {
            clearTimeout(wipeFallbackTimeoutId);
            wipeFallbackTimeoutId = null;
        }
        pointerDown = false;
        pointerLastX = null;
        pointerLastY = null;
        countdownContainer.classList.add('hidden');
        canvas.classList.remove('hidden');
        qaOverlay.classList.add('hidden');
        wrongResultOverlay.classList.add('hidden');
        resultActions.classList.add('hidden');
        dialogueTextEl.classList.remove('small');
        dialogueTextEl.textContent = replacePlaceholders(DIALOGUE_TEXT.wiping);
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
        qaButtons.forEach(btn => btn.classList.remove('correct-flash', 'wrong-flash'));
        if (gameStarted) {
            isWebcamActive = true;
            if (!videoElement.srcObject || !videoElement.srcObject.active) {
                console.log('🔄 重新初始化 Mediapipe 與鏡頭串流...');
                initMediapipe();
            }
        }
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = 'rgba(235, 240, 245, 1.0)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
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
        if (elapsed >= 10) {
            console.log(`⏩ 使用者已擦拭 ${Math.floor(elapsed)} 秒，進入倒數階段`);
            startCountdownState();
            return;
        }
        if (wipeGestureCount >= 35) {
            console.log('⏩ 擦拭手勢次數達到備援門檻，但仍以時間為主觸發倒數');
        }
    }

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
            let thermosCleared = 0;
            const thermosTotal = (22 - 10 + 1) * (20 - 5 + 1);
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
            if (oldmanPercent >= GAME_CONFIG.RIGHT_PANE_THRESHOLD) {
                console.log(`✅ 阿土伯區域已清除 ${oldmanPercent.toFixed(1)}%，進入倒數`);
                startCountdownState();
            }
        } catch (err) {
            console.error('⚠️ 離屏透明度檢測模組發生異常:', err);
        }
    }

    // ============================================================
    // AI 提示泡泡相關函式
    // ============================================================

    async function prepareQuestionForCurrentLevel() {
        const level = LEVELS[currentLevelIndex];
        currentQuestionData = await generateQuestionForLevel(level);
    }

    function startHintTimer() {
        clearHintTimer();
        hintShown = false;
        hintTimerId = setTimeout(() => {
            if (gameState !== 'question') return;
            if (hintShown) return;
            if (currentHighlightBtn) return;
            showAIHint();
        }, 5000);
    }

    function clearHintTimer() {
        if (hintTimerId) {
            clearTimeout(hintTimerId);
            hintTimerId = null;
        }
    }

    function showAIHint() {
        if (!currentQuestionData || !currentQuestionData.hint) return;
        hintShown = true;
        const hintText = replacePlaceholders(currentQuestionData.hint);
        const hintBubble = document.getElementById('ai-hint-bubble');
        const hintTextEl = document.getElementById('ai-hint-text');
        if (hintBubble && hintTextEl) {
            hintTextEl.textContent = hintText;
            hintBubble.classList.remove('hidden');
            return;
        }
        dialogueTextEl.classList.add('small');
        dialogueTextEl.textContent = `提示：${hintText}`;
    }

    function hideAIHint() {
        const hintBubble = document.getElementById('ai-hint-bubble');
        if (hintBubble) {
            hintBubble.classList.add('hidden');
        }
    }

    function startCountdownState() {
        if (gameState !== 'wiping') return;
        gameState = 'countdown';
        console.log('🎉 進入第二階段：倒數記憶！');

        prepareQuestionForCurrentLevel();

        canvas.classList.add('hidden');
        stopCamera(false);
        countdownContainer.classList.remove('hidden');
        countdownProgress.style.transition = 'none';
        countdownProgress.style.width = '100%';
        requestAnimationFrame(() => {
            countdownProgress.style.transition = 'width 0.08s linear';
        });
        dialogueTextEl.classList.remove('small');
        dialogueTextEl.textContent = replacePlaceholders(DIALOGUE_TEXT.countdown);
        clearWipeFallbackTimer();

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
                setTimeout(startQuestionState, 300);
            }
        }, 50);
    }

    function clearWipeFallbackTimer() {
        if (wipeFallbackTimeoutId) {
            clearTimeout(wipeFallbackTimeoutId);
            wipeFallbackTimeoutId = null;
        }
    }

    async function startQuestionState() {
        gameState = 'question';
        console.log('❓ 進入第三階段：問答！');

        const level = LEVELS[currentLevelIndex];

        if (!currentQuestionData) {
            currentQuestionData = await getQuestionBeforeQuestionStage(level);
        }

        countdownContainer.classList.add('hidden');
        qaOverlay.classList.remove('hidden');

        dialogueTextEl.classList.add('small');
        dialogueTextEl.textContent = replacePlaceholders(currentQuestionData.question);

        qaButtons.forEach((btn, index) => {
            const optionText = currentQuestionData.options[index];
            btn.textContent = formatOptionText(optionText);
            btn.dataset.answer = index === currentQuestionData.correctIndex ? 'correct' : 'wrong';
        });

        if (windowBgImage) {
            windowBgImage.src = 'Image/water_drops.jpg';
            windowBgImage.alt = '遮蔽圖片';
        }

        qaButtons.forEach(btn => btn.classList.remove('correct-flash', 'wrong-flash', 'gesture-hover'));
        currentHighlightBtn = null;
        hoveredButtonTime = 0;

        hideAIHint();
        startHintTimer();

        isWebcamActive = true;
        console.log('📸 手勢控制已啟動，指向按鈕以選擇答案...');
        if (!cameraInitialized) {
            initMediapipe();
        }
    }

    qaButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            if (gameState !== 'question') return;
            gameState = 'result';
            clearHintTimer();
            hideAIHint();
            const isCorrect = btn.dataset.answer === 'correct';
            btn.classList.add(isCorrect ? 'correct-flash' : 'wrong-flash');
            setTimeout(() => startResultState(isCorrect), 600);
        });
    });

    function startResultState(isCorrect) {
        gameState = 'result';
        console.log(`🏆 進入第四階段：結果 (${isCorrect ? '答對' : '答錯'})`);
        const level = LEVELS[currentLevelIndex];
        if (windowBgImage && level) {
            windowBgImage.src = level.image;
            windowBgImage.alt = `戶外 ${level.alt}`;
        }
        qaOverlay.classList.add('hidden');
        wrongResultOverlay.classList.add('hidden');
        resultActions.classList.add('hidden');
        dialogueTextEl.classList.remove('small');
        dialogueTextEl.textContent = replacePlaceholders(isCorrect ? DIALOGUE_TEXT.correct : DIALOGUE_TEXT.wrong);
        if (isCorrect) {
            resultActions.classList.remove('hidden');
        } else {
            wrongResultOverlay.classList.remove('hidden');
        }
    }

    btnRetry.addEventListener('click', () => {
        if (gameState !== 'result') return;
        console.log('▶ 再試一次，回到問答畫面');
        wrongResultOverlay.classList.add('hidden');
        startQuestionState();
    });

    btnGiveUp.addEventListener('click', () => {
        if (gameState !== 'result') return;
        console.log('🏠 先回到主畫面');
        clearHintTimer();
        hideAIHint();
        wrongResultOverlay.classList.add('hidden');
        showStartupScreen();
    });

    btnNext.addEventListener('click', () => {
        if (gameState !== 'result') return;
        currentQuestionData = null;
        hintShown = false;
        clearHintTimer();
        hideAIHint();
        if (currentLevelIndex < LEVELS.length - 1) {
            currentLevelIndex += 1;
            console.log(`▶ 進入下一關：${LEVELS[currentLevelIndex].name}`);
        } else {
            currentLevelIndex = 0;
            console.log('▶ 已完成所有關卡，返回第一關');
        }
        resizeCanvas();
    });

    btnHome.addEventListener('click', () => {
        if (gameState !== 'result') return;
        console.log('🏠 今天先這樣，回到主畫面...');
        clearHintTimer();
        hideAIHint();
        showStartupScreen();
    });

    function stopCamera(stopStream = false) {
        isWebcamActive = false;
        gesturePointersContainer.innerHTML = '';
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

    let isWebcamActive = false;
    let cameraInstance = null;
    let gestureLastX   = null;
    let gestureLastY   = null;
    let fingerPoints = [];
    let currentHighlightBtn = null;
    let lastSelectionTime = 0;
    let hoveredButtonTime = 0;

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
                    ? '請使用本地伺服器啟動此遊戲，然後在 Chrome 中開啟 http://localhost:3000，並允許相機權限。'
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
                const rect    = canvas.getBoundingClientRect();
                const screenX = (1 - indexFingerTip.x) * rect.width;
                const screenY = indexFingerTip.y * rect.height;
                const canvasX = (1 - indexFingerTip.x) * canvas.width;
                const canvasY = indexFingerTip.y * canvas.height;
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
                    gestureLastX = null;
                    gestureLastY = null;
                    fingerPoints.push({
                        indexTip: { x: indexFingerTip.x, y: indexFingerTip.y },
                        thumbTip: { x: thumbTip.x, y: thumbTip.y },
                        time: Date.now()
                    });
                    if (fingerPoints.length > 5) fingerPoints.shift();
                    detectFistGesture(landmarks, indexFingerTip, thumbTip);
                    highlightButtonByGesture(screenX, screenY);
                    createVisualPointer(screenX, screenY);
                } else {
                    gestureLastX = null;
                    gestureLastY = null;
                }
            } else {
                gestureLastX = null;
                gestureLastY = null;
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

    function detectFistGesture(landmarks, indexTip, thumbTip) {
        if (gameState !== 'question') return;
        const indexThumbDist = Math.sqrt(
            Math.pow(indexTip.x - thumbTip.x, 2) +
            Math.pow(indexTip.y - thumbTip.y, 2)
        );
        if (indexThumbDist < 0.1) {
            const now = Date.now();
            if (now - lastSelectionTime > 800) {
                if (currentHighlightBtn) {
                    console.log('✋ 握拳手勢偵測 - 選擇：', currentHighlightBtn.textContent);
                    currentHighlightBtn.click();
                    lastSelectionTime = now;
                }
            }
        }
    }

    function highlightButtonByGesture(screenX, screenY) {
        if (gameState !== 'question') return;
        let targetBtn = null;
        const now = Date.now();
        qaButtons.forEach(btn => {
            const rect = btn.getBoundingClientRect();
            const margin = 30;
            if (screenX >= rect.left - margin && screenX <= rect.right + margin &&
                screenY >= rect.top - margin && screenY <= rect.bottom + margin) {
                targetBtn = btn;
            }
        });
        if (targetBtn !== currentHighlightBtn) {
            if (currentHighlightBtn) {
                currentHighlightBtn.classList.remove('gesture-hover');
            }
            if (targetBtn) {
                targetBtn.classList.add('gesture-hover');
                hoveredButtonTime = now;
                console.log('👆 指向按鈕：' + targetBtn.textContent + ' (1.2秒後自動選擇)');
            }
            currentHighlightBtn = targetBtn;
        } else if (targetBtn && now - hoveredButtonTime > 1200) {
            if (now - lastSelectionTime > 800) {
                console.log('⏱️ 超時自動選擇：' + targetBtn.textContent);
                targetBtn.click();
                lastSelectionTime = now;
                hoveredButtonTime = now;
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
            : 20;
        pointer.style.width  = `${indicatorSize}px`;
        pointer.style.height = `${indicatorSize}px`;
        pointer.style.left   = `${x}px`;
        pointer.style.top    = `${y}px`;
        gesturePointersContainer.appendChild(pointer);
    }
});
