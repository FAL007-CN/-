<template>
	<!-- 【模板】最外层负责两件事：定高度、当量尺寸的锚点（下面 query.select 找的就是它） -->
	<view class="dl-chart-wrap" :style="{ height: height + 'px' }">
		<!--
			【模板】canvas 有两个必须给的东西：
			  canvas-id —— 画布的「身份证」，后面 createCanvasContext(canvasId) 靠它找到这块画布
			  id        —— 普通元素 id，部分平台量尺寸要用
			两者都绑到同一个随机串上，保证一个页面画三张图也不会串。
		-->
		<canvas class="dl-chart-canvas" :canvas-id="canvasId" :id="canvasId" :style="{ height: height + 'px' }"></canvas>
		<!-- 【模板】没数据时盖一层「暂无数据」，不用把 canvas 藏起来（藏了尺寸就量不到了） -->
		<view v-if="empty" class="dl-chart-empty">
			<text>暂无数据</text>
		</view>
	</view>
</template>

<script setup>
/**
 * ============================================================================
 * 图表组件 dl-chart
 * ----------------------------------------------------------------------------
 * 【为什么手写 canvas 而不用 ECharts？】
 * 比赛机器不一定联网，ECharts 那么大个库也不一定装得上。
 * canvas 是浏览器/App 自带的画板，断网也能画。
 * 代价是：动画、交互、无障碍全得自己写——所以这里只做柱/折/饼三种最常用的。
 *
 * 【三种图怎么用】
 *   柱状图：<dl-chart type="bar"  :labels="months" :series="[{name,color,data},...]" />
 *   折线图：<dl-chart type="line" :labels="months" :data="[1,2,3...]" />
 *   饼状图：<dl-chart type="pie"  :items="[{name,value},...]" :height="250" />
 *
 * 【画图的通用套路（三种图一样）】
 *   1. 量出画布多大（宽度自适应屏幕）
 *   2. 算坐标范围（纵轴最大值得取得"好看"）
 *   3. 画底图（网格线、刻度、月份）
 *   4. 画数据（柱子 / 折线 / 扇形）
 *   最后一定别忘了 ctx.draw() —— 不调它就是一张白板。
 *
 * 【这是全项目唯一的自定义组件】
 *   所以 Vue3 的 defineProps / watch / getCurrentInstance 全在这个文件里出现，
 *   也全项目只有这一个文件用到它们。讲组件就讲这一个文件就够了。
 *
 * 【教学重点】
 *   @teach-26 props 数组默认值必须写成函数
 *   @teach-27 canvas-id 为什么每张图都要不一样
 *   @teach-28 getCurrentInstance + .in(instance) 到底在限定什么
 *   @teach-29 ctx.draw() 不调就是白板
 *   @teach-30 为什么这里需要 watch（全项目唯一一处）
 *   @teach-31 rpx 和 canvas 的 px 是两套单位
 *
 * 【对应 PPT】P23 / P24 / P25
 * ============================================================================
 */
import { ref, watch, onMounted, nextTick, getCurrentInstance } from 'vue';

/**
 * 组件的「入参」定义。
 *
 * @teach-26 为什么数组类型的默认值要写成箭头函数 () => []，不能直接写 []？
 *   因为 props 的默认值如果是对象/数组这种「引用类型」，直接写会出大问题：
 *   所有用这个组件的实例会共享同一个数组！
 *   A 图表往里 push 一条数据，B 图表也会莫名其妙多出来一条。
 *   写成函数，Vue 每次都会调用它、返回一个全新的数组，各用各的。
 *
 *   一句话记：默认值是「对象/数组」→ 必须用函数；是「字符串/数字/布尔」→ 直接写。
 *
 * 【props 是单向的】子组件只能读、不能改。本项目也没写 defineEmits，
 *   所以这个组件是纯「输入 → 画图」，不需要往外抛事件，最简单也最不容易出 bug。
 */
