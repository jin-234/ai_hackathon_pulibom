"use client";

import { RealtimeClient, type RealtimeChannel } from "@supabase/realtime-js";
import { useEffect, useRef } from "react";

// 선생님 화면 실시간 새로고침: 풀이가 바뀌면 DB 트리거(db/init/15_realtime.sql)가 Supabase Realtime 으로 신호를 보내고,
// 신호를 받으면 load 를 부른다 (데이터는 지금처럼 우리 API 에서 받는다).
//  - 신호가 몰리면 (분석 한 건에 저장이 여러 번) 잠깐 모아서 한 번만 부른다
//  - 연결돼 있으면 느린 폴링(SLOW_MS)만 안전장치로, 설정이 없거나 연결이 끊기면 예전처럼 빠른 폴링(fastMs)
//  - 탭이 안 보일 때는 폴링을 멈추고, 다시 보이면 한 번 부른다
// topic: "class:<반 id>" | "student:<학생 id>". null 이면 신호 없이 폴링만
const SLOW_MS = 60000;
const DEBOUNCE_MS = 400;

type Config = { url: string | null; key: string | null };
let configPromise: Promise<Config> | null = null;
const getConfig = () =>
  (configPromise ??= fetch("/api/realtime")
    .then((r) => (r.ok ? (r.json() as Promise<Config>) : { url: null, key: null }))
    .catch(() => ({ url: null, key: null })));

// 한 화면에서 같은 채널을 여러 컴포넌트가 들어도 연결·구독은 하나만
let client: RealtimeClient | null = null;
type Sub = { channel: RealtimeChannel; listeners: Set<(studentId?: string) => void>; status: Set<(live: boolean) => void>; live: boolean };
const subs = new Map<string, Sub>();

function subscribe(cfg: { url: string; key: string }, topic: string, onSignal: (studentId?: string) => void, onStatus: (live: boolean) => void) {
  client ??= new RealtimeClient(`${cfg.url}/realtime/v1`, { params: { apikey: cfg.key } });
  const name = `pulibom:${topic}`;
  let sub = subs.get(name);
  if (!sub) {
    const s: Sub = { channel: client.channel(name, { config: { private: false } }), listeners: new Set(), status: new Set(), live: false };
    s.channel
      .on("broadcast", { event: "changed" }, (msg) => {
        const studentId = (msg.payload as { studentId?: string } | undefined)?.studentId;
        s.listeners.forEach((f) => f(studentId));
      })
      .subscribe((state) => {
        s.live = state === "SUBSCRIBED";
        s.status.forEach((f) => f(s.live));
      });
    subs.set(name, s);
    sub = s;
  }
  sub.listeners.add(onSignal);
  sub.status.add(onStatus);
  onStatus(sub.live);
  const current = sub;
  return () => {
    current.listeners.delete(onSignal);
    current.status.delete(onStatus);
    if (!current.listeners.size) {
      subs.delete(name);
      void client?.removeChannel(current.channel);
    }
  };
}

export function useLiveRefresh(
  topic: string | null,
  load: () => void,
  opts: { fastMs?: number; studentId?: string; enabled?: boolean } = {},
) {
  const { fastMs = 4000, studentId, enabled = true } = opts;
  // load 가 렌더마다 바뀌어도 구독을 다시 하지 않게
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    let live = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    const run = () => {
      if (alive) loadRef.current();
    };
    // 연결 상태에 맞춰 폴링 간격을 바꾼다
    const schedule = () => {
      clearInterval(timer);
      if (document.hidden) return;
      timer = setInterval(run, live ? SLOW_MS : fastMs);
    };
    const onVisible = () => {
      if (!document.hidden) run();
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    if (topic)
      void getConfig().then((cfg) => {
        if (!alive || !cfg.url || !cfg.key) return;
        unsubscribe = subscribe(
          { url: cfg.url, key: cfg.key },
          topic,
          (sid) => {
            if (studentId && sid && sid !== studentId) return; // 반 채널에서 다른 학생 신호
            clearTimeout(debounce);
            debounce = setTimeout(run, DEBOUNCE_MS);
          },
          (isLive) => {
            // 끊겼다가 다시 연결되면 그 사이 놓친 변화를 한 번 불러온다
            if (isLive && !live) run();
            live = isLive;
            schedule();
          },
        );
      });

    return () => {
      alive = false;
      clearInterval(timer);
      clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe?.();
    };
  }, [topic, fastMs, studentId, enabled]);
}
