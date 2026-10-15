// Checks the page copy (web/src/twin/i18n.js): every key exists in all three languages, and the
// Traditional Chinese copy contains no Simplified-only characters (zh-Hant inherits any key it does
// not override from zh, which is how Simplified text used to leak into the Traditional page).
//   npm run check:i18n
import { pathToFileURL } from "node:url";
import { GLOSSARY, STRINGS } from "../web/src/twin/i18n.js";

// Common characters whose Traditional form differs. Characters that are also valid Traditional
// (e.g. 里, 才, 台, 系) are left out to avoid false alarms.
const SIMPLIFIED_ONLY = new Set([..."们个这时间应发数据实验设备传网络电风阀节气温湿显线连断开关门灯动态历记录统计报认证划级标准质环内告选择预测荐运状读写输务业构进还没过处产维护结论说帮览图层视资载页钮键触屏声复杂简单讯区围将会为与从对点击后当现无东车长问题见观规则积价钱费经济么样种类两万亿号码头吗听习学书买卖办劳势华厂压厅参双变启团园圆场坏块坚够夺奋奖妇孙宁审宽宾寻导寿尔尘尝属岁岛币师带广庄庆库废异弃张弹强归彻径忆忧怀总恋恶惊惯愿战户执扩扫扬扰抚抢担拟拥挂挡挤挥损换掷携摄摆摇敌旧晒晓暂术机杀权条来杨极枪柜栏树档桥梦检楼欢欧残毁毕汇汉汤沟泪泽洁洒浅浏浓涂润涨渐湾满滚滞灭灵灾灿炉炼烦烧热爱牵独狭献玛琐画畅疗盐监盖盘础确礼称稳穷竞笔笼筑签粮紧纠红约纪纯纲纳纵纷纸纹练组细织终绕绘给继绩续综绿缓编缩罗罚职联聪肃胁脉脑脱脸舍艺苏范药获虑虚补装觉订讨让训议讲许访评识诉词译试话询详语误请诸课谁调谈谋谢谱贝负财责贤败货购贯贴贵赏赛赞赶趋跃践踪轨转轮软轻较辆辑边达迁远违迟适递逻遗邮邻释鉴针钟钢铁铃链销锁锅错闪闭闲闻阅队阳阴阵阶际陆陈险随隐难雾静顶项顺须顾顿领频颜额飞饭馆马驱驶鱼鸟鸡黄齐龙余众优严丰临举义乐乡乱争亏亚亲仅仓仪伙伤伪体佣侠侣侦侧侨俭债倾偿储儿兑兰兴养兽冻净凉凤凭凿刘刚创删别刮刹剂剧劝励劲勋医协卢卫却厉厌厕厢厦县叁叙叠叶叹吁吨吴呐员呜咏咙咸响哑哗唤啸喷圣坝坞坛坠垄垒垦垫埚堕墙壮壳壶夸夹奂套妆妈娱娄婴婶宝宠宪宫寝尧尴屉届屡岂岗岭岳峡帅帐帘帜帧干并庐庙庞弥弯彦徕忏怂怜恳恼悦悬惧惨惩惫惭愤慑懒戏扑扪抛抟抠抡拢拣拦拧拨挚挛挝挞挟挠挣捞捡捣掳掸掺揽搀搁搂搅摅摈撑撵擞攒敛斋斓斩旷昙昼晋晕暧朴杰枞枢枣枫柠栋栖桦桨桩棂椁椭榄榈槛欤歼殁殒殓毂毙毡氢沣沤沥沦沧沪泞泷泸泺泻泼泾洼浃浆浇浊浍浑浒浔涛涝涟涡涣涤涧涩渊渍渎渔渗溃溅滤滥滨滩潇潋潜澜濑炀炖炜炝炽烁烂烃烛烟烨烩烫焕爷牍犊犷犹狈狮狱猎猪猫獭玑玮瑶疖疟疠疡疮疯痉痒痨痪痫瘅瘾癞皑皱盏眯睁睐瞒瞩矫矶矾矿砖砚硕碍祢祯祸离秃秆秽稣窃窍窑窜窝窥竖笃笕笋筛筝箩篓篮篱籁粜粝粤粪糁絷纣纤纥纨纩纫纬纭纰纱纶纺纽绀绁绂绅绊绍绎绑绒绔绚绛绝绞绢绣绪绫绮绯绰绳绵绷绸绽缀缄缅缆缈缉缎缔缕缘缚缝缠缤缨缪罂罢羁翘耸耻聂聋肠肤肾肿胀胆胜胧胫胶脍脏脐脓脚腊腻腾舆舰舱艰艳芜芦苇苍苹茎茏茔荆荚荡荣荤荧荨莱莲莹莺营萧萨蒋蓝蓟蔷蕴虏虫虽蚀蚁蚂蛊蛎蛮蜕蝇蝉衅衔衬袄袜袭裤觅觊觎觐觑誉誊讣讥讦讧讪讫讳讴讶讷讹讼讽诀诃诅诈诊诋诏诓诗诘诙诚诛诞诟诠诡诣诤该诧诩诫诬诰诱诲诵诺诽谀谄谅谆谊谍谎谐谑谓谕谗谚谜谣谤谦谨谬谭谴谷豁贞贡账贩贪贫贬贮贰贱贷贸贺贻贼贾贿赁赂赃赅赈赊赋赌赎赐赔赖赘赚赠赡赢赵跄跷跸跹跻踊踌蹒蹿躯轧轩轰轴轿辅辈辉辐辕辖辗辙辞辩辫辽迈迩迹逊遥邓邝邹郁郑郓郦郸酝酱酿钉钓钙钝钞钠钥钦钩钯钳钻钾铀铂铅铛铜铝铬铭铲银铸铺锄锈锋锌锐锚锡锣锤锦锯锻镀镁镇镜镶闩闯闰闷闸闹闺闽阁阂阈阎阐阔陇陉陕陨隶雏雳霁靥鞑韦韧韩韪韫韬韵顷顽颁颂颇颈颓颖颗颠颤飑飒飓飘飙饥饮饯饰饱饲饵饶饺饼馁馅馈馏馒驭驮驯驰驳驴驹驻驼驾驿骁骂骄骆骇骏骑骗骚骤髅鬓鲁鲜鲤鲸鳄鳞鸣鸥鸦鸭鸯鸳鸵鸽鸿鹃鹅鹊鹏鹤鹰鹿麦黉黩黾鼋鼍鼹齑齿龄龚龛龟"]);

