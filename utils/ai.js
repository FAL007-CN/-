/**
 * ============================================================================
 * AI 问答助手引擎 utils/ai.js
 * ----------------------------------------------------------------------------
 * 【这个文件干什么】
 * 把「大模型」和「你自己的后端接口」连起来，让 AI 能真的查数据再回答。
 *
 * 【它是怎么工作的（三个层次）】@teach-15
 *
 *   第一层 · 调模型
 *     用标准的 OpenAI 协议发请求：POST {baseUrl}/chat/completions
 *     所以 DeepSeek、通义千问、Kimi、智谱、OpenAI 全都能用，只改 baseUrl + model。
 *     对应函数：chatUrl() / callModel()
 *
 *   第二层 · 调你的接口（function calling / 工具调用）
 *     我们把后端接口里好用的 11 个「注册」成工具交给模型。
 *     模型觉得需要真实数据时，会返回一个「我要调 get_activity_list」的指令；
 *     我们在这边真的去请求 http://114.66.9.70:10002，把结果塞回对话；
 *     模型再根据真实数据写回答。
 *     —— 这一步就是「AI 调用我的 API」的核心。
 *     对应函数：TOOLS / execTool() / chat() 里的多轮循环
 *
 *   第三层 · 兜底（没 Key / 断网 / 跨域被拦）
 *     自动切到「本地数据问答」：用关键词判断你想问啥，直接查后端接口，
 *     套模板回答。演示时哪怕没网、没 Key，也不会冷场。
 *     对应函数：hits() / localAnswer()
 *
 * 【为什么要兜底？】
 * 比赛现场最怕的不是做得不够炫，而是点下去没反应。宁可答得朴素，不能翻车。
 *
 * 【依赖关系】
 *   config/index.js  —— 拿 AI 配置（baseUrl/apiKey/model/温度/轮数）
 *   api/index.js     —— 拿 12 个接口函数，工具真正干活时调它们
 *   注意：本文件从不直接调 uni.request 打业务接口，全部复用薄 API 层。
 *         AI 层只新增了一种请求——打大模型的那个（callModel 里）。
 *
 * 【教学重点速查】
 *   @teach-15 三层架构       @teach-16 pick 省 token
 *   @teach-17 工具表 schema  @teach-18 switch 分发
 *   @teach-19 中文 key       @teach-20 轮数上限
 *   @teach-21 SSE buffer     @teach-22 增量解码
 *   @teach-23 条件编译       @teach-24 两段式请求
 *   @teach-25 省一次往返
 *
 * 【对应 PPT】P26 / P27 / P28 / P29
 * ============================================================================
 */

import {
	AI,
	STORAGE_KEYS
} from '@/config/index.js';
import {
	aroundList, // 现场修改补丁：新增「身边英雄」工具时加的
	bannerList,
	modelList,
	heroList,
	activityList,
	myApplyList,
	historyList,
	donationList,
	userInfo,
	commentList,
	readBookList,
	readBookTypeList,
	fetchAll
} from '@/api/index.js';

/* ==========================================================================
   一、设置：Key / 地址 / 模型（存在本地，界面上可以改，不用改代码）
   ========================================================================== */

/**
 * 读当前 AI 设置。
 *
 * 【三层覆盖逻辑】本地存储 → 代码里的默认值，谁有值用谁：
 *   用户在设置弹层里填过，就以本地的为准；没填过就用 config/index.js 里的。
 *   这样「改配置不用改代码」和「出厂有默认值」两件事都成立。
 *
 * 【语法】|| 在这里当「兜底」用：左边是空串 / undefined 时取右边。
 *   注意它对 0 和 false 也生效，所以只适合字符串字段，别用在数字上。
 */
export function getAISettings() {
	const saved = uni.getStorageSync(STORAGE_KEYS.aiSettings) || {};
	return {
		baseUrl: saved.baseUrl || AI.baseUrl,
		apiKey: saved.apiKey || AI.apiKey,
		model: saved.model || AI.model
	};
}

/**
 * 保存 AI 设置。
 *
 * @param {Object} settings 只传要改的字段即可，没传的保持原样
 * @returns {Object} 合并后的完整设置
 *
 * 【语法】{ ...a, ...b } 是对象展开合并：
 *   后面的 b 会覆盖 a 里同名的键，所以「旧设置 + 新值」就得到了完整配置。
 *   这比逐字段 if 判断清爽得多，也不会漏字段。
 */
export function saveAISettings(settings) {
	const next = {
		...getAISettings(),
		...settings
	};
	uni.setStorageSync(STORAGE_KEYS.aiSettings, next);
	return next;
}

/**
 * 有没有可用的 Key。
 *
 * 【为什么先 trim 再取反】
 *   用户可能只在输入框里敲了几个空格。如果直接判断 apiKey 是否为空串，
 *   '   ' 会被当成「有 Key」，然后发请求时鉴权失败，报一个很难懂的错误。
 *   trim() 去掉首尾空白后再判断，纯空格就等于没填。
 *
 * 【!! 是什么】连续两个取反 = 转成布尔值。
 *   !!'abc' → true，!!'' → false，比写 if/else 短。
 */
export function hasApiKey() {
	return !!getAISettings().apiKey.trim();
}

/**
 * 拼出「对话接口」的完整地址。
 *
 * @param {string} baseUrl 用户配置的服务地址
 * @returns {string} 形如 https://api.deepseek.com/chat/completions
 *
 * 【为什么要 replace 掉末尾的斜杠】
 *   用户填地址时习惯不一样：
 *     https://api.deepseek.com
 *     https://api.deepseek.com/
 *     https://api.deepseek.com///
 *   如果直接拼 '/chat/completions'，第二种会变成
 *   https://api.deepseek.com//chat/completions —— 有些服务端会 404。
 *   正则 /\/+$/ 的意思是「末尾的一个或多个斜杠」，全部换成空。
 *
 * 【语法】\/+$ 里：\/ 是转义的斜杠，+ 表示一个或多个，$ 表示字符串结尾。
 */
