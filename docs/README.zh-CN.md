# ZB202 Digital Twin

[English](../README.md)

ZB202 实验室环境监测数字孪生。前端展示 BIM 模型和传感器数据，实时数据由本地 InfluxDB 桥接服务提供。

## 启动

需要 Node.js 20.19+。在项目目录运行：

```sh
npm install
cp .env.example .env
npm run dev
```

在 `.env` 中填入 InfluxDB Token 等连接信息。Windows 可双击 `start-zb202.bat`，macOS 可双击 `start-zb202.command`。

打开 `http://127.0.0.1:5173/twin.html` 查看三维孪生。原来的总览（`overview.html`）、AI 页面（`strategy.html`）和设备链接（`device.html`）现在会分别跳转到 `twin.html#devices`、`twin.html#ai` 和 `twin.html#sensor=AM103-05`。

### 页面参数

- `?lang=zh|zh-Hant|en`：语言（否则沿用上次的选择，再按浏览器语言）。
- `?demo=1`：演示模式，显示虚拟数据并始终带“演示数据”标记；设置菜单中也可开关。
- `?kiosk=1`：实验室大屏：无操作 3 分钟后进入待机展示，画质从“中”档起步，宽度 ≥1600 px 时使用大屏尺寸。
- `?mode=internal`：内部模式（坐标拾取、画质档位与帧率、桥接诊断、未接入模块、AI 影子模式记录）。
- `?quality=high|medium|low`：固定画质档位。
- `?bridge=wss://host` 或 `?bridgePort=8788`：连接其他数据桥接。

界面按 [UI/UX 改版方案](ui-redesign-plan.md) 实现，[实现说明](ui-redesign-implementation.md) 记录了验证结果和与方案不同的地方。

## 常用命令

- `npm run build`：构建静态页面
- `npm run test:bridge`：检查运行中的数据桥接（只读）
- `npm run test:resilience`：隔离模拟数据库故障与恢复
- `npm run bim:convert`：将 IFC 转为 Fragments
- `npm run bim:plan`：重新生成开场动画用的平面图线条（`web/public/models/plan-lines.json`）
- `npm run fonts:css`：重新生成自托管字体的 `@font-face`（`web/src/twin/styles/fonts*.css`）
- `npm run test:ui`：回放数据消息和一句话状态规则的单元测试
- `npm run bridge:mock`：端口 8788 上的模拟数据桥接，不需要 InfluxDB 即可调界面（打开 `twin.html?bridgePort=8788`）
- `npm run test:strategy`：AI 新风策略单元测试
- `npm run strategy:backtest -- --days 14`：用 InfluxDB 历史数据回测策略（加 `--synthetic` 可离线运行）
- `npm run strategy:calibrate -- --days 60`：估计传感器偏差、室外 CO₂ 和衰减新风量；加 `--write` 保存结果

## 项目结构

```text
ZB202_DT/
├── docs/                         # 架构、排障记录与中文说明
├── data/device-inventory/        # 设备清单备份（CSV / XLSX）
├── models/
│   ├── ifc/                      # IFC 源模型
│   └── rvt/                      # Revit 源模型
├── scripts/
│   ├── influxdb-bridge.mjs       # InfluxDB → WebSocket 桥接
│   └── ifc-to-fragments.mjs      # IFC 转 Fragments
├── tests/                        # 数据链路与隔离故障测试
├── web/
│   ├── public/
│   │   ├── fonts/                # 自托管 Inter（拉丁字母）；思源黑体在构建时从 npm 打包
│   │   └── models/               # Fragments 模型与开场动画平面图
│   ├── src/
│   │   ├── shared/               # 桥接地址、访问密钥与传感器状态工具
│   │   └── twin/
│   │       ├── app.js            # 启动与装配
│   │       ├── config/           # 场地参数与环境阈值（thresholds.json）
│   │       ├── data/             # 桥接、实时与演示数据、派生值、回放
│   │       ├── scene/            # 渲染、材质、光照、实时日光、标记、效果
│   │       ├── ui/               # 外壳、主题面板、传感器详情、AI、告警、设置
│   │       └── styles/           # 设计变量、玻璃、动效、组件、字体
│   ├── index.html                # 默认入口
│   ├── twin.html                 # 数字孪生
│   ├── overview.html             # 跳转到 twin.html#devices
│   ├── strategy.html             # 跳转到 twin.html#ai
│   └── device.html               # 旧设备链接跳转
├── .env.example                  # InfluxDB 配置模板
├── package.json                  # npm 命令与依赖
├── start-zb202.bat               # Windows 一键启动
├── start-zb202.command           # macOS 双击启动
└── vite.config.js                # Vite 构建配置
```