const props = defineProps({
	type: { type: String, default: 'bar' }, // bar | line | pie
	labels: { type: Array, default: () => [] },
	series: { type: Array, default: () => [] },
	data: { type: Array, default: () => [] },
	items: { type: Array, default: () => [] },
	height: { type: Number, default: 220 }
});

/**
 * 拿到「当前组件实例」。
 *
 * @teach-28 这个实例是干什么用的？两个地方必须用它：
 *   ① createSelectorQuery().in(instance) —— 把「查节点」的范围限定在本组件内。
 *      不加 .in()，一个页面有三张图时会查到页面里第一个同名节点，
 *      结果三张图都按第一张的宽度画，或者干脆查不到（返回 null）。
 *   ② createCanvasContext(canvasId, instance) —— 让画布上下文绑定到本组件，
 *      否则多个实例会抢同一块画布，出现「画着画着串到另一张图上」。
 *
 * 【为什么要 .proxy】getCurrentInstance() 返回的是内部对象，
 *   对外暴露的那个（带 $el、$refs 的）在 .proxy 上。uni-app 的 API 要的就是它。
 */
const instance = getCurrentInstance();

/**
 * @teach-27 为什么 canvas-id 要加随机串？
 *   canvas-id 是画布的全局标识。如果写死成 'dlchart'，
 *   一个页面放三张图 → 三个 canvas 抢同一个 id →
 *   后画的覆盖先画的，看起来就是「只有一张图有内容」。
 *   用 Math.random().toString(36).slice(2, 9) 生成 7 位随机串拼上去，
 *   每张图各有一个 id，互不干扰。
 *
 * 【语法】toString(36) 是转成 36 进制（0-9 + a-z），
 *   比十进制短很多，适合做短随机串；slice(2,9) 去掉开头的「0.」再取 7 位。
 */
const canvasId = 'dlchart' + Math.random().toString(36).slice(2, 9);
const empty = ref(false);

// 配色表：饼图按顺序取色，超过 8 个就循环复用
const PALETTE = ['#1e88e5', '#ec407a', '#26a69a', '#ffa726', '#7e57c2', '#66bb6a', '#ef5350', '#8d6e63'];
const AXIS_COLOR = '#e0e0e0';
const TEXT_COLOR = '#777777';

/* ------------------------------------------------------ 衡量文字宽度 */

/**
 * 估算一段文字的宽度（canvas 里排版图例要算位置）。
 * 中文一个字约等于字号，英文数字约 0.55 个字号。
 *
 * 【为什么需要估算】canvas 没有「测量文字宽度」的同步方法
 *   （measureText 在部分端上是异步的），而图例要「从右往左依次排」，
 *   必须提前知道每段文字大概多宽，才能算出每块的 x 坐标。
 *   这里用经验系数估一下，误差在几个像素内，肉眼看不出。
 *
 * 【语法】for...of 遍历字符串，拿到的是「一个字符」而不是下标，
 *   对中文/emoji 都友好（用 for(let i...) 配 str[i] 在部分场景会拆错）。
 */
function estWidth(str, size) {
	let w = 0;
	for (const ch of String(str)) {
		// 正则 [\u4e00-\u9fa5] 是常用汉字的 Unicode 区间
		w += /[\u4e00-\u9fa5]/.test(ch) ? size : size * 0.55;
	}
	return w;
}

/**
 * 算一个"好看的纵轴最大值"。
 * 比如最大值 327，纵轴取 500 更好看（刻度 0/125/250/375/500），而不是 327。
 *
 * 【为什么要这一步】直接把最大值当纵轴上限，会出现两种情况：
 *   ① 刻度变成 327/4 = 81.75 这种小数，标签丑；
 *   ② 柱子顶端正好贴着画布上边缘，看着很挤。
 *   所以把上限「取整到 1/2/2.5/5/10 这几个好数的倍数」，
 *   刻度就能整除得漂亮，柱子也留出一点余量。
 *
 * 【语法】Math.log(max) / Math.LN10 就是「以 10 为底的对数」，
 *   Math.log 在 JS 里是自然对数（以 e 为底），没有 log10 的老环境就得这么换算。
 */
