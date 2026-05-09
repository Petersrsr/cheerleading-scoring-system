# 啦啦操评分系统

一个基于 Web 的啦啦操实时评分与数据分析系统，支持多组互评、实时数据可视化和 AI 智能点评。

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg)

## 功能特性

- **教师控制台** — 配置分组、控制评分轮次、一键生成 AI 分析报告
- **学生评分页** — 5 个维度滑块打分（节奏感/动作整齐度/团队配合/表现力/创新性）
- **数据大屏** — 16:9 全屏展示，柱状图 + 雷达图 + 实时排名
- **AI 智能分析** — 基于小米 MiMo 大模型，生成专业点评与改进建议
- **AI 对话** — 生成报告后可连续对话，AI 记住评分数据和报告内容
- **语音输入** — 支持语音转文字输入（基于 Web Speech API）
- **实时同步** — WebSocket 实时推送，评分数据即时更新
- **灵活配置** — 支持 2-10 组自定义分组

## 快速开始

### 环境要求

- Node.js >= 18
- npm 或 yarn

### 安装运行

```bash
# 克隆仓库
git clone https://github.com/Petersrsr/cheerleading-scoring-system.git
cd cheerleading-scoring-system

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API Key

# 启动服务
npm start
```

服务启动后访问 `http://localhost:3000`

### 环境变量

| 变量名 | 说明 | 必填 |
|--------|------|------|
| `AI_API_KEY` | 小米 MiMo API Key | 是 |

### Docker 部署（可选）

```bash
docker build -t cheerleading-system .
docker run -p 3000:3000 cheerleading-system
```

## 使用流程

```
1. 教师打开「教师端」
   ↓
2. 配置分组名称（如：第一组、第二组...）
   ↓
3. 打开「数据大屏」投屏到大屏幕
   ↓
4. 学生打开「学生评分」选择自己的组
   ↓
5. 教师选择当前表演组，点击「开始评分」
   ↓
6. 其他组学生通过滑块打分并提交
   ↓
7. 教师点击「结束本轮」，进入下一组
   ↓
8. 全部完成后，点击「生成 AI 报告」
   ↓
9. 可继续与 AI 对话，询问改进建议等问题
```

### AI 对话功能

生成报告后，可以与 AI 进行连续对话：
- AI 会记住评分数据和报告内容
- 支持追问"如何提升第一组？"、"哪个组最弱？"等问题
- 支持语音输入（点击麦克风图标）

## 评分维度

| 维度 | 说明 | 分值范围 |
|------|------|----------|
| 节奏感 | 跟随音乐节奏的能力 | 1-10 分 |
| 动作整齐度 | 动作统一规范程度 | 1-10 分 |
| 团队配合 | 成员间协作默契 | 1-10 分 |
| 表现力 | 舞台感染力和自信 | 1-10 分 |
| 创新性 | 编排创意 | 1-10 分 |

## 技术栈

| 技术 | 用途 |
|------|------|
| Node.js + Express | 后端服务 |
| Socket.IO | 实时双向通信 |
| Chart.js | 数据可视化图表 |
| 原生 HTML/CSS/JS | 前端界面 |
| 小米 MiMo API | AI 分析点评 |

## 项目结构

```
├── server.js              # 后端主文件（API + WebSocket）
├── package.json
├── public/
│   ├── index.html         # 首页（选择入口）
│   ├── teacher.html       # 教师控制台
│   ├── score.html         # 学生评分页
│   ├── dashboard.html     # 数据大屏
│   └── css/
│       └── style.css      # 全局样式
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/session` | 获取会话状态 |
| POST | `/api/session` | 创建/更新分组 |
| POST | `/api/score` | 提交评分 |
| POST | `/api/round` | 开始评分轮次 |
| POST | `/api/endRound` | 结束评分轮次 |
| GET | `/api/results` | 获取评分结果 |
| POST | `/api/analyze` | AI 生成分析报告 |
| POST | `/api/chat` | AI 对话（支持上下文） |
| POST | `/api/chat/clear` | 清空对话历史 |
| POST | `/api/reset` | 清空所有数据 |

## 屏幕适配

- **教师端 / 学生端** — 平板横屏 16:9 优化
- **数据大屏** — 投影仪/大屏幕 16:9 全屏展示，无需滚动

## 许可证

MIT License

## 致谢

- [Chart.js](https://www.chartjs.org/) — 优秀的图表库
- [Socket.IO](https://socket.io/) — 实时通信框架
- [小米 MiMo](https://xiaomi.com) — AI 大模型支持
