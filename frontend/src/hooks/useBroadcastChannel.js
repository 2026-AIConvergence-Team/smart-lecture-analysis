import { useEffect, useRef } from "react";

function useBroadcastChannel(channelName, onMessage) {
  const channelRef = useRef(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.BroadcastChannel) {
      console.warn("BroadcastChannel is not supported in this browser");
      return;
    }

    const channel = new BroadcastChannel(channelName);
    channelRef.current = channel;

    channel.onmessage = (event) => {
      onMessage?.(event.data);
    };

    return () => {
      channel.close();
    };
  }, [channelName, onMessage]);

  const emit = (type, payload) => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type, payload });
    }
  };

  return emit;
}

export default useBroadcastChannel;