配置文件 `.env` 仅保存在本地，不要提交真实凭据。

## AI 新风推荐

桥接服务每 10 分钟重算一次：在预测 CO₂ 不超过 750 ppm（限值 800 ppm）的前提下，求最小新风量。计算结合单区 CO₂ 模型、由 CO₂ 反推的人数估计、会议日程，以及天文台京士柏的室外温湿度。默认以影子模式（L1）运行，不会写入 BMS。点击三维孪生左侧的 AI 卡片查看推荐详情（或打开 `twin.html#ai`）。方法与待确认事项见[策略方案](strategy/ai-recommendation-strategy.md)。

- `scripts/strategy/`：策略引擎；每条推荐通过 WebSocket 以 `recommendation` 消息推送。
- `data/strategy/calibration.json`：标定结果，覆盖 `scripts/strategy/config.mjs` 中的默认值。
- `data/strategy/calendar.json`：在 AI 详情页录入的会议。
- `data/strategy/shadow-log.jsonl`：每条推荐和影子指令的本地日志，不提交。
- 三维孪生中的虚拟演示数据仅在演示模式（`?demo=1` 或设置菜单）下显示，并始终标注“演示数据”；关闭演示模式后立即清除。

## 室外太阳辐射

开发桥接服务每 10 分钟采集香港天文台京士柏的 1 分钟平均总太阳辐射（W/m²），将原始香港时间转换为 UTC，写入 InfluxDB 后读回提供给前端。来源：https://data.weather.gov.hk/weatherAPI/hko_data/regional-weather/latest_1min_solar.csv 。

Measurement 为 `hko-solar-radiation`，field 为 `solarRadiation`，station tag 为 `King's Park`。默认使用天气 bucket，可通过 `ZB202_SOLAR_INFLUX_BUCKET` 指定；天气 token 需要读写权限。超过 30 分钟的观测显示为缺失。如果 token 没有写入权限，数据桥会直接显示 HKO 的观测值。室外温度、湿度和风速风向也取自 HKO 京士柏站，除非有气象站通过 InfluxDB 上报数据。天气数据用于环境主题中的室外环境和场景的实时日光，不出现在设备列表中。

## 文件维护与运行方式

项目使用本地开发服务或局域网静态服务，GitHub Pages 已停用，仓库不再包含自动部署工作流。

公开网站 [zb202-digital-twin.vercel.app](https://zb202-digital-twin.vercel.app) 是部署在 Vercel 上的静态前端（`vercel.json`）。Vercel 无法运行数据桥，因此只读数据桥部署在 Render 上（`render.yaml`）：

1. 在 Render 中选择 New > Blueprint，选择本仓库，并在提示时填写 `ZB202_INFLUX_TOKEN`。
2. 在 Vercel 项目中把 `VITE_ZB202_BRIDGE_URL` 设为 Render 地址（使用 `wss://`，例如 `wss://zb202-bridge.onrender.com`），然后运行 `vercel deploy --prod` 重新部署。

公开网站上的插座控制、会议编辑和模式切换需要输入 `ZB202_BRIDGE_WRITE_KEY` 中设置的访问密钥，每个浏览器会话只需输入一次。插座控制还需要 `ZB202_MQTT_USERNAME` 和 `ZB202_MQTT_PASSWORD`。`ZB202_BRIDGE_REQUIRE_KEY=true` 会在未设置密钥时拒绝控制命令；`ZB202_BRIDGE_READ_ONLY=true` 则拒绝所有控制命令。在 Render 免费方案上，公开数据桥保存的会议会在服务重启后丢失。`ZB202_BRIDGE_ALLOWED_ORIGINS` 列出允许连接的前端来源。要临时连接其他数据桥，可在页面地址后加 `?bridge=wss://host`。Render 免费方案在 15 分钟无访问后休眠，唤醒约需 30 秒。

- `web/` 保存前端源码和浏览器使用的静态模型；`models/` 保存可编辑的 Revit 与 IFC 源模型。
- `scripts/` 保存开发服务、数据桥接与模型转换工具；`tests/` 保存验证脚本。
- `data/device-inventory/` 是历史设备清单备份，供人工核对，不是前端实时数据源。
- `docs/` 保存架构及排障记录；[中文说明](README.zh-CN.md) 位于此目录。
- `.env` 是当前本地配置，`.env.example` 是唯一配置模板。
- `node_modules/` 是可重新安装的依赖；`dist/` 是 `npm run build` 生成的产物，两者不提交 Git。使用 `npm run serve:lan` 前先构建。
- 根目录的 Windows/macOS 启动器保留，方便双击启动。`web/device.html` 保留用于兼容旧设备链接。
