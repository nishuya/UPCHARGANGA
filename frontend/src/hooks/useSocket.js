import { useEffect, useState, useCallback } from 'react';
import { getSocket } from '../sockets/socketClient';

/**
 * Socket.IO hook for accessing the global socket instance
 * Socket lifecycle is managed by AuthContext
 * This hook provides access to the connected socket and connection status
 */
export const useSocket = () => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const handleConnect = useCallback(() => {
    console.log('✅ [SOCKET HOOK] Connected');
    setIsConnected(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    console.log('⚠️  [SOCKET HOOK] Disconnected');
    setIsConnected(false);
  }, []);

  useEffect(() => {
    const currentSocket = getSocket();
    if (!currentSocket) {
      console.log('📌 [SOCKET] No socket instance available yet');
      return;
    }

    setSocket(currentSocket);
    setIsConnected(currentSocket.connected);

    // Listen for connection state changes
    currentSocket.on('connect', handleConnect);
    currentSocket.on('disconnect', handleDisconnect);

    return () => {
      currentSocket.off('connect', handleConnect);
      currentSocket.off('disconnect', handleDisconnect);
    };
  }, [handleConnect, handleDisconnect]);

  return { socket, isConnected };
};

export default useSocket;