function niceMax(max) {
	if (max <= 0) return 10;
	// exp = 数量级，比如 327 → 100，48 → 10
	const exp = Math.pow(10, Math.floor(Math.log(max) / Math.LN10));
	// 候选倍数表，从好看到不好看排列
	const steps = [1, 2, 2.5, 5, 10];
	for (let i = 0; i < steps.length; i++) {
		if (max <= steps[i] * exp) return steps[i] * exp;
	}
	return 10 * exp;
}

/* ---------------------------------------------------------- 三个画图函数 */

/**
 * 画横向网格线 + 纵轴刻度数字。
 *
 * @param ctx  画布上下文
 * @param box  绘图区（left/top/width/height/right/bottom）
 * @param max  纵轴上限（已经过 niceMax 处理）
 *
 * 【为什么坐标里全是 +0.5】
 *   canvas 画 1px 线条时，如果坐标是整数，线会跨在两个像素中间，
 *   渲染出来是 2px 的灰糊糊一条。加 0.5 让它正好落在像素中心，线条才清晰。
 *   这是 canvas 绘图的经典小技巧。
 */
function drawGrid(ctx, box, max) {
	const ticks = 4;
	ctx.setFontSize(10);
	ctx.setTextAlign('right');
	ctx.setTextBaseline('middle');
	for (let i = 0; i <= ticks; i++) {
		// y 从底部往上算：i=0 在底部（0），i=ticks 在顶部（max）
		const y = box.bottom - (box.height * i) / ticks;
		ctx.setStrokeStyle(AXIS_COLOR);
		ctx.setLineWidth(1);
		ctx.beginPath();
		ctx.moveTo(box.left, y + 0.5);
		ctx.lineTo(box.left + box.width, y + 0.5);
		ctx.stroke();
		ctx.setFillStyle(TEXT_COLOR);
		ctx.fillText(String(Math.round((max * i) / ticks)), box.left - 5, y);
	}
}

/**
 * 画 X 轴标签（月份）和右上角图例。
 *
 * 【为什么要传 w】图例是从右边往左排的，得知道整体宽度才能算起点。
 */
function drawLabels(ctx, box, labels, seriesList, w) {
	ctx.setFontSize(9);
	ctx.setFillStyle(TEXT_COLOR);
	ctx.setTextAlign('center');
	ctx.setTextBaseline('top');
	// 每个标签占一格，画在格子的正中间
	const step = box.width / labels.length;
	for (let i = 0; i < labels.length; i++) {
		ctx.fillText(labels[i], box.left + step * (i + 0.5), box.bottom + 5);
	}

	// 右上角图例：从右往左排
	if (seriesList && seriesList.length) {
		ctx.setTextAlign('left');
		ctx.setFontSize(10);
		let lx = w - 8;
		// 【为什么倒着遍历】因为从右往左摆，最后一项在最右边，所以下标要从大到小
		for (let s = seriesList.length - 1; s >= 0; s--) {
			const text = seriesList[s].name;
			const tw = estWidth(text, 10);
			// 先减掉「文字宽 + 间距」，得到这一块的左边界
			lx -= tw + 18;
			// 小色块
			ctx.setFillStyle(seriesList[s].color);
			ctx.fillRect(lx, 4, 10, 10);
			// 色块右边写名字
			ctx.setFillStyle('#555555');
			ctx.fillText(text, lx + 13, 4);
		}
	}
}

/**
 * 画柱状图（支持多组数据并排）。
 *
 * 【绘图区为什么要留边距】left:40 是给左边的刻度数字留位置，
 *   top:22 是给右上角图例留位置，bottom 那 48 是给月份标签留位置。
 *   不留边距的话，数字会画到画布外面被裁掉。
 */
