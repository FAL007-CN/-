# 数字生活 · uni-app (Vue3) 版

> 把原来的 mui + 原生 HTML/CSS/JS 版本（`D:\移动应用与开发\DEEP`）完整移植成 uni-app 工程，
> 标题还是「数字生活 / DIGITAL LIFE」，接口全部用原来那套后端（`http://114.66.9.70:10002/prod-api`），
> 另外新增了一个 **AI 问答助手**（能真的调用后端接口查数据）。

---

## 一、怎么跑起来

### 方式 A：HBuilderX（推荐，最省事）

1. 打开 HBuilderX → `文件` → `打开目录` → 选中 `D:\移动应用与开发\DEEP-uniapp`
2. 菜单 `运行` → `运行到浏览器` → `Chrome`（H5 预览，端口 5175）
3. 想上真机：手机连 USB → `运行` → `运行到手机或模拟器` → 选你的设备
4. 想打 APK：`发行` → `原生App-云打包`

> 这个工程是 **HBuilderX 标准结构**（`pages.json` / `manifest.json` / `App.vue` / `main.js` 都在根目录），
> 不需要 `npm install`，打开就能跑。

### 方式 B：命令行（vite）

```bash
npm install        # 或 pnpm install
npm run dev:h5     # H5 调试
npm run build:h5   # 打包 H5
```

### 登录账号

```
test01 / 123456
```

登录页默认已经填好了，点「登 录」就行。

### 方式 C：直接装 APK（最快看效果）

成品在 `D:\移动应用与开发\数字生活.apk`（188 KB，Android 5.0 以上都能装）。
打包原理和重新打包步骤见 `D:\移动应用与开发\DEEP-uniapp-apk\README.md`。

> 这个 APK 是「H5 产物 + 安卓 WebView 壳」，不是 HBuilderX 云打包的原生包，
> 拿不到原生能力（相机/蓝牙/推送），但本项目用不到那些。
> 想要官方原生包：HBuilderX → `发行` → `原生App-云打包`。

---

## 二、目录结构

```
DEEP-uniapp/
├── pages.json              页面路由 + 底部 5 个 tab + 导航栏配色
├── manifest.json           App 名字、appid、权限、H5 端口
├── main.js                 Vue3 入口
├── App.vue                 ★ 全局样式（所有卡片/按钮/表单的公共类都在这）
├── uni.scss                SCSS 变量（主题色等）
├── config/
│   └── index.js            ★ 总开关：接口地址、图片地址、AI 配置
├── api/
│   └── index.js            ★ 后端 25 个接口，一个函数一个
├── utils/
│   ├── request.js          网络请求封装（自动带 token、401 踢回登录、错误统一处理）
│   └── ai.js               ★ AI 引擎（工具调用 + 流式 + 兜底）
├── components/
│   └── dl-chart/           手写 canvas 图表（柱状 / 折线 / 饼状）
├── static/
│   ├── logo.png
│   └── tabbar/             10 个 tab 图标（灰/蓝两套，81×81 PNG）
└── pages/
    ├── login/login.vue         登录（账号 / 手机号两种）
    ├── index/index.vue         首页（轮播 + 6 宫格 + 楷模新闻）      [tab]
    ├── activity/activity.vue   公益活动列表                          [tab]
    ├── activity/detail.vue     活动详情 + 报名
    ├── study/study.vue         学习感言 / 学习历史 + 笔记             [tab]
    ├── ai/ai.vue               ★ AI 问答助手                          [tab]
    ├── analysis/analysis.vue   数据分析（3 张图）                     [tab]
    ├── model/model.vue         楷模列表
    ├── hero/hero.vue           英雄故事列表
    ├── hero/detail.vue         英雄故事详情 + 评论
    ├── around/around.vue       身边英雄
    ├── donation/donation.vue   物资捐赠
    └── user/user.vue           个人中心（换头像 / 退出登录）
```

