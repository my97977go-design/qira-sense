# 从听见到听懂 · 中国音乐审美体验 v8

2026年江苏省高校“人工智能通识教育教学改革研究”专项课题申报 · 前期成果（课题尚未立项，本原型为申报前期成果，不表述为立项成果）。课题方向：人工智能赋能教育科学。课题正式名称集中配置在 `src/data/course.json`，界面不硬编码。

React 19 + Vite，附轻量 Node.js 排行榜服务（可选）。v8 在 v7 基础上增量开发：以 v7 为唯一代码基线，未删除任何 v7 已完成功能。

## v8 新增：毫秒级事件架构与三个新系统

### schemaVersion 2 → 3

- 标注数据升级为 v3：区间标注（`annotations`，含 `layer`：technique / expression）+ 毫秒级事件表（`events`）。
- 事件结构：`{ id, annotationId, technique, anchor, start?, end?, timingPrecision, reviewStatus, label }`。
- 存储键 `qira-human-annotations-v3`；读取顺序 v3 → 旧 v2（自动迁移）→ 随项目原始标注（自动迁移）。旧 v2 数据不会覆盖已保存的 v3。
- 校验放宽：同层重叠只产生 `validationWarnings`，跨层重叠允许；只有非法区间、重复 ID、未知技法/结构等硬错误才拒绝载入。
- `repeatCount > 1` 的等分落点只作为 legacy fallback，标记 `timingSource: "legacy-derived-subdivision"`，不冒充真实标注；教师确认的毫秒级事件（`human-millisecond`）直接替代等分。

### 教师标注台（Teacher Maintenance → 标注台）

打开《大起板》波形与音高曲线，显示机器候选（`public/analysis-candidates.json`，由 `scripts/analyze_audio.py` 真实生成，31 个候选）。候选 ≠ 已验证技法：采纳后默认 `human-confirmed / needs-review`，需教师精修锚点并确认。支持：候选循环播放、技法选择、start/anchor/end 数字输入与时间轴拖拽、Split / Merge / Reject、删除、Undo / Redo（Ctrl+Z / Ctrl+Shift+Z）、光标试听、保存 v3、导出 v3 JSON、手工新建事件。候选文件缺失时明确显示“机器候选尚未生成，可先人工标注”，不伪造。

### 自适应技法学习（技法训练）

弱项驱动选题：按各技法正确率加权抽取语境样本（`src/data/samples.json`，9 条，取自人工确认区间），避免紧邻重复同一样本；记录混淆对并用于干扰项。三选一作答、即时反馈与解释、掌握度侧栏、重置。标准独立样本（canonical）待补充，界面明确说明，不伪造音频。**不计入排行榜，不弹昵称窗口。**

### Final Test（无提示整曲识别）

整曲连续播放、无下落提示、无节拍填充；六个独立技法按钮（数字键 1—6），**不复用四轨 `laneOf()`**。事件级匹配评分：±180 ms 容差贪心匹配，输出 TP / 误分类 / FP / FN、Precision / Recall / F1（整体与分技法）。

诚实降级：正式计分只使用 `reviewStatus = confirmed` 且 `timingPrecision = human-millisecond` 的事件；当前初始数据只有 13 个整秒区间，无毫秒级事件，因此页面进入**演示模式**——明确横幅提示“完整精确测验需完成教师精细标注”，演示答案来自旧区间等分位置且标记非正式。教师完成标注后自动获得正式数据。**不计入排行榜。**

### 课程结构

第一章四个核心入口全部直接开放，无强制顺序：

1. 节奏热身（Rhythm）
2. 声音地图（SoundMap）
3. 技法训练（AdaptiveLearning）
4. Final Test（FinalListeningTest）

章节完成 = Final Test 达到掌握标准。默认规则 `overallF1 >= 0.70`，在 `src/learning/learningConfig.js` 的 `finalTestPassRule` 中配置，明确标记 **provisional（可配置演示默认，非实验验证标准）**。已具备识别能力者可直接测试通过解锁下一章。Guided Challenge（原四轨挑战）保留为“更多练习 / 提示挑战”次级入口，不是最终测评。旧固定三题 ListeningLesson 已移除，其交互思想并入自适应学习。

## 排行榜边界

