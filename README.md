AI 陪伴聊天网页应用
在本地浏览器运行的开放式AI陪伴对话项目，无固定剧本，角色人设、视觉素材全部由用户自定义。
<img width="1704" height="973" alt="image" src="https://github.com/user-attachments/assets/2c609bfe-30a0-4162-bfc4-e4ad293dbc2a" />

✨ 项目简介
这是一款本地运行的乙女向AI陪伴聊天网页。
角色会记住对话上下文，支持语音朗读，在交互中给出贴合人设的实时回复。
区别于传统乙女游戏固定剧情，所有对话内容由大模型实时生成，故事走向不受预设脚本限制。

你可以：
- 自定义角色：姓名、职业、性格、说话风格、与你的关系
- 自主上传立绘、背景图作为场景素材
- 和角色实时对话，角色可语音朗读回复
- 为每个角色独立保存专属聊天记录
<img width="1185" height="605" alt="image" src="https://github.com/user-attachments/assets/ca741535-c96b-4756-a204-09bcf5291dc9" />

🎯 核心特色
- 动态对话：全部回复由大模型实时生成，无硬编码台词
- 自由人设：角色的性格、语气、关系阶段均可自定义配置
- 素材自主管理：项目不内置图片资源，立绘/背景由用户自行上传，规避版权问题
- 角色隔离：每个角色卡拥有独立聊天上下文，互不干扰
- 语音能力：基于 Edge TTS 实现角色语音朗读；支持麦克风语音输入
- 多主题与国际化：内置5套界面主题，支持中英文一键切换

 🛠️ 环境要求
- Node.js 18+
- Python 3.9+（仅语音合成需要）
> 安装Edge-TTS：
   pip3 install edge-tts
   > 若未配置 Python 与 edge-tts，语音功能失效，其余功能可正常使用。

🚀 本地启动（要在终端中进入项目文件）
安装前端&后端依赖
npm install

终端1：启动后端服务
npx tsx server/index.ts

终端2：启动前端开发服务（开一个新的终端）
npm run dev


⚙️ API 配置
无需修改源码、无需手动维护.env文件，全部配置在网页内完成：
1. 打开网页，点击输入栏「设置」
2. 填入 API Key、Base URL、Model名称
3. 保存，配置存入浏览器本地存储，刷新页面不会丢失
<img width="503" height="423" alt="image" src="https://github.com/user-attachments/assets/63b8d9f1-3366-4299-96e2-b04b14d97679" />

> 示例配置参考：
- DeepSeek
  - Base URL: `https://api.deepseek.com`
  - Model: `deepseek-chat`
- Moonshot
  - Base URL: `https://api.moonshot.cn`
  - Model: `moonshot-v1-8k`
- OpenAI
  - Base URL: `https://api.openai.com`
  - Model: `gpt-4o-mini`


🎮 使用指引
1. 新建角色：打开角色设定面板 → + New，填写人设信息后保存
2. 切换 / 编辑角色：单击角色名切换；右键角色卡片进入编辑
3. 素材上传
   - 立绘库：上传透明 PNG 立绘
   - 背景库：上传 JPG/PNG 背景图
4. 场景操作
   - 双击立绘，鼠标移动，单击放置到场景
   - 鼠标滚轮：缩放场景中立绘大小


✨ Prompt 与运行优化

Prompt 版本管理
内置多个 Prompt 版本，可随时切换：
- v1：基础版，只有角色设定和基础规则
- v2：Few-shot 版，加入示例对话，角色语气更稳定
- v3：强约束版，限制输出长度、禁止括号动作

上下文策略
支持两种上下文策略：
- 全量：发送全部历史对话，记忆完整，但 Token 随对话增长
- 滑动窗口：只保留最近 N 条消息，Token 稳定，窗口大小可调

通过 A/B 测试，推荐窗口 6（保留 3 轮完整对话）。
运行统计
内置统计看板，记录调用量、输入 / 输出 Token、平均延迟、失败率、最近请求明细，以及模型、角色和 Prompt 版本的使用分布，支持一键清空。
评测报告
基于 10 条测试集，对 3 个 Prompt 版本和 3 种上下文策略做了对比实验。主要结论：
- v2 在保持零出戏的前提下，综合成本最低
- 窗口 6 将长对话输入 Token 稳定在 450 左右，节省约 23% 成本
详见 [eval/README.md](eval/README.md)。

🔒 隐私说明
1. 项目不自带任何图片素材
2. API Key 仅保存在浏览器localStorage，不会上传到项目服务端
3. 角色卡、聊天记录、上传素材全部存储在用户本地浏览器
4. 项目本身不会主动上传任何用户数据；使用第三方大模型 API 时，对话内容会提交至对应服务商