底部 tab 一共 5 个：**首页 / 公益 / 心得 / AI 助手 / 数据分析**（原版 4 个 + 新增 AI）。
个人中心还是从各页右上角的人像图标进，跟原版一致。

---

## 三、和原版 DEEP 的对应关系

| 原文件 | 新页面 | 主要接口 |
|---|---|---|
| `index.html` | `pages/login/login.vue` | `POST /api/login`、`/api/phone/login` |
| `html/first.html` | `pages/index/index.vue` | `/api/building/banner/list`、`/api/model/list` |
| `html/model.html` | `pages/model/model.vue` | `/api/model/list` |
| `html/hero.html` | `pages/hero/hero.vue` | `/api/hero/list` |
| `html/hero-detail.html` | `pages/hero/detail.vue` | `/api/hero/{id}`、`/api/hero/evaluate/list` |
| `html/around.html` | `pages/around/around.vue` | `/api/around/list` |
| `html/donation.html` | `pages/donation/donation.vue` | `/api/donation/list` |
| `html/activity.html` | `pages/activity/activity.vue` | `/api/activity/list` |
| `html/activity-detail.html` | `pages/activity/detail.vue` | `/api/activity/{id}`、`/api/activity/apply` |
| `html/study.html` | `pages/study/study.vue` | `/api/testimonials*`、`/api/history*` |
| `html/analysis.html` + `js/charts.js` | `pages/analysis/analysis.vue` + `components/dl-chart` | `/api/data/comment/list`、`/api/read/book/list*` |
| `html/user.html` | `pages/user/user.vue` | `/api/common/user/getInfo`、`/common/upload`、`/logout` |
| —（新增） | `pages/ai/ai.vue` + `utils/ai.js` | 全部接口都能被 AI 当工具调用 |

**原项目一个字没动**，还在 `D:\移动应用与开发\DEEP`。

---

## 四、AI 问答助手（重点）

### 4.1 它到底做了什么

不是「套个聊天框」那么简单，它有三层：

**第一层 · 调大模型**

标准 OpenAI 协议：`POST {baseUrl}/chat/completions`。
所以 DeepSeek、通义千问、Kimi、智谱、OpenAI 都能用，**只改 baseUrl + model 这两个字符串**。

**第二层 · 调你自己的后端接口（function calling）**

`utils/ai.js` 里注册了 10 个工具，对应后端真实接口：

| 工具名 | 对应接口 |
|---|---|
| `get_banner_list` | `/api/building/banner/list` |
| `search_model_news` | `/api/model/list` |
| `search_hero_story` | `/api/hero/list` |
| `get_activity_list` | `/api/activity/list` |
| `get_my_applications` | `/api/activity/apply/list` |
| `get_study_summary` | `/api/common/user/getInfo` + `/api/history/list` |
| `get_comment_stats` | `/api/data/comment/list`（全量拉取后按月统计） |
| `get_reading_stats` | `/api/read/book/list` + `/type`（全量拉取后统计） |
| `get_donation_list` | `/api/donation/list` |
| `get_user_profile` | `/api/common/user/getInfo` |

流程是这样的：

```
你问「有哪些公益活动可以报名」
   ↓
模型说：我要调 get_activity_list
   ↓
App 真的去请求 http://114.66.9.70:10002/prod-api/api/activity/list
   ↓
把真实 JSON 塞回对话
   ↓
模型根据真实数据写回答
```

**用户看到的效果**：气泡上方会出现一个小标签「查询公益活动 ●」，绿点表示调用完成。
这个标签就是给评委看的——证明它真的在连你的后端，不是背台词。

**第三层 · 兜底（没 Key / 断网 / 跨域被拦）**

自动切到「本地数据模式」：用关键词判断你想问什么，**直接查后端真接口**，套模板回答。
所以：**没 Key 也能演示，而且回答里的数字都是真的**。

### 4.2 怎么配 Key

不用改代码，在 App 里点 AI 页右上角 **「设置」**：

