# 管理员功能说明

## 访问地址
管理员页面访问地址：`http://localhost:3000/admin`

## 登录信息
- **用户名**: `admin`
- **密码**: `123456`
- **房间ID**: 需要输入要管理的房间ID

## 功能特性

### 1. 登录系统
- 管理员身份验证
- 房间ID验证
- 安全的登录界面

### 2. 统计信息
- 总消息数统计
- 活跃用户数统计
- 用户消息数量统计
- 实时数据刷新

### 3. 消息管理
- 查看所有消息列表
- 删除单条消息
- 清空所有消息
- 删除指定用户的所有消息

### 4. 用户管理
- 查看用户消息统计
- 按用户删除消息
- 用户活跃度分析

### 5. 管理操作
- 刷新统计数据
- 导出消息记录（TODO）
- 退出登录

## 使用方法

1. 访问 `http://localhost:3000/admin`
2. 输入登录信息：
   - 用户名：`admin`
   - 密码：`123456`
   - 房间ID：输入要管理的房间ID
3. 点击登录按钮
4. 进入管理员控制台

## 安全说明

- 管理员密码是硬编码的，生产环境建议修改为更安全的认证方式
- 建议添加IP白名单或其他安全措施
- 管理员操作会实时同步到所有连接的客户端

## 待开发功能

- [ ] 消息导出功能
- [ ] 用户封禁功能
- [ ] 消息审核功能
- [ ] 管理员权限分级
- [ ] 操作日志记录
- [ ] 更安全的认证机制 