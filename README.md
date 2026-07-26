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

## 数据与同步

桌面版将数据保存为 `formula-studio-data.json`。默认位置是用户的“文档/Formula Studio”文件夹；可在“偏好设置”中选择其他路径，更换路径时当前数据会一起迁移。旧版浏览器本地数据会在首次启动时自动迁移。

“偏好设置”支持通过坚果云 WebDAV 同步。请在坚果云的第三方应用管理中生成应用密码，然后填写账号、应用密码和云端文件路径。密码使用 Electron `safeStorage` 加密保存，不会写入备份。启用自动同步后，应用会在本地保存后上传，并在启动时比较时间戳后选择较新副本。

侧栏中的“导出备份”和“导入备份”仍可用于手动迁移 JSON 数据。备份格式见 `BACKUP_FILE_SPEC.md`。

## VSCode 扩展

除 Codex 外，建议安装工作区推荐的 ESLint 和 Prettier。其他扩展不是运行或打包本项目的必要条件。
