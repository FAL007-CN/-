/**
 * ============================================================================
 * 接口清单 api/index.js —— 薄薄一层，只负责「路径 + 参数」
 * ----------------------------------------------------------------------------
 * 后端文档（http://114.66.9.70:10002/api.html）里 25 个接口，全在这里。
 * 一个接口一个函数，页面里只写 api.activityList({pageNum:1}) 这种，看得懂、好找。
 *
 * 【这个文件为什么这么薄】
 *   难的东西全在 utils/request.js 里被吃掉了（拼地址、带 token、处理 401、抛错）。
 *   所以这里每个接口就只剩「用什么方法、打哪个路径、带什么参数」，
 *   26 个函数里 24 个是一行箭头函数。
 *   这就是「分层」最直观的收益：复杂逻辑只写一次，重复劳动压到一行。
 *
 * 【它被谁用】
 *   13 个页面   —— 拿数据
 *   utils/ai.js —— 把其中 12 个包装成 AI 的「工具」（function calling）
 *
 * 【教学重点】
 *   @teach-09 一行箭头函数为什么能直接 return 一个 Promise
 *   @teach-10 模板字符串拼 RESTful 路径参数
 *   @teach-11 为什么有的地方要 Number() 强转
 *   @teach-12 fetchAll 分页拉全量（9651 条评论怎么拉的）
 *   @teach-13 uploadFile 为什么不能复用 request()，必须手写 Promise
 *   @teach-14 最后那个 default export 是给 AI 工具表用的
 *
 * 【命名对照表】
 *   登录      POST  /api/login                    账号密码登录
 *   手机登录  POST  /api/phone/login              手机号登录
 *   退出      POST  /logout                       退出登录
 *   轮播图    GET   /api/building/banner/list     首页广告
 *   楷模新闻  GET   /api/model/list               楷模列表
 *   英雄列表  GET   /api/hero/list                英雄故事列表
 *   英雄详情  GET   /api/hero/{id}                单个英雄故事
 *   英雄评论  GET   /api/hero/evaluate/list       某个英雄的评论
 *   身边英雄  GET   /api/around/list              身边英雄列表
 *   感言列表  GET   /api/testimonials/list        学习感言
 *   新增感言  POST  /api/testimonials
 *   删除感言  DELETE/api/testimonials/{id}
 *   学习历史  GET   /api/history/list             必须传 userId
 *   加笔记    POST  /api/history/note
 *   改笔记    PUT   /api/history/note
 *   删笔记    DELETE/api/history/note?noteId=&studyHistoryId=
 *   笔记详情  GET   /api/history/note/{id}
 *   公益列表  GET   /api/activity/list
 *   公益详情  GET   /api/activity/{id}
 *   已报名    GET   /api/activity/apply/list
 *   报名      POST  /api/activity/apply
 *   捐赠列表  GET   /api/donation/list
 *   评论分析  GET   /api/data/comment/list
 *   阅读分析  GET   /api/read/book/list
 *   类型分析  GET   /api/read/book/list/type
 *   用户信息  GET   /api/common/user/getInfo
 *   上传文件  POST  /common/upload
 *
 * 【对应 PPT】P20 请求封装①：26 个接口凭什么一行
 * ============================================================================
 */

import { http, request, getToken, fullImg } from '@/utils/request.js';
import { BASE_URL } from '@/config/index.js';

/* ------------------------------------------------------------------ 登录 */

/**
 * 账号密码登录。
 *
 * @param {string} username 账号
 * @param {string} password 密码
 *
 * @teach-09 这一行到底发生了什么？
 *   ① (username, password) => 是箭头函数，箭头后面没有大括号，
 *      表示「直接把后面的表达式当作返回值」——相当于 return http.post(...)。
 *   ② http.post 返回的是一个 Promise，所以 login() 的返回值也是 Promise。
 *      于是调用方可以写 const res = await login('test01', '123456')。
 *   ③ 第三参数 { auth: false }：登录时还没有 token，
 *      必须显式告诉请求层「这次别带 Authorization」，
 *      否则某些后端看到空 token 会直接回 401，导致永远登不上。
 *
 * 【为什么不写 function login() {}】
 *   功能完全一样，但箭头函数少 5 个字符、不用管 this 指向，
 *   对这种「一转手」的函数更清爽。这也是现在前端的主流写法。
 */
export const login = (username, password) =>
	http.post('/api/login', { username, password }, { auth: false });

/**
 * 手机号 + 密码登录。写法和上面完全一致，只是路径不同。
 *
 * 【语法】{ phone, password } 是 ES6 的「属性简写」，
 *   等价于 { phone: phone, password: password }。
 */
