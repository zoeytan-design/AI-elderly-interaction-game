# 互動窗戶擦拭遊戲 🪟

一個為高齡長輩設計的互動式網頁遊戲，結合手勢識別和記憶訓練。

## 🎮 遊戲流程

### Stage 1：擦窗戶 👐
- **目標**：用手勢擦掉窗戶上的霧氣
- **操作**：將手指放在鏡頭前，進行擦拭動作
- **完成條件**：當紅色溫度計區域和農夫區域的清除率都達到 40% 時進入下一階段

### Stage 2：倒數記憶 ⏱️
- **目標**：在 10 秒的倒數計時內記住窗戶外的場景
- **內容**：
  - 一個紅色溫度計（溫度瓶）
  - 一位農夫阿伯和他的推車
- **操作**：純觀察，無需互動

### Stage 3：問題與答案 ❓
- **問題**：「那個阿伯在推著車子，車上放了一個好大的瓶子，還一直冒煙耶！那是什麼顏色的瓶子呀？」
- **選項**：
  1. 大紅色 ✅（正確答案）
  2. 天空藍
  3. 草綠色
- **手勢操控**：
  - 👆 用食指指向想選擇的答案
  - 1.2 秒後自動選擇（或握拳確認）
  - 指向的按鈕會高亮顯示

### Stage 4：結果反饋 🏆
- **答對**：顯示鼓勵文字，可選擇下一題
- **答錯**：顯示提示文字，可選擇重試或下一題

## 🚀 運行方式

### 方式 1：使用啟動腳本（推薦）
```bash
雙擊 start-server.bat
然後在瀏覽器中打開 http://localhost:8000
```
> 建議使用 Google Chrome 開啟，因為 Chrome 會在 localhost 上允許相機權限。若用 file:// 協議開啟，瀏覽器通常會拒絕相機存取。

### 方式 2：使用 Python
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```
然後在瀏覽器中打開 `http://localhost:8000`

### 方式 3：使用 Node.js
```bash
# 需要先安裝 http-server
npm install -g http-server
http-server
```

### 方式 4：使用 VS Code Live Server 擴展
1. 安裝 "Live Server" 擴展
2. 右擊 index.html 並選擇 "Open with Live Server"

## 🎯 手勢控制

### 擦窗戶階段
- **手勢**：在鏡頭前移動食指
- **反饋**：出現藍色圓點指示當前手指位置
- **效果**：擦除霧氣區域

### 問答階段
- **手勢 1**：用食指指向想選的答案按鈕
  - 按鈕會亮起橙色邊框
  - 指向 1.2 秒後自動選擇
  
- **手勢 2**：握拳確認選擇
  - 食指和拇指靠近時偵測為握拳
  - 立即選擇當前指向的按鈕

## ⚙️ 配置參數

在 `game.js` 的 `GAME_CONFIG` 中可調整：

```javascript
GAME_CONFIG = {
    WIPE_SHAPE: 'square',      // 擦除形狀：'square' 或 'circle'
    WIPE_SIZE: 140,            // 擦除範圍大小（像素）
    LEFT_PANE_THRESHOLD: 40,   // 左側清除率門檻（%）
    RIGHT_PANE_THRESHOLD: 40,  // 右側清除率門檻（%）
    COUNTDOWN_TIME: 10,        // 倒數時間（秒）
}
```

## 📝 自訂內容

### 修改玩家名字
在 `index.html` 中找到：
```html
<div class="name-badge">
    王　小　明
</div>
```

### 修改對話文字
在 `game.js` 中的 `DIALOGUE_TEXT` 物件

### 修改題目和答案
在 `index.html` 中的問答按鈕部分：
```html
<button class="qa-btn" data-answer="correct">大　紅　色</button>
<button class="qa-btn" data-answer="wrong">天　空　藍</button>
<button class="qa-btn" data-answer="wrong">草　綠　色</button>
```

## 🔍 瀏覽器相機權限

當首次運行時，瀏覽器會要求相機權限。請：
1. 尋找地址欄旁的相機圖標
2. 點擊並選擇 "允許" 或 "Allow"
3. 刷新頁面

## 💻 技術棧

- **前端**：HTML5 + CSS3 + JavaScript
- **手勢識別**：MediaPipe (Google 的手勢追蹤 AI)
- **繪圖**：Canvas API
- **字體**：HanWangKaiMediumChuIn（注音字體）

## 🎨 設計考慮

- **高齡友善**：
  - 超大字體（30-42px）
  - 清晰的色彩對比
  - 簡單的手勢操作
  - 清晰的視覺反饋

- **無障礙**：
  - 支持純手勢操控
  - 無需點擊鍵盤
  - 視覺和聲音提示

## 📦 文件結構

```
互動遊戲/
├── index.html           # 主遊戲頁面
├── game.js              # 遊戲邏輯和手勢識別
├── style.css            # 樣式和動畫
├── start-server.bat     # 本地服務器啟動腳本
├── 參考UI/              # UI 設計參考
├── 孫子1.png           # 角色圖片
├── 阿土伯.png          # NPC 圖片
├── 窗框 1.png          # 窗框圖片
├── water_drops.jpg     # 霧氣紋理
└── HanWangKaiMediumChuIn.ttf  # 注音字體
```

## 🐛 常見問題

### 相機無法啟動
- **原因**：file:// 協議限制，需要 HTTP/HTTPS
- **解決**：使用 start-server.bat 或上述任一本地服務器方式

### 手勢無法偵測
- **原因**：光線不足或相機被阻擋
- **解決**：
  - 確保光線充足
  - 清潔相機鏡頭
  - 在瀏覽器開發者工具中檢查相機權限

### 按鈕點不動
- **原因**：可能在 Stage 1 或 Stage 2，按鈕還未出現
- **解決**：先完成擦窗戶，等待倒數完成

## 👨‍💼 技術支持

如有問題，請檢查：
1. 瀏覽器控制台的錯誤信息（F12 → Console）
2. 確認所有資源文件已加載
3. 確認使用最新版本的 Chrome、Firefox 或 Edge

---

**祝您遊戲愉快！** 🎉
