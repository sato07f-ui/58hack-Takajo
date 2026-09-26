import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabaseClient'
import { distanceMeters } from './haversine'
import { toChannelName } from './roomCode'

/** 送信の間引き: 前回送信からこの時間未満 かつ この距離未満の移動なら送らない */
const MIN_SEND_INTERVAL_MS = 2000
const MIN_SEND_DISTANCE_M = 3

/** 位置が変わらなくてもこの間隔で再送する（相手の途中入室・静止中の途絶誤判定対策） */
const HEARTBEAT_MS = 10000

/** これ以上相手の位置が届かなければ「通信が途切れている」とみなす */
export const STALE_AFTER_MS = 30000

const INITIAL = { key: null, status: 'idle', error: null, peerLocation: null, peerOnline: false, lastSeenAt: null }

/**
 * 親子で同じルームコードのチャンネルに入り、位置を送り合う hook。
 * role: 'parent' | 'child'
 * roomCode が空のうちは接続しない。
 *
 * 返り値:
 *   status: 'idle' | 'connecting' | 'connected' | 'error'
 *   error: エラーメッセージ | null（'このコードは使用中です' など）
 *   peerLocation: 相手の { lat, lng, accuracy, ts } | null
 *   peerOnline: 相手が Presence 上にいるか
 *   lastSeenAt: 相手の位置を最後に受信した時刻（ms） | null
 *   isStale: lastSeenAt から STALE_AFTER_MS 以上経過したか
 *   sendLocation({ lat, lng, accuracy, ts }): 自分の位置を送る（間引きあり）
 *   sendEvent(event, payload): 任意のイベントを送る（Phase E の escaped / revive 用）
 *   onEvent(event, handler): 任意のイベントを受け取る。解除関数を返す
 */
export function useLocationChannel({ roomCode, role }) {
  // 接続ごとの状態を 1 つのオブジェクトで持ち、key（roomCode）が違えば無視する。
  // これにより effect 本体でのリセット（setState）が要らない
  const [conn, setConn] = useState(INITIAL)
  const [now, setNow] = useState(() => Date.now())

  const channelRef = useRef(null)
  const lastSentRef = useRef(null) // 間引き判定用 { lat, lng, ts }
  const latestRef = useRef(null) // 最後に渡された自分の位置（再送用）
  const handlersRef = useRef(new Map()) // event → Set<handler>

  const peerRole = role === 'parent' ? 'child' : 'parent'

  useEffect(() => {
    if (!roomCode) return
    const key = roomCode
    // この接続に属する更新だけを反映する
    const update = (patch) =>
      setConn((prev) => {
        const base = prev.key === key ? prev : { ...INITIAL, key, status: 'connecting' }
        return { ...base, ...(typeof patch === 'function' ? patch(base) : patch) }
      })

    const channel = supabase.channel(toChannelName(roomCode), {
      config: { presence: { key: role } },
    })
    channelRef.current = channel
    lastSentRef.current = null

    // Broadcast は保存されないので、止まっていても定期的に再送する。
    // 相手が後から入室しても位置が届き、静止中でも「通信途絶」と誤判定されない
    const resend = () => {
      const loc = latestRef.current
      if (!loc) return
      lastSentRef.current = { lat: loc.lat, lng: loc.lng, ts: Date.now() }
      channel.send({ type: 'broadcast', event: 'location', payload: { role, ...loc } })
    }
    const heartbeat = setInterval(resend, HEARTBEAT_MS)
    let peerWasOnline = false

    channel.on('broadcast', { event: 'location' }, ({ payload }) => {
      if (payload?.role !== peerRole) return
      update({
        peerLocation: { lat: payload.lat, lng: payload.lng, accuracy: payload.accuracy, ts: payload.ts },
        lastSeenAt: Date.now(),
      })
    })

    // 相手の在席と、同じ役割の重複を Presence で見る
    const joinedAt = Date.now()
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState()
      const sameRole = state[role] ?? []
      // 自分と同じ役割が 2 人以上いる = 同じコードを別の親（子）が使っている。
      // 後から入った側（joinedAt が最小でない側）だけをエラーにする
      const duplicated = sameRole.length > 1 && Math.min(...sameRole.map((m) => m.joinedAt)) < joinedAt
      const peerOnline = (state[peerRole]?.length ?? 0) > 0
      if (peerOnline && !peerWasOnline) resend() // 相手が入室した瞬間に自分の位置を届ける
      peerWasOnline = peerOnline
      update({
        peerOnline,
        ...(duplicated && {
          status: 'error',
          error: role === 'parent' ? 'このコードは使用中です。別のコードにしてください' : 'このコードは別の子供が使っています',
        }),
      })
    })

    // 任意イベント（escaped / revive など）を handlersRef に振り分ける
    channel.on('broadcast', { event: '*' }, ({ event, payload }) => {
      if (event === 'location') return
      handlersRef.current.get(event)?.forEach((h) => h(payload))
    })

    channel.subscribe(async (state, err) => {
      if (state === 'SUBSCRIBED') {
        await channel.track({ role, joinedAt })
        update((base) => (base.status === 'error' ? {} : { status: 'connected' }))
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        update({ status: 'error', error: err?.message ?? '接続に失敗しました' })
      }
    })

    return () => {
      clearInterval(heartbeat)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [roomCode, role, peerRole])

  // 通信途絶の判定用に 1 秒ごとに現在時刻を更新する
  useEffect(() => {
    if (conn.lastSeenAt === null) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [conn.lastSeenAt])

  const sendLocation = useCallback(
    (loc) => {
      const channel = channelRef.current
      if (!channel || !loc) return
      latestRef.current = loc
      const last = lastSentRef.current
      if (last && loc.ts - last.ts < MIN_SEND_INTERVAL_MS && distanceMeters(last, loc) < MIN_SEND_DISTANCE_M) {
        return
      }
      lastSentRef.current = { lat: loc.lat, lng: loc.lng, ts: loc.ts }
      channel.send({ type: 'broadcast', event: 'location', payload: { role, ...loc } })
    },
    [role],
  )

  const sendEvent = useCallback(
    (event, payload = {}) => {
      channelRef.current?.send({ type: 'broadcast', event, payload: { role, ...payload } })
    },
    [role],
  )

  const onEvent = useCallback((event, handler) => {
    const map = handlersRef.current
    if (!map.has(event)) map.set(event, new Set())
    map.get(event).add(handler)
    return () => map.get(event)?.delete(handler)
  }, [])

  // roomCode が無い・切り替わった直後は接続前の状態を返す
  const active = roomCode && conn.key === roomCode ? conn : roomCode ? { ...INITIAL, status: 'connecting' } : INITIAL
  const isStale = active.lastSeenAt !== null && now - active.lastSeenAt >= STALE_AFTER_MS

  return {
    status: active.status,
    error: active.error,
    peerLocation: active.peerLocation,
    peerOnline: active.peerOnline,
    lastSeenAt: active.lastSeenAt,
    isStale,
    sendLocation,
    sendEvent,
    onEvent,
  }
}