function drawBar(ctx, w, h) {
	const box = { left: 40, top: 22, width: w - 50, height: h - 48 };
	box.right = box.left + box.width;
	box.bottom = box.top + box.height;

	// 先扫一遍所有数据，找出最大值
	let max = 0;
	// 【语法】forEach 里用 (s.data || []) 兜底，防止某个系列没给 data
	props.series.forEach((s) => (s.data || []).forEach((v) => (max = Math.max(max, Number(v) || 0))));
	const top = niceMax(max);

	// 先画底图（网格、标签），再画数据——顺序不能反，否则数据会被网格线盖住
	drawGrid(ctx, box, top);
	drawLabels(ctx, box, props.labels, props.series, w);

	// 每个月占一格，柱子宽度按格宽算，并夹在 3~11px 之间
	const group = box.width / props.labels.length;
	const barW = Math.max(3, Math.min(11, group * 0.34));
	for (let i = 0; i < props.labels.length; i++) {
		const center = box.left + group * (i + 0.5);
		for (let s = 0; s < props.series.length; s++) {
			const v = Number(props.series[s].data[i]) || 0;
			// 高度按比例换算：值 / 上限 × 绘图区高度
			const bh = (box.height * v) / top;
			// 多组数据时，以格子中心为基准往两边散开
			const x = center - (props.series.length * barW) / 2 + s * barW;
			ctx.setFillStyle(props.series[s].color);
			// 【为什么宽要减 1】留 1px 缝隙，几根柱子挨着时能看出分界
			ctx.fillRect(x, box.bottom - bh, barW - 1, bh);
		}
	}
}

/**
 * 画折线图。
 *
 * 【和柱状图的区别】柱状图是每个点画一个矩形，
 *   折线图是「先把所有点算出来，再一笔连起来」，最后在每个点上画个空心圆点。
 */
function drawLine(ctx, w, h) {
	const box = { left: 40, top: 22, width: w - 50, height: h - 48 };
	box.right = box.left + box.width;
	box.bottom = box.top + box.height;

	let max = 0;
	props.data.forEach((v) => (max = Math.max(max, Number(v) || 0)));
	const top = niceMax(max);

	drawGrid(ctx, box, top);
	// 折线图只有一个数据系列，这里手动造一个假的 series 只为画图例
	drawLabels(ctx, box, props.labels, [{ name: '阅读数量', color: '#1e88e5' }], w);

	const step = box.width / props.labels.length;
	// 先把 12 个点全算出来，存成 [{x,y}, ...]
	const points = props.labels.map((_, i) => ({
		x: box.left + step * (i + 0.5),
		y: box.bottom - (box.height * (Number(props.data[i]) || 0)) / top
	}));

	ctx.setStrokeStyle('#1e88e5');
	ctx.setLineWidth(2);
	ctx.beginPath();
	// 【语法】三元判断：第一个点用 moveTo（抬笔移到那儿），后面的点用 lineTo（画线过去）
	points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
	// stroke 才会真的把这条路径画出来
	ctx.stroke();

	ctx.setFontSize(9);
	ctx.setTextAlign('center');
	ctx.setTextBaseline('bottom');
	points.forEach((p, i) => {
		// 先填一个白圆当底色，再描蓝边 —— 这样圆点能盖住下面的折线，看着干净
		ctx.setFillStyle('#ffffff');
		ctx.beginPath();
		// arc(圆心x, 圆心y, 半径, 起始角, 结束角)，Math.PI*2 就是画整圆
		ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
		ctx.fill();
		ctx.setStrokeStyle('#1e88e5');
		ctx.setLineWidth(1.5);
		ctx.stroke();
		// 在每个点上方标数值
		ctx.setFillStyle('#1e88e5');
		ctx.fillText(String(Number(props.data[i]) || 0), p.x, p.y - 4);
	});
}