function chatUrl(baseUrl) {
	return String(baseUrl).replace(/\/+$/, '') + '/chat/completions';
}

/* ==========================================================================
   二、工具表：AI 能调用的后端接口
   --------------------------------------------------------------------------
   description 写清楚「什么时候该用它」，模型是靠这段字决定要不要调的。
   ========================================================================== */

/**
 * 从数组里挑出指定字段、并限制条数。
 *
 * @param {Array}  arr   原始数据（可能是 undefined）
 * @param {Array}  keys  要保留的字段名
 * @param {number} limit 最多取几条，默认 8
 * @returns {Array} 精简后的数据
 *
 * @teach-16 为什么要把字段裁掉？
 *   接口返回的每条记录可能有 20 多个字段（创建时间、更新人、删除标记……），
 *   而模型真正需要的只有 3~4 个。
 *   ① 省钱：大模型按 token 计费，500 条原始数据能烧掉一大半额度；
 *   ② 省时：请求体越大越慢，用户等得越久；
 *   ③ 更准：字段越少，模型越不容易被无关信息带偏。
 *   所以这里「先切条数，再挑字段」，两个动作一起做。
 *
 * 【语法】三个细节：
 *   (arr || [])     —— arr 可能是 undefined，兜成空数组，避免 .slice 报错
 *   .slice(0, limit) —— 取前 limit 条，不会修改原数组
 *   it[k] !== undefined && it[k] !== null —— 只保留有值的字段，
 *                                          避免把一堆 null 塞给模型浪费 token
 */
const pick = (arr, keys, limit = 8) =>
	(arr || []).slice(0, limit).map((it) => {
		const o = {};
		keys.forEach((k) => {
			if (it[k] !== undefined && it[k] !== null) o[k] = it[k];
		});
		return o;
	});

/**
 * 工具表 —— 交给大模型的「能力说明书」。
 *
 * @teach-17 这个数组到底喂给谁、长什么样？
 *   它会被原样塞进请求体的 tools 字段，格式是 OpenAI 的 function calling 规范：
 *
 *     {
 *       type: 'function',
 *       function: {
 *         name: '函数名',            // 模型只能用这个名字叫你
 *         description: '什么时候用它', // 模型靠这段中文决定「要不要调」
 *         parameters: {              // 参数用 JSON Schema 描述
 *           type: 'object',
 *           properties: { keyword: { type: 'string' } },
 *           required: []             // 哪些参数必填
 *         }
 *       }
 *     }
 *
 * 【最关键的一点】模型不会执行任何代码。
 *   它只会输出一段 JSON：{"name":"get_activity_list","arguments":"{\"pageSize\":5}"}
 *   真正去查数据库的是下面第三节的 execTool()。
 *   所以「AI 不会瞎编你的数据」不是靠提示词，是靠这个架构——
 *   数据必须从我们自己的接口拿回来，模型只负责组织语言。
 *
 * 【description 为什么写得这么啰嗦】
 *   它就是给模型看的 prompt。「用户问公益活动、想报名时用」这种
 *   「什么场景该调」的描述，比「查询活动列表」有效得多。
 *   写不清楚，模型就会该调的时候不调、不该调的时候乱调。
 *
 * 【为什么 11 个工具里有一半没有参数】
 *   像「查我的学习记录」「查全年评论统计」这种，参数没有意义
 *   （永远是当前用户、永远是 2022 年），所以 properties 是空对象。
 *   模型只能决定「调不调」，决定不了「查什么」——这是刻意的设计，
 *   减少它可以乱传参数的空间。
 */
