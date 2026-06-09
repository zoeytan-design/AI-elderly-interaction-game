require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ============================================================
// 後端驗證函式
// ============================================================
function validateQuestionData(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.question !== 'string' || data.question.trim().length === 0) return false;
    if (!Array.isArray(data.options) || data.options.length !== 3) return false;
    if (!data.options.every(opt => typeof opt === 'string' && opt.trim().length > 0)) return false;
    if (![0, 1, 2].includes(data.correctIndex)) return false;
    if (typeof data.hint !== 'string' || data.hint.trim().length === 0) return false;
    if (typeof data.targetObject !== 'string' || data.targetObject.trim().length === 0) return false;
    if (!['顏色', '物件', '數量', '明顯位置', '人物動作'].includes(data.questionType)) return false;
    return true;
}

// ============================================================
// POST /api/generate-question
// ============================================================
app.post('/api/generate-question', async (req, res) => {
    const { levelId, imagePath, safeObjects, allowedQuestionTypes, fallbackQuestion } = req.body;

    const buildFallbackResponse = () => ({
        success: false,
        source: 'fallback',
        questionData: {
            question: fallbackQuestion?.question || '',
            options: fallbackQuestion?.options || ['', '', ''],
            correctIndex: fallbackQuestion?.correctIndex ?? 0,
            hint: fallbackQuestion?.hint || '',
            targetObject: 'fallback',
            questionType: 'fallback'
        }
    });

    if (!process.env.GEMINI_API_KEY) {
        console.warn('[generate-question] GEMINI_API_KEY 未設定，使用 fallback');
        return res.json(buildFallbackResponse());
    }

    try {
        const safeImagePath = imagePath ? imagePath.replace(/\.\./g, '') : '';
        const imageFilePath = path.join(__dirname, safeImagePath);
        let base64Image = null;
        let mimeType = 'image/png';

        if (fs.existsSync(imageFilePath)) {
            const imageBuffer = fs.readFileSync(imageFilePath);
            base64Image = imageBuffer.toString('base64');
            const ext = path.extname(imageFilePath).toLowerCase();
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        } else {
            console.warn(`[generate-question] 圖片不存在: ${imageFilePath}，不傳圖片給 Gemini`);
        }

        const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

        const systemInstruction = `你是高齡友善互動記憶遊戲的出題系統。
玩家會先看一張窗外圖片 10 秒，之後圖片會被遮住，玩家需要根據記憶回答問題。
你的任務是根據圖片和人工標註資料，產生一題簡單、明確、適合長輩的觀察記憶題。

你不能自由幻想圖片內容。
你只能根據 safeObjects 和圖片中明顯可見的內容出題。
如果不確定，選擇最明顯、最安全的物件出題。`;

        const userPrompt = `關卡名稱：${levelId}
可用觀察物件：${Array.isArray(safeObjects) ? safeObjects.join('、') : safeObjects}
允許題型：${Array.isArray(allowedQuestionTypes) ? allowedQuestionTypes.join('、') : allowedQuestionTypes}

請生成一題觀察記憶題。

規則：
1. 題目必須簡單、具體、沒有主觀判斷。
2. 題目只能問：顏色、物件、數量、明顯位置、人物動作。
3. 不要問心情、意圖、人物關係、太小或太模糊的細節。
4. 問題文字不要超過 45 個中文字。
5. 三個選項都要短，單個選項不要超過 6 個中文字。
6. 三個選項必須明顯不同，不要出現太接近的選項。
7. 正確答案只能有一個。
8. 提示文字不要直接講出答案，但要幫助玩家回想。
9. 提示文字不要超過 35 個中文字。
10. 請只輸出 JSON，不要輸出 markdown，不要解釋。`;

        const responseSchema = {
            type: 'object',
            properties: {
                question: { type: 'string' },
                options: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 3,
                    maxItems: 3
                },
                correctIndex: { type: 'integer', minimum: 0, maximum: 2 },
                hint: { type: 'string' },
                targetObject: { type: 'string' },
                questionType: {
                    type: 'string',
                    enum: ['顏色', '物件', '數量', '明顯位置', '人物動作']
                }
            },
            required: ['question', 'options', 'correctIndex', 'hint', 'targetObject', 'questionType']
        };

        const contentParts = [];
        if (base64Image) {
            contentParts.push({ inlineData: { mimeType, data: base64Image } });
        }
        contentParts.push({ text: userPrompt });

        const response = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: contentParts }],
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema
            }
        });

        let questionData = null;
        try {
            questionData = JSON.parse(response.text);
        } catch (parseErr) {
            console.warn('[generate-question] JSON 解析失敗，使用 fallback', parseErr.message);
            return res.json(buildFallbackResponse());
        }

        if (!validateQuestionData(questionData)) {
            console.warn('[generate-question] Gemini 回傳資料驗證失敗，使用 fallback', questionData);
            return res.json(buildFallbackResponse());
        }

        return res.json({
            success: true,
            source: 'gemini',
            questionData
        });

    } catch (err) {
        console.error('[generate-question] Gemini API 呼叫失敗，使用 fallback:', err.message);
        return res.json(buildFallbackResponse());
    }
});

app.listen(PORT, () => {
    console.log(`🎮 遊戲伺服器已啟動：http://localhost:${PORT}`);
    if (!process.env.GEMINI_API_KEY) {
        console.warn('⚠️  GEMINI_API_KEY 未設定，將使用 fallback 題目。請複製 .env.example 為 .env 並填入 API key。');
    }
});
