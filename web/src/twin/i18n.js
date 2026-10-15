// Trilingual copy: 简体中文 (zh), 繁體中文 (zh-Hant), English (en).
// Values are strings with {placeholders} or functions taking a values object.

export const LANGS = ["zh", "zh-Hant", "en"];

const zh = {
  appTitle: "ZB202 AI 赋能数字孪生平台",
  roomName: "ZB202",
  live: "实时",
  updatedAgo: "{ago}更新",
  dataDelayed: "数据延迟 · 最后更新 {time}",
  connecting: "正在连接数据服务",
  waitingData: "等待第一批数据",
  outdoorLine: "室外 {temp}",
  outdoorLineSky: "室外 {temp} · {sky}",
  skyClear: "晴", skyCloudy: "多云", skyOvercast: "阴",
  statsLine: "{sensors} 个传感器 · 今日 {readings} 条读数",
  hkTime: "香港时间",
  justNow: "刚刚", minutesAgo: "{n} 分钟前", hoursAgo: "{n} 小时前", daysAgo: "{n} 天前",

  co2: "CO₂", temperature: "温度", humidity: "湿度", occupancy: "人数", occupancyEstimated: "估计人数",
  pm25: "PM2.5", noise: "噪声", people: "{n} 人",
  good: "良好", caution: "注意", poor: "超标", comfortable: "舒适", cold: "偏冷", hot: "偏热", dry: "偏干", humid: "偏湿", stale: "数据过期",
  last24h: "过去 24 小时", replay24h: "回放这 24 小时", capsuleHint: "查看环境详情",
  sensorsAveraged: "{n} 个传感器平均", solarShort: "太阳辐射", tempShort: "温度", peopleShort: "人数", peopleEstimatedShort: "估计人数", totalPowerShort: "总功率", stationShort: "京士柏站", warmerThanIndoor: "比室内高 {v}°", coolerThanIndoor: "比室内低 {v}°", sameAsIndoor: "与室内相近",
  alarmPanelTitle: "告警与设备", viewAll: "查看全部", noOpenAlarms: "没有未处理的告警", devicesOnline: "设备在线", batteryLowCount: "{n} 个设备电量低于 20%", moreAlarms: "另有 {n} 项",
  socketsTotal: "合计", socketsOnCount: "{on}/{n} 个开启", allOff: "全部关闭", allOn: "全部打开", openEnergy: "查看能耗详情",
  ahuTitle: "AHU 运行", simulated: "模拟数据", ahuRunning: "运行中", ahuStandby: "待机", ahuAuto: "自动", ahuAfterHours: "非工作时间",
  supplyAir: "送风", returnAir: "回风", supplySetpoint: "送风设定", setpointDown: "降低送风设定温度", setpointUp: "提高送风设定温度",
  freshDamper: "新风阀", waterValve: "冷水阀", fanSpeed: "风机", followsAi: "跟随 AI", ahuNote: "尚未接入 BMS，调节只在本页模拟，不会发送到设备",

  sInUseGood: "空气良好，{n} 人在使用",
  sInUseGoodEstimated: "空气良好，约 {n} 人在使用",
  sInUseCaution: "CO₂ {v} ppm，{n} 人在使用，留意通风",
  sInUseRising: "CO₂ 正在上升，建议加大新风",
  sInUseHigh: "CO₂ 偏高，建议加大新风",
  sVacantSockets: "房间空置，{total} 个插座中 {on} 个仍在用电",
  sVacant: "房间空置",
  sAfterHours: "非工作时间",
  sDoorClosed: "门已关闭", sDoorOpen: "有门未关", sNoLeak: "无漏水", sLeak: "检测到漏水",
  sUnknownGood: "CO₂ {v} ppm，空气良好",
  sUnknownCaution: "CO₂ {v} ppm，留意通风",
  sUnknownPoor: "CO₂ {v} ppm，通风不足",
  sNoData: "暂时没有环境数据",

  allClear: "一切正常", alarmsCount: "{n} 项告警", estimatedShort: "估计",
  snapshot: "截图", settings: "设置", toolsAria: "工具", languageAria: "语言",
  tabHome: "总览", tabEnvironment: "环境", tabEnergy: "能耗", tabDevices: "设备", tabAi: "AI", tabsAria: "主要功能",
  resetView: "回到默认视角", close: "关闭", back: "返回",

  aiTitle: "AI 新风推荐", aiDamper: "风阀 {pct}%", aiPeak: "60 分钟内 CO₂ 峰值", aiInterrupted: "推荐更新中断 · 最后更新 {time}",
  aiWaiting: "等待第一条推荐", aiOpen: "查看 AI 推荐详情", aiAtMax: "新风已达上限", aiReplayHidden: "回放期间不显示推荐",
  aiNoData: "最近 20 分钟没有 CO₂ 数据，暂无推荐",

  envTitle: "环境", metricSwitch: "指标", timeline: "{metric}时间轴", measured: "实测", forecast: "AI 预测",
  limitLine: "限值 {v}", nowLine: "现在", replay: "回放", indoor: "室内环境", outdoor: "室外环境", outdoorSource: "香港天文台京士柏站",
  trends: "趋势", dryBulb: "干球温度", relHumidity: "相对湿度", wind: "风", solar: "太阳辐射", windText: "{dir}风 {speed} m/s",
  custom: "自定义", hours: "小时", rangeAria: "历史范围", noRecords: "这个时间段没有记录", loading: "正在加载…",
  compass: ["北", "东北", "东", "东南", "南", "西南", "西", "西北"],
  occupiedSeats: "座位占用",

  energyTitle: "能耗", totalPower: "总用电功率", sockets: "插座", allSockets: "全部",
  confirmOff: "关闭 {id}？", confirmOn: "打开 {id}？", confirmAllOff: "关闭全部插座？", confirmAllOn: "打开全部插座？", confirm: "确认", cancel: "取消",
  phaseConfirm: "等待确认", phaseQueued: "{id} 已排队", phaseSent: "{id} 已发送，等待设备回报", phaseApplied: "{id} 已{state}", phaseFailed: "{id} 控制失败：{reason}",
  phaseTimeout: "{id} 在 {s} 秒内没有回报", stateOn: "打开", stateOff: "关闭",
  controlUnavailable: "插座控制暂时不可用", reasonReadOnly: "此页面连接的是只读数据服务，只有本地桥接可以控制插座",
  reasonMqtt: "控制服务未连接", reasonBridge: "数据服务未连接", demandChart: "用电曲线", today: "今日", days7: "7 天", days30: "30 天",
  noPowerHistory: "这个时间段没有用电记录", notPlaced: "模型中尚未放置", demoControl: "演示模式：开关只在本页模拟，不会控制真实设备",
  accessKeyPrompt: "输入访问密钥后即可在此页面控制实验室插座。", keyTitle: "控制访问密钥", keyField: "访问密钥", keyUnlock: "解锁",

  devicesTitle: "设备", summary: "状态汇总", online: "在线", offline: "离线", fault: "故障", battery: "电池",
  searchDevices: "搜索设备", all: "全部", mep: "MEP", viewList: "列表", viewTable: "表格",
  colName: "设备名", colId: "编号", colStatus: "状态", colLatest: "最新数据",
  layers: "图层", layerArchi: "建筑", layerMep: "机电", layerSensors: "传感器", sensorModeAll: "标记与占用", sensorModeModel: "仅模型", sensorModeHidden: "隐藏",
  noResults: "没有找到“{q}”", noDevices: "没有设备",
  catEnvironment: "环境", catOccupancy: "占用", catDoor: "门磁", catLeak: "漏水", catSocket: "插座", catWeather: "气象", catOther: "其他",
  ahu: "AHU", ahuSupply: "送风温度", ahuReturn: "回风温度", ahuWater: "水阀", ahuOa: "新风阀", ahuFan: "风机频率", ahuSetpoint: "温度设定",
  notConnected: "未接入", bmsReserved: "BMS", bmsReservedCopy: "AHU 运行数据将在后续版本接入。",

  sensorData: "传感器数据", componentDetails: "构件详情", lastRecord: "最后记录 {ago}", noRecord: "暂无记录",
  history: "历史", bim: "BIM 属性", ifcType: "IFC 类型", globalId: "GlobalId", expressId: "Express ID", model: "模型",
  simulateFault: "模拟设备故障", restoreNormal: "恢复设备正常", readingsInRange: "所选 {range} 内有 {count} 条记录",
  historyFailed: "历史查询失败，请重试", statusNormal: "在线", statusFault: "故障", statusUnavailable: "数据源未连接", statusOffline: "离线",
  open: "开", closed: "关", occupied: "已占用", vacant: "未占用", leakYes: "检测到水浸", leakNo: "无水浸", on: "开", off: "关", unknown: "未知",

  alarmTitle: "告警", alarmActive: "进行中", alarmAcknowledged: "已确认", alarmAll: "全部", acknowledge: "确认", reopen: "重新打开",
  alarmDoor: "门磁打开", alarmLeak: "检测到漏水", alarmTamper: "传感器被拆动", alarmBattery: "需要更换电池",
  alarmSocketLoad: "插座负载超过阈值", alarmSocketVoltage: "插座电压异常", alarmConnection: "数据服务连接中断", alarmOffline: "传感器离线",
  alarmNoneFiltered: "没有{filter}的告警", newAlarm: "新告警", batteryRemaining: "剩余 {v}%",
  sensorStatus: "传感器状态", batteryStatus: "电池状态", dataService: "数据服务",

  settingsTitle: "设置", language: "语言", appearance: "外观", themeLight: "浅色", themeDark: "深色", themeSystem: "跟随系统",
  transparency: "透明度", standard: "标准", reduced: "降低", kiosk: "待机展示", demoMode: "演示模式", demoHint: "显示虚拟演示数据，并始终带“演示数据”标记",
  engineering: "工程工具", pickCoordinate: "坐标拾取", quality: "画质", qualityAuto: "自动", qualityHigh: "高", qualityMedium: "中", qualityLow: "低",
  copy: "复制", copied: "已复制", diagnostics: "数据桥接诊断", fps: "帧率",
  valuePreview: "数值预览（CO₂）", timePreview: "时间预览",

  badgeDemo: "演示数据", badgeReplay: "回放 · {time}", kioskHint: "待机展示中 · 触碰屏幕即可操作",
  replayPlay: "播放", replayPause: "暂停", replaySpeed: "速度", backToLive: "回到实时", replayLoading: "正在加载过去 24 小时的数据…",
  replayFailed: "回放数据加载失败", replayAria: "回放时间", replayEvent: "{device} {type}",

  snapshotSaved: "截图已保存", snapshotFooter: "ZB202 Digital Twin",
  bridgeDown: "暂时无法连接数据服务，正在重试…", bridgeRetryIn: "{s} 秒后重试",

  introLoading: "正在载入 BIM 模型", introSkip: "点击或按任意键跳过", loadFailed: "模型加载失败",
  loadRetryHint: "请通过 npm run dev 启动项目，并确认 Fragments 模型文件存在。", reload: "重新加载",
  rotate: "请将设备横向放置", viewerAria: "ZB202 三维数字孪生",

  aiPageEyebrow: "ZB202 · 预测型新风控制", recommended: "推荐新风量", currentCo2: "当前 CO₂", peak60: "未来 60 分钟 CO₂ 峰值",
  co2Chart: "CO₂ 预测：按推荐运行 vs 按假设现状运行", occupancyChart: "人数时间线", occupancySub: "过去 6 小时估计 + 未来预测；灰色区域为日程中的会议",
  airflowChart: "推荐新风量变化", airflowSub: "过去 24 小时；悬停可查看对应风阀开度", tableView: "数据表",
  energySaved: "节能估算（相对假设的现状运行）", week: "本周", savedAir: "节省新风量", savedCooling: "节省冷量", savedElectric: "节省电量",
  calendar: "会议日程", calendarSub: "录入会议后，推荐会提前加大新风", meetingTitle: "名称", meetingPlaceholder: "组会", date: "日期", start: "开始", end: "结束", expectedPeople: "预计人数", add: "添加",
  basis: "推荐依据", internal: "内部：影子模式与控制级别", controlLevel: "控制级别", exitAuto: "退出自动控制",
  l2Note: "L2（BACnet 写入新风阀）需 FMO 授权并配置写入点位后才能启用。", connected: "已连接", disconnected: "数据桥接未连接",
  damperNow: "风阀 {pct}% · 假设现状 {now}%", forecastPoints: "30 分钟 {a} ppm · 60 分钟 {b} ppm", average8h: "8 小时平均 {v} ppm", average8hPartial: "8 小时平均 {v} ppm（已覆盖 {h} 小时）",
  occupancyMeasuredNote: "工位传感器实测", occupancyEstimatedNote: "根据 CO₂ 变化估计", updatedAt: "更新于 {time} · {mode}",
  recommendedSeries: "按推荐运行", baselineSeries: "按假设现状运行", targetLine: "目标 {v}", occupancyForecast: "预测人数", recommendedLps: "推荐新风量", baselineLps: "假设现状新风量",
  co2Sub: "预测时域 {h} 分钟；虚线为 800 ppm 限值和 750 ppm 控制目标", noData: "暂无数据", time: "时间", energySub: "室外条件：{source}；冷站 COP {cop}",
  sourceHko: "天文台京士柏", sourceStation: "气象站", sourceAssumed: "假设值", noMeetings: "暂无会议", deleteMeeting: "删除会议", saved: "已保存", invalidTime: "结束时间须晚于开始时间",
  modeL0: "仅推荐显示", modeL1: "影子模式", modeL2: "自动控制",
  statCommand: "影子风阀指令", statShadowPpm: "影子 CO₂", statExceed: "影子超标次数", statSteps: "影子运行步数", statGuards: "保护触发次数", statRmse30: "30 分钟预测误差 RMSE", statRmse60: "60 分钟预测误差 RMSE", statSource: "人数来源", statCalibrated: "最近标定",
  sourceCo2: "CO₂ 反推", sourceVs341: "VS341 工位",
  aiControlMode: "控制方式", aiAutoMode: "AI 自动模式", aiManualMode: "手动模式", aiSupplySetpoint: "建议送风温度设定", aiDamperRec: "建议新风阀开度",
  aiCurrentSetpoint: "当前设定 {v}", aiCurrentPosition: "假设现状 {v}", aiAwaiting: "等待执行", aiExecuted: "已执行",
  aiControlReadOnly: "需接入 AHU 数据并获 FMO 授权后才能切换；目前推荐只作显示", aiSetpointUnavailable: "送风温度建议需接入 AHU 数据后提供",
  sensorsMedian: "{n} 个传感器校正后中位数", sensorsExcluded: "已排除 {n} 个异常传感器", readingSuspect: "读数异常", healthBelowOutdoor: "校正后仍低于室外本底（约 {v} ppm）", healthFlatline: "超过 2 小时读数不变", healthDeviates: "与其他传感器相差超过 150 ppm", dataQuality: "数据质量", rawReading: "原始读数", correction: "校正量", calibratedOn: "标定日期", excludedFromRoom: "未计入房间数值",
  ahuOffTitle: "AHU 已停机", ahuNextStart: "下次开机 {when}", ahuStartCo2: "开机时预计 CO₂ {v} ppm", ahuStartCo2Tile: "开机时预计 CO₂", ahuState: "AHU 状态", ahuRunningState: "运行中", ahuHoursLine: "运行时间：工作日 {hours}", ahuHoursInferred: "根据每晚 CO₂ 下降时刻推断，待 FMO 确认", ahuNextStop: "下次停机 {when}", ahuBmsPending: "接入 BMS 后显示送回风温度、阀门开度和风机频率", ahuOffNoSavings: "下班后 AHU 不送新风，AI 无需调节，也不计算节能", tomorrow: "明天", weekSince: "本周（自{day}起）", meetingDefault: "会议", rAhuOff: "AHU 已停机，{when} 开机后再给出新风推荐", rAtMaxExceed: "预计 {at} CO₂ 超过 {limit} ppm，新风已达上限", rAtMax: "新风已达上限，CO₂ 可能高于 {target} ppm 控制目标", rMeetingNowRaised: "{name}进行中（预计 {people} 人），维持较大新风", rMeetingNow: "{name}进行中（预计 {people} 人），CO₂ 余量充足", rMeetingSoonRaised: "{at} {name}预计 {people} 人，提前加大新风", rMeetingSoon: "{at} {name}预计 {people} 人，当前 CO₂ 余量充足", rHeadroom: "CO₂ 余量充足，保持最小新风量", rRaised: "估计 {people} 人，按需加大新风，使 CO₂ 不超过 {target} ppm", rNoData: "最近 20 分钟没有 CO₂ 数据，暂时无法给出推荐",
  socketOn: "开", socketOff: "关", controlViewOnly: "仅供查看，插座开关由实验室成员操作", controlLocked: "输入访问密钥后可开关插座", updatedAtShort: "更新于 {time}", aiAdviceOnly: "AI 目前只给出建议，是否采用由设施管理团队决定", calendarLocked: "输入访问密钥后可添加或删除会议",
  connectionRetrying: "暂时连不上数据服务，正在自动重试",
  basisItems: (r) => [
    `控制目标：预测时域内任一时刻 CO₂ ≤ <b>${r.co2.target} ppm</b>，比 ${r.co2.limit} ppm 限值留 ${r.co2.limit - r.co2.target} ppm 余量（传感器与预测误差）。`,
    `最小新风量 = 2.5 L/s·人 × 人数 + 0.3 L/s·m² × 46.6 m²，当前为 <b>${r.airflow.minLps} L/s</b>。`,
    `预测时域 <b>${r.horizonMinutes} 分钟</b>，每 10 分钟滚动重算；日程中有会议时延长到会议结束（最长 180 分钟）。`,
    `在最小值与风阀全开（${r.airflow.maxLps} L/s）之间，求使预测峰值不超过目标的最小新风量：<b>${r.airflow.recommendedLps} L/s</b>（风阀 ${r.airflow.recommendedDamperPct}%）。`,
    `假设的现状运行方式：工作时间风阀 ${r.ahu.assumedDamperPct}% ≈ ${r.ahu.assumedLps} L/s，AHU 停机后约 ${r.ahu.offLps} L/s（渗透和排风）。按此运行，预测峰值为 <b>${r.co2.peakBaseline} ppm</b>。`,
    `AHU 运行时间按每晚 CO₂ 开始下降的时刻推断为工作日 ${r.ahu.hours}${r.ahu.source === "bms" ? "" : "（待 FMO 确认）"}；AHU 停机时 AI 无法调节新风，不计算节能。`,
    "风阀开度与新风量的换算曲线尚待 BMS 数据标定；在此之前新风量和节能数值为估算。",
  ],
};