const TOOLS = [{
		type: 'function',
		function: {
			name: 'get_banner_list',
			description: '查询首页轮播图（广告位）的标题列表。用户问首页轮播/广告时用。',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_model_news',
			// 带 keyword 的工具，description 里要写清「按什么字段过滤」
			description: '查询「楷模新闻」列表，可按姓名或标题关键词过滤。返回标题、楷模姓名、内容摘要。用户问楷模、模范人物、新闻时用。',
			parameters: {
				type: 'object',
				properties: {
					keyword: {
						type: 'string',
						description: '关键词，可为空'
					},
					pageSize: {
						type: 'number',
						description: '返回条数，默认 5'
					}
				},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'search_hero_story',
			description: '查询「英雄故事」列表，可按标题或英雄姓名关键词过滤。返回标题、姓名、简介、点击量。',
			parameters: {
				type: 'object',
				properties: {
					keyword: {
						type: 'string',
						description: '关键词，可为空'
					},
					pageSize: {
						type: 'number',
						description: '返回条数，默认 5'
					}
				},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_activity_list',
			description: '查询「公益活动」列表。返回活动名称、报名人数、活动时间、发起方。用户问有哪些公益活动、想报名时用。',
			parameters: {
				type: 'object',
				properties: {
					keyword: {
						type: 'string',
						description: '活动名称关键词，可为空'
					},
					pageSize: {
						type: 'number',
						description: '返回条数，默认 5'
					}
				},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_my_applications',
			// 「当前登录用户」这种隐含条件要写进来，否则模型可能以为能查别人
			description: '查询当前登录用户已报名的公益活动记录。用户问「我报了哪些活动」时用。',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_study_summary',
			description: '查询当前用户的学习历史条数和最近几条学习内容标题，以及是否写过笔记。用户问学习记录、心得、笔记时用。',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_comment_stats',
			// 这个工具在服务端做了聚合（12 个月数组 + 峰值月），
			// description 里把「输出什么」写清楚，模型才知道该怎么组织回答
			description: '统计 2022 年每个月的新闻评论数量（区分女性/男性），并给出全年总数和评论最多的月份。用户问评论数据、数据分析、哪个月活跃时用。',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_reading_stats',
			description: '统计 2022 年每月阅读书籍数量、全年总数，以及书籍类型占比（哪种书读得最多）。用户问阅读数据、书籍类型偏好时用。',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_donation_list',
			description: '查询物资捐赠记录。返回捐赠物品、捐赠人、数量、日期。',
			parameters: {
				type: 'object',
				properties: {
					pageSize: {
						type: 'number',
						description: '返回条数，默认 5'
					}
				},
				required: []
			}
		}
	},
	{
		type: 'function',
		function: {
			name: 'get_user_profile',
			description: '查询当前登录用户的基本信息（昵称、账号、性别、手机号、邮箱、余额等）。',
			parameters: {
				type: 'object',
				properties: {},
				required: []
			}
		}
	},
	
	
	//现场修改补丁
	// 【这个工具是后补的】原本只有 10 个，演示时发现问「身边英雄」答不上来，
	// 于是照着上面的模板补了第 11 个。注意：文件头注释里写的「11 个」是更正后的数字。
	{
		type: 'function',
		function: {
			name: 'get_around_hero',
			description: '查询「身边英雄」列表，返回标题、姓名、简介。',
			parameters: {
				type: 'object',
				properties: {
					pageSize: {
						type: 'number'
					}
				},
				required: []
			}
		}
	}
];

/* ==========================================================================
   三、工具执行器：真的去请求后端
   ========================================================================== */

// 记住当前用户 id，避免每次问都重新查一遍
// 【语法】这是普通变量不是 ref：它不参与界面渲染，改它不需要触发视图更新。
let cachedUserId = null;

/**
 * 拿到当前登录用户的 id（带缓存）。
 *
 * 【为什么要缓存】用户可能连着问三个跟「我的」有关的问题，
 *   每次都去调一次 /getInfo 纯属浪费。第一次拿到就存起来，后面直接用。
 * 【为什么不做失效】用户 id 在一次会话里不会变；换账号时会整页重载，缓存自然清空。
 */
async function currentUserId() {
	if (cachedUserId) return cachedUserId;
	const res = await userInfo();
	const u = (res && res.data) || {};
	cachedUserId = u.userId;
	return cachedUserId;
}

/**
 * 执行一个工具（模型点名要调哪个，这里就去真的调）。
 *
 * @param {string} name 工具名，必须是 TOOLS 里声明过的
 * @param {Object} args 模型给的参数（已经 JSON.parse 过）
 * @returns {Promise<Object>} 接口结果，形状是「中文 key → 值」
 *
 * 注意：任何异常都要 catch 住，返回错误字符串给模型，而不是让整个对话崩掉。
 *
 * @teach-18 谁真正执行函数？
 *   模型只输出「我要调 get_activity_list，参数是 {pageSize:5}」这段 JSON。
 *   真正把请求打到后端的是这个 switch —— 这就是「执行权在本地」。
 *   好处：① 模型永远碰不到数据库；② 查什么、查多少由代码控制；
 *        ③ 接口报错也只是返回一段错误文本，模型可以据此说「没查到」。
 *
 * 【参数兜底的两个小动作】
 *   (args.keyword || '').trim()        —— 模型可能不传 keyword，兜成空串；
 *   Math.min(Number(args.pageSize) || 5, 20)
 *     —— 模型可能传 1000，这里夹到最多 20 条，防止一次拉太多把响应撑爆。
 *        两个动作合起来，叫「不信任上游输入」，是调外部接口的通用纪律。
 */
async function execTool(name, args = {}) {
	const kw = (args.keyword || '').trim();
	const size = Math.min(Number(args.pageSize) || 5, 20);

	try {
		switch (name) {
			/**
			 * 【语法】每个 case 后面用 { } 包成一个块，有两个好处：
			 *   ① 里面的 const res 不会和其他 case 的 res 冲突
			 *      （不包块的话，所有 case 共享同一个作用域，重复声明直接报错）；
			 *   ② 视觉上有明确边界，几百行的 switch 也能看清每段在哪儿结束。
			 * 注意块结尾是大括号，不能写成 }, —— 那会变成语法错误。
			 */
			case 'get_banner_list': {
				const res = await bannerList();
				return {
					轮播图: pick(res.rows, ['id', 'title'])
				};
			}

			case 'search_model_news': {
				// 【为什么先拉 50 条再在 JS 里 filter】
				// 后端这个接口没有关键词搜索参数，只能把最近 50 条拉回来自己筛。
				// 这是「前端补偿后端能力不足」的典型写法，量小的时候完全够用。
				const res = await modelList(1, 50);
				let rows = res.rows || [];
				if (kw) rows = rows.filter((r) => `${r.title}${r.name}`.includes(kw));
				return {
					总数: res.total,
					命中: rows.length,
					列表: pick(rows, ['id', 'title', 'name', 'content'], size)
				};
			}

			case 'search_hero_story': {
				const res = await heroList(1, 50);
				let rows = res.rows || [];
				if (kw) rows = rows.filter((r) => `${r.title}${r.name}`.includes(kw));
				return {
					总数: res.total,
					命中: rows.length,
					列表: pick(rows, ['id', 'title', 'name', 'introduction', 'clickNum'], size)
				};
			}

			case 'get_activity_list': {
				const res = await activityList(1, 50);
				let rows = res.rows || [];
				if (kw) rows = rows.filter((r) => `${r.activityName}${r.activityDetail}`.includes(kw));
				return {
					总数: res.total,
					命中: rows.length,
					列表: pick(
						rows,
						['id', 'activityName', 'applyNum', 'startEndTime', 'initiator', 'briefIntroduction'],
						size
					)
				};
			}

			case 'get_my_applications': {
				const res = await myApplyList(1, 100);
				return {
					我的报名条数: (res.rows || []).length,
					记录: pick(res.rows, ['id', 'activityId', 'createTime'], 10)
				};
			}

			case 'get_study_summary': {
				// 这个工具需要 userId，先去 currentUserId() 里取（带缓存）
				const uid = await currentUserId();
				const res = await historyList(uid, 1, 20);
				const rows = res.rows || [];
				return {
					学习历史条数: res.total,
					// 【为什么不是简单的 length】一条学习记录不一定有笔记，
					// wstudyNote 是嵌套对象，得判断它存在且 noteId 有值才算「写了笔记」
					带笔记的条数: rows.filter((r) => r.wstudyNote && r.wstudyNote.noteId).length,
					最近内容: pick(rows, ['title', 'issueTime', 'noteTitle'], 5)
				};
			}

			case 'get_comment_stats': {
				// 【这是全项目最重的一次查询】fetchAll 会把 9651 条评论全拉回来
				const rows = await fetchAll(commentList, 5000);
				// 12 个月的计数器，初始化成 [0,0,...,0]
				const female = new Array(12).fill(0);
				const male = new Array(12).fill(0);
				let yearTotal = 0;
				rows.forEach((r) => {
					// 【为什么用字符串切片取年月】commentTime 是 '2022-03-15 10:20:30' 这种格式，
					// substring(0,4) 拿到年份，substring(5,7) 拿到月份，比 new Date() 解析更稳也更快
					const t = String(r.commentTime || '');
					if (t.substring(0, 4) !== '2022') return;
					const m = Number(t.substring(5, 7));
					if (!m || m < 1 || m > 12) return;
					if (String(r.commentUserSex) === '1') female[m - 1] += 1;
					else male[m - 1] += 1;
					yearTotal += 1;
				});
				// 【语法】map 逐个相加，得到每月总数数组；...monthTotal 是展开，
				// 把数组拆成 Math.max(1月, 2月, ...) 这样的参数列表
				const monthTotal = female.map((v, i) => v + male[i]);
				const peak = monthTotal.indexOf(Math.max(...monthTotal)) + 1;
				/**
				 * @teach-19 为什么返回对象的 key 用中文？
				 *   因为这个对象最后会被 JSON.stringify 塞进对话里给模型看。
				 *   中文 key 对模型来说语义更清楚，回答时不容易把字段搞混。
				 *   对前端自己也没什么损失——用 r['2022年评论总数'] 取值就行。
				 *   代价是不太好写 TypeScript 类型，但本项目没上 TS。
				 */
				return {
					数据总条数: rows.length,
					'2022年评论总数': yearTotal,
					女性分月: female,
					男性分月: male,
					评论最多的月份: `${peak}月`,
					该月评论数: monthTotal[peak - 1]
				};
			}

			case 'get_reading_stats': {
				/**
				 * 【语法】Promise.all 把两个独立请求同时发出去，
				 *   等两个都完成才继续。总耗时 = 较慢的那个，而不是两个相加。
				 *   这里两份数据互不依赖，所以可以并行；
				 *   如果是「先查用户 id 再查他的记录」，就必须串行 await。
				 */
				const [readRows, typeRows] = await Promise.all([
					fetchAll(readBookList, 5000),
					fetchAll(readBookTypeList, 5000)
				]);
				const monthly = new Array(12).fill(0);
				let yearTotal = 0;
				readRows.forEach((r) => {
					const t = String(r.readTime || '');
					if (t.substring(0, 4) !== '2022') return;
					const m = Number(t.substring(5, 7));
					if (!m || m < 1 || m > 12) return;
					monthly[m - 1] += 1;
					yearTotal += 1;
				});
				// 按书籍类型计数，map 在这里当「字典」用：{ 文学: 12, 科技: 8 }
				const map = {};
				typeRows.forEach((r) => {
					const n = r.bookTypeName || '其他';
					map[n] = (map[n] || 0) + 1;
				});
				// 【为什么 || 1】防止除数为 0 得到 Infinity 或 NaN
				const totalType = Object.values(map).reduce((a, b) => a + b, 0) || 1;
				const ranking = Object.keys(map)
					.map((k) => ({
						类型: k,
						数量: map[k],
						// toFixed(1) 保留一位小数，拼上 % 号，避免出现 33.33333333%
						占比: `${((map[k] / totalType) * 100).toFixed(1)}%`
					}))
					// 【语法】sort 的比较函数返回正数表示 a 排后面，所以 b.数量 - a.数量 就是降序
					.sort((a, b) => b.数量 - a.数量);
				const peak = monthly.indexOf(Math.max(...monthly)) + 1;
				return {
					'2022年阅读总数': yearTotal,
					分月数量: monthly,
					阅读最多的月份: `${peak}月`,
					书籍类型数: ranking.length,
					类型排行: ranking
				};
			}

			case 'get_donation_list': {
				const res = await donationList(1, size);
				return {
					总数: res.total,
					列表: pick(res.rows, ['content', 'donationUser', 'number', 'donationDate'], size)
				};
			}

			case 'get_user_profile': {
				const res = await userInfo();
				const u = res.data || {};
				// 【语法】嵌套三元：先判 '0' 男，再判 '1' 女，都不是就「未知」。
				// 后端用字符串 '0'/'1' 表示性别，所以这里也要用字符串比较
				return {
					昵称: u.nickName,
					账号: u.userName,
					性别: String(u.sex) === '0' ? '男' : String(u.sex) === '1' ? '女' : '未知',
					手机号: u.phonenumber,
					邮箱: u.email,
					余额: u.balance
				};
			}
			
			
			//现场修改补丁
			case 'get_around_hero': {
				const res = await aroundList(1, size);
				return {
					总数: res.total,
					列表: pick(res.rows, ['title', 'name', 'introduction'], size)
				};
			}

			/**
			 * 模型有时候会自己编一个不存在的工具名（幻觉）。
			 * 这里不抛异常，而是把「没有这个工具」当成正常结果返回，
			 * 让模型自己看到、然后换个说法回答用户。整轮对话不会崩。
			 */
			default:
				return {
					错误: `没有名为 ${name} 的工具`
				};
		}
	} catch (e) {
		// 【关键设计】接口报错不 throw，转成 { 错误: ... } 还回去。
		// 模型看到错误会自己说「暂时没查到」，而不是让页面弹出红字。
		return {
			错误: `调用接口失败：${e.message || e}`
		};
	}
}

/* ==========================================================================
   四、请求模型
   ========================================================================== */

/**
 * 发一次对话请求。
 * @param {Array}  messages 完整的对话消息数组
 * @param {Object} opts
 * @param {Boolean} opts.tools   是否把工具表带上（第一轮带，最后一轮不带）
 * @param {Boolean} opts.stream  是否流式（只有 H5 支持真正的流式）
 * @param {Function} opts.onDelta 流式收到一段文字时回调
 * @returns {Promise<{content:string, toolCalls:Array}>}
 *
 * 【返回值为什么是这两个字段】不管走 H5 流式还是走 uni.request 一次性，
 *   上层都只需要「文字」和「要不要调工具」。两种传输在这里被抹平成同一个形状，
 *   所以 chat() 里不用区分平台写两套逻辑。
 */
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
	// 【为什么用特殊错误码而不是中文】上层 catch 里要靠 e.message 判断类型，
	// 用 'NO_KEY' / 'CROSS_ORIGIN' 这种常量做分支，比匹配中文稳
	if (!apiKey) throw new Error('NO_KEY');

	/**
	 * 请求体就是标准 OpenAI 协议：
	 *   model       用哪个模型
	 *   messages    完整对话（system + 历史 + 本轮提问）
	 *   temperature 随机性
	 *   stream      要不要流式返回
	 *   tools       能给模型用的工具表
	 *   tool_choice 'auto' 表示「调不调、调哪个，你自己决定」
	 */
	const payload = {
		model,
		messages,
		temperature: AI.temperature,
		// !!stream 把任意真值转成布尔，防止外面传了 undefined 导致 JSON 里出现 null
		stream: !!stream
	};
	if (tools) {
		payload.tools = TOOLS;
		payload.tool_choice = 'auto';
	}

	const headers = {
		'Content-Type': 'application/json',
		/**
		 * 注意这里和 utils/request.js 不一样：
		 *   业务接口传的是裸 token（Authorization: xxx），
		 *   大模型接口要求标准格式（Authorization: Bearer sk-xxx）。
		 *   两套后端两套鉴权，别混。
		 */
		Authorization: `Bearer ${apiKey}`
	};
	const url = chatUrl(baseUrl);

	/* ---------- H5：用 fetch，能拿到真流式（一个字一个字蹦出来） ---------- */
	/**
	 * @teach-23 这行 #ifdef 不是普通的注释，是 uni-app 的「条件编译」指令。
	 *   编译时，H5 平台保留这一块、删掉 #ifndef 那一块；
	 *   App / 小程序平台反过来。
	 *   也就是说：两套实现只会有一套进包，不会因为「写了两份」而变大。
	 *   【为什么必须两套】fetch + ReadableStream 只有浏览器有，
	 *   App 端（原生渲染）里根本没有 fetch，只能用 uni.request。
	 */
	// #ifdef H5
	if (stream && typeof fetch === 'function') {
		let resp;
		try {
			resp = await fetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(payload)
			});
		} catch (e) {
			// 典型原因：接口没开 CORS（浏览器跨域被拦）
			throw new Error('CROSS_ORIGIN');
		}
		if (!resp.ok) {
			// 只取前 200 个字符，避免把一大段 HTML 错误页塞进错误信息里
			const text = await resp.text().catch(() => '');
			throw new Error(`HTTP ${resp.status} ${text.slice(0, 200)}`);
		}
		if (!resp.body || !resp.body.getReader) {
			// 拿不到流（老浏览器 / 某些 WebView），退回普通解析：一次性读完
			const data = await resp.json();
			const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
			return {
				content: msg.content || '',
				toolCalls: msg.tool_calls || []
			};
		}

		const reader = resp.body.getReader();
		/**
		 * @teach-22 为什么必须要 TextDecoder，而且 stream: true 不能省？
		 *   网络传过来的是「字节」（Uint8Array），不是字符串，得解码。
		 *   但中文一个字占 3 个字节，很容易被切在两次读取的边界上：
		 *     ｜第一块：E4 BD｜第二块：A0  ...（"你" = E4 BD A0，被劈成两半）
		 *   stream: true 的作用是「记住上次没解完的那半个字节」，
		 *   下次拼起来再解码。不加这个参数，中文就会变成乱码「」。
		 */
		const decoder = new TextDecoder('utf-8');
		let buffer = '';
		let content = '';

		while (true) {
			const {
				done,
				value
			} = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, {
				stream: true
			});

			/**
			 * @teach-21 整个流式解析最硬的一段：为什么要自己维护 buffer？
			 *
			 * 【问题】SSE 协议规定「一个事件以空行结束」，但网络分块（TCP 分包）
			 *   完全不按这个边界来。你可能收到：
			 *     data: {"choices":[{"delta":{"content":"你
			 *   —— 半个 JSON。如果直接 JSON.parse，必然抛异常，字就丢了。
			 *
			 * 【解法】三件事：
			 *   ① buffer 累积所有收到的文本；
			 *   ② 用正则找「空行」作为事件边界，只处理边界之前的部分；
			 *   ③ 边界之后的残渣留在 buffer 里，等下一块数据来了再拼。
			 *   这样不管网络怎么切，事件永远是完整的。
			 *
			 * 【为什么正则写 /\r?\n\r?\n/】不同服务端的换行不一样：
			 *   Windows 风格是 \r\n\r\n，Unix 风格是 \n\n，两种都要认。
			 */
			const sep = /\r?\n\r?\n/;
			let m;
			while ((m = sep.exec(buffer)) !== null) {
				// 切出「一个完整事件」
				const rawEvent = buffer.slice(0, m.index);
				// 剩下的（还没结束的事件）留到下一轮
				buffer = buffer.slice(m.index + m[0].length);

				for (const line of rawEvent.split(/\r?\n/)) {
					const s = line.trim();
					// 只认 data: 开头的行，跳过 event: / id: / 空行
					if (!s.startsWith('data:')) continue;
					// slice(5) 去掉 'data:' 这 5 个字符
					const dataStr = s.slice(5).trim();
					// 空内容跳过；[DONE] 是服务端表示「说完了」的结束标记，要跳过
					if (!dataStr || dataStr === '[DONE]') continue;
					try {
						const json = JSON.parse(dataStr);
						const delta = json.choices && json.choices[0] && json.choices[0].delta;
						// 流式返回的是 delta（增量），非流式是 message（全量）
						const piece = delta && delta.content;
						if (piece) {
							content += piece;
							// 【关键】每收到一小段就回调出去，界面才能逐字显示
							if (onDelta) onDelta(piece);
						}
					} catch (e) {
						/* 半截 JSON，忽略，下一轮会补齐 */
						// 这里故意不报错：分包导致的解析失败是正常现象，不是 bug
					}
				}
			}
		}
		return {
			content,
			// 【为什么恒为空数组】流式只用在最后一轮「纯文字回答」，
			// 那一轮没带 tools，所以不可能有工具调用
			toolCalls: []
		};
	}
	// #endif

	/* ---------- 其他平台 / 不流式：一次拿完整结果 ---------- */
	/**
	 * @teach-23 走到这里说明两件事之一：
	 *   ① 平台不是 H5（App / 小程序），没有 fetch；
	 *   ② 虽然是 H5，但这次不需要流式（比如带工具的那几轮）。
	 *   所以用 uni.request 一次性拿完整响应。
	 */
	const data = await new Promise((resolve, reject) => {
		uni.request({
			url,
			method: 'POST',
			header: headers,
			data: payload,
			/**
			 * 【为什么这里给 60 秒，而普通接口只给 15 秒】
			 *   大模型要「思考」再输出，尤其带工具的时候，
			 *   一次往返 10~30 秒很正常。用 15 秒会大量误判成超时。
			 *   这个值是单独写死的，没有复用 config 里的 TIMEOUT——刻意的。
			 */
			timeout: 60000,
			success: (res) => {
				if (res.statusCode === 200) return resolve(res.data || {});
				// OpenAI 规范的错误体是 { error: { message: '...' } }，优先取它，
				// 取不到就把整个响应当字符串塞进错误信息，方便排查
				const detail = res.data && res.data.error ? res.data.error.message : JSON
					.stringify(res.data || {});
				reject(new Error(`HTTP ${res.statusCode}：${detail}`));
			},
			fail: (err) => reject(new Error((err && err.errMsg) || '网络异常'))
		});
	});

	const msg = (data.choices && data.choices[0] && data.choices[0].message) || {};
	return {
		content: msg.content || '',
		toolCalls: msg.tool_calls || []
	};
}