排行榜只服务既有游戏：`rhythm`、`challenge`（自动弹窗与提交）。旧 `listening` 榜单保留历史演示数据，标签改为“看懂技法（历史）”，不再有新提交。Adaptive Learning 与 Final Test 绝不提交、不弹窗。

## 立即试玩

压缩包已经包含 `dist/` 构建结果，无需安装 npm 依赖。

1. 解压整个文件夹。
2. Windows 双击 `Start-Qira.cmd`。需要 Node.js 22 或更新的兼容版本。
3. 浏览器打开 http://127.0.0.1:5188 ，保持命令窗口开启。

也可以在项目目录运行：

```bash
node scripts/serve.mjs
```

不要直接双击 `index.html`。静态服务器需要正确提供 JS 模块与音频。核心学习与教师标注完全在本地浏览器运行；排行榜为可选 Node 服务。

## 机器候选与声学特征

`scripts/analyze_audio.py` 分析 F0、周期性、RMS、频谱质心、novelty 与起始候选，并输出上行/下行滑音与音高振荡候选（candidate ≠ verified technique）。本次已用项目内 venv（numpy/scipy/matplotlib）真实运行，生成：

- `public/analysis-candidates.json`：31 个候选，`sourceSha256` 与录音一致。
- `public/analysis-overview.png`：分析总览图。
- `src/data/features.json`：20 ms 级特征（`times[::2]` 导出），SoundMap 与标注台波形使用。

标注台优先读取 `annotation-features.json`（约 10 ms 级，可选）；不存在时回退 20 ms 特征，不阻塞标注。重新生成：

```bash
python -m venv .venv
.venv\Scripts\python -m pip install numpy scipy matplotlib
.venv\Scripts\python scripts/analyze_audio.py public/audio/daqiban.wav public
```

## 保留的 v7 能力

- **节奏热身**：Web Worker 分析 BPM（约 165.5），两拍按一下，支持手动 BPM、半速/倍速、节拍音、时差校准。
- **声音地图**：13 个秒级人工区间连续播放，技法随时间切换，实时音高曲线（YIN，独立 Worker）。
- **提示挑战（Guided Challenge）**：四轨下落式，D / F / J / K（或 1—4），提前显示技法，中性节拍填充，判定 ±70/±180 ms。
- **技法资料库**：8 个条目，教师可编辑/新增/导入/导出。
- **设置**：输入时差校准、BPM、标注 JSON 导入/导出/恢复原标注（已兼容 v3）。
- 首页交互弦模型、本地字体、页面隐藏自动暂停等体验细节不变。

## 操作

| 功能 | 操作 |
| --- | --- |
| 节奏测试 | 空格 / 点击打点按钮 |
| 提示挑战 | D 上滑，F 下滑与回滑，J 揉弦与滑柔，K 打音（或 1—4） |
| Final Test | 数字键 1—6 点技法，空格结束计分 |
| 标注台撤销/重做 | Ctrl+Z / Ctrl+Shift+Z（或 Ctrl+Y） |
| 暂停、恢复 | Esc / 底部播放键 |
| 手感与标注 | 右上角滑杆图标 |

## 继续开发

```bash
npm ci
npm run dev
npm test
npm run build
```

重要文件：

| 文件 | 用途 |
| --- | --- |
| `src/Experience.jsx` | 页面导航、全局键盘与音频控制 |
| `src/game/data.js` | v3 数据架构、v2→v3 迁移、校验、存储读取顺序 |
| `src/learning/learningConfig.js` | 六技法、容差、finalTestPassRule、学习者存储键 |
| `src/learning/finalTest.js` | 正式事件筛选与事件级匹配评分 |
| `src/learning/useLearner.js` | 学习者状态、弱项选题、混淆记录 |
| `src/audio/useClipPlayer.js` | 可复用片段播放（不触碰课程 screen） |
| `src/components/AnnotationStudio.jsx` | 教师毫秒级标注台 |
| `src/components/AdaptiveLearning.jsx` | 自适应技法学习 |
| `src/components/FinalListeningTest.jsx` | 无提示整曲识别 |
| `src/course/progress.js` | 四入口进度、章节完成 = Final Test 通过 |
| `src/data/samples.json` | 语境样本定义 |
| `tests/finaltest.test.mjs` | 评分与事件筛选测试 |

原录音保持原字节：38.877347 秒、44100 Hz、单声道。详见 `docs/DATA.md` 与 `docs/VALIDATION.md`。
