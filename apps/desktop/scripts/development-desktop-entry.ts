/** Linux development desktop entry that loads the current workspace through Electron. */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DevelopmentAppOptions } from './development-app.ts'

/** Filename of the generated entry inside the user applications directory. */
export const DESKTOP_ENTRY_ID = 'dsh-harness-dev.desktop'

/** URL scheme advertised by the generated desktop entry. */
export const DESKTOP_URL_SCHEME = 'dsh'

function quote(value: string): string { return `'${value.replaceAll("'", "'\\''")}'` }

/** Resolve the XDG applications directory used for user-installed desktop entries. */
export function desktopEntryDirectory(environment: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const dataHome = environment.XDG_DATA_HOME
  return join(dataHome !== undefined && dataHome !== '' ? dataHome : join(home, '.local', 'share'), 'applications')
}

/**
 * Build the cold-start launcher that focuses the already-running instance for dsh:// URLs.
 * @param options - Current workspace, Electron binary, and private development locations.
 * @returns shell program with literal arguments and environment values.
 */
export function desktopEntryLauncher(options: DevelopmentAppOptions): string {
  const environment = {
    DSH_HOME: options.home,
    DSH_DESKTOP_DEV_APP: '1',
    DSH_DESKTOP_HOST_INSPECT_PORT: String(options.hostPort),
    DSH_DESKTOP_OPEN_DEVTOOLS: options.openDevtools,
    ELECTRON_ENABLE_LOGGING: '1',
  }
  const args = [
    options.electron,
    `--inspect=127.0.0.1:${String(options.mainPort)}`,
    `--remote-debugging-port=${String(options.rendererPort)}`,
    `--user-data-dir=${options.userData}`,
    options.appRoot,
  ]
  return [
    '#!/bin/sh',
    ...Object.entries(environment).map(([key, value]) => `export ${key}=${quote(value)}`),
    `cd ${quote(options.appRoot)}`,
    `exec ${args.map(quote).join(' ')} "$@"`,
    '',
  ].join('\n')
}

/**
 * Build the desktop entry body for a launcher, advertising the dsh URL scheme.
 * @param launcherPath - Absolute path to the executable launcher.
 * @param options - Workspace used to locate the application icon.
 * @param identity - Change-detection hash written as a custom key.
 * @returns desktop entry document.
 */
export function desktopEntryDocument(launcherPath: string, options: DevelopmentAppOptions, identity: string): string {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Harness Dev',
    'Comment=DeepSeek Harness development build',
    `Exec=${quote(launcherPath)} %u`,
    'TryExec=/bin/sh',
    'Terminal=false',
    'Categories=Development;',
    `Icon=${join(options.appRoot, 'resources', 'icon.png')}`,
    `MimeType=x-scheme-handler/${DESKTOP_URL_SCHEME};`,
    `X-DSH-Dev-Identity=${identity}`,
    '',
  ].join('\n')
}

/**
 * Prepare and register a disposable Linux desktop entry that advertises the dsh URL scheme.
 * @param options - Current workspace, Electron binary, and private development locations.
 * @param directory - User applications directory receiving the entry.
 * @returns absolute path to the generated .desktop entry.
 */
export function prepareDevelopmentDesktopEntry(
  options: DevelopmentAppOptions,
  directory = desktopEntryDirectory(),
): string {
  const entryPath = join(directory, DESKTOP_ENTRY_ID)
  const launcherPath = join(directory, 'dsh-harness-dev-launcher.sh')
  const launcher = desktopEntryLauncher(options)
  const identity = createHash('sha256').update(launcher).digest('hex')
  const document = desktopEntryDocument(launcherPath, options, identity)
  if (!existsSync(entryPath) || !readFileSync(entryPath, 'utf8').includes(`X-DSH-Dev-Identity=${identity}`)) {
    mkdirSync(directory, { recursive: true })
    writeFileSync(launcherPath, launcher, { mode: 0o755 })
    writeFileSync(entryPath, document, { mode: 0o600 })
    try {
      execFileSync('update-desktop-database', [directory], { stdio: 'pipe' })
    } catch (error) {
      // The MIME cache is an optimization; xdg-open also reads the entry directly.
      console.warn(`desktop entry: update-desktop-database unavailable: ${String(error)}`)
    }
    try {
      execFileSync('xdg-mime', ['default', DESKTOP_ENTRY_ID, `x-scheme-handler/${DESKTOP_URL_SCHEME}`], { stdio: 'pipe' })
    } catch (error) {
      // A missing xdg-mime leaves the association for the desktop environment to resolve on first use.
      console.warn(`desktop entry: xdg-mime default unavailable: ${String(error)}`)
    }
  }
  return entryPath
}