export const phoneLogin = (phone, password) =>
	http.post('/api/phone/login', { phone, password }, { auth: false });

/**
 * 退出登录。
 *
 * 【为什么路径没有 /api 前缀】这是后端原始的路径（对照表里写着 /logout），
 *   移植时照抄文档，别自作主张加前缀，否则会 404。
 * 【为什么传 {} 而不是不传】post 方法第二个参数是 data，
 *   有些后端要求 POST 必须带 JSON body，传空对象最保险。
 */
export const logout = () => http.post('/logout', {});

/* ---------------------------------------------------------------- 首页 */

// 广告轮播图：返回 rows[{ id, title, imgUrl, sort }]
export const bannerList = () => http.get('/api/building/banner/list');

/**
 * 楷模新闻列表（分页）。
 *
 * @param {number} [pageNum=1]  第几页，从 1 开始
 * @param {number} [pageSize=10] 每页几条
 *
 * 【语法】参数默认值 pageNum = 1：调用时不传就是 1。
 *   所以页面里可以只写 modelList() 拿第一页，也可以 modelList(2, 20) 拿第二页 20 条。
 */
export const modelList = (pageNum = 1, pageSize = 10) =>
	http.get('/api/model/list', { pageNum, pageSize });

/* ------------------------------------------------------------ 英雄故事 */

export const heroList = (pageNum = 1, pageSize = 10) =>
	http.get('/api/hero/list', { pageNum, pageSize });

/**
 * 英雄详情（按 id 查单个）。
 *
 * @teach-10 路径里的 id 是怎么拼进去的？
 *   用的是「模板字符串」：反引号包起来，${id} 会被替换成变量值。
 *   heroDetail(7)  →  '/api/hero/7'
 *   这就是 RESTful 风格——资源 id 放在路径里，而不是 ?id=7。
 *
 * 【注意】这里没有做任何校验。如果传进来的是 undefined，
 *   会拼出 '/api/hero/undefined'，后端返回 500 或空对象。
 *   调用方（hero/detail.vue）在 onLoad 里已经保证 id 一定有值。
 */
export const heroDetail = (id) => http.get(`/api/hero/${id}`);

export const heroComments = (heroId, pageNum = 1, pageSize = 10) =>
	http.get('/api/hero/evaluate/list', { heroId, pageNum, pageSize });

export const aroundList = (pageNum = 1, pageSize = 10) =>
	http.get('/api/around/list', { pageNum, pageSize });

/* ------------------------------------------------------------ 学习感言 */

export const testimonialsList = (pageNum = 1, pageSize = 10) =>
	http.get('/api/testimonials/list', { pageNum, pageSize });

// 新增感言：POST 到集合路径，参数放 body
export const addTestimonial = (title, content) =>
	http.post('/api/testimonials', { title, content });

// 删除感言：DELETE 到「集合/id」，这是标准的 REST 删除写法
export const delTestimonial = (id) => http.del(`/api/testimonials/${id}`);

/* ---------------------------------------------------- 学习历史 + 笔记 */

/**
 * 学习历史列表。
 *
 * 【为什么第一个参数是 userId 而不是 pageNum】
 *   这个接口必须告诉后端「查谁的历史」，所以 userId 是必传的。
 *   页面里一般这样调：historyList(user.userId, 1, 10)。
 *   （utils/ai.js 里则用 currentUserId() 先查一次当前用户 id 再调）
 */
export const historyList = (userId, pageNum = 1, pageSize = 10) =>
	http.get('/api/history/list', { userId, pageNum, pageSize });

/**
 * 新增笔记。
 *
 * @teach-11 为什么 studyHistoryId 要套一层 Number()？
 *   因为这个 id 是从页面路由参数或列表下标来的，很可能是字符串 '12'。
 *   后端（Java）实体类里这个字段是 Long，收到字符串会抛类型转换异常 → 500。
 *   前端在发请求前统一转成数字，比让后端去容错更省事。
 *   【代价】如果传进来的是 'abc'，Number('abc') 会得到 NaN，
 *   序列化成 JSON 时变成 null，后端仍然会报错——所以调用方要保证传的是数字。
 */
export const addNote = (noteTitle, noteContent, studyHistoryId) =>
	http.post('/api/history/note', { noteTitle, noteContent, studyHistoryId: Number(studyHistoryId) });

// 修改笔记：同一个路径，但方法换成 PUT（REST 里 PUT 表示「整体更新」）
export const updateNote = (noteId, noteTitle, noteContent) =>
	http.put('/api/history/note', { noteId: Number(noteId), noteTitle, noteContent });