const zhHant = {
  ...zh,
  appTitle: "ZB202 AI 賦能數碼孿生平台",
  live: "即時", updatedAgo: "{ago}更新", dataDelayed: "數據延遲 · 最後更新 {time}", connecting: "正在連接數據服務", waitingData: "等待第一批數據",
  outdoorLine: "室外 {temp}", outdoorLineSky: "室外 {temp} · {sky}", skyClear: "晴", skyCloudy: "多雲", skyOvercast: "陰",
  statsLine: "{sensors} 個感測器 · 今日 {readings} 條讀數", hkTime: "香港時間",
  justNow: "剛剛", minutesAgo: "{n} 分鐘前", hoursAgo: "{n} 小時前", daysAgo: "{n} 天前",
  temperature: "溫度", humidity: "濕度", occupancy: "人數", occupancyEstimated: "估計人數", noise: "噪音",
  good: "良好", caution: "注意", poor: "超標", comfortable: "舒適", cold: "偏冷", hot: "偏熱", dry: "偏乾", humid: "偏濕", stale: "數據過期",
  last24h: "過去 24 小時", replay24h: "回放這 24 小時", capsuleHint: "查看環境詳情",
  sensorsAveraged: "{n} 個感測器平均", solarShort: "太陽輻射", tempShort: "溫度", peopleShort: "人數", peopleEstimatedShort: "估計人數", totalPowerShort: "總功率", stationShort: "京士柏站", warmerThanIndoor: "比室內高 {v}°", coolerThanIndoor: "比室內低 {v}°", sameAsIndoor: "與室內相近",
  alarmPanelTitle: "警報與設備", viewAll: "查看全部", noOpenAlarms: "沒有未處理的警報", devicesOnline: "設備在線", batteryLowCount: "{n} 個設備電量低於 20%", moreAlarms: "另有 {n} 項",
  socketsTotal: "合計", socketsOnCount: "{on}/{n} 個開啟", allOff: "全部關閉", allOn: "全部打開", openEnergy: "查看能耗詳情",
  ahuTitle: "AHU 運行", simulated: "模擬數據", ahuRunning: "運行中", ahuStandby: "待機", ahuAuto: "自動", ahuAfterHours: "非工作時間",
  supplyAir: "送風", returnAir: "回風", supplySetpoint: "送風設定", setpointDown: "降低送風設定溫度", setpointUp: "提高送風設定溫度",
  freshDamper: "新風閥", waterValve: "冷水閥", fanSpeed: "風機", followsAi: "跟隨 AI", ahuNote: "尚未接入 BMS，調節只在本頁模擬，不會發送到設備",
  sInUseGood: "空氣良好，{n} 人在使用", sInUseGoodEstimated: "空氣良好，約 {n} 人在使用", sInUseCaution: "CO₂ {v} ppm，{n} 人在使用，留意通風",
  sInUseRising: "CO₂ 正在上升，建議加大新風", sInUseHigh: "CO₂ 偏高，建議加大新風",
  sVacantSockets: "房間空置，{total} 個插座中 {on} 個仍在用電", sVacant: "房間空置", sAfterHours: "非工作時間",
  sDoorClosed: "門已關閉", sDoorOpen: "有門未關", sNoLeak: "無漏水", sLeak: "偵測到漏水",
  sUnknownGood: "CO₂ {v} ppm，空氣良好", sUnknownCaution: "CO₂ {v} ppm，留意通風", sUnknownPoor: "CO₂ {v} ppm，通風不足", sNoData: "暫時沒有環境數據",
  allClear: "一切正常", alarmsCount: "{n} 項警報", estimatedShort: "估計", snapshot: "截圖", settings: "設定", toolsAria: "工具", languageAria: "語言",
  tabHome: "總覽", tabEnvironment: "環境", tabEnergy: "能耗", tabDevices: "設備", tabsAria: "主要功能",
  resetView: "回到預設視角", close: "關閉", back: "返回",
  aiTitle: "AI 新風推薦", aiDamper: "風閥 {pct}%", aiPeak: "60 分鐘內 CO₂ 峰值", aiInterrupted: "推薦更新中斷 · 最後更新 {time}",
  aiWaiting: "等待第一條推薦", aiOpen: "查看 AI 推薦詳情", aiAtMax: "新風已達上限", aiReplayHidden: "回放期間不顯示推薦", aiNoData: "最近 20 分鐘沒有 CO₂ 數據，暫無推薦",
  envTitle: "環境", metricSwitch: "指標", timeline: "{metric}時間軸", measured: "實測", forecast: "AI 預測", limitLine: "限值 {v}", nowLine: "現在",
  replay: "回放", indoor: "室內環境", outdoor: "室外環境", outdoorSource: "香港天文台京士柏站", trends: "趨勢", dryBulb: "乾球溫度", relHumidity: "相對濕度",
  wind: "風", solar: "太陽輻射", windText: "{dir}風 {speed} m/s", custom: "自訂", hours: "小時", rangeAria: "歷史範圍", noRecords: "這個時段沒有記錄", loading: "正在載入…",
  compass: ["北", "東北", "東", "東南", "南", "西南", "西", "西北"], occupiedSeats: "座位佔用",
  energyTitle: "能耗", totalPower: "總用電功率", sockets: "插座", allSockets: "全部",
  confirmOff: "關閉 {id}？", confirmOn: "打開 {id}？", confirmAllOff: "關閉全部插座？", confirmAllOn: "打開全部插座？", confirm: "確認", cancel: "取消",
  phaseConfirm: "等待確認", phaseQueued: "{id} 已排隊", phaseSent: "{id} 已發送，等待設備回報", phaseApplied: "{id} 已{state}", phaseFailed: "{id} 控制失敗：{reason}",
  phaseTimeout: "{id} 在 {s} 秒內沒有回報", stateOn: "打開", stateOff: "關閉",
  controlUnavailable: "插座控制暫時不可用", reasonReadOnly: "此頁面連接的是唯讀數據服務，只有本地橋接可以控制插座", reasonMqtt: "控制服務未連接", reasonBridge: "數據服務未連接",
  demandChart: "用電曲線", today: "今日", days7: "7 天", days30: "30 天", noPowerHistory: "這個時段沒有用電記錄", notPlaced: "模型中尚未放置",
  demoControl: "示範模式：開關只在本頁模擬，不會控制真實設備", accessKeyPrompt: "輸入訪問密鑰後即可在此頁面控制實驗室插座。", keyTitle: "控制訪問密鑰", keyField: "訪問密鑰", keyUnlock: "解鎖",
  devicesTitle: "設備", summary: "狀態匯總", online: "在線", offline: "離線", fault: "故障", battery: "電池", searchDevices: "搜尋設備", all: "全部",
  viewList: "列表", viewTable: "表格", colName: "設備名稱", colId: "編號", colStatus: "狀態", colLatest: "最新數據",
  layers: "圖層", layerArchi: "建築", layerMep: "機電", layerSensors: "感測器", sensorModeAll: "標記與佔用", sensorModeModel: "僅模型", sensorModeHidden: "隱藏",
  noResults: "沒有找到「{q}」", noDevices: "沒有設備",
  catEnvironment: "環境", catOccupancy: "佔用", catDoor: "門磁", catLeak: "漏水", catSocket: "插座", catWeather: "氣象", catOther: "其他",
  ahuSupply: "送風溫度", ahuReturn: "回風溫度", ahuWater: "水閥", ahuOa: "新風閥", ahuFan: "風機頻率", ahuSetpoint: "溫度設定", notConnected: "未接入",
  bmsReservedCopy: "AHU 運行數據將於後續版本接入。",
  sensorData: "感測器數據", componentDetails: "構件詳情", lastRecord: "最後記錄 {ago}", noRecord: "暫無記錄", history: "歷史", bim: "BIM 屬性", ifcType: "IFC 類型", model: "模型",
  simulateFault: "模擬設備故障", restoreNormal: "恢復設備正常", readingsInRange: "所選 {range} 內有 {count} 條記錄", historyFailed: "歷史查詢失敗，請重試",
  statusNormal: "在線", statusFault: "故障", statusUnavailable: "數據來源未連接", statusOffline: "離線",
  open: "開", closed: "關", occupied: "已佔用", vacant: "未佔用", leakYes: "偵測到水浸", leakNo: "無水浸", on: "開", off: "關", unknown: "未知",
  alarmTitle: "警報", alarmActive: "進行中", alarmAcknowledged: "已確認", alarmAll: "全部", acknowledge: "確認", reopen: "重新打開",
  alarmDoor: "門磁打開", alarmLeak: "偵測到漏水", alarmTamper: "感測器被拆動", alarmBattery: "需要更換電池", alarmSocketLoad: "插座負載超過閾值",
  alarmSocketVoltage: "插座電壓異常", alarmConnection: "數據服務連接中斷", alarmOffline: "感測器離線", alarmNoneFiltered: "沒有{filter}的警報", newAlarm: "新警報",
  batteryRemaining: "剩餘 {v}%", sensorStatus: "感測器狀態", batteryStatus: "電池狀態", dataService: "數據服務",
  settingsTitle: "設定", language: "語言", appearance: "外觀", themeLight: "淺色", themeDark: "深色", themeSystem: "跟隨系統", transparency: "透明度",
  standard: "標準", reduced: "降低", kiosk: "待機展示", demoMode: "示範模式", demoHint: "顯示虛擬示範數據，並始終帶「示範數據」標記",
  engineering: "工程工具", pickCoordinate: "座標擷取", quality: "畫質", qualityAuto: "自動", copy: "複製", copied: "已複製", diagnostics: "數據橋接診斷", fps: "幀率",
  valuePreview: "數值預覽（CO₂）", timePreview: "時間預覽",
  badgeDemo: "示範數據", badgeReplay: "回放 · {time}", kioskHint: "待機展示中 · 觸碰螢幕即可操作",
  replayPlay: "播放", replayPause: "暫停", replaySpeed: "速度", backToLive: "回到即時", replayLoading: "正在載入過去 24 小時的數據…", replayFailed: "回放數據載入失敗", replayAria: "回放時間",
  snapshotSaved: "截圖已儲存", bridgeDown: "暫時無法連接數據服務，正在重試…", bridgeRetryIn: "{s} 秒後重試",
  introLoading: "正在載入 BIM 模型", introSkip: "點擊或按任意鍵跳過", loadFailed: "模型載入失敗",
  loadRetryHint: "請透過 npm run dev 啟動專案，並確認 Fragments 模型檔案存在。", reload: "重新載入", rotate: "請將裝置橫向放置", viewerAria: "ZB202 三維數碼孿生",
  aiPageEyebrow: "ZB202 · 預測型新風控制", recommended: "推薦新風量", currentCo2: "當前 CO₂", peak60: "未來 60 分鐘 CO₂ 峰值",
  co2Chart: "CO₂ 預測：按推薦運行 vs 按假設現狀運行", occupancyChart: "人數時間線", occupancySub: "過去 6 小時估計 + 未來預測；灰色區域為日程中的會議",
  airflowChart: "推薦新風量變化", airflowSub: "過去 24 小時；懸停可查看對應風閥開度", tableView: "數據表", energySaved: "節能估算（相對假設的現狀運行）", week: "本週",
  savedAir: "節省新風量", savedCooling: "節省冷量", savedElectric: "節省電量", calendar: "會議日程", calendarSub: "錄入會議後，推薦會提前加大新風",
  meetingTitle: "名稱", meetingPlaceholder: "組會", date: "日期", start: "開始", end: "結束", expectedPeople: "預計人數", add: "新增",
  basis: "推薦依據", internal: "內部：影子模式與控制級別", controlLevel: "控制級別", exitAuto: "退出自動控制",
  l2Note: "L2（BACnet 寫入新風閥）需 FMO 授權並配置寫入點位後才能啟用。", connected: "已連接", disconnected: "數據橋接未連接",
  damperNow: "風閥 {pct}% · 假設現狀 {now}%", average8h: "8 小時平均 {v} ppm", average8hPartial: "8 小時平均 {v} ppm（已覆蓋 {h} 小時）",
  occupancyMeasuredNote: "工位感測器實測", occupancyEstimatedNote: "根據 CO₂ 變化估計", updatedAt: "更新於 {time} · {mode}",
  recommendedSeries: "按推薦運行", baselineSeries: "按假設現狀運行", occupancyForecast: "預測人數", recommendedLps: "推薦新風量", baselineLps: "假設現狀新風量",
  co2Sub: "預測時域 {h} 分鐘；虛線為 800 ppm 限值和 750 ppm 控制目標", noData: "暫無數據", time: "時間", energySub: "室外條件：{source}；冷站 COP {cop}",
  sourceHko: "天文台京士柏", sourceStation: "氣象站", sourceAssumed: "假設值", noMeetings: "暫無會議", deleteMeeting: "刪除會議", saved: "已儲存", invalidTime: "結束時間須晚於開始時間",
  modeL0: "僅推薦顯示", modeL1: "影子模式", modeL2: "自動控制",
  statCommand: "影子風閥指令", statShadowPpm: "影子 CO₂", statExceed: "影子超標次數", statSteps: "影子運行步數", statGuards: "保護觸發次數",
  statRmse30: "30 分鐘預測誤差 RMSE", statRmse60: "60 分鐘預測誤差 RMSE", statSource: "人數來源", statCalibrated: "最近標定", sourceCo2: "CO₂ 反推", sourceVs341: "VS341 工位",
  aiControlMode: "控制方式", aiAutoMode: "AI 自動模式", aiManualMode: "手動模式", aiSupplySetpoint: "建議送風溫度設定", aiDamperRec: "建議新風閥開度",
  aiCurrentSetpoint: "當前設定 {v}", aiCurrentPosition: "假設現狀 {v}", aiAwaiting: "等待執行", aiExecuted: "已執行",
  aiControlReadOnly: "需接入 AHU 數據並獲 FMO 授權後才能切換；目前推薦只作顯示", aiSetpointUnavailable: "送風溫度建議需接入 AHU 數據後提供",
  sensorsMedian: "{n} 個感測器校正後中位數", sensorsExcluded: "已排除 {n} 個異常感測器", readingSuspect: "讀數異常", healthBelowOutdoor: "校正後仍低於室外本底（約 {v} ppm）", healthFlatline: "超過 2 小時讀數不變", healthDeviates: "與其他感測器相差超過 150 ppm", dataQuality: "數據質素", rawReading: "原始讀數", correction: "校正量", calibratedOn: "標定日期", excludedFromRoom: "未計入房間數值",
  ahuOffTitle: "AHU 已停機", ahuNextStart: "下次開機 {when}", ahuStartCo2: "開機時預計 CO₂ {v} ppm", ahuStartCo2Tile: "開機時預計 CO₂", ahuState: "AHU 狀態", ahuRunningState: "運行中", ahuHoursLine: "運行時間：工作日 {hours}", ahuHoursInferred: "根據每晚 CO₂ 下降時刻推斷，待 FMO 確認", ahuNextStop: "下次停機 {when}", ahuBmsPending: "接入 BMS 後顯示送回風溫度、閥門開度和風機頻率", ahuOffNoSavings: "下班後 AHU 不送新風，AI 無需調節，也不計算節能", tomorrow: "明天", weekSince: "本週（自{day}起）", meetingDefault: "會議", rAhuOff: "AHU 已停機，{when} 開機後再給出新風推薦", rAtMaxExceed: "預計 {at} CO₂ 超過 {limit} ppm，新風已達上限", rAtMax: "新風已達上限，CO₂ 可能高於 {target} ppm 控制目標", rMeetingNowRaised: "{name}進行中（預計 {people} 人），維持較大新風", rMeetingNow: "{name}進行中（預計 {people} 人），CO₂ 餘量充足", rMeetingSoonRaised: "{at} {name}預計 {people} 人，提前加大新風", rMeetingSoon: "{at} {name}預計 {people} 人，當前 CO₂ 餘量充足", rHeadroom: "CO₂ 餘量充足，保持最小新風量", rRaised: "估計 {people} 人，按需加大新風，使 CO₂ 不超過 {target} ppm", rNoData: "最近 20 分鐘沒有 CO₂ 數據，暫時無法給出推薦",
  socketOn: "開", socketOff: "關", controlViewOnly: "僅供查看，插座開關由實驗室成員操作", controlLocked: "輸入訪問密鑰後可開關插座", updatedAtShort: "更新於 {time}", aiAdviceOnly: "AI 目前只給出建議，是否採用由設施管理團隊決定", calendarLocked: "輸入訪問密鑰後可新增或刪除會議",
  forecastPoints: "30 分鐘 {a} ppm · 60 分鐘 {b} ppm", targetLine: "目標 {v}",
  connectionRetrying: "暫時連不上數據服務，正在自動重試",
  basisItems: (r) => [
    `控制目標：預測時域內任一時刻 CO₂ ≤ <b>${r.co2.target} ppm</b>，比 ${r.co2.limit} ppm 限值留 ${r.co2.limit - r.co2.target} ppm 餘量（感測器與預測誤差）。`,
    `最小新風量 = 2.5 L/s·人 × 人數 + 0.3 L/s·m² × 46.6 m²，當前為 <b>${r.airflow.minLps} L/s</b>。`,
    `預測時域 <b>${r.horizonMinutes} 分鐘</b>，每 10 分鐘滾動重算；日程中有會議時延長到會議結束（最長 180 分鐘）。`,
    `在最小值與風閥全開（${r.airflow.maxLps} L/s）之間，求使預測峰值不超過目標的最小新風量：<b>${r.airflow.recommendedLps} L/s</b>（風閥 ${r.airflow.recommendedDamperPct}%）。`,
    `假設的現狀運行方式：工作時間風閥 ${r.ahu.assumedDamperPct}% ≈ ${r.ahu.assumedLps} L/s，AHU 停機後約 ${r.ahu.offLps} L/s（滲透和排風）。按此運行，預測峰值為 <b>${r.co2.peakBaseline} ppm</b>。`,
    `AHU 運行時間按每晚 CO₂ 開始下降的時刻推斷為工作日 ${r.ahu.hours}${r.ahu.source === "bms" ? "" : "（待 FMO 確認）"}；AHU 停機時 AI 無法調節新風，不計算節能。`,
    "風閥開度與新風量的換算曲線尚待 BMS 數據標定；在此之前新風量和節能數值為估算。",
  ],
};