/* ==========================================================================
   五、本地兜底：没 Key / 连不上时，用真实接口数据回答
   ========================================================================== */

/**
 * 关键词命中判断。
 *
 * @param {string} q 用户输入
 * @param {...string} words 任意多个关键词
 * @returns {boolean} 命中任意一个就 true
 *
 * 【语法】...words 是「剩余参数」，把所有后续参数收成一个数组：
 *   hits(q, '评论', '统计') → words = ['评论', '统计']
 *   配合 .some() 就是「有一个满足就返回 true」——相当于一堆 || 的简写。
 *
 * 【为什么用 indexOf 而不是 includes】
 *   兼容老引擎。indexOf(...) >= 0 和 includes(...) 效果一样，
 *   但早期小程序环境没有 includes。
 */
const hits = (q, ...words) => words.some((w) => q.indexOf(w) >= 0);

/**
 * 离线回答。它不是「假装 AI」，而是「关键词 + 真实数据 + 模板」，
 * 所以回答里的数字都是后端真数据。
 * @returns {Promise<String>} 回答文本
 *
 * 【和 AI 模式的关系】
 *   这里每个分支都复用 execTool()，也就是说：
 *   同一份数据、同一个取数逻辑，只是「组织语言」的部分由模板代替了模型。
 *   所以哪怕没 Key，屏幕上的数字也是真的。
 *
 * 【分支顺序就是优先级】从上往下第一个命中的就返回。
 *   比如「我的公益活动」会先命中「公益」而不是「我」，这是刻意的。
 */
