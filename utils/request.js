/**
 * ============================================================================
 * 网络请求封装 utils/request.js —— 全项目唯一的网络出口
 * ----------------------------------------------------------------------------
 * 【为什么要封装？】
 *   原项目里每调一个接口都要手写一大坨：地址、Authorization 头、超时、错误处理……
 *   十几处复制粘贴，改一个地方要改十几遍。封装一次，以后只写：
 *
 *       const data = await request.get('/api/model/list', { pageNum: 1, pageSize: 10 })
 *
 * 【统一做了哪些事】
 *   1. 自动拼 BASE_URL
 *   2. 自动带上 Authorization（登录后拿到的 token）
 *   3. 自动处理 401 认证失败 → 清掉 token → 踢回登录页
 *   4. code != 200 时统一抛错，业务代码只写 try/catch
 *   5. 可选显示「加载中」转圈
 *
 * 【这个文件被谁用】
 *   api/index.js 里 26 个接口函数，全部经过这里；页面层一次都不会直接碰 uni.request
 *
 * 【教学重点】
 *   @teach-03 用 new Promise 把回调式 API 包成 await
 *   @teach-04 token 注入只写一次，26 个接口零重复
 *   @teach-05 401 并发防抖（redirecting 标志位）
 *   @teach-06 三层错误处理：HTTP 状态码 / 业务 code / 网络 fail
 *   @teach-07 fullImg 必须幂等，否则会拼出双重地址
 *
 * 【对应 PPT】P20 / P21 / P22
 * ============================================================================
 */

import { BASE_URL, IMG_URL, TIMEOUT, STORAGE_KEYS } from '@/config/index.js';

/* ---------------------------------------------------------------- 小工具 */

/**
 * 取 token（没登录时返回空字符串）。
 *
 * 【语法】uni 是 uni-app 注入的全局对象，不用 import 就能用。
 *   uni.getStorageSync 是「同步读取本地存储」，返回 undefined 表示这个键不存在。
 *
 * 【为什么后面要跟 || ''】
 *   如果没登录，getStorageSync 返回的是 undefined 或 ''，
 *   上层拿到 undefined 再去拼请求头就会变成字符串 "undefined"。
 *   这里统一兜成空串，调用方就不用每次都判空了。
 */
export function getToken() {
	return uni.getStorageSync(STORAGE_KEYS.token) || '';
}

/**
 * 存 token（登录成功后调用）。
 *
 * 【为什么也要 || ''】
 *   万一上层传进来的是 undefined（比如接口没返回 token），
 *   存成空串比存成 undefined 更好判断——hasToken 只要看长度就行。
 */
export function setToken(token) {
	uni.setStorageSync(STORAGE_KEYS.token, token || '');
}

/**
 * 清 token（退出登录 / 认证失败时用）。
 *
 * 【为什么一次清两个】token 和 userInfo 是绑定的：
 *   只清 token 不清 userInfo，下次进个人中心会看到上一个账号的昵称，很尴尬。
 */
export function clearToken() {
	uni.removeStorageSync(STORAGE_KEYS.token);
	uni.removeStorageSync(STORAGE_KEYS.userInfo);
}

/**
 * 把「半截图片地址」补成完整地址。
 *
 * @param {string} url 后端返回的图片路径，可能是 /profile/upload/x.jpg，也可能已经是完整地址
 * @returns {string} 能直接绑到 image 标签 src 上的完整地址
 *
 * @teach-07 为什么这个函数必须「幂等」（同样输入反复调用，结果不变）？
 *   接口里有些 imgUrl 是 /profile/upload/x.jpg（半截），
 *   有些本身就是 http://... 开头（完整）。如果不先判断就无脑拼前缀，
 *   第二种会变成：http://114.66.9.70:10002/prod-apihttp://别的域名/x.jpg
 *   —— 这种地址当然加载不出来，而且报错信息完全看不出原因。我们真踩过。
 *   所以第 2 行先看开头是不是 http，是就直接返回，不再拼。
 *
 * 【语法】String(url).indexOf('http') === 0
 *   等于「这个字符串是不是以 http 开头」。用 indexOf 而不是 startsWith，
 *   是为了兼容极老的 JS 引擎（小程序早期环境没有 startsWith）。
 */
export function fullImg(url) {
	if (!url) return '';
	if (String(url).indexOf('http') === 0) return url;
	return IMG_URL + url;
}

/* ------------------------------------------------------- 是否正在跳登录页 */

// 防止多个接口同时 401，弹出 5 个提示、跳 5 次登录页
// 【语法】这是模块级的普通变量（不是 ref），整个文件共用一份，页面刷新也不会重置。
let redirecting = false;

