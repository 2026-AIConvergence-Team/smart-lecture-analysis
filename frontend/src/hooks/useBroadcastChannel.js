import { useEffect, useRef, useCallback } from "react";

function useBroadcastChannel(channelName, onMessage) {
  const channelRef = useRef(null);
  const onMessageRef = useRef(onMessage);

  // Keep ref current without triggering channel reconnect
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.BroadcastChannel) {
      console.warn("BroadcastChannel is not supported in this browser");
      return;
    }

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

  const emit = useCallback((type, payload) => {
    channelRef.current?.postMessage({ type, payload });
  }, []);

  return emit;
}

export default useBroadcastChannel;