export async function localAnswer(question) {
	const q = String(question || '');

	// 1. 数据分析类
	if (hits(q, '评论', '数据分析', '分析', '统计', '哪个月', '活跃')) {
		try {
			const r = await execTool('get_comment_stats');
			// 【语法】数组里放多行模板字符串，最后 join('\n') 拼成多行文本。
			// 比用 + 号拼一长串更好读，也不会漏掉换行
			return [
				`📊 2022 年新闻评论一共 ${r['2022年评论总数']} 条。`,
				`评论最多的月份是 ${r['评论最多的月份']}（${r['该月评论数']} 条）。`,
				`女性 ${r.女性分月.reduce((a, b) => a + b, 0)} 条 / 男性 ${r.男性分月.reduce((a, b) => a + b, 0)} 条。`,
				'（离线回答：数据来自后端 /api/data/comment/list）'
			].join('\n');
		} catch (e) {
			// 【为什么每个分支都要 try/catch】因为兜底模式本身就是「网络不好时」用的，
			// 这时候接口更可能失败。失败了给一句话，别让整个函数抛出去
			return `没查到评论数据：${e.message}`;
		}
	}

	if (hits(q, '阅读', '书', '书籍', '看什么')) {
		try {
			const r = await execTool('get_reading_stats');
			// slice(0,3) 取前三名，map 拼成「文学35.2%、科技20.1%」这种，再 join 成一行
			const top = r.类型排行.slice(0, 3).map((x) => `${x.类型}${x.占比}`).join('、');
			return [
				`📚 2022 年共阅读 ${r['2022年阅读总数']} 本，${r['阅读最多的月份']}读得最多。`,
				`书籍类型 ${r.书籍类型数} 种，前三：${top}。`,
				'（离线回答：数据来自后端 /api/read/book/list/type）'
			].join('\n');
		} catch (e) {
			return `没查到阅读数据：${e.message}`;
		}
	}

	// 2. 公益/报名
	if (hits(q, '报名', '公益', '活动', '志愿')) {
		try {
			/**
			 * 【语法】Promise.all 同时跑两个工具：
			 *   一个查「有哪些活动」，一个查「我报了哪些」。
			 *   两者互不依赖，并行能省一半时间。
			 *   解构 [list, mine] 按顺序接收两个结果。
			 */
			const [list, mine] = await Promise.all([execTool('get_activity_list', {
				pageSize: 5
			}), execTool('get_my_applications')]);
			const names = (list.列表 || []).map((a, i) => `${i + 1}. ${a.activityName}（已报名 ${a.applyNum} 人）`).join(
				'\n');
			return [
				`现在有 ${list.总数} 个公益活动：`,
				names || '暂时没有活动',
				'',
				`你已报名 ${mine.我的报名条数} 个。想报名就进「公益」页，点活动卡片的「报名」。`,
				'（离线回答：数据来自后端 /api/activity/list）'
			].join('\n');
		} catch (e) {
			return `没查到活动数据：${e.message}`;
		}
	}

	// 3. 楷模 / 英雄
	if (hits(q, '楷模', '模范', '新闻')) {
		try {
			const r = await execTool('search_model_news', {
				pageSize: 5
			});
			return [`共 ${r.总数} 条楷模新闻：`, (r.列表 || []).map((n, i) => `${i + 1}. ${n.title}（${n.name}）`).join('\n')]
				.join('\n');
		} catch (e) {
			return `没查到楷模新闻：${e.message}`;
		}
	}

	if (hits(q, '英雄', '事迹')) {
		try {
			const r = await execTool('search_hero_story', {
				pageSize: 5
			});
			return [`共 ${r.总数} 篇英雄故事：`, (r.列表 || []).map((h, i) => `${i + 1}. ${h.title} — ${h.name}`).join('\n')]
				.join('\n');
		} catch (e) {
			return `没查到英雄故事：${e.message}`;
		}
	}

	// 4. 学习 / 笔记
	if (hits(q, '学习', '笔记', '心得', '感言')) {
		try {
			const r = await execTool('get_study_summary');
			return [
				`你的学习历史共 ${r.学习历史条数} 条，其中 ${r.带笔记的条数} 条写了笔记。`,
				'最近学的：' + ((r.最近内容 || []).map((x) => x.title).join('、') || '暂无'),
				'在「心得」页可以发学习感言、给每条学习内容加笔记。',
				'（离线回答：数据来自后端 /api/history/list）'
			].join('\n');
		} catch (e) {
			return `没查到学习数据：${e.message}`;
		}
	}

	// 5. 我的
	if (hits(q, '我', '账号', '资料', '余额')) {
		try {
			const u = await execTool('get_user_profile');
			return [`你现在登录的是「${u.昵称 || u.账号}」，账号 ${u.账号}，性别 ${u.性别}，余额 ${u.余额 || 0} 元。`].join('');
		} catch (e) {
			return `没查到用户信息：${e.message}`;
		}
	}

	// 6. 兜底：介绍能力
	// 【这一条很重要】用户问的话一个关键词都没命中时，不能回「我不知道」，
	// 而要告诉他「你能问我什么」。这相当于一个会说话的功能菜单。
	return [
		'我是「数字生活」的智能助手小鲸 🐳',
		'现在没配置大模型 Key，我用的是本地数据问答，照样能查真数据。你可以问我：',
		'· 有哪些公益活动可以报名？',
		'· 2022 年评论数据怎么样？',
		'· 我的学习记录有几条？',
		'· 有哪些楷模新闻 / 英雄故事？',
		'. 查询「身边英雄」列表',
		'配好 Key 之后，我还能聊天、写文案、解释代码。'
	].join('\n');
}

