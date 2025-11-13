import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { CanvasProvider } from './contexts/CanvasContext';
import { UserProfileProvider } from './contexts/UserProfileContext';
import Canvas from './components/Canvas/Canvas';
import Login from './components/Auth/Login';
import { useAuth } from './contexts/AuthContext';
import './App.css';

const AppContent: React.FC = () => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <Login />;
  }

  return <Canvas />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <CanvasProvider>
        <UserProfileProvider>
          <AppContent />
        </UserProfileProvider>
      </CanvasProvider>
    </AuthProvider>
  );
};

export default App;

