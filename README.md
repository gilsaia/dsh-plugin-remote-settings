# @gilsaia/dsh-plugin-remote-settings

Make the DeepSeek Harness Web GUI's **settings and model-configuration pages usable
from a non-loopback address**.

English | [中文](./README.zh.md)

---

## The problem

DSH decides whether the browser may use the privileged settings surface from the
**page authority alone**. In `@deepseek-ai/dsh-client-connection`:

```js
isLoopback: transport?.ownsHost === true
         || pageLocation === void 0
         || isLoopbackHostname(pageLocation.hostname),
```

and `isLoopbackHostname` accepts only `localhost`, `[::1]` and `127/8`. A LAN
literal such as `10.1.2.15` can never satisfy it.

`@deepseek-ai/dsh-client-ui-settings` then turns that single boolean into the
settings mirror's persistence mode:

```js
const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";
```

A `memory` mirror is **terminally `unavailable`**. It never even issues a
`settings.describe` read, so a page opened at `http://10.1.2.15:3080/` renders
**no settings forms and no model configuration at all** — not a read-only view,
an absent one.

The same boolean also gates the *"open the settings document in a local editor"*
entry point in `@deepseek-ai/dsh-client-ui-settings-general`.

This is why a deployment can be reachable over the LAN — correct `--host`
binding, correct `trustedHosts` — and still refuse to let you change the model
from another machine.

## What this plugin does

The served web app never defines `__DSH_TRANSPORT__`; only the Electron shell
does, with `{ ownsHost: true }`. `@deepseek-ai/dsh-client-connection` reads that
global when it installs its client half, and `ownsHost === true` short-circuits
the hostname test.

This bundle contributes exactly one index injection row that sets that flag:

```js
globalThis.__DSH_TRANSPORT__ = { ...globalThis.__DSH_TRANSPORT__, ownsHost: true };
```

`@deepseek-ai/dsh-host-webserver` renders the row into `<head>` immediately
after the opening tag, as a classic inline script. The application bundle is a
`type="module"` script, which is **deferred**, so the injection always executes
first.

The assignment **merges** rather than replaces, so a transport that is already
configured — the Electron shell's `{ ownsHost: true, streamBaseUrl }` — keeps its
other keys.

## Install

This package is both a **bundle** and the **plugin** it mounts: its
`dsh.bundle.patch` points at its own `cordis.patch.yml`, which inserts a row
naming the package itself.

From the Web GUI's **Plugins** page, or from an agent with the `plugin_manager`
tool:

```
@deepseek-ai/dsh-plugin-remote-settings
```

Or install the dependency and select the bundle by hand:

```sh
dsh plugin --profile web add github:gilsaia/dsh-plugin-remote-settings
```

then add `@gilsaia/dsh-plugin-remote-settings` to the profile's
`dsh.profile.bundles` list, and restart the profile.

> The CLI forwards to pnpm, so it installs the dependency but does not select the
> bundle. The Web **Plugins** page does both.

## Configuration

| Key | Type | Default | Meaning |
|---|---|---|---|
| `privilegedSurface` | `boolean` | `false` | Contribute the declaration. Only the literal `true` takes effect. |

The shipped `cordis.patch.yml` sets it to `true`. Override it from a profile
patch if you want the bundle installed but inert:

```yaml
- id: remote-settings
  config:
    privilegedSurface: false
```

## Safety and scope — read this

> **`webserver/index-inject` listeners receive no request object.** The
> declaration is therefore **unconditional**: every page that can reach this
> listener is told it owns the Host. There is no per-source-IP gate available at
> this extension point.

What this means in practice:

- The effective security boundary becomes **"who can reach the port"**. Bind to
  loopback, or restrict reachability at the OS firewall level, if that matters.
- The `/api` **Host/Origin fence** (`connection.trustedHosts`) and **browser
  token authentication** are **untouched** and still apply. This plugin does not
  relax either of them.
- It also unlocks the *"open the settings document in a local editor"* entry
  point, because that is gated on the same boolean. That entry point launches an
  editor **on the server**; triggering it from a remote browser is usually
  pointless.

**Enable this only on a network you trust.**

## How it relates to the other access controls

A reachable deployment enforces three independent gates. This plugin addresses
only the third.

| Gate | Layer | Symptom when it fails | Addressed by |
|---|---|---|---|
| Host/Origin trust fence | server | `403 forbidden` | `connection.trustedHosts` / `--trusted-host` |
| Browser token authentication | server | `401 unauthorized` | the launch token, then a signed cookie |
| Loopback privileged surface | **browser** | settings page absent | **this plugin** |

## Compatibility

Declared peer:

```json
"peerDependencies": {
  "@deepseek-ai/dsh-host-webserver": "^0.2.0-rc.2"
}
```

DSH checks `peerDependencies` on `@deepseek-ai/dsh` and `@deepseek-ai/dsh-*`
against the runtime version before a profile imports a plugin. A mismatch denies
the row until an exact-version exemption is recorded in the profile's
`compatibility.json`.

This plugin relies on two behaviours that are not part of a stability contract:

1. `@deepseek-ai/dsh-host-webserver` renders `kind: 'script'` injection rows into
   `<head>` ahead of the application module script.
2. `@deepseek-ai/dsh-client-connection` reads `globalThis.__DSH_TRANSPORT__` and
   honours `ownsHost`.

The declared range is deliberately conservative so a mismatch is reported rather
than silently ignored. If DSH changes either behaviour, the plugin needs an
update — the peer range alone cannot detect a behavioural change.

## Uninstall

Remove `@gilsaia/dsh-plugin-remote-settings` from the profile's
`dsh.profile.bundles`, then remove the dependency, and restart the profile.

## License

MIT
