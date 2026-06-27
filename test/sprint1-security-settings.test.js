const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomInt } = require('node:crypto');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function waitForServer(child, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Server startup timed out')), timeoutMs);
        let stderr = '';

        child.stdout.on('data', chunk => {
            if (chunk.toString().includes('Server running on')) {
                clearTimeout(timeout);
                resolve();
            }
        });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.once('exit', code => {
            clearTimeout(timeout);
            reject(new Error(`Server exited early with code ${code}: ${stderr}`));
        });
    });
}

async function stopServer(child) {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([
        new Promise(resolve => child.once('exit', resolve)),
        new Promise(resolve => setTimeout(resolve, 2000))
    ]);
    if (child.exitCode === null) child.kill('SIGKILL');
}

test('Sprint 1 local API boundary and settings persistence', async () => {
    const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'workplace-monitor-test-'));
    const port = randomInt(32000, 45000);
    const baseUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['server.js'], {
        cwd: REPO_ROOT,
        env: { ...process.env, HOME: testHome, NODE_ENV: 'test', PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe']
    });

    try {
        await waitForServer(child);

        const rejectedOrigin = await fetch(`${baseUrl}/status`, {
            headers: { Origin: 'https://example.invalid' }
        });
        assert.equal(rejectedOrigin.status, 403);
        assert.deepEqual(await rejectedOrigin.json(), { error: 'Origin not allowed' });

        const malformedJson = await fetch(`${baseUrl}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{bad json'
        });
        assert.equal(malformedJson.status, 400);

        const invalidSetting = await fetch(`${baseUrl}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goalMinutes: 75 })
        });
        assert.equal(invalidSetting.status, 400);

        const projectResponse = await fetch(`${baseUrl}/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Sprint 1 Test', color: '#123456' })
        });
        assert.equal(projectResponse.status, 200);
        const { id: projectId } = await projectResponse.json();

        const savedSettings = await fetch(`${baseUrl}/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                defaultProjectId: projectId,
                wellbeingEnabled: false,
                useAiDynamicBreak: false,
                breakInterval: 45,
                wfhBreakInterval: 75
            })
        });
        assert.equal(savedSettings.status, 200);

        const settingsResponse = await fetch(`${baseUrl}/settings`);
        assert.equal(settingsResponse.status, 200);
        const settings = await settingsResponse.json();
        assert.equal(settings.defaultProjectId, projectId);
        assert.equal(settings.wellbeingEnabled, false);
        assert.equal(settings.useAiDynamicBreak, false);
        assert.equal(settings.breakInterval, 45);
        assert.equal(settings.wfhBreakInterval, 75);

        const unknownRoute = await fetch(`${baseUrl}/not-a-real-route`);
        assert.equal(unknownRoute.status, 404);
        assert.deepEqual(await unknownRoute.json(), { error: 'Not found' });
    } finally {
        await stopServer(child);
        fs.rmSync(testHome, { recursive: true, force: true });
    }
});