/* ==========================================================================
   六、主入口：chat()
   ========================================================================== */

/**
 * 发一条消息，拿到回答。
 *
 * @param {Array}    history 历史消息（不含本次），形如 [{role:'user',content:'...'}]
 * @param {String}   question 本次提问
 * @param {Object}   handlers
 * @param {Function} handlers.onDelta    流式增量文字
 * @param {Function} handlers.onTool     开始调用某个工具时回调 (toolName)
 * @param {Function} handlers.onToolDone 工具调用结束 (toolName, 结果摘要)
 * @returns {Promise<{text:String, mode:'ai'|'local'}>}
 *
 * 【handlers 是干什么的】这是一个「回调包」：ai.js 不碰界面，
 *   它只在合适的时机喊一声（收到一段字了 / 要调工具了 / 调完了），
 *   由 ai.vue 决定怎么显示。这样引擎和界面彻底解耦。
 */
export async function chat(history, question, handlers = {}) {
	const {
		onDelta,
		onTool,
		onToolDone
	} = handlers;

	// 没 Key：直接走本地兜底
	if (!hasApiKey()) {
		const text = await localAnswer(question);
		if (onDelta) onDelta(text);
		return {
			text,
			mode: 'local'
		};
	}

	// 组装消息：system + 最近若干条历史 + 本次提问
	/**
	 * @teach-24 为什么是「两段式请求」？这是整个 AI 链路最关键的架构决定。
	 *
	 *   第一段：带 tools，非流式。目的是拿到 tool_calls（要调哪个函数、什么参数）。
	 *           为什么不能流式？因为流式返回的是「文字碎片」，
	 *           工具调用是一段结构化 JSON，流式解析它既麻烦又容易出错。
	 *
	 *   第二段：不带 tools，流式。目的是让最终回答一个字一个字蹦出来。
	 *           这一轮模型已经拿到所有数据，只需要组织语言。
	 *
	 *   两段各司其职，比「一个请求既要工具又要流式」稳得多。
	 */
	const messages = [{
			role: 'system',
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
			role: 'user',
			content: question
		}
	];

	try {
		// ---------- 第一段：带工具，最多来回 maxToolRounds 轮 ----------
		// directAnswer：模型第一轮就直接给了答案的情况。这时候不用再发第二遍请求，
		// 省一次往返、也省 token（大模型按量收费，别白花钱）。
		let directAnswer = '';

		/**
		 * @teach-20 为什么要设轮数上限？
		 *   模型有可能陷入「调一个工具 → 觉得不够 → 再调一个」的循环，
		 *   每一轮都是一次完整的 API 调用（要花钱、要等时间）。
		 *   万一它认定「必须再查一次」而永远不满足，没有上限就会一直烧下去。
		 *   for 循环天然带边界，3 轮之后就跳出去，用已有信息硬着头皮回答。
		 */
		for (let round = 0; round < AI.maxToolRounds; round++) {
			const res = await callModel(messages, {
				tools: true,
				stream: false
			});
			const toolCalls = res.toolCalls || [];

			// 没有工具调用 → 说明模型想直接回答
			if (!toolCalls.length) {
				// 只有「第一轮就直接答」才值得省掉第二遍请求；
				// 如果已经调过工具，说明还得让它基于数据再组织一次语言
				if (round === 0 && res.content) directAnswer = res.content;
				break;
			}

			// 把模型的「我要调工具」这条消息原样放回对话
			// 【为什么必须放回去】下一轮模型要靠这条消息知道「我上一轮要求调什么」，
			// 不放回去它会以为自己的请求没被响应，可能重复要求
			messages.push({
				role: 'assistant',
				content: res.content || '',
				tool_calls: toolCalls
			});

			// 逐个真的去请求后端
			for (const call of toolCalls) {
				const name = call.function && call.function.name;
				let args = {};
				/**
				 * 【为什么 arguments 是字符串要 JSON.parse】
				 *   OpenAI 协议里 arguments 是「JSON 字符串」而不是对象，
				 *   因为它可能是不完整的流式片段。这里必须解析。
				 *   外面套 try/catch：模型偶尔会给出非法 JSON，
				 *   解析失败就当「没传参数」，总比整轮崩掉好。
				 */
				try {
					args = JSON.parse((call.function && call.function.arguments) || '{}');
				} catch (e) {
					args = {};
				}
				// 通知界面：开始查了（界面上那个「正在调用工具…」的标签就是它）
				if (onTool) onTool(name);
				const result = await execTool(name, args);
				if (onToolDone) onToolDone(name, result);
				/**
				 * 【role: 'tool' 这条消息是什么】
				 *   它是「工具的执行结果」回执，必须带上 tool_call_id，
				 *   模型才知道这个结果是回应哪一次调用的。
				 *   content 必须是字符串，所以把对象 JSON.stringify 一下。
				 */
				messages.push({
					role: 'tool',
					tool_call_id: call.id,
					name,
					content: JSON.stringify(result)
				});
			}
		}

		// 第一轮就直接拿到答案：交给界面显示，不再多发一次请求
		/**
		 * @teach-25 这个小优化值多少钱？
		 *   用户问「你能干什么」这种不需要查数据的问题时，
		 *   模型第一轮就直接答了。如果不做这个判断，还要再发一次请求拿同样的答案——
		 *   多花一次 token、多等 2~5 秒。加了这 5 行，体验立刻不一样。
		 */
		if (directAnswer) {
			if (onDelta) onDelta(directAnswer);
			return {
				text: directAnswer,
				mode: 'ai'
			};
		}

		// ---------- 第二段：不带工具，流式输出最终回答 ----------
		// 先声明再按平台赋值：条件编译会把不匹配的那段整块删掉，
		// 但直接写两个 const 在标准解析器（编辑器/lint）里会报「重复声明」。
		let final;
		// #ifdef H5
		final = await callModel(messages, {
			tools: false,
			stream: true,
			onDelta
		});
		// #endif
		// #ifndef H5
		final = await callModel(messages, {
			tools: false,
			stream: false
		});
		// 非流式拿到的是一整段，一次性推给界面，视觉上和流式收尾一样
		if (final.content && onDelta) onDelta(final.content);
		// #endif

		return {
			text: final.content,
			mode: 'ai'
		};
	} catch (e) {
		// 出错也兜底，别把红色报错甩给用户
		/**
		 * 【这段 if 在干什么】把内部错误码翻译成给人看的说明：
		 *   NO_KEY        → 空字符串（这种情况本来就不该提示，走了本地模式）
		 *   CROSS_ORIGIN  → 「（浏览器跨域被拦）」直接告诉用户真实原因
		 *   其他           → 「（具体错误信息）」
		 */
		const reason = e.message === 'NO_KEY' ? '' : e.message === 'CROSS_ORIGIN' ? '（浏览器跨域被拦）' : `（${e.message}）`;
		let text;
		try {
			text = await localAnswer(question);
		} catch (e2) {
			// 连兜底都失败了（真断网），给一句人话，而不是把异常抛出去
			text = `抱歉，我这边暂时连不上服务，也没查到数据${reason}。稍后再试一次吧。`;
		}
		// 【为什么要加前缀】让用户明确知道「你现在看到的不是大模型答的」，
		// 避免把本地模板回答误当成 AI 的智能表现
		text = `⚠️ 大模型没连上${reason}，先用本地数据回答你：\n\n${text}`;
		if (onDelta) onDelta(text);
		return {
			text,
			mode: 'local'
		};
	}
}