/**
 * 删除笔记。
 *
 * 【为什么参数走 query 而不是 body】
 *   DELETE 请求带 body 在部分服务器 / 代理上会被丢掉（HTTP 规范没禁止，但实现不一致）。
 *   所以这里用 http.del(url, params)，params 会拼成 ?noteId=1&studyHistoryId=2。
 *   注意 del 的第二个参数是 params 而不是 data，别写错位置。
 */
export const delNote = (noteId, studyHistoryId) =>
	http.del('/api/history/note', { noteId, studyHistoryId });

export const noteDetail = (noteId) => http.get(`/api/history/note/${noteId}`);

/* -------------------------------------------------------------- 公益 */

export const activityList = (pageNum = 1, pageSize = 10) =>
	http.get('/api/activity/list', { pageNum, pageSize });

export const activityDetail = (id) => http.get(`/api/activity/${id}`);

/**
 * 我报名的活动列表。
 *
 * @teach-11 注意这里的默认 pageSize 是 100，不是 10。
 *   因为这个列表只用来做「我报了几个」的计数和勾选状态，
 *   一次性拉全部比做分页 UI 划算。个人数据量小，100 条足够。
 */
export const myApplyList = (pageNum = 1, pageSize = 100) =>
	http.get('/api/activity/apply/list', { pageNum, pageSize });

// 报名：POST 一个 { activityId } 过去，同样做了 Number 强转
export const applyActivity = (activityId) =>
	http.post('/api/activity/apply', { activityId: Number(activityId) });

/* ------------------------------------------------------------ 物资捐赠 */

export const donationList = (pageNum = 1, pageSize = 10) =>
	http.get('/api/donation/list', { pageNum, pageSize });

/* ------------------------------------------------------------ 数据分析 */

/**
 * @teach-11 这三个接口的默认 pageSize 直接顶到 5000，为什么？
 *   因为数据分析要算「2022 年全年」的统计，必须拿到全量数据。
 *   后端单页上限就是 5000，所以默认值直接给满。
 *   配合下面的 fetchAll() 用：一页 5000，9651 条评论两页就拉完了。
 *   ⚠️ 代价是首屏慢（3~8 秒），这一点在 PPT P31「已知限制」里主动交代。
 */
export const commentList = (pageNum = 1, pageSize = 5000) =>
	http.get('/api/data/comment/list', { pageNum, pageSize });

export const readBookList = (pageNum = 1, pageSize = 5000) =>
	http.get('/api/read/book/list', { pageNum, pageSize });

export const readBookTypeList = (pageNum = 1, pageSize = 5000) =>
	http.get('/api/read/book/list/type', { pageNum, pageSize });

/* ------------------------------------------------------------ 用户信息 */

export const userInfo = () => http.get('/api/common/user/getInfo');

/* ------------------------------------------------------------ 文件上传 */

/**
 * 上传文件（头像）。
 * 用 uni.uploadFile：它内部就是 multipart/form-data，字段名按接口文档写 'file'。
 * 注意 uni.uploadFile 不能自己设 Content-Type，让它自己生成边界。
 *
 * @param {string} filePath 本地临时文件路径（uni.chooseImage 返回的 tempFilePath）
 * @returns {Promise<{url: string, raw: object}>} url 已经补成完整地址，可直接绑 image
 *
 * @teach-13 为什么这个不能用上面的 http.post？
 *   因为上传走的是 multipart/form-data，不是 JSON：
 *   ① 不能设 Content-Type: application/json（那会变成普通表单）；
 *   ② 也不能手动设 Content-Type 的 boundary（边界字符串是浏览器/系统生成的，
 *      你写死了服务端就解析不出来）；
 *   ③ 所以只能用专门上传的 uni.uploadFile，参数形态和 uni.request 完全不同。
 *   既然用不了 http，那就得自己 new Promise 包一层——这就是下面这段的由来。
 *
 * 【为什么 res.data 要 JSON.parse】
 *   uni.request 的 res.data 已经是解析好的对象，
 *   但 uni.uploadFile 的 res.data 是「原始字符串」。不 parse 就直接 res.data.code，
 *   拿到的是 undefined，会一直走「上传失败」分支。
 *   外面套 try/catch：万一服务器返回了一段 HTML 错误页（比如 502），
 *   JSON.parse 会抛异常，我们要把它转成可读的提示，而不是让页面白屏。
 */
