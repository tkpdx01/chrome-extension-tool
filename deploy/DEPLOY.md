# 离线专网分发指南

## 方案概述

企业策略 + 自建更新服务器 = 静默安装 + 自动升级，用户无感知。

## 前置条件

- 专网内一台 HTTP 服务器（nginx/Apache/Python http.server 都行）
- 管理员权限配置浏览器策略

## 1. 打包 CRX

```bash
# 首次打包（会生成 dist.pem 私钥，务必保存）
chrome --pack-extension=dist

# 后续版本打包（使用同一个私钥，保持 Extension ID 不变）
chrome --pack-extension=dist --pack-extension-key=dist.pem
```

**重要**: `dist.pem` 是私钥，决定了 Extension ID。丢失 = 无法升级，只能重新安装。

当前 Extension ID: `ednbiindfgafndjeijdaehpcidfgljml`

## 2. 部署到内网服务器

```
your-server/
  extensions/
    offline-capture.crx     ← CRX 文件
    update.xml              ← 更新清单
```

### update.xml 内容

```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='ednbiindfgafndjeijdaehpcidfgljml'>
    <updatecheck
      codebase='http://intranet.example.com/extensions/offline-capture.crx'
      version='0.1.0' />
  </app>
</gupdate>
```

升级时：只需更新 CRX 文件 + 修改 version 号，浏览器会自动检测并更新。

### Nginx 配置

```nginx
location /extensions/ {
    root /var/www;
    # CRX 文件的 MIME type
    types {
        application/x-chrome-extension crx;
        application/xml xml;
    }
}
```

## 3. 配置浏览器策略

### macOS (Edge/Chrome)

创建配置文件:

**Chrome**: `/Library/Managed Preferences/com.google.Chrome.plist`
**Edge**: `/Library/Managed Preferences/com.microsoft.Edge.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- 允许从内网安装扩展 -->
  <key>ExtensionInstallSources</key>
  <array>
    <string>http://intranet.example.com/extensions/*</string>
  </array>

  <!-- 强制安装（用户无法卸载） -->
  <key>ExtensionInstallForcelist</key>
  <array>
    <string>ednbiindfgafndjeijdaehpcidfgljml;http://intranet.example.com/extensions/update.xml</string>
  </array>
</dict>
</plist>
```

格式: `EXTENSION_ID;UPDATE_URL`

### Windows (组策略)

1. 下载 Chrome/Edge ADMX 模板
2. `gpedit.msc` → 计算机配置 → 管理模板 → Edge/Chrome → 扩展
3. 配置 "强制安装的扩展列表":
   ```
   ednbiindfgafndjeijdaehpcidfgljml;http://intranet.example.com/extensions/update.xml
   ```

### Linux

```bash
# Chrome
mkdir -p /etc/opt/chrome/policies/managed
cat > /etc/opt/chrome/policies/managed/offline-capture.json << 'EOF'
{
  "ExtensionInstallForcelist": [
    "ednbiindfgafndjeijdaehpcidfgljml;http://intranet.example.com/extensions/update.xml"
  ]
}
EOF

# Edge
mkdir -p /etc/opt/edge/policies/managed
# 同样的 JSON 内容
```

## 4. 升级流程

```
1. 修改 src/manifest.ts 中的 version: '0.2.0'
2. npm run build
3. chrome --pack-extension=dist --pack-extension-key=dist.pem
4. 上传新 dist.crx 到服务器 extensions/ 目录
5. 修改 update.xml 中的 version='0.2.0'
6. 等待浏览器自动检查更新（默认几小时一次）
   或者用户手动: edge://extensions → 更新
```

## 5. 简单方案（无策略管理）

如果无法配置企业策略，可以用"开发者模式 + 脚本"：

```bash
#!/bin/bash
# install.sh — 用户执行此脚本
DEST="$HOME/.offline-capture-extension"
mkdir -p "$DEST"
cp -r dist/* "$DEST/"
echo "扩展已复制到 $DEST"
echo "请打开浏览器扩展页面 → 开发者模式 → 加载已解压的扩展 → 选择 $DEST"
```

升级时用户重新运行脚本，然后在扩展页面点"重新加载"。

## 对比

| 方案 | 安装体验 | 升级体验 | 需要管理员 | 适合场景 |
|------|----------|----------|------------|----------|
| 企业策略 | 静默安装 | 自动更新 | 是 | 正式部署 |
| 开发者模式 | 手动加载 | 手动刷新 | 否 | 个人/小团队 |
| CRX 直接安装 | ❌ 被浏览器拦截 | - | - | 不可行 |

## 签名说明

- CRX 文件**自带签名**（用 dist.pem 私钥签名），不需要额外的代码签名证书
- 签名的作用是**确保 Extension ID 一致**，不是验证开发者身份
- 与 Chrome Web Store 的签名不同 — Web Store 用 Google 的签名
- 企业策略分发不需要 Web Store 签名，只要 CRX 自身签名 + 策略白名单