const en = {
  appTitle: "ZB202 AI-Empowered Digital Twin Platform",
  roomName: "ZB202",
  live: "Live", updatedAgo: "updated {ago}", dataDelayed: "Data delayed · last update {time}", connecting: "Connecting to the data service", waitingData: "Waiting for the first readings",
  outdoorLine: "Outdoor {temp}", outdoorLineSky: "Outdoor {temp} · {sky}", skyClear: "sunny", skyCloudy: "cloudy", skyOvercast: "overcast",
  statsLine: "{sensors} sensors · {readings} readings today", hkTime: "Hong Kong time",
  justNow: "just now", minutesAgo: "{n} min ago", hoursAgo: "{n} h ago", daysAgo: "{n} d ago",
  co2: "CO₂", temperature: "Temperature", humidity: "Humidity", occupancy: "Occupants", occupancyEstimated: "Est. occupants",
  pm25: "PM2.5", noise: "Noise", people: "{n}",
  good: "Good", caution: "Caution", poor: "High", comfortable: "Comfortable", cold: "Cool", hot: "Warm", dry: "Dry", humid: "Humid", stale: "Stale data",
  last24h: "Last 24 hours", replay24h: "Replay these 24 hours", capsuleHint: "Open environment details",
  sensorsAveraged: "{n} sensors averaged", solarShort: "Solar", tempShort: "Temp.", peopleShort: "People", peopleEstimatedShort: "Est. people", totalPowerShort: "Total power", stationShort: "King's Park", warmerThanIndoor: "{v}° warmer than inside", coolerThanIndoor: "{v}° cooler than inside", sameAsIndoor: "About the same as inside",
  alarmPanelTitle: "Alarms & devices", viewAll: "View all", noOpenAlarms: "No open alarms", devicesOnline: "Devices online", batteryLowCount: ({ n }) => `${n} device${n === 1 ? "" : "s"} below 20% battery`, moreAlarms: "{n} more",
  socketsTotal: "Total", socketsOnCount: "{on} of {n} on", allOff: "Turn all off", allOn: "Turn all on", openEnergy: "Open energy details",
  ahuTitle: "AHU", simulated: "Simulated", ahuRunning: "Running", ahuStandby: "Standby", ahuAuto: "Auto", ahuAfterHours: "After hours",
  supplyAir: "Supply", returnAir: "Return", supplySetpoint: "Supply setpoint", setpointDown: "Lower the supply setpoint", setpointUp: "Raise the supply setpoint",
  freshDamper: "Fresh air", waterValve: "Water valve", fanSpeed: "Fan", followsAi: "follows AI", ahuNote: "BMS not connected yet: changes are simulated here and never sent to equipment",
  sInUseGood: "Air is good · {n} people in the room", sInUseGoodEstimated: "Air is good · about {n} people in the room",
  sInUseCaution: "CO₂ {v} ppm with {n} people · keep an eye on ventilation",
  sInUseRising: "CO₂ is rising · more outdoor air recommended", sInUseHigh: "CO₂ is high · more outdoor air recommended",
  sVacantSockets: "Room is empty · {on} of {total} sockets still drawing power", sVacant: "Room is empty", sAfterHours: "After hours",
  sDoorClosed: "doors closed", sDoorOpen: "a door is open", sNoLeak: "no leaks", sLeak: "water detected",
  sUnknownGood: "CO₂ {v} ppm · air is good", sUnknownCaution: "CO₂ {v} ppm · keep an eye on ventilation", sUnknownPoor: "CO₂ {v} ppm · ventilation is insufficient",
  sNoData: "No environment data yet",
  allClear: "All clear", alarmsCount: (v) => (Number(v.n) === 1 ? "1 alarm" : `${v.n} alarms`), estimatedShort: "est.", snapshot: "Snapshot", settings: "Settings", toolsAria: "Tools", languageAria: "Language",
  tabHome: "Overview", tabEnvironment: "Environment", tabEnergy: "Energy", tabDevices: "Devices", tabAi: "AI", tabsAria: "Main navigation",
  resetView: "Back to default view", close: "Close", back: "Back",
  aiTitle: "AI outdoor air", aiDamper: "Damper {pct}%", aiPeak: "CO₂ peak, next 60 min", aiInterrupted: "Updates interrupted · last at {time}",
  aiWaiting: "Waiting for the first recommendation", aiOpen: "Open AI recommendation details", aiAtMax: "Outdoor air at maximum", aiReplayHidden: "Hidden during replay",
  aiNoData: "No CO₂ reading in the last 20 minutes; no recommendation",
  envTitle: "Environment", metricSwitch: "Metric", timeline: "{metric} timeline", measured: "Measured", forecast: "AI forecast", limitLine: "Limit {v}", nowLine: "Now",
  replay: "Replay", indoor: "Indoor environment", outdoor: "Outdoor environment", outdoorSource: "HKO King's Park station", trends: "Trends",
  dryBulb: "Dry-bulb temperature", relHumidity: "Relative humidity", wind: "Wind", solar: "Solar radiation", windText: "{dir} {speed} m/s",
  custom: "Custom", hours: "h", rangeAria: "History range", noRecords: "No records for this period", loading: "Loading…",
  compass: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"], occupiedSeats: "Seat occupancy",
  energyTitle: "Energy", totalPower: "Total electrical demand", sockets: "Sockets", allSockets: "All",
  confirmOff: "Switch off {id}?", confirmOn: "Switch on {id}?", confirmAllOff: "Switch off all sockets?", confirmAllOn: "Switch on all sockets?", confirm: "Confirm", cancel: "Cancel",
  phaseConfirm: "Awaiting confirmation", phaseQueued: "{id} queued", phaseSent: "{id} sent · waiting for the device", phaseApplied: "{id} switched {state}", phaseFailed: "{id} failed: {reason}",
  phaseTimeout: "{id} did not confirm within {s} s", stateOn: "on", stateOff: "off",
  controlUnavailable: "Socket control is unavailable", reasonReadOnly: "This page uses the read-only data service; only the local bridge can switch sockets",
  reasonMqtt: "Control service not connected", reasonBridge: "Data service not connected", demandChart: "Electrical demand", today: "Today", days7: "7 days", days30: "30 days",
  noPowerHistory: "No power records for this period", notPlaced: "Not yet placed in the model", demoControl: "Demo mode: switches are simulated on this page only",
  accessKeyPrompt: "Enter the access key to switch lab sockets from this page.", keyTitle: "Control access key", keyField: "Access key", keyUnlock: "Unlock",
  devicesTitle: "Devices", summary: "Status", online: "Online", offline: "Offline", fault: "Fault", battery: "Battery", searchDevices: "Search devices", all: "All", mep: "MEP",
  viewList: "List", viewTable: "Table", colName: "Device", colId: "ID", colStatus: "Status", colLatest: "Latest data",
  layers: "Layers", layerArchi: "Architecture", layerMep: "MEP", layerSensors: "Sensors", sensorModeAll: "Markers & occupancy", sensorModeModel: "Model only", sensorModeHidden: "Hidden",
  noResults: "Nothing found for “{q}”", noDevices: "No devices",
  catEnvironment: "Environment", catOccupancy: "Occupancy", catDoor: "Door contact", catLeak: "Leak", catSocket: "Socket", catWeather: "Weather", catOther: "Other",
  ahu: "AHU", ahuSupply: "Supply air", ahuReturn: "Return air", ahuWater: "Water valve", ahuOa: "Outdoor-air damper", ahuFan: "Fan frequency", ahuSetpoint: "Temperature setpoint",
  notConnected: "Not connected", bmsReserved: "BMS", bmsReservedCopy: "AHU operating data will be connected in a future release.",
  sensorData: "Sensor data", componentDetails: "Component details", lastRecord: "Last reading {ago}", noRecord: "No readings yet", history: "History", bim: "BIM properties",
  ifcType: "IFC type", globalId: "GlobalId", expressId: "Express ID", model: "Model",
  simulateFault: "Simulate device fault", restoreNormal: "Restore normal status", readingsInRange: "{count} readings in the selected {range}", historyFailed: "History query failed; try again",
  statusNormal: "Online", statusFault: "Fault", statusUnavailable: "No data source", statusOffline: "Offline",
  open: "Open", closed: "Closed", occupied: "Occupied", vacant: "Vacant", leakYes: "Water detected", leakNo: "Dry", on: "On", off: "Off", unknown: "Unknown",
  alarmTitle: "Alarms", alarmActive: "Active", alarmAcknowledged: "Acknowledged", alarmAll: "All", acknowledge: "Acknowledge", reopen: "Reopen",
  alarmDoor: "Door contact opened", alarmLeak: "Water leakage detected", alarmTamper: "Sensor tamper detected", alarmBattery: "Battery replacement required",
  alarmSocketLoad: "Socket load exceeds threshold", alarmSocketVoltage: "Socket voltage abnormal", alarmConnection: "Data service connection lost", alarmOffline: "Sensor offline",
  alarmNoneFiltered: "No {filter} alarms", newAlarm: "New alarm", batteryRemaining: "{v}% remaining", sensorStatus: "Sensor status", batteryStatus: "Battery status", dataService: "Data service",
  settingsTitle: "Settings", language: "Language", appearance: "Appearance", themeLight: "Light", themeDark: "Dark", themeSystem: "System", transparency: "Transparency",
  standard: "Standard", reduced: "Reduced", kiosk: "Standby showcase", demoMode: "Demo mode", demoHint: "Shows virtual demonstration data, always labelled",
  engineering: "Engineering tools", pickCoordinate: "Pick coordinate", quality: "Quality", qualityAuto: "Auto", qualityHigh: "High", qualityMedium: "Medium", qualityLow: "Low",
  copy: "Copy", copied: "Copied", diagnostics: "Bridge diagnostics", fps: "FPS", valuePreview: "Value preview (CO₂)", timePreview: "Time preview",
  badgeDemo: "Demo data", badgeReplay: "Replay · {time}", kioskHint: "Standby showcase · touch the screen to take over",
  replayPlay: "Play", replayPause: "Pause", replaySpeed: "Speed", backToLive: "Back to live", replayLoading: "Loading the last 24 hours…", replayFailed: "Replay data could not be loaded", replayAria: "Replay time",
  snapshotSaved: "Snapshot saved", snapshotFooter: "ZB202 Digital Twin", bridgeDown: "Can't reach the data service; retrying…", bridgeRetryIn: "retry in {s} s",
  introLoading: "Loading the BIM model", introSkip: "Click or press any key to skip", loadFailed: "Model loading failed",
  loadRetryHint: "Start the project with npm run dev and confirm the Fragments model files exist.", reload: "Reload", rotate: "Please rotate your device", viewerAria: "ZB202 3D digital twin",
  aiPageEyebrow: "ZB202 · Predictive outdoor-air control", recommended: "Recommended outdoor air", currentCo2: "Current CO₂", peak60: "CO₂ peak, next 60 min",
  co2Chart: "CO₂ forecast: recommended vs assumed existing operation", occupancyChart: "Occupancy timeline", occupancySub: "Past 6 hours estimated + forecast; grey bands are scheduled meetings",
  airflowChart: "Recommended outdoor air", airflowSub: "Past 24 hours; hover for damper position", tableView: "Table view",
  energySaved: "Estimated savings vs assumed existing operation", week: "This week", savedAir: "Outdoor air saved", savedCooling: "Cooling saved", savedElectric: "Electricity saved",
  calendar: "Meeting schedule", calendarSub: "Scheduled meetings let the system ventilate in advance", meetingTitle: "Title", meetingPlaceholder: "Group meeting", date: "Date", start: "Start", end: "End", expectedPeople: "Expected people", add: "Add",
  basis: "Why this recommendation", internal: "Internal: shadow mode and control level", controlLevel: "Control level", exitAuto: "Exit automatic control",
  l2Note: "L2 (BACnet write to the outdoor-air damper) requires FMO authorisation and a configured write point.", connected: "Connected", disconnected: "Data bridge offline",
  damperNow: "Damper {pct}% · assumed now {now}%", forecastPoints: "30 min {a} ppm · 60 min {b} ppm", average8h: "8-hour average {v} ppm", average8hPartial: "8-hour average {v} ppm ({h} h covered)",
  occupancyMeasuredNote: "Measured by seat sensors", occupancyEstimatedNote: "Estimated from CO₂ changes", updatedAt: "Updated {time} · {mode}",
  recommendedSeries: "Recommended", baselineSeries: "Assumed existing operation", targetLine: "Target {v}", occupancyForecast: "Forecast", recommendedLps: "Recommended", baselineLps: "Assumed existing operation",
  co2Sub: "{h}-minute horizon; dashed lines mark the 800 ppm limit and 750 ppm target", noData: "No data yet", time: "Time", energySub: "Outdoor conditions: {source}; plant COP {cop}",
  sourceHko: "HKO King's Park", sourceStation: "weather station", sourceAssumed: "assumed", noMeetings: "No meetings scheduled", deleteMeeting: "Delete meeting", saved: "Saved", invalidTime: "End time must be after the start time",
  modeL0: "Recommendation only", modeL1: "Shadow mode", modeL2: "Automatic control",
  statCommand: "Shadow damper command", statShadowPpm: "Shadow CO₂", statExceed: "Shadow exceedances", statSteps: "Shadow steps", statGuards: "Guard activations",
  statRmse30: "30-min forecast RMSE", statRmse60: "60-min forecast RMSE", statSource: "Occupancy source", statCalibrated: "Last calibration", sourceCo2: "CO₂-implied", sourceVs341: "VS341 seats",
  aiControlMode: "Control mode", aiAutoMode: "AI auto mode", aiManualMode: "Manual mode", aiSupplySetpoint: "Recommended supply-air setpoint", aiDamperRec: "Recommended outdoor-air damper",
  aiCurrentSetpoint: "Current setpoint {v}", aiCurrentPosition: "Assumed now {v}", aiAwaiting: "Awaiting execution", aiExecuted: "Executed",
  aiControlReadOnly: "Switching needs AHU data and FMO authorisation; recommendations are display-only for now", aiSetpointUnavailable: "Supply-air setpoint advice needs AHU data",
  sensorsMedian: "median of {n} corrected sensors", sensorsExcluded: "{n} flagged sensor left out", readingSuspect: "Reading looks wrong", healthBelowOutdoor: "Below the outdoor baseline (about {v} ppm) even after correction", healthFlatline: "Unchanged for more than 2 hours", healthDeviates: "More than 150 ppm away from the other sensors", dataQuality: "Data quality", rawReading: "Raw reading", correction: "Correction", calibratedOn: "Calibrated on", excludedFromRoom: "left out of the room value",
  ahuOffTitle: "AHU off", ahuNextStart: "Next start {when}", ahuStartCo2: "CO₂ at start about {v} ppm", ahuStartCo2Tile: "CO₂ expected at start", ahuState: "AHU", ahuRunningState: "Running", ahuHoursLine: "Hours: weekdays {hours}", ahuHoursInferred: "Inferred from when CO₂ falls each evening; to be confirmed by FMO", ahuNextStop: "Stops {when}", ahuBmsPending: "Supply and return temperatures, valves and fan speed appear once the BMS is connected", ahuOffNoSavings: "With the AHU off there is no outdoor air to adjust, so nothing is counted as saved", tomorrow: "tomorrow", weekSince: "This week (since {day})", meetingDefault: "Meeting", rAhuOff: "The AHU is off; recommendations resume when it starts {when}", rAtMaxExceed: "CO₂ forecast to exceed {limit} ppm at {at}; outdoor air at maximum", rAtMax: "Outdoor air at maximum; CO₂ may exceed the {target} ppm target", rMeetingNowRaised: "{name} in progress ({people} expected); holding higher outdoor air", rMeetingNow: "{name} in progress ({people} expected); CO₂ headroom is sufficient", rMeetingSoonRaised: "{name} at {at} with {people} expected; increasing outdoor air in advance", rMeetingSoon: "{name} at {at} with {people} expected; current CO₂ headroom is sufficient", rHeadroom: "CO₂ headroom is sufficient; keeping minimum outdoor air", rRaised: "About {people} people; raising outdoor air to keep CO₂ at or below {target} ppm", rNoData: "No CO₂ reading in the last 20 minutes; no recommendation yet",
  socketOn: "On", socketOff: "Off", controlViewOnly: "View only; lab members switch the sockets", controlLocked: "Enter the access key to switch sockets", updatedAtShort: "Updated {time}", aiAdviceOnly: "The AI only advises for now; the facilities team decides whether to apply it", calendarLocked: "Enter the access key to add or remove meetings",
  replayEvent: "{device} {type}",
  connectionRetrying: "The data service is unreachable; retrying automatically",
  basisItems: (r) => [
    `Target: CO₂ at or below <b>${r.co2.target} ppm</b> at every point of the horizon, ${r.co2.limit - r.co2.target} ppm below the ${r.co2.limit} ppm limit to cover sensor and forecast error.`,
    `Minimum outdoor air = 2.5 L/s per person + 0.3 L/s·m² × 46.6 m², currently <b>${r.airflow.minLps} L/s</b>.`,
    `<b>${r.horizonMinutes}-minute</b> horizon, recalculated every 10 minutes; extended to the end of a scheduled meeting (up to 180 minutes).`,
    `The least airflow between the minimum and a fully open damper (${r.airflow.maxLps} L/s) that keeps the forecast peak at target: <b>${r.airflow.recommendedLps} L/s</b> (damper ${r.airflow.recommendedDamperPct}%).`,
    `Assumed existing operation: damper ${r.ahu.assumedDamperPct}% ≈ ${r.ahu.assumedLps} L/s in working hours, about ${r.ahu.offLps} L/s (infiltration and exhaust) once the AHU stops. Run this way, the forecast peak is <b>${r.co2.peakBaseline} ppm</b>.`,
    `AHU hours are inferred from when CO₂ starts falling each evening: weekdays ${r.ahu.hours}${r.ahu.source === "bms" ? "" : " (to be confirmed by FMO)"}. While the AHU is off the AI cannot adjust outdoor air, so no savings are counted.`,
    "The damper-to-airflow curve awaits calibration with BMS data; airflow and savings figures are estimates until then.",
  ],
};

