# 数据与节拍

## 来源

- 人工技法：用户提供的《大起板 技法时间点.xlsx》，Sheet1!A2:B14，共 13 条。空白 Sheet2 / Sheet3 未生成数据。
- 录音：原项目 `public/audio/daqiban.wav`，保持原字节。
- SHA-256：`6bbe1729182f2d8bfadeb57fda3f4979f29529c593d3942eacd868a23a7b1a05`。
- `song.json` 的 `annotationWorkbook` 保存工作簿文件名和 SHA-256。

| 秒区间 | 原表技法 | 次数 / 属性 |
| --- | --- | --- |
| 1–2 | 上滑连续四次，需要有四次上滑展示 | 4 |
| 2–6 | 揉弦 渐强 | crescendo |
| 6–9 | 揉弦 渐弱 | diminuendo |
| 10–13 | 下滑四次 | 4 |
| 13–16 | 揉弦 渐强 | crescendo |
| 16–18 | 揉弦 渐弱 | diminuendo |
| 21–22 | 滑柔 | 1 |
| 23–24 | 滑柔 | 1 |
| 25–26 | 滑柔 | 1 |
| 26–27 | 滑柔 | 1 |
| 27–28 | 上滑连续四次，需要有四次上滑展示 | 4 |
| 32–33 | 打音 | 1 |
| 34–35 | 回滑音 | 1 |

## 区间与派生点位

人工区间精度为整秒，不含每一下的独立毫秒标注。`makeChart` 在四连区间等分 4 个点，点位来源字段 `timingSource` 为 `interval-subdivision`。揉弦在当前 BPM 节拍网格中筛选区间内拍点，来源为 `estimated-beat-in-manual-interval`。其他技法使用区间开始时间，来源为 `manual-interval-start`。

为维持连续出手，估算节拍中距离技法点至少 220 ms 的点作为中性节拍，来源为 `estimated-beat`，没有 `technique` 字段。中性音符可能处于标注区间内，但不增加技法动作的人工计数。默认结果 102 个游戏目标，包含全部 13 段技法证据和三组四连动作。

地图的 `[start,end)` 判定避免相邻区间端点同时激活。图形属于技法动作的设计表达，不能视为实测基频曲线；下方波形取自原音频测量。

## BPM

`analyzeBeat`：Hann 窗、1024 点 FFT、256 样本步长，正向对数频谱通量形成起音包络；局部去均值后，对 65–185 BPM 做周期相关搜索，并优化全曲拍点相位。运行于 Web Worker。音乐第一次开始时分析解码后的真实音频，后续复用内存结果。默认片段得到 165.5 BPM、相位 0.0871 秒，属于自动估计。

节奏测试只生成等间隔的每拍目标，不使用旧版零散起音候选。全局固定拍速可能无法完全表达传统器乐的速度伸缩；用户可半速、倍速或输入 30–300 BPM。BPM 并非技法识别模型输出。

算法背景：[librosa beat tracking](https://librosa.org/doc/0.10.2/generated/librosa.beat.beat_track.html)。本项目自带 JavaScript 实现，不依赖 librosa 运行。音频时间同步依据 [Web Audio 时间轴](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime)。

## 播放与判定

- 所有音符共享单一 Web Audio 源时钟。反馈没有等待或暂停状态。
- 输入先减去手动校准值，再在对应轨道寻找最近且未结算的音符。
- PERFECT ≤70 ms，GOOD ≤180 ms，超过窗口为 MISS。
- 每个目标只结算一次。按键自动重复被忽略；触摸在 pointerdown 判定。
- 暂停倒计时会保留剩余时间；恢复不会重放已经走过的音符。
- 页面切换使旧异步音频请求失效，不能在后台意外开始上一种模式。
- 结果按本轮谱面总数计算；空击打断连击，不凭空增加待评音符。
- 成绩与标注均为本机缓存，不同步到服务器。
