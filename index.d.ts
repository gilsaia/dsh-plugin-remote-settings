/**
 * Type declarations for `@gilsaia/dsh-plugin-remote-settings`.
 *
 * Deliberately self-contained: this package imports nothing at runtime and
 * declares no dependency on the Cordis type packages, so its declarations must
 * not require them either. The shapes below are the structural subset this
 * plugin actually touches.
 *
 * @module @gilsaia/dsh-plugin-remote-settings
 */

/** Stable Cordis plugin name used by loader diagnostics. */
export declare const name: 'remote-settings'

/** The webserver must be mounted before an index injection can be contributed. */
export declare const inject: readonly string[]

/** Plugin configuration. */
export interface Config {
  /**
   * Whether to contribute the privileged-surface declaration.
   *
   * Only the literal `true` takes effect; `false`, `undefined` and any other
   * value leave served pages unmodified, so the bundle can be installed and
   * selected while staying inert.
   */
  readonly privilegedSurface?: boolean
}

/**
 * One structured row contributed to the served index document.
 *
 * `@deepseek-ai/dsh-host-webserver` renders a `script` row as a classic inline
 * `<script>` at the requested placement. `text` must not contain the literal
 * `</script`.
 */
export interface IndexInjectionRow {
  readonly kind: 'script'
  readonly placement: 'head' | 'body'
  readonly text: string
}

/** The mutable table `webserver/index-inject` listeners append to. */
export interface IndexInjectionTable {
  push(...rows: IndexInjectionRow[]): number
}

/** The structural subset of the Cordis context this plugin uses. */
export interface PluginContext {
  on(
    event: 'webserver/index-inject',
    listener: (table: IndexInjectionTable) => void,
  ): unknown
}

/**
 * Contribute the privileged-surface declaration to every served index page.
 *
 * @param ctx - plugin context carrying the `webServer` service.
 * @param config - plugin config; anything but `privilegedSurface: true` is a
 *   no-op.
 */
export declare function apply(ctx: PluginContext, config: Config): void