export const STRINGS = { zh, "zh-Hant": zhHant, en };

// Section 13.9 glossary. Simplified Chinese is the user's draft; the other two are translations for review.
export const GLOSSARY = {
  co2: {
    zh: ["CO₂ / ppm", "空气中二氧化碳的浓度，ppm 表示“百万分之一”。人呼吸会产生 CO₂，浓度越高，说明通风越不足。"],
    "zh-Hant": ["CO₂ / ppm", "空氣中二氧化碳的濃度，ppm 表示「百萬分之一」。人呼吸會產生 CO₂，濃度越高，說明通風越不足。"],
    en: ["CO₂ / ppm", "The concentration of carbon dioxide in the air; ppm means parts per million. People exhale CO₂, so a higher level means less ventilation."],
  },
  ppm800: {
    zh: ["800 ppm", "香港室内空气质素认证计划中“卓越级”的 CO₂ 标准（8 小时平均低于 800 ppm）。"],
    "zh-Hant": ["800 ppm", "香港室內空氣質素認證計劃中「卓越級」的 CO₂ 標準（8 小時平均低於 800 ppm）。"],
    en: ["800 ppm", "The “Excellent” CO₂ class of Hong Kong's IAQ Certification Scheme (8-hour average below 800 ppm)."],
  },
  ppm1000: {
    zh: ["1000 ppm", "同一计划中“良好级”的 CO₂ 标准。"],
    "zh-Hant": ["1000 ppm", "同一計劃中「良好級」的 CO₂ 標準。"],
    en: ["1000 ppm", "The “Good” CO₂ class of the same scheme."],
  },
  humidity: {
    zh: ["相对湿度", "空气中水汽含量占当前温度下最大含量的百分比。"],
    "zh-Hant": ["相對濕度", "空氣中水汽含量佔當前溫度下最大含量的百分比。"],
    en: ["Relative humidity", "How much water vapour the air holds, as a percentage of the most it could hold at the current temperature."],
  },
  pm25: {
    zh: ["PM2.5", "直径 2.5 微米以下的细颗粒物，能深入肺部。"],
    "zh-Hant": ["PM2.5", "直徑 2.5 微米以下的細顆粒物，能深入肺部。"],
    en: ["PM2.5", "Fine particles 2.5 micrometres across or smaller, which can reach deep into the lungs."],
  },
  dba: {
    zh: ["dB(A)", "按人耳感受加权的声音强度单位。"],
    "zh-Hant": ["dB(A)", "按人耳感受加權的聲音強度單位。"],
    en: ["dB(A)", "A unit of sound level weighted to match how the human ear perceives it."],
  },
  airflow: {
    zh: ["新风量 L/s", "每秒送入房间的室外新鲜空气量，单位为升每秒。"],
    "zh-Hant": ["新風量 L/s", "每秒送入房間的室外新鮮空氣量，單位為升每秒。"],
    en: ["Outdoor air L/s", "The amount of fresh outdoor air delivered to the room each second, in litres per second."],
  },
  damper: {
    zh: ["新风阀开度", "控制新风进入量的风阀打开的百分比。"],
    "zh-Hant": ["新風閥開度", "控制新風進入量的風閥打開的百分比。"],
    en: ["Outdoor-air damper", "How far the damper that admits outdoor air is open, as a percentage."],
  },
  power: {
    zh: ["有功功率 kW / 用电量 kWh", "功率是当前用电的快慢；用电量是一段时间内累计用掉的电。"],
    "zh-Hant": ["有功功率 kW / 用電量 kWh", "功率是當前用電的快慢；用電量是一段時間內累計用掉的電。"],
    en: ["Active power kW / energy kWh", "Power is how fast electricity is being used right now; energy is the total used over a period."],
  },
  estimated: {
    zh: ["估计人数", "没有直接计数时，根据 CO₂ 变化等数据推算出的人数。"],
    "zh-Hant": ["估計人數", "沒有直接計數時，根據 CO₂ 變化等數據推算出的人數。"],
    en: ["Estimated occupants", "When people are not counted directly, the number inferred from CO₂ changes and other data."],
  },
  solar: {
    zh: ["太阳辐射 W/m²", "每平方米地面接收到的太阳能量，用来判断晴天还是阴天。"],
    "zh-Hant": ["太陽輻射 W/m²", "每平方米地面接收到的太陽能量，用來判斷晴天還是陰天。"],
    en: ["Solar radiation W/m²", "Solar energy reaching each square metre of ground; it tells a sunny sky from an overcast one."],
  },
  twin: {
    zh: ["数字孪生", "与真实房间同步的数字模型，包含建筑构件、设备和实时数据。"],
    "zh-Hant": ["數碼孿生", "與真實房間同步的數碼模型，包含建築構件、設備和即時數據。"],
    en: ["Digital twin", "A digital model kept in step with the real room, with its building components, equipment and live data."],
  },
};

