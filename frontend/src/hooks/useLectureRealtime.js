import { useCallback, useEffect, useRef } from "react";

function getToken() {
  const path = window.location.pathname;
  if (path.startsWith("/teacher")) {
    return localStorage.getItem("teacher_access_token") || localStorage.getItem("access_token");
  }
  if (path.startsWith("/student")) {
    return localStorage.getItem("student_access_token") || localStorage.getItem("access_token");
  }
  return localStorage.getItem("access_token");
}

function getWsUrl(lectureId) {
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  const url = new URL(base, window.location.origin);

  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `/ws/lectures/${lectureId}`;
  url.search = "";

  const token = getToken();
  if (token) url.searchParams.set("token", token);

  return url.toString();
}

function sanitizeForWebSocket(type, payload) {
  // PDF 바이너리/Uint8Array를 WebSocket으로 보내면 너무 커질 수 있음.
  // 학생은 PDF_LOADED 메타데이터를 받은 뒤 API로 PDF를 다운로드하게 한다.
  if (type === "PDF_LOADED") {
    return {
      lectureId: payload?.lectureId,
      pdfFileName: payload?.pdfFileName || null,
      pdfTotal: payload?.pdfTotal || 0,
    };
  }

  return payload || {};
}

function useLectureRealtime(channelName, lectureId, onMessage) {
  const channelRef = useRef(null);
  const socketRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  const pendingMessagesRef = useRef([]);

  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.BroadcastChannel) return undefined;

    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      onMessageRef.current?.(event.data);
    };

    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [channelName]);

  const flushPendingMessages = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const pending = pendingMessagesRef.current;
    pendingMessagesRef.current = [];

    pending.forEach((message) => {
      socket.send(JSON.stringify(message));
    });
  }, []);

  useEffect(() => {
    if (!lectureId || typeof window === "undefined" || !window.WebSocket) {
      return undefined;
    }

    let stopped = false;
    let reconnectTimer = null;

    const connect = () => {
      const socket = new WebSocket(getWsUrl(lectureId));
      socketRef.current = socket;

      socket.onopen = () => {
        flushPendingMessages();
      };

      socket.onmessage = (event) => {
        try {
          onMessageRef.current?.(JSON.parse(event.data));
        } catch (error) {
          console.error("WebSocket 메시지 파싱 실패:", error);
        }
      };

      socket.onclose = (event) => {
        if (stopped) return;

        console.warn("WebSocket 연결 종료:", event.code, event.reason);
        reconnectTimer = setTimeout(connect, 2000);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [lectureId, flushPendingMessages]);

  const emit = useCallback((type, payload) => {
    const localMessage = { type, payload };

    // 같은 브라우저 탭/창 간 동기화용
    channelRef.current?.postMessage(localMessage);

    const wsMessage = {
      type,
      payload: sanitizeForWebSocket(type, payload),
    };

    const socket = socketRef.current;

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      pendingMessagesRef.current.push(wsMessage);
      return;
    }

    socket.send(JSON.stringify(wsMessage));
  }, []);

  return emit;
}

export default useLectureRealtime;