/**
 * 踢回登录页。
 *
 * @teach-05 为什么需要一个 redirecting 标志位？
 *   首页一进去会同时发 3~4 个请求（轮播、列表、统计……）。
 *   如果 token 刚好过期，这 3~4 个请求会同时返回 401，
 *   于是「清 token + 跳登录页」被执行 3~4 次：用户会看到页面闪好几下，
 *   安卓上还可能因为重复 reLaunch 报错。
 *   解决办法很土但很有效：跳之前先看这个开关，跳过了就加锁，别人直接 return。
 *
 * @teach-05 为什么 800 毫秒后要把锁解开？
 *   因为用户可能重新登录后再次过期，锁不能永远锁着。
 *   800ms 是「足够跳转完成、又不至于让下一次真的 401 被吞掉」的经验值。
 */
function toLogin() {
	if (redirecting) return;
	redirecting = true;
	clearToken();
	// 【为什么用 reLaunch 而不是 navigateTo】
	// reLaunch 会关闭所有页面、只留登录页，用户按返回键回不到刚才的页面——
	// 这正是我们要的：没登录就不该看到任何内页。
	uni.reLaunch({
		url: '/pages/login/login',
		complete() {
			setTimeout(() => {
				redirecting = false;
			}, 800);
		}
	});
}

/* ------------------------------------------------------------ 核心请求 */

/**
 * 发一个请求。
 *
 * @param {Object}  options
 * @param {String}  options.url     接口路径，如 '/api/login'
 * @param {String} [options.method] 'GET' | 'POST' | 'PUT' | 'DELETE'
 * @param {Object} [options.params] GET/DELETE 的查询参数（自动拼到 ? 后面）
 * @param {Object} [options.data]   POST/PUT 的 JSON 请求体
 * @param {Boolean}[options.auth]   是否带 token，默认 true
 * @param {Boolean}[options.loading]是否显示「加载中」，默认 false
 * @returns {Promise<Object>} 成功时返回服务器完整响应体（含 code/msg/rows/total/data）
 *
 * 【为什么返回值是整个 body 而不是 body.data】
 *   因为列表接口需要 total（总条数）来算「还有没有下一页」，
 *   如果只返回 data，分页就没法做了。所以原样返回，让调用方自己取。
 */
