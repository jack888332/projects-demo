import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const cwd = process.cwd()
const baseUrl = 'http://127.0.0.1:10520'
let server

const run = (args, stdio = 'inherit') => new Promise((resolveRun, rejectRun) => {
  const processRun = spawn(process.execPath, args, { cwd, stdio, windowsHide: true })
  processRun.once('error', rejectRun)
  processRun.once('exit', (code) => {
    if (code === 0) resolveRun()
    else rejectRun(new Error(`Command failed with exit code ${code ?? 1}`))
  })
})

const isReady = async () => {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(1_000) })
    return response.ok
  } catch {
    return false
  }
}

const waitUntilReady = async () => {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await isReady()) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error(`Vite did not become ready at ${baseUrl}`)
}

const stopServer = async () => {
  if (!server || server.killed) return
  server.kill()
  await Promise.race([
    new Promise((resolveClose) => server.once('close', resolveClose)),
    new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000)),
  ])
}

try {
  if (!(await isReady())) {
    await run([
      resolve(cwd, 'node_modules/vite/bin/vite.js'),
      'build', '--outDir', '.tmp-e2e', '--emptyOutDir',
    ])
    server = spawn(process.execPath, [
      resolve(cwd, 'node_modules/vite/bin/vite.js'),
      'preview', '--host', '127.0.0.1', '--port', '10520', '--strictPort', '--outDir', '.tmp-e2e',
    ], { cwd, stdio: 'ignore', windowsHide: true })
    await waitUntilReady()
  }

  const testProcess = spawn(process.execPath, [
    resolve(cwd, 'node_modules/@playwright/test/cli.js'),
    'test',
    ...process.argv.slice(2),
  ], { cwd, stdio: 'inherit', windowsHide: true })

  const exitCode = await new Promise((resolveExit) => {
    testProcess.once('exit', (code) => resolveExit(code ?? 1))
  })
  process.exitCode = exitCode
} finally {
  await stopServer()
}
