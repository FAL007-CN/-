# DEEP 智慧生活

一个移动应用开发课程作业项目，基于 HBuilderX + mui 框架开发的校园生活服务 App。

## 功能

- **首页**：轮播图、便民服务快捷入口、实时资讯/新闻列表
- **服务**：便民服务分类
- **个人中心**：用户信息展示
- **物流**：物流查询（对接后端 API）

## 技术栈

- HBuilderX
- mui 框架（HTML5+ / 5+ App）
- 原生 HTML / CSS / JavaScript

## 目录结构

```
DEEP/
├── css/          # 样式表（first-1.css 为全站统一样式）
├── html/         # 页面（first、fuwu、user、wuliu、wuliuxiangqing）
├── js/           # JavaScript 脚本（mui.js）
├── images/       # 图片资源
├── fonts/        # 字体
├── manifest.json # 应用配置
└── index.html    # 入口页面
```

## 运行方式

1. 用 HBuilderX 打开项目
2. 运行到浏览器 / 运行到手机或模拟器

## 说明

- 后端 API 地址在代码中硬编码，如需修改请在各 html 文件的 `<script>` 中调整 `baseUrl`
- 样式已统一收拢到 `css/first-1.css`，按页面分区管理
