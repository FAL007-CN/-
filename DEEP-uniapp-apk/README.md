# 数字生活 APK —— 打包说明

这个目录是「把 uni-app 的 H5 产物装进安卓壳」的完整源工程。
成品在上一层：`D:\移动应用与开发\数字生活.apk`

---

## 一、这个 APK 是怎么来的（说清楚，别被问懵）

```
DEEP-uniapp（uni-app 源码）
        │  uni build  →  H5 生产构建（43 个文件 / 0.45 MB）
        ▼
    H5 产物（index.html + assets/*.js/css）
        │  塞进 assets/www/
        ▼
   这个 Android 工程（1 个 Activity + 1 个 WebView）
        │  aapt2 → javac → d8 → zipalign → apksigner
        ▼
      数字生活.apk（188 KB）
```

### 为什么不用 DCloud 离线打包 / 云打包？

| 方案 | 问题 |
|---|---|
| HBuilderX **云打包** | 要登录 DCloud 账号、在图形界面点发行；本鲸鱼这边跑不了 GUI |
| 竞赛资源里的 **离线打包 SDK** | ① 只带 `armeabi-v7a` / `arm64-v8a` 原生库，装不进 x86 模拟器，没法验证 ② `dcloud_appkey` 绑定在别人的 appid + 包名上，改了会校验失败 |
| **本方案：WebView 壳** | 没有 appkey、没有原生库、任何安卓手机都能装，而且能真装真跑真截图 |

代价：拿不到 uni-app 的原生能力（相机、蓝牙、推送、原生 tabBar 等）。
本项目只用到网络请求 + 本地存储 + 选图片，**WebView 全都支持**，所以没有功能损失。

> 想要「官方原生包」：项目在 HBuilderX 里打开 → `发行` → `原生App-云打包`。
> 源码已经是标准 HBuilderX 工程，直接能打。

---

## 二、技术上要解决的三个坑

### 坑 1：`file://` 加载不了 ES Module

H5 产物是 `<script type="module">`。如果用 `file:///android_asset/www/index.html` 打开，
浏览器的 CORS 策略会直接拦掉模块脚本 → **白屏**。

**解法**：注册一个虚拟域名 `https://appassets.androidplatform.net`，
在 `WebViewClient.shouldInterceptRequest` 里把请求拦下来，从 assets 里读文件返回。
页面看起来就是在访问 https 站点，模块脚本、`fetch`、`localStorage` 全部正常。

### 坑 2：页面是 https，后端是 http —— 混合内容被拦

页面在 `https://` 下，请求 `http://114.66.9.70:10002` 会被 WebView 当成混合内容拦死。

**解法**（两处都要）：

```xml
<!-- AndroidManifest.xml -->
<application android:usesCleartextTraffic="true" ... >
```

```java
// MainActivity.java
settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
```

另外还实现了 `WebChromeClient.onShowFileChooser`，不然 H5 里点「换头像」没反应。

---

### 坑 3：真机上图片全空 —— https 源 + http 图片

第一版用的是 `https://appassets.androidplatform.net` 作为虚拟源。
**模拟器（Android 11 + Chrome 83 WebView）上一切正常**，但换到真机
**HONOR NIC-AN00 / Android 15 / 荣耀自研 WebView 1.0.2.300** 后：

- 文字数据正常（XHR 到 `http://114.66.9.70` 能通）
- **所有图片变成灰块**（轮播图、新闻缩略图、活动配图全空）

原因是 https 页面加载 http 图片属于「混合内容」，
`MIXED_CONTENT_ALWAYS_ALLOW` 在新版 WebView 上对图片这一档没有生效，被静默拦掉了。
logcat 里连报错都没有，非常难查。

**改法**：把虚拟源换成 **http**（`START_URL = "http://appassets.androidplatform.net/index.html"`）。
页面、接口、图片全是 http，压根不存在混合内容。改完图片立刻恢复。

> ES Module 在 http 源下照样能用（模块只要求 MIME 正确 + 同源/CORS，**不要求安全上下文**），
> localStorage / XHR / fetch 也都正常。所以这个改动没有副作用。

同时顺手修了两个观感问题：

1. **状态栏黑边** → `getWindow().setStatusBarColor(0xFF1E88E5)`，和标题栏同色
2. **AI 输入框 placeholder 被截成两行** → 文案缩短成「问点什么…」

---

## 三、真机实测记录（HONOR NIC-AN00 / Android 15）

| 项 | 结果 |
|---|---|
| 设备 | HONOR NIC-AN00，Android 15（SDK 35），arm64-v8a，720×1604 @320dpi |
| WebView | 荣耀自研 com.hihonor.webview 1.0.2.300 |
| 安装 | ✅ db install Success |
| 冷启动 / 登录 | ✅ test01/123456 登录成功，token 正常保存 |
| 首页 | ✅ 轮播 + 6 宫格 + 楷模新闻，**图片修复后全部显示** |
| 公益列表 / 详情 | ✅ 21 个活动，图片、报名人数、发起方全对 |
| 心得 / 感言 / 学习历史 / 笔记 | ✅ 增删改查按钮都在，真实数据 |
| 数据分析三张图 | ✅ canvas 柱状图/折线图/饼图都画出来了，8366 条评论、2056 本阅读 |
| **AI 工具调用** | ✅ 点「有哪些公益活动可以报名」→ 出现标签「查询公益活动 ●」→ 答出 21 个活动 + 真实报名人数 |
| 状态栏 | ✅ 修复后与标题栏同为 #1E88E5，无黑边 |

