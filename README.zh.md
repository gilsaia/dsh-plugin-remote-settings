# @gilsaia/dsh-plugin-remote-settings

让 DeepSeek Harness Web GUI 的**设置页与模型配置页可以在非 loopback 地址下使用**。

[English](./README.md) | 中文

---

## 问题

DSH 判断浏览器能否使用特权设置面，**只看页面来源地址**。在 `@deepseek-ai/dsh-client-connection` 中：

```js
isLoopback: transport?.ownsHost === true
         || pageLocation === void 0
         || isLoopbackHostname(pageLocation.hostname),
```

而 `isLoopbackHostname` 只接受 `localhost`、`[::1]` 和 `127/8`。像 `10.1.2.15` 这样的局域网字面量**永远不可能满足**。

随后 `@deepseek-ai/dsh-client-ui-settings` 把这一个布尔值翻译成设置镜像的持久化模式：

```js
const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";
```

`memory` 镜像处于**终态 `unavailable`**：它**连 `settings.describe` 读请求都不会发出**。所以从 `http://10.1.2.15:3080/` 打开的页面**完全不渲染设置表单和模型配置**——不是只读，而是不存在。

同一个布尔值还控制着 `@deepseek-ai/dsh-client-ui-settings-general` 里"用本地编辑器打开设置文件"的入口。

这就是为什么一个部署可以已经正确绑定 `--host`、正确配置 `trustedHosts`、局域网可达，却依然无法从另一台机器修改模型。

## 这个插件做什么

被服务的 Web 应用从不定义 `__DSH_TRANSPORT__`，只有 Electron shell 会定义它（`{ ownsHost: true }`）。`@deepseek-ai/dsh-client-connection` 在安装客户端半边时会读取这个全局变量，而 `ownsHost === true` 会短路掉主机名判断。

本 bundle 只贡献一行 index 注入：

```js
globalThis.__DSH_TRANSPORT__ = { ...globalThis.__DSH_TRANSPORT__, ownsHost: true };
```

`@deepseek-ai/dsh-host-webserver` 会把它渲染进 `<head>` 开头，作为一段经典的同步内联脚本。应用 bundle 是 `type="module"` 脚本，属于**延迟执行**，所以注入必然先跑。

赋值采用**合并**而非覆盖，因此已经配置好的 transport（Electron shell 的 `{ ownsHost: true, streamBaseUrl }`）会保留其余字段。

## 安装

本包**既是 bundle，又是它自己挂载的插件**：它的 `dsh.bundle.patch` 指向自己的 `cordis.patch.yml`，其中 insert 的那一行 `name` 指向本包自身。

在 Web GUI 的 **Plugins** 页面，或通过具备 `plugin_manager` 工具的 agent：

```
@deepseek-ai/dsh-plugin-remote-settings
```

或手动安装依赖并选中 bundle：

```sh
dsh plugin --profile web add github:gilsaia/dsh-plugin-remote-settings
```

然后把 `@gilsaia/dsh-plugin-remote-settings` 加入 profile 的 `dsh.profile.bundles` 列表，并重启 profile。

> CLI 走的是 pnpm 转发，只安装依赖、**不会选中 bundle**。Web **Plugins** 页面两者都做。

## 配置

| 键 | 类型 | 默认 | 含义 |
|---|---|---|---|
| `privilegedSurface` | `boolean` | `false` | 是否贡献该声明。只有字面量 `true` 生效。 |

随包提供的 `cordis.patch.yml` 把它设为 `true`。若希望"装了但先不生效"，可从 profile patch 覆盖：

```yaml
- id: remote-settings
  config:
    privilegedSurface: false
```

## 安全边界 —— 请务必阅读

> **`webserver/index-inject` 的监听器拿不到请求对象。** 因此该声明是**无条件**的：任何能访问该端口的页面都会被告知"你拥有 Host"。这个扩展点**无法**按来源 IP 区分。

实际含义：

- 真正的安全边界退化为**"谁能连到这个端口"**。如果这很重要，请绑定 loopback，或在操作系统防火墙层面限制可达性。
- `/api` 的 **Host/Origin 栅栏**（`connection.trustedHosts`）与**浏览器 token 认证**都**未被改动，仍然生效**。本插件不放宽其中任何一个。
- 它同时会放开"用本地编辑器打开设置文件"入口，因为那也由同一个布尔值控制。该入口会在**服务端**拉起编辑器，从远程触发通常没有意义。

**请只在信任的网络中启用。**

## 与其它访问控制的关系

一个可达的部署会执行三道相互独立的闸门。本插件只处理第三道。

| 闸门 | 所在层 | 失败症状 | 由什么处理 |
|---|---|---|---|
| Host/Origin 信任栅栏 | 服务端 | `403 forbidden` | `connection.trustedHosts` / `--trusted-host` |
| 浏览器 token 认证 | 服务端 | `401 unauthorized` | launch token，随后是签名 Cookie |
| loopback 特权面 | **浏览器** | 设置页不存在 | **本插件** |

## 兼容性

声明的 peer：

```json
"peerDependencies": {
  "@deepseek-ai/dsh-host-webserver": "^0.2.0-rc.2"
}
```

DSH 会在 profile 导入插件前，把 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 的 `peerDependencies` 与运行时版本比对。不匹配会拒绝该行，直到在 profile 的 `compatibility.json` 中记录精确版本豁免。

本插件依赖两个**不属于稳定性契约**的行为：

1. `@deepseek-ai/dsh-host-webserver` 把 `kind: 'script'` 注入行渲染进 `<head>`，且位于应用模块脚本之前。
2. `@deepseek-ai/dsh-client-connection` 读取 `globalThis.__DSH_TRANSPORT__` 并认可 `ownsHost`。

声明的范围刻意保守，以便不匹配时被**报告**而不是被静默忽略。如果 DSH 改变了上述任一行为，本插件需要更新——仅靠 peer 范围无法检测行为层面的变化。

## 卸载

从 profile 的 `dsh.profile.bundles` 移除 `@gilsaia/dsh-plugin-remote-settings`，再移除依赖，然后重启 profile。

## 许可证

MIT
