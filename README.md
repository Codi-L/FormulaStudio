# 调香手记（Formula Studio）Windows 本地版

这是从调香手记 Sites 第 36 版迁移出的桌面项目。启动后直接进入工作区，不包含首页、用户登录或云端存储。

## 环境

- Windows 10/11（64 位）
- Node.js 22 LTS 或更高版本
- VSCode

## 在 VSCode 中运行

1. 打开本文件所在文件夹。
2. 在终端执行 `npm install`。
3. 执行 `npm run dev`。

## 生成 Windows 可执行程序

执行 `npm run dist`。安装版和便携版会生成到 `release` 文件夹。

## 数据

当前数据保存在应用内置浏览器的本地存储中，数据不会发送到服务器。侧栏中的“导出备份”和“导入备份”可用于迁移 JSON 数据。

后续接入坚果云时，建议在 Electron 主进程中增加基于本地 JSON/SQLite 文件的存储适配层，再同步用户选定的坚果云文件夹；现阶段未实现网络同步。

## VSCode 扩展

除 Codex 外，建议安装工作区推荐的 ESLint 和 Prettier。其他扩展不是运行或打包本项目的必要条件。
