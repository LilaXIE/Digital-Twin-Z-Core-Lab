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

打开 `http://127.0.0.1:5173/overview.html` 查看总览，或打开 `http://127.0.0.1:5173/twin.html` 查看三维孪生。

## 常用命令

- `npm run build`：构建静态页面
- `npm run test:bridge`：检查运行中的数据桥接（只读）
- `npm run test:resilience`：隔离模拟数据库故障与恢复
- `npm run bim:convert`：将 IFC 转为 Fragments
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
│   ├── public/models/fragments/  # 浏览器运行时模型
│   ├── src/
│   │   ├── dashboard/            # 总览页面逻辑
│   │   ├── shared/               # 共享样式与主题
│   │   └── twin/                 # 三维孪生页面逻辑
│   ├── index.html                # 默认入口
│   ├── overview.html
│   ├── device.html
│   └── twin.html
├── .env.example                  # InfluxDB 配置模板
├── package.json                  # npm 命令与依赖
├── start-zb202.bat               # Windows 一键启动
├── start-zb202.command           # macOS 双击启动
└── vite.config.js                # Vite 构建配置
```

配置文件 `.env` 仅保存在本地，不要提交真实凭据。

## AI 新风推荐

桥接服务每 10 分钟重算一次：在预测 CO₂ 不超过 750 ppm（限值 800 ppm）的前提下，求最小新风量。计算结合单区 CO₂ 模型、由 CO₂ 反推的人数估计、会议日程，以及天文台京士柏的室外温湿度。默认以影子模式（L1）运行，不会写入 BMS。在 `http://127.0.0.1:5173/strategy.html` 查看推荐详情，或查看三维孪生左侧的 AI 卡片。方法与待确认事项见[策略方案](strategy/ai-recommendation-strategy.md)。

- `scripts/strategy/`：策略引擎；每条推荐通过 WebSocket 以 `recommendation` 消息推送。
- `data/strategy/calibration.json`：标定结果，覆盖 `scripts/strategy/config.mjs` 中的默认值。
- `data/strategy/calendar.json`：在推荐页面录入的会议。
- `data/strategy/shadow-log.jsonl`：每条推荐和影子指令的本地日志，不提交。
- 三维孪生中的虚拟演示数据仅在 `?demo=1`（或双击时钟）时显示，并标注"Demo data"。

## 室外太阳辐射

开发桥接服务每 10 分钟采集香港天文台京士柏的 1 分钟平均总太阳辐射（W/m²），将原始香港时间转换为 UTC，写入 InfluxDB 后读回提供给前端。来源：https://data.weather.gov.hk/weatherAPI/hko_data/regional-weather/latest_1min_solar.csv 。

Measurement 为 `hko-solar-radiation`，field 为 `solarRadiation`，station tag 为 `King's Park`。默认使用天气 bucket，可通过 `ZB202_SOLAR_INFLUX_BUCKET` 指定；天气 token 需要读写权限。超过 30 分钟的观测显示为缺失。天气数据继续供室外环境使用，但不出现在 IoT 设备列表中。

## 文件维护与运行方式

项目使用本地开发服务或局域网静态服务，GitHub Pages 已停用，仓库不再包含自动部署工作流。

公开网站 [zb202-digital-twin.vercel.app](https://zb202-digital-twin.vercel.app) 是部署在 Vercel 上的静态前端（`vercel.json`）。Vercel 无法运行数据桥，因此只读数据桥部署在 Render 上（`render.yaml`）：

1. 在 Render 中选择 New > Blueprint，选择本仓库，并在提示时填写 `ZB202_INFLUX_TOKEN`。
2. 在 Vercel 项目中把 `VITE_ZB202_BRIDGE_URL` 设为 Render 地址（使用 `wss://`，例如 `wss://zb202-bridge.onrender.com`），然后运行 `vercel deploy --prod` 重新部署。

公开数据桥设置了 `ZB202_BRIDGE_READ_ONLY=true`：可以查看实时数据，但会拒绝插座控制、会议编辑和模式切换，这些操作仍可在本地数据桥上使用。`ZB202_BRIDGE_ALLOWED_ORIGINS` 列出允许连接的前端来源。要临时连接其他数据桥，可在页面地址后加 `?bridge=wss://host`。Render 免费方案在 15 分钟无访问后休眠，唤醒约需 30 秒。

- `web/` 保存前端源码和浏览器使用的静态模型；`models/` 保存可编辑的 Revit 与 IFC 源模型。
- `scripts/` 保存开发服务、数据桥接与模型转换工具；`tests/` 保存验证脚本。
- `data/device-inventory/` 是历史设备清单备份，供人工核对，不是前端实时数据源。
- `docs/` 保存架构及排障记录；[中文说明](README.zh-CN.md) 位于此目录。
- `.env` 是当前本地配置，`.env.example` 是唯一配置模板。
- `node_modules/` 是可重新安装的依赖；`dist/` 是 `npm run build` 生成的产物，两者不提交 Git。使用 `npm run serve:lan` 前先构建。
- 根目录的 Windows/macOS 启动器保留，方便双击启动。`web/device.html` 保留用于兼容旧设备链接。
