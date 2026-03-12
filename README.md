# TangrenPlusin for Obsidian

TangrenPlusin 是一款为 Obsidian 打造的综合功能增强插件，旨在通过一系列实用的微调和自动化功能来提升您的笔记工作流。

目前它主要解决了从 **Wolai** 等块式笔记系统导入数据后的结构痛点，并提供了自由的视觉控制。

## 🚀 主要功能

### 1. 文件夹自动打开 (Auto-open Wolai-style Folders)
针对特定的文件夹结构（文件夹名与内部唯一的 `.md` 文件名一致），实现“点击/双击”文件夹直接打开正文的功能。
- **自动识别**：智能匹配文件名与目录名。
- **干扰排除**：自动忽略 `image` 文件夹（无论其是否显示），确保在 Wolai 风格结构下依然能一键触达内容。

### 2. 视觉清理 (Visual Cleaning)
一键隐藏/显示文件列表中的特定资源目录。
- **全局隐藏**：默认支持匹配所有层级的 `image` 文件夹。
- **快接切换**：通过 Ribbon 图标、命令面板或快捷键即时切换。

### 3. 高度可配置
所有功能都可以在插件设置页面进行独立开关，满足不同场景下的需求。

## 🛠️ 安装说明

1. 在您的 Obsidian 库中创建目录：`.obsidian/plugins/obsidian-tangren-plusin/`。
2. 将以下文件放入该目录：
   - `main.js`
   - `manifest.json`
   - `styles.css`
3. 在 Obsidian 设置中启用 **TangrenPlusin**。

## 📈 未来规划
TangrenPlusin 作为一个通用增强包，未来将持续集成更多提升效率的功能，包括但不限于：
- 更多排版优化工具。
- 增强型文件管理自动化。
- 自定义样式注入。

## 📜 许可证
[MIT](LICENSE)

---
Developed by **Tangren**
