if (typeof Promise !== "undefined" && !Promise.prototype.finally) {
  Promise.prototype.finally = function(callback) {
    const promise = this.constructor;
    return this.then(
      (value) => promise.resolve(callback()).then(() => value),
      (reason) => promise.resolve(callback()).then(() => {
        throw reason;
      })
    );
  };
}
;
if (typeof uni !== "undefined" && uni && uni.requireGlobal) {
  const global = uni.requireGlobal();
  ArrayBuffer = global.ArrayBuffer;
  Int8Array = global.Int8Array;
  Uint8Array = global.Uint8Array;
  Uint8ClampedArray = global.Uint8ClampedArray;
  Int16Array = global.Int16Array;
  Uint16Array = global.Uint16Array;
  Int32Array = global.Int32Array;
  Uint32Array = global.Uint32Array;
  Float32Array = global.Float32Array;
  Float64Array = global.Float64Array;
  BigInt64Array = global.BigInt64Array;
  BigUint64Array = global.BigUint64Array;
}
;
if (uni.restoreGlobal) {
  uni.restoreGlobal(Vue, weex, plus, setTimeout, clearTimeout, setInterval, clearInterval);
}
(function(vue) {
  "use strict";
  const BASE_URL = "http://114.66.9.70:10002/prod-api";
  const IMG_URL = "http://114.66.9.70:10002/prod-api";
  const TIMEOUT = 15e3;
  const AI = {
    // 模型服务地址（不带 /chat/completions，那个后缀由 ai.js 的 chatUrl() 拼）
    baseUrl: "https://api.deepseek.com",
    /**
     * 密钥。
     *
     * ⚠️ 注意：这是明文写在客户端里的，打包进 APK 后任何人反编译都能拿到。
     *    移动端做 AI 的通病——密钥没法真正藏住。当前只用于比赛演示。
     *    生产做法是加一层自己的后端代理：密钥只留服务端，客户端拿临时凭证。
     *    （这一点在 PPT P31「已知限制」里会主动交代，别等评委问。）
     */
    apiKey: "sk-e9f53b2851ce486d88421b9a6232ebbf",
    // 模型名。换供应商时这个也要跟着换（见上面那张对照表）
    model: "deepseek-chat",
    /**
     * 温度，0~2。控制回答的随机性：
     *   0    —— 每次几乎一样，像查字典
     *   0.6  —— 有点变化但可控（本项目取值，问答场景够稳）
     *   1.5+ —— 很发散，容易跑题
     * 【为什么不用 0】因为这是个聊天助手，太死板会显得像模板回复。
     */
    temperature: 0.6,
    // 最多允许 AI 连续调用几轮后端接口（防止死循环）
    // 【为什么必须有】模型可能调完一个工具又觉得不够、再调一个……不设上限会烧 token
    // 且把页面卡死。3 轮足够覆盖「先查列表、再查详情」这类组合。
    maxToolRounds: 3,
    // 保留多少条历史消息发给模型（太多会费 token）
    // 【为什么是 12】只发最近 12 条，相当于一个「滑动窗口」：
    // 既能记住刚才聊了什么，又不会把整段对话每次都重发一遍（按 token 计费）。
    historyLimit: 12,
    /**
     * systemPrompt：给 AI 立人设 + 讲清楚它有哪些工具可用。
     *
     * @teach-02 为什么写成数组再 .join('\n')，不直接写一大段字符串？
     *   ① 可读性：一行一句，改哪句一眼能看到，不用在长字符串里找换行符；
     *   ② 不会漏空格：用 '+' 拼字符串时很容易漏掉行尾空格，导致两句话粘在一起；
     *   ③ 每行末尾的逗号由编辑器帮你管，加一句就加一行，不会破坏结构。
     *   最后 .join('\n') 把它们用「换行符」连成一个字符串，交给模型。
     *
     * 【为什么这几句很关键】systemPrompt 是唯一能稳定约束模型行为的地方：
     *   第 3 条要求「先调工具再回答」，是 AI 不乱编数字的前提；
     *   第 2 条限制 150 字，防止手机屏幕上刷出一屏字。
     */
    systemPrompt: [
      "你是「数字生活」App 内置的智能助手，名字叫小鲸。",
      "「数字生活」是一个记录时代楷模、英雄故事，并支持公益活动、学习心得、数据分析的手机应用。",
      "回答要求：",
      "1. 用简体中文，大白话，别端着，别用 markdown 标题；",
      "2. 能简短就简短，一般不超过 150 字，除非用户要求详细；",
      "3. 需要真实数据时，先调用工具查接口，再根据返回结果回答，不要编造数字；",
      "4. 工具查不到就直说没查到，不要瞎猜；",
      "5. 用户问「怎么用某个功能」时，告诉他点哪里。"
    ].join("\n")
  };
  const STORAGE_KEYS = {
    token: "token",
    userInfo: "userInfo",
    aiSettings: "aiSettings",
    aiMessages: "aiMessages"
  };
  function getToken() {
    return uni.getStorageSync(STORAGE_KEYS.token) || "";
  }
  function setToken(token) {
    uni.setStorageSync(STORAGE_KEYS.token, token || "");
  }
  function clearToken() {
    uni.removeStorageSync(STORAGE_KEYS.token);
    uni.removeStorageSync(STORAGE_KEYS.userInfo);
  }
  function fullImg(url) {
    if (!url)
      return "";
    if (String(url).indexOf("http") === 0)
      return url;
    return IMG_URL + url;
  }
  let redirecting = false;
  function toLogin() {
    if (redirecting)
      return;
    redirecting = true;
    clearToken();
    uni.reLaunch({
      url: "/pages/login/login",
      complete() {
        setTimeout(() => {
          redirecting = false;
        }, 800);
      }
    });
  }
  function request(options = {}) {
    const {
      url,
      method = "GET",
      params = null,
      data = null,
      auth = true,
      loading = false
    } = options;
    let fullUrl = BASE_URL + url;
    if (params && Object.keys(params).length) {
      const qs = Object.keys(params).filter((k) => params[k] !== void 0 && params[k] !== null && params[k] !== "").map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
      if (qs)
        fullUrl += (url.indexOf("?") >= 0 ? "&" : "?") + qs;
    }
    const header = { "Content-Type": "application/json" };
    if (auth) {
      const token = getToken();
      if (token)
        header.Authorization = token;
    }
    if (loading)
      uni.showLoading({ title: "加载中…", mask: true });
    return new Promise((resolve, reject) => {
      uni.request({
        url: fullUrl,
        // 【为什么 toUpperCase】防止调用方传 'get' 写成小写，统一转大写更保险
        method: method.toUpperCase(),
        // 【为什么 data 要 || undefined】GET 请求不需要 body，
        // 传 null 有些平台会真的发一个 "null" 字符串出去
        data: data || void 0,
        header,
        timeout: TIMEOUT,
        success(res) {
          if (loading)
            uni.hideLoading();
          if (res.statusCode === 401) {
            toLogin();
            reject(new Error("登录已过期，请重新登录"));
            return;
          }
          const body = res.data || {};
          if (body.code !== 200) {
            const msg = body.msg || `请求失败（${res.statusCode}）`;
            if (body.code === 401)
              toLogin();
            reject(new Error(msg));
            return;
          }
          resolve(body);
        },
        /**
         * @teach-06 第三层：网络层失败。
         *   断网、域名解析不了、服务器没开、超时……都会走到这里。
         *   err.errMsg 是 uni 给的中文原因（比如 'request:fail timeout'），
         *   直接透给用户比「未知错误」有用得多。
         */
        fail(err) {
          if (loading)
            uni.hideLoading();
          reject(new Error(err && err.errMsg ? err.errMsg : "网络异常，请检查网络或服务器地址"));
        }
      });
    });
  }
  const http = {
    get(url, params, opts = {}) {
      return request({ url, method: "GET", params, ...opts });
    },
    post(url, data, opts = {}) {
      return request({ url, method: "POST", data, ...opts });
    },
    put(url, data, opts = {}) {
      return request({ url, method: "PUT", data, ...opts });
    },
    // 【为什么叫 del 不叫 delete】delete 是 JS 保留字，不能当属性名用（严格模式下报错）
    del(url, params, opts = {}) {
      return request({ url, method: "DELETE", params, ...opts });
    }
  };
  const login = (username, password) => http.post("/api/login", { username, password }, { auth: false });
  const phoneLogin = (phone, password) => http.post("/api/phone/login", { phone, password }, { auth: false });
  const logout = () => http.post("/logout", {});
  const bannerList = () => http.get("/api/building/banner/list");
  const modelList = (pageNum = 1, pageSize = 10) => http.get("/api/model/list", { pageNum, pageSize });
  const heroList = (pageNum = 1, pageSize = 10) => http.get("/api/hero/list", { pageNum, pageSize });
  const heroDetail = (id) => http.get(`/api/hero/${id}`);
  const heroComments = (heroId, pageNum = 1, pageSize = 10) => http.get("/api/hero/evaluate/list", { heroId, pageNum, pageSize });
  const aroundList = (pageNum = 1, pageSize = 10) => http.get("/api/around/list", { pageNum, pageSize });
  const testimonialsList = (pageNum = 1, pageSize = 10) => http.get("/api/testimonials/list", { pageNum, pageSize });
  const addTestimonial = (title, content) => http.post("/api/testimonials", { title, content });
  const delTestimonial = (id) => http.del(`/api/testimonials/${id}`);
  const historyList = (userId, pageNum = 1, pageSize = 10) => http.get("/api/history/list", { userId, pageNum, pageSize });
  const addNote = (noteTitle, noteContent, studyHistoryId) => http.post("/api/history/note", { noteTitle, noteContent, studyHistoryId: Number(studyHistoryId) });
  const updateNote = (noteId, noteTitle, noteContent) => http.put("/api/history/note", { noteId: Number(noteId), noteTitle, noteContent });
  const delNote = (noteId, studyHistoryId) => http.del("/api/history/note", { noteId, studyHistoryId });
  const activityList = (pageNum = 1, pageSize = 10) => http.get("/api/activity/list", { pageNum, pageSize });
  const activityDetail = (id) => http.get(`/api/activity/${id}`);
  const myApplyList = (pageNum = 1, pageSize = 100) => http.get("/api/activity/apply/list", { pageNum, pageSize });
  const applyActivity = (activityId) => http.post("/api/activity/apply", { activityId: Number(activityId) });
  const donationList = (pageNum = 1, pageSize = 10) => http.get("/api/donation/list", { pageNum, pageSize });
  const commentList = (pageNum = 1, pageSize = 5e3) => http.get("/api/data/comment/list", { pageNum, pageSize });
  const readBookList = (pageNum = 1, pageSize = 5e3) => http.get("/api/read/book/list", { pageNum, pageSize });
  const readBookTypeList = (pageNum = 1, pageSize = 5e3) => http.get("/api/read/book/list/type", { pageNum, pageSize });
  const userInfo = () => http.get("/api/common/user/getInfo");
  function uploadFile(filePath) {
    return new Promise((resolve, reject) => {
      uni.uploadFile({
        // 注意：uploadFile 不做地址拼接，必须自己拼 BASE_URL
        url: BASE_URL + "/common/upload",
        filePath,
        // name 是后端接收文件的字段名，文档里写的是 file，不能改
        name: "file",
        // uploadFile 不会自动带 token，得自己塞（这里只带 Authorization，没有 JSON 头）
        header: { Authorization: getToken() },
        success(res) {
          let body = {};
          try {
            body = JSON.parse(res.data);
          } catch (e) {
            reject(new Error("服务器返回格式异常"));
            return;
          }
          if (body.code === 200) {
            resolve({ url: fullImg(body.url || body.fileName || ""), raw: body });
          } else {
            reject(new Error(body.msg || "上传失败"));
          }
        },
        fail(err) {
          reject(new Error(err.errMsg || "上传失败"));
        }
      });
    });
  }
  async function fetchAll(fetcher, pageSize = 5e3) {
    let page = 1;
    let all = [];
    while (page <= 20) {
      const res = await fetcher(page, pageSize);
      const rows = res && res.rows || [];
      all = all.concat(rows);
      const total = res && res.total || 0;
      if (!rows.length || all.length >= total)
        break;
      page += 1;
    }
    return all;
  }
  const _export_sfc = (sfc, props) => {
    const target = sfc.__vccOpts || sfc;
    for (const [key, val] of props) {
      target[key] = val;
    }
    return target;
  };
  const _sfc_main$e = {
    __name: "login",
    setup(__props, { expose: __expose }) {
      __expose();
      const loginType = vue.ref("user");
      const loading = vue.ref(false);
      const form = vue.reactive({
        user: "test01",
        pwd: "123456",
        phone: "",
        phonePwd: ""
      });
      vue.onMounted(() => {
        if (getToken()) {
          uni.reLaunch({ url: "/pages/index/index" });
        }
      });
      function toast(msg) {
        uni.showToast({ title: msg, icon: "none", duration: 2e3 });
      }
      async function submit() {
        if (loading.value)
          return;
        let payloadCheck = "";
        if (loginType.value === "user") {
          if (!form.user.trim())
            payloadCheck = "账号不能为空";
          else if (!form.pwd.trim())
            payloadCheck = "密码不能为空";
        } else {
          if (!form.phone.trim())
            payloadCheck = "手机号不能为空";
          else if (!form.phonePwd.trim())
            payloadCheck = "密码不能为空";
        }
        if (payloadCheck) {
          toast(payloadCheck);
          return;
        }
        loading.value = true;
        try {
          const res = loginType.value === "user" ? await login(form.user.trim(), form.pwd.trim()) : await phoneLogin(form.phone.trim(), form.phonePwd.trim());
          setToken(res.token);
          try {
            const info = await userInfo();
            uni.setStorageSync(STORAGE_KEYS.userInfo, info.data || {});
          } catch (e) {
          }
          uni.showToast({ title: "登录成功", icon: "success", duration: 800 });
          setTimeout(() => {
            uni.reLaunch({ url: "/pages/index/index" });
          }, 500);
        } catch (e) {
          toast(e.message || "登录失败，请检查账号密码");
        } finally {
          loading.value = false;
        }
      }
      const __returned__ = { loginType, loading, form, toast, submit, ref: vue.ref, reactive: vue.reactive, onMounted: vue.onMounted, get login() {
        return login;
      }, get phoneLogin() {
        return phoneLogin;
      }, get userInfo() {
        return userInfo;
      }, get setToken() {
        return setToken;
      }, get getToken() {
        return getToken;
      }, get STORAGE_KEYS() {
        return STORAGE_KEYS;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$d(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "login-page" }, [
      vue.createElementVNode("view", { class: "login-logo" }, [
        vue.createElementVNode("text", { class: "cn" }, "数字生活"),
        vue.createElementVNode("text", { class: "en" }, "DIGITAL LIFE")
      ]),
      vue.createElementVNode("view", { class: "login-box" }, [
        vue.createElementVNode("view", { class: "login-tabs" }, [
          vue.createElementVNode(
            "view",
            {
              class: vue.normalizeClass(["login-tab", { active: $setup.loginType === "user" }]),
              onClick: _cache[0] || (_cache[0] = ($event) => $setup.loginType = "user")
            },
            [
              vue.createElementVNode("text", null, "账号登录")
            ],
            2
            /* CLASS */
          ),
          vue.createElementVNode(
            "view",
            {
              class: vue.normalizeClass(["login-tab", { active: $setup.loginType === "phone" }]),
              onClick: _cache[1] || (_cache[1] = ($event) => $setup.loginType = "phone")
            },
            [
              vue.createElementVNode("text", null, "手机号登录")
            ],
            2
            /* CLASS */
          )
        ]),
        $setup.loginType === "user" ? (vue.openBlock(), vue.createElementBlock("view", { key: 0 }, [
          vue.createElementVNode("view", { class: "dl-field" }, [
            vue.createElementVNode("text", { class: "dl-field-label" }, "账号"),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "dl-field-input",
                "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => $setup.form.user = $event),
                placeholder: "请输入账号",
                "placeholder-class": "ph"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $setup.form.user]
            ])
          ]),
          vue.createElementVNode("view", { class: "dl-field" }, [
            vue.createElementVNode("text", { class: "dl-field-label" }, "密码"),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "dl-field-input",
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $setup.form.pwd = $event),
                password: "",
                placeholder: "请输入密码",
                "placeholder-class": "ph"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $setup.form.pwd]
            ])
          ])
        ])) : (vue.openBlock(), vue.createElementBlock("view", { key: 1 }, [
          vue.createElementVNode("view", { class: "dl-field" }, [
            vue.createElementVNode("text", { class: "dl-field-label" }, "手机号"),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "dl-field-input",
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $setup.form.phone = $event),
                type: "number",
                placeholder: "请输入手机号",
                "placeholder-class": "ph"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $setup.form.phone]
            ])
          ]),
          vue.createElementVNode("view", { class: "dl-field" }, [
            vue.createElementVNode("text", { class: "dl-field-label" }, "密码"),
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "dl-field-input",
                "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $setup.form.phonePwd = $event),
                password: "",
                placeholder: "请输入密码",
                "placeholder-class": "ph"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $setup.form.phonePwd]
            ])
          ])
        ])),
        vue.createElementVNode(
          "view",
          {
            class: vue.normalizeClass(["dl-btn login-btn", { disabled: $setup.loading }]),
            onClick: $setup.submit
          },
          [
            vue.createElementVNode(
              "text",
              null,
              vue.toDisplayString($setup.loading ? "登录中…" : "登 录"),
              1
              /* TEXT */
            )
          ],
          2
          /* CLASS */
        ),
        vue.createElementVNode("text", { class: "login-tip" }, "默认测试账号：test01 / 123456")
      ]),
      vue.createElementVNode("view", { class: "login-foot" }, [
        vue.createElementVNode("text", null, "uni-app · Vue3 版 · 数据来自数字生活开放接口")
      ])
    ]);
  }
  const PagesLoginLogin = /* @__PURE__ */ _export_sfc(_sfc_main$e, [["render", _sfc_render$d], ["__scopeId", "data-v-e4e4508d"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/login/login.vue"]]);
  const ON_SHOW = "onShow";
  const ON_LOAD = "onLoad";
  const ON_PULL_DOWN_REFRESH = "onPullDownRefresh";
  function resolveEasycom(component, easycom) {
    return typeof component === "string" ? easycom : component;
  }
  const createLifeCycleHook = (lifecycle, flag = 0) => (hook, target = vue.getCurrentInstance()) => {
    if (vue.isInSSRComponentSetup)
      return;
    vue.injectHook(lifecycle, hook, target);
  };
  const onShow = /* @__PURE__ */ createLifeCycleHook(
    ON_SHOW,
    2
    /* HookFlags.PAGE */
  );
  const onLoad = /* @__PURE__ */ createLifeCycleHook(
    ON_LOAD,
    2
    /* HookFlags.PAGE */
  );
  const onPullDownRefresh = /* @__PURE__ */ createLifeCycleHook(
    ON_PULL_DOWN_REFRESH,
    2
    /* HookFlags.PAGE */
  );
  const PAGE_SIZE$5 = 5;
  const _sfc_main$d = {
    __name: "index",
    setup(__props, { expose: __expose }) {
      __expose();
      const banners = vue.ref([]);
      const bannerFailed = vue.ref(false);
      const news = vue.ref([]);
      const total = vue.ref(0);
      const loaded = vue.ref(0);
      const newsLoading = vue.ref(false);
      const pageNum = vue.ref(1);
      const grids = [
        { name: "楷模列表", icon: "★", color: "dl-c1", url: "/pages/model/model" },
        { name: "英雄故事", icon: "英", color: "dl-c2", url: "/pages/hero/hero" },
        { name: "身边英雄", icon: "近", color: "dl-c3", url: "/pages/around/around" },
        { name: "物资捐赠", icon: "捐", color: "dl-c4", url: "/pages/donation/donation" },
        { name: "数据分析", icon: "▤", color: "dl-c5", url: "/pages/analysis/analysis" },
        { name: "个人中心", icon: "我", color: "dl-c6", url: "/pages/user/user" }
      ];
      function go(url) {
        const tabs = ["/pages/index/index", "/pages/activity/activity", "/pages/study/study", "/pages/ai/ai", "/pages/analysis/analysis"];
        if (tabs.indexOf(url) >= 0)
          uni.switchTab({ url });
        else
          uni.navigateTo({ url });
      }
      async function loadBanner() {
        try {
          const res = await bannerList();
          banners.value = res.rows || [];
        } catch (e) {
          bannerFailed.value = true;
        }
      }
      async function loadNews(reset = false) {
        if (newsLoading.value)
          return;
        if (reset) {
          pageNum.value = 1;
          loaded.value = 0;
          news.value = [];
        }
        newsLoading.value = true;
        try {
          const res = await modelList(pageNum.value, PAGE_SIZE$5);
          total.value = res.total || 0;
          const rows = res.rows || [];
          news.value = reset ? rows : news.value.concat(rows);
          loaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          newsLoading.value = false;
        }
      }
      function loadMore() {
        if (loaded.value >= total.value)
          return;
        pageNum.value += 1;
        loadNews(false);
      }
      vue.onMounted(() => {
        if (!getToken()) {
          uni.reLaunch({ url: "/pages/login/login" });
          return;
        }
        loadBanner();
        loadNews(true);
      });
      onPullDownRefresh(async () => {
        await Promise.all([loadBanner(), loadNews(true)]);
        uni.stopPullDownRefresh();
      });
      const __returned__ = { banners, bannerFailed, news, total, loaded, newsLoading, pageNum, PAGE_SIZE: PAGE_SIZE$5, grids, go, loadBanner, loadNews, loadMore, ref: vue.ref, onMounted: vue.onMounted, get onPullDownRefresh() {
        return onPullDownRefresh;
      }, get onShow() {
        return onShow;
      }, get bannerList() {
        return bannerList;
      }, get modelList() {
        return modelList;
      }, get fullImg() {
        return fullImg;
      }, get getToken() {
        return getToken;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$c(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      vue.createElementVNode("view", { class: "banner" }, [
        $setup.banners.length ? (vue.openBlock(), vue.createElementBlock("swiper", {
          key: 0,
          class: "banner-swiper",
          autoplay: true,
          interval: 3e3,
          duration: 400,
          circular: true,
          "indicator-dots": $setup.banners.length > 1,
          "indicator-color": "rgba(255,255,255,.45)",
          "indicator-active-color": "#ffffff"
        }, [
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($setup.banners, (b, i) => {
              return vue.openBlock(), vue.createElementBlock("swiper-item", {
                key: b.id || i
              }, [
                vue.createElementVNode("image", {
                  class: "banner-img",
                  src: $setup.fullImg(b.imgUrl),
                  mode: "aspectFill"
                }, null, 8, ["src"]),
                vue.createElementVNode("view", { class: "banner-title" }, [
                  vue.createElementVNode(
                    "text",
                    null,
                    vue.toDisplayString(b.title),
                    1
                    /* TEXT */
                  )
                ])
              ]);
            }),
            128
            /* KEYED_FRAGMENT */
          ))
        ], 8, ["indicator-dots"])) : (vue.openBlock(), vue.createElementBlock("view", {
          key: 1,
          class: "banner-holder"
        }, [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.bannerFailed ? "轮播图加载失败" : "加载中…"),
            1
            /* TEXT */
          )
        ]))
      ]),
      vue.createElementVNode("view", { class: "dl-grid" }, [
        (vue.openBlock(), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($setup.grids, (g) => {
            return vue.createElementVNode("view", {
              class: "dl-grid-item",
              key: g.name,
              onClick: ($event) => $setup.go(g.url)
            }, [
              vue.createElementVNode(
                "view",
                {
                  class: vue.normalizeClass(["dl-grid-icon", g.color])
                },
                [
                  vue.createElementVNode(
                    "text",
                    { class: "icon-txt" },
                    vue.toDisplayString(g.icon),
                    1
                    /* TEXT */
                  )
                ],
                2
                /* CLASS */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-grid-name" },
                vue.toDisplayString(g.name),
                1
                /* TEXT */
              )
            ], 8, ["onClick"]);
          }),
          64
          /* STABLE_FRAGMENT */
        ))
      ]),
      vue.createElementVNode("view", { class: "dl-section" }, [
        vue.createElementVNode("text", null, "热点楷模新闻"),
        vue.createElementVNode("text", {
          class: "dl-more",
          onClick: _cache[0] || (_cache[0] = ($event) => $setup.go("/pages/model/model"))
        }, "全部 ›")
      ]),
      vue.createElementVNode("view", { class: "news-wrap" }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($setup.news, (n) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              class: "dl-news",
              key: n.id,
              onClick: _cache[1] || (_cache[1] = ($event) => $setup.go("/pages/model/model"))
            }, [
              vue.createElementVNode("image", {
                class: "dl-news-img",
                src: $setup.fullImg(n.imgUrl),
                mode: "aspectFill"
              }, null, 8, ["src"]),
              vue.createElementVNode("view", { class: "dl-news-info" }, [
                vue.createElementVNode(
                  "text",
                  { class: "dl-news-title" },
                  vue.toDisplayString(n.title),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "dl-news-name" },
                  "楷模：" + vue.toDisplayString(n.name),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "dl-news-desc" },
                  vue.toDisplayString(n.content),
                  1
                  /* TEXT */
                )
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        )),
        !$setup.news.length ? (vue.openBlock(), vue.createElementBlock("view", {
          key: 0,
          class: "dl-empty"
        }, [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.newsLoading ? "正在加载…" : "暂无新闻"),
            1
            /* TEXT */
          )
        ])) : vue.createCommentVNode("v-if", true),
        $setup.news.length ? (vue.openBlock(), vue.createElementBlock(
          "view",
          {
            key: 1,
            class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.loaded >= $setup.total }]),
            onClick: $setup.loadMore
          },
          [
            vue.createElementVNode(
              "text",
              null,
              vue.toDisplayString($setup.loaded >= $setup.total ? "没有更多了" : "查看更多"),
              1
              /* TEXT */
            )
          ],
          2
          /* CLASS */
        )) : vue.createCommentVNode("v-if", true)
      ]),
      vue.createElementVNode("view", { class: "dl-safe-bottom" })
    ]);
  }
  const PagesIndexIndex = /* @__PURE__ */ _export_sfc(_sfc_main$d, [["render", _sfc_render$c], ["__scopeId", "data-v-1cf27b2a"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/index/index.vue"]]);
  const PAGE_SIZE$4 = 10;
  const _sfc_main$c = {
    __name: "activity",
    setup(__props, { expose: __expose }) {
      __expose();
      const list = vue.ref([]);
      const pageNum = vue.ref(1);
      const total = vue.ref(0);
      const loaded = vue.ref(0);
      const loading = vue.ref(false);
      async function load(reset = false) {
        if (loading.value)
          return;
        if (reset) {
          pageNum.value = 1;
          loaded.value = 0;
          list.value = [];
        }
        loading.value = true;
        try {
          const res = await activityList(pageNum.value, PAGE_SIZE$4);
          total.value = res.total || 0;
          const rows = res.rows || [];
          list.value = list.value.concat(rows);
          loaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          loading.value = false;
        }
      }
      function loadMore() {
        if (loaded.value >= total.value)
          return;
        pageNum.value += 1;
        load(false);
      }
      function openDetail(id) {
        uni.navigateTo({ url: `/pages/activity/detail?id=${id}` });
      }
      vue.onMounted(() => load(true));
      onShow(() => {
        if (list.value.length)
          load(true);
      });
      onPullDownRefresh(async () => {
        await load(true);
        uni.stopPullDownRefresh();
      });
      const __returned__ = { list, pageNum, PAGE_SIZE: PAGE_SIZE$4, total, loaded, loading, load, loadMore, openDetail, ref: vue.ref, onMounted: vue.onMounted, get onPullDownRefresh() {
        return onPullDownRefresh;
      }, get onShow() {
        return onShow;
      }, get activityList() {
        return activityList;
      }, get fullImg() {
        return fullImg;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$b(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      (vue.openBlock(true), vue.createElementBlock(
        vue.Fragment,
        null,
        vue.renderList($setup.list, (a) => {
          return vue.openBlock(), vue.createElementBlock("view", {
            class: "dl-card",
            key: a.id
          }, [
            vue.createElementVNode("image", {
              class: "dl-card-img act-img",
              src: $setup.fullImg(a.imgUrl),
              mode: "aspectFill"
            }, null, 8, ["src"]),
            vue.createElementVNode("view", { class: "dl-card-body" }, [
              vue.createElementVNode(
                "text",
                { class: "dl-card-title" },
                vue.toDisplayString(a.activityName),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-meta" },
                "报名人数：" + vue.toDisplayString(a.applyNum) + " 人",
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-meta" },
                "活动时间：" + vue.toDisplayString(a.startEndTime),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-text dl-clamp-2" },
                vue.toDisplayString(a.activityDetail),
                1
                /* TEXT */
              ),
              vue.createElementVNode("view", { class: "act-foot" }, [
                vue.createElementVNode(
                  "text",
                  { class: "dl-card-meta" },
                  "发起方：" + vue.toDisplayString(a.initiator || "公益组织"),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode("view", {
                  class: "dl-btn-sm",
                  onClick: ($event) => $setup.openDetail(a.id)
                }, [
                  vue.createElementVNode("text", null, "报名")
                ], 8, ["onClick"])
              ])
            ])
          ]);
        }),
        128
        /* KEYED_FRAGMENT */
      )),
      !$setup.list.length ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "dl-empty"
      }, [
        vue.createElementVNode(
          "text",
          null,
          vue.toDisplayString($setup.loading ? "正在加载…" : "暂无活动"),
          1
          /* TEXT */
        )
      ])) : vue.createCommentVNode("v-if", true),
      $setup.list.length ? (vue.openBlock(), vue.createElementBlock(
        "view",
        {
          key: 1,
          class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.loaded >= $setup.total }]),
          onClick: $setup.loadMore
        },
        [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.loaded >= $setup.total ? "没有更多了" : "加载更多"),
            1
            /* TEXT */
          )
        ],
        2
        /* CLASS */
      )) : vue.createCommentVNode("v-if", true),
      vue.createElementVNode("view", { class: "dl-safe-bottom" })
    ]);
  }
  const PagesActivityActivity = /* @__PURE__ */ _export_sfc(_sfc_main$c, [["render", _sfc_render$b], ["__scopeId", "data-v-da48f91d"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/activity/activity.vue"]]);
  const TAIL_SIZE = 10;
  const HIS_SIZE = 10;
  const _sfc_main$b = {
    __name: "study",
    setup(__props, { expose: __expose }) {
      __expose();
      const tab = vue.ref("tail");
      const userId = vue.ref(0);
      const tails = vue.ref([]);
      const tailPage = vue.ref(1);
      const tailTotal = vue.ref(0);
      const tailLoaded = vue.ref(0);
      const tailLoading = vue.ref(false);
      const tailFormOpen = vue.ref(false);
      const tailTitle = vue.ref("");
      const tailContent = vue.ref("");
      async function loadTails(reset = false) {
        if (tailLoading.value)
          return;
        if (reset) {
          tailPage.value = 1;
          tailLoaded.value = 0;
          tails.value = [];
        }
        tailLoading.value = true;
        try {
          const res = await testimonialsList(tailPage.value, TAIL_SIZE);
          tailTotal.value = res.total || 0;
          const rows = res.rows || [];
          tails.value = tails.value.concat(rows);
          tailLoaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          tailLoading.value = false;
        }
      }
      function moreTails() {
        if (tailLoaded.value >= tailTotal.value)
          return;
        tailPage.value += 1;
        loadTails(false);
      }
      function cancelTail() {
        tailFormOpen.value = false;
        tailTitle.value = "";
        tailContent.value = "";
      }
      async function submitTail() {
        const title = tailTitle.value.trim();
        const content = tailContent.value.trim();
        if (!title)
          return uni.showToast({ title: "感言标题不能为空", icon: "none" });
        if (!content)
          return uni.showToast({ title: "感言内容不能为空", icon: "none" });
        try {
          await addTestimonial(title, content);
          uni.showToast({ title: "发布成功", icon: "success" });
          cancelTail();
          loadTails(true);
        } catch (e) {
          uni.showToast({ title: e.message || "发布失败", icon: "none" });
        }
      }
      function removeTail(id) {
        uni.showModal({
          title: "提示",
          content: "确定要删除这条感言吗？",
          confirmText: "删除",
          confirmColor: "#e53935",
          success: async (r) => {
            if (!r.confirm)
              return;
            try {
              await delTestimonial(id);
              uni.showToast({ title: "删除成功", icon: "success" });
              loadTails(true);
            } catch (e) {
              uni.showToast({ title: e.message || "删除失败", icon: "none" });
            }
          }
        });
      }
      const history = vue.ref([]);
      const hisPage = vue.ref(1);
      const hisTotal = vue.ref(0);
      const hisLoaded = vue.ref(0);
      const hisLoading = vue.ref(false);
      async function ensureUserId() {
        if (userId.value)
          return userId.value;
        const cached = uni.getStorageSync(STORAGE_KEYS.userInfo);
        if (cached && cached.userId) {
          userId.value = cached.userId;
          return userId.value;
        }
        const res = await userInfo();
        userId.value = res.data && res.data.userId || 0;
        uni.setStorageSync(STORAGE_KEYS.userInfo, res.data || {});
        return userId.value;
      }
      async function loadHistory(reset = false) {
        if (hisLoading.value)
          return;
        if (reset) {
          hisPage.value = 1;
          hisLoaded.value = 0;
          history.value = [];
        }
        hisLoading.value = true;
        try {
          const uid = await ensureUserId();
          const res = await historyList(uid, hisPage.value, HIS_SIZE);
          hisTotal.value = res.total || 0;
          const rows = res.rows || [];
          history.value = history.value.concat(rows);
          hisLoaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          hisLoading.value = false;
        }
      }
      function moreHistory() {
        if (hisLoaded.value >= hisTotal.value)
          return;
        hisPage.value += 1;
        loadHistory(false);
      }
      const noteOpen = vue.ref(false);
      const noteMode = vue.ref("add");
      const noteTitle = vue.ref("");
      const noteContent = vue.ref("");
      const curRow = vue.ref({});
      function openNote(mode, row) {
        noteMode.value = mode;
        curRow.value = row;
        noteTitle.value = mode === "edit" ? row.wstudyNote.noteTitle : "";
        noteContent.value = mode === "edit" ? row.wstudyNote.noteContent : "";
        noteOpen.value = true;
      }
      async function saveNote() {
        const title = noteTitle.value.trim();
        const content = noteContent.value.trim();
        if (!title)
          return uni.showToast({ title: "笔记标题不能为空", icon: "none" });
        if (!content)
          return uni.showToast({ title: "笔记内容不能为空", icon: "none" });
        try {
          if (noteMode.value === "add") {
            await addNote(title, content, curRow.value.id);
          } else {
            await updateNote(curRow.value.wstudyNote.noteId, title, content);
          }
          uni.showToast({ title: noteMode.value === "add" ? "笔记已添加" : "笔记已修改", icon: "success" });
          noteOpen.value = false;
          loadHistory(true);
        } catch (e) {
          uni.showToast({ title: e.message || "保存失败", icon: "none" });
        }
      }
      function removeNote(row) {
        uni.showModal({
          title: "提示",
          content: "确定要删除这条笔记吗？",
          confirmText: "删除",
          confirmColor: "#e53935",
          success: async (r) => {
            if (!r.confirm)
              return;
            try {
              await delNote(row.wstudyNote.noteId, row.id);
              uni.showToast({ title: "删除成功", icon: "success" });
              loadHistory(true);
            } catch (e) {
              uni.showToast({ title: e.message || "删除失败", icon: "none" });
            }
          }
        });
      }
      vue.onMounted(() => {
        loadTails(true);
        loadHistory(true);
      });
      const __returned__ = { tab, userId, tails, tailPage, TAIL_SIZE, tailTotal, tailLoaded, tailLoading, tailFormOpen, tailTitle, tailContent, loadTails, moreTails, cancelTail, submitTail, removeTail, history, hisPage, HIS_SIZE, hisTotal, hisLoaded, hisLoading, ensureUserId, loadHistory, moreHistory, noteOpen, noteMode, noteTitle, noteContent, curRow, openNote, saveNote, removeNote, ref: vue.ref, onMounted: vue.onMounted, get testimonialsList() {
        return testimonialsList;
      }, get addTestimonial() {
        return addTestimonial;
      }, get delTestimonial() {
        return delTestimonial;
      }, get historyList() {
        return historyList;
      }, get addNote() {
        return addNote;
      }, get updateNote() {
        return updateNote;
      }, get delNote() {
        return delNote;
      }, get userInfo() {
        return userInfo;
      }, get STORAGE_KEYS() {
        return STORAGE_KEYS;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$a(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      vue.createElementVNode("view", { class: "dl-tabs" }, [
        vue.createElementVNode(
          "view",
          {
            class: vue.normalizeClass(["dl-tab", { active: $setup.tab === "tail" }]),
            onClick: _cache[0] || (_cache[0] = ($event) => $setup.tab = "tail")
          },
          [
            vue.createElementVNode("text", null, "学习感言")
          ],
          2
          /* CLASS */
        ),
        vue.createElementVNode(
          "view",
          {
            class: vue.normalizeClass(["dl-tab", { active: $setup.tab === "history" }]),
            onClick: _cache[1] || (_cache[1] = ($event) => $setup.tab = "history")
          },
          [
            vue.createElementVNode("text", null, "学习历史")
          ],
          2
          /* CLASS */
        )
      ]),
      $setup.tab === "tail" ? (vue.openBlock(), vue.createElementBlock("view", { key: 0 }, [
        vue.createElementVNode("view", { class: "dl-form-box" }, [
          vue.createElementVNode("view", {
            class: "dl-btn-line",
            onClick: _cache[2] || (_cache[2] = ($event) => $setup.tailFormOpen = !$setup.tailFormOpen)
          }, [
            vue.createElementVNode(
              "text",
              null,
              vue.toDisplayString($setup.tailFormOpen ? "收起" : "+ 写学习感言"),
              1
              /* TEXT */
            )
          ]),
          $setup.tailFormOpen ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 0,
            class: "tail-form"
          }, [
            vue.withDirectives(vue.createElementVNode(
              "input",
              {
                class: "dl-input",
                "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $setup.tailTitle = $event),
                placeholder: "感言标题",
                "placeholder-class": "ph"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $setup.tailTitle]
            ]),
            vue.withDirectives(vue.createElementVNode(
              "textarea",
              {
                class: "dl-textarea",
                "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $setup.tailContent = $event),
                placeholder: "感言内容",
                "placeholder-class": "ph"
              },
              null,
              512
              /* NEED_PATCH */
            ), [
              [vue.vModelText, $setup.tailContent]
            ]),
            vue.createElementVNode("view", { class: "dl-btn-row" }, [
              vue.createElementVNode("view", {
                class: "dl-btn",
                onClick: $setup.submitTail
              }, [
                vue.createElementVNode("text", null, "发布")
              ]),
              vue.createElementVNode("view", {
                class: "dl-btn gray",
                onClick: $setup.cancelTail
              }, [
                vue.createElementVNode("text", null, "取消")
              ])
            ])
          ])) : vue.createCommentVNode("v-if", true)
        ]),
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($setup.tails, (t) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              class: "dl-card",
              key: t.id
            }, [
              vue.createElementVNode("view", { class: "dl-card-body" }, [
                vue.createElementVNode(
                  "text",
                  { class: "dl-card-title" },
                  vue.toDisplayString(t.title),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "dl-card-meta" },
                  vue.toDisplayString(t.createTime),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "dl-card-text dl-clamp-3" },
                  vue.toDisplayString(t.content),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode("view", { class: "dl-note-actions" }, [
                  vue.createElementVNode("view", {
                    class: "dl-btn-sm red",
                    onClick: ($event) => $setup.removeTail(t.id)
                  }, [
                    vue.createElementVNode("text", null, "删除")
                  ], 8, ["onClick"])
                ])
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        )),
        !$setup.tails.length ? (vue.openBlock(), vue.createElementBlock("view", {
          key: 0,
          class: "dl-empty"
        }, [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.tailLoading ? "正在加载…" : "还没有感言，快来写一条吧"),
            1
            /* TEXT */
          )
        ])) : vue.createCommentVNode("v-if", true),
        $setup.tails.length ? (vue.openBlock(), vue.createElementBlock(
          "view",
          {
            key: 1,
            class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.tailLoaded >= $setup.tailTotal }]),
            onClick: $setup.moreTails
          },
          [
            vue.createElementVNode(
              "text",
              null,
              vue.toDisplayString($setup.tailLoaded >= $setup.tailTotal ? "没有更多了" : "加载更多"),
              1
              /* TEXT */
            )
          ],
          2
          /* CLASS */
        )) : vue.createCommentVNode("v-if", true)
      ])) : (vue.openBlock(), vue.createElementBlock("view", { key: 1 }, [
        (vue.openBlock(true), vue.createElementBlock(
          vue.Fragment,
          null,
          vue.renderList($setup.history, (h) => {
            return vue.openBlock(), vue.createElementBlock("view", {
              class: "dl-card",
              key: h.id
            }, [
              vue.createElementVNode("view", { class: "dl-card-body" }, [
                vue.createElementVNode(
                  "text",
                  { class: "dl-card-title" },
                  vue.toDisplayString(h.title),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "dl-card-meta" },
                  "发布时间：" + vue.toDisplayString(h.issueTime),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "dl-card-text dl-clamp-3" },
                  vue.toDisplayString(h.content),
                  1
                  /* TEXT */
                ),
                h.wstudyNote && h.wstudyNote.noteId ? (vue.openBlock(), vue.createElementBlock("view", {
                  key: 0,
                  class: "dl-note"
                }, [
                  vue.createElementVNode(
                    "text",
                    { class: "dl-note-title" },
                    vue.toDisplayString(h.wstudyNote.noteTitle),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode(
                    "text",
                    { class: "dl-note-content" },
                    vue.toDisplayString(h.wstudyNote.noteContent),
                    1
                    /* TEXT */
                  ),
                  vue.createElementVNode("view", { class: "dl-note-actions" }, [
                    vue.createElementVNode("view", {
                      class: "dl-btn-sm",
                      onClick: ($event) => $setup.openNote("edit", h)
                    }, [
                      vue.createElementVNode("text", null, "编辑")
                    ], 8, ["onClick"]),
                    vue.createElementVNode("view", {
                      class: "dl-btn-sm red",
                      onClick: ($event) => $setup.removeNote(h)
                    }, [
                      vue.createElementVNode("text", null, "删除")
                    ], 8, ["onClick"])
                  ])
                ])) : (vue.openBlock(), vue.createElementBlock("view", {
                  key: 1,
                  class: "note-add"
                }, [
                  vue.createElementVNode("view", {
                    class: "dl-btn-sm",
                    onClick: ($event) => $setup.openNote("add", h)
                  }, [
                    vue.createElementVNode("text", null, "添加笔记")
                  ], 8, ["onClick"])
                ]))
              ])
            ]);
          }),
          128
          /* KEYED_FRAGMENT */
        )),
        !$setup.history.length ? (vue.openBlock(), vue.createElementBlock("view", {
          key: 0,
          class: "dl-empty"
        }, [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.hisLoading ? "正在加载…" : "暂无学习历史"),
            1
            /* TEXT */
          )
        ])) : vue.createCommentVNode("v-if", true),
        $setup.history.length ? (vue.openBlock(), vue.createElementBlock(
          "view",
          {
            key: 1,
            class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.hisLoaded >= $setup.hisTotal }]),
            onClick: $setup.moreHistory
          },
          [
            vue.createElementVNode(
              "text",
              null,
              vue.toDisplayString($setup.hisLoaded >= $setup.hisTotal ? "没有更多了" : "加载更多"),
              1
              /* TEXT */
            )
          ],
          2
          /* CLASS */
        )) : vue.createCommentVNode("v-if", true)
      ])),
      $setup.noteOpen ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 2,
        class: "mask",
        onClick: _cache[9] || (_cache[9] = ($event) => $setup.noteOpen = false)
      }, [
        vue.createElementVNode("view", {
          class: "sheet",
          onClick: _cache[8] || (_cache[8] = vue.withModifiers(() => {
          }, ["stop"]))
        }, [
          vue.createElementVNode(
            "text",
            { class: "sheet-title" },
            vue.toDisplayString($setup.noteMode === "add" ? "给《" + $setup.curRow.title + "》添加笔记" : "编辑笔记"),
            1
            /* TEXT */
          ),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              class: "dl-input",
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $setup.noteTitle = $event),
              placeholder: "笔记标题",
              "placeholder-class": "ph"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $setup.noteTitle]
          ]),
          vue.withDirectives(vue.createElementVNode(
            "textarea",
            {
              class: "dl-textarea",
              "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => $setup.noteContent = $event),
              placeholder: "笔记内容",
              "placeholder-class": "ph"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $setup.noteContent]
          ]),
          vue.createElementVNode("view", { class: "dl-btn-row" }, [
            vue.createElementVNode("view", {
              class: "dl-btn",
              onClick: $setup.saveNote
            }, [
              vue.createElementVNode("text", null, "保存")
            ]),
            vue.createElementVNode("view", {
              class: "dl-btn gray",
              onClick: _cache[7] || (_cache[7] = ($event) => $setup.noteOpen = false)
            }, [
              vue.createElementVNode("text", null, "取消")
            ])
          ]),
          vue.createElementVNode("view", { class: "dl-safe-bottom" })
        ])
      ])) : vue.createCommentVNode("v-if", true),
      vue.createElementVNode("view", { class: "dl-safe-bottom" })
    ]);
  }
  const PagesStudyStudy = /* @__PURE__ */ _export_sfc(_sfc_main$b, [["render", _sfc_render$a], ["__scopeId", "data-v-3f273c1e"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/study/study.vue"]]);
  function getAISettings() {
    const saved = uni.getStorageSync(STORAGE_KEYS.aiSettings) || {};
    return {
      baseUrl: saved.baseUrl || AI.baseUrl,
      apiKey: saved.apiKey || AI.apiKey,
      model: saved.model || AI.model
    };
  }
  function saveAISettings(settings) {
    const next = {
      ...getAISettings(),
      ...settings
    };
    uni.setStorageSync(STORAGE_KEYS.aiSettings, next);
    return next;
  }
  function hasApiKey() {
    return !!getAISettings().apiKey.trim();
  }
  function chatUrl(baseUrl) {
    return String(baseUrl).replace(/\/+$/, "") + "/chat/completions";
  }
  const pick = (arr, keys, limit = 8) => (arr || []).slice(0, limit).map((it) => {
    const o = {};
    keys.forEach((k) => {
      if (it[k] !== void 0 && it[k] !== null)
        o[k] = it[k];
    });
    return o;
  });
  const TOOLS = [
    {
      type: "function",
      function: {
        name: "get_banner_list",
        description: "查询首页轮播图（广告位）的标题列表。用户问首页轮播/广告时用。",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_model_news",
        // 带 keyword 的工具，description 里要写清「按什么字段过滤」
        description: "查询「楷模新闻」列表，可按姓名或标题关键词过滤。返回标题、楷模姓名、内容摘要。用户问楷模、模范人物、新闻时用。",
        parameters: {
          type: "object",
          properties: {
            keyword: {
              type: "string",
              description: "关键词，可为空"
            },
            pageSize: {
              type: "number",
              description: "返回条数，默认 5"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "search_hero_story",
        description: "查询「英雄故事」列表，可按标题或英雄姓名关键词过滤。返回标题、姓名、简介、点击量。",
        parameters: {
          type: "object",
          properties: {
            keyword: {
              type: "string",
              description: "关键词，可为空"
            },
            pageSize: {
              type: "number",
              description: "返回条数，默认 5"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_activity_list",
        description: "查询「公益活动」列表。返回活动名称、报名人数、活动时间、发起方。用户问有哪些公益活动、想报名时用。",
        parameters: {
          type: "object",
          properties: {
            keyword: {
              type: "string",
              description: "活动名称关键词，可为空"
            },
            pageSize: {
              type: "number",
              description: "返回条数，默认 5"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_my_applications",
        // 「当前登录用户」这种隐含条件要写进来，否则模型可能以为能查别人
        description: "查询当前登录用户已报名的公益活动记录。用户问「我报了哪些活动」时用。",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_study_summary",
        description: "查询当前用户的学习历史条数和最近几条学习内容标题，以及是否写过笔记。用户问学习记录、心得、笔记时用。",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_comment_stats",
        // 这个工具在服务端做了聚合（12 个月数组 + 峰值月），
        // description 里把「输出什么」写清楚，模型才知道该怎么组织回答
        description: "统计 2022 年每个月的新闻评论数量（区分女性/男性），并给出全年总数和评论最多的月份。用户问评论数据、数据分析、哪个月活跃时用。",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_reading_stats",
        description: "统计 2022 年每月阅读书籍数量、全年总数，以及书籍类型占比（哪种书读得最多）。用户问阅读数据、书籍类型偏好时用。",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_donation_list",
        description: "查询物资捐赠记录。返回捐赠物品、捐赠人、数量、日期。",
        parameters: {
          type: "object",
          properties: {
            pageSize: {
              type: "number",
              description: "返回条数，默认 5"
            }
          },
          required: []
        }
      }
    },
    {
      type: "function",
      function: {
        name: "get_user_profile",
        description: "查询当前登录用户的基本信息（昵称、账号、性别、手机号、邮箱、余额等）。",
        parameters: {
          type: "object",
          properties: {},
          required: []
        }
      }
    },
    //现场修改补丁
    // 【这个工具是后补的】原本只有 10 个，演示时发现问「身边英雄」答不上来，
    // 于是照着上面的模板补了第 11 个。注意：文件头注释里写的「11 个」是更正后的数字。
    {
      type: "function",
      function: {
        name: "get_around_hero",
        description: "查询「身边英雄」列表，返回标题、姓名、简介。",
        parameters: {
          type: "object",
          properties: {
            pageSize: {
              type: "number"
            }
          },
          required: []
        }
      }
    }
  ];
  let cachedUserId = null;
  async function currentUserId() {
    if (cachedUserId)
      return cachedUserId;
    const res = await userInfo();
    const u = res && res.data || {};
    cachedUserId = u.userId;
    return cachedUserId;
  }
  async function execTool(name, args = {}) {
    const kw = (args.keyword || "").trim();
    const size = Math.min(Number(args.pageSize) || 5, 20);
    try {
      switch (name) {
        case "get_banner_list": {
          const res = await bannerList();
          return {
            轮播图: pick(res.rows, ["id", "title"])
          };
        }
        case "search_model_news": {
          const res = await modelList(1, 50);
          let rows = res.rows || [];
          if (kw)
            rows = rows.filter((r) => `${r.title}${r.name}`.includes(kw));
          return {
            总数: res.total,
            命中: rows.length,
            列表: pick(rows, ["id", "title", "name", "content"], size)
          };
        }
        case "search_hero_story": {
          const res = await heroList(1, 50);
          let rows = res.rows || [];
          if (kw)
            rows = rows.filter((r) => `${r.title}${r.name}`.includes(kw));
          return {
            总数: res.total,
            命中: rows.length,
            列表: pick(rows, ["id", "title", "name", "introduction", "clickNum"], size)
          };
        }
        case "get_activity_list": {
          const res = await activityList(1, 50);
          let rows = res.rows || [];
          if (kw)
            rows = rows.filter((r) => `${r.activityName}${r.activityDetail}`.includes(kw));
          return {
            总数: res.total,
            命中: rows.length,
            列表: pick(
              rows,
              ["id", "activityName", "applyNum", "startEndTime", "initiator", "briefIntroduction"],
              size
            )
          };
        }
        case "get_my_applications": {
          const res = await myApplyList(1, 100);
          return {
            我的报名条数: (res.rows || []).length,
            记录: pick(res.rows, ["id", "activityId", "createTime"], 10)
          };
        }
        case "get_study_summary": {
          const uid = await currentUserId();
          const res = await historyList(uid, 1, 20);
          const rows = res.rows || [];
          return {
            学习历史条数: res.total,
            // 【为什么不是简单的 length】一条学习记录不一定有笔记，
            // wstudyNote 是嵌套对象，得判断它存在且 noteId 有值才算「写了笔记」
            带笔记的条数: rows.filter((r) => r.wstudyNote && r.wstudyNote.noteId).length,
            最近内容: pick(rows, ["title", "issueTime", "noteTitle"], 5)
          };
        }
        case "get_comment_stats": {
          const rows = await fetchAll(commentList, 5e3);
          const female = new Array(12).fill(0);
          const male = new Array(12).fill(0);
          let yearTotal = 0;
          rows.forEach((r) => {
            const t = String(r.commentTime || "");
            if (t.substring(0, 4) !== "2022")
              return;
            const m = Number(t.substring(5, 7));
            if (!m || m < 1 || m > 12)
              return;
            if (String(r.commentUserSex) === "1")
              female[m - 1] += 1;
            else
              male[m - 1] += 1;
            yearTotal += 1;
          });
          const monthTotal = female.map((v, i) => v + male[i]);
          const peak = monthTotal.indexOf(Math.max(...monthTotal)) + 1;
          return {
            数据总条数: rows.length,
            "2022年评论总数": yearTotal,
            女性分月: female,
            男性分月: male,
            评论最多的月份: `${peak}月`,
            该月评论数: monthTotal[peak - 1]
          };
        }
        case "get_reading_stats": {
          const [readRows, typeRows] = await Promise.all([
            fetchAll(readBookList, 5e3),
            fetchAll(readBookTypeList, 5e3)
          ]);
          const monthly = new Array(12).fill(0);
          let yearTotal = 0;
          readRows.forEach((r) => {
            const t = String(r.readTime || "");
            if (t.substring(0, 4) !== "2022")
              return;
            const m = Number(t.substring(5, 7));
            if (!m || m < 1 || m > 12)
              return;
            monthly[m - 1] += 1;
            yearTotal += 1;
          });
          const map = {};
          typeRows.forEach((r) => {
            const n = r.bookTypeName || "其他";
            map[n] = (map[n] || 0) + 1;
          });
          const totalType = Object.values(map).reduce((a, b) => a + b, 0) || 1;
          const ranking = Object.keys(map).map((k) => ({
            类型: k,
            数量: map[k],
            // toFixed(1) 保留一位小数，拼上 % 号，避免出现 33.33333333%
            占比: `${(map[k] / totalType * 100).toFixed(1)}%`
          })).sort((a, b) => b.数量 - a.数量);
          const peak = monthly.indexOf(Math.max(...monthly)) + 1;
          return {
            "2022年阅读总数": yearTotal,
            分月数量: monthly,
            阅读最多的月份: `${peak}月`,
            书籍类型数: ranking.length,
            类型排行: ranking
          };
        }
        case "get_donation_list": {
          const res = await donationList(1, size);
          return {
            总数: res.total,
            列表: pick(res.rows, ["content", "donationUser", "number", "donationDate"], size)
          };
        }
        case "get_user_profile": {
          const res = await userInfo();
          const u = res.data || {};
          return {
            昵称: u.nickName,
            账号: u.userName,
            性别: String(u.sex) === "0" ? "男" : String(u.sex) === "1" ? "女" : "未知",
            手机号: u.phonenumber,
            邮箱: u.email,
            余额: u.balance
          };
        }
        case "get_around_hero": {
          const res = await aroundList(1, size);
          return {
            总数: res.total,
            列表: pick(res.rows, ["title", "name", "introduction"], size)
          };
        }
        default:
          return {
            错误: `没有名为 ${name} 的工具`
          };
      }
    } catch (e) {
      return {
        错误: `调用接口失败：${e.message || e}`
      };
    }
  }
  async function callModel(messages, {
    tools = true,
    stream = false,
    onDelta = null
  } = {}) {
    const {
      baseUrl,
      apiKey,
      model
    } = getAISettings();
    if (!apiKey)
      throw new Error("NO_KEY");
    const payload = {
      model,
      messages,
      temperature: AI.temperature,
      // !!stream 把任意真值转成布尔，防止外面传了 undefined 导致 JSON 里出现 null
      stream: !!stream
    };
    if (tools) {
      payload.tools = TOOLS;
      payload.tool_choice = "auto";
    }
    const headers = {
      "Content-Type": "application/json",
      /**
       * 注意这里和 utils/request.js 不一样：
       *   业务接口传的是裸 token（Authorization: xxx），
       *   大模型接口要求标准格式（Authorization: Bearer sk-xxx）。
       *   两套后端两套鉴权，别混。
       */
      Authorization: `Bearer ${apiKey}`
    };
    const url = chatUrl(baseUrl);
    const data = await new Promise((resolve, reject) => {
      uni.request({
        url,
        method: "POST",
        header: headers,
        data: payload,
        /**
         * 【为什么这里给 60 秒，而普通接口只给 15 秒】
         *   大模型要「思考」再输出，尤其带工具的时候，
         *   一次往返 10~30 秒很正常。用 15 秒会大量误判成超时。
         *   这个值是单独写死的，没有复用 config 里的 TIMEOUT——刻意的。
         */
        timeout: 6e4,
        success: (res) => {
          if (res.statusCode === 200)
            return resolve(res.data || {});
          const detail = res.data && res.data.error ? res.data.error.message : JSON.stringify(res.data || {});
          reject(new Error(`HTTP ${res.statusCode}：${detail}`));
        },
        fail: (err) => reject(new Error(err && err.errMsg || "网络异常"))
      });
    });
    const msg = data.choices && data.choices[0] && data.choices[0].message || {};
    return {
      content: msg.content || "",
      toolCalls: msg.tool_calls || []
    };
  }
  const hits = (q, ...words) => words.some((w) => q.indexOf(w) >= 0);
  async function localAnswer(question) {
    const q = String(question || "");
    if (hits(q, "评论", "数据分析", "分析", "统计", "哪个月", "活跃")) {
      try {
        const r = await execTool("get_comment_stats");
        return [
          `📊 2022 年新闻评论一共 ${r["2022年评论总数"]} 条。`,
          `评论最多的月份是 ${r["评论最多的月份"]}（${r["该月评论数"]} 条）。`,
          `女性 ${r.女性分月.reduce((a, b) => a + b, 0)} 条 / 男性 ${r.男性分月.reduce((a, b) => a + b, 0)} 条。`,
          "（离线回答：数据来自后端 /api/data/comment/list）"
        ].join("\n");
      } catch (e) {
        return `没查到评论数据：${e.message}`;
      }
    }
    if (hits(q, "阅读", "书", "书籍", "看什么")) {
      try {
        const r = await execTool("get_reading_stats");
        const top = r.类型排行.slice(0, 3).map((x) => `${x.类型}${x.占比}`).join("、");
        return [
          `📚 2022 年共阅读 ${r["2022年阅读总数"]} 本，${r["阅读最多的月份"]}读得最多。`,
          `书籍类型 ${r.书籍类型数} 种，前三：${top}。`,
          "（离线回答：数据来自后端 /api/read/book/list/type）"
        ].join("\n");
      } catch (e) {
        return `没查到阅读数据：${e.message}`;
      }
    }
    if (hits(q, "报名", "公益", "活动", "志愿")) {
      try {
        const [list, mine] = await Promise.all([execTool("get_activity_list", {
          pageSize: 5
        }), execTool("get_my_applications")]);
        const names = (list.列表 || []).map((a, i) => `${i + 1}. ${a.activityName}（已报名 ${a.applyNum} 人）`).join(
          "\n"
        );
        return [
          `现在有 ${list.总数} 个公益活动：`,
          names || "暂时没有活动",
          "",
          `你已报名 ${mine.我的报名条数} 个。想报名就进「公益」页，点活动卡片的「报名」。`,
          "（离线回答：数据来自后端 /api/activity/list）"
        ].join("\n");
      } catch (e) {
        return `没查到活动数据：${e.message}`;
      }
    }
    if (hits(q, "楷模", "模范", "新闻")) {
      try {
        const r = await execTool("search_model_news", {
          pageSize: 5
        });
        return [`共 ${r.总数} 条楷模新闻：`, (r.列表 || []).map((n, i) => `${i + 1}. ${n.title}（${n.name}）`).join("\n")].join("\n");
      } catch (e) {
        return `没查到楷模新闻：${e.message}`;
      }
    }
    if (hits(q, "英雄", "事迹")) {
      try {
        const r = await execTool("search_hero_story", {
          pageSize: 5
        });
        return [`共 ${r.总数} 篇英雄故事：`, (r.列表 || []).map((h, i) => `${i + 1}. ${h.title} — ${h.name}`).join("\n")].join("\n");
      } catch (e) {
        return `没查到英雄故事：${e.message}`;
      }
    }
    if (hits(q, "学习", "笔记", "心得", "感言")) {
      try {
        const r = await execTool("get_study_summary");
        return [
          `你的学习历史共 ${r.学习历史条数} 条，其中 ${r.带笔记的条数} 条写了笔记。`,
          "最近学的：" + ((r.最近内容 || []).map((x) => x.title).join("、") || "暂无"),
          "在「心得」页可以发学习感言、给每条学习内容加笔记。",
          "（离线回答：数据来自后端 /api/history/list）"
        ].join("\n");
      } catch (e) {
        return `没查到学习数据：${e.message}`;
      }
    }
    if (hits(q, "我", "账号", "资料", "余额")) {
      try {
        const u = await execTool("get_user_profile");
        return [`你现在登录的是「${u.昵称 || u.账号}」，账号 ${u.账号}，性别 ${u.性别}，余额 ${u.余额 || 0} 元。`].join("");
      } catch (e) {
        return `没查到用户信息：${e.message}`;
      }
    }
    return [
      "我是「数字生活」的智能助手小鲸 🐳",
      "现在没配置大模型 Key，我用的是本地数据问答，照样能查真数据。你可以问我：",
      "· 有哪些公益活动可以报名？",
      "· 2022 年评论数据怎么样？",
      "· 我的学习记录有几条？",
      "· 有哪些楷模新闻 / 英雄故事？",
      ". 查询「身边英雄」列表",
      "配好 Key 之后，我还能聊天、写文案、解释代码。"
    ].join("\n");
  }
  async function chat(history, question, handlers = {}) {
    const {
      onDelta,
      onTool,
      onToolDone
    } = handlers;
    if (!hasApiKey()) {
      const text = await localAnswer(question);
      if (onDelta)
        onDelta(text);
      return {
        text,
        mode: "local"
      };
    }
    const messages = [
      {
        role: "system",
        content: AI.systemPrompt
      },
      /**
       * 【语法】history.slice(-AI.historyLimit) 是「取最后 N 条」的惯用写法：
       *   slice(-12) 表示从倒数第 12 个开始，一直取到结尾。
       *   这就是「滑动窗口」——只带最近 12 条，既省 token 又不会丢上下文。
       *   前面那个 ... 是展开运算符，把数组元素平铺进外层数组。
       */
      ...history.slice(-AI.historyLimit).map((m) => ({
        role: m.role,
        content: m.content
      })),
      {
        role: "user",
        content: question
      }
    ];
    try {
      let directAnswer = "";
      for (let round = 0; round < AI.maxToolRounds; round++) {
        const res = await callModel(messages, {
          tools: true,
          stream: false
        });
        const toolCalls = res.toolCalls || [];
        if (!toolCalls.length) {
          if (round === 0 && res.content)
            directAnswer = res.content;
          break;
        }
        messages.push({
          role: "assistant",
          content: res.content || "",
          tool_calls: toolCalls
        });
        for (const call of toolCalls) {
          const name = call.function && call.function.name;
          let args = {};
          try {
            args = JSON.parse(call.function && call.function.arguments || "{}");
          } catch (e) {
            args = {};
          }
          if (onTool)
            onTool(name);
          const result = await execTool(name, args);
          if (onToolDone)
            onToolDone(name, result);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name,
            content: JSON.stringify(result)
          });
        }
      }
      if (directAnswer) {
        if (onDelta)
          onDelta(directAnswer);
        return {
          text: directAnswer,
          mode: "ai"
        };
      }
      let final;
      final = await callModel(messages, {
        tools: false,
        stream: false
      });
      if (final.content && onDelta)
        onDelta(final.content);
      return {
        text: final.content,
        mode: "ai"
      };
    } catch (e) {
      const reason = e.message === "NO_KEY" ? "" : e.message === "CROSS_ORIGIN" ? "（浏览器跨域被拦）" : `（${e.message}）`;
      let text;
      try {
        text = await localAnswer(question);
      } catch (e2) {
        text = `抱歉，我这边暂时连不上服务，也没查到数据${reason}。稍后再试一次吧。`;
      }
      text = `⚠️ 大模型没连上${reason}，先用本地数据回答你：

${text}`;
      if (onDelta)
        onDelta(text);
      return {
        text,
        mode: "local"
      };
    }
  }
  function testConnection() {
    const {
      apiKey
    } = getAISettings();
    if (!apiKey)
      return Promise.reject(new Error("还没填 API Key"));
    return callModel(
      [
        {
          role: "system",
          content: "只回一个字：好"
        },
        {
          role: "user",
          content: "在吗"
        }
      ],
      {
        tools: false,
        stream: false
      }
    ).then((r) => r.content || "连接正常");
  }
  const _sfc_main$a = {
    __name: "ai",
    setup(__props, { expose: __expose }) {
      __expose();
      const messages = vue.ref([]);
      const draft = vue.ref("");
      const sending = vue.ref(false);
      const anchor = vue.ref("ai-bottom");
      const settingsOpen = vue.ref(false);
      const settings = vue.reactive({ baseUrl: "", apiKey: "", model: "" });
      const keyReady = vue.ref(false);
      let msgId = 0;
      const statusText = vue.computed(() => {
        if (!keyReady.value)
          return "本地数据模式 · 未配置 Key";
        const s = getAISettings();
        return `已连接 ${s.model}`;
      });
      const quickQuestions = [
        "有哪些公益活动可以报名？",
        "2022年评论数据怎么样？",
        "我的学习记录有几条？",
        "书籍类型占比是多少？",
        "有哪些楷模新闻？"
      ];
      function welcome() {
        messages.value = [
          {
            id: ++msgId,
            role: "assistant",
            content: "你好，我是小鲸 🐳\n我可以查这个 App 里的真实数据：公益活动、楷模新闻、英雄故事、学习记录、2022 年的评论和阅读统计。\n想试试点下面的问题，或者直接在下面输入。",
            tools: [],
            streaming: false,
            mode: ""
          }
        ];
      }
      vue.onMounted(() => {
        const s = getAISettings();
        settings.baseUrl = s.baseUrl;
        settings.apiKey = s.apiKey;
        settings.model = s.model;
        keyReady.value = hasApiKey();
        welcome();
      });
      onShow(() => {
        keyReady.value = hasApiKey();
      });
      async function scrollBottom() {
        anchor.value = "";
        await vue.nextTick();
        anchor.value = "ai-bottom";
      }
      function saveSettings() {
        saveAISettings({
          baseUrl: settings.baseUrl.trim() || "https://api.deepseek.com",
          apiKey: settings.apiKey.trim(),
          model: settings.model.trim() || "deepseek-chat"
        });
        keyReady.value = hasApiKey();
        settingsOpen.value = false;
        uni.showToast({ title: hasApiKey() ? "已保存" : "已保存（本地模式）", icon: "none" });
      }
      async function testConn() {
        saveAISettings({
          baseUrl: settings.baseUrl.trim() || "https://api.deepseek.com",
          apiKey: settings.apiKey.trim(),
          model: settings.model.trim() || "deepseek-chat"
        });
        keyReady.value = hasApiKey();
        if (!keyReady.value)
          return uni.showToast({ title: "先填 API Key", icon: "none" });
        uni.showLoading({ title: "测试中…", mask: true });
        try {
          const reply = await testConnection();
          uni.hideLoading();
          uni.showModal({ title: "连接成功", content: `模型回复：${String(reply).slice(0, 60)}`, showCancel: false });
        } catch (e) {
          uni.hideLoading();
          uni.showModal({
            title: "连接失败",
            content: `${e.message}

如果是浏览器打开（H5），可能是接口没开 CORS 跨域；用手机 APK 一般正常。`,
            showCancel: false
          });
        }
      }
      const TOOL_LABELS = {
        get_banner_list: "查询轮播图",
        search_model_news: "查询楷模新闻",
        search_hero_story: "查询英雄故事",
        get_activity_list: "查询公益活动",
        get_my_applications: "查询我的报名",
        get_study_summary: "查询学习记录",
        get_comment_stats: "统计评论数据",
        get_reading_stats: "统计阅读数据",
        get_donation_list: "查询物资捐赠",
        get_user_profile: "查询个人信息"
      };
      function mkTool(name) {
        return TOOL_LABELS[name] || `调用 ${name}`;
      }
      async function send(preset) {
        const text = String(preset || draft.value || "").trim();
        if (!text || sending.value)
          return;
        draft.value = "";
        sending.value = true;
        messages.value.push({ id: ++msgId, role: "user", content: text, tools: [], streaming: false, mode: "" });
        const aiMsg = vue.reactive({
          id: ++msgId,
          role: "assistant",
          content: "",
          tools: [],
          streaming: true,
          mode: "",
          error: false
        });
        messages.value.push(aiMsg);
        await scrollBottom();
        const history = messages.value.filter((m) => m.id !== aiMsg.id && m.content && !m.error).map((m) => ({ role: m.role, content: m.content })).slice(0, -1);
        try {
          const out = await chat(history, text, {
            onDelta(piece) {
              aiMsg.content += piece;
              aiMsg.streaming = true;
              scrollBottom();
            },
            onTool(name) {
              aiMsg.tools.push({ name, label: mkTool(name), state: "running" });
              scrollBottom();
            },
            onToolDone(name) {
              const t = aiMsg.tools.find((x) => x.name === name && x.state === "running");
              if (t)
                t.state = "done";
              scrollBottom();
            }
          });
          aiMsg.mode = out.mode;
          if (!aiMsg.content && out.text)
            aiMsg.content = out.text;
          if (!aiMsg.content)
            aiMsg.content = "（模型没有返回内容，再问一次试试）";
        } catch (e) {
          aiMsg.error = true;
          aiMsg.content = e.message || "出错了，再试一次吧";
        } finally {
          aiMsg.streaming = false;
          sending.value = false;
          aiMsg.tools.forEach((t) => t.state = "done");
          scrollBottom();
        }
      }
      function copy(text) {
        uni.setClipboardData({
          data: text,
          success() {
            uni.showToast({ title: "已复制", icon: "none" });
          }
        });
      }
      function clearChat() {
        uni.showModal({
          title: "提示",
          content: "清空全部对话记录？",
          success(r) {
            if (r.confirm)
              welcome();
          }
        });
      }
      const __returned__ = { messages, draft, sending, anchor, settingsOpen, settings, keyReady, get msgId() {
        return msgId;
      }, set msgId(v) {
        msgId = v;
      }, statusText, quickQuestions, welcome, scrollBottom, saveSettings, testConn, TOOL_LABELS, mkTool, send, copy, clearChat, ref: vue.ref, reactive: vue.reactive, computed: vue.computed, nextTick: vue.nextTick, onMounted: vue.onMounted, get onShow() {
        return onShow;
      }, get chat() {
        return chat;
      }, get getAISettings() {
        return getAISettings;
      }, get saveAISettings() {
        return saveAISettings;
      }, get hasApiKey() {
        return hasApiKey;
      }, get testConnection() {
        return testConnection;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$9(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "ai-page" }, [
      vue.createElementVNode("view", { class: "ai-head" }, [
        vue.createElementVNode("view", { class: "whale" }, "🐳"),
        vue.createElementVNode("view", { class: "ai-head-main" }, [
          vue.createElementVNode("text", { class: "ai-name" }, "小鲸 · 数字生活助手"),
          vue.createElementVNode(
            "text",
            { class: "ai-status" },
            vue.toDisplayString($setup.statusText),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", {
          class: "ai-head-btn",
          onClick: _cache[0] || (_cache[0] = ($event) => $setup.settingsOpen = true)
        }, [
          vue.createElementVNode("text", null, "设置")
        ]),
        vue.createElementVNode("view", {
          class: "ai-head-btn ghost",
          onClick: $setup.clearChat
        }, [
          vue.createElementVNode("text", null, "清空")
        ])
      ]),
      vue.createElementVNode("scroll-view", {
        class: "ai-scroll",
        "scroll-y": "",
        "scroll-into-view": $setup.anchor,
        "scroll-with-animation": true
      }, [
        vue.createElementVNode("view", { class: "msg-list" }, [
          (vue.openBlock(true), vue.createElementBlock(
            vue.Fragment,
            null,
            vue.renderList($setup.messages, (m) => {
              return vue.openBlock(), vue.createElementBlock(
                "view",
                {
                  key: m.id,
                  class: vue.normalizeClass(["msg", m.role])
                },
                [
                  vue.createElementVNode(
                    "view",
                    {
                      class: vue.normalizeClass(["avatar", m.role])
                    },
                    vue.toDisplayString(m.role === "user" ? "我" : "鲸"),
                    3
                    /* TEXT, CLASS */
                  ),
                  vue.createElementVNode("view", { class: "bubble-wrap" }, [
                    m.tools && m.tools.length ? (vue.openBlock(), vue.createElementBlock("view", {
                      key: 0,
                      class: "tool-row"
                    }, [
                      (vue.openBlock(true), vue.createElementBlock(
                        vue.Fragment,
                        null,
                        vue.renderList(m.tools, (t) => {
                          return vue.openBlock(), vue.createElementBlock("view", {
                            class: "tool-chip",
                            key: t.name + t.state
                          }, [
                            vue.createElementVNode(
                              "text",
                              {
                                class: vue.normalizeClass(["tool-dot", t.state])
                              },
                              null,
                              2
                              /* CLASS */
                            ),
                            vue.createElementVNode(
                              "text",
                              null,
                              vue.toDisplayString(t.label),
                              1
                              /* TEXT */
                            )
                          ]);
                        }),
                        128
                        /* KEYED_FRAGMENT */
                      ))
                    ])) : vue.createCommentVNode("v-if", true),
                    vue.createElementVNode(
                      "view",
                      {
                        class: vue.normalizeClass(["bubble", { err: m.error }])
                      },
                      [
                        vue.createElementVNode(
                          "text",
                          { class: "bubble-text" },
                          vue.toDisplayString(m.content),
                          1
                          /* TEXT */
                        ),
                        m.streaming ? (vue.openBlock(), vue.createElementBlock("text", {
                          key: 0,
                          class: "caret"
                        }, "▍")) : vue.createCommentVNode("v-if", true)
                      ],
                      2
                      /* CLASS */
                    ),
                    m.mode === "local" ? (vue.openBlock(), vue.createElementBlock("view", {
                      key: 1,
                      class: "bubble-tag"
                    }, [
                      vue.createElementVNode("text", null, "本地数据模式")
                    ])) : vue.createCommentVNode("v-if", true),
                    m.role === "assistant" && m.content && !m.streaming ? (vue.openBlock(), vue.createElementBlock("view", {
                      key: 2,
                      class: "bubble-actions"
                    }, [
                      vue.createElementVNode("text", {
                        class: "act",
                        onClick: ($event) => $setup.copy(m.content)
                      }, "复制", 8, ["onClick"])
                    ])) : vue.createCommentVNode("v-if", true)
                  ])
                ],
                2
                /* CLASS */
              );
            }),
            128
            /* KEYED_FRAGMENT */
          )),
          $setup.messages.length <= 1 ? (vue.openBlock(), vue.createElementBlock("view", {
            key: 0,
            class: "quick-wrap"
          }, [
            vue.createElementVNode("text", { class: "quick-title" }, "你可以这样问"),
            (vue.openBlock(), vue.createElementBlock(
              vue.Fragment,
              null,
              vue.renderList($setup.quickQuestions, (q) => {
                return vue.createElementVNode("view", {
                  class: "quick-chip",
                  key: q,
                  onClick: ($event) => $setup.send(q)
                }, [
                  vue.createElementVNode(
                    "text",
                    null,
                    vue.toDisplayString(q),
                    1
                    /* TEXT */
                  )
                ], 8, ["onClick"]);
              }),
              64
              /* STABLE_FRAGMENT */
            ))
          ])) : vue.createCommentVNode("v-if", true),
          vue.createElementVNode("view", {
            id: "ai-bottom",
            class: "scroll-bottom"
          })
        ])
      ], 8, ["scroll-into-view"]),
      vue.createElementVNode("view", { class: "ai-inputbar" }, [
        vue.withDirectives(vue.createElementVNode("textarea", {
          class: "ai-textarea",
          "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => $setup.draft = $event),
          disabled: $setup.sending,
          "auto-height": "",
          maxlength: 500,
          placeholder: "问点什么…",
          "placeholder-class": "ph",
          "show-confirm-bar": false
        }, null, 8, ["disabled"]), [
          [vue.vModelText, $setup.draft]
        ]),
        vue.createElementVNode(
          "view",
          {
            class: vue.normalizeClass(["send-btn", { off: $setup.sending || !$setup.draft.trim() }]),
            onClick: _cache[2] || (_cache[2] = ($event) => $setup.send())
          },
          [
            vue.createElementVNode(
              "text",
              null,
              vue.toDisplayString($setup.sending ? "…" : "发送"),
              1
              /* TEXT */
            )
          ],
          2
          /* CLASS */
        )
      ]),
      $setup.settingsOpen ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "mask",
        onClick: _cache[7] || (_cache[7] = ($event) => $setup.settingsOpen = false)
      }, [
        vue.createElementVNode("view", {
          class: "sheet",
          onClick: _cache[6] || (_cache[6] = vue.withModifiers(() => {
          }, ["stop"]))
        }, [
          vue.createElementVNode("text", { class: "sheet-title" }, "AI 助手设置"),
          vue.createElementVNode("text", { class: "sheet-tip" }, " 填好 API Key 就能和大模型对话；不填也能用，会自动切到「本地数据模式」， 用后端真实接口的数据回答。 "),
          vue.createElementVNode("text", { class: "field-label" }, "接口地址（OpenAI 兼容）"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              class: "dl-input",
              "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => $setup.settings.baseUrl = $event),
              placeholder: "https://api.deepseek.com",
              "placeholder-class": "ph"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $setup.settings.baseUrl]
          ]),
          vue.createElementVNode("text", { class: "field-label" }, "模型名"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              class: "dl-input",
              "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => $setup.settings.model = $event),
              placeholder: "deepseek-chat",
              "placeholder-class": "ph"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $setup.settings.model]
          ]),
          vue.createElementVNode("text", { class: "field-label" }, "API Key"),
          vue.withDirectives(vue.createElementVNode(
            "input",
            {
              class: "dl-input",
              "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => $setup.settings.apiKey = $event),
              password: "",
              placeholder: "sk-...",
              "placeholder-class": "ph"
            },
            null,
            512
            /* NEED_PATCH */
          ), [
            [vue.vModelText, $setup.settings.apiKey]
          ]),
          vue.createElementVNode("view", { class: "dl-btn-row" }, [
            vue.createElementVNode("view", {
              class: "dl-btn",
              onClick: $setup.saveSettings
            }, [
              vue.createElementVNode("text", null, "保存")
            ]),
            vue.createElementVNode("view", {
              class: "dl-btn gray",
              onClick: $setup.testConn
            }, [
              vue.createElementVNode("text", null, "测试连接")
            ])
          ]),
          vue.createElementVNode("text", { class: "sheet-foot" }, " 提示：DeepSeek 填 https://api.deepseek.com + deepseek-chat； 通义千问填 https://dashscope.aliyuncs.com/compatible-mode/v1 + qwen-plus。 "),
          vue.createElementVNode("view", { class: "dl-safe-bottom" })
        ])
      ])) : vue.createCommentVNode("v-if", true)
    ]);
  }
  const PagesAiAi = /* @__PURE__ */ _export_sfc(_sfc_main$a, [["render", _sfc_render$9], ["__scopeId", "data-v-fdb58938"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/ai/ai.vue"]]);
  const AXIS_COLOR = "#e0e0e0";
  const TEXT_COLOR = "#777777";
  const _sfc_main$9 = {
    __name: "dl-chart",
    props: {
      type: { type: String, default: "bar" },
      // bar | line | pie
      labels: { type: Array, default: () => [] },
      series: { type: Array, default: () => [] },
      data: { type: Array, default: () => [] },
      items: { type: Array, default: () => [] },
      height: { type: Number, default: 220 }
    },
    setup(__props, { expose: __expose }) {
      __expose();
      const props = __props;
      const instance = vue.getCurrentInstance();
      const canvasId = "dlchart" + Math.random().toString(36).slice(2, 9);
      const empty = vue.ref(false);
      const PALETTE = ["#1e88e5", "#ec407a", "#26a69a", "#ffa726", "#7e57c2", "#66bb6a", "#ef5350", "#8d6e63"];
      function estWidth(str, size) {
        let w = 0;
        for (const ch of String(str)) {
          w += /[\u4e00-\u9fa5]/.test(ch) ? size : size * 0.55;
        }
        return w;
      }
      function niceMax(max) {
        if (max <= 0)
          return 10;
        const exp = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
        const steps = [1, 2, 2.5, 5, 10];
        for (let i = 0; i < steps.length; i++) {
          if (max <= steps[i] * exp)
            return steps[i] * exp;
        }
        return 10 * exp;
      }
      function drawGrid(ctx, box, max) {
        const ticks = 4;
        ctx.setFontSize(10);
        ctx.setTextAlign("right");
        ctx.setTextBaseline("middle");
        for (let i = 0; i <= ticks; i++) {
          const y = box.bottom - box.height * i / ticks;
          ctx.setStrokeStyle(AXIS_COLOR);
          ctx.setLineWidth(1);
          ctx.beginPath();
          ctx.moveTo(box.left, y + 0.5);
          ctx.lineTo(box.left + box.width, y + 0.5);
          ctx.stroke();
          ctx.setFillStyle(TEXT_COLOR);
          ctx.fillText(String(Math.round(max * i / ticks)), box.left - 5, y);
        }
      }
      function drawLabels(ctx, box, labels, seriesList, w) {
        ctx.setFontSize(9);
        ctx.setFillStyle(TEXT_COLOR);
        ctx.setTextAlign("center");
        ctx.setTextBaseline("top");
        const step = box.width / labels.length;
        for (let i = 0; i < labels.length; i++) {
          ctx.fillText(labels[i], box.left + step * (i + 0.5), box.bottom + 5);
        }
        if (seriesList && seriesList.length) {
          ctx.setTextAlign("left");
          ctx.setFontSize(10);
          let lx = w - 8;
          for (let s = seriesList.length - 1; s >= 0; s--) {
            const text = seriesList[s].name;
            const tw = estWidth(text, 10);
            lx -= tw + 18;
            ctx.setFillStyle(seriesList[s].color);
            ctx.fillRect(lx, 4, 10, 10);
            ctx.setFillStyle("#555555");
            ctx.fillText(text, lx + 13, 4);
          }
        }
      }
      function drawBar(ctx, w, h) {
        const box = { left: 40, top: 22, width: w - 50, height: h - 48 };
        box.right = box.left + box.width;
        box.bottom = box.top + box.height;
        let max = 0;
        props.series.forEach((s) => (s.data || []).forEach((v) => max = Math.max(max, Number(v) || 0)));
        const top = niceMax(max);
        drawGrid(ctx, box, top);
        drawLabels(ctx, box, props.labels, props.series, w);
        const group = box.width / props.labels.length;
        const barW = Math.max(3, Math.min(11, group * 0.34));
        for (let i = 0; i < props.labels.length; i++) {
          const center = box.left + group * (i + 0.5);
          for (let s = 0; s < props.series.length; s++) {
            const v = Number(props.series[s].data[i]) || 0;
            const bh = box.height * v / top;
            const x = center - props.series.length * barW / 2 + s * barW;
            ctx.setFillStyle(props.series[s].color);
            ctx.fillRect(x, box.bottom - bh, barW - 1, bh);
          }
        }
      }
      function drawLine(ctx, w, h) {
        const box = { left: 40, top: 22, width: w - 50, height: h - 48 };
        box.right = box.left + box.width;
        box.bottom = box.top + box.height;
        let max = 0;
        props.data.forEach((v) => max = Math.max(max, Number(v) || 0));
        const top = niceMax(max);
        drawGrid(ctx, box, top);
        drawLabels(ctx, box, props.labels, [{ name: "阅读数量", color: "#1e88e5" }], w);
        const step = box.width / props.labels.length;
        const points = props.labels.map((_, i) => ({
          x: box.left + step * (i + 0.5),
          y: box.bottom - box.height * (Number(props.data[i]) || 0) / top
        }));
        ctx.setStrokeStyle("#1e88e5");
        ctx.setLineWidth(2);
        ctx.beginPath();
        points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.setFontSize(9);
        ctx.setTextAlign("center");
        ctx.setTextBaseline("bottom");
        points.forEach((p, i) => {
          ctx.setFillStyle("#ffffff");
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.setStrokeStyle("#1e88e5");
          ctx.setLineWidth(1.5);
          ctx.stroke();
          ctx.setFillStyle("#1e88e5");
          ctx.fillText(String(Number(props.data[i]) || 0), p.x, p.y - 4);
        });
      }
      function drawPie(ctx, w, h) {
        const list = props.items || [];
        let total = 0;
        list.forEach((it) => total += Number(it.value) || 0);
        if (!total)
          return false;
        const cx = w / 2;
        const cy = Math.min(88, h * 0.4);
        const r = Math.min(w * 0.28, 76);
        let start = -Math.PI / 2;
        list.forEach((it, index) => {
          const angle = Math.PI * 2 * Number(it.value) / total;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, start, start + angle);
          ctx.closePath();
          ctx.setFillStyle(PALETTE[index % PALETTE.length]);
          ctx.fill();
          ctx.setStrokeStyle("#ffffff");
          ctx.setLineWidth(1);
          ctx.stroke();
          if (Number(it.value) / total > 0.08) {
            const mid = start + angle / 2;
            ctx.setFillStyle("#ffffff");
            ctx.setFontSize(10);
            ctx.setTextAlign("center");
            ctx.setTextBaseline("middle");
            ctx.fillText(
              Math.round(Number(it.value) / total * 100) + "%",
              // 用三角函数算扇形中心点：0.62 是从圆心往外走的位置比例
              cx + Math.cos(mid) * r * 0.62,
              cy + Math.sin(mid) * r * 0.62
            );
          }
          start += angle;
        });
        ctx.setTextAlign("left");
        ctx.setTextBaseline("middle");
        ctx.setFontSize(10);
        const colW = (w - 20) / 2;
        const legendTop = cy + r + 16;
        list.forEach((it, index) => {
          const col = index % 2;
          const row = Math.floor(index / 2);
          const x = 12 + col * colW;
          const y = legendTop + row * 18;
          ctx.setFillStyle(PALETTE[index % PALETTE.length]);
          ctx.fillRect(x, y - 5, 10, 10);
          ctx.setFillStyle("#555555");
          const percent = (Number(it.value) / total * 100).toFixed(1);
          ctx.fillText(it.name + " " + percent + "%", x + 14, y);
        });
        return true;
      }
      function render() {
        vue.nextTick(() => {
          const query = uni.createSelectorQuery().in(instance ? instance.proxy : null);
          query.select(".dl-chart-wrap").boundingClientRect((rect) => {
            const w = rect && rect.width || 320;
            const h = props.height;
            const ctx = uni.createCanvasContext(canvasId, instance ? instance.proxy : null);
            ctx.clearRect(0, 0, w, h);
            let ok = true;
            if (props.type === "bar") {
              if (!props.labels.length || !props.series.length)
                ok = false;
              else
                drawBar(ctx, w, h);
            } else if (props.type === "line") {
              if (!props.labels.length || !props.data.length)
                ok = false;
              else
                drawLine(ctx, w, h);
            } else {
              ok = drawPie(ctx, w, h);
            }
            empty.value = !ok;
            ctx.draw();
          }).exec();
        });
      }
      vue.onMounted(() => render());
      vue.watch(() => [props.labels, props.series, props.data, props.items], () => render(), { deep: true });
      const __returned__ = { props, instance, canvasId, empty, PALETTE, AXIS_COLOR, TEXT_COLOR, estWidth, niceMax, drawGrid, drawLabels, drawBar, drawLine, drawPie, render, ref: vue.ref, watch: vue.watch, onMounted: vue.onMounted, nextTick: vue.nextTick, getCurrentInstance: vue.getCurrentInstance };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$8(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock(
      "view",
      {
        class: "dl-chart-wrap",
        style: vue.normalizeStyle({ height: $props.height + "px" })
      },
      [
        vue.createElementVNode(
          "canvas",
          {
            class: "dl-chart-canvas",
            "canvas-id": $setup.canvasId,
            id: $setup.canvasId,
            style: vue.normalizeStyle({ height: $props.height + "px" })
          },
          null,
          4
          /* STYLE */
        ),
        $setup.empty ? (vue.openBlock(), vue.createElementBlock("view", {
          key: 0,
          class: "dl-chart-empty"
        }, [
          vue.createElementVNode("text", null, "暂无数据")
        ])) : vue.createCommentVNode("v-if", true)
      ],
      4
      /* STYLE */
    );
  }
  const __easycom_0 = /* @__PURE__ */ _export_sfc(_sfc_main$9, [["render", _sfc_render$8], ["__scopeId", "data-v-7a6a28e9"], ["__file", "D:/移动应用与开发/DEEP-uniapp/components/dl-chart/dl-chart.vue"]]);
  const _sfc_main$8 = {
    __name: "analysis",
    setup(__props, { expose: __expose }) {
      __expose();
      const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
      const female = vue.ref([]);
      const male = vue.ref([]);
      const barTip = vue.ref("加载中…");
      const lineData = vue.ref([]);
      const lineTip = vue.ref("加载中…");
      const pieItems = vue.ref([]);
      const pieTip = vue.ref("加载中…");
      const barSeries = vue.computed(() => [
        { name: "女性评论数", color: "#ec407a", data: female.value },
        { name: "男性评论数", color: "#1e88e5", data: male.value }
      ]);
      function monthOf2022(dateStr) {
        const s = String(dateStr || "");
        if (s.substring(0, 4) !== "2022")
          return 0;
        const m = Number(s.substring(5, 7));
        return m >= 1 && m <= 12 ? m : 0;
      }
      async function loadComments() {
        try {
          const rows = await fetchAll(commentList, 5e3);
          const f = new Array(12).fill(0);
          const m = new Array(12).fill(0);
          rows.forEach((r) => {
            const mon = monthOf2022(r.commentTime);
            if (!mon)
              return;
            if (String(r.commentUserSex) === "1")
              f[mon - 1] += 1;
            else if (String(r.commentUserSex) === "0")
              m[mon - 1] += 1;
          });
          female.value = f;
          male.value = m;
          const totalYear = f.reduce((a, b) => a + b, 0) + m.reduce((a, b) => a + b, 0);
          barTip.value = `2022年共 ${totalYear} 条评论（女性/男性分月统计，原始数据 ${rows.length} 条）`;
        } catch (e) {
          barTip.value = "评论数据加载失败：" + e.message;
        }
      }
      async function loadReading() {
        try {
          const rows = await fetchAll(readBookList, 5e3);
          const count = new Array(12).fill(0);
          rows.forEach((r) => {
            const mon = monthOf2022(r.readTime);
            if (mon)
              count[mon - 1] += 1;
          });
          lineData.value = count;
          const totalYear = count.reduce((a, b) => a + b, 0);
          lineTip.value = `2022年共阅读 ${totalYear} 本（按月统计）`;
        } catch (e) {
          lineTip.value = "阅读数据加载失败：" + e.message;
        }
      }
      async function loadTypes() {
        try {
          const rows = await fetchAll(readBookTypeList, 5e3);
          const map = {};
          rows.forEach((r) => {
            const name = r.bookTypeName || "其他";
            map[name] = (map[name] || 0) + 1;
          });
          const list = Object.keys(map).map((k) => ({ name: k, value: map[k] })).sort((a, b) => b.value - a.value);
          pieItems.value = list;
          pieTip.value = `共 ${list.length} 种书籍类型，合计 ${rows.length} 条阅读记录`;
        } catch (e) {
          pieTip.value = "类型数据加载失败：" + e.message;
        }
      }
      vue.onMounted(() => {
        loadComments();
        loadReading();
        loadTypes();
      });
      const __returned__ = { months, female, male, barTip, lineData, lineTip, pieItems, pieTip, barSeries, monthOf2022, loadComments, loadReading, loadTypes, ref: vue.ref, computed: vue.computed, onMounted: vue.onMounted, get commentList() {
        return commentList;
      }, get readBookList() {
        return readBookList;
      }, get readBookTypeList() {
        return readBookTypeList;
      }, get fetchAll() {
        return fetchAll;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$7(_ctx, _cache, $props, $setup, $data, $options) {
    const _component_dl_chart = resolveEasycom(vue.resolveDynamicComponent("dl-chart"), __easycom_0);
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      vue.createElementVNode("view", { class: "dl-chart-card" }, [
        vue.createElementVNode("text", { class: "dl-chart-title" }, "2022年新闻评论数量（按性别）"),
        vue.createElementVNode(
          "text",
          { class: "dl-chart-tip" },
          vue.toDisplayString($setup.barTip),
          1
          /* TEXT */
        ),
        vue.createVNode(_component_dl_chart, {
          type: "bar",
          labels: $setup.months,
          series: $setup.barSeries,
          height: 220
        }, null, 8, ["series"]),
        vue.createElementVNode("view", { class: "legend-row" }, [
          vue.createElementVNode("view", { class: "legend-item" }, [
            vue.createElementVNode("view", { class: "dot female" }),
            vue.createElementVNode("text", null, "女性评论数")
          ]),
          vue.createElementVNode("view", { class: "legend-item" }, [
            vue.createElementVNode("view", { class: "dot male" }),
            vue.createElementVNode("text", null, "男性评论数")
          ])
        ])
      ]),
      vue.createElementVNode("view", { class: "dl-chart-card" }, [
        vue.createElementVNode("text", { class: "dl-chart-title" }, "2022年用户阅读数量趋势"),
        vue.createElementVNode(
          "text",
          { class: "dl-chart-tip" },
          vue.toDisplayString($setup.lineTip),
          1
          /* TEXT */
        ),
        vue.createVNode(_component_dl_chart, {
          type: "line",
          labels: $setup.months,
          data: $setup.lineData,
          height: 220
        }, null, 8, ["data"])
      ]),
      vue.createElementVNode("view", { class: "dl-chart-card" }, [
        vue.createElementVNode("text", { class: "dl-chart-title" }, "用户阅读书籍类型占比"),
        vue.createElementVNode(
          "text",
          { class: "dl-chart-tip" },
          vue.toDisplayString($setup.pieTip),
          1
          /* TEXT */
        ),
        vue.createVNode(_component_dl_chart, {
          type: "pie",
          items: $setup.pieItems,
          height: 250
        }, null, 8, ["items"])
      ]),
      vue.createElementVNode("view", { class: "dl-safe-bottom" })
    ]);
  }
  const PagesAnalysisAnalysis = /* @__PURE__ */ _export_sfc(_sfc_main$8, [["render", _sfc_render$7], ["__scopeId", "data-v-3a142df1"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/analysis/analysis.vue"]]);
  const PAGE_SIZE$3 = 10;
  const _sfc_main$7 = {
    __name: "model",
    setup(__props, { expose: __expose }) {
      __expose();
      const list = vue.ref([]);
      const pageNum = vue.ref(1);
      const total = vue.ref(0);
      const loaded = vue.ref(0);
      const loading = vue.ref(false);
      async function load() {
        if (loading.value)
          return;
        loading.value = true;
        try {
          const res = await modelList(pageNum.value, PAGE_SIZE$3);
          total.value = res.total || 0;
          const rows = res.rows || [];
          list.value = list.value.concat(rows);
          loaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          loading.value = false;
        }
      }
      function loadMore() {
        if (loaded.value >= total.value)
          return;
        pageNum.value += 1;
        load();
      }
      vue.onMounted(load);
      const __returned__ = { list, pageNum, PAGE_SIZE: PAGE_SIZE$3, total, loaded, loading, load, loadMore, ref: vue.ref, onMounted: vue.onMounted, get modelList() {
        return modelList;
      }, get fullImg() {
        return fullImg;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$6(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      (vue.openBlock(true), vue.createElementBlock(
        vue.Fragment,
        null,
        vue.renderList($setup.list, (n) => {
          return vue.openBlock(), vue.createElementBlock("view", {
            class: "dl-news",
            key: n.id
          }, [
            vue.createElementVNode("image", {
              class: "dl-news-img",
              src: $setup.fullImg(n.imgUrl),
              mode: "aspectFill"
            }, null, 8, ["src"]),
            vue.createElementVNode("view", { class: "dl-news-info" }, [
              vue.createElementVNode(
                "text",
                { class: "dl-news-title" },
                vue.toDisplayString(n.title),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-news-name" },
                "楷模：" + vue.toDisplayString(n.name),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-news-desc" },
                vue.toDisplayString(n.content),
                1
                /* TEXT */
              )
            ])
          ]);
        }),
        128
        /* KEYED_FRAGMENT */
      )),
      !$setup.list.length ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "dl-empty"
      }, [
        vue.createElementVNode(
          "text",
          null,
          vue.toDisplayString($setup.loading ? "正在加载…" : "暂无数据"),
          1
          /* TEXT */
        )
      ])) : vue.createCommentVNode("v-if", true),
      $setup.list.length ? (vue.openBlock(), vue.createElementBlock(
        "view",
        {
          key: 1,
          class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.loaded >= $setup.total }]),
          onClick: $setup.loadMore
        },
        [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.loaded >= $setup.total ? "没有更多了" : "加载更多"),
            1
            /* TEXT */
          )
        ],
        2
        /* CLASS */
      )) : vue.createCommentVNode("v-if", true)
    ]);
  }
  const PagesModelModel = /* @__PURE__ */ _export_sfc(_sfc_main$7, [["render", _sfc_render$6], ["__scopeId", "data-v-495869ea"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/model/model.vue"]]);
  const PAGE_SIZE$2 = 10;
  const _sfc_main$6 = {
    __name: "hero",
    setup(__props, { expose: __expose }) {
      __expose();
      const list = vue.ref([]);
      const pageNum = vue.ref(1);
      const total = vue.ref(0);
      const loaded = vue.ref(0);
      const loading = vue.ref(false);
      async function load() {
        if (loading.value)
          return;
        loading.value = true;
        try {
          const res = await heroList(pageNum.value, PAGE_SIZE$2);
          total.value = res.total || 0;
          const rows = res.rows || [];
          list.value = list.value.concat(rows);
          loaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          loading.value = false;
        }
      }
      function loadMore() {
        if (loaded.value >= total.value)
          return;
        pageNum.value += 1;
        load();
      }
      function openDetail(id) {
        uni.navigateTo({ url: `/pages/hero/detail?id=${id}` });
      }
      vue.onMounted(load);
      const __returned__ = { list, pageNum, PAGE_SIZE: PAGE_SIZE$2, total, loaded, loading, load, loadMore, openDetail, ref: vue.ref, onMounted: vue.onMounted, get heroList() {
        return heroList;
      }, get fullImg() {
        return fullImg;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$5(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      (vue.openBlock(true), vue.createElementBlock(
        vue.Fragment,
        null,
        vue.renderList($setup.list, (h) => {
          return vue.openBlock(), vue.createElementBlock("view", {
            class: "dl-card",
            key: h.id,
            onClick: ($event) => $setup.openDetail(h.id)
          }, [
            vue.createElementVNode("image", {
              class: "dl-card-img hero-img",
              src: $setup.fullImg(h.imgUrl),
              mode: "aspectFill"
            }, null, 8, ["src"]),
            vue.createElementVNode("view", { class: "dl-card-body" }, [
              vue.createElementVNode(
                "text",
                { class: "dl-card-title" },
                vue.toDisplayString(h.title),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-meta" },
                "英雄：" + vue.toDisplayString(h.name) + "　" + vue.toDisplayString(h.introduction),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-text dl-clamp-3" },
                vue.toDisplayString(h.content),
                1
                /* TEXT */
              )
            ])
          ], 8, ["onClick"]);
        }),
        128
        /* KEYED_FRAGMENT */
      )),
      !$setup.list.length ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "dl-empty"
      }, [
        vue.createElementVNode(
          "text",
          null,
          vue.toDisplayString($setup.loading ? "正在加载…" : "暂无数据"),
          1
          /* TEXT */
        )
      ])) : vue.createCommentVNode("v-if", true),
      $setup.list.length ? (vue.openBlock(), vue.createElementBlock(
        "view",
        {
          key: 1,
          class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.loaded >= $setup.total }]),
          onClick: $setup.loadMore
        },
        [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.loaded >= $setup.total ? "没有更多了" : "加载更多"),
            1
            /* TEXT */
          )
        ],
        2
        /* CLASS */
      )) : vue.createCommentVNode("v-if", true)
    ]);
  }
  const PagesHeroHero = /* @__PURE__ */ _export_sfc(_sfc_main$6, [["render", _sfc_render$5], ["__scopeId", "data-v-fea3dba7"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/hero/hero.vue"]]);
  const CMT_SIZE = 10;
  const _sfc_main$5 = {
    __name: "detail",
    setup(__props, { expose: __expose }) {
      __expose();
      const heroId = vue.ref(0);
      const hero = vue.ref(null);
      const heroError = vue.ref("");
      const comments = vue.ref([]);
      const cmtPage = vue.ref(1);
      const cmtTotal = vue.ref(0);
      const cmtLoaded = vue.ref(0);
      const cmtLoading = vue.ref(false);
      async function loadHero() {
        try {
          const res = await heroDetail(heroId.value);
          hero.value = res.data || null;
        } catch (e) {
          heroError.value = e.message || "没有找到这个英雄";
        }
      }
      async function loadComments() {
        if (cmtLoading.value)
          return;
        cmtLoading.value = true;
        try {
          const res = await heroComments(heroId.value, cmtPage.value, CMT_SIZE);
          cmtTotal.value = res.total || 0;
          const rows = res.rows || [];
          comments.value = comments.value.concat(rows);
          cmtLoaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          cmtLoading.value = false;
        }
      }
      function loadMoreComments() {
        if (cmtLoaded.value >= cmtTotal.value)
          return;
        cmtPage.value += 1;
        loadComments();
      }
      onLoad((options) => {
        heroId.value = Number(options && options.id) || 1;
        loadHero();
        loadComments();
      });
      const __returned__ = { heroId, hero, heroError, comments, cmtPage, CMT_SIZE, cmtTotal, cmtLoaded, cmtLoading, loadHero, loadComments, loadMoreComments, ref: vue.ref, get onLoad() {
        return onLoad;
      }, get heroDetail() {
        return heroDetail;
      }, get heroComments() {
        return heroComments;
      }, get fullImg() {
        return fullImg;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$4(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      $setup.hero ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "dl-card"
      }, [
        vue.createElementVNode("image", {
          class: "dl-card-img detail-img",
          src: $setup.fullImg($setup.hero.imgUrl),
          mode: "aspectFill"
        }, null, 8, ["src"]),
        vue.createElementVNode("view", { class: "dl-card-body" }, [
          vue.createElementVNode(
            "text",
            { class: "dl-card-title" },
            vue.toDisplayString($setup.hero.title),
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "dl-card-meta" },
            "英雄：" + vue.toDisplayString($setup.hero.name) + "　" + vue.toDisplayString($setup.hero.introduction),
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "dl-card-text detail-text" },
            vue.toDisplayString($setup.hero.content),
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "dl-card-meta" },
            "发布时间：" + vue.toDisplayString($setup.hero.createTime) + "　点击量：" + vue.toDisplayString($setup.hero.clickNum),
            1
            /* TEXT */
          )
        ])
      ])) : $setup.heroError ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 1,
        class: "dl-empty"
      }, [
        vue.createElementVNode(
          "text",
          null,
          vue.toDisplayString($setup.heroError),
          1
          /* TEXT */
        )
      ])) : vue.createCommentVNode("v-if", true),
      vue.createElementVNode("view", { class: "dl-section" }, [
        vue.createElementVNode("text", null, "评论"),
        vue.createElementVNode(
          "text",
          { class: "dl-more" },
          "共 " + vue.toDisplayString($setup.cmtTotal) + " 条",
          1
          /* TEXT */
        )
      ]),
      (vue.openBlock(true), vue.createElementBlock(
        vue.Fragment,
        null,
        vue.renderList($setup.comments, (c) => {
          return vue.openBlock(), vue.createElementBlock("view", {
            class: "dl-card cmt",
            key: c.evaluateId
          }, [
            vue.createElementVNode("view", { class: "cmt-body" }, [
              vue.createElementVNode("image", {
                class: "cmt-avatar",
                src: $setup.fullImg(c.fromUserAvatar),
                mode: "aspectFill"
              }, null, 8, ["src"]),
              vue.createElementVNode("view", { class: "cmt-main" }, [
                vue.createElementVNode(
                  "text",
                  { class: "cmt-name" },
                  vue.toDisplayString(c.fromUserName),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "cmt-content" },
                  vue.toDisplayString(c.evaluateContent),
                  1
                  /* TEXT */
                ),
                vue.createElementVNode(
                  "text",
                  { class: "dl-card-meta" },
                  vue.toDisplayString(c.createTime) + "　点赞 " + vue.toDisplayString(c.likeCount),
                  1
                  /* TEXT */
                )
              ])
            ])
          ]);
        }),
        128
        /* KEYED_FRAGMENT */
      )),
      !$setup.comments.length ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 2,
        class: "dl-empty"
      }, [
        vue.createElementVNode(
          "text",
          null,
          vue.toDisplayString($setup.cmtLoading ? "正在加载评论…" : "暂无评论"),
          1
          /* TEXT */
        )
      ])) : vue.createCommentVNode("v-if", true),
      $setup.comments.length ? (vue.openBlock(), vue.createElementBlock(
        "view",
        {
          key: 3,
          class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.cmtLoaded >= $setup.cmtTotal }]),
          onClick: $setup.loadMoreComments
        },
        [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.cmtLoaded >= $setup.cmtTotal ? "没有更多了" : "加载更多评论"),
            1
            /* TEXT */
          )
        ],
        2
        /* CLASS */
      )) : vue.createCommentVNode("v-if", true),
      vue.createElementVNode("view", { class: "dl-safe-bottom" })
    ]);
  }
  const PagesHeroDetail = /* @__PURE__ */ _export_sfc(_sfc_main$5, [["render", _sfc_render$4], ["__scopeId", "data-v-3cd6ebcd"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/hero/detail.vue"]]);
  const PAGE_SIZE$1 = 10;
  const _sfc_main$4 = {
    __name: "around",
    setup(__props, { expose: __expose }) {
      __expose();
      const list = vue.ref([]);
      const pageNum = vue.ref(1);
      const total = vue.ref(0);
      const loaded = vue.ref(0);
      const loading = vue.ref(false);
      async function load() {
        if (loading.value)
          return;
        loading.value = true;
        try {
          const res = await aroundList(pageNum.value, PAGE_SIZE$1);
          total.value = res.total || 0;
          const rows = res.rows || [];
          list.value = list.value.concat(rows);
          loaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          loading.value = false;
        }
      }
      function loadMore() {
        if (loaded.value >= total.value)
          return;
        pageNum.value += 1;
        load();
      }
      vue.onMounted(load);
      const __returned__ = { list, pageNum, PAGE_SIZE: PAGE_SIZE$1, total, loaded, loading, load, loadMore, ref: vue.ref, onMounted: vue.onMounted, get aroundList() {
        return aroundList;
      }, get fullImg() {
        return fullImg;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$3(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      (vue.openBlock(true), vue.createElementBlock(
        vue.Fragment,
        null,
        vue.renderList($setup.list, (h) => {
          return vue.openBlock(), vue.createElementBlock("view", {
            class: "dl-card",
            key: h.id
          }, [
            vue.createElementVNode("image", {
              class: "dl-card-img item-img",
              src: $setup.fullImg(h.imgUrl),
              mode: "aspectFill"
            }, null, 8, ["src"]),
            vue.createElementVNode("view", { class: "dl-card-body" }, [
              vue.createElementVNode(
                "text",
                { class: "dl-card-title" },
                vue.toDisplayString(h.title),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-meta" },
                "英雄：" + vue.toDisplayString(h.name) + "　" + vue.toDisplayString(h.introduction),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-text dl-clamp-3" },
                vue.toDisplayString(h.content),
                1
                /* TEXT */
              )
            ])
          ]);
        }),
        128
        /* KEYED_FRAGMENT */
      )),
      !$setup.list.length ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "dl-empty"
      }, [
        vue.createElementVNode(
          "text",
          null,
          vue.toDisplayString($setup.loading ? "正在加载…" : "暂无数据"),
          1
          /* TEXT */
        )
      ])) : vue.createCommentVNode("v-if", true),
      $setup.list.length ? (vue.openBlock(), vue.createElementBlock(
        "view",
        {
          key: 1,
          class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.loaded >= $setup.total }]),
          onClick: $setup.loadMore
        },
        [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.loaded >= $setup.total ? "没有更多了" : "加载更多"),
            1
            /* TEXT */
          )
        ],
        2
        /* CLASS */
      )) : vue.createCommentVNode("v-if", true)
    ]);
  }
  const PagesAroundAround = /* @__PURE__ */ _export_sfc(_sfc_main$4, [["render", _sfc_render$3], ["__scopeId", "data-v-6a487062"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/around/around.vue"]]);
  const PAGE_SIZE = 10;
  const _sfc_main$3 = {
    __name: "donation",
    setup(__props, { expose: __expose }) {
      __expose();
      const list = vue.ref([]);
      const pageNum = vue.ref(1);
      const total = vue.ref(0);
      const loaded = vue.ref(0);
      const loading = vue.ref(false);
      async function load() {
        if (loading.value)
          return;
        loading.value = true;
        try {
          const res = await donationList(pageNum.value, PAGE_SIZE);
          total.value = res.total || 0;
          const rows = res.rows || [];
          list.value = list.value.concat(rows);
          loaded.value += rows.length;
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        } finally {
          loading.value = false;
        }
      }
      function loadMore() {
        if (loaded.value >= total.value)
          return;
        pageNum.value += 1;
        load();
      }
      vue.onMounted(load);
      const __returned__ = { list, pageNum, PAGE_SIZE, total, loaded, loading, load, loadMore, ref: vue.ref, onMounted: vue.onMounted, get donationList() {
        return donationList;
      }, get fullImg() {
        return fullImg;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$2(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      (vue.openBlock(true), vue.createElementBlock(
        vue.Fragment,
        null,
        vue.renderList($setup.list, (d) => {
          return vue.openBlock(), vue.createElementBlock("view", {
            class: "dl-card",
            key: d.id
          }, [
            vue.createElementVNode("image", {
              class: "dl-card-img item-img",
              src: $setup.fullImg(d.imgUrl),
              mode: "aspectFill"
            }, null, 8, ["src"]),
            vue.createElementVNode("view", { class: "dl-card-body" }, [
              vue.createElementVNode(
                "text",
                { class: "dl-card-title" },
                vue.toDisplayString(d.content),
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-meta" },
                "捐赠人：" + vue.toDisplayString(d.donationUser) + "　数量：" + vue.toDisplayString(d.number) + " 件",
                1
                /* TEXT */
              ),
              vue.createElementVNode(
                "text",
                { class: "dl-card-meta" },
                "捐赠日期：" + vue.toDisplayString(d.donationDate),
                1
                /* TEXT */
              )
            ])
          ]);
        }),
        128
        /* KEYED_FRAGMENT */
      )),
      !$setup.list.length ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "dl-empty"
      }, [
        vue.createElementVNode(
          "text",
          null,
          vue.toDisplayString($setup.loading ? "正在加载…" : "暂无数据"),
          1
          /* TEXT */
        )
      ])) : vue.createCommentVNode("v-if", true),
      $setup.list.length ? (vue.openBlock(), vue.createElementBlock(
        "view",
        {
          key: 1,
          class: vue.normalizeClass(["dl-loadmore", { disabled: $setup.loaded >= $setup.total }]),
          onClick: $setup.loadMore
        },
        [
          vue.createElementVNode(
            "text",
            null,
            vue.toDisplayString($setup.loaded >= $setup.total ? "没有更多了" : "加载更多"),
            1
            /* TEXT */
          )
        ],
        2
        /* CLASS */
      )) : vue.createCommentVNode("v-if", true)
    ]);
  }
  const PagesDonationDonation = /* @__PURE__ */ _export_sfc(_sfc_main$3, [["render", _sfc_render$2], ["__scopeId", "data-v-53e3716d"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/donation/donation.vue"]]);
  const _sfc_main$2 = {
    __name: "detail",
    setup(__props, { expose: __expose }) {
      __expose();
      const activityId = vue.ref(0);
      const act = vue.ref(null);
      const errMsg = vue.ref("");
      const myApply = vue.ref(null);
      const submitting = vue.ref(false);
      const applied = vue.computed(() => !!myApply.value);
      const statusText = vue.computed(() => {
        if (myApply.value)
          return `报名时间：${myApply.value.createTime}　状态：已报名`;
        return "还没有报名，点下面按钮报名吧";
      });
      async function loadDetail() {
        try {
          const res = await activityDetail(activityId.value);
          act.value = res.data || null;
        } catch (e) {
          errMsg.value = e.message || "没有找到这个活动";
        }
      }
      async function loadApplyStatus() {
        try {
          const res = await myApplyList(1, 100);
          const rows = res.rows || [];
          myApply.value = rows.find((r) => String(r.activityId) === String(activityId.value)) || null;
        } catch (e) {
        }
      }
      function onApply() {
        if (applied.value || submitting.value)
          return;
        uni.showModal({
          title: "报名确认",
          content: "确定要报名该活动吗？",
          confirmText: "确认",
          cancelText: "取消",
          success: async (r) => {
            if (!r.confirm)
              return;
            submitting.value = true;
            try {
              await applyActivity(activityId.value);
              uni.showToast({ title: "报名成功", icon: "success" });
              await Promise.all([loadDetail(), loadApplyStatus()]);
            } catch (e) {
              uni.showToast({ title: e.message || "报名失败", icon: "none" });
            } finally {
              submitting.value = false;
            }
          }
        });
      }
      onLoad((options) => {
        activityId.value = Number(options && options.id) || 1;
        loadDetail();
        loadApplyStatus();
      });
      const __returned__ = { activityId, act, errMsg, myApply, submitting, applied, statusText, loadDetail, loadApplyStatus, onApply, ref: vue.ref, computed: vue.computed, get onLoad() {
        return onLoad;
      }, get activityDetail() {
        return activityDetail;
      }, get myApplyList() {
        return myApplyList;
      }, get applyActivity() {
        return applyActivity;
      }, get fullImg() {
        return fullImg;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render$1(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      $setup.act ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 0,
        class: "dl-card"
      }, [
        vue.createElementVNode("image", {
          class: "dl-card-img detail-img",
          src: $setup.fullImg($setup.act.imgUrl),
          mode: "aspectFill"
        }, null, 8, ["src"]),
        vue.createElementVNode("view", { class: "dl-card-body" }, [
          vue.createElementVNode(
            "text",
            { class: "dl-card-title" },
            vue.toDisplayString($setup.act.activityName),
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "dl-card-meta" },
            "活动时间：" + vue.toDisplayString($setup.act.startEndTime),
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "dl-card-meta" },
            "发起方：" + vue.toDisplayString($setup.act.initiator || "公益组织"),
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "dl-card-meta" },
            "已报名人数：" + vue.toDisplayString($setup.act.applyNum) + " 人",
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "dl-card-text detail-text" },
            vue.toDisplayString($setup.act.activityDetail),
            1
            /* TEXT */
          )
        ])
      ])) : $setup.errMsg ? (vue.openBlock(), vue.createElementBlock("view", {
        key: 1,
        class: "dl-empty"
      }, [
        vue.createElementVNode(
          "text",
          null,
          vue.toDisplayString($setup.errMsg),
          1
          /* TEXT */
        )
      ])) : vue.createCommentVNode("v-if", true),
      vue.createElementVNode("view", { class: "dl-card apply-box" }, [
        vue.createElementVNode(
          "text",
          { class: "apply-status" },
          vue.toDisplayString($setup.statusText),
          1
          /* TEXT */
        ),
        vue.createElementVNode(
          "view",
          {
            class: vue.normalizeClass(["dl-btn", { disabled: $setup.applied }]),
            onClick: $setup.onApply
          },
          [
            vue.createElementVNode(
              "text",
              null,
              vue.toDisplayString($setup.applied ? "已报名" : $setup.submitting ? "提交中…" : "报 名"),
              1
              /* TEXT */
            )
          ],
          2
          /* CLASS */
        )
      ]),
      vue.createElementVNode("view", { class: "dl-safe-bottom" })
    ]);
  }
  const PagesActivityDetail = /* @__PURE__ */ _export_sfc(_sfc_main$2, [["render", _sfc_render$1], ["__scopeId", "data-v-19f90eeb"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/activity/detail.vue"]]);
  const _sfc_main$1 = {
    __name: "user",
    setup(__props, { expose: __expose }) {
      __expose();
      const user = vue.ref({});
      const avatar = vue.ref("");
      const sexText = vue.computed(() => {
        const s = String(user.value.sex);
        return s === "0" ? "男" : s === "1" ? "女" : "未知";
      });
      async function load() {
        try {
          const res = await userInfo();
          user.value = res.data || {};
          uni.setStorageSync(STORAGE_KEYS.userInfo, user.value);
          if (user.value.avatar)
            avatar.value = fullImg(user.value.avatar);
        } catch (e) {
          uni.showToast({ title: e.message, icon: "none" });
        }
      }
      function changeAvatar() {
        uni.chooseImage({
          count: 1,
          sizeType: ["compressed"],
          sourceType: ["album", "camera"],
          success: async (r) => {
            const path = r.tempFilePaths && r.tempFilePaths[0];
            if (!path)
              return;
            uni.showLoading({ title: "上传中…", mask: true });
            try {
              const out = await uploadFile(path);
              uni.hideLoading();
              avatar.value = out.url;
              uni.showToast({ title: "头像已更新", icon: "success" });
            } catch (e) {
              uni.hideLoading();
              uni.showToast({ title: e.message || "上传失败", icon: "none" });
            }
          }
        });
      }
      function go(url) {
        uni.navigateTo({ url });
      }
      function doLogout() {
        uni.showModal({
          title: "提示",
          content: "确定要退出登录吗？",
          success: async (r) => {
            if (!r.confirm)
              return;
            try {
              await logout();
            } catch (e) {
            }
            clearToken();
            uni.reLaunch({ url: "/pages/login/login" });
          }
        });
      }
      vue.onMounted(() => {
        if (!getToken()) {
          uni.reLaunch({ url: "/pages/login/login" });
          return;
        }
        load();
      });
      const __returned__ = { user, avatar, sexText, load, changeAvatar, go, doLogout, ref: vue.ref, computed: vue.computed, onMounted: vue.onMounted, get userInfo() {
        return userInfo;
      }, get uploadFile() {
        return uploadFile;
      }, get logout() {
        return logout;
      }, get fullImg() {
        return fullImg;
      }, get clearToken() {
        return clearToken;
      }, get getToken() {
        return getToken;
      }, get STORAGE_KEYS() {
        return STORAGE_KEYS;
      } };
      Object.defineProperty(__returned__, "__isScriptSetup", { enumerable: false, value: true });
      return __returned__;
    }
  };
  function _sfc_render(_ctx, _cache, $props, $setup, $data, $options) {
    return vue.openBlock(), vue.createElementBlock("view", { class: "page" }, [
      vue.createElementVNode("view", { class: "dl-user-head" }, [
        vue.createElementVNode("image", {
          class: "dl-user-avatar",
          src: $setup.avatar || "/static/logo.png",
          mode: "aspectFill"
        }, null, 8, ["src"]),
        vue.createElementVNode("view", { class: "dl-user-info" }, [
          vue.createElementVNode(
            "text",
            { class: "dl-user-nick" },
            vue.toDisplayString($setup.user.nickName || "未设置昵称"),
            1
            /* TEXT */
          ),
          vue.createElementVNode(
            "text",
            { class: "dl-user-sub" },
            "账号：" + vue.toDisplayString($setup.user.userName || "—"),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", {
          class: "dl-btn-sm",
          onClick: $setup.changeAvatar
        }, [
          vue.createElementVNode("text", null, "换头像")
        ])
      ]),
      vue.createElementVNode("view", { class: "dl-user-rows" }, [
        vue.createElementVNode("view", { class: "dl-user-row" }, [
          vue.createElementVNode("text", { class: "dl-label" }, "性别"),
          vue.createElementVNode(
            "text",
            { class: "dl-value" },
            vue.toDisplayString($setup.sexText),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "dl-user-row" }, [
          vue.createElementVNode("text", { class: "dl-label" }, "手机号"),
          vue.createElementVNode(
            "text",
            { class: "dl-value" },
            vue.toDisplayString($setup.user.phonenumber || "未填写"),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "dl-user-row" }, [
          vue.createElementVNode("text", { class: "dl-label" }, "邮箱"),
          vue.createElementVNode(
            "text",
            { class: "dl-value" },
            vue.toDisplayString($setup.user.email || "未填写"),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "dl-user-row" }, [
          vue.createElementVNode("text", { class: "dl-label" }, "证件号"),
          vue.createElementVNode(
            "text",
            { class: "dl-value" },
            vue.toDisplayString($setup.user.idCard || "未填写"),
            1
            /* TEXT */
          )
        ]),
        vue.createElementVNode("view", { class: "dl-user-row" }, [
          vue.createElementVNode("text", { class: "dl-label" }, "余额"),
          vue.createElementVNode(
            "text",
            { class: "dl-value" },
            vue.toDisplayString($setup.user.balance || 0) + " 元",
            1
            /* TEXT */
          )
        ])
      ]),
      vue.createElementVNode("view", { class: "dl-user-rows" }, [
        vue.createElementVNode("view", {
          class: "dl-user-row",
          onClick: _cache[0] || (_cache[0] = ($event) => $setup.go("/pages/model/model"))
        }, [
          vue.createElementVNode("text", { class: "dl-label" }, "楷模列表"),
          vue.createElementVNode("text", { class: "dl-value" }, "›")
        ]),
        vue.createElementVNode("view", {
          class: "dl-user-row",
          onClick: _cache[1] || (_cache[1] = ($event) => $setup.go("/pages/hero/hero"))
        }, [
          vue.createElementVNode("text", { class: "dl-label" }, "英雄故事"),
          vue.createElementVNode("text", { class: "dl-value" }, "›")
        ]),
        vue.createElementVNode("view", {
          class: "dl-user-row",
          onClick: _cache[2] || (_cache[2] = ($event) => $setup.go("/pages/donation/donation"))
        }, [
          vue.createElementVNode("text", { class: "dl-label" }, "物资捐赠"),
          vue.createElementVNode("text", { class: "dl-value" }, "›")
        ])
      ]),
      vue.createElementVNode("view", { class: "btn-area" }, [
        vue.createElementVNode("view", {
          class: "dl-btn red",
          onClick: $setup.doLogout
        }, [
          vue.createElementVNode("text", null, "退出登录")
        ])
      ]),
      vue.createElementVNode("view", { class: "dl-safe-bottom" })
    ]);
  }
  const PagesUserUser = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["render", _sfc_render], ["__scopeId", "data-v-0f7520f0"], ["__file", "D:/移动应用与开发/DEEP-uniapp/pages/user/user.vue"]]);
  __definePage("pages/login/login", PagesLoginLogin);
  __definePage("pages/index/index", PagesIndexIndex);
  __definePage("pages/activity/activity", PagesActivityActivity);
  __definePage("pages/study/study", PagesStudyStudy);
  __definePage("pages/ai/ai", PagesAiAi);
  __definePage("pages/analysis/analysis", PagesAnalysisAnalysis);
  __definePage("pages/model/model", PagesModelModel);
  __definePage("pages/hero/hero", PagesHeroHero);
  __definePage("pages/hero/detail", PagesHeroDetail);
  __definePage("pages/around/around", PagesAroundAround);
  __definePage("pages/donation/donation", PagesDonationDonation);
  __definePage("pages/activity/detail", PagesActivityDetail);
  __definePage("pages/user/user", PagesUserUser);
  const _sfc_main = {
    onLaunch() {
      const token = uni.getStorageSync("token");
      const pages = getCurrentPages();
      const current = pages.length ? pages[pages.length - 1].route : "";
      if (!token && current !== "pages/login/login") {
        uni.reLaunch({ url: "/pages/login/login" });
      }
    },
    onShow() {
    },
    onHide() {
    }
  };
  const App = /* @__PURE__ */ _export_sfc(_sfc_main, [["__file", "D:/移动应用与开发/DEEP-uniapp/App.vue"]]);
  function createApp() {
    const app = vue.createVueApp(App);
    return { app };
  }
  const { app: __app__, Vuex: __Vuex__, Pinia: __Pinia__ } = createApp();
  uni.Vuex = __Vuex__;
  uni.Pinia = __Pinia__;
  __app__.provide("__globalStyles", __uniConfig.styles);
  __app__._component.mpType = "app";
  __app__._component.render = () => {
  };
  __app__.mount("#app");
})(Vue);
