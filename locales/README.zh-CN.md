<a name="readme-top"></a>

<p align="center">
  <h1 align="center">Lamino</h1>
  <p align="center"><b>智能 LLM 工作区</b> — Orcest AI 生态系统的一部分</p>
</p>

<p align="center">
  <a href="https://llm.orcest.ai">在线实例</a> |
  <a href="https://orcest.ai">Orcest AI</a> |
  <a href="../LICENSE">许可证 (MIT)</a>
</p>

<p align="center">
  <a href='../README.md'>English</a> | <a href='./README.tr-TR.md'>Turkish</a> | <b>简体中文</b> | <a href='./README.ja-JP.md'>日本語</a> | <a href='./README.fa-IR.md'>فارسی</a>
</p>

这是一个全栈应用程序，可以将任何文档、资源或内容片段转换为上下文，以便任何大语言模型（LLM）在聊天期间作为参考使用。Lamino 与 **RainyModel** (rm.orcest.ai) 集成，实现跨免费、内部和高级提供商的智能 LLM 路由和自动回退。

### Orcest AI 生态系统

| 服务 | 域名 | 角色 |
|---------|--------|------|
| **Lamino** | llm.orcest.ai | LLM 工作区 |
| **RainyModel** | rm.orcest.ai | LLM 路由代理 |
| **Maestrist** | agent.orcest.ai | AI 代理平台 |
| **Orcide** | ide.orcest.ai | 云端 IDE |
| **Login** | login.orcest.ai | SSO 认证 |

## 功能特性

- 完全兼容 MCP
- 无代码 AI 代理构建器
- 多模态支持（封闭源和开源 LLM）
- 自定义 AI 代理
- 多用户实例支持和权限管理（Docker 版本）
- 简洁的聊天界面，支持拖放功能
- 100% 云部署就绪
- 兼容所有主流 LLM 提供商
- 由 **RainyModel** 提供智能 LLM 路由

## 自托管

Lamino 可通过 Docker 或 bare metal 部署。非 Docker 部署请参阅 [BARE_METAL.md](../BARE_METAL.md)。

## 开发环境设置

- `yarn setup` 填充所需的 `.env` 文件
- `yarn dev:server` 启动服务器
- `yarn dev:frontend` 启动前端
- `yarn dev:collector` 运行文档收集器

## 贡献

请参阅 [CONTRIBUTING.md](../CONTRIBUTING.md) 了解贡献指南。

---

本项目采用 [MIT](../LICENSE) 许可证。

[Orcest AI](https://orcest.ai) 生态系统的一部分。
