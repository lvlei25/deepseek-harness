/** Linux desktop entry advertises the dsh scheme and launches via a literal cold-start script. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import {
  DESKTOP_ENTRY_ID,
  DESKTOP_URL_SCHEME,
  desktopEntryDirectory,
  desktopEntryDocument,
  desktopEntryLauncher,
} from '../scripts/development-desktop-entry.ts'

const options = {
  electron: '/opt/electron/electron',
  appRoot: '/workspace/harness',
  directory: '/workspace/.desktop-build/development',
  home: '/workspace home',
  userData: '/workspace/user data',
  mainPort: 9229,
  rendererPort: 9222,
  hostPort: 9230,
  openDevtools: '0',
}

it('resolves the user applications directory with an XDG override', () => {
  expect(desktopEntryDirectory({ XDG_DATA_HOME: '/custom/data' }, '/home/test'))
    .toBe(join('/custom/data', 'applications'))
  expect(desktopEntryDirectory({}, '/home/test'))
    .toBe(join('/home/test', '.local', 'share', 'applications'))
})

it('builds a launcher that passes literal workspace paths and URL arguments to Electron', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-entry-'))
  onTestFinished(() => { rmSync(root, { recursive: true, force: true }) })
  const binary = join(root, 'electron')
  writeFileSync(binary, '#!/bin/sh\nprintf "%s\\n" "$DSH_HOME" "$DSH_DESKTOP_DEV_APP" "$DSH_DESKTOP_OPEN_DEVTOOLS" "$@"\n', { mode: 0o755 })
  const launcher = join(root, 'launcher')
  const appRoot = join(root, 'harness')
  writeFileSync(launcher, desktopEntryLauncher({ ...options, appRoot, electron: binary }), { mode: 0o755 })
  const result = execFileSync('/bin/sh', [launcher, '--test-launch-argument'], { encoding: 'utf8' })
  expect(result.trimEnd().split('\n')).toEqual([options.home, '1', '0', '--inspect=127.0.0.1:9229',
    '--remote-debugging-port=9222', `--user-data-dir=${options.userData}`, appRoot, '--test-launch-argument'])
})

it('advertises the dsh URL scheme in the generated desktop document', () => {
  const document = desktopEntryDocument('/opt/launcher.sh', options, 'identity-hash')
  expect(document).toContain('[Desktop Entry]')
  expect(document).toContain(`MimeType=x-scheme-handler/${DESKTOP_URL_SCHEME};`)
  expect(document).toContain('X-DSH-Dev-Identity=identity-hash')
  expect(document).toContain('Exec=')
  expect(DESKTOP_ENTRY_ID).toBe('dsh-harness-dev.desktop')
})