let lang = "zh";

export function normalizeLanguage(value) {
  if (value === "en" || /^en\b/i.test(value || "")) return "en";
  if (value === "zh-Hant" || /^zh-(HK|TW|MO|Hant)/i.test(value || "")) return "zh-Hant";
  return "zh";
}

export function setLang(next) { lang = normalizeLanguage(next); }
export function getLang() { return lang; }
export function locale() { return lang === "en" ? "en-GB" : lang === "zh-Hant" ? "zh-HK" : "zh-CN"; }
export function htmlLang() { return lang === "en" ? "en" : lang === "zh-Hant" ? "zh-Hant" : "zh-Hans"; }

export function t(key, values = {}) {
  const entry = STRINGS[lang][key] ?? STRINGS.zh[key] ?? STRINGS.en[key];
  if (entry === undefined) return key;
  if (typeof entry === "function") return entry(values);
  if (typeof entry !== "string") return entry;
  return entry.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
}

// Localised field of a { zh, "zh-Hant", en } object.
export function pick(localized) {
  if (!localized) return "";
  if (typeof localized === "string") return localized;
  return localized[lang] ?? localized.zh ?? localized.en ?? "";
}

export function glossary(key) {
  const entry = GLOSSARY[key];
  return entry ? entry[lang] || entry.zh : null;
}

export function ago(timeMs, now = Date.now()) {
  if (!Number.isFinite(timeMs)) return "";
  const minutes = Math.max(0, Math.round((now - timeMs) / 60000));
  if (minutes < 1) return t("justNow");
  if (minutes < 60) return t("minutesAgo", { n: minutes });
  if (minutes < 48 * 60) return t("hoursAgo", { n: Math.round(minutes / 60) });
  return t("daysAgo", { n: Math.round(minutes / 1440) });
}

export function clockTime(timeMs) {
  return new Date(timeMs).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
}

export function dateTime(timeMs) {
  return new Date(timeMs).toLocaleString(locale(), { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Hong_Kong" });
}

export function formatNumber(value, digits = null) {
  if (!Number.isFinite(value)) return "";
  const decimals = digits ?? (Math.abs(value) >= 100 ? 0 : 1);
  return value.toLocaleString(locale(), { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}