**没测到的**：换头像的文件选择（要真人点相册）、断网兜底、横屏/平板。

截图见 D:\移动应用与开发\DEEP-uniapp\docs\screenshots\30~37-真机-*.png。

---

## 四、文件说明

```
DEEP-uniapp-apk/
├── AndroidManifest.xml          包名 com.deep.digitallife，targetSdk 30，minSdk 21
├── src/com/deep/digitallife/
│   └── MainActivity.java        全部逻辑（不到 200 行）
├── res/
│   ├── values/strings.xml       应用名「数字生活」
│   └── drawable/ic_launcher.png 图标（蓝底 + logo，192×192）
├── assets/www/                  ★ H5 产物放这里（现在这份就是最终版）
└── 数字生活.apk                  成品（和上一层那个是同一个文件）
```

---

## 五、想重新打一次（改了前端之后）

前置：Android SDK（本机 `C:\Users\hp\AppData\Local\Android\Sdk`）、JDK（本机 `C:\Program Files\Java\latest\jdk-25`）。

> ⚠️ **构建目录必须是纯英文路径**。
> `aapt2` 是原生程序，遇到中文路径（比如 `D:\移动应用与开发\...`）会报
> `failed to open directory`，因为它把 UTF-8 当 GBK 读了。
> 所以本鲸鱼是在 `C:\apkbuild` 里构建，再把成品拷回来的。

步骤：

```text
1. 重新构建 H5：在 DEEP-uniapp 里 uni build（HBuilderX 发行→网站-H5，或用 CLI）
2. 把 dist 里的东西覆盖到 assets/www/
3. aapt2 compile --dir res -o build\res.zip
4. aapt2 link -o build\base.apk -I android.jar --manifest AndroidManifest.xml
             --java build\gen --auto-add-overlay --min-sdk-version 21 --target-sdk-version 30 build\res.zip
5. javac -encoding UTF-8 --release 11 -classpath android.jar -d build\classes
         src\com\deep\digitallife\MainActivity.java build\gen\com\deep\digitallife\R.java
6. d8 --lib android.jar --min-api 21 --output build\dex build\classes\**\*.class
7. 把 build\dex\classes.dex 和 assets\** 打进 build\base.apk
8. zipalign -p -f 4 base.apk aligned.apk
9. apksigner sign --ks test.keystore --ks-key-alias testalias
                 --ks-pass pass:123456 --key-pass pass:123456
                 --out 数字生活.apk aligned.apk
```

第 7 步「往已有 APK 里加文件」用 PowerShell 的 `System.IO.Compression.ZipFile` 就行，
不方便手打的话让本鲸鱼来跑。

---

## 六、签名信息（重要）

用的是竞赛资源 B 模块里自带的测试证书：

```
文件：test.keystore（在 C:\Users\hp\Desktop\竞赛资源\B\B-离线打包SDK\HBuilder-Integrate-AS\simpleDemo\）
别名：testalias
密码：123456
```

- **同一个证书签的包才能覆盖安装**。换了证书要先卸载旧版，否则报 `INSTALL_FAILED_UPDATE_INCOMPATIBLE`。
- 这是**测试证书**，不能上应用商店。省赛交作品够用；真要发布得自己生成一个。

---

## 七、⚠️ 一个安全问题：API Key 打包进 APK 了

`DEEP-uniapp/config/index.js` 里的 `AI.apiKey` 现在是明文，
构建时会**原样打进 APK**，任何人拿到这个 APK 都能把 Key 抽出来。

所以：

1. **别把这个 APK 发给别人、别传网盘/群文件**。
2. 省赛如果要求**提交源码**，交之前把 `config/index.js` 里的 Key 清成 `''`。
3. 更稳的做法：Key 不写在代码里，用 App 内「AI 助手 → 右上角设置」填（存在手机本地，不进 APK）。

---

## 八、模拟器实测记录（Android 11 / x86）

模拟器：Pixel 3 XL / Android 11 / x86（`emulator-5554`）

| 步骤 | 结果 |
|---|---|
| `adb install` | ✅ Success |
| 冷启动 | ✅ 显示登录页，标题「数字生活 / DIGITAL LIFE」 |
| 点登录（test01/123456） | ✅ 跳到首页，轮播图 + 6 宫格 + 楷模新闻全部真数据 |
| 切到 AI 助手 | ✅ 显示「已连接 deepseek-chat」 |
| 问「有哪些公益活动可以报名？」 | ✅ 出现工具标签「查询公益活动」→ DeepSeek 真的让 App 请求了 `/api/activity/list` → 回答里 21 个活动、报名人数全是真数据 |
| logcat 致命错误 | ✅ 无 |