export function request(options = {}) {
	/**
	 * 【语法】这是「对象解构 + 默认值」的写法，等价于：
	 *   const url = options.url;
	 *   const method = options.method === undefined ? 'GET' : options.method;
	 *   ...
	 * 好处是一眼能看出这个函数认识哪些参数、各自默认值是什么，
	 * 比在函数体里写 6 行 if 判断清爽得多。
	 *
	 * @teach-08 注意：默认值只在「值是 undefined」时生效。
	 *   传 null 是不生效的（params: null 时仍然是 null，不会被换成别的）。
	 */
	const {
		url,
		method = 'GET',
		params = null,
		data = null,
		auth = true,
		loading = false
	} = options;

	// 1. GET / DELETE 的参数拼到地址后面
	let fullUrl = BASE_URL + url;
	if (params && Object.keys(params).length) {
		/**
		 * 【语法】Object.keys(params) 拿到对象所有键名组成的数组，
		 *   然后 .filter() 过滤、.map() 转换、.join('&') 拼成 query string。
		 *   这一串叫「链式调用」，每一步的返回值都是新数组。
		 *
		 * 【为什么要 filter 掉 undefined / null / 空串】
		 *   接口经常这样调：api.list({ pageNum: 1, keyword: searchText })
		 *   当用户没输关键词时 keyword 是 ''，如果原样拼上去会变成
		 *   ?pageNum=1&keyword=  —— 有些后端会认为「你传了一个空关键词」，
		 *   于是返回空列表。过滤掉就没这个问题了。
		 */
		const qs = Object.keys(params)
			.filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== '')
			// 【为什么两层 encodeURIComponent】中文关键词、空格、& 号必须转义，
			// 否则拼出来的地址会被浏览器/系统截断，或者参数串位。
			.map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
			.join('&');
		// url 里本来就有 ? 时用 & 接，没有时用 ? 接
		if (qs) fullUrl += (url.indexOf('?') >= 0 ? '&' : '?') + qs;
	}

	// 2. 请求头：接口文档说除了登录，其他接口都要带 Authorization
	const header = { 'Content-Type': 'application/json' };
	/**
	 * @teach-04 token 注入只在这里写一次。
	 *   因为 26 个接口都走这个函数，所以页面层永远不需要操心「这次请求带没带 token」。
	 *   这就是封装最直接的收益：改一处，全项目生效。
	 *
	 * 【为什么 auth:false 的接口（登录）要跳过】
	 *   登录时还没有 token，带上空的 Authorization 有些后端会直接返回 401，
	 *   导致「永远登不上」这种诡异现象。
	 */
	if (auth) {
		const token = getToken();
		if (token) header.Authorization = token;
	}

	// 【mask: true】加一层半透明遮罩，防止用户在加载期间重复点击
	if (loading) uni.showLoading({ title: '加载中…', mask: true });

	// 3. 发请求，Promise 化
	/**
	 * @teach-03 这段是整个文件最值钱的 8 行。
	 *
	 * 【问题】uni.request 是「回调式」API：结果通过 success / fail 两个函数返回，
	 *   你没法写 const res = uni.request(...)。一层层回调套下去就是「回调地狱」。
	 *
	 * 【解法】new Promise((resolve, reject) => {...}) 造一个 Promise 对象：
	 *   在 success 里调 resolve(结果) → 外面 await 就能拿到结果；
	 *   在 fail 里调 reject(错误)     → 外面 await 会抛异常，被 catch 抓住。
	 *
	 * 【为什么要包这一层】因为包完之后，api/index.js 里 26 个接口才能写成
	 *   `const res = await http.get('/api/xxx')` 这种一行代码。
	 *   没有这 8 行，那 26 行全都得变成回调嵌套。
	 */
	return new Promise((resolve, reject) => {
		uni.request({
			url: fullUrl,
			// 【为什么 toUpperCase】防止调用方传 'get' 写成小写，统一转大写更保险
			method: method.toUpperCase(),
			// 【为什么 data 要 || undefined】GET 请求不需要 body，
			// 传 null 有些平台会真的发一个 "null" 字符串出去
			data: data || undefined,
			header,
			timeout: TIMEOUT,
			success(res) {
				// 无论成功失败，先关掉转圈，否则遮罩会一直挂着
				if (loading) uni.hideLoading();

				/**
				 * @teach-06 第一层：HTTP 状态码。
				 *   401 表示「未认证」——token 过期或被服务端踢掉了。
				 *   这里不再往下走业务判断，直接踢回登录页并 reject。
				 *
				 * 【历史备注】原文件这行上面曾写着「网络层失败（域名解析不了、断网……）」，
				 *   但那段话对应的其实是下面 fail 回调，写在 401 这里会误导人，已更正。
				 */
				if (res.statusCode === 401) {
					toLogin();
					reject(new Error('登录已过期，请重新登录'));
					return;
				}

				const body = res.data || {};

				/**
				 * @teach-06 第二层：业务状态码。
				 *   这套后端（RuoYi 系）HTTP 一律返回 200，真正的结果放在 body.code 里：
				 *     code === 200  成功
				 *     code === 401  token 失效（注意：HTTP 状态码可能还是 200！）
				 *     其他          业务错误，body.msg 里是给人看的中文原因
				 *   所以两种 401 都要处理，缺一种就会出现「明明登录过期了却一直转圈」。
				 */
				if (body.code !== 200) {
					const msg = body.msg || `请求失败（${res.statusCode}）`;
					// RuoYi 后端 token 失效时也可能返回 code=401
					if (body.code === 401) toLogin();
					reject(new Error(msg));
					return;
				}

				// 走到这里才是真成功，把整个响应体交出去
				resolve(body);
			},
			/**
			 * @teach-06 第三层：网络层失败。
			 *   断网、域名解析不了、服务器没开、超时……都会走到这里。
			 *   err.errMsg 是 uni 给的中文原因（比如 'request:fail timeout'），
			 *   直接透给用户比「未知错误」有用得多。
			 */
			fail(err) {
				if (loading) uni.hideLoading();
				reject(new Error(err && err.errMsg ? err.errMsg : '网络异常，请检查网络或服务器地址'));
			}
		});
	});
}

/* ------------------------------------------------- 语义化的快捷方法 */

/**
 * 四个语义化方法，本质都是转到上面那个 request()。
 *
 * 【为什么要包这一层】因为写 http.get(...) 比写
 *   request({ url, method: 'GET', params }) 短得多，而且一眼能看出是 GET。
 *
 * 【语法】opts = {} 是默认参数；{ ...opts } 是「展开运算符」，
 *   把调用方额外传的 auth / loading 等选项平铺进来。
 *   注意它写在最后，所以能覆盖前面的默认值——这叫「后者优先」。
 */
export const http = {
	get(url, params, opts = {}) {
		return request({ url, method: 'GET', params, ...opts });
	},
	post(url, data, opts = {}) {
		return request({ url, method: 'POST', data, ...opts });
	},
	put(url, data, opts = {}) {
		return request({ url, method: 'PUT', data, ...opts });
	},
	// 【为什么叫 del 不叫 delete】delete 是 JS 保留字，不能当属性名用（严格模式下报错）
	del(url, params, opts = {}) {
		return request({ url, method: 'DELETE', params, ...opts });
	}
};

/**
 * 【语法】一个文件可以同时有「具名导出」和「默认导出」：
 *   import http from '@/utils/request.js'              ← 拿默认导出
 *   import { http, getToken } from '@/utils/request.js' ← 拿具名导出
 * 本项目两种写法都有，所以两个都留着。
 */
export default http;
