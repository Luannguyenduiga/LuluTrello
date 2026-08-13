import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // Connect to Socket.io backend
    const socketInstance = io(import.meta.env.VITE_API_URL || 'http://localhost:5090');
    setSocket(socketInstance);

    socketInstance.on('connect', () => {
      console.log('Socket.io connected:', socketInstance.id);
      // Join user notification room
      socketInstance.emit('join_user', { userId: user.id });
    });

    socketInstance.on('disconnect', () => {
      console.log('Socket.io disconnected');
    });

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