export function uploadFile(filePath) {
	return new Promise((resolve, reject) => {
		uni.uploadFile({
			// 注意：uploadFile 不做地址拼接，必须自己拼 BASE_URL
			url: BASE_URL + '/common/upload',
			filePath,
			// name 是后端接收文件的字段名，文档里写的是 file，不能改
			name: 'file',
			// uploadFile 不会自动带 token，得自己塞（这里只带 Authorization，没有 JSON 头）
			header: { Authorization: getToken() },
			success(res) {
				let body = {};
				try {
					body = JSON.parse(res.data);
				} catch (e) {
					reject(new Error('服务器返回格式异常'));
					return;
				}
				if (body.code === 200) {
					/**
					 * 【为什么这里要调 fullImg】
					 *   后端只返回相对路径（比如 /profile/upload/a.jpg），
					 *   页面拿到就直接 <image :src> 是显示不出来的。
					 *   在这里统一补全，页面层就完全不用关心地址问题。
					 *   body.url 和 body.fileName 是不同版本后端的返回字段，
					 *   两个都取一下，兼容更稳。
					 */
					resolve({ url: fullImg(body.url || body.fileName || ''), raw: body });
				} else {
					reject(new Error(body.msg || '上传失败'));
				}
			},
			fail(err) {
				reject(new Error(err.errMsg || '上传失败'));
			}
		});
	});
}

/* ------------------------------------------- 「分页拉全部」通用小工具 */

/**
 * 把分页接口的所有页都拉回来，拼成一个大数组。
 *
 * @param {Function} fetcher 形如 (pageNum, pageSize) => Promise<{rows,total}>
 * @param {number}  [pageSize=5000] 每页多少条
 * @returns {Promise<Array>} 全部数据
 *
 * @teach-12 为什么需要它？
 *   统计「2022 年评论最多的月份」，必须拿到全年 9651 条评论。
 *   但接口一次最多给 5000 条，所以要拉两页再拼起来。
 *   这个函数就是那个「拉完为止」的循环。
 *
 * 【三个终止条件，缺一不可】
 *   ① rows.length === 0 —— 这页是空的，后面肯定也没了；
 *   ② all.length >= total —— 累计条数已经够了（后端给了 total 就用它判断，最准）；
 *   ③ page > 20 —— 硬上限。万一后端 total 字段是错的（比如永远返回 -1），
 *      没有这条就会无限循环把手机烧热。
 *
 * 【为什么用 while 而不是并发 Promise.all】
 *   因为「有没有下一页」取决于上一页返回的 total，必须串行。
 *   而且 pageSize 已经顶到 5000，并发也快不了多少。
 *
 * 【代价】9651 条评论 = 2 次请求 + 一次全量遍历，首屏 3~8 秒。
 *   这是「前端做聚合」的必然成本，正确解法是让后端出一个统计接口。
 */
export async function fetchAll(fetcher, pageSize = 5000) {
	let page = 1;
	let all = [];
	// 最多拉 20 页，防止接口异常时死循环
	while (page <= 20) {
		// 【语法】await 会等这个 Promise 完成再往下走，
		// 所以循环是一页一页串行拉的，不是同时发 20 个请求
		const res = await fetcher(page, pageSize);
		const rows = (res && res.rows) || [];
		// 【语法】concat 不会修改原数组，而是返回一个新数组，所以要重新赋值给 all
		all = all.concat(rows);
		const total = (res && res.total) || 0;
		if (!rows.length || all.length >= total) break;
		page += 1;
	}
	return all;
}

/**
 * @teach-14 这个默认导出是给谁用的？
 *   给 utils/ai.js 的「工具表」用的。
 *   AI 的 function calling 需要「按函数名找到对应实现」，
 *   有个大对象就能写 api[name](...) 或做映射，不用写一大串 if。
 *   页面层其实用的是上面的具名导出（import { activityList } from '@/api/index.js'），
 *   两种导出方式并存，各取所需。
 *
 * 【语法】{ login, phoneLogin, ... } 都是属性简写，
 *   等价于 { login: login, phoneLogin: phoneLogin, ... }。
 *   注意最后两个 fetchAll 和 request 不是业务接口，是工具函数，
 *   一并挂进来是为了让 AI 层能复用同一套请求逻辑。
 */
export default {
	login,
	phoneLogin,
	logout,
	bannerList,
	modelList,
	heroList,
	heroDetail,
	heroComments,
	aroundList,
	testimonialsList,
	addTestimonial,
	delTestimonial,
	historyList,
	addNote,
	updateNote,
	delNote,
	noteDetail,
	activityList,
	activityDetail,
	myApplyList,
	applyActivity,
	donationList,
	commentList,
	readBookList,
	readBookTypeList,
	userInfo,
	uploadFile,
	fetchAll,
	request
};
