require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(cors());
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 会话状态
let session = null;

function createSession(groups) {
  if (!Array.isArray(groups) || groups.length < 2) return null;
  const scores = {};
  const teacherScores = {};
  groups.forEach((_, i) => {
    scores[i] = {};
    teacherScores[i] = null; // 教师评分初始化为null
  });
  session = {
    id: 'class1',
    groups,
    currentRound: 0,
    currentPerformer: -1,
    scores,
    teacherScores,
    status: 'waiting',
    createdAt: new Date()
  };
  return session;
}

function resetSession() {
  if (session) {
    createSession(session.groups);
  }
}

// 获取会话状态
app.get('/api/session', (req, res) => {
  if (!session) {
    return res.json({ id: null, groups: [], status: 'empty' });
  }
  res.json({
    id: session.id,
    groups: session.groups,
    currentRound: session.currentRound,
    currentPerformer: session.currentPerformer,
    status: session.status
  });
});

// 创建/更新会话（配置分组）
app.post('/api/session', (req, res) => {
  const { groups } = req.body;
  if (!Array.isArray(groups) || groups.length < 2) {
    return res.status(400).json({ error: '至少需要2个组' });
  }
  if (groups.length > 10) {
    return res.status(400).json({ error: '最多10个组' });
  }
  if (groups.some(g => typeof g !== 'string' || !g.trim())) {
    return res.status(400).json({ error: '组名不能为空' });
  }
  if (groups.some(g => g.trim().length > 20)) {
    return res.status(400).json({ error: '组名不能超过20个字符' });
  }
  createSession(groups.map(g => g.trim()));
  res.json({ success: true, session: { id: session.id, groups: session.groups } });
});

// 清空所有数据（重置分数，保留分组）
app.post('/api/reset', (req, res) => {
  if (!session) {
    return res.status(400).json({ error: '没有会话' });
  }
  resetSession();
  io.emit('sessionReset');
  res.json({ success: true });
});

// 提交评分
app.post('/api/score', (req, res) => {
  const { scorerGroup, targetGroup, scores } = req.body;

  if (!session) {
    return res.status(400).json({ error: '没有会话' });
  }
  if (session.status !== 'scoring') {
    return res.status(400).json({ error: '当前不是评分时段' });
  }

  // 验证输入
  if (typeof scorerGroup !== 'number' || scorerGroup < 0 || scorerGroup >= session.groups.length) {
    return res.status(400).json({ error: '无效的评分组' });
  }
  if (typeof targetGroup !== 'number' || targetGroup < 0 || targetGroup >= session.groups.length) {
    return res.status(400).json({ error: '无效的表演组' });
  }
  if (scorerGroup === targetGroup) {
    return res.status(400).json({ error: '不能为自己的组打分' });
  }
  if (!Array.isArray(scores) || scores.length !== 5) {
    return res.status(400).json({ error: '评分数据格式错误' });
  }
  if (scores.some(s => typeof s !== 'number' || s < 1 || s > 10 || !Number.isInteger(s))) {
    return res.status(400).json({ error: '每项评分须为1-10的整数' });
  }

  session.scores[targetGroup][scorerGroup] = scores;

  // 通过WebSocket广播评分更新（不泄露评分者身份）
  io.emit('scoreUpdate', { targetGroup });

  res.json({ success: true });
});

// 教师评分
app.post('/api/teacher-score', (req, res) => {
  const { targetGroup, scores } = req.body;

  if (!session) {
    return res.status(400).json({ error: '没有会话' });
  }

  // 验证输入
  if (typeof targetGroup !== 'number' || targetGroup < 0 || targetGroup >= session.groups.length) {
    return res.status(400).json({ error: '无效的表演组' });
  }
  if (!Array.isArray(scores) || scores.length !== 5) {
    return res.status(400).json({ error: '评分数据格式错误' });
  }
  if (scores.some(s => typeof s !== 'number' || s < 1 || s > 10 || !Number.isInteger(s))) {
    return res.status(400).json({ error: '每项评分须为1-10的整数' });
  }

  session.teacherScores[targetGroup] = scores;

  io.emit('scoreUpdate', { targetGroup });
  res.json({ success: true });
});