function textOf(value) {
  if (typeof value === "string") return value;
  if (typeof value === "function") return value.toString();
  if (Array.isArray(value)) return value.join("\n");
  return "";
}

export function checkI18n(strings = STRINGS, glossary = GLOSSARY) {
  const problems = [];
  const langs = Object.keys(strings);
  const allKeys = new Set(langs.flatMap((lang) => Object.keys(strings[lang])));
  for (const key of allKeys) {
    for (const lang of langs) if (!(key in strings[lang])) problems.push(`missing ${lang}.${key}`);
  }
  const traditionalEntries = [
    ...Object.entries(strings["zh-Hant"]).map(([key, value]) => [`zh-Hant.${key}`, value]),
    ...Object.entries(glossary).map(([key, entry]) => [`glossary.${key}`, entry["zh-Hant"]]),
  ];
  for (const [name, value] of traditionalEntries) {
    const found = [...new Set([...textOf(value)].filter((char) => SIMPLIFIED_ONLY.has(char)))];
    if (found.length) problems.push(`${name} has Simplified characters: ${found.join("")}`);
  }
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkI18n();
  for (const problem of problems) console.log(problem);
  console.log(problems.length ? `\n${problems.length} problem(s)` : "i18n OK: three languages complete, no Simplified characters in zh-Hant");
  process.exit(problems.length ? 1 : 0);
}
