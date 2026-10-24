# 绳跃 · 独立开源跳绳视频计数

MIT 许可，浏览器本地识别，**不依赖 GPT、ChatGPT、OpenAI API 或 OpenAI 托管**。视频在设备内处理，不上传服务器；模型与运行库随网站提供，不需要密钥或账户登录。

## 使用

上传 MP4 / MOV / WebM 视频；普通并脚跳选“双脚起落”，跑步式换脚跳选“交替脚跳”。全身和脚部需要清晰，多人画面先框选一人。播放时显示骨架、运动轨迹与计数；暂停保留当前视频时间对应的次数，回看不重复累计。可以导出 CSV。

处理速度取决于设备，识别采用无声逐帧方式。默认 MediaPipe Full，性能较低设备可选择 Lite。

## 本地运行

安装 Python 3，双击“启动网页.bat”，或在项目目录运行：

```text
python serve.py
```

浏览器打开 http://127.0.0.1:8080 。不要直接双击 HTML 文件。

Git 仓库包含运行所需的模型和 WebAssembly；网页内的轻量源码 ZIP 不含第三方大文件，使用该 ZIP 时先安装 Node.js 22+ 并运行 `node download-assets.mjs`。有代理时，可用支持该选项的 Node 版本执行 `node --use-env-proxy --use-system-ca download-assets.mjs`。

## 部署

网站文件完整位于 `docs/`，可以部署到任何支持静态文件的 HTTPS 网站服务。GitHub Pages 使用 `main` 分支的 `/docs` 目录作为发布来源。无服务器端 API、登录网关或 GPT 依赖。

## 检查与准确性

```text
node tests/counter.test.mjs
python tests/evaluate.py 预测记录.csv 人工真值.csv
```

已检查合成姿态轨迹、噪声、弯膝、短暂丢点、长遮挡和时间轴计数。**真实视频“每 100 次误差不超过 1 次”的目标尚未完成标注验收，不能据合成测试宣称已达到。** 骨架识别推算人体起落，不直接检测绳子经过脚底。详见 ACCURACY.md。

## 开源与第三方许可

自有代码采用 MIT 许可，见 LICENSE。Google MediaPipe 运行库及模型遵循其原有许可，见 `docs/vendor/LICENSE`。

项目没有包含用户的视频、登录凭证或原托管平台的配置与历史。