| 服务 | 接口地址 | 模型名 |
|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| 阿里百炼 / 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| 月之暗面 Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |

填完点「测试连接」，通了会弹「连接成功」。

也可以直接改 `config/index.js` 里的 `AI.apiKey` 写死一个默认值。

### 4.3 一个必须知道的坑：H5 的跨域（CORS）

- **手机 APK / App 端**：没有跨域限制，直连没问题。
- **H5（浏览器）**：如果接口没开 `Access-Control-Allow-Origin`，浏览器会拦。
  DeepSeek 官方接口一般允许浏览器直连；万一被拦，App 会**自动降级成本地数据模式**，
  不会白屏、不会弹红字，只是回答会变成「先本地数据顶一下」。

**省赛现场建议演示 APK**，别用浏览器。

### 4.4 性能取舍（说实话）

- 你问一句、模型不需要查数据 → **1 次请求**，直接答。
- 需要查数据 → **3 次请求**（规划调工具 → 拿结果整理 → 流式输出）。
  多一次是为了「一个字一个字蹦出来」的效果，现场看着更像真的。
  嫌慢可以把 `config/index.js` 里 `AI.maxToolRounds` 调小。

---

## 五、这次从零到跑通，改了哪些原版的写法

| 原版（mui + 原生） | 新版（uni-app Vue3） |
|---|---|
| 字符串拼 HTML + `innerHTML` | 数据驱动，`v-for` 自动渲染 |
| `mui.ajax` | `uni.request` + Promise 封装（`utils/request.js`） |
| `localStorage.setItem` | `uni.setStorageSync`（App/H5/小程序通用） |
| `location.href` 跳页 | `uni.navigateTo` / `switchTab` / `reLaunch` |
| `location.search` 正则抠参数 | 页面 `onLoad(options)` 直接拿 |
| 每个页面手写 `Authorization` 头 | 请求封装里自动带，401 自动踢回登录 |
| `mui.confirm` / `mui.alert` | `uni.showModal` / `uni.showToast` |
| `<input type="file">` + `FormData` | `uni.chooseImage` + `uni.uploadFile` |
| `js/charts.js` 全局函数 | `components/dl-chart` 组件，`props` 传数据 |
| 固定 px | `rpx`（750rpx = 屏幕宽，自动适配大小屏） |

---

## 六、已知限制（别在赛场上被问懵）

1. **大模型那条路已经用真 Key 实测过了**：在 Android 11 模拟器里装 APK，跑通
   「DeepSeek 返回工具调用 → App 请求 `/api/activity/list` → 拿真实数据作答」。
   H5 端跨域那条没单独验（浏览器环境不同），App 端没有跨域问题。
2. **H5 端跨域**：见 4.3，App 端无此问题。
3. **数据分析页首次加载较慢**（3~8 秒）：要把 9651 条评论、2448 条阅读记录全部分页拉完再统计，
   这是接口只有分页、没有聚合接口导致的，原版也一样。
4. **「身边英雄」接口文档里没写返回字段**，按 `id/imgUrl/name/introduction/title/content` 猜的，
   实测能正常显示。
5. **头像上传**只传了文件、拿到 URL 后本地显示，后端没有「保存头像」的接口，
   所以退出去再进来会恢复原头像。原版也是这个行为。
6. **API Key 是明文写在 `config/index.js` 里的**，会原样打进 APK。别把 APK 外传；
   要交源码前记得清空（详见 `DEEP-uniapp-apk\README.md` 第六节）。

---

## 七、想继续加东西，从哪下手

- 改接口地址 → `config/index.js`
- 加一个后端接口 → `api/index.js` 加一个函数
- 加一个 AI 能用的工具 → `utils/ai.js` 里 `TOOLS` 加一条 + `execTool` 加一个 `case`
- 改主题色 → `uni.scss` 的 `$dl-primary` + `pages.json` 的 `navigationBarBackgroundColor`
- 改 tab → `pages.json` 的 `tabBar.list`（最多 5 个）
