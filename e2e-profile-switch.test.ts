import { test, expect, describe, beforeAll, afterAll } from 'bun:test'

const BASE = 'http://127.0.0.1:3457'
const WS_BASE = 'ws://127.0.0.1:3457'

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init)
  return res
}

async function apiJson(path: string, init?: RequestInit) {
  const res = await api(path, init)
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${path} failed: ${res.status} ${text}`)
  }
  return res.json()
}

describe('E2E: Profile Switch & H5 Isolation', () => {
  let tokenA: string | null = null
  let tokenB: string | null = null
  let ws: WebSocket | null = null
  let activeProfileName: string = 'default'

  beforeAll(async () => {
    // Wait for server to be ready
    for (let i = 0; i < 10; i++) {
      try {
        const r = await fetch(`${BASE}/health`)
        if (r.ok) break
      } catch {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  })

  afterAll(() => {
    if (ws && ws.readyState <= 1) {
      ws.close()
    }
  })

  test('health check', async () => {
    const r = await apiJson('/health')
    expect(r.status).toBe('ok')
  })

  test('list profiles', async () => {
    const r = await apiJson('/api/profiles')
    expect(typeof r.active).toBe('object')
    expect(typeof r.active.name).toBe('string')
    expect(Array.isArray(r.profiles)).toBe(true)
    activeProfileName = r.active.name
    console.log('[E2E] Active profile:', activeProfileName)
  })

  test('enable H5 access on default profile A', async () => {
    const r = await apiJson('/api/h5-access/enable', { method: 'POST' })
    expect(r.settings.enabled).toBe(true)
    expect(typeof r.token).toBe('string')
    tokenA = r.token
    console.log('[E2E] Token A:', tokenA!.slice(0, 8) + '...')
  })

  test('verify token A works', async () => {
    const r = await apiJson('/api/h5-access/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    expect(r.ok).toBe(true)
  })

  test('connect WebSocket with token A', async () => {
    ws = new WebSocket(`${WS_BASE}/ws/test-session-a?token=${tokenA}`)
    await new Promise<void>((resolve, reject) => {
      ws!.onopen = () => resolve()
      ws!.onerror = (e) => reject(new Error('WS open failed'))
      setTimeout(() => reject(new Error('WS open timeout')), 5000)
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    console.log('[E2E] WS connected with token A')
  })

  test('create profile B', async () => {
    // If profile B already exists from a previous run, delete it first
    const list = await apiJson('/api/profiles')
    const hasB = list.profiles.some((p: any) => p.name === 'b')
    if (hasB) {
      await api('/api/profiles/b', { method: 'DELETE' })
    }
    const r = await apiJson('/api/profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'b', displayName: 'Profile B', icon: 'person' }),
    })
    expect(r.profile.name).toBe('b')
    console.log('[E2E] Profile B created')
  })

  test('switch to profile B disconnects WS and invalidates token A', async () => {
    const closePromise = new Promise<void>((resolve) => {
      ws!.onclose = () => {
        console.log('[E2E] WS closed as expected on profile switch')
        resolve()
      }
    })

    const r = await apiJson('/api/profiles/switch', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'b' }),
    })
    expect(r.active).toBe('b')

    // Wait for WS close
    await closePromise
    expect(ws.readyState).toBe(WebSocket.CLOSED)

    // Token A should now be invalid (different profile)
    const verifyA = await api('/api/h5-access/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    expect(verifyA.status).toBe(401)
    console.log('[E2E] Token A invalidated after switch to B')
  })

  test('enable H5 access on profile B', async () => {
    const r = await apiJson('/api/h5-access/enable', { method: 'POST' })
    expect(r.settings.enabled).toBe(true)
    expect(typeof r.token).toBe('string')
    tokenB = r.token
    console.log('[E2E] Token B:', tokenB!.slice(0, 8) + '...')
  })

  test('connect WebSocket with token B', async () => {
    ws = new WebSocket(`${WS_BASE}/ws/test-session-b?token=${tokenB}`)
    await new Promise<void>((resolve, reject) => {
      ws!.onopen = () => resolve()
      ws!.onerror = () => reject(new Error('WS open failed'))
      setTimeout(() => reject(new Error('WS open timeout')), 5000)
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    console.log('[E2E] WS connected with token B')
  })

  test('switch back to default profile disconnects WS and invalidates token B', async () => {
    const closePromise = new Promise<void>((resolve) => {
      ws!.onclose = () => {
        console.log('[E2E] WS closed as expected on switch back')
        resolve()
      }
    })

    const r = await apiJson('/api/profiles/switch', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: activeProfileName }),
    })
    expect(r.active).toBe(activeProfileName)

    await closePromise
    expect(ws.readyState).toBe(WebSocket.CLOSED)

    // Token B should be invalid now
    const verifyB = await api('/api/h5-access/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
    })
    expect(verifyB.status).toBe(401)
    console.log('[E2E] Token B invalidated after switch back to default')
  })

  test('token A works again after switching back to default', async () => {
    const r = await apiJson('/api/h5-access/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
    })
    expect(r.ok).toBe(true)
    console.log('[E2E] Token A valid again on default profile')
  })

  test('reconnect WS with token A after switch back', async () => {
    ws = new WebSocket(`${WS_BASE}/ws/test-session-a2?token=${tokenA}`)
    await new Promise<void>((resolve, reject) => {
      ws!.onopen = () => resolve()
      ws!.onerror = () => reject(new Error('WS open failed'))
      setTimeout(() => reject(new Error('WS open timeout')), 5000)
    })
    expect(ws.readyState).toBe(WebSocket.OPEN)
    console.log('[E2E] WS reconnected with token A')
  })
})