// 开始新一轮
app.post('/api/round', (req, res) => {
  const { performerIndex } = req.body;

  if (!session) {
    return res.status(400).json({ error: '没有会话' });
  }
  if (typeof performerIndex !== 'number' || performerIndex < 0 || performerIndex >= session.groups.length) {
    return res.status(400).json({ error: '无效的表演组' });
  }
  if (session.status === 'scoring') {
    return res.status(400).json({ error: '当前轮次尚未结束' });
  }

  session.currentPerformer = performerIndex;
  session.currentRound++;
  session.status = 'scoring';

  io.emit('roundStart', {
    performerIndex,
    performerName: session.groups[performerIndex],
    round: session.currentRound
  });

  res.json({ success: true, round: session.currentRound });
});

// 结束评分轮次
app.post('/api/endRound', (req, res) => {
  if (!session) {
    return res.status(400).json({ error: '没有会话' });
  }
  if (session.status !== 'scoring') {
    return res.status(400).json({ error: '当前没有进行中的轮次' });
  }

  session.status = 'waiting';
  io.emit('roundEnd');
  res.json({ success: true });
});

// 获取结果数据
app.get('/api/results', (req, res) => {
  if (!session) {
    return res.json({ session: null, results: [] });
  }

  const dimensions = ['节拍清晰', '层次变化准确', '动作质量', '音乐融合自然', '小组配合整齐'];

  const results = session.groups.map((groupName, groupIndex) => {
    const scoresByOthers = Object.entries(session.scores[groupIndex] || {})
      .filter(([scorer]) => {
        const idx = parseInt(scorer);
        return Number.isInteger(idx) && idx !== groupIndex;
      })
      .map(([, s]) => s);

    const teacherScore = session.teacherScores[groupIndex];

    // 计算其他组平均分（每个维度）
    const peerAvgScores = dimensions.map((dim, dimIndex) => {
      const dimScores = scoresByOthers.map(s => s[dimIndex] || 0);
      return {
        dimension: dim,
        avg: dimScores.length > 0 ? dimScores.reduce((a, b) => a + b, 0) / dimScores.length : 0,
        scores: dimScores
      };
    });

    // 计算教师评分（每个维度）
    const teacherAvgScores = dimensions.map((dim, dimIndex) => ({
      dimension: dim,
      score: teacherScore ? teacherScore[dimIndex] || 0 : 0
    }));

    // 计算加权总分：其他组平均分×60% + 教师评分×40%
    const peerTotalAvg = peerAvgScores.reduce((a, b) => a + b.avg, 0) / peerAvgScores.length;
    const teacherTotalAvg = teacherScore ? teacherAvgScores.reduce((a, b) => a + b.score, 0) / teacherAvgScores.length : 0;

    // 加权计算：只有教师评分存在时才加权
    let totalAvg;
    if (teacherScore) {
      totalAvg = peerTotalAvg * 0.6 + teacherTotalAvg * 0.4;
    } else {
      totalAvg = peerTotalAvg; // 没有教师评分时，只算其他组平均
    }

    return {
      groupIndex,
      groupName,
      avgScores: peerAvgScores,
      teacherScores: teacherAvgScores,
      teacherHasScore: !!teacherScore,
      peerTotalAvg,
      teacherTotalAvg,
      totalAvg
    };
  });

  // 排名（深拷贝避免修改原数组）
  const ranked = results.map((r, i) => ({ ...r })).sort((a, b) => (b.totalAvg || 0) - (a.totalAvg || 0));
  ranked.forEach((r, i) => r.rank = i + 1);

  res.json({ session: { id: session.id, groups: session.groups, status: session.status }, results: ranked });
});

