/**
 * Declare the served Web GUI page as the Host-owning privileged surface, so a
 * page loaded from a non-loopback authority still gets a usable settings and
 * model-configuration UI.
 *
 * The problem
 * -----------
 * `@deepseek-ai/dsh-client-connection` derives the browser-side
 * `ctx.connection.isLoopback` from the page authority alone:
 *
 *     isLoopback: transport?.ownsHost === true
 *              || pageLocation === void 0
 *              || isLoopbackHostname(pageLocation.hostname)
 *
 * and `isLoopbackHostname` accepts only `localhost`, `[::1]` and 127/8. A LAN
 * literal such as `10.1.2.15` can never satisfy it.
 *
 * `@deepseek-ai/dsh-client-ui-settings` turns that single boolean into the
 * settings mirror's persistence mode:
 *
 *     const persistence = ctx.remote.$host.isLoopback ? "host" : "memory"
 *
 * A `memory` mirror is terminally `unavailable`: it never even issues a
 * `settings.describe` read, so a page opened at `http://10.1.2.15:3080/`
 * renders no settings forms and no model configuration at all. The same
 * boolean also gates the "open the settings document in a local editor" entry
 * point in `@deepseek-ai/dsh-client-ui-settings-general`.
 *
 * The fix
 * -------
 * The served web app never defines `__DSH_TRANSPORT__`; only the Electron shell
 * does, with `{ ownsHost: true }`. `@deepseek-ai/dsh-client-connection` reads
 * that global when it installs its client half, and `ownsHost === true`
 * short-circuits the hostname test.
 *
 * This plugin contributes one index injection row that sets that flag.
 * `@deepseek-ai/dsh-host-webserver` renders the row into `<head>`, immediately
 * after the opening tag, as a classic inline script. The application bundle is
 * a `type="module"` script, which is deferred, so the injection always runs
 * first.
 *
 * The row is a merge rather than a blind assignment, so a transport that is
 * already configured — the Electron shell's `{ ownsHost: true, streamBaseUrl }`
 * — keeps its other keys.
 *
 * Scope and safety
 * ----------------
 * `webserver/index-inject` listeners receive no request, so the declaration is
 * unconditional: every page that can reach this listener is told it owns the
 * Host. The effective security boundary therefore stays "who can reach the
 * port". The `/api` Host fence (`connection.trustedHosts`) and browser
 * authentication are untouched and still apply.
 *
 * Enable this only on a network you trust.
 *
 * @module @gilsaia/dsh-plugin-remote-settings
 */

/** Stable Cordis plugin name used by loader diagnostics. */
export const name = 'remote-settings'

/** The webserver must be mounted before an index injection can be contributed. */
export const inject = ['webServer']

/**
 * Assign `ownsHost` onto the page's transport global, preserving any keys a
 * shell already set. Spreading `undefined` is a no-op, so this is also correct
 * on a page that never defined the global.
 */
const DECLARATION =
  'globalThis.__DSH_TRANSPORT__ = { ...globalThis.__DSH_TRANSPORT__, ownsHost: true };'

/**
 * Contribute the privileged-surface declaration to every served index page.
 *
 * @param ctx - plugin context carrying the `webServer` service.
 * @param config - plugin config; anything but `privilegedSurface: true` is a
 *   no-op, so the bundle can be installed without taking effect.
 */
export function apply(ctx, config) {
  if (config?.privilegedSurface !== true) return

  // A Cordis listener is disposed with its owning fiber, so no explicit effect
  // wrapper is needed. The injection table is collected fresh on every index
  // render and the listener is registered at activation, long before a browser
  // asks for the page, so this is order-independent.
  ctx.on('webserver/index-inject', (table) => {
    table.push({
      kind: 'script',
      placement: 'head',
      text: DECLARATION,
    })
  })
}