/**
 * 画饼状图。
 *
 * @returns {boolean} 有没有画成（total 为 0 时返回 false，外层会显示「暂无数据」）
 *
 * 【饼图的数学】一个整圆是 2π 弧度。
 *   每一项占的角度 = 2π × (该项的值 / 总和)。
 *   从 -π/2 开始画，也就是从 12 点方向起笔，符合人的阅读习惯。
 */
function drawPie(ctx, w, h) {
	const list = props.items || [];
	let total = 0;
	list.forEach((it) => (total += Number(it.value) || 0));
	// 全是 0 就别画了，否则下面除 total 会得到 NaN
	if (!total) return false;

	const cx = w / 2;
	const cy = Math.min(88, h * 0.4);
	const r = Math.min(w * 0.28, 76);
	let start = -Math.PI / 2;

	list.forEach((it, index) => {
		const angle = (Math.PI * 2 * Number(it.value)) / total;
		ctx.beginPath();
		// 从圆心出发 → 画弧 → 闭合路径，这三步才是一个扇形
		ctx.moveTo(cx, cy);
		ctx.arc(cx, cy, r, start, start + angle);
		ctx.closePath();
		ctx.setFillStyle(PALETTE[index % PALETTE.length]);
		ctx.fill();
		// 白色描边把相邻扇形分开，不然同色系挨着会糊成一片
		ctx.setStrokeStyle('#ffffff');
		ctx.setLineWidth(1);
		ctx.stroke();

		// 太小的扇形（<8%）不标百分比，否则字会挤到扇形外面去
		if (Number(it.value) / total > 0.08) {
			const mid = start + angle / 2;
			ctx.setFillStyle('#ffffff');
			ctx.setFontSize(10);
			ctx.setTextAlign('center');
			ctx.setTextBaseline('middle');
			ctx.fillText(
				Math.round((Number(it.value) / total) * 100) + '%',
				// 用三角函数算扇形中心点：0.62 是从圆心往外走的位置比例
				cx + Math.cos(mid) * r * 0.62,
				cy + Math.sin(mid) * r * 0.62
			);
		}
		start += angle;
	});

	// 下方两列图例
	ctx.setTextAlign('left');
	ctx.setTextBaseline('middle');
	ctx.setFontSize(10);
	const colW = (w - 20) / 2;
	const legendTop = cy + r + 16;
	list.forEach((it, index) => {
		// 【语法】index % 2 决定放左列还是右列，Math.floor(index / 2) 决定第几行
		const col = index % 2;
		const row = Math.floor(index / 2);
		const x = 12 + col * colW;
		const y = legendTop + row * 18;
		ctx.setFillStyle(PALETTE[index % PALETTE.length]);
		ctx.fillRect(x, y - 5, 10, 10);
		ctx.setFillStyle('#555555');
		const percent = ((Number(it.value) / total) * 100).toFixed(1);
		ctx.fillText(it.name + ' ' + percent + '%', x + 14, y);
	});
	return true;
}

/* -------------------------------------------------------------- 渲染 */

/**
 * 完整渲染一次。整个组件的执行入口就是它。
 *
 * 【四步：量、拿、画、交】
 *   ① 量：createSelectorQuery 拿到外层 view 的实际宽度
 *   ② 拿：createCanvasContext 拿到这块画布的「画笔」
 *   ③ 画：按 type 分发到三个 draw 函数
 *   ④ 交：ctx.draw() 把排队的绘制指令真正提交上屏
 */