// AI分析接口
app.post('/api/analyze', async (req, res) => {
  if (!session) {
    return res.json({ analysis: '暂无会话数据。' });
  }

  // 检查 API Key
  if (!process.env.AI_API_KEY) {
    return res.status(500).json({ error: '未配置 AI API Key，请在 .env 文件中设置 AI_API_KEY' });
  }

  // 准备分析数据
  const analysisData = session.groups.map((groupName, groupIndex) => {
    const scoresByOthers = Object.entries(session.scores[groupIndex] || {})
      .filter(([scorer]) => {
        const idx = parseInt(scorer);
        return Number.isInteger(idx) && idx !== groupIndex;
      })
      .map(([, s]) => s);

    if (scoresByOthers.length === 0) return null;

    const dimensions = ['节拍清晰', '层次变化准确', '动作质量', '音乐融合自然', '小组配合整齐'];
    const avgScores = dimensions.map((dim, dimIndex) => {
      const dimScores = scoresByOthers.map(s => s[dimIndex] || 0);
      return {
        dimension: dim,
        avg: (dimScores.reduce((a, b) => a + b, 0) / dimScores.length).toFixed(2)
      };
    });

    const totalAvg = (avgScores.reduce((a, b) => a + parseFloat(b.avg), 0) / avgScores.length).toFixed(2);

    return { groupName, avgScores, totalAvg };
  }).filter(Boolean);

  if (analysisData.length === 0) {
    return res.json({ analysis: '暂无评分数据，请先进行评分。' });
  }

  const prompt = `你是专业的啦啦操评委，请根据评分数据给出详细点评。

各组得分数据：
${analysisData.map(g => `${g.groupName}: 总分${g.totalAvg}, ${g.avgScores.map(d => `${d.dimension}${d.avg}分`).join(', ')}`).join('\n')}

请输出JSON格式（只输出JSON，不要其他文字）：
{
  "overview": "2-3句话的整体点评，分析总体水平和共性问题",
  "groups": [
    {
      "name": "组名",
      "highlight": "2-3句话的亮点分析，结合具体得分说明为什么好",
      "improve": "2-3句话的改进建议，针对薄弱项给出具体训练方向"
    }
  ],
  "suggestion": "2-3句话的通用建议，给出可操作的提升方向"
}

要求：
- 语气专业但鼓励
- 结合具体分数分析，不要泛泛而谈
- 每段50-80字`;

  try {
    const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mimo-v2-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI API错误:', response.status, errText);
      return res.status(502).json({ error: `AI服务返回错误 (${response.status})` });
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message || {};
    const raw = message.content || message.reasoning_content || '';

    // 尝试解析JSON（匹配完整JSON对象，支持嵌套）
    try {
      const start = raw.indexOf('{');
      if (start !== -1) {
        let depth = 0;
        for (let i = start; i < raw.length; i++) {
          if (raw[i] === '{') depth++;
          if (raw[i] === '}') depth--;
          if (depth === 0) {
            const report = JSON.parse(raw.substring(start, i + 1));
            return res.json({ report });
          }
        }
      }
    } catch (e) {
      console.error('JSON解析失败:', e);
    }

    res.json({ raw });
  } catch (error) {
    console.error('AI分析错误:', error);
    res.status(500).json({ error: 'AI分析失败，请稍后重试' });
  }
});

// AI对话接口
const chatHistories = new Map(); // 存储对话历史
const chatContexts = new Map(); // 存储上下文（评分数据+报告）

app.post('/api/chat', async (req, res) => {
  const { sessionId, message, context } = req.body;

  if (!process.env.AI_API_KEY) {
    return res.status(500).json({ error: '未配置 AI API Key' });
  }
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: '消息不能为空' });
  }

  // 更新上下文（如果有）
  if (context) {
    chatContexts.set(sessionId, context);
  }

  // 获取或创建对话历史
  if (!chatHistories.has(sessionId)) {
    chatHistories.set(sessionId, []);
  }
  const history = chatHistories.get(sessionId);
  const ctx = chatContexts.get(sessionId) || {};

  // 构建系统提示（包含评分数据和报告）
  let systemPrompt = `你是一位专业的啦啦操评委和体育教学助手。用户是体育老师，正在查看啦啦操评分数据分析。
请用中文回答，语气专业但亲切。回答要简洁明了，每次回复控制在200字以内。`;

  if (ctx.scores) {
    systemPrompt += `\n\n当前评分数据：\n${ctx.scores}`;
  }
  if (ctx.report) {
    systemPrompt += `\n\n已生成的分析报告：\n${ctx.report}`;
  }

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10),
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch('https://api.xiaomimimo.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.AI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mimo-v2-flash',
        messages,
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI API错误:', response.status, errText);
      return res.status(502).json({ error: `AI服务返回错误 (${response.status})` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || '抱歉，我无法回答这个问题。';

    // 保存对话历史
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: reply });

    // 限制历史长度
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    res.json({ reply });
  } catch (error) {
    console.error('AI对话错误:', error);
    res.status(500).json({ error: 'AI对话失败，请稍后重试' });
  }
});

// 清空对话历史
app.post('/api/chat/clear', (req, res) => {
  const { sessionId } = req.body;
  chatHistories.delete(sessionId);
  res.json({ success: true });
});

// Socket.IO连接处理
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);
  socket.on('disconnect', () => {
    console.log('用户断开:', socket.id);
  });
});

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