/* ==========================================================================
   七、给「设置」弹层用的小工具
   ========================================================================== */

/**
 * 测试连接（设置弹层里那个「测试」按钮）。
 *
 * @returns {Promise<string>} 模型回复的文本，成功时给界面弹个「连接成功」
 *
 * 【为什么用这么小的请求】只发两句话、不带工具、不流式，
 *   是最省 token 的一次真实调用。目的只是验证「Key 对不对、网络通不通」，
 *   没必要问它一个真问题。
 *
 * 【语法】Promise.reject(new Error(...)) 是「立刻返回一个失败的 Promise」，
 *   等价于在 async 函数里 throw。调用方用 .catch 或 try/catch 都能接住。
 */
export function testConnection() {
	const {
		apiKey
	} = getAISettings();
	if (!apiKey) return Promise.reject(new Error('还没填 API Key'));
	return callModel(
		[{
				role: 'system',
				content: '只回一个字：好'
			},
			{
				role: 'user',
				content: '在吗'
			}
		], {
			tools: false,
			stream: false
		}
	).then((r) => r.content || '连接正常');
}

/**
 * 【为什么单独把 TOOLS 导出去】它本来只在文件内部用。
 *   导出来是为了调试和文档：可以在控制台打印工具表、
 *   也可以让 PPT/文档直接引用这份「能力清单」，不用手抄。
 */
export {
	TOOLS
};