function render() {
	/**
	 * 【为什么整个函数包在 nextTick 里】
	 *   父组件传数据 → 子组件 re-render → DOM 更新，这一串是异步的。
	 *   如果不等 DOM 更新完就去量尺寸，量到的是「上一次」的宽度，
	 *   图就会画歪或者画出边界。
	 *   nextTick 就是「等这一轮 DOM 更新完成后再执行」。
	 *
	 * @teach-31 顺便说个单位问题：这里的 w 是 px（真实像素），
	 *   而页面样式里写的是 rpx（750rpx = 屏幕宽）。
	 *   canvas 内部一律按 px 算，所以量到什么就用什么，
	 *   千万别把 rpx 的数值直接丢给 canvas，否则在宽屏上会小一圈。
	 */
	nextTick(() => {
		/**
		 * @teach-28 .in(instance.proxy) 把查询范围限定在本组件。
		 *   不加这个，页面里三张图都会查到同一个节点（第一个），
		 *   于是三张图都按第一张的宽度画。
		 */
		const query = uni.createSelectorQuery().in(instance ? instance.proxy : null);
		query
			.select('.dl-chart-wrap')
			.boundingClientRect((rect) => {
				// 拿不到尺寸时兜一个 320，至少不会画成 0 宽
				const w = (rect && rect.width) || 320;
				const h = props.height;

				// ② 拿画笔：第二个参数把上下文绑定到本组件实例
				const ctx = uni.createCanvasContext(canvasId, instance ? instance.proxy : null);
				// 每次重绘先清空，否则新图会叠在旧图上
				ctx.clearRect(0, 0, w, h);

				// ③ 按类型分发。ok 表示「有没有东西可画」
				let ok = true;
				if (props.type === 'bar') {
					if (!props.labels.length || !props.series.length) ok = false;
					else drawBar(ctx, w, h);
				} else if (props.type === 'line') {
					if (!props.labels.length || !props.data.length) ok = false;
					else drawLine(ctx, w, h);
				} else {
					// 饼图内部自己判断（total 为 0 时返回 false）
					ok = drawPie(ctx, w, h);
				}
				empty.value = !ok;
				/**
				 * @teach-29 这一行不写，前面画的全白费。
				 *   canvas 是「命令式绘制」：fillRect / arc / fillText 只是把指令
				 *   放进一个队列，并没有真的画到屏幕上。
				 *   只有 ctx.draw() 才把队列一次性提交渲染。
				 *   忘了它 = 一张白板，而且控制台不报任何错，最难查。
				 */
				ctx.draw();
			})
			// exec() 才真正发起查询（前面都是「配置查询条件」）
			.exec();
	});
}

// 挂载完成后画第一次
onMounted(() => render());

/**
 * @teach-30 为什么这里需要 watch？而且全项目只有这一处？
 *
 * 【问题】onMounted 执行时，父组件的数据可能还没回来（接口是异步的）。
 *   这时候 props.labels 还是空数组，画出来就是「暂无数据」。
 *   等 1 秒后接口回来了，props 变了，但 onMounted 不会再执行——
 *   图就永远停在「暂无数据」上。
 *
 * 【解法】监听 props 变化，一变就重画。
 *   deep: true 是因为 labels / series / data 都是数组/对象，
 *   浅监听只能发现「数组被整体替换」，发现不了「数组里的元素变了」。
 *
 * 【为什么全项目只有这一处】因为其他页面的数据都是「进页面拉一次、直接渲染」，
 *   不需要监听。只有组件会遇到「父组件数据比子组件挂载晚」这个时序问题。
 *   这也是为什么「watch 不是生命周期」——它是用来处理数据变化的，不是用来做初始化的。
 */
watch(() => [props.labels, props.series, props.data, props.items], () => render(), { deep: true });
</script>

<style lang="scss" scoped>
/* 外层容器：撑满父级宽度，高度由 :style 动态给（props.height） */
.dl-chart-wrap {
	position: relative;
	width: 100%;
}

/* 画布本体：宽度 100% 自适应，display:block 去掉行内元素底部的空隙 */
.dl-chart-canvas {
	width: 100%;
	display: block;
}

/* 「暂无数据」浮层：绝对定位铺满，用 flex 居中 */
.dl-chart-empty {
	position: absolute;
	left: 0;
	right: 0;
	top: 0;
	bottom: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 24rpx;
	color: #999999;
}
</style>
