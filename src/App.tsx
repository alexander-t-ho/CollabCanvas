import React from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CanvasProvider } from './contexts/CanvasContext';
import { UserProfileProvider } from './contexts/UserProfileContext';
import Login from './components/Auth/Login';
import Canvas from './components/Canvas/Canvas';

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

  return (
    <CanvasProvider>
      <UserProfileProvider>
        <Canvas />
      </UserProfileProvider>
    </CanvasProvider>
  );
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
